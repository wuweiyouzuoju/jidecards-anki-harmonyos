// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Anki 26.05 exposes the Notes and Notetypes service indexes used by add note', () => {
  const ids = read('entry/src/main/ets/backend/服务索引.ts');
  assert.match(ids, /后端笔记类型:\s*23/);
  assert.match(ids, /后端笔记:\s*25/);
  assert.match(ids, /export const 笔记方法\s*=\s*\{/);
  assert.match(ids, /新建笔记:\s*0/);
  assert.match(ids, /添加笔记:\s*1/);
  assert.match(ids, /添加默认值:\s*3/);
  assert.match(ids, /更新笔记:\s*5/);
  assert.match(ids, /获取笔记:\s*6/);
  assert.match(ids, /笔记字段校验:\s*11/);
  assert.match(ids, /export const 笔记类型方法\s*=\s*\{/);
  assert.match(ids, /获取笔记类型:\s*6/);
  assert.match(ids, /获取笔记类型名列表:\s*8/);
});

test('notes and notetypes codecs cover Anki add-note request and dynamic field metadata', () => {
  const notes = read('entry/src/main/ets/proto/messages/NoteMessages.ts');
  const notetypes = read('entry/src/main/ets/proto/messages/NotetypeMessages.ts');
  for (const symbol of [
    'EditableNote', 'encodeNote', 'decodeNote', 'encodeAddNoteRequest', 'decodeAddNoteResponse',
    'encodeDefaultsForAddingRequest', 'decodeDeckAndNotetype', 'decodeNoteFieldsCheckResponse',
    'encodeUpdateNotesRequest'
  ]) {
    assert.match(notes, new RegExp(`export (?:function|interface|enum) ${symbol}`));
  }
  // decodeUpdateNotesResponse 是 re-export 别名（export { decodeOpChanges as decodeUpdateNotesResponse }）
  assert.match(notes, /export\s*\{[^}]*decodeOpChanges\s+as\s+decodeUpdateNotesResponse[^}]*\}\s*from\s*['"]\.\/CollectionMessages['"]/);
  assert.match(notes, /MISSING_CLOZE/);
  assert.match(notes, /NOTETYPE_NOT_CLOZE/);
  assert.match(notes, /FIELD_NOT_CLOZE/);
  for (const symbol of [
    'NotetypeView', 'NotetypeNameId', 'encodeNotetypeId', 'decodeNotetype', 'decodeNotetypeNames'
  ]) {
    assert.match(notetypes, new RegExp(`export (?:function|interface) ${symbol}`));
  }
  assert.match(notetypes, /fieldNames/);
  assert.match(notetypes, /ord/);
});

test('add-note protobuf codecs use Anki fields and retain Note field order', async () => {
  const notes = await import('../../entry/src/main/ets/proto/messages/NoteMessages.ts');
  const notetypes = await import('../../entry/src/main/ets/proto/messages/NotetypeMessages.ts');
  const { 协议读取器 } = await import('../../entry/src/main/ets/proto/core/ProtoReader.ts');
  const { 协议写入器 } = await import('../../entry/src/main/ets/proto/core/ProtoWriter.ts');
  const note = {
    id: 12, guid: 'guid', notetypeId: 34, mtimeSecs: 56, usn: -1,
    tags: ['language', 'verbs'], fields: ['go', 'went']
  };
  assert.deepEqual(notes.decodeNote(notes.encodeNote(note)), note);
  const addRequest = new 协议读取器(notes.encodeAddNoteRequest(note, 78));
  assert.equal(addRequest.读取标签().字段号, 1);
  assert.deepEqual(notes.decodeNote(addRequest.读取字节()), note);
  assert.equal(addRequest.读取标签().字段号, 2);
  assert.equal(addRequest.读取64位整数(), 78);
  const defaults = new 协议读取器(notes.encodeDefaultsForAddingRequest(90));
  assert.equal(defaults.读取标签().字段号, 1);
  assert.equal(defaults.读取64位整数(), 90);
  const check = new 协议写入器();
  check.写入变长整数(1, notes.NoteFieldsCheckState.MISSING_CLOZE);
  assert.equal(notes.decodeNoteFieldsCheckResponse(check.转为字节()).state, notes.NoteFieldsCheckState.MISSING_CLOZE);

  const firstOrd = new 协议写入器();
  firstOrd.写入变长整数(1, 1);
  const firstField = new 协议写入器();
  firstField.写入子消息(1, firstOrd);
  firstField.写入字符串(2, 'Back');
  const secondOrd = new 协议写入器();
  secondOrd.写入变长整数(1, 0);
  const secondField = new 协议写入器();
  secondField.写入子消息(1, secondOrd);
  secondField.写入字符串(2, 'Front');
  const notetype = new 协议写入器();
  notetype.写入64位整数(1, 34);
  notetype.写入字符串(2, 'Basic');
  notetype.写入子消息(8, firstField);
  notetype.写入子消息(8, secondField);
  assert.deepEqual(notetypes.decodeNotetype(notetype.转为字节()).fieldNames, ['Front', 'Back']);
});

