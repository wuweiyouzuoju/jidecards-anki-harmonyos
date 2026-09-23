// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { BURY_SUSPEND_MODE_BURY_USER, BURY_SUSPEND_MODE_SUSPEND } from '../../entry/src/main/ets/proto/messages/SchedulerMessages.ts';

const source = readFileSync(new URL('../../entry/src/main/ets/pages/学习页.ets', import.meta.url), 'utf8');
const menuStart = source.indexOf('  private 更多菜单(): MenuElement[] {');
const menuEnd = source.indexOf('\n  }', menuStart) + 4;
const menuSource = source.slice(menuStart, menuEnd).replace('private 更多菜单', 'function buildMenu');
const context = vm.createContext({ $r: key => key, BURY_SUSPEND_MODE_BURY_USER, BURY_SUSPEND_MODE_SUSPEND });
vm.runInContext(stripTypeScriptTypes(menuSource), context);

test('review menu exposes bury and suspend on both card faces and dispatches the correct mode', () => {
  for (const phase of ['question', 'answer']) {
    const calls = [];
    const page = {
      阶段: phase, 评分中: false, 当前卡片: {}, 可撤销: false,
      choiceQuestion: null, choiceAutoAdvanceSeconds: () => 5,
      studyOptions: { secondsToShowQuestion: 0, secondsToShowAnswer: 0 },
      取文案: key => key, 埋藏或暂停当前卡: mode => calls.push(mode)
    };
    const menu = context.buildMenu.call(page);
    for (const key of ['study_bury', 'study_suspend']) {
      const action = menu.find(item => item.value === `app.string.${key}`);
      assert.equal(action.enabled, true);
      action.action();
    }
    assert.deepEqual(calls, [BURY_SUSPEND_MODE_BURY_USER, BURY_SUSPEND_MODE_SUSPEND]);
    for (const state of [{ 评分中: true }, { 当前卡片: null }, { 阶段: 'loading' }, { 阶段: 'done' }, { 阶段: 'error' }]) {
      const disabled = context.buildMenu.call({ ...page, ...state });
      assert.equal(disabled.find(item => item.value === 'app.string.study_bury').enabled, false);
      assert.equal(disabled.find(item => item.value === 'app.string.study_suspend').enabled, false);
    }
  }
});

test('fixed bottom bar contains only show-answer and the four ratings', () => {
  const bar = source.slice(source.indexOf('  private 答案条()'), source.indexOf('\n  build()'));
  assert.doesNotMatch(bar, /study_bury|study_suspend|埋藏或暂停当前卡/);
  assert.match(bar, /study_show_answer/);
  assert.equal((bar.match(/StudyActionButton\(/g) ?? []).length, 4);
});
