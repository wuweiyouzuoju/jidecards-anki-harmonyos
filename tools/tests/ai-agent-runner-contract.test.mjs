// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { register } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { encodeCardIds } from '../../entry/src/main/ets/proto/messages/CardsMessages.ts';
import {
  decodeCardIds,
  decodeNotetypeId,
  encodeNoteIds,
} from '../../entry/src/main/ets/proto/messages/NoteMessages.ts';
import { encodeNotetypeId } from '../../entry/src/main/ets/proto/messages/NotetypeMessages.ts';
import { 后端错误 } from '../../entry/src/main/ets/backend/错误类型.ts';
import { AgentToolSchemaError } from '../../entry/src/main/ets/model/agent/AgentToolSchemas.ts';
import { agentFunctionTools } from '../../entry/src/main/ets/model/agent/AgentToolCatalog.ts';
import { explicitWebSearchRequested, explicitSourceEvidenceRequested } from '../../entry/src/main/ets/model/agent/AgentPolicy.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const transportStub = `export class AgentStreamObserver {} export class AgentTransportError extends Error {} export class AgentTransportSession {}`;
const transportStubUrl = 'data:text/javascript;base64,' + Buffer.from(transportStub).toString('base64');
const adapterStub = `export class DeepSeekAdapter {} export class OpenAIAdapter {} export class CustomAdapter {}`;
const adapterStubUrl = 'data:text/javascript;base64,' + Buffer.from(adapterStub).toString('base64');
const registryStub = `export class AgentToolRegistry {} export class AgentToolResult {}`;
const registryStubUrl = 'data:text/javascript;base64,' + Buffer.from(registryStub).toString('base64');
const diagnosticsStub = `
export class AgentToolFailureRecord {}
export class AgentToolFailureTracker { record() { return { count: 1, requireCorrection: false, shouldAbort: false }; } }
export const createStartedAgentToolTrace = (call, providerCalls, sequence) => ({ callId: call.id, providerCalls, sequence, status: 'started' });
export const completeAgentToolTrace = (trace, outputJson) => ({ ...trace, status: 'completed', outputJson });
export const failAgentToolTrace = (trace, diagnostic) => ({ ...trace, status: 'failed', diagnostic });
export const sanitizeAgentToolJson = (text) => ({ text });
`;
const diagnosticsStubUrl = 'data:text/javascript;base64,' + Buffer.from(diagnosticsStub).toString('base64');
const loaderCode = `export function resolve(specifier, context, nextResolve) {
  if (specifier === './AgentTransport') return { url: ${JSON.stringify(transportStubUrl)}, shortCircuit: true };
  if (specifier === './DeepSeekAdapter' || specifier === './OpenAIAdapter' || specifier === './CustomAdapter') {
    return { url: ${JSON.stringify(adapterStubUrl)}, shortCircuit: true };
  }
  if (specifier === './AgentToolRegistry') return { url: ${JSON.stringify(registryStubUrl)}, shortCircuit: true };
  if (specifier === '../../model/agent/AgentToolDiagnostics') {
    return { url: ${JSON.stringify(diagnosticsStubUrl)}, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}`;
register('data:text/javascript;base64,' + Buffer.from(loaderCode).toString('base64'), import.meta.url);
const { AgentRunner } = await import('../../entry/src/main/ets/backend/agent/AgentRunner.ets');

function providerRequest(overrides = {}) {
  return {
    apiKey: 'test-key', baseUrl: 'https://example.test/v1', model: 'test-model', instructions: '',
    input: [], functionTools: [], searchMode: 'off', requiresWebSearch: false,
    requiresSearchEvidence: false,
    requiresDraft: false, expectedDraftCount: 0, reasoningEffort: '', maxOutputTokens: 1024,
    ...overrides,
  };
}

function functionTool(name) {
  return {
    name, description: '', parametersJson: '{}', exampleArgumentsJson: '{}', rules: '',
  };
}

function toolCall(id, name, argumentsJson = '{}') {
  return { id, name, argumentsJson };
}

function toolCallEvent(call) {
  return { kind: 'tool_call', text: '', toolCall: call, toolTrace: null, source: null, errorCode: '' };
}

