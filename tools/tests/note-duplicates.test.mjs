// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NoteDuplicateSession, NoteDuplicateWarning, duplicateGroupSearch } from '../../entry/src/main/ets/model/NoteDuplicateSession.ts';
import { NoteCreationSession } from '../../entry/src/main/ets/model/NoteCreationSession.ts';
import * as noteMessages from '../../entry/src/main/ets/proto/messages/NoteMessages.ts';
import * as duplicateMessages from '../../entry/src/main/ets/proto/messages/NoteDuplicateMessages.ts';
import { 协议写入器 } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';
import { 协议读取器 } from '../../entry/src/main/ets/proto/core/ProtoReader.ts';
import { loadPlatformModule, loadComponentLogic } from './platform-module-harness.mjs';
import { creationPageHarness } from './note-creation-harness.mjs';
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(setImmediate);
const input = { notetypeId: 9, fieldOrd: 1, search: 'deck:One OR tag:two' };

test('large selected-field scans consume every ID in bounded batches, preserving exact Core values', async () => {
  const ids = Array.from({ length: 1205 }, (_, i) => i + 1), calls = [], states = [];
  const session = new NoteDuplicateSession({ search: async request => { assert.deepEqual(request, input); return ids; },
    fields: async (batch, mid, ord) => {
      calls.push(batch); assert.equal(mid, 9); assert.equal(ord, 1);
      return batch.map(noteId => ({ noteId, value: noteId === 1 || noteId === 1205 ? 'same' :
        noteId === 201 || noteId === 402 ? 'picture.png' : noteId === 2 ? 'Same' : noteId === 3 ? 'same ' : '' }));
    } }, state => states.push(state));
  await session.scan(input);
  assert.deepEqual(calls.flat(), ids); assert.ok(calls.every(batch => batch.length <= 200));
  assert.deepEqual(states.at(-1).groups, [{ value: 'same', noteIds: [1, 1205] }, { value: 'picture.png', noteIds: [201, 402] }]);
  assert.equal(states.at(-1).complete, true); assert.equal(states.at(-1).scanned, 1205);
  assert.deepEqual(states.filter(s => s.scanned > 0).map(s => s.scanned), [200, 400, 600, 800, 1000, 1200, 1205, 1205]);
});

test('cancel, replacement and disposal suppress in-flight batches and stale errors', async () => {
  for (const mode of ['cancel', 'reset', 'replace', 'dispose']) {
    const gate = deferred(), states = [], calls = [];
    const backend = { search: async () => Array.from({ length: 401 }, (_, i) => i + 1),
      fields: async ids => { calls.push(ids); return gate.promise; } };
    const session = new NoteDuplicateSession(backend, state => states.push(state));
    const old = session.scan(input); await tick();
    if (mode === 'replace') {
      backend.search = async () => [901, 902];
      backend.fields = async ids => ids.map(noteId => ({ noteId, value: 'new' }));
      await session.scan({ ...input, fieldOrd: 0 });
    } else session[mode]();
    const count = states.length;
    gate.reject(Error('old error')); await old;
    assert.equal(calls.length, 1); assert.equal(states.length, count);
    if (mode === 'cancel') assert.equal(states.at(-1).cancelled, true);
    if (mode === 'replace') assert.deepEqual(states.at(-1).groups[0].noteIds, [901, 902]);
  }
});

test('missing, repeated and failed rows are errors with no partial success; retry can complete', async () => {
  for (const fields of [async () => [], async () => [{ noteId: 1, value: 'x' }, { noteId: 1, value: 'x' }],
    async () => { throw Error('disk error'); }]) {
    const states = [], backend = { search: async () => [1, 2], fields };
    const session = new NoteDuplicateSession(backend, s => states.push(s)); await session.scan(input);
    assert.equal(states.at(-1).complete, false); assert.ok(states.at(-1).error); assert.deepEqual(states.at(-1).groups, []);
    backend.fields = async () => [{ noteId: 1, value: 'x' }, { noteId: 2, value: 'x' }];
    await session.scan(input); assert.equal(states.at(-1).complete, true); assert.equal(states.at(-1).error, '');
  }
});

