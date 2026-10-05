// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { StudyGripSession } from '../../entry/src/main/ets/model/StudyGripSession.ts';
import { STUDY_LAYOUT_MODES, decodeStudyLayout, studyLayoutIndex, studyToolbarBounds,
  clampStudyToolbar, studyGripHintKey } from '../../entry/src/main/ets/model/StudyLayout.ts';
import { agentPreferenceDefinitions, decodeAgentPreference, agentWritablePreferenceIds } from '../../entry/src/main/ets/model/agent/AgentPreferenceSettings.ts';
import { filterSettingsEntries } from '../../entry/src/main/ets/model/SettingsNavigation.ts';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';
import { AppInterfaceTracker, visibleInterfaceItems } from '../../entry/src/main/ets/model/AppInterface.ts';
import { buildAgentAppStructure } from '../../entry/src/main/ets/model/agent/AgentAppStructure.ts';
import { agentSettingDefinitions } from '../../entry/src/main/ets/model/agent/AgentSettingsTools.ts';
import { agentFunctionTools } from '../../entry/src/main/ets/model/agent/AgentToolCatalog.ts';

function clock() {
  let now = 0, id = 0;
  const jobs = new Map();
  return { schedule(fn, delay) { jobs.set(++id, { fn, at: now + delay }); return id; },
    cancel: id => jobs.delete(id),
    tick(ms) { now += ms; for (const [id, job] of [...jobs]) if (job.at <= now) { jobs.delete(id); job.fn(); } },
    pending: () => [...jobs.values()].map(job => job.fn) };
}
function gripHarness() {
  const time = clock(), moves = [], reports = [], callbacks = [];
  const source = { starts: 0, stops: 0, availability: 'available', release: true,
    start(callback) { this.starts++; callbacks.push(callback); return this.availability; },
    stop() { this.stops++; return this.release; } };
  const session = new StudyGripSession(source, { ...time, move: side => moves.push(side), report: value => reports.push(value) });
  return { session, source, time, moves, reports, callbacks, send: status => callbacks.at(-1)(status) };
}

test('grip moves only for a stable changed side; repeated events do not postpone it and unknown grips keep position', () => {
  const h = gripHarness(); h.session.setActive(true); h.session.setActive(true);
  assert.equal(h.source.starts, 1);
  for (const status of [0, 3, 16, 99, 2]) { h.send(status); h.time.tick(300); }
  assert.deepEqual(h.moves, []);
  h.send(1); h.time.tick(200); h.send(1); h.time.tick(50);
  assert.deepEqual(h.moves, ['left']);
  h.send(2); h.send(16); h.time.tick(1000);
  assert.deepEqual(h.moves, ['left']);
  h.send(2); h.time.tick(250); assert.deepEqual(h.moves, ['left', 'right']);
});

test('touching defers migration until release and invalidates previously queued callbacks', () => {
  const h = gripHarness(); h.session.setActive(true); h.send(1);
  const stale = h.time.pending()[0]; h.session.setTouching(true); stale(); h.time.tick(500);
  assert.deepEqual(h.moves, []);
  h.send(1); h.session.setTouching(false); h.time.tick(249); assert.deepEqual(h.moves, []);
  h.time.tick(1); assert.deepEqual(h.moves, ['left']);
});

test('background and dispose cancel queued moves and late events; a fresh subscription has its own generation', () => {
  const h = gripHarness(); h.session.setActive(true); h.send(1);
  const stale = h.time.pending()[0], old = h.callbacks[0];
  h.session.setActive(false); h.session.setActive(true); h.send(1); stale(); old(2);
  h.time.tick(250); assert.deepEqual(h.moves, ['left']);
  h.send(2); h.session.dispose(); h.send(1); h.time.tick(1000);
  assert.deepEqual(h.moves, ['left']);
});

test('failed subscriptions stay in manual fallback and failed cancellation never creates a second listener', () => {
  const h = gripHarness(); h.source.availability = 'unsupported'; h.session.setActive(true);
  assert.equal(h.reports.at(-1), 'unsupported'); h.session.setActive(true); assert.equal(h.source.starts, 1);
  h.source.release = false; h.session.setActive(false); h.session.setActive(true);
  assert.equal(h.reports.at(-1), 'failed'); assert.equal(h.source.starts, 1);
  h.callbacks[0](1); h.time.tick(1000); assert.deepEqual(h.moves, []);
  h.source.release = true; h.source.availability = 'available'; h.session.setActive(false); h.session.setActive(true);
  assert.equal(h.source.starts, 2);
});

