// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { AgentRetrieval } from '../../entry/src/main/ets/model/agent/AgentRetrieval.ts';
import { AgentActionLedger, AgentApprovalRequired, createAgentAction } from '../../entry/src/main/ets/model/agent/AgentAction.ts';
import { decodeAgentClarificationRequest, canAnswerClarification } from '../../entry/src/main/ets/model/agent/AgentClarification.ts';
import { evaluateAgentReadiness } from '../../entry/src/main/ets/model/agent/AgentTaskContext.ts';
import { agentExtensionTools, decodeExtensionArguments, extensionToolRisk } from '../../entry/src/main/ets/model/agent/AgentExtensionTools.ts';
import { buildAgentNotetypeJson } from '../../entry/src/main/ets/model/agent/AgentNotetypeDesign.ts';
import { applyAgentMemoryChange, relevantAgentMemories } from '../../entry/src/main/ets/model/agent/AgentMemory.ts';
import { safeAgentSessionState, closeUnansweredCalls, boundAgentSessionInput, compactAgentToolOutputs } from '../../entry/src/main/ets/model/agent/AgentSessionState.ts';
import { toolRiskOf } from '../../entry/src/main/ets/model/agent/AgentPolicy.ts';
import { AgentScope } from '../../entry/src/main/ets/backend/agent/AgentScope.ets';

test('large checkpoints preserve valid action JSON and compacted tools retain continuation metadata', () => {
  const input = [
    {kind:'message',role:'user',content:'old task',callId:'',name:'',argumentsJson:'',output:''},
    {kind:'function_call',role:'',content:'',callId:'r1',name:'get_note_context',argumentsJson:'{}',output:''},
    {kind:'function_call_output',role:'',content:'',callId:'r1',name:'',argumentsJson:'',output:JSON.stringify({notes:'长正文'.repeat(80000),nextOffset:5,readCount:5})},
    {kind:'message',role:'user',content:'new task',callId:'',name:'',argumentsJson:'',output:''},
  ];
  const bounded=boundAgentSessionInput(input,1000);
  assert.equal(bounded.at(-1).content,'new task');
  assert.equal(bounded.filter(x=>x.callId==='r1').length,0);
  compactAgentToolOutputs(input,10000);
  const output=JSON.parse(input[2].output);assert.equal(output.nextOffset,5);assert.equal(output.readCount,5);
  assert.equal(output.status,'earlier_tool_content_omitted');
  const retrieval=new AgentRetrieval();
  const action=createAgentAction('analysis',JSON.stringify({query:'',noteIds:Array.from({length:50000},(_,i)=>i+1)}));
  const safe=safeAgentSessionState({input,action,readableIds:[[],[],[],[]],retrieval:retrieval.exportState(),waitingCallId:'',paused:true});
  assert.equal(JSON.parse(safe.action.payloadJson).noteIds.length,50000);
});

test('conversation can begin without a deck/type, but still requires text and provider', () => {
  const setup = { mode: 'create', deckId: 0, notetypeId: 0, fieldNames: [] };
  assert.equal(evaluateAgentReadiness(setup, '先聊聊英语怎么学', true), 'ready');
  assert.equal(evaluateAgentReadiness(setup, '', true), 'missing_input');
  assert.equal(evaluateAgentReadiness(setup, 'hello', false), 'missing_provider');
});

test('open clarification accepts a free-text-only answer and rejects no-answer forms', () => {
  const request = decodeAgentClarificationRequest(JSON.stringify({ clarificationId: 'goal', question: '你准备什么考试？',
    options: [], allowFreeText: true }));
  const view = { request, selectedOptionId: '', supplementalText: '', state: 'pending' };
  assert.equal(canAnswerClarification(view), false);
  assert.equal(canAnswerClarification({ ...view, supplementalText: '四级' }), true);
  assert.throws(() => decodeAgentClarificationRequest(JSON.stringify({ ...request, clarificationId: 'goal', allowFreeText: false })));
});

test('search pages traverse over 1000 results exactly once and survive restoration', () => {
  const retrieval = new AgentRetrieval();
  const ids = Array.from({ length: 2507 }, (_, i) => i + 1).reverse();
  let page = retrieval.begin('search_notes', 'deck:English', ids, 127);
  const seen = [...page.ids];
  ids.splice(0);
  const restored = new AgentRetrieval();
  restored.restore(retrieval.exportState());
  while (page.nextCursor) { page = restored.next('search_notes', page.nextCursor, 127); seen.push(...page.ids); }
  assert.equal(seen.length, 2507);
  assert.equal(new Set(seen).size, 2507);
  assert.equal(seen.at(-1), 2507);
  assert.throws(() => restored.next('search_cards', 'missing:0', 50), /expired/);
});

