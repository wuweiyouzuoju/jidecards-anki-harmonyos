// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { stripTypeScriptTypes } from 'node:module';
import * as catalog from '../../entry/src/main/ets/model/ThemeCatalog.ts';
import * as style from '../../entry/src/main/ets/model/ThemeBackgroundMotion.ts';

test('all cloud textures have fully transparent borders and contain no opaque rectangle', () => {
  for (let image = 0; image < 3; image++) {
    const png = readFileSync(new URL(`../../entry/src/main/resources/rawfile/themes/iridescent_cloud_${image}.png`, import.meta.url));
    assert.equal(png.readUInt32BE(16), 256);
    assert.equal(png.readUInt32BE(20), 256);
    assert.equal(png[25], 6, 'RGBA is mandatory');
    const chunks = [];
    for (let offset = 8; offset < png.length;) {
      const length = png.readUInt32BE(offset);
      if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length));
      offset += length + 12;
    }
    const pixels = inflateSync(Buffer.concat(chunks));
    let visible = 0;
    for (let y = 0; y < 256; y++) {
      assert.equal(pixels[y * 1025], 0);
      for (let x = 0; x < 256; x++) {
        const offset = y * 1025 + 1 + x * 4;
        const alpha = pixels[offset + 3];
        if (x <= 8 || x >= 247 || y <= 8 || y >= 247) assert.equal(alpha, 0, 'transparent sampling margin');
        assert.ok(alpha < 255);
        if (alpha > 0) visible++;
      }
    }
    assert.ok(visible > 10000 && visible < 60000, 'cloud has soft coverage, not a solid rectangle');
  }
});

/** 执行真实组件的生命周期方法，用合成动画记录器替代设备渲染。 */
function createBackground() {
  let now = 10000;
  const animations = [];
  const context = { animateTo: (options, update) => { animations.push(options); update(); } };
  const source = readFileSync(new URL('../../entry/src/main/ets/components/common/ThemeBackground.ets', import.meta.url), 'utf8');
  const methods = source.slice(0, source.indexOf('  build() {'))
    .replace(/^import\s[\s\S]*?;\s*$/gm, '')
    .replace('@Component', '')
    .replace('export struct ThemeBackground', 'class ThemeBackground')
    .replace(/@(Prop|State|StorageProp|Watch)(?:\([^)]*\))?\s*/g, '');
  const js = stripTypeScriptTypes(methods + '\ngetUIContext() { return context; }\n}', { mode: 'transform' });
  const values = { ...style, ...catalog, context, Curve: { EaseInOut: 'ease-in-out' }, Date: { now: () => now } };
  const background = new Function(...Object.keys(values), js + '\nreturn new ThemeBackground();')(...Object.values(values));
  Object.assign(background, { mounted: true, visible: true, visual: catalog.themeDefinition('iridescent'), foreground: true });
  return { background, animations, advance: ms => { now += ms; } };
}

test('visibility notifications do not restart animations and stale completions cannot revive a paused background', () => {
  const { background, animations, advance } = createBackground();
  background.updatePlayback();
  assert.equal(animations.length, 1);
  const first = animations[0];
  const from = background.fromPoses;
  const to = background.toPoses;
  background.updatePlayback();
  background.updatePlayback();
  assert.equal(animations.length, 1);
  advance(3000);
  background.foreground = false;
  background.updatePlayback();
  assert.equal(animations[1].duration, 0);
  assert.deepEqual(background.poses, style.sampleThemeBackgroundPoses(from, to, 3000));
  first.onFinish();
  assert.equal(animations.length, 2);
  const frozen = background.poses;
  background.foreground = true;
  background.updatePlayback();
  assert.deepEqual(background.fromPoses, frozen);
  assert.equal(animations.length, 3);
  background.aboutToDisappear();
  animations[2].onFinish();
  assert.equal(animations.length, 3);
});

test('each completed cycle submits only one new target, while disabling motion freezes the scene', () => {
  const { background, animations, advance } = createBackground();
  background.updatePlayback();
  assert.equal(animations[0].duration, 6000, 'lower frame budget preserves the existing motion speed');
  assert.deepEqual(animations[0].expectedFrameRateRange, { min: 15, max: 30, expected: 30 });
  advance(6000);
  animations[0].onFinish();
  assert.equal(animations.length, 2);
  assert.deepEqual(animations[1].expectedFrameRateRange, animations[0].expectedFrameRateRange);
  background.motion = false;
  background.updatePlayback();
  assert.equal(animations.length, 3);
  animations[1].onFinish();
  background.updatePlayback();
  assert.equal(animations.length, 3);
});