function runnerHarness(rounds, results) {
  const registry = {
    calls: [],
    isDraftTool(name) { return name === 'create_flashcards' || name.startsWith('propose_update_'); },
    cancelActive() {},
    async execute(call) {
      this.calls.push(call);
      const result = results.shift();
      if (result instanceof Error) { throw result; }
      return result;
    },
  };
  const runner = new AgentRunner(registry);
  const requests = [];
  let roundIndex = 0;
  runner.createSession = (_provider, request, observer) => ({
    async start() {
      requests.push(request);
      const events = rounds[roundIndex] ?? [];
      roundIndex += 1;
      for (const event of events) {
        observer.onEvent(event);
      }
    },
    cancel() {},
  });
  return { runner, registry, requests };
}

function clarificationResult() {
  return {
    outputJson: JSON.stringify({ status: 'awaiting_user', clarificationId: 'scope-1' }),
    draft: null,
    clarification: {
      id: 'scope-1', question: 'Choose the card scope.',
      options: [{ id: 'one', label: 'One', description: '' }, { id: 'two', label: 'Two', description: '' }],
      recommendedOptionId: 'one', allowFreeText: true,
    },
  };
}

test('custom models use device web tools with provider search off and show real sources', async () => {
  for (const name of ['web_search', 'read_webpage']) {
    const output = name === 'web_search' ? { status: 'completed', query: 'facts',
      results: [{ url: 'https://example.com/fact', title: 'Fact', description: 'Data' }] } :
      { status: 'completed', url: 'https://example.com/fact', title: 'Fact', text: 'Data', nextOffset: -1, totalLength: 4 };
    const events = [];
    const { runner, requests } = runnerHarness([[toolCallEvent(toolCall('device-read', name))], []],
      [{ outputJson: JSON.stringify(output), draft: null, clarification: null }]);
    const result = await runner.run('custom', providerRequest({ functionTools: [functionTool(name)],
      requiresWebSearch: true, requiresSearchEvidence: true }), { onEvent(event) { events.push(event); } });
    assert.equal(result.status, 'completed');
    assert.ok(requests.every(request => request.searchMode === 'off'));
    assert.deepEqual(events.filter(e => e.kind === 'search_source').map(e => e.source),
      [{ url: 'https://example.com/fact', title: 'Fact' }]);
    assert.ok(requests.at(-1).input.some(item => item.kind === 'function_call_output' && item.output.includes('https://example.com/fact')));
  }
});
test('a failed device request and prose links cannot satisfy explicit web requirements', async () => {
  const events = [];
  const { runner } = runnerHarness([[toolCallEvent(toolCall('fail-read', 'read_webpage'))],
    [{ kind: 'text_delta', text: 'https://example.com/fact', toolCall: null, toolTrace: null, source: null, errorCode: '' }]],
    [new Error('web_request_failed')]);
  await assert.rejects(() => runner.run('custom', providerRequest({ functionTools: [functionTool('read_webpage')],
    requiresWebSearch: true, requiresSearchEvidence: true }), { onEvent(event) { events.push(event); } }), /web_search_not_executed/);
  assert.ok(events.some(event => event.kind === 'tool_failed'));
  assert.ok(!events.some(event => event.kind === 'search_source'));
});

test('offline HTML card request reaches the provider and preserves generated HTML/JS output', async () => {
  const intent='我是让你通过编写 HTML 代码来制作类网页交互闪卡';
  const html='<button onclick="document.getElementById(\'answer\').hidden=false">显示答案</button><div id="answer" hidden>钠</div>';
  const delta={kind:'text_delta',text:html,toolCall:null,toolTrace:null,source:null,errorCode:''};
  const {runner,requests}=runnerHarness([[delta]],[]);
  const events=[];
  const result=await runner.run('deepseek',providerRequest({
    input:[{kind:'message',role:'user',content:intent,callId:'',name:'',argumentsJson:'',output:''}],
    searchMode:'off', requiresWebSearch:explicitWebSearchRequested(intent),
    requiresSearchEvidence:explicitSourceEvidenceRequested(intent)
  }),{onEvent:event=>events.push(event)});
  assert.equal(requests.length,1);assert.equal(result.status,'completed');
  assert.equal(requests[0].searchMode,'off');
  assert.equal(events.filter(event=>event.kind==='text_delta').map(event=>event.text).join(''),html);
});