test('read adapter combines numeric type and optional OR scope through Core nodes and uses the local batch RPC', async () => {
  let node, request, rpc;
  const Adapter = loadPlatformModule('backend/AnkiNoteDuplicates.ts', 'AnkiNoteDuplicates', {
    搜索服务: class { async 构建搜索串(value) { node = value; return 'grouped'; } async 搜索笔记(value) { request = value; return [1, 2]; } },
    SearchNodeJoiner: { AND: 0 }, ...duplicateMessages,
    后端会话: { 获取实例: () => ({ 调用: async (...args) => { rpc = args; return new Uint8Array(); } }) }
  });
  const adapter = new Adapter(); assert.deepEqual(await adapter.search(input), [1, 2]);
  assert.equal(node.kind, 'group'); assert.deepEqual(node.group.nodes.map(n => n.text), ['mid:9', input.search]);
  assert.deepEqual(request, { search: 'grouped', order: { kind: 'none' } });
  await adapter.fields([1, 2], 9, 1); assert.deepEqual(rpc.slice(0, 2), [1002, 0]);
});

test('duplicate protocol roundtrip keeps IDs and field ordinal and rejects invalid or unbounded batches', () => {
  const bytes = duplicateMessages.encodeDuplicateFields([1, 2], 9, 1);
  const reader = new 协议读取器(bytes), values = [];
  for (let tag; (tag = reader.读取标签()) !== null;) values.push([tag.字段号, reader.读取64位整数()]);
  assert.deepEqual(values, [[1, 1], [1, 2], [2, 9], [3, 1]]);
  for (const ids of [[], [1, 1], [-1], [1.5], Array.from({ length: 201 }, (_, i) => i + 1)]) {
    assert.throws(() => duplicateMessages.encodeDuplicateFields(ids, 9, 1));
  }
  const response = new 协议写入器();
  const field = new 协议写入器(); field.写入64位整数(1, 42); field.写入字符串(2, '中文.png');
  response.写入子消息(1, field);
  assert.deepEqual(duplicateMessages.decodeDuplicateFields(response.转为字节()), [{ noteId: 42, value: '中文.png' }]);
});

function noteServiceHarness(state) {
  const calls = [];
  const Bundle = loadPlatformModule('backend/笔记服务.ts', '({ 笔记服务, 笔记字段校验错误 })', {
    ...noteMessages, 服务号: { 后端笔记: 19 }, 笔记方法: { 笔记字段校验: 11, 添加笔记: 1 },
    后端会话: { 获取实例: () => ({ 调用: async (service, method, bytes) => {
      calls.push({ service, method, bytes }); const writer = new 协议写入器();
      if (method === 11) writer.写入变长整数(1, state); else writer.写入64位整数(2, 99);
      return writer.转为字节();
    } }) }
  });
  return { ...Bundle, service: new Bundle.笔记服务(), calls };
}

test('strict add contract still rejects duplicates; explicit override allows only DUPLICATE', async () => {
  const note = { id: 0, guid: '', notetypeId: 9, mtimeSecs: 0, usn: 0, tags: [], fields: ['front', 'back'] };
  for (const state of [0, 1, 2, 3, 4, 5]) {
    for (const allow of [false, true]) {
      const h = noteServiceHarness(state), operation = allow ? '添加笔记允许重复' : '添加笔记';
      if (state === 0 || (allow && state === 2)) {
        assert.equal(await h.service[operation](note, 77), 99);
        assert.deepEqual(h.calls.map(call => call.method), [11, 1]);
      } else {
        await assert.rejects(h.service[operation](note, 77), h.笔记字段校验错误);
        assert.deepEqual(h.calls.map(call => call.method), [11]);
      }
    }
  }
});