test('theme configuration changes preserve elapsed position and adopt the next cycle duration', () => {
  const { background, animations, advance } = createBackground();
  background.updatePlayback();
  const from = background.fromPoses;
  const to = background.toPoses;
  advance(3000);
  background.visual = { ...background.visual, backgroundCycleMs: 12000 };
  background.updatePlayback();
  assert.equal(animations.length, 1, 'configuration refresh must not restart an active animation');
  background.motion = false;
  background.updatePlayback();
  assert.deepEqual(background.poses, style.sampleThemeBackgroundPoses(from, to, 3000));
  background.motion = true;
  background.updatePlayback();
  assert.equal(animations.at(-1).duration, 12000);
});

/** 执行首页实际转场协议，模拟 @Prop 的更新通知。 */
function createNavigation(background) {
  const pages = new Map();
  const callbacks = new Map();
  const registry = {
    注册NavParam: (name, start, end) => callbacks.set(name, { start, end }),
    取起点回调: name => callbacks.get(name)?.start ?? null,
    取终点回调: name => callbacks.get(name)?.end ?? null,
  };
  // 使用页面实际注册回调；这里只替换平台动画，不复制生产透明度规则。
  for (const [file, name] of [['设置页', 'SettingsPage'], ['浏览页', 'BrowserPage'], ['学习页', 'StudyPage']]) {
    const pageSource = readFileSync(new URL(`../../entry/src/main/ets/pages/${file}.ets`, import.meta.url), 'utf8');
    const begin = pageSource.indexOf('CustomTransition.getInstance().注册NavParam(');
    const registration = pageSource.slice(begin, pageSource.indexOf('\n    );', begin) + 7);
    const page = { 转场透明度: 1 };
    const register = new Function('CustomTransition', stripTypeScriptTypes(registration, { mode: 'transform' }));
    register.call(page, { getInstance: () => registry });
    pages.set(name, page);
  }
  const source = readFileSync(new URL('../../entry/src/main/ets/pages/首页.ets', import.meta.url), 'utf8');
  const start = source.indexOf('  private 自定义转场回调(');
  const end = source.indexOf('\n  }', start) + 4;
  const js = stripTypeScriptTypes(`class Home { ${source.slice(start, end)} }`, { mode: 'transform' });
  const values = {
    NavigationOperation: { PUSH: 'push' },
    取全屏转场时长: () => 250,
    Curve: { EaseOut: 'ease-out' },
    CustomTransition: { getInstance: () => registry },
  };
  const home = new Function(...Object.keys(values), js + '; return new Home();')(...Object.values(values));
  home.backgroundTransitionGeneration = 0;
  home.homeTransitionOpacity = 1;
  Object.defineProperty(home, 'backgroundTransitionActive', {
    get: () => background.transitionActive,
    set: active => { background.transitionActive = active; background.updatePlayback(); },
  });
  const fades = [];
  const snapshot = () => Object.fromEntries([['Home', home.homeTransitionOpacity],
    ...Array.from(pages, ([name, page]) => [name, page.转场透明度])]);
  const frames = [];
  home.getUIContext = () => ({ animateTo: (options, update) => {
    fades.push(options);
    const start = snapshot();
    update();
    frames.push({ start, end: snapshot() });
  } });
  const startTransition = (operation = 'push', from = { index: -1 }, to = { name: 'SettingsPage', index: 0 }) => {
    const protocol = home.自定义转场回调(from, to, operation);
    protocol.transition({ finishTransition: () => protocol.onTransitionEnd(true) });
    return protocol;
  };
  return { home, fades, frames, snapshot, startTransition };
}

