// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { buildStudyGestureScript, resolveStudyGesture } from '../../entry/src/main/ets/model/StudyGestures.ts';
import { loadPlatformModule } from './platform-module-harness.mjs';

const state = { phase: 'answer', gestures: true, tapZones: true, choice: false, blocked: false };
test('requested mappings preserve phase and choice rules, four zones and disabled inputs', () => {
  for (const [action, expected] of [['left', 'good'], ['right', 'hard'], ['double', 'none']]) {
    assert.equal(resolveStudyGesture(action, state), expected);
  }
  assert.equal(resolveStudyGesture('double', { ...state, phase: 'question' }), 'flip');
  for (const action of ['left', 'right']) assert.equal(resolveStudyGesture(action, { ...state, phase: 'question' }), 'none');
  for (const [x, y, command] of [[0.2, 0.2, 'again'], [0.8, 0.2, 'hard'], [0.2, 0.8, 'good'], [0.8, 0.8, 'easy']]) {
    assert.equal(resolveStudyGesture('tap', state, x, y), command);
    assert.equal(resolveStudyGesture('tap', { ...state, choice: true }, x, y), 'none');
  }
  assert.equal(resolveStudyGesture('right', { ...state, choice: true }), 'continue');
  for (const action of ['left', 'double', 'tap']) assert.equal(resolveStudyGesture(action, { ...state, choice: true }), 'none');
  for (const action of ['left', 'right', 'double', 'tap']) {
    assert.equal(resolveStudyGesture(action, { ...state, blocked: true }), 'none');
    assert.equal(resolveStudyGesture(action, { ...state, gestures: false, tapZones: false }), 'none');
    for (const phase of ['loading', 'error', 'done']) assert.equal(resolveStudyGesture(action, { ...state, phase }), 'none');
  }
  for (const x of [NaN, Infinity, -1, 1.01]) assert.equal(resolveStudyGesture('tap', state, x, 0.5), 'none');
});

function dom() {
  let time = 1000, next = 0, selection = '';
  const tasks = new Map(), listeners = {}, actions = [];
  const window = { innerWidth: 400, innerHeight: 800, getSelection: () => selection,
    jideStudyInput: { onAction: (...args) => actions.push(args) } };
  const context = vm.createContext({ window, document: { addEventListener: (name, fn) => { listeners[name] = fn; } },
    Date: { now: () => time }, setTimeout: (fn, ms) => { const id = ++next; tasks.set(id, { fn, at: time + ms }); return id; },
    clearTimeout: id => tasks.delete(id) });
  const install = (version = 1, surface = 1, gestures = true) => vm.runInContext(buildStudyGestureScript(version, surface, gestures), context);
  install();
  const plain = { tagName: 'DIV', parentElement: null, getAttribute: () => null, scrollTop: 0, scrollLeft: 0 };
  const point = (x = 200, y = 200) => ({ clientX: x, clientY: y });
  const click = (target = plain, x = 200, y = 200) => listeners.click({ target, ...point(x, y), preventDefault() {} });
  const start = (x = 200, y = 200, target = plain) => listeners.touchstart({ touches: [point(x, y)], target });
  const end = (x, y) => listeners.touchend({ changedTouches: [point(x, y)], touches: [] });
  return { actions, listeners, window, install, click, start, end, plain, point,
    select: value => { selection = value; },
    tick: ms => { time += ms; for (const [id, task] of [...tasks]) if (task.at <= time) { tasks.delete(id); task.fn(); } } };
}

test('double tap emits only reveal, single tap waits, and updating a side cancels pending taps', () => {
  const d = dom();
  d.click(); d.tick(100); d.click(); d.tick(400);
  assert.deepEqual(d.actions.map(a => a[0]), ['double']);
  d.click(); d.tick(319); assert.equal(d.actions.length, 1);
  d.tick(1); assert.deepEqual(d.actions[1], ['tap', 0.5, 0.25, 1, 1]);
  d.click(); d.install(1, 2); d.tick(400);
  assert.equal(d.actions.length, 2, 'the pending click must not grade a new answer side');
  d.start(200, 200); d.install(2, 1); d.end(100, 200);
  assert.equal(d.actions.length, 2, 'a gesture begun on the old document cannot affect the next card');
});