test('actual sensor maps errors and unregisters exactly its own callback; failed release detaches its UI listener', () => {
  const calls = [], published = [], seen = []; let error = 0, failOff = false, supported = true;
  const motion = { on(type, callback) { if (error) throw { code: error }; calls.push(['on', type, callback]); },
    off(type, callback) { calls.push(['off', type, callback]); if (failOff) throw Error('IPC'); } };
  const Sensor = loadPlatformModule('backend/StudyGripSensor.ets', 'StudyGripSensor', { motion,
    canIUse: () => supported, STUDY_GRIP_AVAILABILITY_KEY: 'studyGripAvailability',
    AppStorage: { setOrCreate: (key, value) => published.push([key, value]) } });
  for (const [code, value] of [[801, 'unsupported'], [201, 'permission_denied'], [31500002, 'failed']]) {
    error = code; const sensor = new Sensor(); assert.equal(sensor.start(x => seen.push(x)), value);
    assert.equal(sensor.stop(), true);
  }
  error = 0; const sensor = new Sensor(); assert.equal(sensor.start(x => seen.push(x)), 'available');
  const callback = calls.at(-1)[2]; callback(1); assert.deepEqual(seen, [1]);
  failOff = true; assert.equal(sensor.stop(), false); callback(2); assert.deepEqual(seen, [1]);
  assert.equal(sensor.start(() => {}), 'failed'); failOff = false; assert.equal(sensor.stop(), true);
  assert.equal(calls.at(-1)[2], callback); assert.equal(published.at(-1)[1], 'failed');
  supported = false; const count = calls.length;
  assert.equal(new Sensor().start(() => {}), 'unsupported'); assert.equal(calls.length, count);
});

test('window bounds own insets once and detect when all rating controls cannot fit', () => {
  for (const [w, h, top, bottom] of [[360, 720, 80, 0], [800, 1000, 100, 32], [250, 600, 90, 24]]) {
    const bounds = studyToolbarBounds(w, h, top, bottom, 96, 360);
    assert.equal(bounds.fits, true); assert.equal(bounds.left, 12); assert.equal(bounds.right + 96, w - 12);
    assert.equal(bounds.top - top, 12); assert.equal(h - bounds.bottom - 360 - bottom, 12);
    assert.equal(clampStudyToolbar(-100, bounds.top, bounds.bottom), bounds.top);
    assert.equal(clampStudyToolbar(9000, bounds.top, bounds.bottom), bounds.bottom);
  }
  for (const [w, h] of [[800, 400], [110, 720], [0, 0], [NaN, 720]]) {
    assert.equal(studyToolbarBounds(w, h, 80, 24, 96, 360).fits, false);
  }
});