test('home and nested transparent destinations never crossfade old and new content', () => {
  for (const [operation, from, to] of [
    ['push', { index: -1 }, { name: 'StudyPage', index: 0 }],
    ['pop', { name: 'StudyPage', index: 0 }, { index: -1 }],
    ['push', { name: 'StudyPage', index: 0 }, { name: 'SettingsPage', index: 1 }],
    ['pop', { name: 'SettingsPage', index: 1 }, { name: 'StudyPage', index: 0 }],
    ['push', { index: -1 }, { name: 'SettingsPage', index: 0 }],
    ['pop', { name: 'SettingsPage', index: 0 }, { index: -1 }],
    ['push', { name: 'SettingsPage', index: 0 }, { name: 'BrowserPage', index: 1 }],
    ['pop', { name: 'BrowserPage', index: 1 }, { name: 'SettingsPage', index: 0 }],
    ['replace', { name: 'SettingsPage', index: 0 }, { name: 'BrowserPage', index: 0 }],
  ]) {
    const { background } = createBackground();
    const nav = createNavigation(background);
    nav.startTransition(operation, from, to);
    const source = from.index === -1 ? 'Home' : from.name;
    const destination = to.index === -1 ? 'Home' : to.name;
    assert.equal(nav.frames[0].start[source], 0, `${operation}: source hidden before animation`);
    assert.equal(nav.frames[0].end[source], 0, `${operation}: source cannot fade back in`);
    assert.equal(nav.frames[0].start[destination], 0);
    assert.equal(nav.frames[0].end[destination], 1);
    nav.fades[0].onFinish();
    assert.equal(nav.snapshot()[destination], 1);
  }
  const home = readFileSync(new URL('../../entry/src/main/ets/pages/首页.ets', import.meta.url), 'utf8');
  assert.match(home, /\.expandSafeArea\([^\n]*\)\s*\.opacity\(this\.homeTransitionOpacity\)/,
    'bind home opacity to NavBar content, not Navigation or the shared background');
});

test('missing UI context still reveals the destination for page and home returns', () => {
  for (const to of [{ name: 'SettingsPage', index: 0 }, { index: -1 }]) {
    const { background } = createBackground();
    const nav = createNavigation(background);
    nav.home.getUIContext = () => undefined;
    nav.startTransition('pop', { name: 'BrowserPage', index: 1 }, to);
    assert.equal(nav.snapshot().BrowserPage, 0);
    assert.equal(nav.snapshot()[to.index === -1 ? 'Home' : to.name], 1);
    assert.equal(background.transitionActive, false);
  }
});

test('push and pop freeze the current cloud pose and resume only after navigation completes', () => {
  for (const operation of ['push', 'pop']) {
    const { background, animations, advance } = createBackground();
    const navigation = createNavigation(background);
    background.updatePlayback();
    const first = animations[0];
    const from = background.fromPoses;
    const to = background.toPoses;
    advance(2100);
    navigation.startTransition(operation);
    assert.equal(navigation.fades[0].expectedFrameRateRange.expected, 60, 'navigation retains its own frame budget');
    const frozen = style.sampleThemeBackgroundPoses(from, to, 2100);
    assert.equal(background.running, false);
    assert.deepEqual(background.poses, frozen);
    assert.equal(animations[1].duration, 0);
    first.onFinish();
    assert.equal(animations.length, 2, 'old cloud completion must not restart motion during a fade');
    advance(250);
    navigation.fades[0].onFinish();
    assert.equal(background.running, true);
    assert.deepEqual(background.fromPoses, frozen, 'resume from the visible pose, not the old animation target');
    assert.equal(animations.length, 3);
    assert.deepEqual(animations[2].expectedFrameRateRange, { min: 15, max: 30, expected: 30 },
      'resumed background returns to the reduced frame budget');
  }
});

test('overlapping navigation ignores old completions and releases the pause on failure or timeout', () => {
  const { background, animations } = createBackground();
  const { startTransition, fades } = createNavigation(background);
  background.updatePlayback();
  const first = startTransition();
  const second = startTransition('pop');
  first.onTransitionEnd(false);
  fades[0].onFinish();
  assert.equal(background.transitionActive, true);
  assert.equal(animations.length, 2);
  second.onTransitionEnd(false);
  assert.equal(background.transitionActive, false);
  assert.equal(background.running, true);
  assert.equal(animations.length, 3);
  fades[1].onFinish();
  assert.equal(animations.length, 3, 'late animation completion after timeout is idempotent');
});

test('navigation completion respects background lifecycle, motion preference and missing UI context', () => {
  for (const flag of ['foreground', 'motion', 'visible', 'mounted']) {
    const { background, animations } = createBackground();
    const { startTransition, fades } = createNavigation(background);
    background.updatePlayback();
    startTransition();
    background[flag] = false;
    background.updatePlayback();
    fades[0].onFinish();
    assert.equal(background.running, false, flag);
    assert.equal(animations.length, 2, flag);
  }
  const { background } = createBackground();
  const { home, startTransition } = createNavigation(background);
  background.updatePlayback();
  home.getUIContext = () => undefined;
  startTransition();
  assert.equal(background.transitionActive, false);
  assert.equal(background.running, true);
});
