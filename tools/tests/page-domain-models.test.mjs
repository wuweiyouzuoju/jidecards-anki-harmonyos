// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserSearchSession, loadBrowserRows } from '../../entry/src/main/ets/model/BrowserSearchSession.ts';
import { loadNoteEditor } from '../../entry/src/main/ets/model/NoteEditorLoader.ts';
import { resolveStudyKey } from '../../entry/src/main/ets/model/StudyInputPolicy.ts';
import { renderStudyAnswer } from '../../entry/src/main/ets/model/StudyAnswerRenderer.ts';
import { reconcileHomeExpansion } from '../../entry/src/main/ets/model/HomeDeckExpansion.ts';
import { HomeRefreshQueue } from '../../entry/src/main/ets/model/HomeRefreshQueue.ts';
import { createAgentMessage, cloneAgentMessage, projectAgentHistory, restoreAgentMessages } from '../../entry/src/main/ets/model/agent/AgentConversationView.ts';
import { createStartedAgentToolTrace } from '../../entry/src/main/ets/model/agent/AgentToolDiagnostics.ts';
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise(setImmediate);

test('browser serializes mode changes through completion of old row RPCs and never publishes stale rows', async () => {
  let generation = 1, mode = false; const gate = deferred(), events = [];
  const session = new BrowserSearchSession({
    open: async () => {}, setNotesMode: async notes => { mode = notes; events.push(['mode', notes]); },
    columns: async () => ({ columns: [{ key: 'question' }] }), activateColumns: async () => {},
    buildSearch: async node => node.kind === 'card_state' ? 'suspended' : 'query',
    search: async (request, notes) => request.search === 'suspended' ? [] : notes ? [21] : [11],
    row: async id => { if (id === 11) await gate.promise; events.push(['row', id, mode]); return { cells: [], color: 0 }; }
  });
  const query = { filesDir: '/', notes: false, text: '', filter: 'all', sortColumn: '', sortReverse: false };
  const old = session.search(query, () => generation === 1); await tick(); generation++;
  const fresh = session.search({ ...query, notes: true }, () => generation === 2); await tick();
  assert.deepEqual(events, [['mode', false]]); gate.resolve();
  assert.equal(await old, null); assert.deepEqual((await fresh).ids, [21]);
  assert.deepEqual(events, [['mode', false], ['row', 11, false], ['mode', true], ['row', 21, true]]);
});

test('browser row loading preserves order, suspension independent of flags, failure isolation and concurrency ceiling', async () => {
  let active = 0, max = 0;
  const rows = await loadBrowserRows(Array.from({ length: 45 }, (_, i) => i), new Set([1]), async id => {
    active++; max = Math.max(max, active); await tick(); active--;
    if (id === 2) throw new Error('deleted'); return { cells: [], color: 3 };
  }, () => true);
  assert.equal(max, 20); assert.equal(rows.length, 44); assert.equal(rows[1].hasSuspendedCards, true);
  assert.equal(rows[1].color, 3); assert.deepEqual(rows.slice(0, 4).map(r => r.id), [0, 1, 3, 4]);
});

test('editor loader stops before subsequent RPC when closed and snapshots field names', async () => {
  const gate = deferred(); let current = true, noteReads = 0;
  const backend = { card: async () => gate.promise, note: async () => { noteReads++; return { notetypeId: 4 }; },
    notetype: async () => ({ fieldNames: ['Front'] }) };
  const pending = loadNoteEditor(1, false, backend, () => current); current = false; gate.resolve({ noteId: 2 });
  assert.equal(await pending, null); assert.equal(noteReads, 0);
  current = true; const names = ['Front']; backend.notetype = async () => ({ fieldNames: names });
  const result = await loadNoteEditor(2, true, backend, () => current); names[0] = 'changed';
  assert.deepEqual(result.fieldNames, ['Front']);
});

test('study input covers phases, editor suppression, modifier release during guide and all rating aliases', () => {
  assert.equal(resolveStudyKey('space', true, false, 'question', false, false).command, 'flip');
  for (const [key, command] of [['1', 'again'], ['2', 'hard'], ['3', 'good'], ['4', 'easy'], ['space', 'good'], ['enter', 'good']]) {
    assert.equal(resolveStudyKey(key, true, false, 'answer', false, false).command, command);
    assert.equal(resolveStudyKey(key, true, false, 'done', false, false).command, 'none');
  }
  assert.deepEqual(resolveStudyKey('z', true, true, 'answer', true, false), { control: false, command: 'none' });
  assert.deepEqual(resolveStudyKey('control', false, true, 'answer', false, true), { control: false, command: 'none' });
  assert.equal(resolveStudyKey('z', true, true, 'done', false, false).command, 'undo');
  assert.equal(resolveStudyKey('escape', true, false, 'loading', false, false).command, 'back');
});

test('answer renderer reads the captured field, handles cloze ordinals, missing placeholders and read failures', async () => {
  const request = { noteId: 7, fieldName: 'Front', ordinal: 1, cloze: true, input: 'two', combining: true };
  const backend = { note: async id => { assert.equal(id, 7); return { notetypeId: 8, fields: ['{{c1::one}} {{c2::two}}'] }; },
    notetype: async () => ({ fieldNames: ['Front'] }) };
  const result = await renderStudyAnswer('answer', request, backend);
  assert.match(result, /<hr><code id=typeans>/); assert.match(result, /two/); assert.doesNotMatch(result, /one/);
  assert.equal(await renderStudyAnswer('answer', { ...request, ordinal: 5 }, backend), 'answer');
  backend.note = async () => { throw new Error('unavailable'); };
  assert.equal(await renderStudyAnswer('answer', request, backend), 'answer');
});

