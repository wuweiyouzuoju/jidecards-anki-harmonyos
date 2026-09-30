// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { noteTypeDisplayKey, noteFieldDisplayKey } from '../../entry/src/main/ets/model/NoteTypePresentation.ts';
import { NoteTypeCatalog } from '../../entry/src/main/ets/model/NoteTypeCatalog.ts';
import { NoteEditorSession } from '../../entry/src/main/ets/model/NoteEditorSession.ts';
import { loadPlatformModule } from './platform-module-harness.mjs';
import { loadUiFeedback } from './ui-feedback-harness.mjs';

const resources = locale => Object.fromEntries(JSON.parse(readFileSync(
  new URL(`../../entry/src/main/resources/${locale}/element/string.json`, import.meta.url), 'utf8')).string.map(r => [r.name, r.value]));
const api = loadPlatformModule('utils/NoteTypeText.ets', '{ noteTypeText, noteFieldText }', {
  noteTypeDisplayKey, noteFieldDisplayKey, namedResourceText: loadUiFeedback().namedResourceText
});
const context = strings => ({ getHostContext: () => ({ resourceManager: { getStringByNameSync: key => {
  assert.ok(Object.hasOwn(strings, key), key); return strings[key];
} } }) });

test('all stock type aliases use actual Chinese/English resources without mutating source names', () => {
  const cn = resources('base'), en = resources('en_US');
  const groups = [NoteTypeCatalog.Basic笔记类型名集合, NoteTypeCatalog.填空笔记类型名集合,
    NoteTypeCatalog.图片遮盖笔记类型名集合, NoteTypeCatalog.Basic输入答案笔记类型名集合,
    NoteTypeCatalog.Basic反转笔记类型名集合, NoteTypeCatalog.Basic可选反转笔记类型名集合];
  for (const names of groups) {
    const original = names.slice();
    for (const name of names) {
      const key = noteTypeDisplayKey(name);
      assert.ok(key);
      assert.equal(api.noteTypeText(context(cn), name), cn[key]);
      assert.equal(api.noteTypeText(context(en), name), en[key]);
      assert.doesNotMatch(api.noteTypeText(context(en), name), /\p{Script=Han}/u);
    }
    assert.deepEqual(names, original);
  }
  for (const name of ['4000Book1', '我的问答题', 'Basic copy', '问答题 2', '']) {
    assert.equal(api.noteTypeText(context(en), name), name);
  }
});

test('stock fields and formatted placeholders follow current language while custom schema stays intact', () => {
  const en = resources('en_US'), cn = resources('base');
  let current = en;
  const ctx = { getHostContext: () => ({ resourceManager: {
    getStringByNameSync: key => current[key],
    getStringSync: (key, name) => current[key].replace('%s', name)
  } }) };
  const expected = [[1, '正面', 'Front'], [4, '背面', 'Back'], [3, '增加翻转的卡片', 'Add reverse'],
    [5, '文字', 'Text'], [5, '背面额外', 'Back extra'], [6, '标题', 'Header'],
    [6, '背面額外內容', 'Back extra'], [6, '图片', 'Image'], [6, '遮盖', 'Occlusion']];
  for (const [kind, name, value] of expected) assert.equal(api.noteFieldText(ctx, name, kind), value);
  assert.equal(loadUiFeedback().resourceText(ctx, { id: 'note_editor_field_placeholder' },
    api.noteFieldText(ctx, '背面', 1)), 'Enter Back');
  current = cn;
  assert.equal(api.noteFieldText(ctx, 'Back', 1), '背面');
  current = en;
  for (const [name, kind] of [['正面', 0], ['正面', 5], ['文字', 1], ['我的题面', 1], ['标题', 99]]) {
    assert.equal(api.noteFieldText(ctx, name, kind), name);
  }
});

test('editor keeps Core field identity through loading, failed saves and reset', async () => {
  let state;
  const note = { id: 1, guid: 'g', notetypeId: 2, mtimeSecs: 0, usn: 0, fields: ['Q', 'A'], tags: [] };
  const names = ['正面', '背面'];
  const session = new NoteEditorSession({ note: async () => note,
    notetype: async () => ({ fieldNames: names, originalStockKind: 1 }) }, value => { state = value; });
  await session.open(1, true, () => true);
  assert.equal(state.originalStockKind, 1);
  assert.deepEqual(state.fieldNames, names);
  assert.notEqual(state.fieldNames, names);
  await session.save(['New Q', 'A'], [], async updated => {
    assert.equal(state.originalStockKind, 1);
    assert.equal(updated.notetypeId, 2);
    return false;
  });
  assert.equal(state.originalStockKind, 1);
  assert.deepEqual(state.fieldNames, names);
  session.close(); assert.equal(state.originalStockKind, 0);
});

test('type selectors and field cards cannot bypass the shared display boundary', () => {
  const root = new URL('../../entry/src/main/ets/', import.meta.url);
  for (const path of readdirSync(root, { recursive: true }).filter(path => path.endsWith('.ets'))) {
    const source = readFileSync(new URL(path.replaceAll('\\', '/'), root), 'utf8');
    assert.doesNotMatch(source, /(?:value:|return|Text\()\s*(?:笔记类型|类型)\.name\s*[;})]/, path);
    if (source.includes('NoteFieldCard({')) assert.match(source, /originalStockKind:\s*this\./, path);
  }
  const card = readFileSync(new URL('components/common/NoteFieldCard.ets', root), 'utf8');
  assert.match(card, /Text\(noteFieldText\(/);
  assert.match(card, /fieldName: noteFieldText\(/);
});