test('large analysis approval is enforced and cannot silently expand to other notes', () => {
  const retrieval = new AgentRetrieval();
  for (let id = 1; id <= 200; id++) { retrieval.beforeRead([id]); retrieval.recordRead(id); }
  assert.throws(() => retrieval.beforeRead([201]), AgentApprovalRequired);
  retrieval.approveAnalysis([201, 202, 203]);
  assert.doesNotThrow(() => retrieval.beforeRead([201, 202]));
  assert.throws(() => retrieval.beforeRead([999]), AgentApprovalRequired);
  const restored = new AgentRetrieval(); restored.restore(retrieval.exportState());
  assert.doesNotThrow(() => restored.beforeRead([203]));
  assert.throws(() => restored.beforeRead([999]), AgentApprovalRequired);
});

test('new turns preserve discovered read IDs without granting direct write scope', () => {
  const scope = new AgentScope(); scope.registerReadableNoteIds([42]); scope.beginTurn();
  assert.doesNotThrow(() => scope.assertReadableNoteIds([42]));
  assert.throws(() => scope.assertNoteIdsInScope([42]), /out_of_scope/);
  scope.reset(); assert.throws(() => scope.assertReadableNoteIds([42]));
});

test('all auxiliary tool templates match their parser and authoritative risk', () => {
  for (const tool of agentExtensionTools()) {
    assert.doesNotThrow(() => decodeExtensionArguments(tool.name, tool.exampleArgumentsJson), tool.name);
    assert.equal(toolRiskOf(tool.name), extensionToolRisk(tool.name));
    const extra = { ...JSON.parse(tool.exampleArgumentsJson), confirmed: true };
    assert.throws(() => decodeExtensionArguments(tool.name, JSON.stringify(extra)), tool.name);
  }
});

test('confirmation binds payload and prevents double execution', () => {
  const ledger = new AgentActionLedger(); const action = createAgentAction('create_deck', '{"name":"English"}');
  ledger.register(action);
  assert.throws(() => ledger.consume({ ...action, payloadJson: '{"name":"Other"}' }), /confirmation_mismatch/);
  ledger.consume(action); assert.equal(action.status, 'executing');
  assert.throws(() => ledger.consume({ ...action, status: 'pending' }), /confirmation_mismatch/);
});

test('note type design builds valid field references while retaining stock defaults', () => {
  const tool = agentExtensionTools().find(t => t.name === 'propose_create_note_type');
  const args = decodeExtensionArguments(tool.name, tool.exampleArgumentsJson);
  const stock = JSON.stringify({ id: 123, name: 'Basic', flds: [{ name: 'Front', ord: 0, font: 'Arial' }],
    tmpls: [{ ord: 0, name: 'Card 1', qfmt: '{{Front}}', afmt: '{{Back}}', bsize: 0 }], css: '.card{}' });
  const result = JSON.parse(buildAgentNotetypeJson(stock, args));
  assert.equal(result.id, 0); assert.equal(result.flds.length, 3);
  assert.equal(result.flds[2].font, 'Arial'); assert.match(result.tmpls[0].qfmt, /\{\{单词\}\}/);
  assert.match(result.tmpls[0].afmt, /\{\{例句\}\}/);
  assert.throws(() => decodeExtensionArguments(tool.name, JSON.stringify({ ...args, fields: ['A'], frontFields: ['missing'] })));
});

test('memory changes use optimistic conflict checks and scoped retrieval', () => {
  const change = { operation: 'create', memoryId: '', text: 'Include examples', scope: 'deck:7', before: null };
  const memories = applyAgentMemoryChange([], change, 'memory-1', 100);
  assert.equal(relevantAgentMemories(memories, 8).length, 0);
  assert.equal(relevantAgentMemories(memories, 7).length, 1);
  const update = { ...change, operation: 'update', memoryId: 'memory-1', text: 'Short examples', before: memories[0] };
  const changed = applyAgentMemoryChange(memories, update, 'action-2', 200);
  assert.throws(() => applyAgentMemoryChange(changed, update, 'action-3', 300), /memory_conflict/);
  assert.equal(applyAgentMemoryChange(changed, { ...update, operation: 'delete', before: changed[0] }, 'a', 400).length, 0);
});

test('checkpoints preserve original provider reasoning and call pairing while omitting imported document bodies', () => {
  const item = (kind, content = '', callId = '') => ({ kind, content, callId, role: 'user', name: 'search_notes', argumentsJson: '{}', output: '' });
  const input = [item('message', '用户要求：做卡\n以下是用户主动导入的本地文件内容\nSECRET-DOC'),
    item('reasoning', 'PRIVATE-THINKING'), item('function_call', '', 'call-1')];
  closeUnansweredCalls(input);
  const saved = safeAgentSessionState({ input, readableIds: [[], [], [], []],
    retrieval: { snapshots: [], readNoteIds: [], approvedNoteIds: [] }, action: null, waitingCallId: '', paused: true });
  assert.doesNotMatch(JSON.stringify(saved), /SECRET-DOC/);
  assert.equal(saved.input.find(value => value.kind === 'reasoning').content, 'PRIVATE-THINKING');
  assert.equal(saved.reasoningReplayVersion, 1);
  assert.equal(saved.input.at(-1).callId, 'call-1');
  assert.equal(saved.input.at(-1).kind, 'function_call_output');
});
