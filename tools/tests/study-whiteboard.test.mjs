// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { AppInterfaceTracker, WHITEBOARD_INTERFACE_ITEMS } from '../../entry/src/main/ets/model/AppInterface.ts';
import { buildAgentAppStructure } from '../../entry/src/main/ets/model/agent/AgentAppStructure.ts';
import { gesturePointer } from '../../entry/src/main/ets/model/GesturePointer.ts';
import { clampStudyToolbar } from '../../entry/src/main/ets/model/StudyLayout.ts';
import { resolveStudyKey } from '../../entry/src/main/ets/model/StudyInputPolicy.ts';
import { StudyWhiteboard } from '../../entry/src/main/ets/model/StudyWhiteboard.ts';
import { StudyAnnotationView } from '../../entry/src/main/ets/model/StudyAnnotationView.ts';
import { cardViewportWidth } from '../../entry/src/main/ets/model/CardViewportLayout.ts';
import { setStudyPenKitContext, clearStudyPenKitContext } from '../../entry/src/main/ets/backend/StudyPenKitContext.js';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';
import { localPreferenceApi } from './local-preference-harness.mjs';

const labels = new Map(JSON.parse(readFileSync(new URL('../../entry/src/main/resources/base/element/string.json', import.meta.url))).string.map(item => [item.name, item.value]));
function component(supported = true, measured = true, appearance = {}) {
  const tracker = new AppInterfaceTracker(), timers = new Map(), engines = [];
  let nextTimer = 0;
  const Component = loadComponentLogic('components/学习手写白板层.ets', '学习手写白板层', {
    WHITEBOARD_INTERFACE_ITEMS, StudyWhiteboard, StudyAnnotationView, cardViewportWidth, appInterface: tracker,
    loadStudyPaperTransparency: () => appearance.load?.() ?? 80,
    saveStudyPaperTransparency: value => appearance.save?.(value) ?? Promise.resolve(),
    showToastSafely: (_context, options) => appearance.toast?.(options.message),
    resourceText: (_context, resource) => resource,
    $r: name => name,
    SourceTool: { Finger: 1, Pen: 2, Unknown: 0 }, TouchType: { Down: 0, Up: 1, Move: 2, Cancel: 3 },
    GestureJudgeResult: { CONTINUE: 0, REJECT: 1 }, GestureControl: { GestureType: { PAN_GESTURE: 2 } },
    StudyPenCanvasHost: class {
      constructor(parameters, onFailure) { this.parameters = parameters; this.onFailure = onFailure; this.isDisposed = false; }
      dispose() { this.isDisposed = true; }
    },
    studyPenKitAvailability: () => ({ available: supported, reason: supported ? '' : 'capability_missing' }),
    console: { info() {}, warn() {} },
    interfaceControlText: (_context, items, id) => labels.get(items.find(item => item.id === id)?.titleKey),
    setTimeout: (fn, duration) => {
      assert.equal(duration, 15000);
      const id = ++nextTimer;
      timers.set(id, () => { timers.delete(id); fn(); });
      return id;
    },
    clearTimeout: id => timers.delete(id)
  });
  Component.prototype.getUIContext = () => ({});
  const instance = new Component();
  instance.isVisible = true;
  instance.reviewPhase = 'question';
  instance.onEngineChanged = official => engines.push(official);
  instance.aboutToAppear();
  if (measured) instance.updateViewport({ width: 400, height: 300, globalPosition: { x: 0, y: 0 } });
  if (supported && measured) instance.canvasLayoutChanged(0, 400, 300);
  return { instance, tracker, timers, engines, view: () => tracker.snapshot().find(item => item.surface === 'study_whiteboard') };
}

function nativeCanvasOptions(parameters, sdkApiVersion = 24) {
  const source = readFileSync(new URL('../../entry/src/main/ets/components/StudyPenCanvas.ets', import.meta.url), 'utf8');
  const options = source.match(/HandwriteComponent\((\{[^]*?\})\)/)[1];
  return new Function('parameters', 'deviceInfo', 'PenType',
    stripTypeScriptTypes('function buildOptions() { return ' + options + '; }', { mode: 'transform' }) + ';return buildOptions();')(
      parameters, { sdkApiVersion }, { PEN: 0 });
}

const fingersEvent = (points, extra = {}) => ({ sourceTool: 1,
  fingerInfos: points.map(([id, globalX, globalY]) => ({ id, localX: globalX, localY: globalY, globalX, globalY })), ...extra });