test('every public add-note codec has a callable runtime implementation', async () => {
  const notes = await import('../../entry/src/main/ets/proto/messages/NoteMessages.ts');
  const notetypes = await import('../../entry/src/main/ets/proto/messages/NotetypeMessages.ts');
  const { 协议写入器 } = await import('../../entry/src/main/ets/proto/core/ProtoWriter.ts');
  const note = { id: 0, guid: '', notetypeId: 1, mtimeSecs: 0, usn: 0, tags: [], fields: ['', ''] };
  assert.ok(notes.encodeNote(note) instanceof Uint8Array);
  assert.equal(notes.decodeNote(notes.encodeNote(note)).notetypeId, 1);
  assert.ok(notes.encodeAddNoteRequest(note, 2) instanceof Uint8Array);
  const addResponse = new 协议写入器();
  addResponse.写入64位整数(2, 3);
  assert.equal(notes.decodeAddNoteResponse(addResponse.转为字节()), 3);
  assert.ok(notes.encodeDefaultsForAddingRequest() instanceof Uint8Array);
  const defaults = new 协议写入器();
  defaults.写入64位整数(1, 4);
  defaults.写入64位整数(2, 5);
  assert.deepEqual(notes.decodeDeckAndNotetype(defaults.转为字节()), { deckId: 4, notetypeId: 5 });
  const normal = new 协议写入器();
  assert.equal(notes.decodeNoteFieldsCheckResponse(normal.转为字节()).state, notes.NoteFieldsCheckState.NORMAL);

  assert.ok(notetypes.encodeNotetypeId(1) instanceof Uint8Array);
  assert.deepEqual(notetypes.decodeNotetype(new Uint8Array(0)).fieldNames, []);
  const names = new 协议写入器();
  const name = new 协议写入器();
  name.写入64位整数(1, 6);
  name.写入字符串(2, 'Basic');
  names.写入子消息(1, name);
  assert.deepEqual(notetypes.decodeNotetypeNames(names.转为字节()), [{ id: 6, name: 'Basic' }]);
});

