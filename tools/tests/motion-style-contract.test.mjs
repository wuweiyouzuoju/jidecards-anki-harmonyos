// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadPlatformModule } from './platform-module-harness.mjs';
import { motionApi, surfaceMotionApi } from './motion-harness.mjs';

function read(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

test('small anchored menus share the restrained 150ms transition', () => {
  const effect = (kind, value) => ({ kind, value,
    combine(other) { this.combined = other; return this; },
    animation(options) { this.options = options; return this; }
  });
  const MenuSurface = loadPlatformModule('components/common/MenuSurface.ets', 'MenuSurface', {
    ...motionApi(),
    TransitionEffect: { opacity: value => effect('opacity', value), scale: value => effect('scale', value),
      asymmetric: (enter, exit) => ({ enter, exit }) }, Curve: { EaseOut: 'ease-out' }
  });
  const transition = MenuSurface.popupTransition();
  assert.equal(transition.enter.kind, 'opacity'); assert.equal(transition.enter.value, 0);
  assert.deepEqual(transition.enter.combined.value, { x: 0.98, y: 0.98, centerX: '50%', centerY: '50%' });
  assert.equal(transition.exit.kind, 'opacity'); assert.equal(transition.exit.value, 0);
  assert.equal(transition.exit.combined, undefined, 'closing only fades');
  for (const branch of [transition.enter, transition.exit]) {
    assert.deepEqual(branch.options, { duration: 150, curve: 'ease-out' });
  }
  for (const [x, y] of [['0%', '0%'], ['100%', '0%'], ['100%', 88]]) {
    const anchored = MenuSurface.popupTransition(x, y);
    assert.deepEqual(anchored.enter.combined.value, { x: 0.98, y: 0.98, centerX: x, centerY: y });
    assert.equal(anchored.exit.combined, undefined, 'closing does not scale or move the anchor');
  }
  assert.match(read('entry/src/main/ets/components/common/AnchoredMenu.ets'),
    /\.transition\(MenuSurface\.popupTransition\(this\.bubble === undefined \? this\.alignEnd \? '100%' : '0%' :/);
  const cardMenu = read('entry/src/main/ets/components/common/CardActionMenu.ets');
  assert.doesNotMatch(cardMenu, /animateTo\(|TransitionEffect\.opacity/,
    'branch/state changes must not animate measured geometry or replay individual row entrances');
  assert.match(cardMenu, /\.transition\(MenuSurface\.popupTransition\(this\.groupsOnRight\(\) \? '0%' : '100%', this\.placements\(\)\[groupIndex\]\.pointerCenter\)\)/);
  assert.match(read('entry/src/main/ets/components/common/MenuBubbleSurface.ets'), /actionMenuBubbleOutline\(/);
  for (const path of ['entry/src/main/ets/components/牌组列表项.ets',
    'entry/src/main/ets/components/home/HomeSummaryHeader.ets', 'entry/src/main/ets/components/牌组详情面板.ets', 'entry/src/main/ets/components/home/HomeDeckDetails.ets']) {
    const source = read(path);
    const arrows = (source.match(/enableArrow: true/g) ?? []).length;
    assert.equal((source.match(/arrowWidth: MenuSurface.pointerSpan/g) ?? []).length, arrows, path);
    assert.equal((source.match(/arrowHeight: MenuSurface.pointerDepth/g) ?? []).length, arrows, path);
    assert.equal((source.match(/transition: MenuSurface.popupTransition\(\)/g) ?? []).length, arrows, path);
  }
  for (const path of [
    'entry/src/main/ets/components/settings/模式切换菜单.ets',
    'entry/src/main/ets/components/browser/BrowserMoreMenu.ets',
    'entry/src/main/ets/components/common/CardActionMenu.ets',
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /取全屏转场时长|取全屏转场曲线/, path);
    assert.match(source, /(?:AnchoredMenu|CardActionMenu)\(\{/, path);
  }
});

test('browser view confirmation delegates both surface transitions to the shared dialog owner', () => {
  const source = read('entry/src/main/ets/components/browser/BrowserViewMenu.ets');
  assert.match(source, /DialogFrame\(\{/);
  assert.doesNotMatch(source, /(?:AnchoredMenu|CardActionMenu)\(\{|\.transition\(|取全屏转场时长|取全屏转场曲线/,
    'the confirmation dialog must not add a menu or local surface animation');
  const frame = read('entry/src/main/ets/components/common/DialogFrame.ets');
  assert.match(frame, /\.transition\(this\.nativeHost \? TransitionEffect\.IDENTITY : SurfaceTransition\.dialog\(\)\)/);
  assert.match(frame, /\.transition\(this\.nativeHost \? TransitionEffect\.IDENTITY : SurfaceTransition\.backdrop\(\)\)/);
  const { SurfaceTransition } = surfaceMotionApi();
  const transition = SurfaceTransition.dialog();
  assert.equal(transition.enter.kind, 'opacity');
  assert.equal(transition.enter.combined.kind, 'scale');
  const backdrop = SurfaceTransition.backdrop();
  assert.equal(transition.exit.value, backdrop.value);
  assert.deepEqual(transition.exit.options, backdrop.options);
  assert.equal(transition.exit.kind, 'opacity');
  assert.equal(transition.exit.combined, undefined, 'closing preserves the opacity-only dialog contract');
});

test('dialogs enter gently and leave with opacity only', () => {
  for (const path of [
    'entry/src/main/ets/components/AnkiWeb引导对话框.ets',
    'entry/src/main/ets/components/云端牌组弹窗.ets',
  ]) {
    const source = read(path);
    assert.match(source, /\.transition\(SurfaceTransition\.dialog\(\)\)/, path);
    assert.match(source, /\.transition\(SurfaceTransition\.backdrop\(\)\)/, path);
    assert.doesNotMatch(source, /TransitionEffect\.scale|TransitionEffect\.asymmetric/, path);
  }
});

test('navigation applies one fade transition including the home boundary', () => {
  const home = read('entry/src/main/ets/utils/HomeNavigationTransition.ets');
  assert.doesNotMatch(home, /from\.index === -1 \|\| to\.index === -1/);
  assert.match(home, /const context: UIContext \| undefined = this\.host\.getUIContext\(\)/);
  assert.match(home, /if \(context === undefined\) \{\s*showDestination\(\);\s*finishTransition\(\);/);
  assert.match(home, /const animation: AnimateParam = SurfaceTransition\.pageAnimation\(\)/);
  assert.match(home, /animation\.onFinish =[\s\S]*?finishTransition\(\)/);
  assert.match(home, /context\.animateTo\(animation, showDestination\)/);

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

test('plain buttons share PressFeedback without a second touch animation', () => {
  const batch = read('entry/src/main/ets/components/browser/批量操作栏.ets');
  assert.match(batch, /CardActionMenu\(/);
  assert.doesNotMatch(batch, /onTouch\(|已按下|\.animation\(/);
  const menuItem = read('entry/src/main/ets/components/common/MenuItem.ets');
  assert.match(menuItem, /\.enabled\(this.available\)/);
  assert.match(menuItem, /new PressFeedback\(/);
  const info = read('entry/src/main/ets/components/browser/卡片信息.ets');
  assert.match(info, /DialogHeader\(\{/);
  const header = read('entry/src/main/ets/components/common/DialogHeader.ets');
  assert.doesNotMatch(header, /onTouch\(|actionPressed|\.scale\(|\.animation\(/);

  for (const path of [
    'entry/src/main/ets/components/高级牌组选项面板.ets',
    'entry/src/main/ets/components/设置面板.ets',
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /animateTo\(\{ duration: 150/);
  }
});

test('ArkWeb disclosure timing matches native disclosure timing', () => {
  const html = read('entry/src/main/ets/model/学习卡片HTML构建器.ts');
  assert.match(html, /transition: transform 150ms ease-out/);
  assert.doesNotMatch(html, /transition: max-height/);
  assert.match(html, /\.anki-collapsible\.expanded \{ max-height: none; \}/);
});
