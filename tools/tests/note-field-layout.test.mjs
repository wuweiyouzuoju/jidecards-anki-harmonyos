// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { noteFieldModeTitleKey, noteFieldModeTool } from '../../entry/src/main/ets/model/NoteFieldEditing.ts';

const read = path => readFileSync(new URL('../../entry/src/main/ets/components/' + path, import.meta.url), 'utf8');

test('field headers and standalone rich inputs share a single compact mode toggle', () => {
  const card = read('editor/NoteFieldCard.ets');
  const editor = read('common/NoteFieldEditor.ets');
  const button = read('common/NoteFieldModeButton.ets');
  assert.match(card, /NoteFieldModeButton\(\{[\s\S]*?this\.toggleMode\(\)/);
  assert.match(card, /NoteFieldEditor\(\{[\s\S]*?modeControlInHeader: true/);
  assert.match(editor, /if \(!this\.modeControlInHeader\)[\s\S]*?NoteFieldModeButton\(\{[\s\S]*?this\.requestMode\(!this\.sourceMode\)/);
  for (const host of [card, editor]) {
    assert.equal((host.match(/NoteFieldModeButton\(\{/g) ?? []).length, 1);
    assert.doesNotMatch(host, /NoteFieldLayout|noteFieldModeTool\(/);
  }
  // 两个宿主按各自的当前模式取文案，按钮只负责外观；模式名称与 JIDE 观察共用同一工具定义。
  for (const host of [card, editor]) assert.match(host, /NoteFieldModeButton\(\{\s*label: \$r\('app\.string\.' \+ noteFieldModeTitleKey\(/);
  assert.match(button, /Button\(this\.label\)/);
  assert.equal(noteFieldModeTitleKey(true), noteFieldModeTool('source_edit').titleKey);
  assert.equal(noteFieldModeTitleKey(false), noteFieldModeTool('visual').titleKey);
  assert.notEqual(noteFieldModeTitleKey(true), noteFieldModeTitleKey(false));
  assert.match(button, /\.height\(32\)/);
});
