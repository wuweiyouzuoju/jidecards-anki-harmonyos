// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

test('small anchored menus share the restrained 150ms transition', () => {
  for (const path of [
    'entry/src/main/ets/components/主页操作面板.ets',
    'entry/src/main/ets/components/home/主页更多面板.ets',
    'entry/src/main/ets/components/settings/模式切换菜单.ets',
    'entry/src/main/ets/components/stats/统计范围切换菜单.ets',
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /取全屏转场时长|取全屏转场曲线/, path);
    assert.match(source, /TransitionEffect\.scale\(\{ x: 0\.98, y: 0\.98 \}\)/, path);
    assert.equal((source.match(/duration: 150/g) ?? []).length, 2, path);
    assert.equal((source.match(/curve: Curve\.EaseOut/g) ?? []).length, 2, path);
  }
});

test('dialogs enter gently and leave with opacity only', () => {
  for (const path of [
    'entry/src/main/ets/components/AnkiWeb引导对话框.ets',
    'entry/src/main/ets/components/云端牌组弹窗.ets',
  ]) {
    const source = read(path);
    const transition = source.slice(source.lastIndexOf('.transition(TransitionEffect.asymmetric('));
    assert.equal((transition.match(/TransitionEffect\.scale\(\{ x: 0\.96, y: 0\.96 \}\)/g) ?? []).length, 1, path);
    assert.match(transition, /TransitionEffect\.opacity\(0\)\s*\.animation\(\{ curve: 取全屏转场曲线\(\), duration: 取全屏转场时长\(\) \}\)\s*\)\)/, path);
  }
});

test('navigation applies one fade transition including the home boundary', () => {
  const home = read('entry/src/main/ets/pages/首页.ets');
  assert.doesNotMatch(home, /from\.index === -1 \|\| to\.index === -1/);
  assert.match(home, /const context: UIContext \| undefined = this\.getUIContext\(\)/);
  assert.match(home, /if \(context === undefined\) \{\s*transitionProxy\.finishTransition\(\);/);
  const fade = home.slice(home.indexOf('private 自定义转场回调('), home.indexOf('// @名称 页面映射'));
  assert.match(fade, /const 转场曲线: Curve = Curve\.EaseOut/);
  assert.match(fade, /expectedFrameRateRange: \{ min: 60, max: 120, expected: 60 \}/);
  assert.match(fade, /onFinish:[\s\S]*?transitionProxy\.finishTransition\(\)/);

  for (const [path, name] of [
    ['entry/src/main/ets/pages/设置页.ets', 'SettingsPage'],
    ['entry/src/main/ets/pages/统计页.ets', 'StatsPage'],
    ['entry/src/main/ets/pages/学习提醒页.ets', 'ReminderPage'],
    ['entry/src/main/ets/pages/浏览页.ets', 'BrowserPage'],
    ['entry/src/main/ets/pages/添加笔记页.ets', 'AddNotePage'],
    ['entry/src/main/ets/pages/学习页.ets', 'StudyPage'],
    ['entry/src/main/ets/pages/AI制卡页.ets', 'AiCardPage'],
  ]) {
    const source = read(path);
    assert.match(source, new RegExp(`注销NavParam\\('${name}'\\)`), path);
    assert.match(source, /this\.转场透明度 = isExit \? 1 : 0/);
    assert.match(source, /this\.转场透明度 = isExit \? 0 : 1/);
  }
});

test('press and disclosure feedback use the shared fast rhythm', () => {
  const batch = read('entry/src/main/ets/components/browser/批量操作栏.ets');
  assert.equal((batch.match(/\.animation\(\{ duration: 80, curve: Curve\.EaseOut \}\)/g) ?? []).length, 9);
  assert.match(batch, /backgroundColor\(\$r\('app\.color\.surface_card'\)\)[\s\S]*?opacity\(this\.已按下 === 8 \? 0\.82 : 1\)[\s\S]*?this\.已按下 = 8/);

  const info = read('entry/src/main/ets/components/browser/卡片信息.ets');
  assert.match(info, /DialogHeader\(\{/);
  const header = read('entry/src/main/ets/components/common/DialogHeader.ets');
  assert.match(header, /scale\(\{ x: this\.actionPressed[\s\S]*?\.animation\(\{ duration: 80, curve: Curve\.EaseOut \}\)/);

  const calendar = read('entry/src/main/ets/components/月历卡.ets');
  assert.equal((calendar.match(/duration: 150, curve: Curve\.EaseOut/g) ?? []).length, 1);
  assert.doesNotMatch(calendar, /duration: 300/);
  assert.doesNotMatch(calendar, /\.height\(this\.已折叠 \? 82 : this\.卡片高度\(\)\)\s*\.animation/);

  for (const path of [
    'entry/src/main/ets/components/高级牌组选项面板.ets',
    'entry/src/main/ets/components/设置面板.ets',
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /animateTo\(\{ duration: 150/);
  }
});

test('ArkWeb disclosure timing matches native disclosure timing', () => {
  const html = read('entry/src/main/ets/model/学习卡片HTML构建器.ets');
  assert.match(html, /transition: transform 150ms ease-out/);
  assert.doesNotMatch(html, /transition: max-height/);
  assert.match(html, /\.anki-collapsible\.expanded \{ max-height: none; \}/);
});
