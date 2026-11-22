import * as appearance from '../../entry/src/main/ets/model/AppearanceCustomization.ts';
// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { stripTypeScriptTypes } from 'node:module';
import * as catalog from '../../entry/src/main/ets/model/ThemeCatalog.ts';
import * as style from '../../entry/src/main/ets/model/ThemeBackgroundMotion.ts';
import { loadPlatformModule } from './platform-module-harness.mjs';
import { AppLog } from '../../entry/src/main/ets/model/AppLog.ts';
import { motionApi, surfaceMotionApi } from './motion-harness.mjs';

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
  const retention = [];
  const invalidations = [];
  let panelObserver;
  const context = { animateTo: (options, update) => { animations.push(options); update(); } };
  const source = readFileSync(new URL('../../entry/src/main/ets/components/common/ThemeBackground.ets', import.meta.url), 'utf8');
  const methods = source.slice(0, source.indexOf('  build() {'))
    .replace(/^import\s[\s\S]*?;\s*$/gm, '')
    .replace('@Component', '')
    .replace('export struct ThemeBackground', 'class ThemeBackground')
    .replace(/@(Prop|State|StorageProp|Watch)(?:\([^)]*\))?\s*/g, '');
  const js = stripTypeScriptTypes(methods + '\ngetUIContext() { return context; }\n}', { mode: 'transform' });
  const values = { ...appearance, ...style, ...catalog, context, AppLog,
    invalidateSharedGlassSource: (_context, source) => invalidations.push(source),
    currentGlassSource: () => 'page',
    observeGlassPanelActivity: observer => { panelObserver = observer; observer(false, ''); return () => { panelObserver = undefined; }; },
    setSharedGlassSourceRetention: (_context, source, retained, paused) => retention.push({ source, retained, paused }),
    GLASS_BACKGROUND_SOURCE: 'root-background', Curve: { EaseInOut: 'ease-in-out' }, Date: { now: () => now } };
  const background = new Function(...Object.keys(values), js + '\nreturn new ThemeBackground();')(...Object.values(values));
  Object.assign(background, { material: 'glass', mounted: true, visible: true, visual: catalog.themeDefinition('iridescent'), foreground: true });
  return { background, animations, retention, invalidations, panelActivity: (active, source) => panelObserver?.(active, source), advance: ms => { now += ms; } };
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