test('swipes exclude scrolls, edges, interactive controls, selection, cancelled and multi-touch input', () => {
  const d = dom();
  d.start(); d.end(100, 200); d.click(); d.tick(500);
  assert.deepEqual(d.actions.map(a => a[0]), ['left']);
  d.start(); d.end(300, 200); d.click(); d.tick(500);
  assert.deepEqual(d.actions.map(a => a[0]), ['left', 'right']);
  d.start(); d.end(100, 400);
  d.start(5, 200); d.end(150, 200);
  d.start(); d.plain.scrollLeft = 20; d.end(100, 200);
  for (const tagName of ['A', 'BUTTON', 'INPUT', 'TEXTAREA', 'CANVAS', 'SUMMARY', 'DETAILS', 'AUDIO', 'VIDEO']) {
    d.start(200, 200, { ...d.plain, tagName }); d.end(100, 200);
  }
  d.select('selected'); d.start(); d.end(100, 200); d.select('');
  d.start(); d.listeners.touchcancel(); d.end(100, 200);
  d.start(); d.listeners.touchstart({ touches: [d.point(), d.point(210)], target: d.plain }); d.end(100, 200);
  assert.equal(d.actions.length, 2);
});

test('click exclusions and tap-only mode preserve native card interactions', () => {
  const d = dom(); d.install(1, 1, false);
  d.click(); assert.equal(d.actions.length, 1, 'without double tap, a tap is immediate');
  for (const target of [{ ...d.plain, tagName: 'SUMMARY' }, { ...d.plain, isContentEditable: true },
    { ...d.plain, getAttribute: name => name === 'data-jide-gesture' ? 'ignore' : null },
    { ...d.plain, getAttribute: name => name === 'role' ? 'button' : null }]) d.click(target);
  d.select('selection'); d.click(); d.select('');
  d.tick(500); assert.equal(d.actions.length, 1);
});

function controlsStore() {
  let memory = new Map(), disk = new Map(), fail = false;
  const notifications = [];
  const prefs = { getSync: (k, d) => memory.get(k) ?? d, putSync: (k, v) => memory.set(k, v),
    flush: async () => { if (fail) throw new Error('disk full'); disk = new Map(memory); } };
  const api = loadPlatformModule('model/实验性功能存储.ets',
    '({ 加载TapZones开关, 保存TapZones开关, loadStudyGestures, saveStudyGestures, isTapZonesGuideCompleted, completeTapZonesGuide })',
    { preferences: { getPreferencesSync: () => prefs }, AppStorage: { get: () => ({}), setOrCreate: (...args) => notifications.push(args) } });
  return { api, notifications, restart: () => { memory = new Map(disk); }, fail: v => { fail = v; } };
}

test('controls preserve old tap-zone storage, save before broadcast and rearm onboarding on re-enable', async () => {
  const { api, notifications, restart, fail } = controlsStore();
  assert.equal(await api.loadStudyGestures(), false); assert.equal(await api.加载TapZones开关(), false);
  await api.保存TapZones开关(true); assert.equal(api.isTapZonesGuideCompleted(), false);
  await api.completeTapZonesGuide(); restart(); assert.equal(api.isTapZonesGuideCompleted(), true);
  await api.保存TapZones开关(true); assert.equal(api.isTapZonesGuideCompleted(), true);
  await api.保存TapZones开关(false); await api.保存TapZones开关(true); assert.equal(api.isTapZonesGuideCompleted(), false);
  await api.saveStudyGestures(true); restart(); assert.equal(await api.loadStudyGestures(), true);
  const before = notifications.length; fail(true);
  await assert.rejects(api.saveStudyGestures(false), /disk full/);
  assert.equal(await api.loadStudyGestures(), true); assert.equal(notifications.length, before);
  await assert.rejects(api.completeTapZonesGuide(), /disk full/); assert.equal(api.isTapZonesGuideCompleted(), false);
  fail(false); await api.completeTapZonesGuide(); assert.equal(api.isTapZonesGuideCompleted(), true);
});