// T1.5（浏览编辑区 T7 前置）：UpdateNotesRequest 编解码往返 + 与 CardsMessages.encodeUpdateCardsRequest 同构。
// Proto 来源：anki/proto/anki/notes.proto UpdateNotesRequest { repeated Note notes = 1; bool skip_undo_entry = 2; }
test('encodeUpdateNotesRequest roundtrips repeated Note + skip_undo_entry like CardsMessages', async () => {
  const notes = await import('../../entry/src/main/ets/proto/messages/NoteMessages.ts');
  const collection = await import('../../entry/src/main/ets/proto/messages/CollectionMessages.ts');
  const { 协议读取器 } = await import('../../entry/src/main/ets/proto/core/ProtoReader.ts');

  const note1 = {
    id: 100, guid: 'g1', notetypeId: 7, mtimeSecs: 1700000000, usn: 42,
    tags: ['vocab'], fields: ['front', 'back']
  };
  const note2 = {
    id: 200, guid: 'g2', notetypeId: 7, mtimeSecs: 1700000001, usn: 42,
    tags: [], fields: ['hello', 'world']
  };

  // 1. 默认 skipUndoEntry=false：不写字段 2
  const defaultBytes = notes.encodeUpdateNotesRequest([note1, note2]);
  const r1 = new 协议读取器(defaultBytes);
  let seenNotes = 0;
  let seenSkipUndo = false;
  let tag;
  while ((tag = r1.读取标签()) !== null) {
    if (tag.字段号 === 1) {
      seenNotes++;
      const noteBytes = r1.读取字节();
      const decoded = notes.decodeNote(noteBytes);
      if (seenNotes === 1) {
        assert.deepEqual(decoded, note1);
      } else if (seenNotes === 2) {
        assert.deepEqual(decoded, note2);
      }
    } else if (tag.字段号 === 2) {
      seenSkipUndo = r1.读取布尔();
    } else {
      r1.跳过字段(tag.线类型);
    }
  }
  assert.equal(seenNotes, 2, '两个 Note 都应嵌入为字段 1');
  assert.equal(seenSkipUndo, false, '默认 skipUndoEntry=false 不写字段 2');

  // 2. skipUndoEntry=true：写字段 2 bool=true
  const skipBytes = notes.encodeUpdateNotesRequest([note1], true);
  const r2 = new 协议读取器(skipBytes);
  let skipValue = false;
  let noteCount = 0;
  while ((tag = r2.读取标签()) !== null) {
    if (tag.字段号 === 1) {
      noteCount++;
      r2.读取字节();
    } else if (tag.字段号 === 2) {
      skipValue = r2.读取布尔();
    } else {
      r2.跳过字段(tag.线类型);
    }
  }
  assert.equal(noteCount, 1);
  assert.equal(skipValue, true, 'skipUndoEntry=true 应写字段 2 bool=true');

  // 3. 空数组：合法空请求
  assert.equal(notes.encodeUpdateNotesRequest([]).length, 0, '空 notes 数组应产生空请求');

  // 4. decodeUpdateNotesResponse 是 decodeOpChanges 别名（re-export）
  assert.equal(notes.decodeUpdateNotesResponse, collection.decodeOpChanges,
    'decodeUpdateNotesResponse 应是 decodeOpChanges 的别名');
});

test('add note services validate field state before creating the note in the selected deck', () => {
  const noteService = read('entry/src/main/ets/backend/笔记服务.ts');
  const notetypeService = read('entry/src/main/ets/backend/笔记类型服务.ts');
  for (const method of ['获取添加默认值', '新建笔记', '添加笔记']) {
    assert.match(noteService, new RegExp(`async ${method}`));
  }
  assert.match(noteService, /Notes_note_fields_check/);
  assert.match(noteService, /Notes_add_note/);
  assert.match(noteService, /牌组ID/);
  assert.match(noteService, /EMPTY|DUPLICATE|MISSING_CLOZE|NOTETYPE_NOT_CLOZE|FIELD_NOT_CLOZE/);
  assert.match(notetypeService, /async 获取笔记类型名列表/);
  assert.match(notetypeService, /async 获取笔记类型/);
  assert.match(notetypeService, /Notetypes_get_notetype_names/);
  assert.match(notetypeService, /Notetypes_get_notetype/);
});

test('add note panel is presentation-only and preserves drafts until a successful save', () => {
  const panel = read('entry/src/main/ets/components/添加笔记面板.ets');
  assert.doesNotMatch(panel, /后端会话|笔记服务|笔记类型服务|\.run\(/);
  assert.match(panel, /@Prop fieldNames: string\[\]/);
  assert.match(panel, /ForEach\(this\.fieldNames/);
  assert.match(panel, /@State private fieldValues: string\[\]/);
  assert.match(panel, /add_note_advanced/);
  assert.match(panel, /tags/);
  assert.match(panel, /duplicate/);
  assert.match(panel, /onSave: \(fields: string\[\], tags: string\[\], notetypeId: number\)/);
  assert.match(panel, /onSaved/);
  assert.match(panel, /this\.fieldValues = this\.fieldNames\.map/);
});
