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
  .replace(/@(Component|State|Prop|StorageProp|Watch)(?:\([^\n]*?\))?\s*/g, '')
  .replace('export struct 自定义学习对话框', 'class Dialog');
const defaults = { tags: [{ name: 'alpha', include: true, exclude: false }, { name: 'beta', include: false, exclude: true }],
  extendNew: 12, extendReview: 34, availableNew: 5, availableNewInChildren: 7, availableReview: 8, availableReviewInChildren: 0 };
function harness() {
  const calls = [], toasts = [], preferences = new Map(), commits=[], views=[];
  const scheduler = { 获取自定义学习默认值: async () => defaults,
    自定义学习: async (...args) => { calls.push(args); },
    customStudyByStateOrTags: async (...args) => { calls.push(args); } };
  const store = { read: (key, fallback) => preferences.get(key) ?? fallback,
    save: async (key, value) => { preferences.set(key, value); } };
  const dependencies = { appInterface:{observe:view=>views.push(view),leave:id=>views.push({leave:id})}, customStudyInitialValue, customStudyValueValid, isCustomStudyLimit,
    CustomStudyCardKind, 自定义学习预设, $r: key => key, THEME_TEXT_COLORS_KEY: '',
    颜色键: { 主色按钮背景: '' }, 调度器服务: class { constructor() { return scheduler; } },
    CustomStudyPreferences: class { constructor() { return store; } },
    resourceText: (_ctx, key, ...args) => [key, ...args].join(' '),
    AppStorage:{setOrCreate:key=>commits.push(key)},
    showToastSafely: (_ctx, { message }) => { toasts.push(message); } };
  const Dialog = new Function(...Object.keys(dependencies), stripTypeScriptTypes(logic, { mode: 'transform' }) + ';return Dialog;')(...Object.values(dependencies));
  const dialog = new Dialog();
  dialog.deckId = '123'; dialog.mounted = true; dialog.选中预设 = 2;
  dialog.getUIContext = () => ({});
  dialog.onSuccess = () => { calls.push('success'); };
  dialog.onClose = () => { calls.push('close'); };
  return { dialog, scheduler, store, calls, toasts, preferences, commits, views };
}

test('accepted custom study commits after disposal without toasts or parent callbacks',async()=>{
  const h=harness();await h.dialog.加载默认值();h.dialog.选中预设=5;h.dialog.输入值='1';
  let release;h.scheduler.自定义学习=()=>new Promise(r=>release=r);
  const work=h.dialog.执行提交();h.dialog.aboutToDisappear();release();await work;
  assert.deepEqual(h.calls,[]);assert.deepEqual(h.toasts,[]);assert.deepEqual(h.commits,['需要刷新主页']);
  await h.dialog.执行提交();assert.equal(h.commits.length,1);
});

test('custom study loads deck defaults and remembers day/count values without merging child counts', async () => {
  const h = harness();
  h.preferences.set(4, 7);
  await h.dialog.加载默认值();
  assert.equal(h.dialog.输入值, '20');
  h.dialog.切换预设(3); assert.equal(h.dialog.输入值, '20');
  h.dialog.切换预设(4); assert.equal(h.dialog.输入值, '7');
  h.dialog.切换预设(7); assert.equal(h.dialog.输入值, '20');
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
  assert.equal(h.preferences.get(2), -3);
});

test('zero defaults or available count do not block a positive new-card extension', async () => {
  for (const availableNew of [0, 12]) {
    const h = harness();
    h.scheduler.获取自定义学习默认值 = async () => ({ ...defaults, extendNew: 0, availableNew });
    await h.dialog.加载默认值();
    assert.equal(h.dialog.输入值, '20');
    assert.equal(h.dialog.可提交(), true);
    h.dialog.输入值 = '10';
    assert.equal(h.dialog.可提交(), true);
    await h.dialog.执行提交();
    assert.deepEqual(h.calls, [[123, 2, 10], 'success', 'close']);
    assert.equal(h.dialog.错误信息, '');
  }
});

test('custom study preference failure does not report the accepted creation as failed', async () => {
  const h = harness(); await h.dialog.加载默认值(); h.dialog.切换预设(5);
  h.store.save = async () => { throw Error('disk full'); };
  await h.dialog.执行提交();
  assert.equal(h.dialog.错误信息, '');
  assert.deepEqual(h.calls, [[123, 5, 20], 'success', 'close']);
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


test('detail shortcut selects the review preset before defaults arrive and publishes real form state', async()=>{
  const h=harness();h.dialog.mounted=false;h.dialog.initialPreset=自定义学习预设.复习上限增量;
  h.dialog.aboutToAppear();assert.equal(h.dialog.选中预设,自定义学习预设.复习上限增量);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.dialog.输入值,'20');h.dialog.publishInterface();
  const view=h.views.at(-1);assert.equal(view.surface,'custom_study');assert.equal(view.selectedId,'123');
  assert.equal(view.items.find(x=>x.id==='preset_'+自定义学习预设.复习上限增量).selected,true);
  assert.equal(view.items.find(x=>x.id==='confirm').enabled,true);
  h.dialog.处理中=true;h.dialog.publishInterface();
  assert.ok(h.views.at(-1).items.every(x=>x.enabled===false));
  h.dialog.aboutToDisappear();assert.equal(h.views.at(-2).leave,'custom_study');
});

test('all presets retain independent successful values and JIDE observes the real remembered input',async()=>{
 const h=harness();h.preferences.set(2,-8);h.preferences.set(3,42);await h.dialog.加载默认值();
 assert.equal(h.dialog.输入值,'-8');h.dialog.切换预设(3);assert.equal(h.dialog.输入值,'42');
 h.dialog.publishInterface();assert.equal(h.views.at(-1).values.find(value=>value.id==='value').value,'42');
 for(const preset of [4,5,6,7]){h.dialog.切换预设(preset);assert.equal(h.dialog.输入值,'20');}
 h.dialog.切换预设(3);h.dialog.输入值='31';await h.dialog.执行提交();assert.equal(h.preferences.get(3),31);
 h.dialog.mounted=true;await h.dialog.加载默认值();assert.equal(h.dialog.输入值,'31');
});