const read = path => readFileSync(new URL('../../entry/src/main/ets/' + path, import.meta.url), 'utf8');
const size = loadPlatformModule('utils/工具栏尺寸.ets', '[工具栏宽度, 工具栏高度]', {});
function toolbarHarness(options = {}) {
  const time = clock(), saved = [], state = [], sensors = [], toasts = [];
  class Sensor { constructor() { sensors.push(this); } start(callback) { this.callback = callback; return options.availability ?? 'available'; } stop() { this.callback = null; return true; } }
  const Toolbar = loadComponentLogic('components/学习浮动工具栏.ets', '学习浮动工具栏', {
    StudyGripSensor: Sensor, StudyGripSession, setTimeout: time.schedule, clearTimeout: time.cancel,
    THEME_TEXT_COLORS_KEY: 'text', GLASS_COLORS_KEY: 'glass', GLASS_HIGHLIGHT_COLORS: [], THEME_MOTION_KEY: 'motion',
    PRIMARY_GLASS_KEY: 'primary', 颜色键: {}, themePrimaryGlass: () => ({}), themeDefinition: () => ({}),
    studyToolbarBounds, clampStudyToolbar, 工具栏宽度: size[0], 工具栏高度: size[1],
    加载工具栏位置: async () => options.saved ?? { x: 252, y: 240 },
    loadStudyGripHeight: async () => { if (options.failLoad) throw Error('read failed'); return options.height ?? null; },
    saveStudyGripHeight: async y => { if (options.failSave) throw Error('write failed'); saved.push(['smart', y]); }, 保存工具栏位置: async (...args) => saved.push(args),
    gesturePointer: (_infos, list, id = -1) => list.find(p => p && (id < 0 || p.id === id)) ?? null,
    TouchType: { Down: 0, Up: 1, Move: 2, Cancel: 3 }, Curve: { EaseOut: 0 }, $r: x => x, showToastSafely: (_context, options) => toasts.push(options.message) });
  const bar = new Toolbar(); Object.assign(bar, { isGripLayout: true, isGripActive: true, viewportWidth: 360,
    viewportHeight: 720, topInset: 80, bottomInset: 24, isMotionEnabled: false, onGripState: (...args) => state.push(args),
    getUIContext: () => ({ animateTo: (_options, move) => move() }) });
  return { bar, time, saved, state, sensors, toasts };
}

test('real toolbar migrates in its container, freezes for multiple touch IDs, and preserves manual position on auto moves', async () => {
  const h = toolbarHarness(); await h.bar.aboutToAppear();
  h.sensors[0].callback(1); h.time.tick(250); assert.equal(h.bar.位置X, 12); assert.equal(h.bar.位置Y, 240);
  assert.deepEqual(h.saved, []);
  h.bar.handleToolbarTouch({ type: 0, changedTouches: [{ id: 2 }, { id: 7 }] });
  h.sensors[0].callback(2); h.time.tick(1000); assert.equal(h.bar.位置X, 12);
  h.bar.handleToolbarTouch({ type: 1, changedTouches: [{ id: 2 }] }); h.time.tick(1000); assert.equal(h.bar.位置X, 12);
  h.bar.handleToolbarTouch({ type: 3, changedTouches: [] }); h.time.tick(250); assert.equal(h.bar.位置X, 252);
  h.bar.viewportWidth = 260; h.bar.viewportHeight = 600; h.bar.viewportChanged();
  assert.equal(h.bar.位置X, 152); assert.ok(h.bar.位置Y + 80 + 24 + 12 <= 600);
  h.bar.aboutToDisappear();
});

test('smart dragging saves only height, while unavailable grip and float still permit horizontal movement', async () => {
  for (const [smart, availability] of [[true, 'available'], [true, 'unsupported'], [false, 'available']]) {
    const h = toolbarHarness({ availability }); h.bar.isGripLayout = smart; await h.bar.aboutToAppear();
    h.bar.拖动开始({ fingerList: [{ id: 9, localX: 30, localY: 30 }] });
    h.bar.拖动更新({ fingerList: [{ id: 9, localX: -200, localY: 80 }] });
    if (smart && availability === 'available') assert.equal(h.bar.位置X, 252);
    else assert.equal(h.bar.位置X, 22);
    h.bar.拖动结束(); await Promise.resolve();
    assert.equal(h.saved[0][0], smart ? 'smart' : 'main'); assert.equal(h.bar.位置Y, 290);
    h.bar.aboutToDisappear();
  }
});

test('flipping or resizing with a second finger held does not release the touch guard', async () => {
  const h = toolbarHarness(); await h.bar.aboutToAppear();
  h.bar.handleToolbarTouch({ type: 0, changedTouches: [{ id: 2 }, { id: 7 }] });
  h.sensors[0].callback(1);
  h.bar.handleToolbarTouch({ type: 1, changedTouches: [{ id: 2 }] });
  h.bar.当前阶段 = 'answer'; h.bar.阶段变化(); h.time.tick(1000);
  assert.equal(h.bar.位置X, 252);
  h.bar.viewportWidth = 260; h.bar.viewportChanged(); h.time.tick(1000);
  assert.equal(h.bar.位置X, 152); assert.deepEqual(h.bar.touchIds, [7]);
  h.bar.handleToolbarTouch({ type: 1, changedTouches: [{ id: 7 }] });
  h.time.tick(250); assert.equal(h.bar.位置X, 12);
  h.bar.aboutToDisappear();
});