test('home expansion keeps collapsed parents, expands new parents and drops deleted IDs', () => {
  const decks = [{ id: 'a', hasChildren: true }, { id: 'b', hasChildren: true }, { id: 'leaf', hasChildren: false }];
  assert.deepEqual([...reconcileHomeExpansion(decks, new Set(), new Set(), false).expanded], ['a', 'b']);
  const result = reconcileHomeExpansion(decks, new Set(['deleted']), new Set(['a']), true);
  assert.deepEqual([...result.expanded], ['b']); assert.deepEqual([...result.known], ['a', 'b', 'leaf']);
});

test('home refresh queue recovers after rejection, serializes and drops queued work after disposal', async () => {
  const queue = new HomeRefreshQueue(), gate = deferred(), events = [];
  const first = queue.run(async () => { events.push(1); await gate.promise; throw new Error('failed'); });
  const second = queue.run(async () => { events.push(2); }); await tick(); assert.deepEqual(events, [1]);
  gate.resolve(); await assert.rejects(first); await second; assert.deepEqual(events, [1, 2]);
  queue.dispose(); await queue.run(async () => { events.push(3); }); assert.deepEqual(events, [1, 2]);
});

test('conversation projection preserves provider output, clarification, reasoning and tool ownership through restore', () => {
  const message = createAgentMessage(8, 'ai', 'visible error', false); message.providerText = 'raw assistant output';
  message.推理摘要 = 'provider reasoning'; message.reasoningIsSummary = true;
  const trace = createStartedAgentToolTrace({ id: 'call', name: 'search_cards', argumentsJson: '{}' }, 1, 1);
  message.工具过程 = [trace]; message.timeline = [{ id: 0, indexes: [], images: [], kind: 'tool', refId: 'call', index: 0, toolName: 'search_cards', text: '' }];
  const user = createAgentMessage(7, 'user', 'question title', false);
  const projection = projectAgentHistory([user, message], 'default');
  assert.equal(projection.title, 'question title'); assert.equal(projection.messages[1].text, 'raw assistant output');
  assert.equal(projection.messages[1].reasoning, 'provider reasoning'); assert.equal(projection.audits[0].messageId, 8);
  let id = 100; const restored = restoreAgentMessages({ ...projection, results: [] }, () => ++id, 'unassigned', false);
  assert.deepEqual(restored.map(m => m.id), [101, 102]); assert.equal(restored[1].工具过程[0].callId, trace.callId);
  assert.equal(restored[1].timeline[0].index, 0); assert.equal(restored[1].工具过程[0].expanded, false);
  assert.deepEqual(restored[1].卡片列表, []);
});

test('restored clarification/action cannot mutate stored history, legacy audits stay separate, clones own editable fields', () => {
  const message = createAgentMessage(1, 'ai', 'choose', false); message.kind = 'clarification';
  message.clarification = { request: { id: 'q', question: 'choose', options: [], recommendedOptionId: '', allowFreeText: true },
    selectedOptionId: '', supplementalText: '', state: 'pending', error: '' };
  message.action = { id: 'a', kind: 'create_deck', status: 'pending', payloadJson: '{}', resultJson: '' };
  message.卡片列表 = [{ fields: ['front'], 已选中: true, 状态: 'draft', 失败提示: '' }];
  const clone = cloneAgentMessage(message); clone.卡片列表[0].fields[0] = 'changed'; assert.equal(message.卡片列表[0].fields[0], 'front');
  const projection = projectAgentHistory([message], 'default');
  projection.audits = [createStartedAgentToolTrace({ id: 'legacy', name: 'search_cards', argumentsJson: '{}' }, 1, 1)];
  let id = 10; const restored = restoreAgentMessages({ ...projection, results: [] }, () => ++id, 'unassigned tools', true);
  assert.equal(restored[0].正文, 'choose'); assert.equal(restored[0].kind, 'clarification');
  restored[0].action.status = 'cancelled'; restored[0].clarification.state = 'cancelled';
  assert.equal(projection.messages[0].action.status, 'pending'); assert.equal(projection.messages[0].clarification.state, 'pending');
  assert.equal(restored[1].正文, 'unassigned tools'); assert.equal(restored[1].工具过程.length, 1);
});

test('pagination and newly mounted browser sessions share the collection mode lock', async () => {
  const gate = deferred(), events = []; let mode = false;
  const pagination = loadBrowserRows([1], new Set(), async () => { await gate.promise; events.push(['row', mode]); return {cells:[], color:0}; }, () => true);
  await tick();
  const session = new BrowserSearchSession({ open: async () => {}, setNotesMode: async value => {mode=value; events.push('mode');},
    columns: async () => ({columns:[{key:'question'}]}), activateColumns: async () => {}, buildSearch: async () => '',
    search: async () => [], row: async () => { throw new Error('unexpected'); } });
  const search = session.search({filesDir:'/',notes:true,text:'',filter:'all',sortColumn:'',sortReverse:false}, () => true);
  await tick(); assert.deepEqual(events, []); gate.resolve(); await Promise.all([pagination, search]);
  assert.deepEqual(events, [['row',false], 'mode']);
});
