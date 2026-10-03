// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { safeAgentSessionState, restoreAgentSessionState, boundAgentSessionInput } from '../../entry/src/main/ets/model/agent/AgentSessionState.ts';
import { buildResponsesPayload } from '../../entry/src/main/ets/model/agent/ProviderProtocol.ts';
import { ResponsesEventNormalizer } from '../../entry/src/main/ets/model/agent/ResponsesEventNormalizer.ts';

const item = (kind, content = '', extra = {}) => ({ kind, role: '', content, callId: '', name: '', argumentsJson: '', output: '', ...extra });
const state = input => ({ input, readableIds: [[1], [2], [3], [4]],
  retrieval: { snapshots: [], readNoteIds: [], approvedNoteIds: [] }, action: null, waitingCallId: '', paused: false });
const body = input => JSON.parse(buildResponsesPayload({ apiKey: 'test-credential', baseUrl: 'https://example.test', model: 'test',
  instructions: '', input, functionTools: [], searchMode: 'off', requiresWebSearch: false,
  requiresSearchEvidence: false, requiresDraft: false, expectedDraftCount: 0, reasoningEffort: 'low', maxOutputTokens: 32768 }));
const accept = (normalizer, raw) => normalizer.accept({ event: raw.type, data: JSON.stringify(raw), done: false });