test('toolbar exposes preference failures and does not show late save errors after leaving', async () => {
  const h = toolbarHarness({ failLoad: true, failSave: true }); await h.bar.aboutToAppear();
  assert.equal(h.toasts.at(-1), 'app.string.settings_study_grip_load_failed');
  assert.equal(h.bar.位置已加载, true); assert.equal(h.bar.位置Y, 240);
  await h.bar.持久化位置(); assert.equal(h.toasts.at(-1), 'app.string.settings_study_grip_save_failed');
  const count = h.toasts.length, pending = h.bar.持久化位置();
  h.bar.aboutToDisappear(); await pending; assert.equal(h.toasts.length, count);
});

test('smart height writes remain ordered, reads await accepted writes, and errors do not poison retries', async () => {
  const prefs = new Map(), calls = []; let releaseFirst, failRead = false, failSave = false;
  const firstFlush = new Promise(resolve => { releaseFirst = resolve; });
  const store = {
    get: async (key, fallback) => { if (failRead) throw Error('read failed'); return prefs.get(key) ?? fallback; },
    put: async (key, value) => { calls.push(value); if (failSave) throw Error('write failed'); prefs.set(key, value); },
    flush: async () => { if (calls.length === 1) await firstFlush; }
  };
  const [loadHeight, saveHeight] = loadPlatformModule('model/学习布局存储.ets',
    '[loadStudyGripHeight, saveStudyGripHeight]', { AppStorage: { get: () => ({}) },
      preferences: { getPreferences: async () => store } });
  const first = saveHeight(123), second = saveHeight(456), read = loadHeight();
  await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(calls, [123]);
  releaseFirst(); await Promise.all([first, second]); assert.equal(await read, 456);
  assert.deepEqual(calls, [123, 456]);
  failRead = true; await assert.rejects(loadHeight(), /read failed/); failRead = false;
  failSave = true; await assert.rejects(saveHeight(789), /write failed/); failSave = false;
  await saveHeight(900); assert.equal(await loadHeight(), 900);
});

test('layout persistence and JIDE use the same modes, smart height is isolated, and settings search finds it in both languages', async () => {
  assert.deepEqual(STUDY_LAYOUT_MODES, ['bottom', 'float', 'smart']);
  assert.equal(studyLayoutIndex('smart'), 2); assert.equal(decodeStudyLayout('bad'), 'bottom');
  const prefs = new Map(), writes = [];
  const dependencies = { AppStorage: { get: () => ({}) }, decodeStudyLayout,
    preferences: { getPreferences: async () => ({ get: async (k, d) => prefs.get(k) ?? d,
      put: async (k, v) => { prefs.set(k, v); writes.push(k); }, flush: async () => {} }) } };
  const [load, save, loadHeight, saveHeight] = loadPlatformModule('model/学习布局存储.ets',
    '[加载学习布局模式, 保存学习布局模式, loadStudyGripHeight, saveStudyGripHeight]', dependencies);
  assert.equal(await load(), 'bottom'); for (const mode of STUDY_LAYOUT_MODES) { await save(mode); assert.equal(await load(), mode); }
  await saveHeight(123); assert.equal(await loadHeight(), 123); assert.equal(prefs.has('study_main_toolbar_x'), false);
  assert.equal(writes.at(-1), 'study_grip_toolbar_y');
  const definition = agentPreferenceDefinitions().find(x => x.id === 'study_layout');
  assert.equal(decodeAgentPreference(definition, 'smart'), 'smart'); assert.ok(!agentWritablePreferenceIds().includes('study_layout'));
  assert.match(definition.description, /智感握姿/); assert.equal(studyGripHintKey('unsupported'), 'settings_study_grip_unsupported');
  for (const locale of ['base', 'en_US']) {
    const strings = new Map(JSON.parse(readFileSync(new URL(`../../entry/src/main/resources/${locale}/element/string.json`, import.meta.url))).string.map(x => [x.name, x.value]));
    assert.ok(filterSettingsEntries(strings.get('settings_study_layout_smart'), true, true, key => strings.get(key)).some(x => x.id === 'scheduler'));
  }
});

