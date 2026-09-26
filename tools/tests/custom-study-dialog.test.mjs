// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { customStudyInitialValue, customStudyValueValid, isCustomStudyLimit } from '../../entry/src/main/ets/model/CustomStudyOptions.ts';
import { CustomStudyCardKind, 自定义学习预设 } from '../../entry/src/main/ets/proto/messages/SchedulerMessages.ts';

const source = readFileSync(new URL('../../entry/src/main/ets/components/home/自定义学习对话框.ets', import.meta.url), 'utf8');
const logic = (source.slice(0, source.indexOf('  @Builder')) + '\n}')
  .replace(/^import[^;]+;\s*/gm, '')
  .replace(/@(Component|State|Prop|StorageProp)(?:\([^\n]*?\))?\s*/g, '')
  .replace('export struct 自定义学习对话框', 'class Dialog');
const defaults = { tags: [{ name: 'alpha', include: true, exclude: false }, { name: 'beta', include: false, exclude: true }],
  extendNew: 12, extendReview: 34, availableNew: 5, availableNewInChildren: 7, availableReview: 8, availableReviewInChildren: 0 };
function harness() {
  const calls = [], toasts = [], preferences = new Map();
  const scheduler = { 获取自定义学习默认值: async () => defaults,
    自定义学习: async (...args) => { calls.push(args); },
    customStudyByStateOrTags: async (...args) => { calls.push(args); } };
  const store = { read: (key, fallback) => preferences.get(key) ?? fallback,
    save: async (key, value) => { preferences.set(key, value); } };
  const dependencies = { customStudyInitialValue, customStudyValueValid, isCustomStudyLimit,
    CustomStudyCardKind, 自定义学习预设, $r: key => key, THEME_TEXT_COLORS_KEY: '',
    颜色键: { 主色按钮背景: '' }, 调度器服务: class { constructor() { return scheduler; } },
    CustomStudyPreferences: class { constructor() { return store; } },
    resourceText: (_ctx, key, ...args) => [key, ...args].join(' '),
    showToastSafely: (_ctx, { message }) => { toasts.push(message); } };
  const Dialog = new Function(...Object.keys(dependencies), stripTypeScriptTypes(logic, { mode: 'transform' }) + ';return Dialog;')(...Object.values(dependencies));
  const dialog = new Dialog();
  dialog.deckId = '123'; dialog.mounted = true; dialog.选中预设 = 2;
  dialog.getUIContext = () => ({});
  dialog.onSuccess = () => { calls.push('success'); };
  dialog.onClose = () => { calls.push('close'); };
  return { dialog, scheduler, store, calls, toasts, preferences };
}

test('custom study loads deck defaults and remembers day/count values without merging child counts', async () => {
  const h = harness();
  h.preferences.set(4, 7);
  await h.dialog.加载默认值();
  assert.equal(h.dialog.输入值, '12');
  h.dialog.切换预设(3); assert.equal(h.dialog.输入值, '34');
  h.dialog.切换预设(4); assert.equal(h.dialog.输入值, '7');
  h.dialog.切换预设(7); assert.equal(h.dialog.输入值, '100');
  assert.match(h.dialog.availableCount(true), /available_new 5 .*child_count 7/);
});

test('custom study tags switch between include, exclude and unrestricted', async () => {
  const { dialog } = harness(); await dialog.加载默认值();
  dialog.setTagSelection('alpha', 2);
  assert.deepEqual(dialog.includedTags, []);
  assert.deepEqual(dialog.excludedTags, ['beta', 'alpha']);
  dialog.setTagSelection('alpha', 0);
  assert.deepEqual(dialog.excludedTags, ['beta']);
  dialog.setTagSelection('beta', 1);
  assert.deepEqual(dialog.includedTags, ['beta']);
  assert.deepEqual(dialog.excludedTags, []);
});

test('custom study submits the selected state and tags through Core', async () => {
  const h = harness(); await h.dialog.加载默认值(); h.dialog.切换预设(7);
  h.dialog.cardKindIndex = 1; h.dialog.输入值 = '25';
  await h.dialog.执行提交();
  assert.deepEqual(h.calls, [[123, { kind: 0, cardLimit: 25, tagsToInclude: ['alpha'], tagsToExclude: ['beta'] }], 'success', 'close']);
  assert.equal(h.preferences.get(7), 25);
});

test('custom study accepts negative limit deltas and rejects decimal/zero input', async () => {
  const h = harness(); await h.dialog.加载默认值();
  for (const text of ['0', '1.5']) { h.dialog.输入值 = text; await h.dialog.执行提交(); }
  assert.deepEqual(h.calls, []);
  h.dialog.输入值 = '-3'; await h.dialog.执行提交();
  assert.deepEqual(h.calls[0], [123, 2, -3]);
  assert.equal(h.preferences.size, 0);
});

test('custom study preference failure does not report the accepted creation as failed', async () => {
  const h = harness(); await h.dialog.加载默认值(); h.dialog.切换预设(5);
  h.store.save = async () => { throw Error('disk full'); };
  await h.dialog.执行提交();
  assert.equal(h.dialog.错误信息, '');
  assert.deepEqual(h.calls, [[123, 5, 1], 'success', 'close']);
  assert.deepEqual(h.toasts, ['app.string.custom_study_preferences_error']);
});

test('custom study ignores defaults arriving after the dialog closes and exposes read failure', async () => {
  const h = harness(); let finish;
  h.scheduler.获取自定义学习默认值 = () => new Promise(resolve => { finish = resolve; });
  const pending = h.dialog.加载默认值(); h.dialog.aboutToDisappear(); finish(defaults); await pending;
  assert.equal(h.dialog.默认值, null);
  const failed = harness(); failed.store.read = () => { throw Error('preferences unavailable'); };
  await failed.dialog.加载默认值();
  assert.match(failed.dialog.错误信息, /preferences unavailable/);
  assert.equal(failed.dialog.可提交(), false);
});
