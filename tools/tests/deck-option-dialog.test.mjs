// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { 牌组配置表单 } from '../../entry/src/main/ets/model/牌组配置表单.ets';
import { validateDeckOptionText } from '../../entry/src/main/ets/model/DeckOptionValidation.ets';
import { emptyDeckConfigSettings } from '../../entry/src/main/ets/proto/messages/DeckConfigMessages.ts';

const source = readFileSync(new URL('../../entry/src/main/ets/components/home/DeckOptionField.ets', import.meta.url), 'utf8');
const start = source.indexOf('export struct DeckOptionEditor');
const end = source.indexOf('  build() {', start);
const logic = source.slice(start, end).replace('export struct', 'class').replaceAll('@State ', '') + '}';
const Editor = new Function(stripTypeScriptTypes(logic, { mode: 'transform' }) + ';return DeckOptionEditor;')();

test('single-field validation reuses deck rules and does not change the active draft', () => {
  const config = emptyDeckConfigSettings();
  config.newPerDay = 20; config.reviewsPerDay = 200; config.learnSteps = [1, 10];
  const form = 牌组配置表单.从配置创建(config);
  form.每日复习数文本 = 'unfinished';
  assert.equal(validateDeckOptionText(form, 'newPerDay', '-1'), 'deck_limit_validation_error');
  assert.equal(validateDeckOptionText(form, 'newPerDay', '30'), '');
  assert.equal(validateDeckOptionText(form, 'learnSteps', '1 zero'), 'deck_learn_steps_validation_error');
  assert.equal(validateDeckOptionText(form, 'learnSteps', ''), '');
  assert.equal(validateDeckOptionText(form, 'secondsToShowAnswer', '-3'), 'deck_range_validation_error');
  assert.equal(validateDeckOptionText(form, 'secondsToShowAnswer', '1.5'), '');
  assert.equal(validateDeckOptionText(form, 'reviewLimit', ''), '');
  assert.equal(validateDeckOptionText(form, 'reviewLimit', '1.5'), 'deck_limit_validation_error');
  assert.equal(validateDeckOptionText(form, 'ignoreRevlogsBeforeDate', '2026-02-30'), 'deck_date_validation_error');
  assert.equal(form.每日新卡数文本, '20');
  assert.equal(form.每日复习数文本, 'unfinished');
  assert.equal(form.取配置().secondsToShowAnswer, 0);
});

test('dialog buffers edits, rejects invalid values, and confirms only valid changes', () => {
  const form = 牌组配置表单.从配置创建(emptyDeckConfigSettings());
  const editor = new Editor();
  let closes = 0;
  const commits = [];
  editor.initialValue = '20';
  editor.validate = value => validateDeckOptionText(form, 'newPerDay', value);
  editor.onConfirm = value => commits.push(value);
  editor.controller = { close: () => closes++ };
  editor.aboutToAppear();
  editor.draft = '-1';
  assert.deepEqual(commits, [], 'typing must not update the parent');
  editor.confirm();
  assert.equal(closes, 0);
  assert.equal(editor.error, 'deck_limit_validation_error');
  editor.draft = '30'; editor.confirm();
  assert.deepEqual(commits, ['30']);
  assert.equal(closes, 1);
  assert.match(source, /onClose:[^\n]*controller\?\.close\(\)/, 'cancel only closes the dialog');
});

test('enum selection remains a draft until confirmation and opening again reloads the current value', () => {
  const editor = new Editor();
  const commits = [];
  editor.onConfirm = value => commits.push(value);
  editor.initialValue = '2'; editor.aboutToAppear();
  editor.draft = '4';
  assert.deepEqual(commits, []);
  editor.confirm(); assert.deepEqual(commits, ['4']);
  const reopened = new Editor();
  reopened.initialValue = '4'; reopened.aboutToAppear();
  assert.equal(reopened.draft, '4');
});

test('both modes use shared field dialogs and complete mode reuses the same validation', () => {
  for (const name of ['牌组选项面板', '高级牌组选项面板']) {
    const panel = readFileSync(new URL(`../../entry/src/main/ets/components/${name}.ets`, import.meta.url), 'utf8');
    assert.match(panel, /DeckOptionField\(\{/);
    assert.doesNotMatch(panel, /\bSelect\(|\bTextInput\(|\bToggle\(/);
    assert.match(panel, /validateDeckOptionText\(this\.form/);
  }
  assert.match(source, /showHelp: true/);
  assert.match(source, /defaultValue: this.defaultValue/);
  assert.match(source, /aboutToDisappear\(\): void \{[\s\S]*?this.helpDialog\?\.close\(\)[\s\S]*?this.dialog\?\.close\(\)/);
});

test('opening help preserves the editor draft, validation error and confirmation boundary', () => {
  const editor = new Editor();
  let helps = 0, commits = 0;
  editor.initialValue = '20'; editor.aboutToAppear();
  editor.draft = 'unfinished'; editor.error = 'invalid';
  editor.onConfirm = () => { commits++; };
  editor.onHelp = () => { helps++; };
  editor.onHelp();
  assert.equal(helps, 1); assert.equal(commits, 0);
  assert.equal(editor.draft, 'unfinished'); assert.equal(editor.error, 'invalid');
});

test('simple and full mode keep distinct content and use the shared option-row implementation', () => {
  const read = path => readFileSync(new URL('../../entry/src/main/ets/components/' + path, import.meta.url), 'utf8');
  const panel = read('牌组选项面板.ets');
  assert.match(panel, /if \(this\.简洁模式\) \{\s*this\.commonOptions\(\)\s*\} else \{\s*this\.experimentalOptions\(\)/);
  const common = panel.slice(panel.indexOf('  private commonOptions()'), panel.indexOf('  private saveChoices()'));
  assert.doesNotMatch(common, /FsrsTools|高级牌组选项面板|presetOptions/);
  const full = read('高级牌组选项面板.ets');
  assert.match(full, /DeckOptionField\(\{/);
  const field = source.slice(source.indexOf('export struct DeckOptionField'));
  assert.match(field, /DeckOptionRow\(\{ title: this.title, summary: this.summary\(\), error: this.error, busy: this.busy/);
  assert.doesNotMatch(field, /DisclosureChevron\(|\bRow\(|fontSize/);
  const row = read('home/DeckOptionRow.ets');
  assert.match(row, /DisclosureChevron\(/);
  assert.match(row, /minHeight: 48/);
  assert.match(row, /Divider\(\)/);
  assert.doesNotMatch(row, /CustomDialogController/);
});
