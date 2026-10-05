// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { appInterfaceDependencies, studyInterfaceMethods } from './app-interface-harness.mjs';
import { BURY_SUSPEND_MODE_BURY_USER, BURY_SUSPEND_MODE_SUSPEND } from '../../entry/src/main/ets/proto/messages/SchedulerMessages.ts';
import { CARD_FLAGS, customFlagLabel } from '../../entry/src/main/ets/model/CardMarking.ts';

const source = readFileSync(new URL('../../entry/src/main/ets/pages/学习页.ets', import.meta.url), 'utf8');
const menuStart = source.indexOf('  private 更多菜单(');
assert.ok(menuStart >= 0);
const menuEnd = source.indexOf('\n  }', menuStart) + 4;
const menuSource = source.slice(menuStart, menuEnd);
const context = vm.createContext({ ...appInterfaceDependencies(), CARD_FLAGS, customFlagLabel,
  $r: key => key, BURY_SUSPEND_MODE_BURY_USER, BURY_SUSPEND_MODE_SUSPEND });
const flagStart = source.indexOf('  private flagMenuItems(');
const flagSource = source.slice(flagStart, source.indexOf('\n  }', flagStart) + 4);
vm.runInContext(stripTypeScriptTypes('globalThis.Page = class {' + studyInterfaceMethods(source) + '}'), context);

test('review menu exposes bury and suspend on both card faces and dispatches the correct mode', () => {
  for (const phase of ['question', 'answer']) {
    const calls = [];
    const page = Object.assign(new context.Page(), {
      flagLabels: {}, 阶段: phase, 评分中: false, 当前卡片: {}, 可撤销: false,
      choiceQuestion: null, choiceAutoAdvanceSeconds: () => 5,
      studyOptions: { secondsToShowQuestion: 0, secondsToShowAnswer: 0 },
      getUIContext: () => ({}), 取文案: key => key, 埋藏或暂停当前卡: mode => calls.push(mode)
    });
    const menu = page.更多菜单().find(item => item.value === 'app.string.study_card_actions_title').children;
    for (const key of ['study_bury', 'study_suspend']) {
      const action = menu.find(item => item.value === `app.string.${key}`);
      assert.equal(action.enabled, true);
      action.action();
    }
    assert.deepEqual(calls, [BURY_SUSPEND_MODE_BURY_USER, BURY_SUSPEND_MODE_SUSPEND]);
    for (const state of [{ 评分中: true }, { 当前卡片: null }, { 阶段: 'loading' }, { 阶段: 'done' }, { 阶段: 'error' }]) {
      const disabled = Object.assign(new context.Page(), page, state).更多菜单()
        .find(item => item.value === 'app.string.study_card_actions_title').children;
      assert.equal(disabled.find(item => item.value === 'app.string.study_bury').enabled, false);
      assert.equal(disabled.find(item => item.value === 'app.string.study_suspend').enabled, false);
    }
  }
});

test('menu catalog declares both child levels and every study entry has a distinct action icon', () => {
  const page = Object.assign(new context.Page(), { flagLabels: {}, 阶段: 'question', 当前卡片: {}, 评分中: false,
    Agent入口已启用: true, 有音频: true, 可撤销: true, currentMarking: { marked: false }, getUIContext: () => ({}) });
  const menu = page.更多菜单();
  const marking = menu.find(item => item.value === 'app.string.study_marking_title');
  const actions = menu.find(item => item.value === 'app.string.study_card_actions_title');
  assert.deepEqual(Array.from(marking.children, item => item.value),
    ['card_mark_mark', 'browser_action_set_flag', 'card_mark_flag_names'].map(key => 'app.string.' + key));
  assert.deepEqual(Array.from(actions.children, item => item.value),
    ['study_bury', 'study_suspend', 'study_delete_card', 'study_auto_advance_title'].map(key => 'app.string.' + key));
  const entries = menu.flatMap(item => [item, ...(item.children ?? [])]);
  assert.ok(entries.every(item => item.icon?.startsWith('app.media.ic_study_')));
  assert.equal(new Set(entries.map(item => item.icon)).size, entries.length);
  assert.equal(menu[0].icon, 'app.media.ic_study_edit');
  page.currentMarking.marked = true;
  const starred = page.更多菜单().find(item => item.value === marking.value).children[0];
  assert.equal(starred.value, 'app.string.card_mark_unmark');
  assert.equal(starred.icon, 'app.media.ic_study_mark');
  assert.equal(starred.selected, true);
});

test('flag popup has all seven colors and clear, keeps custom labels and dispatches exactly the chosen flag', () => {
  const calls = [];
  const page = Object.assign(new context.Page(), { 评分中: false, currentMarking: { flag: 7 },
    flagLabels: { '2': 'custom orange' }, getUIContext: () => ({}), changeMarking: flag => calls.push(flag) });
  const options = page.flagMenuItems();
  assert.equal(options.length, 8);
  assert.equal(options[2].value, 'custom orange');
  assert.equal(options[0].icon, 'app.media.ic_study_flag_clear');
  assert.equal(options[0].selectionUsesAccent, false);
  assert.equal(options[0].iconTint, undefined);
  assert.ok(options.slice(1).every(item => item.selectionUsesAccent === true));
  assert.equal(options[7].iconTint, '#40' + CARD_FLAGS[7].color.slice(-6));
  assert.deepEqual(Array.from(options, item => item.selected), [false,false,false,false,false,false,false,true]);
  options[0].action(); options[7].action();
  assert.deepEqual(calls, [0,7]);
  page.currentMarking.flag = 0;
  assert.equal(page.flagMenuItems()[0].selected, true, 'neutral styling must preserve the actual selected flag');
  page.评分中 = true;
  assert.ok(page.flagMenuItems().every(item => item.enabled === false));
});

test('fixed bottom bar contains only show-answer and the four ratings', () => {
  const bar = source.slice(source.indexOf('  private 答案条()'), source.indexOf('\n  build()'));
  assert.doesNotMatch(bar, /study_bury|study_suspend|埋藏或暂停当前卡/);
  assert.match(bar, /study_show_answer/);
  assert.equal((bar.match(/StudyActionButton\(/g) ?? []).length, 4);
});