test('study page selects bottom fallback in a short window and gates sensing for covered, inactive and choice states', () => {
  const source = read('pages/学习页.ets');
  const methods = ['isFloatingStudyLayout', 'isStudyGripActive'].map(name => {
    const start = source.indexOf('  private ' + name + '('); return source.slice(start, source.indexOf('\n  }', start) + 4);
  }).join('\n');
  const Page = new Function('studyToolbarBounds', '应用尺寸', '主工具栏_竖版_宽度', '主工具栏_竖版_高度_答案阶段',
    stripTypeScriptTypes('class Page {' + methods + '}') + '; return Page;')(studyToolbarBounds,
    { pageToolbarHeight: () => 80 }, 96, 360);
  const page = new Page(); Object.assign(page, { 学习布局模式值: 'smart', toolbarViewportWidth: 360, toolbarViewportHeight: 720,
    状态栏高度: 24, 导航条高度: 24, 页面已显示: true, foreground: true, timeboxNotice: null, choiceQuestion: null });
  assert.equal(page.isFloatingStudyLayout(), true); page.toolbarViewportHeight = 400; assert.equal(page.isFloatingStudyLayout(), false);
  assert.equal(page.isStudyGripActive(), true);
  for (const flag of ['评分中', 'editingPageOpen', '手写模式', 'studyMenuOpen', 'flagNamesOpen', 'studyGuideVisible', 'tapZonesGuideVisible', 'autoAdvanceSettingsOpen']) {
    page[flag] = true; assert.equal(page.isStudyGripActive(), false, flag); page[flag] = false;
  }
  page.choiceQuestion = {}; assert.equal(page.isStudyGripActive(), false); page.choiceQuestion = null;
  page.foreground = false; assert.equal(page.isStudyGripActive(), false);
  assert.match(source, /isGripLayout: this\.学习布局模式值 === 'smart'/);
  assert.match(source, /isGripActive: this\.isStudyGripActive\(\)/);
});

test('real JIDE structure receives smart layout and sensor state from the production study observer', () => {
  const source = read('pages/学习页.ets'), tracker = new AppInterfaceTracker();
  const start = source.indexOf('  private publishInterface(');
  const method = source.slice(start, source.indexOf('\n  }', start) + 4);
  const Page = new Function('appInterface', 'visibleInterfaceItems', 'namedResourceText',
    stripTypeScriptTypes(`class Page { ${method} }`, { mode: 'transform' }) + ';return Page;')(
    tracker, visibleInterfaceItems, (_context, key) => key);
  const page = new Page(); Object.assign(page, { mounted: true, 阶段: 'question', 牌组名: 'Deck', 当前卡片: null,
    currentMarking: null, 学习布局模式值: 'smart', gripAvailability: 'unsupported', gripSide: 'left',
    getUIContext: () => ({}), studyMenuOpen: false });
  page.publishInterface();
  const strings = new Map(JSON.parse(readFileSync(new URL('../../entry/src/main/resources/base/element/string.json', import.meta.url))).string.map(x => [x.name, x.value]));
  const context = { simple: true, agent: true, cloudDeck: false, themeHasTextures: false };
  const tools = agentFunctionTools(100, 'assistant');
  const structure = buildAgentAppStructure(context, 'study', '', key => strings.get(key), agentSettingDefinitions(), tools, tracker.snapshot());
  const values = new Map(structure.observations.find(x => x.surface === 'study').values.map(x => [x.id, x.value]));
  assert.equal(values.get('study_layout'), 'smart'); assert.equal(values.get('grip_availability'), 'unsupported'); assert.equal(values.get('grip_side'), 'left');
  const settings = buildAgentAppStructure(context, 'settings', 'scheduler', key => strings.get(key), agentSettingDefinitions(), tools, []);
  const item = settings.sections.flatMap(x => x.cards).flatMap(x => x.items).find(x => x.id === 'study_layout');
  assert.equal(item.readTool, 'get_settings'); assert.equal(item.writeTool, '');
  assert.equal(item.title, strings.get('settings_study_layout_row'));
});