test('long original reasoning survives save, JSON storage, restore and wire encoding without truncation or rewriting', () => {
  const original = { type: 'reasoning', id: 'reason-1', status: 'completed',
    content: [{ type: 'reasoning_text', text: '原始思考😀'.repeat(20000) }],
    summary: [], encrypted_content: 'opaque-signed-payload', provider_metadata: { signature: 'unchanged' } };
  const input = [item('message', 'task', { role: 'user' }), item('output_item', JSON.stringify(original)),
    item('function_call', '', { callId: 'read-1', name: 'list_decks', argumentsJson: '{}' }),
    item('function_call_output', '', { callId: 'read-1', output: '{"deckIds":[1]}' }),
    item('message', 'answer', { role: 'assistant' })];
  const saved = safeAgentSessionState(state(input));
  assert.equal(saved.reasoningReplayVersion, 1);
  const restored = restoreAgentSessionState(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(body(restored.input).input[1], original);
  assert.equal(restored.input[1].content, input[1].content);
  assert.ok(!JSON.stringify(saved).includes('test-credential'));
  restored.input[1].content = 'changed'; assert.equal(saved.input[1].content, input[1].content);
});

test('oversized reasoning persists whole while the existing wire context limit rejects it without partial replay', () => {
  const text = '思考'.repeat(150000);
  const restored = restoreAgentSessionState(JSON.parse(JSON.stringify(safeAgentSessionState(state([item('reasoning', text)])))));
  assert.equal(restored.input[0].content, text);
  assert.throws(() => body(restored.input), /agent_context_limit/);
});

test('encrypted and summary-only reasoning from other Responses models replays unchanged', () => {
  const original = { type: 'reasoning', id: 'encrypted-1', summary: [{ type: 'summary_text', text: 'visible summary' }],
    encrypted_content: 'private-provider-envelope' };
  const restored = restoreAgentSessionState(safeAgentSessionState(state([item('output_item', JSON.stringify(original))])));
  assert.deepEqual(body(restored.input).input[0], original);
  assert.ok(!Object.hasOwn(body(restored.input).input[0], 'content'));
});

test('legacy missing-reasoning checkpoints retain historical facts and pending state without forged protocol', () => {
  const old = state([item('message', 'delete request', { role: 'user' }),
    item('function_call', '', { callId: 'old-call', name: 'propose_delete_deck', argumentsJson: '{"deckIds":[1]}' }),
    item('function_call_output', '', { callId: 'old-call', output: '{"status":"pending","draftId":"old-draft"}' }),
    item('message', 'waiting for confirmation', { role: 'assistant' })]);
  old.waitingCallId = 'old-call'; old.paused = true; old.expectedDraftCount = 5;
  old.action = { id: 'action-1', status: 'pending', payloadJson: '{"deckId":1}' };
  const restored = restoreAgentSessionState(old);
  const wire = body(restored.input).input;
  assert.ok(wire.every(value => value.role === 'user'));
  assert.match(wire[0].content, /old-draft/); assert.match(wire[0].content, /waiting for confirmation/);
  assert.match(wire[0].content, /not new tool calls or authorization/);
  assert.equal(restored.waitingCallId, 'old-call'); assert.equal(restored.paused, true);
  assert.equal(restored.expectedDraftCount, 5); assert.deepEqual(restored.readableIds, old.readableIds);
  assert.deepEqual(restored.action, old.action); assert.deepEqual(restored.retrieval, old.retrieval);
  assert.deepEqual(restoreAgentSessionState(JSON.parse(JSON.stringify(restored))).input, restored.input);
});

test('context bounds remove whole old turns including reasoning and retain reasoning with its tool pair', () => {
  const latest = [item('message', 'latest', { role: 'user' }), item('reasoning', 'latest thinking'),
    item('function_call', '', { callId: 'new-call', name: 'read', argumentsJson: '{}' }),
    item('function_call_output', '', { callId: 'new-call', output: 'data' })];
  const bounded = boundAgentSessionInput([item('message', 'old', { role: 'user' }), item('reasoning', 'old'.repeat(1000)),
    item('message', 'old answer', { role: 'assistant' }), ...latest], 100);
  assert.deepEqual(bounded.slice(1), latest);
  assert.ok(!bounded.some(value => value.role === 'assistant'));
});

test('terminal reasoning is recovered, identical output is deduplicated and reset allows a new turn', () => {
  const n = new ResponsesEventNormalizer();
  const original = { type: 'reasoning', id: 'r1', content: [{ type: 'reasoning_text', text: 'full reasoning' }] };
  const events = accept(n, { type: 'response.completed', response: { output: [original] } });
  assert.deepEqual(JSON.parse(events[0].text), original); assert.equal(events.at(-1).kind, 'completed');
  assert.equal(accept(n, { type: 'response.output_item.done', item: original }).length, 0);
  n.reset(); assert.equal(accept(n, { type: 'response.output_item.done', item: original }).length, 1);
  assert.equal(accept(n, { type: 'response.completed', response: { output: [original] } }).length, 1);
});

test('terminal output can complete an earlier empty reasoning item before token-limit continuation', () => {
  const n = new ResponsesEventNormalizer();
  accept(n, { type: 'response.output_item.done', item: { type: 'reasoning', id: 'r1', content: [] } });
  const original = { type: 'reasoning', id: 'r1', content: [{ type: 'reasoning_text', text: 'complete before cutoff' }] };
  const events = accept(n, { type: 'response.incomplete', response: {
    output: [original], incomplete_details: { reason: 'max_output_tokens' } } });
  assert.deepEqual(JSON.parse(events[0].text), original);
  assert.equal(events.at(-1).text, 'provider_response_incomplete_max_output_tokens');
});

test('unknown opaque output remains invalid both for persistence and provider input', () => {
  const input = [item('output_item', '{"type":"computer_call"}')];
  assert.throws(() => safeAgentSessionState(state(input)), /invalid_provider_input/);
  assert.throws(() => body(input), /invalid_provider_input/);
});

test('v1 rejected-batch migration preserves original reasoning, call IDs, diagnostics and surrounding turns', () => {
  const reasoning = item('output_item', JSON.stringify({ type: 'reasoning', id: 'original',
    content: [{ type: 'reasoning_text', text: '原始完整思考' }], provider_metadata: { signature: 'unchanged' } }));
  const call = id => item('function_call', '', { callId: id, name: 'read', argumentsJson: '{"original":true}' });
  const output = id => item('function_call_output', '', { callId: id,
    output: '{"tool_error":"clarification_must_be_only_tool","correction":"call alone"}' });
  const a = call('a'), b = call('b'), oa = output('a'), ob = output('b');
  const input = [item('message', 'task', { role: 'user' }), reasoning, a, oa, b, ob,
    item('message', 'next task', { role: 'user' })];
  const original = JSON.stringify(input);
  const restored = restoreAgentSessionState({ ...state(input), reasoningReplayVersion: 1 });
  assert.deepEqual(restored.input, [input[0], reasoning, a, b, oa, ob, input.at(-1)]);
  assert.equal(JSON.stringify(input), original);
  assert.deepEqual(restoreAgentSessionState(JSON.parse(JSON.stringify(restored))).input, restored.input);
});

test('v1 migration does not reorder successful, unpaired or malformed results or cross reasoning/message boundaries', () => {
  const call = id => item('function_call', '', { callId: id, name: 'read', argumentsJson: '{}' });
  const output = (id, json = '{"tool_error":"clarification_must_be_only_tool"}') =>
    item('function_call_output', '', { callId: id, output: json });
  const cases = [
    [call('a'), output('a', '{"status":"completed"}'), call('b'), output('b')],
    [call('a'), output('a'), call('b'), output('missing')],
    [call('a'), output('a'), call('a'), output('a')],
    [call('a'), output('a'), call('b')],
    [call('a'), output('a'), call('b'), output('b', '{broken')],
    [call('a'), output('a'), call('b'), output('b', 'null')],
    [call('a'), output('a'), item('reasoning', 'next round'), call('b'), output('b')],
    [call('a'), output('a'), item('message', 'next turn', { role: 'user' }), call('b'), output('b')]
  ];
  for (const input of cases) {
    assert.deepEqual(restoreAgentSessionState({ ...state(input), reasoningReplayVersion: 1 }).input, input);
  }
});