test('a single finger adds horizontal ink movement while the SDK retains vertical scrolling and the card stays fixed', () => {
  const { instance, view } = component(); instance.canvasInitialized(0);
  const poses = []; instance.onViewChanged = pose => poses.push(pose);
  const recognizer = (tag, fingers, builtIn = false, type = 2) => ({
    getTag: () => tag, getFingerCount: () => fingers, isBuiltIn: () => builtIn, getType: () => type,
    setEnabled() { assert.fail('the SDK must remain enabled'); }, preventBegin() { assert.fail('native scrolling is retained'); }
  });
  const current = recognizer('study_ink_horizontal', 1), nativePan = recognizer('', 1);
  const one = { ...fingersEvent([[7, 100, 120]], { offsetX: 0, offsetY: 0 }),
    fingerList: [{ id: 7, globalX: 100, globalY: 120 }] };
  assert.equal(instance.judgeInkPan(one, current, [nativePan]), 0);
  assert.equal(instance.judgeInkPan(one, current, []), 1, 'tools without a canvas pan cannot move the ink');
  assert.equal(instance.judgeInkPan(one, current, [nativePan, recognizer('slider', 1, true)]), 1);
  assert.equal(instance.judgeInkPan({ ...one, sourceTool: 2 }, current, [nativePan]), 1);
  assert.equal(instance.judgeInkPan({ ...one, fingerList: [...one.fingerList, { id: 9 }] }, current, [nativePan]), 1);
  instance.startInkPan(one);
  instance.updateInkPan({ ...one, offsetX: 60, offsetY: 80 });
  assert.equal(instance.inkOffsetX, 60);
  assert.deepEqual(instance.contentView.snapshot(), { scale: 1, x: 0, y: 0 });
  assert.deepEqual(poses, [], 'single-finger ink movement cannot change the card view');
  assert.equal(view().values.find(item => item.id === 'single_finger_navigation').value, 'ink_pan');
  assert.equal(view().values.find(item => item.id === 'ink_offset_x').value, '60');
  instance.inkPanActive = false;
  instance.viewScale = 2;
  instance.startInkPan(one);
  instance.updateInkPan({ ...one, offsetX: -40, offsetY: -100 });
  assert.equal(instance.inkOffsetX, 40, 'horizontal screen movement is divided by the current global scale');
  instance.updateInkPan({ ...one, offsetX: Infinity });
  assert.equal(instance.inkOffsetX, 40);
  instance.updateInkPan(fingersEvent([[7, 100, 120], [9, 200, 120]], { offsetX: 90 }));
  assert.equal(instance.inkPanActive, false);
  assert.equal(instance.inkOffsetX, 40, 'adding a second finger hands control back to the global view');
  instance.updateInkPan({ ...one, offsetX: 90 });
  assert.equal(instance.inkOffsetX, 40, 'the remaining finger cannot resume an ended gesture');
  instance.startInkPan(one);
  instance.startNavigation(fingersEvent([[7, 100, 120], [9, 200, 120]]), false);
  assert.equal(instance.inkPanActive, false, 'global navigation terminates horizontal ink movement immediately');
  instance.finishNavigation(false);
  instance.startInkPan(one);
  instance.trackTouch({ type: 0, sourceTool: 2, changedTouches: [{ id: 8 }] });
  assert.equal(instance.inkPanActive, false, 'pen down stops palm movement');
  instance.endNavigation();
  instance.isVisible = false; instance.inputConditionsChanged();
  assert.equal(instance.inkOffsetX, 40, 'hiding preserves the current card ink position');
  instance.isVisible = true; instance.inputConditionsChanged();
  instance.resetGlobalView();
  assert.equal(instance.inkOffsetX, 0, 'Reset brings the horizontally moved toolkit back into view');
  instance.startInkPan(one); instance.updateInkPan({ ...one, offsetX: 70 });
  instance.resetRequested();
  assert.equal(instance.inkOffsetX, 0, 'the next card resets the horizontal ink position');
  const source = readFileSync(new URL('../../entry/src/main/ets/components/学习手写白板层.ets', import.meta.url), 'utf8');
  assert.match(source, /private officialInk\(\)[^]*?Stack[^]*?ContentSlot[^]*?translate\(\{ x: this\.inkOffsetX \}\)/);
  assert.match(source, /\.onGestureRecognizerJudgeBegin\([^]*?this\.judgeInkPan\(event, current, others\)/);
  assert.match(source, /\.parallelGesture\(\s*PanGesture\(\{ fingers: 1[^]*?tag\('study_ink_horizontal'\)/);
  instance.aboutToDisappear();
});

test('global view continuously pans and zooms with two fingers while official pen tools remain usable', () => {
  const { instance, view } = component(); instance.canvasInitialized(0);
  const poses = []; instance.onViewChanged = pose => poses.push(pose);
  const start = fingersEvent([[4, 50, 100], [9, 150, 100]]);
  instance.startNavigation(start, true);
  instance.navigate(fingersEvent([[9, 250, 130], [4, 50, 130]]), true);
  assert.deepEqual(poses.at(-1), { scale: 2, x: -50, y: -70 });
  instance.startNavigation(fingersEvent([[4, 50, 130], [9, 250, 130]]), false);
  instance.navigate(fingersEvent([[4, 80, 150], [9, 280, 150]]), false);
  assert.deepEqual(poses.at(-1), { scale: 2, x: -20, y: -50 });
  instance.finishNavigation(true);
  instance.navigate(fingersEvent([[4, 100, 180], [9, 300, 180]]), false);
  assert.deepEqual(poses.at(-1), { scale: 2, x: 0, y: -20 }, 'ending pinch cannot terminate active two-finger pan');
  instance.finishNavigation(false);
  instance.navigate(fingersEvent([[4, 200, 180], [9, 400, 180]]), false);
  assert.deepEqual(instance.contentView.snapshot(), { scale: 2, x: 0, y: -20 }, 'ended input cannot resume');
  instance.startNavigation(start, false);
  for (let step = 1; step <= 5; step++) {
    instance.navigate(fingersEvent([[4, 50 + step * 10, 100], [9, 150 + step * 10, 100]]), false);
    assert.deepEqual(poses.at(-1), { scale: 2, x: step * 10, y: -20 });
  }
  assert.equal(view().items.some(item => item.id === 'move'), false);
  assert.equal(view().items.find(item => item.id === 'official_tools').enabled, true);
  assert.equal(instance.judgeNavigation({ tag: 'study_global_pan' }, { sourceTool: 1 }), 0);
  assert.equal(instance.judgeNavigation({ tag: 'study_global_zoom' }, { sourceTool: 1 }), 0);
  assert.equal(instance.judgeNavigation({ tag: 'study_global_pan' }, { sourceTool: 2 }), 1);
  assert.equal(instance.judgeNavigation({ tag: 'sdk_pen' }, { sourceTool: 2 }), 0);
  assert.equal(view().values.find(value => value.id === 'navigation_scope').value, 'study_content');
  assert.equal(view().values.find(value => value.id === 'navigation').value, 'global_pan_zoom');
  assert.equal(view().values.find(value => value.id === 'toolbar_follows_view').value, 'true');
  const source = readFileSync(new URL('../../entry/src/main/ets/components/StudyContentViewport.ets', import.meta.url), 'utf8');
  assert.match(source, /PanGesture\(\{ fingers: 2/);
  assert.match(source, /PinchGesture\(\{ fingers: 2/);
  assert.doesNotMatch(source, /moveMode|HitTestMode\.Block/);
  instance.aboutToDisappear();
});

test('global reset preserves ink, history, controller and card generation, while the next card resets all view state', () => {
  const { instance, view } = component(); instance.canvasInitialized(0);
  const host = instance.canvasHost;
  instance.localSession.setViewport(400, 300);
  instance.localSession.begin(4, 20, 10, 'auto'); instance.localSession.finish(4);
  const before = []; instance.localSession.visitStrokes(stroke => before.push(structuredClone(stroke)));
  instance.startNavigation(fingersEvent([[7, 10, 10], [9, 110, 10]]), false);
  instance.navigate(fingersEvent([[7, 40, 30], [9, 140, 30]]), false);
  instance.resetGlobalView();
  assert.deepEqual(instance.contentView.snapshot(), { scale: 1, x: 0, y: 0 });
  const after = []; instance.localSession.visitStrokes(stroke => after.push(structuredClone(stroke)));
  assert.deepEqual(after, before); assert.equal(instance.localSession.canUndo(), true);
  assert.equal(instance.canvasHost, host); assert.equal(host.isDisposed, false); assert.equal(instance.canvasGeneration, 0);
  assert.equal(view().items.find(item => item.id === 'reset_view').title, '复位');
  instance.isVisible = false; instance.inputConditionsChanged();
  instance.resetGlobalView();
  assert.equal(instance.panActive, false, 'hidden input ends navigation');
  instance.isVisible = true; instance.inputConditionsChanged();
  instance.resetRequested();
  assert.equal(host.isDisposed, true);
  assert.deepEqual(instance.contentView.snapshot(), { scale: 1, x: 0, y: 0 });
  instance.aboutToDisappear();
});

test('global navigation protects pen writing, follows window coordinates and rejects hidden or stale input', () => {
  const { instance } = component(); instance.canvasInitialized(0);
  instance.rootX = 20; instance.rootY = 40;
  instance.startNavigation(fingersEvent([[4, 70, 140], [9, 170, 140]]), false);
  assert.equal(instance.panActive, true);
  instance.trackTouch({ type: 0, sourceTool: 2, changedTouches: [{ id: 27 }] });
  assert.equal(instance.panActive, false, 'pen contact ends running navigation before writing');
  instance.navigate(fingersEvent([[4, 100, 170], [9, 200, 170]]), false);
  assert.deepEqual(instance.contentView.snapshot(), { scale: 1, x: 0, y: 0 });
  instance.startNavigation(fingersEvent([[4, 70, 140], [9, 170, 140]]), true);
  assert.equal(instance.pinchActive, false);
  instance.trackTouch({ type: 1, sourceTool: 2, changedTouches: [{ id: 27 }] });
  instance.startNavigation(fingersEvent([[4, 70, 140], [9, 170, 140]]), true);
  instance.navigate(fingersEvent([[4, 70, 170], [9, 270, 170]]), true);
  assert.deepEqual(instance.contentView.snapshot(), { scale: 2, x: -50, y: -70 });
  const before = instance.contentView.snapshot(), host = instance.canvasHost;
  instance.isVisible = false; instance.inputConditionsChanged();
  instance.navigate(fingersEvent([[4, 70, 170], [9, 370, 170]]), true);
  assert.deepEqual(instance.contentView.snapshot(), before); assert.equal(instance.canvasHost, host);
  instance.isVisible = true; instance.inputConditionsChanged();
  instance.navigate(fingersEvent([[4, 70, 170], [9, 370, 170]]), true);
  assert.deepEqual(instance.contentView.snapshot(), before, 'an ended gesture cannot resume with stale updates');
  instance.aboutToDisappear();
});

test('SDK zoom is disabled only on supported versions so the shared global transform cannot double scale', () => {
  const parameters = { generation: 0, controller: {}, viewportHeight: 300, onReady() {}, onScale() {} };
  for (const version of [18, 23, 24]) {
    const options = nativeCanvasOptions(parameters, version);
    assert.equal(options.scaleDisabled, version >= 23 ? true : undefined);
    assert.equal(options.maxCanvasHeight, version >= 23 ? 300 : undefined);
    assert.equal(options.handwriteController, parameters.controller);
  }
});

test('paper transparency is bounded, observed and back dismisses its popup before closing handwriting', () => {
  const { instance, view } = component();
  let closes = 0;
  instance.onClose = () => closes++;
  assert.equal(view().items.find(item => item.id === 'close').iconKey, 'ic_common_close');
  assert.equal(view().items.find(item => item.id === 'opacity').title, '透明度');
  assert.equal(view().items.find(item => item.id === 'opacity').iconKey, undefined, 'transparency remains a text control');
  assert.equal(instance.paperTransparency, 80);
  instance.setPaperTransparency(37.6);
  assert.equal(view().values.find(value => value.id === 'paper_transparency').value, '38');
  instance.setPaperTransparency(Infinity);
  assert.equal(instance.paperTransparency, 38);
  instance.setPaperTransparency(-1); assert.equal(instance.paperTransparency, 0);
  instance.setPaperTransparency(105); assert.equal(instance.paperTransparency, 100);
  instance.toggleOpacity();
  assert.equal(view().items.find(item => item.id === 'opacity').selected, true);
  instance.backRequested(); assert.equal(closes, 0); assert.equal(instance.opacityOpen, false);
  instance.backRequested(); assert.equal(closes, 1);
  instance.toggleOpacity(); instance.isInputEnabled = false; instance.inputConditionsChanged();
  assert.equal(instance.opacityOpen, false);
  instance.setPaperTransparency(20); assert.equal(instance.paperTransparency, 100);
  instance.aboutToDisappear();
});

test('paper transparency previews without disk writes, commits the final value and survives canvas resets', async () => {
  const writes = [], pending = [];
  const { instance, view } = component(true, true, { load: () => 73,
    save: value => { writes.push(value); return new Promise(resolve => pending.push(resolve)); } });
  assert.equal(instance.paperTransparency, 73);
  instance.setPaperTransparency(60, false);
  assert.equal(view().values.find(value => value.id === 'paper_transparency_saved').value, 'false');
  assert.deepEqual(writes, []);
  instance.setPaperTransparency(60);
  instance.setPaperTransparency(73);
  assert.deepEqual(writes, [60, 73], 'returning to the old value must supersede an unfinished write');
  pending.shift()(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(instance.paperTransparency, 73, 'late saves cannot overwrite the slider');
  assert.equal(view().values.find(value => value.id === 'paper_transparency_saved').value, 'false');
  pending.shift()(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(view().values.find(value => value.id === 'paper_transparency_saved').value, 'true');
  instance.resetRequested();
  assert.equal(instance.paperTransparency, 73, 'changing card must not reset the saved appearance');
  instance.setPaperTransparency(44, false);
  instance.closeHandwriting();
  assert.deepEqual(writes, [60, 73, 44], 'closing mid-adjustment commits the preview');
  pending.shift()(); await new Promise(resolve => setImmediate(resolve));
  instance.aboutToDisappear();
});

test('paper transparency persistence uses the shared local preference queue and reports disk failures', async () => {
  const cache = new Map(), disk = new Map(), app = new Map();
  let fail = false;
  const store = { getSync: (key, fallback) => cache.get(key) ?? fallback,
    putSync: (key, value) => cache.set(key, value),
    flush: async () => { if (fail) throw Error('disk full'); for (const [key, value] of cache) disk.set(key, value); } };
  const storage = { get: () => ({}), setOrCreate: (key, value) => app.set(key, value) };
  const local = localPreferenceApi(storage);
  const api = loadPlatformModule('utils/StudyWhiteboardAppearanceStore.ets',
    '({ loadStudyPaperTransparency, saveStudyPaperTransparency })', {
      AppStorage: storage, preferences: { getPreferencesSync: () => store },
      saveLocalPreference: local.saveLocalPreference, console: { warn() {} }
    });
  assert.equal(api.loadStudyPaperTransparency(), 80, 'first run defaults to 80%');
  await api.saveStudyPaperTransparency(37.6);
  assert.equal(api.loadStudyPaperTransparency(), 38);
  cache.clear(); for (const [key, value] of disk) cache.set(key, value);
  assert.equal(api.loadStudyPaperTransparency(), 38, 'a new process restores the disk value');
  const toasts = [];
  const { instance, view } = component(true, true, { load: api.loadStudyPaperTransparency,
    save: api.saveStudyPaperTransparency, toast: message => toasts.push(message) });
  fail = true;
  instance.setPaperTransparency(55);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(api.loadStudyPaperTransparency(), 38, 'a failed write rolls back the preference cache');
  assert.equal(view().values.find(value => value.id === 'paper_transparency_saved').value, 'false');
  assert.deepEqual(toasts, ['app.string.study_whiteboard_opacity_save_failed']);
  fail = false;
  instance.setPaperTransparency(55);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(api.loadStudyPaperTransparency(), 55, 'a failed write can be retried');
  instance.aboutToDisappear();
});

test('opening handwriting directly selects Huawei without another mode button and only a real failure restores the local renderer', () => {
  const { instance, view, timers, engines } = component(true, false);
  const host = instance.canvasHost;
  assert.ok(host);
  assert.equal(timers.size, 1);
  assert.deepEqual(engines, [true]);
  assert.equal(view().values.find(item => item.id === 'engine').value, 'huawei_pen_kit');
  assert.equal(view().items.some(item => ['annotation', 'official_board'].includes(item.id)), false);
  assert.equal(view().items.find(item => item.id === 'reset_view').enabled, false);
  assert.equal(view().items.some(item => item.id === 'move'), false);
  let closes = 0; instance.onClose = () => closes++;
  instance.backRequested(); assert.equal(closes, 1);
  instance.localSession.setViewport(200, 100);
  instance.localSession.begin(4, 20, 10, 'auto'); instance.localSession.finish(4);
  host.parameters.onReady(0); host.parameters.onLayout(0, 400, 300);
  assert.equal(instance.canvasReady, true);
  assert.equal(timers.size, 0);
  instance.isVisible = false; instance.inputConditionsChanged();
  instance.isVisible = true; instance.inputConditionsChanged();
  assert.equal(instance.canvasHost, host);
  assert.equal(host.isDisposed, false);
  host.onFailure(0, 'load_failed');
  assert.equal(instance.canvasFailed, true);
  assert.equal(engines.at(-1), false);
  assert.equal(view(), undefined, 'fallback child publishes its own actual state');
  assert.equal(instance.localSession.hasInk(), true, 'native failure cannot destroy the fallback draft');
  assert.equal(host.isDisposed, true);
  instance.aboutToDisappear();
});

test('official canvas keeps its generation across hide/reopen and blocks stale callbacks after next question', () => {
  const { instance, view, timers } = component();
  assert.equal(view().busy, true);
  assert.equal(view().items.find(item => item.id === 'official_tools').enabled, false);
  instance.canvasInitialized(0);
  assert.equal(timers.size, 0);
  assert.equal(view().busy, false);
  instance.scaleChanged(0, 1.5);
  assert.equal(view().values.find(value => value.id === 'scale').value, '1.5');
  instance.isVisible = false; instance.publishInterface();
  assert.equal(view(), undefined);
  assert.equal(instance.canvasGeneration, 0);
  assert.equal(instance.canvasReady, true);
  const originalHost = instance.canvasHost;
  instance.isVisible = true; instance.publishInterface();
  assert.equal(instance.canvasGeneration, 0, 'hide/reopen does not replace the native controller');
  assert.equal(instance.canvasHost, originalHost);
  assert.equal(originalHost.isDisposed, false);
  assert.equal(view().values.find(value => value.id === 'scale').value, '1.5');
  instance.resetRequested();
  assert.equal(instance.canvasGeneration, 1);
  assert.equal(originalHost.isDisposed, true);
  assert.equal(instance.canvasReady, false);
  instance.canvasInitialized(0); instance.scaleChanged(0, 3);
  assert.equal(instance.canvasReady, false);
  assert.equal(instance.canvasScale, 1);
  instance.canvasInitialized(1);
  instance.canvasLayoutChanged(1, 400, 300);
  instance.scaleChanged(1, NaN);
  assert.equal(instance.canvasReady, true);
  assert.equal(instance.canvasScale, 1);
  instance.aboutToDisappear();
  instance.canvasInitialized(1); instance.scaleChanged(1, 2);
  assert.equal(view(), undefined);
  assert.equal(timers.size, 0);
});

test('unsupported device selects the original whiteboard without creating a Pen Kit host', () => {
  const { instance, view, timers, engines } = component(false);
  assert.equal(instance.isSupported, false);
  assert.equal(instance.fallbackReason, 'capability_missing');
  assert.equal(instance.canvasHost, null, 'capability rejection happens before any optional module host exists');
  assert.equal(timers.size, 0);
  assert.deepEqual(engines, [false]);
  assert.equal(view(), undefined, 'the local renderer owns fallback observations');
  assert.ok(instance.localSession instanceof StudyWhiteboard);
  instance.localSession.setViewport(200, 100);
  assert.ok(instance.localSession.begin(4, 20, 10, 'auto'));
  instance.localSession.finish(4);
  assert.equal(instance.localSession.hasInk(), true);
  instance.resetRequested();
  assert.equal(instance.canvasGeneration, 0);
  assert.equal(instance.localSession.hasInk(), true, 'the local renderer receives the same resetTick and owns clearing');
  instance.aboutToDisappear();
  assert.equal(instance.localSession.hasInk(), false);
});

test('module loading failure automatically hands off to the original engine for the rest of study', () => {
  const { instance, view, timers, engines, tracker } = component();
  const failedHost = instance.canvasHost;
  failedHost.parameters.onReady(0);
  failedHost.onFailure(0);
  assert.equal(instance.canvasFailed, true);
  assert.equal(instance.fallbackReason, 'load_failed');
  assert.equal(instance.canvasReady, false, 'a partially initialized build cannot hide its later failure');
  assert.equal(failedHost.isDisposed, true);
  assert.equal(timers.size, 0);
  assert.equal(view(), undefined);
  assert.deepEqual(engines, [true, false]);
  tracker.observe({ surface: 'study_whiteboard', sectionId: '', selectedId: '', optionIds: [], optionLabels: [],
    busy: false, items: [], values: [{ id: 'engine', value: 'local_canvas' }] });
  failedHost.onFailure(0);
  assert.equal(view().values[0].value, 'local_canvas', 'a repeated native failure cannot erase local state');
  instance.resetRequested();
  failedHost.parameters.onReady(0);
  assert.equal(instance.canvasFailed, true);
  assert.equal(instance.canvasReady, false);
  assert.equal(instance.canvasHost, failedHost, 'next-card notifications cannot retry a broken kit');
  assert.equal(instance.canvasGeneration, 0);
  assert.deepEqual(engines, [true, false]);
  instance.aboutToDisappear();
  assert.equal(instance.canvasHost, null);
});

function canvasHostHarness() {
  const nodes = [], uncaught = [], lifecycle = [];
  let scoped = false, controllers = 0, constructorError = null, buildError = null, attachError = null;
  const abilityContext = { resourceManager: {} };
  const context = {
    getHostContext: () => abilityContext,
    runScopedTask(callback) {
      scoped = true;
      try { callback(); } catch (error) { uncaught.push(error); } finally { scoped = false; }
    }
  };
  const BuilderNode = class {
    constructor(context) { this.context = context; this.frame = {}; this.disposals = 0; this.updates = []; nodes.push(this); }
    build(builder, parameters, options) {
      assert.equal(scoped, true, 'native rendering keeps the correct UI scope after async loading');
      assert.equal(options.nestingBuilderSupported, true);
      if (buildError) throw buildError;
      this.parameters = parameters;
      builder(parameters);
    }
    update(parameters) {
      assert.equal(scoped, true);
      this.updates.push({ ...parameters });
    }
    getFrameNode() { return this.frame; }
    dispose() { this.disposals++; lifecycle.push(['dispose', this.frame]); }
  };
  const nativeSource = readFileSync(new URL('../../entry/src/main/ets/components/StudyPenCanvas.ets', import.meta.url), 'utf8');
  const nativeLogic = nativeSource.replace(/^import[^;]+;\s*/gm, '').replace(/^export /gm, '')
    .replace(/@Builder\nfunction studyPenCanvas[^]*?^}\n/m, '')
    .replace(/^const studyPenCanvasBuilder[^\n]+\n/m, '');
  const factory = new Function('HandwriteController', 'BuilderNode', 'studyPenCanvasBuilder', 'deviceInfo',
    stripTypeScriptTypes(nativeLogic, { mode: 'transform' }) + ';return createStudyPenCanvas;')(
    class {
      constructor() {
        assert.equal(scoped, true, 'the SDK controller is constructed in the host UI scope');
        assert.equal(globalThis._brushEngineContext, abilityContext, 'Pen Kit context precedes the SDK constructor');
        if (constructorError) throw constructorError;
        this.id = ++controllers;
      }
      scrolls = [];
      scrollTo(offset) { this.scrolls.push(offset); }
    }, BuilderNode, parameters => {
      parameters.onReady(parameters.generation);
    }, { sdkApiVersion: 24 });
  const Host = loadPlatformModule('components/StudyPenCanvasHost.ets', 'StudyPenCanvasHost', {
    console: { error() {} },
    // 只模拟公开的插入/移除契约，不把插入或 SDK 初始化冒充布局回调。
    NodeContent: class {
      frames = [];
      addFrameNode(frame) {
        assert.equal(scoped, true);
        if (attachError) throw attachError;
        this.frames.push(frame);
        lifecycle.push(['attach', frame]);
      }
      removeFrameNode(frame) {
        this.frames = this.frames.filter(item => item !== frame);
        lifecycle.push(['detach', frame]);
      }
    },
    setStudyPenKitContext
  });
  return { Host, nodes, context, factory, uncaught, lifecycle,
    failConstructor(error) { constructorError = error; }, failBuild(error) { buildError = error; },
    failAttach(error) { attachError = error; } };
}

test('optional canvas loads on mounting once and disposes its built node once', async () => {
  const { Host, nodes, context, factory } = canvasHostHarness();
  let loads = 0, initializations = 0;
  const layouts = [];
  const parameters = { generation: 3, onReady: id => { assert.equal(id, 3); initializations++; },
    onLayout: (...args) => layouts.push(args), onScale() {} };
  const host = new Host(parameters, () => assert.fail('unexpected failure'), async () => {
    loads++; return factory;
  });
  assert.equal(loads, 0, 'constructing the startup-safe host does not load the system HSP');
  host.setViewport(context, 400, 300);
  host.setViewport(context, 400, 300);
  await Promise.resolve();
  assert.equal(loads, 1);
  assert.equal(initializations, 1);
  assert.deepEqual(layouts, [], 'insertion alone does not claim a successful platform layout');
  nodes[0].parameters.onLayout(3, 400, 300);
  assert.deepEqual(layouts, [[3, 400, 300]]);
  assert.equal(nodes[0].context, context);
  assert.deepEqual(host.getContent().frames, [nodes[0].frame]);
  assert.equal(nodes[0].parameters.viewportWidth, 400);
  assert.equal(nodes[0].parameters.viewportHeight, 300);
  host.dispose(); host.dispose();
  assert.equal(nodes[0].disposals, 1);
  assert.deepEqual(host.getContent().frames, []);
});

test('SDK init and explicit insertion stay pending until the platform reports the mounted layout', async () => {
  const { Host, nodes, context, factory, uncaught } = canvasHostHarness();
  const { instance, timers, view } = component(true, false);
  let completeImport;
  const parameters = instance.canvasHost.parameters;
  const failure = instance.canvasHost.onFailure;
  const host = new Host(parameters, failure, () => new Promise(resolve => { completeImport = resolve; }));
  instance.canvasHost = host;
  host.setViewport(context, 400, 300);
  assert.equal(instance.canvasReady, false);
  completeImport(factory);
  await Promise.resolve();
  assert.equal(instance.sdkInitialized, true);
  assert.deepEqual(host.getContent().frames, [nodes[0].frame]);
  assert.equal(instance.canvasReady, false);
  assert.equal(timers.size, 1);
  nodes[0].parameters.onLayout(0, 400, 300);
  assert.equal(instance.canvasReady, true, 'the initialized SDK must also be attached to the visible host');
  assert.equal(timers.size, 0);
  assert.equal(view().busy, false);
  assert.equal(uncaught.length, 0);
  instance.aboutToDisappear();
});

test('attachment errors are caught inside the UI scope and dispose the partially constructed kit', async () => {
  const { Host, context, factory, nodes, uncaught, failAttach } = canvasHostHarness();
  const { instance, engines } = component(true, false);
  failAttach(new Error('native NodeContent attachment failed'));
  const host = new Host(instance.canvasHost.parameters, instance.canvasHost.onFailure, async () => factory);
  instance.canvasHost = host;
  host.setViewport(context, 400, 300);
  await Promise.resolve();
  assert.equal(instance.canvasFailed, true);
  assert.equal(instance.fallbackReason, 'initialization_failed');
  assert.equal(instance.canvasReady, false);
  assert.equal(nodes[0].disposals, 1);
  assert.equal(uncaught.length, 0, 'native attachment errors cannot escape the scoped callback');
  assert.deepEqual(engines, [true, false]);
  instance.aboutToDisappear();
});

test('the canvas waits for finite bounds, uses the latest async bounds and resizes without replacing ink ownership', async () => {
  const { Host, nodes, context, factory, lifecycle } = canvasHostHarness();
  let completeImport, loads = 0;
  const host = new Host({ generation: 0, onReady() {}, onLayout() {}, onScale() {} },
    () => assert.fail('unexpected failure'), () => {
      loads++;
      return new Promise(resolve => { completeImport = resolve; });
    });
  for (const [width, height] of [[0, 300], [400, 0], [NaN, 300], [400, Infinity]]) {
    host.setViewport(context, width, height);
  }
  assert.equal(loads, 0, 'unmeasured containers cannot build a detached fullscreen canvas');
  host.setViewport(context, 400, 300);
  host.setViewport(context, 600, 500);
  completeImport(factory);
  await Promise.resolve();
  assert.equal(loads, 1);
  assert.equal(nodes[0].parameters.viewportWidth, 600);
  assert.equal(nodes[0].parameters.viewportHeight, 500);
  const controller = nodes[0].parameters.controller;
  host.setViewport(context, 500, 600);
  host.setViewport(context, 500, 600);
  assert.equal(nodes.length, 1, 'orientation changes preserve the same SDK controller and ink');
  assert.equal(nodes[0].updates.length, 1);
  assert.equal(nodes[0].updates[0].controller, controller);
  assert.equal(nodes[0].updates[0].viewportHeight, 600);
  host.setViewport(context, 0, 0);
  host.setViewport(context, 500, 600);
  assert.equal(nodes[0].updates.length, 1, 'hide/reopen does not invalidate or replace the retained native tree');
  host.dispose();
  assert.deepEqual(lifecycle, [['attach', nodes[0].frame], ['detach', nodes[0].frame], ['dispose', nodes[0].frame]]);
});

test('bounds lost during import defer construction until a measured viewport returns', async () => {
  const { Host, nodes, context, factory } = canvasHostHarness();
  let completeImport;
  const host = new Host({ generation: 0, onReady() {}, onLayout() {}, onScale() {} },
    () => assert.fail('unexpected failure'), () => new Promise(resolve => { completeImport = resolve; }));
  host.setViewport(context, 400, 300);
  host.setViewport(context, 0, 0);
  completeImport(factory);
  await Promise.resolve();
  assert.equal(nodes.length, 0);
  host.setViewport(context, 300, 400);
  completeImport(factory);
  await Promise.resolve();
  assert.equal(nodes.length, 1);
  assert.deepEqual(host.getContent().frames, [nodes[0].frame]);
  host.dispose();
});

test('late module load after disposal creates no UI; load and build errors reach the failure callback', async () => {
  const { Host, nodes, context, factory, failBuild } = canvasHostHarness();
  let resolveLoad;
  const lateHost = new Host({ generation: 1 }, () => assert.fail('late callback'),
    () => new Promise(resolve => { resolveLoad = resolve; }));
  lateHost.setViewport(context, 400, 300); lateHost.dispose(); resolveLoad(() => assert.fail('late build'));
  await Promise.resolve();
  assert.equal(nodes.length, 0);
  const failures = [];
  const missingHost = new Host({ generation: 2 }, (id, reason) => failures.push([id, reason]), async () => { throw new Error('module unavailable'); });
  missingHost.setViewport(context, 400, 300); await Promise.resolve();
  assert.deepEqual(failures, [[2, 'load_failed']]);
  assert.deepEqual(missingHost.getContent().frames, []);
  failBuild(new Error('build failed'));
  const brokenHost = new Host({ generation: 3 }, (id, reason) => failures.push([id, reason]), async () => factory);
  brokenHost.setViewport(context, 400, 300); await Promise.resolve();
  assert.deepEqual(failures, [[2, 'load_failed'], [3, 'initialization_failed']]);
  assert.equal(nodes[0].disposals, 1);
});

test('the recorded SDK constructor error reaches fallback before ArkUI can handle it as an uncaught render error', async () => {
  const { Host, nodes, context, factory, failConstructor, uncaught } = canvasHostHarness();
  failConstructor(new TypeError('Cannot read property createSystemHspModuleResourceManager of undefined'));
  const { instance, engines } = component();
  const host = new Host({ generation: 0, onReady: () => assert.fail('failed initialization must not report ready'), onLayout() {}, onScale() {} },
    instance.canvasHost.onFailure, async () => factory);
  instance.canvasHost = host;
  host.setViewport(context, 400, 300);
  await Promise.resolve();
  assert.equal(instance.canvasFailed, true);
  assert.equal(instance.fallbackReason, 'initialization_failed');
  assert.deepEqual(engines, [true, false]);
  assert.equal(nodes.length, 0, 'controller construction fails before entering any render builder');
  assert.equal(uncaught.length, 0, 'the exception cannot escape the UI scope callback into the framework fault handler');
  instance.aboutToDisappear();
});

test('missing host context or resource manager falls back before importing the system HSP', async () => {
  const { Host } = canvasHostHarness();
  for (const hostContext of [undefined, {}]) {
    const failures = [];
    const host = new Host({ generation: 4 }, (id, reason) => failures.push([id, reason]),
      async () => assert.fail('invalid context must not reach the optional module import'));
    host.setViewport({ getHostContext: () => hostContext }, 400, 300);
    await Promise.resolve();
    assert.deepEqual(failures, [[4, 'context_missing']]);
  }
});

test('disposing the host during initialization releases the newly created mount and suppresses late failure', async () => {
  const { Host, nodes, context, factory, uncaught } = canvasHostHarness();
  const host = new Host({ generation: 2, onReady: () => host.dispose(), onLayout() {}, onScale() {} },
    () => assert.fail('a disposed host must not report failure'), async () => factory);
  host.setViewport(context, 400, 300);
  await Promise.resolve();
  assert.equal(nodes[0].disposals, 1);
  assert.deepEqual(host.getContent().frames, []);
  assert.equal(uncaught.length, 0);
});

test('the SDK global context bridge follows ability lifetime without clearing another live ability', () => {
  const first = {}, second = {};
  setStudyPenKitContext(first);
  assert.equal(globalThis._brushEngineContext, first);
  setStudyPenKitContext(second);
  clearStudyPenKitContext(first);
  assert.equal(globalThis._brushEngineContext, second);
  clearStudyPenKitContext(second);
  assert.equal(globalThis._brushEngineContext, undefined);
  const ability = readFileSync(new URL('../../entry/src/main/ets/entryability/EntryAbility.ets', import.meta.url), 'utf8');
  assert.match(ability, /onCreate\([^]*?setStudyPenKitContext\(this\.context\)/);
  assert.match(ability, /onDestroy\([^]*?clearStudyPenKitContext\(this\.context\)/);
});

test('startup static imports cannot reach the optional Pen Kit HSP', () => {
  const root = fileURLToPath(new URL('../../entry/src/main/ets/', import.meta.url));
  const pending = [resolve(root, 'entryability/EntryAbility.ets'), resolve(root, 'pages/首页.ets')], visited = new Set();
  while (pending.length) {
    const path = pending.pop();
    if (visited.has(path)) continue;
    visited.add(path);
    const source = readFileSync(path, 'utf8');
    for (const match of source.matchAll(/^import\s+[^;]+?\s+from\s+['"]([^'"]+)['"]/gm)) {
      assert.notEqual(match[1], '@kit.Penkit', 'startup loads the unavailable system HSP through ' + path);
      if (!match[1].startsWith('.')) continue;
      const target = resolve(dirname(path), match[1]);
      const module = [target, target + '.ets', target + '.ts', target + '.js'].find(existsSync);
      if (module) pending.push(module);
    }
  }
  assert.ok(visited.has(resolve(root, 'components/StudyPenCanvasHost.ets')));
  assert.equal(visited.has(resolve(root, 'components/StudyPenCanvas.ets')), false);
});

test('real devices use the official capability without requiring internal sandbox paths to exist before loading', () => {
  const deviceInfo = { productModel: 'SLG-W50' };
  let capability = false;
  const dependencies = { deviceInfo,
    canIUse: name => { assert.equal(name, 'SystemCapability.Stylus.Handwrite'); return capability; },
    fileIo: { accessSync() { assert.fail('real-device system modules need not be accessible through fileIo'); } }
  };
  const probe = loadPlatformModule('backend/StudyPenKitAvailability.ets', 'studyPenKitAvailability', dependencies);
  const available = loadPlatformModule('backend/StudyPenKitAvailability.ets', 'isStudyPenKitAvailable', dependencies);
  assert.deepEqual(probe(), { available: false, reason: 'capability_missing' });
  capability = true;
  for (const model of ['SLG-W50', 'HUAWEI phone', 'HUAWEI PC']) {
    deviceInfo.productModel = model;
    assert.deepEqual(probe(), { available: true, reason: '' });
    assert.equal(available(), true);
  }
  capability = false;
  assert.equal(available(), false);
});

test('the known emulator model follows the official unsupported boundary without probing internal HSP files', () => {
  let capability = false;
  const deviceInfo = { productModel: 'emulator' };
  const dependencies = {
    canIUse: name => { assert.equal(name, 'SystemCapability.Stylus.Handwrite'); return capability; },
    deviceInfo,
    fileIo: { accessSync() { assert.fail('internal file presence is not a supported capability probe'); } }
  };
  const available = loadPlatformModule('backend/StudyPenKitAvailability.ets', 'isStudyPenKitAvailable', {
    ...dependencies
  });
  const probe = loadPlatformModule('backend/StudyPenKitAvailability.ets', 'studyPenKitAvailability', dependencies);
  assert.equal(available(), false);
  assert.deepEqual(probe(), { available: false, reason: 'capability_missing' });
  capability = true;
  for (const model of ['emulator', 'EMULATOR']) {
    deviceInfo.productModel = model;
    assert.equal(available(), false);
    assert.deepEqual(probe(), { available: false, reason: 'emulator_unsupported' });
  }
});

test('initialization timeout falls back automatically while stale timers cannot reject a new generation', () => {
  const { instance, view, timers, engines } = component();
  const staleTimer = timers.get(instance.initTimer);
  instance.resetRequested();
  staleTimer();
  assert.equal(instance.canvasFailed, false);
  timers.get(instance.initTimer)();
  assert.equal(instance.canvasFailed, true);
  assert.equal(instance.fallbackReason, 'init_timeout');
  assert.equal(view(), undefined);
  assert.deepEqual(engines, [true, false]);
  assert.equal(timers.size, 0);
  instance.canvasInitialized(1);
  assert.equal(instance.canvasReady, false, 'a late ready callback cannot replace the fallback');
  instance.resetRequested();
  assert.equal(instance.canvasGeneration, 1);
  assert.equal(instance.canvasFailed, true);
});

test('an SDK initialization callback with no mounted canvas cannot cancel fallback or enable JIDE tools', () => {
  const { instance, timers, engines, view } = component(true, false);
  const host = instance.canvasHost;
  host.parameters.onReady(0);
  assert.equal(instance.canvasReady, false);
  assert.equal(view().busy, true);
  assert.equal(view().values.find(value => value.id === 'initialized').value, 'true');
  assert.equal(view().values.find(value => value.id === 'layout_ready').value, 'false');
  assert.equal(view().items.find(item => item.id === 'official_tools').enabled, false);
  for (const [width, height] of [[0, 300], [400, 0], [NaN, 300], [400, Infinity], [-1, 300]]) {
    host.parameters.onLayout(0, width, height);
    assert.equal(instance.canvasReady, false);
    assert.equal(timers.size, 1, 'invalid layout must keep the active watchdog');
  }
  timers.get(instance.initTimer)();
  assert.equal(instance.fallbackReason, 'layout_timeout');
  assert.equal(instance.canvasFailed, true);
  assert.equal(host.isDisposed, true);
  assert.deepEqual(engines, [true, false]);
  host.parameters.onLayout(0, 400, 300);
  assert.equal(instance.canvasReady, false, 'late measurement cannot restore the failed suite');
  assert.equal(view(), undefined);
  instance.aboutToDisappear();
});

test('layout and SDK initialization must both complete in either order; lost layout and resets reject old measurements', () => {
  for (const layoutFirst of [false, true]) {
    const { instance, timers, view } = component(true, false);
    const host = instance.canvasHost;
    if (layoutFirst) host.parameters.onLayout(0, 400, 300);
    else host.parameters.onReady(0);
    assert.equal(instance.canvasReady, false);
    assert.equal(timers.size, 1);
    if (layoutFirst) host.parameters.onReady(0);
    else host.parameters.onLayout(0, 400, 300);
    assert.equal(instance.canvasReady, true);
    assert.equal(timers.size, 0);
    assert.equal(view().values.find(value => value.id === 'layout_ready').value, 'true');
    host.parameters.onLayout(0, 0, 0);
    assert.equal(instance.canvasReady, false);
    assert.equal(timers.size, 1, 'a visible canvas that loses its bounds is watched again');
    host.parameters.onLayout(0, 300, 400);
    assert.equal(instance.canvasReady, true);
    instance.resetRequested();
    assert.equal(instance.canvasReady, false);
    assert.equal(instance.sdkInitialized, false);
    assert.equal(instance.canvasWidth, 0);
    host.parameters.onReady(0); host.parameters.onLayout(0, 400, 300);
    assert.equal(instance.canvasReady, false);
    instance.canvasHost.parameters.onReady(1);
    assert.equal(instance.canvasReady, false, 'a new controller cannot reuse old canvas dimensions');
    instance.canvasHost.parameters.onLayout(1, 300, 400);
    assert.equal(instance.canvasReady, true);
    instance.aboutToDisappear();
    instance.canvasLayoutChanged(1, 0, 0);
    assert.equal(timers.size, 0);
  }
});

test('pending initialization pauses while hidden or input is disabled and rejects cancelled timers after resuming', () => {
  for (const condition of ['isVisible', 'isInputEnabled']) {
    const { instance, timers, engines, view } = component();
    const host = instance.canvasHost;
    const cancelledTimer = timers.get(instance.initTimer);
    instance[condition] = false;
    instance.inputConditionsChanged();
    assert.equal(timers.size, 0, condition);
    assert.equal(view(), undefined);
    assert.equal(host.isDisposed, false, 'pausing the watchdog preserves the pending canvas');
    cancelledTimer();
    assert.equal(instance.canvasFailed, false);
    instance[condition] = true;
    instance.inputConditionsChanged();
    assert.equal(timers.size, 1);
    cancelledTimer();
    assert.equal(instance.canvasFailed, false, 'a cancelled callback cannot expire the resumed wait');
    assert.equal(view().busy, true);
    assert.deepEqual(engines, [true]);
    timers.get(instance.initTimer)();
    assert.equal(instance.canvasFailed, true, 'an active wait still falls back when initialization never completes');
    assert.equal(instance.fallbackReason, 'init_timeout');
    assert.equal(host.isDisposed, true);
    assert.deepEqual(engines, [true, false]);
    instance.aboutToDisappear();
  }
});

test('resetting a hidden canvas defers the watchdog until reopening without accepting the previous generation', () => {
  const { instance, timers } = component();
  const oldHost = instance.canvasHost;
  instance.isVisible = false;
  instance.inputConditionsChanged();
  instance.resetRequested();
  assert.equal(instance.canvasGeneration, 1);
  assert.equal(oldHost.isDisposed, true);
  assert.equal(timers.size, 0);
  oldHost.parameters.onReady(0);
  assert.equal(instance.canvasReady, false);
  instance.isVisible = true;
  instance.inputConditionsChanged();
  assert.equal(timers.size, 1);
  instance.canvasHost.parameters.onReady(1);
  instance.canvasHost.parameters.onLayout(1, 400, 300);
  assert.equal(instance.canvasReady, true);
  assert.equal(timers.size, 0);
  instance.isVisible = false;
  instance.inputConditionsChanged();
  instance.isVisible = true;
  instance.inputConditionsChanged();
  assert.equal(timers.size, 0, 'an initialized canvas does not start another watchdog on reopening');
  instance.aboutToDisappear();
});

test('foreground/grade gating removes observations without destroying the initialized suite', () => {
  const { instance, view } = component();
  instance.canvasInitialized(0);
  instance.isInputEnabled = false; instance.publishInterface();
  assert.equal(view(), undefined);
  instance.isInputEnabled = true; instance.reviewPhase = 'answer'; instance.publishInterface();
  assert.equal(instance.canvasGeneration, 0);
  assert.equal(instance.canvasReady, true);
  assert.equal(view().items.some(item => item.id === 'show_answer'), false);
  assert.deepEqual(view().items.filter(item => ['again','hard','good','easy'].includes(item.id)).map(item => item.id), ['again','hard','good','easy']);
  instance.isVisible = false;
  let closes = 0;
  instance.onClose = () => closes++;
  instance.backRequested();
  assert.equal(closes, 0);
  instance.isVisible = true; instance.backRequested();
  assert.equal(closes, 1);
});

test('JIDE recognizes the complete official toolbar while internal settings and history stay unknown', () => {
  const { instance, tracker, view } = component();
  instance.canvasInitialized(0);
  const structure = buildAgentAppStructure({ simple: false, agent: true, cloudDeck: false, themeHasTextures: false },
    'study_whiteboard', '', key => labels.get(key) ?? key, [], [], tracker.snapshot(), 'study');
  const sheet = structure.surfaces.find(surface => surface.id === 'study_whiteboard');
  const toolkit = sheet.items.find(item => item.id === 'official_tools');
  assert.equal(toolkit.title, labels.get('study_whiteboard_official_tools'));
  assert.equal(toolkit.visibility, 'observed');
  assert.equal(toolkit.enabled, true);
  assert.equal(toolkit.readTool, '');
  assert.equal(toolkit.writeTool, '');
  for (const name of ['钢笔', '圆珠笔', '铅笔', '马克笔', '荧光笔', '马赛克笔', '橡皮擦', '套索', '激光笔', '一笔成形', '报点预测']) {
    assert.ok(sheet.instructions.includes(name), name);
  }
  assert.ok(sheet.instructions.includes('未通过公开接口'));
  assert.ok(sheet.instructions.includes('JIDE不能读取或判题'));
  assert.equal(sheet.items.some(item => ['color_0','width_0','stylus','pen','undo','redo'].includes(item.id) && item.visibility === 'observed'), false);
  assert.equal(view().values.some(value => ['color','width','stylus_only','has_ink'].includes(value.id)), false);
});

test('each official mount owns its controller and both engines use an overlay instead of squeezing the card', async () => {
  const { Host, nodes, context, factory } = canvasHostHarness();
  const parameters = { generation: 0, onReady() {}, onLayout() {}, onScale() {} };
  const first = new Host(parameters, () => assert.fail('unexpected failure'), async () => factory);
  const next = new Host({ ...parameters, generation: 1 }, () => assert.fail('unexpected failure'), async () => factory);
  first.setViewport(context, 400, 300); next.setViewport(context, 400, 300);
  await Promise.resolve();
  assert.notEqual(nodes[0].parameters.controller, nodes[1].parameters.controller);
  first.dispose(); first.dispose(); next.dispose();
  assert.deepEqual(nodes.map(node => node.disposals), [1, 1]);
  const nativeSource = readFileSync(new URL('../../entry/src/main/ets/components/StudyPenCanvas.ets', import.meta.url), 'utf8');
  assert.match(nativeSource, /HandwriteComponent\(/);
  assert.match(nativeSource, /function studyPenCanvas[^]*?Stack\(\{ alignContent: Alignment\.TopStart \}\) \{\s*HandwriteComponent\(/);
  assert.match(nativeSource, /parameters\.onLayout\(parameters\.generation, Number\(area\.width\), Number\(area\.height\)\)/);
  assert.match(nativeSource, /from '@kit.Penkit'/);
  assert.doesNotMatch(nativeSource, /CanvasRenderingContext2D|hiddenTools|processTouchEvent/);
  const page = readFileSync(new URL('../../entry/src/main/ets/pages/学习页.ets', import.meta.url), 'utf8');
  assert.match(page, /if \(this\.whiteboardMounted\)/);
  assert.match(page, /visibility\(this\.手写模式 \? Visibility\.Visible : Visibility\.None\)/);
  assert.match(page, /onClose: [^\n]+\n\s*\.width\('100%'\)\.height\('100%'\)\s*\.visibility/);
  assert.doesNotMatch(page, /whiteboardSession/);
  const viewport = page.match(/  private cardViewportContent\(\)[^]*?\n  }/)[0];
  assert.doesNotMatch(viewport, /学习手写白板层\(/);
  assert.match(page, /undoTick: this\.whiteboardUndoTick, redoTick: this\.whiteboardRedoTick/);
  const wrapper = readFileSync(new URL('../../entry/src/main/ets/components/学习手写白板层.ets', import.meta.url), 'utf8');
  assert.match(wrapper, /StudyLocalWhiteboard\([^]*?isVisible: this\.isVisible && \(!this\.isSupported \|\| this\.canvasFailed\)/);
  assert.match(wrapper, /ContentSlot\(this\.canvasHost!\.getContent\(\)\)/);
  assert.match(wrapper, /setViewport\(this\.getUIContext\(\), Number\(area\.width\), Number\(area\.height\)\)/);
  assert.doesNotMatch(wrapper, /study_whiteboard_unsupported|study_whiteboard_failed|retryCanvas/);
});

test('whiteboard keys cannot grade cards, native undo/redo receive their keys and back only hides the sheet', () => {
  const source = readFileSync(new URL('../../entry/src/main/ets/pages/学习页.ets', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
  const methods = ['处理按键','closeWhiteboard','返回'].map(name =>
    source.match(new RegExp('  private ' + name + '\\([^]*?\\n  }'))[0]).join('\n');
  const Page = new Function('resolveStudyKey', 'studyKeyName', 'KeyType', stripTypeScriptTypes('class Page {' + methods + '}') + ';return Page;')
    (resolveStudyKey, key => key, { Down: 0 });
  const page = new Page();
  let resumes = 0, reschedules = 0, pops = 0;
  Object.assign(page, { timeboxNotice: null, tapZonesGuideVisible: false, studyMenuOpen: false, editingPageOpen: false,
    手写模式: true, whiteboardMounted: true, officialWhiteboard: true, Ctrl按下: false, whiteboardBackTick: 0, whiteboardResetTick: 0,
    startStudyTimers() { resumes++; }, scheduleChoiceAutoAdvance() { reschedules++; }, pathStack: {pop() {pops++;}} });
  for (const key of ['space','enter','1','2','3','4','delete','b','s']) assert.equal(page.处理按键({ keyCode: key, type: 0 }), true);
  page.处理按键({ keyCode: 'control', type: 0 });
  assert.equal(page.处理按键({ keyCode: 'z', type: 0 }), false);
  assert.equal(page.处理按键({ keyCode: 'y', type: 0 }), false);
  page.处理按键({ keyCode: 'control', type: 1 });
  assert.equal(page.Ctrl按下, false);
  page.处理按键({ keyCode: 'escape', type: 0 });
  assert.equal(page.whiteboardBackTick, 1);
  page.返回();
  assert.equal(page.手写模式, false);
  assert.equal(page.whiteboardMounted, true);
  assert.equal(page.whiteboardResetTick, 0);
  assert.equal(pops, 0);
  page.closeWhiteboard();
  assert.equal(resumes, 1);
  assert.equal(reschedules, 1);
  assert.match(source, /onBackPressed\([^]*?this\.手写模式[^]*?this\.whiteboardBackTick\+\+/);
});

test('gesture pointers accept nonzero IDs and sparse slots, prefer fingerInfos and track ID across reordering', () => {
  const sparse = new Array(6);
  const pointer = { id: 5, localX: 40, localY: 60 };
  sparse[5] = pointer;
  assert.equal(gesturePointer(undefined, sparse), pointer);
  assert.equal(gesturePointer([], sparse), pointer);
  const fresh = { ...pointer, localX: 80 };
  assert.equal(gesturePointer([fresh], sparse), fresh);
  assert.equal(gesturePointer([{ id: 1, localX: 0, localY: 0 }, fresh], sparse, 5), fresh);
  assert.equal(gesturePointer(undefined, [undefined, { id: 0, localX: NaN, localY: 10 }]), null);
  assert.equal(gesturePointer(undefined, sparse, 0), null);
  assert.equal(sparse[0], undefined);
});

test('floating toolbar also accepts sparse IDs, ignores other pointers and rolls back a cancelled drag', () => {
  const source = readFileSync(new URL('../../entry/src/main/ets/components/学习浮动工具栏.ets', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
  const methods = ['拖动开始', '拖动更新', 'cancelDrag'].map(name =>
    source.match(new RegExp(`  private ${name}\\([^]*?\\n  }`))[0]).join('\n');
  const Toolbar = new Function('gesturePointer', 'clampStudyToolbar',
    stripTypeScriptTypes(`class Toolbar { ${methods} }`) + ';return Toolbar;')(gesturePointer, clampStudyToolbar);
  const toolbar = new Toolbar();
  Object.assign(toolbar, { 位置X: 20, 位置Y: 40, dragPointerId: -1, touchIds: [],
    gripSession: { setTouching() {} }, toolbarBounds: () => ({ left: 0, right: 1000, top: 0, bottom: 1000 }) });
  const sparse = new Array(6); sparse[5] = { id: 5, localX: 10, localY: 20 };
  toolbar.拖动开始({ fingerList: sparse });
  toolbar.拖动更新({ fingerList: [{ id: 0, localX: 200, localY: 200 }] });
  assert.equal(toolbar.位置X, 20);
  toolbar.拖动更新({ fingerList: [], fingerInfos: [{ id: 5, localX: 30, localY: 40 }] });
  assert.equal(toolbar.位置X, 40);
  assert.equal(toolbar.位置Y, 60);
  toolbar.cancelDrag();
  assert.equal(toolbar.位置X, 20);
  assert.equal(toolbar.位置Y, 40);
  toolbar.拖动更新({ fingerList: sparse });
  assert.equal(toolbar.位置X, 20);
  // 行为测试在上；此检查阻止另一个页面重新引入同类直接访问。
  for (const path of ['学习浮动工具栏.ets', '图片遮罩编辑器.ets', '学习手写白板层.ets']) {
    const text = readFileSync(new URL('../../entry/src/main/ets/components/' + path, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /fingerList\s*\[\s*0\s*\]/);
  }
});