test('manual adapter produces the Core dupe node without permitting empty or cloze errors', async () => {
  const h = noteServiceHarness(2), nodes = [], writes = [];
  const Adapter = loadPlatformModule('backend/AnkiNoteCreation.ets', 'AnkiNoteCreation', {
    笔记服务: class { async 新建笔记() { return { notetypeId: 9, fields: [] }; }
      async 添加笔记() { throw new h.笔记字段校验错误('add_note_duplicate_error'); }
      async 添加笔记允许重复(note, deck) { writes.push([note, deck]); } },
    笔记字段校验错误: h.笔记字段校验错误, NoteDuplicateWarning,
    笔记类型服务: class {}, 图片遮罩服务: class {},
    搜索服务: class { async 构建搜索串(node) { nodes.push(node); return 'exact-dupe'; } }
  });
  const adapter = new Adapter(), draft = { deckId: 77, notetypeId: 9, fields: ['<b>"\\*中</b>', 'back'], tags: [], images: [] };
  await assert.rejects(adapter.saveNote(draft), error => error instanceof NoteDuplicateWarning && error.search === 'exact-dupe');
  assert.equal(writes.length, 0); assert.deepEqual(nodes[0], { kind: 'dupe', dupe: { notetypeId: 9, firstField: draft.fields[0] } });
  await adapter.saveNote(draft, true); assert.equal(writes.length, 1); assert.equal(writes[0][1], 77);
});

test('warning requires explicit confirmation, freezes prepared media and retains completion semantics', async () => {
  const states = [], writes = [], gate = deferred(); let imports = 0, commits = 0;
  const session = new NoteCreationSession({ importImage: async () => { imports++; return 'same.png'; },
    saveNote: async (input, allow = false) => { writes.push(structuredClone({ input, allow }));
      if (!allow) throw new NoteDuplicateWarning('dupe-query'); await gate.promise; },
    errorMessage: e => e.message, committed: () => commits++ }, s => states.push(s));
  const draft = { deckId: 77, notetypeId: 9, fields: ['front'], tags: ['t'],
    images: [{ id: 1, uri: 'photo', filename: '', fieldIndex: 0 }] };
  await session.save(draft, false); assert.equal(states.at(-1).duplicateSearch, 'dupe-query');
  assert.equal(states.at(-1).completion, null); assert.equal(commits, 0);
  await session.save(draft); assert.equal(writes.length, 1);
  const confirming = session.confirmDuplicate(); await session.confirmDuplicate();
  session.dispose(); gate.resolve(); await confirming;
  assert.equal(imports, 1); assert.equal(writes.length, 2); assert.equal(writes[1].allow, true);
  assert.equal(writes[1].input.fields[0], 'front<br><img src="same.png">'); assert.equal(commits, 1);
});

test('cancelling or disposing a warning never writes, and retry starts with strict validation again', async () => {
  for (const mode of ['cancelDuplicate', 'dispose']) {
    const states = [], allows = [];
    const session = new NoteCreationSession({ saveNote: async (_, allow = false) => { allows.push(allow); throw new NoteDuplicateWarning('dupe'); },
      errorMessage: e => e.message }, s => states.push(s));
    const draft = { deckId: 1, notetypeId: 9, fields: ['x'], tags: [], images: [] };
    await session.save(draft); session[mode](); await session.confirmDuplicate(); assert.deepEqual(allows, [false]);
    if (mode === 'cancelDuplicate') { await session.save(draft); assert.deepEqual(allows, [false, false]); }
  }
});

test('scan component cancels on Back, freezes type reads and jumps using the exact group IDs', async () => {
  const views = [], gate = deferred(); let closes = 0;
  const Component = loadComponentLogic('components/settings/查找重复对话框.ets', '查找重复对话框', {
    NoteDuplicateSession, duplicateGroupSearch, initialDuplicateScanState: () => ({ busy: false }), AnkiNoteDuplicates: class {},
    笔记类型服务: class { async 获取笔记类型名列表() { return [{ id: 9, name: 'A' }]; }
      async 获取编辑笔记类型(id) { return id === 9 ? gate.promise : { id, fieldNames: ['new'] }; } }
  });
  const component = new Component(); component.onClose = () => closes++;
  component.onJumpToBrowser = search => views.push(search);
  const load = component.loadTypes(); await tick(); component.笔记类型列表.push({ id: 10, name: 'B' });
  await component.selectType(1); gate.resolve({ id: 9 }); await load;
  assert.equal(component.view.id, 10); assert.equal(component.加载中, false);
  component.jump({ value: '"* OR deck:Other', noteIds: [42, 43] }); assert.deepEqual(views, ['nid:42,43']);
  component.handleBackRequest(); assert.equal(closes, 1); assert.equal(component.scan.cancelled, true);
});