const pageSource = readFileSync(new URL('../../entry/src/main/ets/pages/学习页.ets', import.meta.url), 'utf8');
function pageHarness() {
  const names = ['handleStudyGesture', 'maybeShowTapZonesGuide', 'closeTapZonesGuide'];
  const methods = names.map(name => {
    const start = pageSource.indexOf('  private ' + name + '('); assert.notEqual(start, -1);
    return pageSource.slice(start, pageSource.indexOf('\n  }', start) + 4);
  }).join('\n');
  let now = 1000, completed = false, saved = 0;
  const commands = [], scripts = [];
  const Host = new Function('resolveStudyGesture', 'isTapZonesGuideCompleted', 'completeTapZonesGuide', 'Date',
    'RATING_AGAIN', 'RATING_HARD', 'RATING_GOOD', 'RATING_EASY',
    stripTypeScriptTypes('class Host {' + methods + '}', { mode: 'transform' }) + ';return Host;')(
    resolveStudyGesture, () => completed, async () => { saved++; completed = true; }, { now: () => now }, 0, 1, 2, 3);
  const page = Object.assign(new Host(), { 阶段: 'question', requestVersion: 1, interactionVersion: 1,
    gesturesEnabled: true, TapZones开关: true, choiceQuestion: null, pendingHtml: '', controllerReady: true,
    展示时刻毫秒: 500, isCurrentRequest: v => v === 1, stopStudyTimers() {}, startStudyTimers() {}, clearChoiceAutoAdvance() {},
    studyCardShown() { scripts.push(this.interactionVersion); }, 显示答案() { commands.push('flip'); },
    评分: rating => commands.push(rating), 继续选择题反馈: () => commands.push('continue') });
  return { page, commands, scripts, tick: ms => { now += ms; }, saved: () => saved };
}

test('colored onboarding is shown once, blocks input, excludes reading time and confirms explicitly', () => {
  const { page, commands, tick, saved } = pageHarness();
  page.maybeShowTapZonesGuide(); assert.equal(page.tapZonesGuideVisible, true);
  page.handleStudyGesture('double', 0, 0, 1, 1); assert.deepEqual(commands, []);
  tick(5000); page.closeTapZonesGuide(true);
  assert.equal(page.tapZonesGuideVisible, false); assert.equal(saved(), 1); assert.equal(page.展示时刻毫秒, 5500);
  page.maybeShowTapZonesGuide(); assert.equal(page.tapZonesGuideVisible, false);
  page.handleStudyGesture('double', 0, 0, 1, 1); assert.deepEqual(commands, [], 'old surface is invalidated');
  page.handleStudyGesture('double', 0, 0, 1, 2); assert.deepEqual(commands, ['flip']);
  const dismissed = pageHarness(); dismissed.page.maybeShowTapZonesGuide(); dismissed.page.closeTapZonesGuide(false);
  assert.equal(dismissed.saved(), 0, 'back leaves the guide unread for the next entry');
});

test('onboarding waits for a usable regular card and unified input rejects each blocking condition', () => {
  for (const [key, value] of [['TapZones开关', false], ['choiceQuestion', {}], ['阶段', 'loading'],
    ['studyGuideVisible', true], ['editingPageOpen', true], ['手写模式', true], ['studyMenuOpen', true]]) {
    const { page } = pageHarness(); page[key] = value; page.maybeShowTapZonesGuide();
    assert.notEqual(page.tapZonesGuideVisible, true, key); assert.notEqual(page.tapZonesGuideChecked, true, key);
  }
  for (const key of ['studyGuideVisible', 'tapZonesGuideVisible', 'studyMenuOpen', 'autoAdvanceSettingsOpen',
    'editingPageOpen', '手写模式', '评分中', 'flipPending', 'contentRefreshInFlight']) {
    const { page, commands } = pageHarness(); page.阶段 = 'answer'; page[key] = true;
    page.handleStudyGesture('left', 0, 0, 1, 1); assert.deepEqual(commands, [], key);
  }
  const { page, commands } = pageHarness(); page.阶段 = 'answer';
  page.handleStudyGesture('left', 0, 0, 0, 1); assert.deepEqual(commands, []);
  page.handleStudyGesture('left', 0, 0, 1, 1); page.handleStudyGesture('right', 0, 0, 1, 1);
  assert.deepEqual(commands, [2, 1]);
});
