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
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';

const labels = new Map(JSON.parse(readFileSync(new URL('../../entry/src/main/resources/base/element/string.json', import.meta.url))).string.map(item => [item.name, item.value]));
function component(supported = true) {
  const tracker = new AppInterfaceTracker(), timers = new Map(), engines = [];
  let nextTimer = 0;
  const Component = loadComponentLogic('components/学习手写白板层.ets', '学习手写白板层', {
    WHITEBOARD_INTERFACE_ITEMS, StudyWhiteboard, appInterface: tracker,
    StudyPenCanvasHost: class {
      constructor(parameters, onFailure) { this.parameters = parameters; this.onFailure = onFailure; this.isDisposed = false; }
      dispose() { this.isDisposed = true; }
    },
    isStudyPenKitAvailable: () => supported,
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
  return { instance, tracker, timers, engines, view: () => tracker.snapshot().find(item => item.surface === 'study_whiteboard') };
}

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
  const nodes = [];
  const Host = loadPlatformModule('components/StudyPenCanvasHost.ets', 'StudyPenCanvasHost', {
    NodeController: class { rebuilds = 0; rebuild() { this.rebuilds++; } },
    BuilderNode: class {
      constructor(context) { this.context = context; this.frame = {}; this.disposals = 0; nodes.push(this); }
      build(builder, parameters) { builder(parameters); }
      getFrameNode() { return this.frame; }
      dispose() { this.disposals++; }
    }
  });
  return { Host, nodes };
}

test('optional canvas loads on mounting once and disposes its built node once', async () => {
  const { Host, nodes } = canvasHostHarness();
  let loads = 0, initializations = 0;
  const parameters = { generation: 3, onReady: id => { assert.equal(id, 3); initializations++; }, onScale() {} };
  const host = new Host(parameters, () => assert.fail('unexpected failure'), async () => {
    loads++; return params => params.onReady(params.generation);
  });
  assert.equal(loads, 0, 'constructing the startup-safe host does not load the system HSP');
  const context = {};
  assert.equal(host.makeNode(context), null);
  assert.equal(host.makeNode(context), null);
  await Promise.resolve();
  assert.equal(loads, 1);
  assert.equal(initializations, 1);
  assert.equal(nodes[0].context, context);
  assert.equal(host.rebuilds, 1);
  assert.equal(host.makeNode(context), nodes[0].frame);
  host.aboutToDisappear(); host.dispose();
  assert.equal(nodes[0].disposals, 1);
  assert.equal(host.makeNode(context), null);
});

test('late module load after disposal creates no UI; load and build errors reach the failure callback', async () => {
  const { Host, nodes } = canvasHostHarness();
  let resolveLoad;
  const lateHost = new Host({ generation: 1 }, () => assert.fail('late callback'),
    () => new Promise(resolve => { resolveLoad = resolve; }));
  lateHost.makeNode({}); lateHost.dispose(); resolveLoad(() => assert.fail('late build'));
  await Promise.resolve();
  assert.equal(nodes.length, 0);
  const failures = [];
  const missingHost = new Host({ generation: 2 }, id => failures.push(id), async () => { throw new Error('module unavailable'); });
  missingHost.makeNode({}); await Promise.resolve();
  assert.deepEqual(failures, [2]);
  assert.equal(missingHost.makeNode({}), null);
  const brokenHost = new Host({ generation: 3 }, id => failures.push(id), async () => () => { throw new Error('build failed'); });
  brokenHost.makeNode({}); await Promise.resolve();
  assert.deepEqual(failures, [2, 3]);
  assert.equal(nodes[0].disposals, 1);
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
      const module = [target, target + '.ets', target + '.ts'].find(existsSync);
      if (module) pending.push(module);
    }
  }
  assert.ok(visited.has(resolve(root, 'components/StudyPenCanvasHost.ets')));
  assert.equal(visited.has(resolve(root, 'components/StudyPenCanvas.ets')), false);
});

test('Pen Kit availability requires its accessible system module even when the device advertises handwrite', () => {
  const accessed = [];
  let capability = false, availablePath = '', denied = false;
  const available = loadPlatformModule('backend/StudyPenKitAvailability.ets', 'isStudyPenKitAvailable', {
    canIUse: name => { assert.equal(name, 'SystemCapability.Stylus.Handwrite'); return capability; },
    fileIo: { accessSync(path) { accessed.push(path); if (denied) throw new Error('access denied'); return path === availablePath; } }
  });
  assert.equal(available(), false);
  assert.deepEqual(accessed, [], 'no module probing is needed on a device without the capability');
  capability = true;
  assert.equal(available(), false, 'SysCap alone cannot protect against a missing system HSP');
  const modulePaths = [...accessed];
  for (const path of modulePaths) {
    availablePath = path;
    assert.equal(available(), true, path);
  }
  denied = true;
  assert.equal(available(), false);
});

test('initialization timeout falls back automatically while stale timers cannot reject a new generation', () => {
  const { instance, view, timers, engines } = component();
  const staleTimer = timers.get(instance.initTimer);
  instance.resetRequested();
  staleTimer();
  assert.equal(instance.canvasFailed, false);
  timers.get(instance.initTimer)();
  assert.equal(instance.canvasFailed, true);
  assert.equal(view(), undefined);
  assert.deepEqual(engines, [true, false]);
  assert.equal(timers.size, 0);
  instance.canvasInitialized(1);
  assert.equal(instance.canvasReady, false, 'a late ready callback cannot replace the fallback');
  instance.resetRequested();
  assert.equal(instance.canvasGeneration, 1);
  assert.equal(instance.canvasFailed, true);
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

test('each official canvas owns its controller and both engines use an overlay instead of squeezing the card', () => {
  let controllers = 0;
  const nativeSource = readFileSync(new URL('../../entry/src/main/ets/components/StudyPenCanvas.ets', import.meta.url), 'utf8');
  const componentLogic = nativeSource.slice(0, nativeSource.indexOf('  build() {'))
    .replace(/^import[^;]+;\s*/gm, '').replace('@Component', '').replace('export struct StudyPenCanvas', 'class StudyPenCanvas')
    .replace(/@Prop\s*/g, '') + '}';
  const Canvas = new Function('HandwriteController', stripTypeScriptTypes(componentLogic) + ';return StudyPenCanvas;')
    (class { id = ++controllers; });
  const first = new Canvas(), next = new Canvas();
  assert.notEqual(first.controller, next.controller);
  assert.match(nativeSource, /HandwriteComponent\(/);
  assert.match(nativeSource, /from '@kit.Penkit'/);
  assert.doesNotMatch(nativeSource, /CanvasRenderingContext2D|hiddenTools|processTouchEvent/);
  const page = readFileSync(new URL('../../entry/src/main/ets/pages/学习页.ets', import.meta.url), 'utf8');
  assert.match(page, /if \(this\.whiteboardMounted\)/);
  assert.match(page, /visibility\(this\.手写模式 \? Visibility\.Visible : Visibility\.None\)/);
  assert.doesNotMatch(page, /whiteboardSession/);
  const viewport = page.match(/  private cardViewportContent\(\)[^]*?\n  }/)[0];
  assert.doesNotMatch(viewport, /学习手写白板层\(/);
  assert.match(page, /undoTick: this\.whiteboardUndoTick, redoTick: this\.whiteboardRedoTick/);
  const wrapper = readFileSync(new URL('../../entry/src/main/ets/components/学习手写白板层.ets', import.meta.url), 'utf8');
  assert.match(wrapper, /if \(!this\.isSupported \|\| this\.canvasFailed\)[^{]*\{\s*StudyLocalWhiteboard\(/);
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