test('navigation and manual warning UI expose notes mode and explicit actions', () => {
  const read = path => readFileSync(new URL('../../entry/src/main/ets/' + path, import.meta.url), 'utf8');
  const page = read('pages/添加笔记页.ets');
  assert.match(page, /NoteDuplicateDialog\(\{[\s\S]*?cancelDuplicate\(\)[\s\S]*?confirmDuplicate\(\)/);
  assert.match(page, /initialSearch: this\.duplicateSearch, initialNotesMode: true/);
  assert.match(read('pages/设置页.ets'), /initialSearch: 搜索串, initialNotesMode: true/);
  assert.match(read('pages/navigation/HomeDestinations.ets'), /pageInitialNotesMode:.*initialNotesMode/);
  assert.match(read('pages/浏览页.ets'), /if \(this\.pageInitialNotesMode\) this\.浏览模式值 = 'notes'/);
});

test('real add page freezes a duplicate draft, views exact Core query, cancels on Back and requires a new confirmation', async () => {
  const calls = [], paths = [];
  const h = creationPageHarness({ backend: {
    saveNote: async (input, allow = false) => { calls.push({ input: structuredClone(input), allow });
      if (!allow) throw new NoteDuplicateWarning('"dupe:9,quote \\\"*"'); }
  } });
  await h.ready; h.page.pathStack.pushPath = path => paths.push(path);
  h.page.字段值列表 = ['question', 'answer']; h.page.标签 = 't';
  await h.page.提交(true);
  assert.equal(h.page.处理中, true); assert.equal(h.page.错误信息, ''); assert.equal(h.pops.length, 0);
  h.page.viewDuplicates(); assert.deepEqual(paths, [{ name: 'BrowserPage', param: {
    initialSearch: '"dupe:9,quote \\\"*"', initialNotesMode: true } }]);
  assert.equal(calls.length, 1); assert.ok(h.page.duplicateSearch);
  await h.page.提交(true); assert.equal(calls.length, 1);
  h.page.onBackPress(); assert.equal(h.page.duplicateSearch, ''); assert.equal(h.page.处理中, false);
  assert.deepEqual(h.page.字段值列表, ['question', 'answer']); assert.equal(h.pops.length, 0);
  await h.page.creationSession.confirmDuplicate(); assert.equal(calls.length, 1);
  await h.page.提交(true); await h.page.creationSession.confirmDuplicate();
  assert.deepEqual(calls.map(c => c.allow), [false, false, true]); assert.equal(h.pops.length, 1);
});

test('confirmed duplicate still reports an empty or invalid-cloze recheck error and preserves the original draft', async () => {
  for (const key of ['add_note_empty_error', 'add_note_invalid_cloze_error']) {
    const h = creationPageHarness({ backend: { saveNote: async (_, allow = false) => {
      if (!allow) throw new NoteDuplicateWarning('dupe'); throw Error(key);
    } } });
    await h.ready; h.page.字段值列表 = ['question', 'answer'];
    await h.page.提交(true); await h.page.creationSession.confirmDuplicate();
    assert.equal(h.pops.length, 0); assert.equal(h.page.错误信息, key);
    assert.equal(h.page.处理中, false); assert.deepEqual(h.page.字段值列表, ['question', 'answer']);
  }
});

test('default AI and import callers keep the strict service; only the manual adapter calls the explicit override', () => {
  const adapter = readFileSync(new URL('../../entry/src/main/ets/backend/AnkiNoteCreation.ets', import.meta.url), 'utf8');
  assert.match(adapter, /添加笔记允许重复/);
  for (const path of ['backend/agent/AgentDraftExecutor.ets', 'backend/AI制卡服务.ets', 'backend/AnkiDataTransfer.ets']) {
    assert.doesNotMatch(readFileSync(new URL('../../entry/src/main/ets/' + path, import.meta.url), 'utf8'), /添加笔记允许重复/);
  }
});