test('note helper codecs cover CardsOfNote and GetSingleNotetypeOfNotes wire shapes', () => {
  assert.deepEqual(decodeCardIds(encodeCardIds([11, 12, 900719])), [11, 12, 900719]);
  assert.deepEqual(Array.from(encodeNoteIds([31, 32])), [10, 2, 31, 32]);
  assert.equal(decodeNotetypeId(encodeNotetypeId(77)), 77);
});

test('note service exposes method 12 and 13 as read-only wrappers', () => {
  const index = read('entry/src/main/ets/backend/服务索引.ts');
  const service = read('entry/src/main/ets/backend/笔记服务.ts');
  assert.match(index, /某笔记的卡片:\s*12/);
  assert.match(index, /笔记的唯一笔记类型:\s*13/);
  assert.match(service, /async 获取笔记的卡片\(/);
  assert.match(service, /async 获取笔记的唯一笔记类型\(/);
  assert.match(service, /decodeCardIds/);
  assert.match(service, /encodeNoteIds/);
});

test('runner is bounded, deduplicates tool ids and never executes write tools directly', () => {
  const runner = read('entry/src/main/ets/backend/agent/AgentRunner.ets');
  const registry = read('entry/src/main/ets/backend/agent/AgentToolRegistry.ets');
  assert.match(runner, /maxProviderCalls/);
  assert.match(runner, /maxToolCalls/);
  assert.match(runner, /registerToolCallId/);
  assert.match(registry, /toolRiskOf/);
  assert.match(registry, /ChangeDraft/);
  assert.doesNotMatch(registry, /remove_notes|remove_cards|arbitrary_rpc|runDBCommand/);
});

test('a rejected tool call is returned to the model as a tool failure so it can self-correct', () => {
  const runner = read('entry/src/main/ets/backend/agent/AgentRunner.ets');
  assert.match(runner, /catch \(error\)/);
  assert.match(runner, /toolStatusEvent\('tool_failed'/);
  assert.match(runner, /tool_error/);
  assert.match(runner, /kind:\s*'function_call_output'/);
  assert.match(runner, /AgentToolSchemaError/);
  assert.match(runner, /validTemplateJson/);
  assert.match(runner, /errorPath/);
});

test('runner emits complete per-call traces and stops a third identical failure early', () => {
  const runner = read('entry/src/main/ets/backend/agent/AgentRunner.ets');
  assert.match(runner, /createStartedAgentToolTrace/);
  assert.match(runner, /completeAgentToolTrace/);
  assert.match(runner, /failAgentToolTrace/);
  assert.match(runner, /providerCalls/);
  assert.match(runner, /sequence/);
  assert.match(runner, /requireCorrection/);
  assert.match(runner, /shouldAbort/);
  assert.match(runner, /agent_repeated_tool_failure/);
  assert.match(runner, /Standard arguments template|validTemplateJson/);
});

test('parallel DeepSeek tool calls are replayed before any tool output', () => {
  const runner = read('entry/src/main/ets/backend/agent/AgentRunner.ets');
  assert.match(runner,
    /const acceptedToolCalls:[\s\S]*for \(const call of collector\.toolCalls\)[\s\S]*kind:\s*'function_call'[\s\S]*for \(const call of acceptedToolCalls\)[\s\S]*kind:\s*'function_call_output'/);
});

test('runner enforces explicit-search evidence and disables unavailable optional web search', () => {
  const source = read('entry/src/main/ets/backend/agent/AgentRunner.ets');
  assert.match(source, /enforceSearchExecution\(searchRequired, searchExecuted\)/);
  assert.match(source, /enforceSearchEvidence\(\s*request\.requiresSearchEvidence/);
  assert.match(source, /web_search_disabled/);
  assert.match(source, /web_search_provider_unsupported/);
  assert.match(source, /allSearchSources/);
  assert.match(source, /request\.searchMode\s*=\s*'off'/);
  assert.match(source, /const searchRequired:\s*boolean\s*=\s*request\.requiresWebSearch\s*\|\|\s*request\.requiresSearchEvidence/,
    'the Always preference must not become a mandatory completion condition');
  assert.match(source, /name:\s*'web_search'/,
    'a confirmed built-in web search must become a visible auditable tool trace');
});

test('runner replays provider continuation items and retries only before meaningful output', () => {
  const source = read('entry/src/main/ets/backend/agent/AgentRunner.ets');
  assert.match(source, /collector\.continuationItems/);
  assert.match(source, /kind:\s*'output_item'/);
  assert.match(source, /receivedOutput/);
  assert.match(source, /shouldRetryTransport/);
  assert.match(source, /transientRetries\s*<\s*2/);
  assert.match(source, /hasProviderReasoningText/);
  assert.match(source, /readProviderContinuation/);
  assert.match(source, /incompleteMaxOutput/);
  assert.match(source, /Continue from the truncated response/);
});

test('create mode terminates instead of automatically forcing a proposal tool', () => {
  const source = read('entry/src/main/ets/backend/agent/AgentRunner.ets');
  assert.match(source, /request\.requiresDraft\s*&&\s*drafts\.length\s*===\s*0/);
  assert.match(source, /agent_no_valid_draft/);
  assert.doesNotMatch(source, /Call the appropriate propose_ tool now/);
  assert.doesNotMatch(source, /draft_correction/);
  assert.match(source, /createDraftNoteCount/);
  assert.match(source, /createdCount\s*!==\s*request\.expectedDraftCount/);
});

test('runner rejects tools that were not declared for the current provider turn', () => {
  const source = read('entry/src/main/ets/backend/agent/AgentRunner.ets');
  assert.match(source, /isToolDeclared/);
  assert.match(source, /tool_not_declared/);
});

test('runner returns completed status with no clarification after ordinary work', () => {
  const source = read('entry/src/main/ets/backend/agent/AgentRunner.ets');
  assert.match(source, /status:\s*'completed'/);
  assert.match(source, /clarification:\s*null/);
});

test('sole clarification pauses before create-mode no-draft termination with completed trace and output', async () => {
  const call = toolCall('clarify-1', 'request_clarification', '{"clarificationId":"scope-1"}');
  const { runner, registry, requests } = runnerHarness([[toolCallEvent(call)]], [clarificationResult()]);
  const events = [];

  const result = await runner.run('deepseek', providerRequest({
    requiresDraft: true, functionTools: [functionTool('request_clarification')],
  }), {
    onEvent(event) { events.push(event); },
  });

  assert.equal(result.status, 'awaiting_clarification');
  assert.equal(result.clarification.id, 'scope-1');
  assert.deepEqual(result.drafts, []);
  assert.equal(result.providerCalls, 1);
  assert.equal(registry.calls.length, 1);
  assert.deepEqual(events.map((event) => event.kind), ['tool_call', 'tool_started', 'tool_completed']);
  assert.deepEqual(requests[0].input.map((item) => item.kind), ['function_call', 'function_call_output']);
});

test('create mode rejects an ordinary no-tool completion after exactly one provider call', async () => {
  const { runner, requests } = runnerHarness([[], []], []);
  await assert.rejects(
    () => runner.run('deepseek', providerRequest({ requiresDraft: true }), { onEvent() {} }),
    (error) => error instanceof Error && error.message === 'agent_no_valid_draft',
  );
  assert.equal(requests.length, 1);
});

test('a successful create tool ends the turn without asking the model to submit or summarize again', async () => {
  const call = toolCall('create-1', 'create_flashcards', '{"cards":[{"fields":["Q","A"]}]}');
  const draft = {
    id: 'local-create-1', risk: 'write', summary: '生成 1 张闪卡', baselineHash: '',
    confirmationLevel: 1, status: 'pending', affectedNoteIds: [], affectedCardIds: [],
    affectedDeckIds: [1], affectedNotetypeIds: [2],
    operations: [
      { kind: 'create_note', noteId: -1, cardId: 0, deckId: 1, fieldOrd: 0, before: '', after: 'Q' },
      { kind: 'create_note', noteId: -1, cardId: 0, deckId: 1, fieldOrd: 1, before: '', after: 'A' },
    ],
  };
  const { runner, requests } = runnerHarness(
    [[toolCallEvent(call)], []],
    [{ outputJson: '{"draft":"local-create-1"}', draft, clarification: null }],
  );
  const result = await runner.run('deepseek', providerRequest({
    requiresDraft: true, expectedDraftCount: 1,
    functionTools: [functionTool('create_flashcards')],
  }), { onEvent() {} });
  assert.equal(result.drafts.length, 1);
  assert.equal(result.providerCalls, 1);
  assert.equal(requests.length, 1);
});

test('an optional provider search status cannot discard a successful local draft', async () => {
  const searchStatus = { kind: 'status', text: 'web_search_started', toolCall: null,
    toolTrace: null, source: null, errorCode: '' };
  const call = toolCall('create-optional-search', 'create_flashcards',
    '{"cards":[{"fields":["Q","A"]}]}');
  const draft = {
    id: 'local-create-search', risk: 'write', summary: '生成 1 张闪卡', baselineHash: '',
    confirmationLevel: 1, status: 'pending', affectedNoteIds: [], affectedCardIds: [],
    affectedDeckIds: [1], affectedNotetypeIds: [2],
    operations: [{ kind: 'create_note', noteId: -1, cardId: 0, deckId: 1,
      fieldOrd: 0, before: '', after: 'Q' }],
  };
  const { runner, requests } = runnerHarness(
    [[searchStatus, toolCallEvent(call)]],
    [{ outputJson: '{}', draft, clarification: null }],
  );
  const events = [];
  const result = await runner.run('deepseek', providerRequest({
    searchMode: 'auto', requiresDraft: true, expectedDraftCount: 1, requiresWebSearch: false,
    requiresSearchEvidence: false,
    functionTools: [functionTool('create_flashcards')],
  }), { onEvent(event) { events.push(event); } });
  assert.equal(result.drafts[0].id, 'local-create-search');
  assert.equal(requests[0].searchMode, 'off',
    'Auto must not expose web search for an ordinary local turn');
  assert.equal(events.some((event) => event.kind === 'tool_completed' &&
    event.toolCall?.name === 'web_search'), true,
  'a real provider search event must be visible as an auditable tool trace');
});

test('Always search is best-effort unless this turn explicitly requested web access', async () => {
  const { runner, requests } = runnerHarness([[]], []);
  const result = await runner.run('deepseek', providerRequest({
    searchMode: 'always', requiresWebSearch: false, requiresSearchEvidence: false,
  }), { onEvent() {} });
  assert.equal(result.status, 'completed');
  assert.equal(requests[0].searchMode, 'always');
});

test('explicit web search accepts verified execution without requiring source URLs', async () => {
  const searchStatus = { kind: 'status', text: 'web_search_completed', toolCall: null,
    toolTrace: null, source: null, errorCode: '' };
  const call = toolCall('create-searched', 'create_flashcards',
    '{"cards":[{"fields":["Q","A"]}]}');
  const draft = {
    id: 'searched-draft', risk: 'write', summary: '生成 1 张闪卡', baselineHash: '',
    confirmationLevel: 1, status: 'pending', affectedNoteIds: [], affectedCardIds: [],
    affectedDeckIds: [1], affectedNotetypeIds: [2],
    operations: [{ kind: 'create_note', noteId: -1, cardId: 0, deckId: 1,
      fieldOrd: 0, before: '', after: 'Q' }],
  };
  const { runner } = runnerHarness([[searchStatus, toolCallEvent(call)]],
    [{ outputJson: '{}', draft, clarification: null }]);
  const result = await runner.run('deepseek', providerRequest({
    searchMode: 'auto', requiresWebSearch: true, requiresDraft: true, expectedDraftCount: 1,
    functionTools: [functionTool('create_flashcards')],
  }), { onEvent() {} });
  assert.equal(result.drafts[0].id, 'searched-draft');
});

test('search evidence is accumulated across local tool rounds', async () => {
  const searchStatus = { kind: 'status', text: 'web_search_completed', toolCall: null,
    toolTrace: null, source: null, errorCode: '' };
  const sourceEvent = { kind: 'search_source', text: '', toolCall: null, toolTrace: null,
    source: { url: 'https://example.com/source', title: 'Source' }, errorCode: '' };
  const readCall = toolCall('read-after-search', 'list_decks', '{"query":"","limit":20}');
  const createCall = toolCall('create-after-search', 'create_flashcards',
    '{"cards":[{"fields":["Q","A"]}]}');
  const draft = {
    id: 'cross-round-draft', risk: 'write', summary: '生成 1 张闪卡', baselineHash: '',
    confirmationLevel: 1, status: 'pending', affectedNoteIds: [], affectedCardIds: [],
    affectedDeckIds: [1], affectedNotetypeIds: [2],
    operations: [{ kind: 'create_note', noteId: -1, cardId: 0, deckId: 1,
      fieldOrd: 0, before: '', after: 'Q' }],
  };
  const { runner } = runnerHarness(
    [[searchStatus, sourceEvent, toolCallEvent(readCall)], [toolCallEvent(createCall)]],
    [{ outputJson: '{"decks":[]}', draft: null, clarification: null },
      { outputJson: '{}', draft, clarification: null }],
  );
  const result = await runner.run('deepseek', providerRequest({
    searchMode: 'auto', requiresWebSearch: true, requiresSearchEvidence: true,
    requiresDraft: true, expectedDraftCount: 1,
    functionTools: [functionTool('list_decks'), functionTool('create_flashcards')],
  }), { onEvent() {} });
  assert.equal(result.drafts[0].id, 'cross-round-draft');
  assert.equal(result.providerCalls, 2);
});

test('a search-only provider phase hands off to a local draft phase once', async () => {
  const searchStatus = { kind: 'status', text: 'web_search_completed', toolCall: null,
    toolTrace: null, source: null, errorCode: '' };
  const continuation = { kind: 'continuation_item',
    text: JSON.stringify({ type: 'web_search_call', id: 'ws-1', status: 'completed' }),
    toolCall: null, toolTrace: null, source: null, errorCode: '' };
  const createCall = toolCall('create-after-handoff', 'create_flashcards',
    '{"cards":[{"fields":["Q","A"]}]}');
  const draft = {
    id: 'handoff-draft', risk: 'write', summary: '生成 1 张闪卡', baselineHash: '',
    confirmationLevel: 1, status: 'pending', affectedNoteIds: [], affectedCardIds: [],
    affectedDeckIds: [1], affectedNotetypeIds: [2],
    operations: [{ kind: 'create_note', noteId: -1, cardId: 0, deckId: 1,
      fieldOrd: 0, before: '', after: 'Q' }],
  };
  const { runner, requests } = runnerHarness(
    [[searchStatus, continuation], [toolCallEvent(createCall)]],
    [{ outputJson: '{}', draft, clarification: null }],
  );
  const result = await runner.run('deepseek', providerRequest({
    searchMode: 'auto', requiresWebSearch: true, requiresDraft: true, expectedDraftCount: 1,
    functionTools: [functionTool('create_flashcards')],
  }), { onEvent() {} });
  assert.equal(result.drafts[0].id, 'handoff-draft');
  assert.equal(requests.length, 2);
  assert.equal(requests[1].input.some((item) => item.kind === 'output_item'), true);
  assert.equal(requests[1].input.some((item) => item.content.includes('required web search is complete')), true);
});

test('disabled and unsupported required web search fail before network access', async () => {
  const disabled = runnerHarness([], []);
  await assert.rejects(
    () => disabled.runner.run('deepseek', providerRequest({
      searchMode: 'off', requiresWebSearch: true,
    }), { onEvent() {} }),
    (error) => error instanceof Error && error.message === 'web_search_disabled',
  );
  assert.equal(disabled.requests.length, 0);

  const unsupported = runnerHarness([], []);
  await assert.rejects(
    () => unsupported.runner.run('custom', providerRequest({
      searchMode: 'auto', requiresWebSearch: true,
    }), { onEvent() {} }),
    (error) => error instanceof Error && error.message === 'web_search_provider_unsupported',
  );
  assert.equal(unsupported.requests.length, 0);
});

test('create mode preserves refusal text and never injects a hidden draft correction', async () => {
  const refusal = { kind: 'text_delta', text: '当前条件下无法生成。', toolCall: null,
    toolTrace: null, source: null, errorCode: '' };
  const { runner, requests } = runnerHarness([[refusal], []], []);
  const events = [];
  await assert.rejects(
    () => runner.run('deepseek', providerRequest({ requiresDraft: true }), {
      onEvent(event) { events.push(event); },
    }),
    (error) => error instanceof Error && error.message === 'agent_no_valid_draft',
  );
  assert.equal(requests.length, 1);
  assert.equal(events.filter((event) => event.kind === 'text_delta').map((event) => event.text).join(''),
    '当前条件下无法生成。');
  assert.equal(events.some((event) => event.kind === 'status' && event.text === 'draft_correction'), false);
});

test('undeclared tools are reported but never reach the registry', async () => {
  const invented = toolCall('invented-1', 'Purpose', '{"cards":[]}');
  const { runner, registry, requests } = runnerHarness([[toolCallEvent(invented)], []], []);
  const events = [];
  await assert.rejects(
    () => runner.run('deepseek', providerRequest({
      requiresDraft: true, functionTools: [functionTool('create_flashcards')],
    }), { onEvent(event) { events.push(event); } }),
    (error) => error instanceof Error && error.message === 'agent_no_valid_draft',
  );
  assert.equal(registry.calls.length, 0);
  assert.equal(requests.length, 2);
  const failure = events.find((event) => event.kind === 'tool_failed');
  assert.equal(failure?.errorCode, 'tool_not_declared');
  const output = requests[0].input.find((item) => item.kind === 'function_call_output');
  assert.equal(JSON.parse(output.output).tool_error, 'tool_not_declared');
});

test('different corrected arguments may succeed after two failed rounds within the global budget', async () => {
  const first = toolCall('draft-1', 'create_flashcards', '{"cards":[]}');
  const second = toolCall('draft-2', 'create_flashcards', '{"cards":[{}]}');
  const { runner, registry, requests } = runnerHarness(
    [[toolCallEvent(first)], [toolCallEvent(second)], [toolCallEvent(toolCall('draft-3', 'create_flashcards', '{"cards":[{"fields":["Q","A"]}]}'))]],
    [new AgentToolSchemaError('invalid_value'), new AgentToolSchemaError('unexpected_property'),
      { outputJson: '{}', draft: {id:'ok',operations:[],risk:'write'}, clarification:null }],
  );
  const result = await runner.run('deepseek', providerRequest({
      requiresDraft: true, functionTools: [functionTool('create_flashcards')],
    }), { onEvent() {} });
  assert.equal(result.status, 'completed');
  assert.equal(result.drafts[0].id, 'ok');
  assert.equal(registry.calls.length, 3);
  assert.equal(requests.length, 3);
});

test('mixed clarification batches execute no registry calls and return protocol failures', async () => {
  const clarification = toolCall('clarify-1', 'request_clarification', '{"clarificationId":"scope-1"}');
  const ordinary = toolCall('search-1', 'search_cards', '{"query":"capital"}');
  const { runner, registry, requests } = runnerHarness(
    [[toolCallEvent(clarification), toolCallEvent(ordinary)], []], [],
  );
  const events = [];

  const result = await runner.run('deepseek', providerRequest(), { onEvent(event) { events.push(event); } });

  assert.equal(result.status, 'completed');
  assert.equal(registry.calls.length, 0);
  const failed = events.filter((event) => event.kind === 'tool_failed');
  assert.equal(failed.length, 2);
  assert.ok(failed.every((event) => event.errorCode === 'clarification_must_be_only_tool'));
  const replayedCalls = requests[0].input.filter((item) => item.kind === 'function_call');
  assert.deepEqual(replayedCalls.map((item) => item.callId), [clarification.id, ordinary.id]);
  const outputs = requests[0].input.filter((item) => item.kind === 'function_call_output');
  assert.equal(outputs.length, 2);
  for (const replayedCall of replayedCalls) {
    const index = requests[0].input.indexOf(replayedCall);
    assert.ok(outputs.every((item) => requests[0].input.indexOf(item) > index));
    assert.equal(outputs.filter((item) => item.callId === replayedCall.callId).length, 1);
  }
  assert.ok(outputs.every((item) => {
    const output = JSON.parse(item.output);
    return output.tool_error === 'clarification_must_be_only_tool' &&
      output.correction === 'Call this tool alone, then continue after its result.';
  }));
});

test('normal no-tool completion returns completed status', async () => {
  const { runner } = runnerHarness([[]], []);
  const result = await runner.run('deepseek', providerRequest(), { onEvent() {} });
  assert.deepEqual(result, {
    status: 'completed', clarification: null, drafts: [], providerCalls: 1, toolCalls: 0,
  });
});

test('cancellation triggered by a completed clarification trace wins over the pause result', async () => {
  const call = toolCall('clarify-1', 'request_clarification', '{"clarificationId":"scope-1"}');
  const { runner, requests } = runnerHarness([[toolCallEvent(call)]], [clarificationResult()]);
  const events = [];

  await assert.rejects(
    () => runner.run('deepseek', providerRequest({
      requiresDraft: true, functionTools: [functionTool('request_clarification')],
    }), {
      onEvent(event) {
        events.push(event);
        if (event.kind === 'tool_completed') { runner.cancel(); }
      },
    }),
    (error) => error instanceof Error && error.message === 'cancelled',
  );
  assert.equal(events.filter((event) => event.kind === 'tool_completed').length, 1);
  assert.equal(events.filter((event) => event.kind === 'tool_failed').length, 0);
  const outputs = requests[0].input.filter((item) => item.kind === 'function_call_output');
  assert.equal(outputs.length, 1);
  assert.equal(outputs[0].callId, call.id);
});

test('execution failures retain received fields and native cause instead of requesting smaller arguments', async () => {
  const name = 'propose_update_note_type_templates';
  const args = {notetypeIds:[2],css:'.card{background:#abc}',draftId:'style-1',reason:'test'};
  for (const error of [new 后端错误('collection unavailable', 9, 'GetNotetypeLegacy', 3),
    new AgentToolSchemaError('high_risk_batch_too_large'), new Error('collection_busy')]) {
    const call = toolCall('style-call', name, JSON.stringify(args));
    const {runner,requests} = runnerHarness([[toolCallEvent(call)],[]], [error]);
    const events = [];
    await assert.rejects(()=>runner.run('deepseek', providerRequest({functionTools:agentFunctionTools()}),
      {onEvent(event){events.push(event);}}),/agent_no_valid_draft/);
    const output = JSON.parse(requests[0].input.find(i=>i.kind==='function_call_output').output);
    assert.equal(output.failureStage,'execution');
    assert.deepEqual(output.receivedKeys,Object.keys(args));
    assert.ok(output.allowedKeys.includes('css'));
    assert.match(output.correction,/Arguments were received/);
    assert.doesNotMatch(output.correction,/Rebuild/);
    if (error instanceof 后端错误) {
      assert.equal(output.tool_error,'backend_error');
      assert.match(output.message,/collection unavailable/);
      assert.match(output.message,/nativeStatus=3, kind=9, context=GetNotetypeLegacy/);
    }
  }
});

test('argument failures keep their field path and distinguish them from execution failures', async () => {
  const call = toolCall('style-call','propose_update_card_style','{"notetypeIds":[2],"style":{"fontSize":0}}');
  const {runner,requests} = runnerHarness([[toolCallEvent(call)],[]],
    [new AgentToolSchemaError('invalid_value','style','invalid_card_style_font_size')]);
  await assert.rejects(()=>runner.run('deepseek',providerRequest({functionTools:agentFunctionTools()}),{onEvent(){}}),
    /agent_no_valid_draft/);
  const output=JSON.parse(requests[0].input.find(i=>i.kind==='function_call_output').output);
  assert.equal(output.failureStage,'arguments');assert.equal(output.errorPath,'style');
  assert.deepEqual(output.receivedKeys,['notetypeIds','style']);
});
