import { BURY_SUSPEND_MODE_BURY_USER, BURY_SUSPEND_MODE_SUSPEND } from '../../entry/src/main/ets/proto/messages/SchedulerMessages.ts';
import { STUDY_GESTURE_ACTIONS } from '../../entry/src/main/ets/model/StudyGestureConfig.ts';
import { completeStudyGestures, activeStudyGestureInputs, studyGestureCommand, studyGestureTapInput, defaultStudyGestureConfig } from '../../entry/src/main/ets/model/StudyGestureConfig.ts';
// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { buildStudyGestureScript, resolveStudyGesture, StudyQuickAnswerMode,
  resolveStudyQuickAnswerMode } from '../../entry/src/main/ets/model/StudyGestures.ts';
import { loadPlatformModule, loadComponentLogic } from './platform-module-harness.mjs';
import { defaultStudyControls, validateStudyControls, mappedStudyCommand } from '../../entry/src/main/ets/model/StudyControls.ts';

const state = { phase: 'answer', gestures: true, tapZones: false, choice: false, blocked: false };
test('requested mappings preserve phase and choice rules, four zones and disabled inputs', () => {
  for (const [action, expected] of [['left', 'good'], ['right', 'hard'], ['double', 'none']]) {
    assert.equal(resolveStudyGesture(action, state), expected);
  }
  assert.equal(resolveStudyGesture('double', { ...state, phase: 'question' }), 'flip');
  for (const action of ['left', 'right']) assert.equal(resolveStudyGesture(action, { ...state, phase: 'question' }), 'none');
  for (const [x, y, command] of [[0.2, 0.2, 'again'], [0.8, 0.2, 'hard'], [0.2, 0.8, 'good'], [0.8, 0.8, 'easy']]) {
    assert.equal(resolveStudyGesture('tap', { ...state, gestures: false, tapZones: true }, x, y), command);
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
  const install = (version = 1, surface = 1, gestures = true, inputs = undefined) => vm.runInContext(buildStudyGestureScript(version, surface, gestures, inputs), context);
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

test('template input focus is reported with current card identity, independent of text selection or gesture mode',()=>{
  const d=dom();d.install(7,9,false);d.select('selected text');
  for(const target of [{tagName:'INPUT'},{tagName:'TEXTAREA'},{tagName:'DIV',isContentEditable:true}]) {
    d.listeners.focusin({target});assert.deepEqual(d.actions.at(-1),['input_focus',1,0,7,9]);
  }
  d.listeners.focusout({relatedTarget:null});assert.deepEqual(d.actions.at(-1),['input_focus',0,0,7,9]);
});

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

test('audio icon clicks dispatch the chosen item immediately with the current card surface', () => {
  for (const gestures of [false, true]) {
    const d = dom(); d.install(7, 9, gestures);
    const button = { ...d.plain, tagName: 'BUTTON',
      getAttribute: name => name === 'data-jide-audio' ? 'q:1' : null };
    const icon = { ...d.plain, tagName: 'path', parentElement: { ...d.plain, tagName: 'svg', parentElement: button } };
    d.start(200, 200, icon); d.end(200, 200); d.click(icon);
    assert.deepEqual(d.actions, [['audio:q:1', 0, 0, 7, 9]]);
    d.tick(500); assert.equal(d.actions.length, 1, 'audio must not also trigger flip or grading');
    button.getAttribute = name => name === 'data-jide-audio' ? 'a:12' : null;
    d.click(icon); assert.deepEqual(d.actions[1], ['audio:a:12', 0, 0, 7, 9]);
    button.getAttribute = name => name === 'data-jide-audio' ? 'q:invalid' : null;
    d.click(icon); assert.equal(d.actions.length, 2);
  }
});

function controlsStore(initial = []) {
  let memory = new Map(initial), disk = new Map(initial), fail = false;
  const notifications = [];
  const prefs = { getSync: (k, d) => memory.get(k) ?? d, putSync: (k, v) => memory.set(k, v),
    flush: async () => { if (fail) throw new Error('disk full'); disk = new Map(memory); } };
  const api = loadPlatformModule('model/实验性功能存储.ets',
    '({ loadStudyQuickAnswerMode, saveStudyQuickAnswerMode, isTapZonesGuideCompleted, completeTapZonesGuide })',
    { StudyQuickAnswerMode, resolveStudyQuickAnswerMode, preferences: { getPreferencesSync: () => prefs },
      AppStorage: { get: () => ({}), setOrCreate: (...args) => notifications.push(args) } });
  return { api, notifications, prefs, read: key => memory.get(key), restart: () => { memory = new Map(disk); },
    fail: v => { fail = v; } };
}

test('mode migration covers every old combination and explicit new mode takes precedence', async () => {
  for (const tapZones of [false, true]) for (const gestures of [false, true]) {
    const { api } = controlsStore([['tap_zones_enabled', tapZones], ['study_gestures_enabled', gestures]]);
    assert.equal(await api.loadStudyQuickAnswerMode(), tapZones ? 1 : gestures ? 2 : 0);
  }
  for (const mode of [0, 1, 2]) {
    const { api } = controlsStore([['study_quick_answer_mode', mode], ['tap_zones_enabled', true], ['study_gestures_enabled', true]]);
    assert.equal(await api.loadStudyQuickAnswerMode(), mode);
  }
  for (const invalid of [-1, 3, 1.5, 'gestures']) {
    const { api } = controlsStore([['study_quick_answer_mode', invalid], ['study_gestures_enabled', true]]);
    assert.equal(await api.loadStudyQuickAnswerMode(), 2);
  }
});

test('exclusive modes survive restart, restore failed writes and rearm onboarding only on entry', async () => {
  const { api, notifications, restart, fail, read } = controlsStore();
  assert.equal(await api.loadStudyQuickAnswerMode(), 0);
  await api.saveStudyQuickAnswerMode(1); assert.equal(api.isTapZonesGuideCompleted(), false);
  await api.completeTapZonesGuide(); restart(); assert.equal(api.isTapZonesGuideCompleted(), true);
  await api.saveStudyQuickAnswerMode(1); assert.equal(api.isTapZonesGuideCompleted(), true);
  await api.saveStudyQuickAnswerMode(2); restart(); assert.equal(await api.loadStudyQuickAnswerMode(), 2);
  const before = notifications.length; fail(true);
  await assert.rejects(api.saveStudyQuickAnswerMode(1), /disk full/);
  assert.equal(notifications.length, before);
  assert.equal(read('study_quick_answer_mode'), 2);
  assert.equal(read('tap_zones_enabled'), false); assert.equal(read('study_gestures_enabled'), true);
  restart(); assert.equal(await api.loadStudyQuickAnswerMode(), 2);
  assert.equal(api.isTapZonesGuideCompleted(), true, 'failed mode switch restores guide');
  fail(false); await api.saveStudyQuickAnswerMode(1); assert.equal(api.isTapZonesGuideCompleted(), false);
  fail(true); await assert.rejects(api.completeTapZonesGuide(), /disk full/);
  assert.equal(api.isTapZonesGuideCompleted(), false);
  fail(false); await api.completeTapZonesGuide(); assert.equal(api.isTapZonesGuideCompleted(), true);
  await api.saveStudyQuickAnswerMode(0); restart(); assert.equal(await api.loadStudyQuickAnswerMode(), 0);
});

test('queued modes publish only after persistence and reads wait for accepted writes', async () => {
  const { api, prefs, notifications, read } = controlsStore();
  let release;
  const flush = prefs.flush;
  prefs.flush = () => new Promise(resolve => { release = async () => { await flush(); resolve(); }; });
  const first = api.saveStudyQuickAnswerMode(1);
  await Promise.resolve();
  assert.equal(notifications.length, 0);
  const second = api.saveStudyQuickAnswerMode(2);
  const loaded = api.loadStudyQuickAnswerMode();
  await release(); await first;
  await Promise.resolve();
  assert.deepEqual(notifications, [['studyQuickAnswerMode', 1]]);
  await release(); await second;
  assert.equal(await loaded, 2);
  assert.equal(read('tap_zones_enabled'), false); assert.equal(read('study_gestures_enabled'), true);
  await assert.rejects(api.saveStudyQuickAnswerMode(3), /Invalid/);
});

test('settings selection disables duplicate input and restores actual mode after failure', async () => {
  let finish;
  const Host = loadComponentLogic('components/settings/ReviewControlsSettings.ets', 'ReviewControlsSettings', {
    StudyQuickAnswerMode, loadStudyQuickAnswerMode: async () => 0,
    saveStudyQuickAnswerMode: () => new Promise((resolve, reject) => { finish = { resolve, reject }; })
  });
  const host = Object.assign(new Host(), { recoveryMessage: '', resultMessage: '', resultUndo: null, 简洁模式: true, updateShakeSensor() {} });
  const saving = host.changeControl(1);
  assert.equal(host.controlsSaving, true); assert.equal(host.selectedMode, 1);
  await host.changeControl(2); assert.equal(host.selectedMode, 1);
  finish.reject(new Error('disk full')); await saving;
  assert.equal(host.selectedMode, 0); assert.equal(host.controlsFailed, true); assert.equal(host.controlsSaving, false);
  const success = host.changeControl(2); host.quickAnswerMode = 2; finish.resolve(); await success;
  assert.equal(host.selectedMode, 2); assert.equal(host.controlsFailed, false);
  for (const invalid of [-1, 3, 1.5]) await host.changeControl(invalid);
  assert.equal(host.selectedMode, 2);
});

const pageSource = readFileSync(new URL('../../entry/src/main/ets/pages/学习页.ets', import.meta.url), 'utf8');
function pageHarness() {
  const names = ['controls', 'isStudyGesturesEnabled', 'isTapZonesEnabled', 'handleStudyGesture', 'studyGestureBlocked', 'maybeShowTapZonesGuide', 'closeTapZonesGuide'];
  const methods = names.map(name => {
    const start = pageSource.indexOf('  private ' + name + '('); assert.notEqual(start, -1);
    return pageSource.slice(start, pageSource.indexOf('\n  }', start) + 4);
  }).join('\n');
  let now = 1000, completed = false, saved = 0;
  const commands = [], scripts = [];
  const Host = new Function('StudyQuickAnswerMode', 'resolveStudyGesture', 'isTapZonesGuideCompleted', 'completeTapZonesGuide', 'Date',
    'completeStudyGestures', 'studyGestureCommand', 'studyGestureTapInput', 'RATING_AGAIN', 'RATING_HARD', 'RATING_GOOD', 'RATING_EASY', 'BURY_SUSPEND_MODE_BURY_USER', 'BURY_SUSPEND_MODE_SUSPEND', 'validateStudyControls', 'mappedStudyCommand',
    stripTypeScriptTypes('class Host {' + methods + '}', { mode: 'transform' }) + ';return Host;')(
    StudyQuickAnswerMode, resolveStudyGesture, () => completed, async () => { saved++; completed = true; }, { now: () => now }, completeStudyGestures, studyGestureCommand, studyGestureTapInput, 0, 1, 2, 3,BURY_SUSPEND_MODE_BURY_USER,BURY_SUSPEND_MODE_SUSPEND,validateStudyControls,mappedStudyCommand);
  const page = Object.assign(Object.assign(new Host(), { recoveryMessage: '', resultMessage: '', resultUndo: null, 简洁模式: true, updateShakeSensor() {} }), { timeboxNotice: null, 阶段: 'question', requestVersion: 1, interactionVersion: 1,
    controlsJson:JSON.stringify(defaultStudyControls()),quickAnswerMode: StudyQuickAnswerMode.TapZones, choiceQuestion: null, pendingHtml: '', controllerReady: true,
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
  page.handleStudyGesture('tap', 0.2, 0.2, 1, 2); assert.deepEqual(commands, ['flip']);
  const dismissed = pageHarness(); dismissed.page.maybeShowTapZonesGuide(); dismissed.page.closeTapZonesGuide(false);
  assert.equal(dismissed.saved(), 0, 'back leaves the guide unread for the next entry');
});

test('onboarding waits for a usable regular card and unified input rejects each blocking condition', () => {
  for (const [key, value] of [['quickAnswerMode', 0], ['choiceQuestion', {}], ['阶段', 'loading'],
    ['studyGuideVisible', true], ['editingPageOpen', true], ['手写模式', true], ['studyMenuOpen', true]]) {
    const { page } = pageHarness(); page[key] = value; page.maybeShowTapZonesGuide();
    assert.notEqual(page.tapZonesGuideVisible, true, key); assert.notEqual(page.tapZonesGuideChecked, true, key);
  }
  for (const key of ['studyGuideVisible', 'tapZonesGuideVisible', 'studyMenuOpen', 'autoAdvanceSettingsOpen',
    'editingPageOpen', '手写模式', '评分中', 'flipPending', 'contentRefreshInFlight']) {
    const { page, commands } = pageHarness(); page.quickAnswerMode = StudyQuickAnswerMode.Gestures;
    page.阶段 = 'answer'; page[key] = true;
    page.handleStudyGesture('left', 0, 0, 1, 1); assert.deepEqual(commands, [], key);
  }
  const { page, commands } = pageHarness(); page.阶段 = 'answer'; page.quickAnswerMode = StudyQuickAnswerMode.Gestures;
  page.handleStudyGesture('left', 0, 0, 0, 1); assert.deepEqual(commands, []);
  page.handleStudyGesture('left', 0, 0, 1, 1); page.handleStudyGesture('right', 0, 0, 1, 1);
  assert.deepEqual(commands, [2, 1]);
});

test('the actual page enables exactly one shortcut and tap zones respond immediately', () => {
  for (const mode of [0, 1, 2]) {
    const { page, commands } = pageHarness(); page.quickAnswerMode = mode; page.阶段 = 'answer';
    assert.equal(page.isTapZonesEnabled(), mode === 1); assert.equal(page.isStudyGesturesEnabled(), mode === 2);
    const d = dom(); d.install(1, 1, page.isStudyGesturesEnabled());
    d.window.jideStudyInput.onAction = (...args) => page.handleStudyGesture(...args);
    d.click(d.plain, 80, 160);
    if (mode === 1) assert.deepEqual(commands, [0], 'tap zones grade without a 320ms delay');
    else assert.deepEqual(commands, []);
    d.tick(400);
    if (mode !== 1) assert.deepEqual(commands, [], 'single tap does not grade other modes');
    d.start(); d.end(100, 200);
    assert.deepEqual(commands, mode === 1 ? [0] : mode === 2 ? [2] : []);
  }
});

test('JIDE gesture overrides apply to the actual page while choice feedback and blocked input keep their policy',()=>{
  const {page,commands}=pageHarness();
  page.controlsJson=JSON.stringify({...defaultStudyControls(),gestureMode:'gestures',gestures:[{input:'left',command:'easy'}]});
  page.阶段='answer';page.handleStudyGesture('left',0,0,1,1);assert.deepEqual(commands,[3]);commands.length=0;
  page.阶段='question';page.handleStudyGesture('left',0,0,1,1);assert.deepEqual(commands,[]);
  page.choiceQuestion={};page.阶段='answer';page.handleStudyGesture('right',0,0,1,1);assert.deepEqual(commands,['continue']);commands.length=0;
  page.choiceQuestion=null;page.studyMenuOpen=true;page.handleStudyGesture('left',0,0,1,1);assert.deepEqual(commands,[]);
  page.studyMenuOpen=false;page.controlsJson=JSON.stringify({...defaultStudyControls(),gestureMode:'off'});
  assert.equal(page.isStudyGesturesEnabled(),false);assert.equal(page.isTapZonesEnabled(),false);
});

test('full gestures resolve current face/layout, every study action, disabled mode and all input guards on the real page',()=>{
  const {page,commands}=pageHarness();page.简洁模式=false;page.阶段='answer';page.quickAnswerMode=0;
  const config={...defaultStudyGestureConfig(),enabled:true,tapLayout:'nine',bindings:[]};
  const record=name=>(...args)=>commands.push([name,...args]);
  Object.assign(page,{返回:record('back'),请求删除当前卡:record('delete'),撤销上次:record('undo'),
    埋藏或暂停当前卡:record('bury/suspend'),playStudyAudio:record('replay'),openNoteEditor:record('edit'),
    changeMarking:record('mark/flag'),openStudyMenu:record('menu'),showStudyGuide:record('guide'),
    executeMenuAction:record('whiteboard'),configureAutoAdvance:record('auto_advance')});
  for(const {id:command} of STUDY_GESTURE_ACTIONS.slice(1)) {
    page.阶段=command==='flip'?'question':'answer';
    config.bindings=[{input:'up',command,side:'both'}];page.controlsJson=JSON.stringify({...defaultStudyControls(),gestureConfig:config});
    page.handleStudyGesture('up',0,0,1,1);assert.equal(commands.length,1,command);commands.length=0;
  }
  page.阶段='answer';config.bindings=[{input:'nine_center',command:'easy',side:'answer'},{input:'up',command:'good',side:'both'}];
  page.controlsJson=JSON.stringify({...defaultStudyControls(),gestureConfig:config});
  page.handleStudyGesture('tap',0.5,0.5,1,1);assert.deepEqual(commands,[3]);commands.length=0;
  page.handleStudyGesture('left',0,0,1,1);assert.deepEqual(commands,[],'full configuration does not inherit old swipe defaults');
  page.阶段='question';page.handleStudyGesture('up',0,0,1,1);assert.deepEqual(commands,[]);
  page.阶段='answer';
  for(const field of ['webInputFocused','answerInputFocused','studyMenuOpen','customSchedulingWarning','手写模式','cardRenderPending','flipPending']) {
    page[field]=true;page.handleStudyGesture('up',0,0,1,1);assert.deepEqual(commands,[],field);page[field]=false;
  }
  page.handleStudyGesture('up',0,0,0,1);page.handleStudyGesture('up',0,0,1,0);assert.deepEqual(commands,[]);
  page.简洁模式=true;page.handleStudyGesture('up',0,0,1,1);assert.deepEqual(commands,[],'simple mode cannot use experimental bindings');
  page.简洁模式=false;page.handleStudyGesture('up',0,0,1,1);assert.deepEqual(commands,[2]);
});

test('full script recognizes vertical swipes but yields to scrolling, edges, selection and old surfaces',()=>{
  const d=dom();d.install(7,9,false,['up','down']);
  let prevented=0;
  d.start();d.listeners.touchmove({touches:[d.point(200,100)],preventDefault(){prevented++;}});d.end(200,100);d.click();
  d.tick(500);d.start();d.end(200,300);
  assert.deepEqual(d.actions.map(a=>a[0]),['up','down']);assert.equal(prevented,1);
  d.tick(500);const scrolling={...d.plain,scrollHeight:1600,clientHeight:800};
  d.start(200,200,scrolling);d.listeners.touchmove({touches:[d.point(200,100)],preventDefault(){assert.fail('scroll was captured');}});d.end(200,100);
  d.start(200,5);d.end(200,100);d.select('text');d.start();d.end(200,100);d.select('');
  d.start();d.install(8,1,false,['up']);d.end(200,100);assert.equal(d.actions.length,2);
});

test('multi-finger taps wait for all releases, cancel synthetic clicks and reject motion, excess fingers, cancellation and stale input',()=>{
  for(const count of [2,3,4]) {
    const d=dom();d.install(1,1,false,['two_finger','three_finger','four_finger']);
    const points=Array.from({length:count},(_,id)=>({...d.point(160+id*20,200),identifier:id}));
    d.listeners.touchstart({touches:points.slice(0,1),target:d.plain});
    d.listeners.touchstart({touches:points,target:d.plain});
    d.listeners.touchend({touches:points.slice(1),changedTouches:points.slice(0,1)});assert.equal(d.actions.length,0);
    d.listeners.touchend({touches:[],changedTouches:points.slice(1)});d.click();d.tick(400);
    assert.deepEqual(d.actions.map(a=>a[0]),[['','','two_finger','three_finger','four_finger'][count]]);
  }
  for(const failure of ['move','five','cancel','stale','scroll','long','button','edge']) {
    const d=dom();d.install(1,1,false,['two_finger','four_finger']);
    const points=Array.from({length:failure==='five'?5:2},(_,id)=>({...d.point(failure==='edge'?5:160+id*20,200),identifier:id}));
    d.listeners.touchstart({touches:points,target:failure==='button'?{...d.plain,tagName:'BUTTON'}:d.plain});
    if(failure==='move') d.listeners.touchmove({touches:points.map(p=>({...p,clientY:220}))});
    if(failure==='cancel') d.listeners.touchcancel();
    if(failure==='stale') d.install(2,1,false,['two_finger']);
    if(failure==='scroll') d.plain.scrollTop=10;
    if(failure==='long') d.tick(501);
    d.listeners.touchend({touches:[],changedTouches:points});d.click();d.tick(400);
    assert.deepEqual(d.actions,[],failure);
  }
});

test('full single taps wait only when this face has a double-tap action; cancellations clear pending taps',()=>{
  const d=dom();d.install(1,1,false,['four_top_left']);d.click(d.plain,80,160);
  assert.deepEqual(d.actions,[['tap',0.2,0.2,1,1]]);
  d.install(1,2,false,['double','four_top_left']);d.click(d.plain,80,160);d.start();d.listeners.touchcancel();d.tick(400);
  assert.equal(d.actions.length,1);
});