test('navigation and ambient motion reuse the root glass texture until the background changes', () => {
  const { background, animations, retention, invalidations } = createBackground();
  background.updatePlayback();
  background.transitionActive = true;
  background.updatePlayback();
  assert.deepEqual(retention.at(-1), { source: 'root-background', retained: true, paused: true });
  background.transitionActive = false;
  background.updatePlayback();
  assert.deepEqual(retention.at(-1), { source: 'root-background', retained: true, paused: false });
  animations.at(-1).onFinish();
  assert.deepEqual(invalidations, []);
  background.updateBackground();
  assert.deepEqual(invalidations, ['root-background']);
  background.aboutToDisappear();
  assert.deepEqual(retention.at(-1), { source: 'root-background', retained: false, paused: true });
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
function createNavigation(background, motionStyle = 'restrained', waitForFrame = () => Promise.resolve()) {
  const motion = surfaceMotionApi(motionStyle);
  const pages = new Map();
  const callbacks = new Map();
  const TransitionRegistry = loadPlatformModule('utils/自定义转场.ets', 'CustomTransition', { navigationEnterOffset: motion.navigationEnterOffset });
  const registry = TransitionRegistry.getInstance();
  const originalRegister = registry.注册NavParam.bind(registry);
  registry.注册NavParam = (name, start, end, prepare) => { originalRegister(name, start, end, prepare); callbacks.set(name, { start, end, prepare }); };
  // 使用页面实际注册回调；这里只替换平台动画，不复制生产透明度规则。
  for (const [file, name] of [['设置页', 'SettingsPage'], ['浏览页', 'BrowserPage'], ['学习页', 'StudyPage'],
    ['添加笔记页', 'AddNotePage'], ['EditNotePage', 'EditNotePage']]) {
    const pageSource = readFileSync(new URL(`../../entry/src/main/ets/pages/${file}.ets`, import.meta.url), 'utf8');
    const begin = pageSource.search(/CustomTransition\.getInstance\(\)\.(?:注册NavParam|registerPage)\(/);
    const registration = pageSource.slice(begin, pageSource.indexOf('\n    );', begin) + 7);
    const editor = name === 'AddNotePage' || name === 'EditNotePage';
    const page = { 转场透明度: editor ? 0 : 1, opacityValue: 0, initialPreparation: Promise.resolve(),
      wheelSession: {setPresentation() {}, setVisible() {}},
      firstFrame: { wait: waitForFrame }, getUIContext: () => home.getUIContext() };
    const register = new Function('CustomTransition', 'navigationEnterOffset', stripTypeScriptTypes(registration, { mode: 'transform' }));
    register.call(page, { getInstance: () => registry }, motion.navigationEnterOffset);
    pages.set(name, page);
  }
  const source = readFileSync(new URL('../../entry/src/main/ets/utils/HomeNavigationTransition.ets', import.meta.url), 'utf8')
    .replace(/^import[^;]+;\s*/gm, '').replace(/^export /gm, '');
  const js = stripTypeScriptTypes(source, { mode: 'transform' });
  const captureGates = [];
  const values = {
    ...motion, AppLog,
    setGlassNavigationActive: active => captureGates.push(active),
    NavigationOperation: { PUSH: 'push' },
    Curve: { EaseOut: 'ease-out' },
    CustomTransition: { getInstance: () => registry },
  };
  const Transition = new Function(...Object.keys(values), js + '; return HomeNavigationTransition;')(...Object.values(values));
  const home = {};
  home.homeTransitionOpacity = 1;
  Object.defineProperty(home, 'backgroundTransitionActive', {
    get: () => background.transitionActive,
    set: active => { background.transitionActive = active; background.updatePlayback(); },
  });
  const fades = [];
  const finishes = [];
  const snapshot = () => Object.fromEntries([['Home', home.homeTransitionOpacity],
    ...Array.from(pages, ([name, page]) => [name, name === 'EditNotePage' ? page.opacityValue : page.转场透明度])]);
  const frames = [];
  home.getUIContext = () => ({ animateTo: (options, update) => {
    fades.push(options);
    const start = snapshot();
    update();
    frames.push({ start, end: snapshot() });
  } });
  const transition = new Transition({ getUIContext: () => home.getUIContext(),
    setHomeOpacity: value => { home.homeTransitionOpacity = value; },
    setHomeOffset: value => { home.homeTransitionOffset = value; },
    setBackgroundActive: value => { home.backgroundTransitionActive = value; } });
  const startTransition = (operation = 'push', from = { index: -1 }, to = { name: 'SettingsPage', index: 0 }) => {
    const protocol = transition.create(from, to, operation);
    protocol.transition({ finishTransition: () => { finishes.push(protocol); protocol.onTransitionEnd(true); } });
    return protocol;
  };
  return { home, pages, fades, finishes, frames, captureGates, snapshot, startTransition, transition, registry };
}

test('home and nested transparent destinations never crossfade old and new content in either motion style', async () => {
  for (const motionStyle of ['restrained','lively']) {
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
    const nav = createNavigation(background, motionStyle);
    const offsets = [];
    nav.home.getUIContext = () => ({animateTo: (options, update) => {
      const target = to.index === -1 ? nav.home : nav.pages.get(to.name);
      offsets.push(to.index === -1 ? target.homeTransitionOffset : target.navigationOffset);
      const start = nav.snapshot(); update();
      nav.frames.push({start,end:nav.snapshot()}); nav.fades.push(options);
    }});
    nav.startTransition(operation, from, to);
    await Promise.resolve();
    const source = from.index === -1 ? 'Home' : from.name;
    const destination = to.index === -1 ? 'Home' : to.name;
    assert.equal(nav.frames[0].start[source], 0, `${operation}: source hidden before animation`);
    assert.equal(nav.frames[0].end[source], 0, `${operation}: source cannot fade back in`);
    assert.equal(nav.frames[0].start[destination], 0);
    assert.equal(nav.frames[0].end[destination], 1);
    assert.equal(offsets[0], motionStyle === 'restrained' ? 0 : operation === 'push' ? 16 : -16);
    assert.equal(to.index === -1 ? nav.home.homeTransitionOffset : nav.pages.get(to.name).navigationOffset,0);
    nav.fades[0].onFinish();
    assert.equal(nav.snapshot()[destination], 1);
  }
  }
  const home = readFileSync(new URL('../../entry/src/main/ets/pages/首页.ets', import.meta.url), 'utf8');
  assert.match(home, /\.expandSafeArea\([^\n]*\)\s*\.onAreaChange\([^\n]*\)\s*\.opacity\(this\.homeTransitionOpacity\)/,
    'bind home opacity to NavBar content, not Navigation or the shared background');
});

test('missing UI context still reveals the destination for page and home returns', async () => {
  for (const to of [{ name: 'SettingsPage', index: 0 }, { index: -1 }]) {
    const { background } = createBackground();
    const nav = createNavigation(background);
    nav.home.getUIContext = () => undefined;
    nav.startTransition('pop', { name: 'BrowserPage', index: 1 }, to);
    await Promise.resolve();
    assert.equal(nav.snapshot().BrowserPage, 0);
    assert.equal(nav.snapshot()[to.index === -1 ? 'Home' : to.name], 1);
    assert.equal(background.transitionActive, false);
  }
});

test('a synchronous first-frame failure still opens the destination and releases the background', () => {
  const { background } = createBackground();
  const nav = createNavigation(background, 'restrained', () => { throw new Error('window closed'); });
  nav.startTransition();
  assert.equal(nav.snapshot().SettingsPage, 1);
  nav.fades[0].onFinish();
  assert.equal(nav.finishes.length, 1);
  assert.equal(background.transitionActive, false);
});

test('push and pop freeze the current cloud pose and resume only after navigation completes', async () => {
  for (const operation of ['push', 'pop']) {
    const { background, animations, advance } = createBackground();
    const navigation = createNavigation(background);
    background.updatePlayback();
    const first = animations[0];
    const from = background.fromPoses;
    const to = background.toPoses;
    advance(2100);
    navigation.startTransition(operation);
    await Promise.resolve();
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

test('overlapping navigation ignores old completions and releases the pause on failure or timeout', async () => {
  const { background, animations } = createBackground();
  const { startTransition, fades, finishes } = createNavigation(background);
  background.updatePlayback();
  const first = startTransition();
  await Promise.resolve();
  const second = startTransition('pop');
  await Promise.resolve();
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
  assert.equal(finishes.length, 0, 'ended navigation proxies cannot be finished by late animation callbacks');
});

test('navigation requests proxy completion once even before the system acknowledges it', async () => {
  const { background } = createBackground();
  const nav = createNavigation(background);
  let finishCount = 0;
  const protocol = nav.transition.create({ index: -1 }, { name: 'SettingsPage', index: 0 }, 'push');
  // Delay system acknowledgement so the guard cannot rely only on onTransitionEnd.
  protocol.transition({ finishTransition: () => { finishCount++; } });
  await Promise.resolve();
  nav.fades[0].onFinish();
  nav.fades[0].onFinish();
  assert.equal(finishCount, 1);
  assert.equal(background.transitionActive, true);
  protocol.onTransitionEnd(true);
  nav.fades[0].onFinish();
  assert.equal(finishCount, 1);
  assert.equal(background.transitionActive, false);
});

test('queued navigation updates cannot reveal an obsolete destination after cancellation or replacement', async () => {
  const { background } = createBackground();
  const nav = createNavigation(background), queued = [];
  nav.home.getUIContext = () => ({ animateTo: (options, update) => queued.push({ options, update }) });
  const first = nav.startTransition();
  await Promise.resolve();
  const second = nav.startTransition('push', { name: 'SettingsPage', index: 0 }, { name: 'BrowserPage', index: 1 });
  await Promise.resolve();
  queued[0].update();
  assert.equal(nav.snapshot().SettingsPage, 0, 'an obsolete destination stays hidden');
  first.onTransitionEnd(false);
  queued[1].update();
  assert.equal(nav.snapshot().BrowserPage, 1);
  queued[0].options.onFinish();
  assert.equal(nav.finishes.length, 0);
  assert.equal(background.transitionActive, true);
  second.onTransitionEnd(false);
  const before = nav.snapshot();
  queued[1].update();
  queued[1].options.onFinish();
  assert.deepEqual(nav.snapshot(), before);
  assert.equal(nav.finishes.length, 0);
  assert.equal(background.transitionActive, false);
});

test('navigation completion respects background lifecycle, motion preference and missing UI context', async () => {
  for (const flag of ['foreground', 'motion', 'visible', 'mounted']) {
    const { background, animations } = createBackground();
    const { startTransition, fades } = createNavigation(background);
    background.updatePlayback();
    startTransition();
    await Promise.resolve();
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
  await Promise.resolve();
  assert.equal(background.transitionActive, false);
  assert.equal(background.running, true);
});

test('flat backgrounds disable every ambient layer for preset and custom colors and stop animation',()=>{
 const {background,animations}=createBackground();
 for(const theme of catalog.THEME_CATALOG){
  background.visual=theme;background.material='flat';
  assert.equal(background.isFlat(),true,theme.id);assert.deepEqual(background.textures(),[],theme.id);
  background.updatePlayback();assert.equal(background.running,false);
 }
 assert.equal(animations.length,0);
 background.material='glass';background.visual=catalog.themeDefinition('iridescent');background.updatePlayback();
 assert.equal(background.running,true);background.material='flat';background.updatePlayback();assert.equal(background.running,false);
 background.material='glass';assert.deepEqual(background.textures(),background.visual.backgroundTextures);
 background.wallpaper='/files/test.jpg';assert.deepEqual(background.textures(),[]);
});


test('editor waits for fields and then uses the common enter and return animation', async () => {
  for (const [name, source] of [['AddNotePage', { index: -1 }], ['EditNotePage', { name: 'BrowserPage', index: 0 }]]) {
    const { background } = createBackground();
    const nav = createNavigation(background, 'lively');
    const sourceName = source.name ?? 'Home';
    let resolve;
    const prepared = new Promise(done => { resolve = done; });
    nav.pages.get(name).initialPreparation = prepared;
    const editor = { name, index: source.index + 1 };
    nav.startTransition('push', source, editor);
    assert.equal(nav.snapshot()[sourceName], 1);
    assert.equal(nav.snapshot()[name], 0);
    assert.equal(nav.fades.length, 0);
    assert.equal(nav.captureGates.at(-1), true);
    resolve();
    await prepared;
    assert.equal(nav.frames[0].start[sourceName], 0);
    assert.equal(nav.frames[0].start[name], 0);
    assert.equal(nav.frames[0].end[name], 1);
    assert.ok(nav.fades[0].duration > 0);
    nav.fades[0].onFinish();
    assert.equal(nav.captureGates.at(-1), false);
    nav.startTransition('pop', editor, source);
    assert.equal(nav.frames[1].start[name], 0);
    assert.equal(nav.frames[1].end[sourceName], 1);
    nav.fades[1].onFinish();
    assert.equal(nav.finishes.length, 2);
  }
});

test('canceling editor navigation keeps the source visible and ignores late preparation', async () => {
  const { background } = createBackground();
  const nav = createNavigation(background);
  let resolve;
  const prepared = new Promise(done => { resolve = done; });
  nav.pages.get('AddNotePage').initialPreparation = prepared;
  const protocol = nav.startTransition('push', { index: -1 }, { name: 'AddNotePage', index: 0 });
  protocol.onTransitionEnd(false);
  resolve();
  await prepared;
  assert.equal(nav.snapshot().Home, 1);
  assert.equal(nav.snapshot().AddNotePage, 0);
  assert.equal(nav.captureGates.at(-1), false);
  assert.equal(nav.fades.length, 0);
});

test('settings and both editors share entry direction and offsets in both motion styles', () => {
  for (const style of ['restrained', 'lively']) {
    const { background } = createBackground();
    const nav = createNavigation(background, style);
    for (const forward of [true, false]) {
      const states = [];
      for (const name of ['SettingsPage', 'AddNotePage', 'EditNotePage']) {
        nav.registry.取起点回调(name)(forward, false);
        const page = nav.pages.get(name);
        states.push([name === 'EditNotePage' ? page.opacityValue : page.转场透明度, page.navigationOffset]);
      }
      assert.deepEqual(states[1], states[0]);
      assert.deepEqual(states[2], states[0]);
      assert.equal(states[0][1], style === 'restrained' ? 0 : forward ? 16 : -16);
    }
  }
});


test('first panel freezes the visible ambient pose and invalidates its old sampling frame; last close resumes', () => {
  const {background,animations,invalidations,advance,panelActivity}=createBackground();
  background.mountBackground();
  const from=background.fromPoses,to=background.toPoses;
  advance(2100);panelActivity(true,'dialog');
  assert.equal(background.running,false);
  assert.deepEqual(background.poses,style.sampleThemeBackgroundPoses(from,to,2100));
  assert.deepEqual(invalidations,['root-background','dialog','page']);
  const count=animations.length;panelActivity(true,'dialog');
  assert.equal(animations.length,count,'nested menu cannot restart or resample the paused background');
  panelActivity(false,'dialog');assert.equal(background.running,true);
  assert.equal(animations.length,count+1);
  background.aboutToDisappear();panelActivity(true,'dialog');
  assert.equal(animations.length,count+1,'unmounted background observer is removed');
});
