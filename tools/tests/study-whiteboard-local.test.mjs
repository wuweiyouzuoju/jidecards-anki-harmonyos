// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { StudyWhiteboard, whiteboardColor, WHITEBOARD_COLORS, WHITEBOARD_WIDTHS,
  WHITEBOARD_ERASER_WIDTHS } from '../../entry/src/main/ets/model/StudyWhiteboard.ts';
import { AppInterfaceTracker, WHITEBOARD_INTERFACE_ITEMS } from '../../entry/src/main/ets/model/AppInterface.ts';
import { buildAgentAppStructure } from '../../entry/src/main/ets/model/agent/AgentAppStructure.ts';
import { gesturePointer } from '../../entry/src/main/ets/model/GesturePointer.ts';
import { clampStudyToolbar } from '../../entry/src/main/ets/model/StudyLayout.ts';
import { resolveStudyKey } from '../../entry/src/main/ets/model/StudyInputPolicy.ts';
import { loadComponentLogic } from './platform-module-harness.mjs';

const ink = session => {
  const strokes = [];
  session.visitStrokes(stroke => strokes.push(structuredClone(stroke)));
  return strokes;
};
const board = (...limits) => {
  const session = new StudyWhiteboard(...limits);
  session.setViewport(200, 100);
  return session;
};
const draw = (session, id = 4, color = '#123456') => {
  session.begin(id, 20, 10, color);
  session.append(id, 100, 50);
  session.finish(id);
};

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

test('single taps, full endpoints and stroke colors survive replay without joining strokes', () => {
  const session = board();
  const dot = session.begin(9, 20, 10, '#111111');
  assert.deepEqual(dot.from, dot.to);
  assert.equal(session.append(7, 90, 80), null);
  assert.equal(session.finish(7), false);
  session.finish(9);
  session.begin(2, 40, 20, '#222222');
  assert.equal(session.append(2, 40.1, 20), null);
  session.append(2, 40.1, 20, true);
  session.finish(2);
  const strokes = ink(session);
  assert.equal(strokes[0].points.length, 1);
  assert.equal(strokes[1].points.length, 2);
  assert.equal(strokes[0].color, '#111111');
  assert.equal(strokes[1].color, '#222222');
  assert.equal(strokes[1].points[1].x, 40.1 / 200);
});

test('cancel, resize, clear and disposal discard partial input; undo includes clear with bounded history', () => {
  const session = board();
  draw(session);
  const saved = ink(session);
  session.begin(6, 50, 50, '#abcdef');
  session.cancel();
  assert.equal(session.append(6, 60, 60), null);
  assert.deepEqual(ink(session), saved);
  session.begin(6, 50, 50, '#abcdef');
  session.setViewport(400, 200);
  assert.equal(session.currentPointer(), -1);
  assert.deepEqual(ink(session), saved, 'normalized coordinates preserve completed ink on rotation');
  session.clear();
  assert.equal(session.hasInk(), false);
  assert.equal(session.canUndo(), true);
  draw(session);
  session.undo();
  assert.equal(session.hasInk(), false);
  session.undo();
  assert.deepEqual(ink(session), saved);
  session.dispose();
  assert.equal(session.canUndo(), false);
  assert.equal(session.begin(4, 10, 10, '#000000'), null);
  assert.equal(session.setViewport(400, 200), false);
  assert.equal(session.finish(4), false);
  assert.deepEqual(ink(session), []);
});

test('invalid and outside coordinates never enter Canvas; clipped moves remain finite', () => {
  const session = board();
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.equal(session.begin(0, value, 10, '#000000'), null);
    assert.equal(session.begin(value, 10, 10, '#000000'), null);
  }
  assert.equal(session.begin(0, -1, 10, '#000000'), null);
  session.begin(0, 10, 10, '#000000');
  assert.equal(session.append(0, NaN, 10), null);
  const clipped = session.append(0, 900, -900);
  assert.deepEqual(clipped.to, { x: 1, y: 0 });
});

test('point and stroke budgets preserve ink, reject excess input and recover after undo and clear', () => {
  const session = board(3, 2);
  session.begin(1, 10, 10, '#000000');
  session.append(1, 50, 50);
  session.append(1, 80, 80);
  const saved = ink(session);
  for (let index = 0; index < 10000; index++) session.append(1, 100, 50);
  assert.deepEqual(ink(session), saved);
  assert.equal(session.isFull(), true);
  session.finish(1);
  assert.equal(session.begin(1, 10, 10, '#000000'), null);
  session.undo();
  assert.equal(session.isFull(), false);
  session.begin(1, 10, 10, '#000000'); session.finish(1);
  session.begin(1, 10, 10, '#000000'); session.finish(1);
  assert.equal(session.isFull(), true);
  session.clear();
  assert.equal(session.isFull(), false);
  session.undo();
  assert.equal(session.isFull(), true);
});

test('sustained input is bounded and stationary noise does not allocate more points', () => {
  const session = board();
  session.begin(4, 10, 10, '#000000');
  for (let index = 0; index < 100000; index++) session.append(4, 10, 10);
  assert.equal(ink(session)[0].points.length, 1);
  for (let index = 0; index < 100000; index++) session.append(4, index % 2 ? 10 : 180, 10);
  assert.equal(ink(session)[0].points.length, 65536);
  assert.equal(session.isFull(), true);
  session.cancel();
  assert.equal(session.hasInk(), false);
  assert.equal(session.isFull(), false);
});

const TouchType = { Down: 0, Up: 1, Move: 2, Cancel: 3 };
class FakeCanvas {
  width = 200; height = 100; calls = []; fail = false;
  push(name, ...args) { if (this.fail) throw new Error('render failed'); this.calls.push([name, ...args]); }
  clearRect(...args) { this.push('clear', ...args); }
  beginPath() { this.push('begin'); }
  moveTo(...args) { this.push('move', ...args); }
  lineTo(...args) { this.push('line', ...args); }
  stroke() { this.push('stroke', this.strokeStyle, this.lineWidth, this.globalCompositeOperation); }
  arc(...args) { this.push('arc', ...args); }
  fill() { this.push('fill', this.fillStyle, this.globalCompositeOperation); }
}
const tracker = new AppInterfaceTracker();
const labels = new Map(JSON.parse(readFileSync(new URL('../../entry/src/main/resources/base/element/string.json', import.meta.url))).string.map(item => [item.name, item.value]));
const Component = loadComponentLogic('components/StudyLocalWhiteboard.ets', 'StudyLocalWhiteboard', {
  StudyWhiteboard, TouchType, whiteboardColor, WHITEBOARD_COLORS, WHITEBOARD_WIDTHS, WHITEBOARD_ERASER_WIDTHS, WHITEBOARD_INTERFACE_ITEMS,
  SourceTool: { Unknown: 0, Pen: 2 }, appInterface: tracker,
  interfaceControlText: (_context, items, id) => labels.get(items.find(item => item.id === id)?.titleKey),
  CanvasRenderingContext2D: FakeCanvas, RenderingContextSettings: class {},
  console: { error() {} }
});
Component.prototype.getUIContext = () => ({});
function component() {
  const instance = new Component();
  instance.aboutToAppear();
  instance.canvasReady();
  const send = (type, id = 4, x = 20, y = 10) => instance.handleTouch({ type,
    changedTouches: [{ id, x, y }], getHistoricalPoints: () => [], stopPropagation() {} });
  return { instance, send };
}

test('production component handles sparse nonzero touch ID, taps and lift endpoint with incremental drawing', () => {
  const { instance, send } = component();
  const points = new Array(5); points[4] = { id: 4, x: 20, y: 10 };
  instance.handleTouch({ type: TouchType.Down, changedTouches: points, stopPropagation() {} });
  send(TouchType.Move, 4, 40, 20);
  send(TouchType.Up, 4, 50, 25);
  const calls = instance.context.calls;
  assert.deepEqual(calls.filter(call => call[0] === 'line'), [['line', 40, 20], ['line', 50, 25]]);
  assert.equal(calls.filter(call => call[0] === 'clear').length, 1, 'no full redraw for pointer movement');
  assert.equal(ink(instance.session)[0].points.length, 3);
  send(TouchType.Down, 7, 80, 60); send(TouchType.Up, 7, 80, 60);
  assert.equal(ink(instance.session)[1].points.length, 1);
  instance.undoInk();
  assert.equal(ink(instance.session).length, 1);
  instance.clearInk();
  assert.equal(instance.hasInk, false);
  assert.equal(instance.hasUndo, true);
  instance.undoRequested();
  assert.equal(instance.hasInk, true);
});

test('production component keeps pointer identity, cancels interrupted strokes and blocks late input', () => {
  const { instance, send } = component();
  send(TouchType.Down); send(TouchType.Up);
  send(TouchType.Down, 9); send(TouchType.Down, 2); send(TouchType.Move, 2, 100, 50); send(TouchType.Up, 2);
  assert.equal(instance.session.currentPointer(), 9);
  send(TouchType.Cancel);
  assert.equal(ink(instance.session).length, 1);
  send(TouchType.Down, 9);
  instance.isInputEnabled = false; instance.inputEnabledChanged();
  send(TouchType.Move, 9, 100, 50); send(TouchType.Up, 9);
  assert.equal(ink(instance.session).length, 1);
  instance.isInputEnabled = true;
  let closes = 0; instance.onClose = () => { closes++; instance.isVisible = false; instance.visibilityChanged(); };
  instance.close(); instance.close(); instance.canvasReady(); send(TouchType.Down);
  assert.equal(closes, 1);
  assert.equal(instance.session.hasInk(), true, 'hiding retains completed ink for this card');
});

test('cached original canvas reopens with completed ink, rejects hidden callbacks and clears on next question', () => {
  const { instance, send } = component();
  const view = () => tracker.snapshot().find(item => item.surface === 'study_whiteboard');
  assert.equal(view().values.find(item => item.id === 'engine').value, 'local_canvas');
  assert.equal(view().values.find(item => item.id === 'ready').value, 'true');
  send(TouchType.Down); send(TouchType.Up, 4, 80, 50);
  const saved = ink(instance.session), context = instance.context;
  send(TouchType.Down, 9);
  instance.isVisible = false; instance.visibilityChanged();
  assert.equal(view(), undefined);
  assert.deepEqual(ink(instance.session), saved);
  instance.undoRequested(); instance.clearInk(); instance.selectColor(1); instance.openToolSettings(true);
  assert.deepEqual(ink(instance.session), saved, 'hidden tool callbacks cannot change ink');
  assert.equal(instance.settingsTool, '');
  instance.isVisible = true; instance.visibilityChanged();
  assert.equal(instance.context, context, 'reopening keeps the attached canvas');
  send(TouchType.Down, 7); send(TouchType.Up, 7, 100, 60);
  assert.equal(ink(instance.session).length, 2, 'the cached component remains able to draw');
  instance.undoRequested(); instance.redoRequested();
  assert.equal(ink(instance.session).length, 2);
  instance.isVisible = false; instance.visibilityChanged(); instance.resetRequested();
  instance.isVisible = true; instance.visibilityChanged();
  assert.equal(instance.session.hasInk(), false);
  assert.equal(instance.hasUndo, false);
  assert.equal(instance.hasRedo, false);
  assert.equal(view().items.some(item => item.id === 'official_tools'), false);
  const structure = buildAgentAppStructure({ simple: true, agent: true, cloudDeck: false, themeHasTextures: false },
    'study_whiteboard', '', key => labels.get(key) ?? key, [], [], tracker.snapshot(), 'study');
  const tools = structure.surfaces.find(surface => surface.id === 'study_whiteboard').items;
  assert.equal(tools.find(item => item.id === 'pen').visibility, 'observed');
  assert.equal(tools.find(item => item.id === 'official_tools').visibility, 'hidden');
});

test('canvas readiness, rotation and retry execute real component rendering with retained completed ink', () => {
  const instance = new Component();
  instance.aboutToAppear();
  instance.refreshCanvas();
  assert.deepEqual(instance.context.calls, [], 'no draw before Canvas is attached');
  instance.canvasReady();
  const send = (type, x, y) => instance.handleTouch({ type, changedTouches: [{ id: 4, x, y }], getHistoricalPoints: () => [], stopPropagation() {} });
  send(TouchType.Down, 20, 10); send(TouchType.Up, 100, 50);
  send(TouchType.Down, 40, 20);
  instance.context.width = 400; instance.context.height = 200; instance.refreshCanvas();
  assert.equal(ink(instance.session).length, 1);
  assert.deepEqual(instance.context.calls.filter(call => call[0] === 'line').at(-1), ['line', 200, 100]);
  instance.context.fail = true;
  send(TouchType.Down, 40, 20);
  assert.equal(instance.canvasFailed, true);
  assert.equal(ink(instance.session).length, 1);
  instance.retryCanvas();
  assert.equal(instance.canvasGeneration, 1);
  assert.equal(instance.ready, false);
  instance.canvasReady();
  assert.equal(instance.canvasFailed, false);
  assert.deepEqual(instance.context.calls.filter(call => call[0] === 'line'), [['line', 100, 50]]);
  assert.equal(ink(instance.session).length, 1);
});

test('study keyboard stays inside whiteboard: Ctrl Z undoes ink, Escape closes and other keys never grade', () => {
  const source = readFileSync(new URL('../../entry/src/main/ets/pages/学习页.ets', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
  const methods = ['处理按键', 'closeWhiteboard'].map(name =>
    source.match(new RegExp(`  private ${name}\\([^]*?\\n  }`))[0]).join('\n');
  const Page = new Function('resolveStudyKey', 'studyKeyName', 'KeyType', stripTypeScriptTypes(`class Page { ${methods} }`) + ';return Page;')
    (resolveStudyKey, key => key, { Down: 0 });
  const page = new Page();
  let resumes = 0, reschedules = 0;
  Object.assign(page, { timeboxNotice: null, tapZonesGuideVisible: false, studyMenuOpen: false,
    手写模式: true, Ctrl按下: false, whiteboardUndoTick: 0, whiteboardRedoTick: 0, whiteboardBackTick: 0,
    whiteboardSession: board(), startStudyTimers() { resumes++; },
    scheduleChoiceAutoAdvance() { reschedules++; } });
  for (const key of ['space', 'enter', '1', '2', '3', '4', 'delete', 'b', 's']) assert.equal(page.处理按键({ keyCode: key, type: 0 }), true);
  page.处理按键({ keyCode: 'control', type: 0 });
  page.处理按键({ keyCode: 'z', type: 0 });
  assert.equal(page.whiteboardUndoTick, 1);
  page.处理按键({ keyCode: 'y', type: 0 });
  assert.equal(page.whiteboardRedoTick, 1);
  page.处理按键({ keyCode: 'control', type: 1 });
  assert.equal(page.Ctrl按下, false);
  const { instance } = component();
  instance.onClose = () => page.closeWhiteboard();
  instance.openToolSettings(false);
  page.处理按键({ keyCode: 'escape', type: 0 });
  assert.equal(page.whiteboardBackTick, 1);
  instance.backRequested();
  assert.equal(instance.settingsTool, '');
  assert.equal(page.手写模式, true);
  assert.equal(resumes, 0);
  page.处理按键({ keyCode: 'escape', type: 0 });
  assert.equal(page.whiteboardBackTick, 2);
  instance.backRequested();
  assert.equal(page.手写模式, false);
  assert.equal(resumes, 1);
  assert.equal(reschedules, 1);
  page.closeWhiteboard();
  assert.equal(resumes, 1);
  assert.equal(reschedules, 1);
  assert.match(source, /onBackPressed\([^]*?this\.手写模式[^]*?this\.whiteboardBackTick\+\+/);
});

test('whiteboard overlay leaves child controls hittable and shares the study toolbar geometry', () => {
  const source = readFileSync(new URL('../../entry/src/main/ets/components/StudyLocalWhiteboard.ets', import.meta.url), 'utf8');
  assert.match(source, /\.hitTestBehavior\(HitTestMode\.Default\)/);
  assert.doesNotMatch(source, /\.hitTestBehavior\(HitTestMode\.Block\)/, 'Block would exclude the Canvas and toolbar children');
  assert.match(source, /toolbarContentWidth = cardViewportWidth\(Number\(area\.width\), Number\(area\.height\)\)/);
  assert.match(source, /\.constraintSize\(\{ maxWidth: this\.toolbarContentWidth \}\)/);
  assert.match(source, /top: 应用尺寸\.pageToolbarTop\(this\.状态栏高度, this\.narrowDeckLayout\), bottom: 0/);
  assert.doesNotMatch(source, /themeText: true|\.padding\(\{ top: this\.状态栏高度 \}\)/);
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
  for (const path of ['学习浮动工具栏.ets', '图片遮罩编辑器.ets', 'StudyLocalWhiteboard.ets']) {
    const text = readFileSync(new URL('../../entry/src/main/ets/components/' + path, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /fingerList\s*\[\s*0\s*\]/);
  }
});

test('undo/redo replays mixed pen, eraser and repeated clears; new completed input branches history', () => {
  const session = board();
  assert.equal(session.begin(4, 10, 10, 'auto', 24, true), null, 'empty erasing is a no-op');
  draw(session);
  const first = ink(session);
  session.begin(4, 20, 10, 'auto', 24, true);
  session.append(4, 60, 40);
  session.finish(4);
  const erased = ink(session);
  assert.equal(erased[1].eraser, true);
  assert.equal(erased[1].width, 24);
  session.clear();
  draw(session, 7, '#D83B46');
  session.clear();
  const snapshots = [];
  while (session.canUndo()) { session.undo(); snapshots.push(ink(session)); }
  assert.deepEqual(snapshots.at(-2), first);
  assert.deepEqual(snapshots.at(-3), erased);
  assert.deepEqual(ink(session), []);
  for (const expected of snapshots.slice(0, -1).reverse().concat([[]])) {
    assert.equal(session.redo(), true);
    assert.deepEqual(ink(session), expected);
  }
  session.undo();
  session.begin(1, 10, 10, 'auto');
  session.cancel();
  assert.equal(session.canRedo(), true, 'cancelled input leaves redo available');
  draw(session);
  assert.equal(session.canRedo(), false, 'new ink invalidates the abandoned future');
});

test('history remains bounded across repeated full-page clears and reset cannot resurrect another card', () => {
  const session = board(8, 4);
  session.color = '#2768D8'; session.penWidth = 6; session.stylusOnly = true;
  for (let index = 0; index < 1000; index++) {
    for (let stroke = 0; stroke < 4; stroke++) draw(session);
    session.clear();
    assert.ok(session.historyPoints <= 16);
    assert.ok(session.history.length <= 128);
  }
  session.undo();
  assert.equal(session.isFull(), true);
  session.reset();
  assert.equal(session.undo(), false);
  assert.equal(session.redo(), false);
  assert.deepEqual(ink(session), []);
  assert.equal(session.color, '#2768D8');
  assert.equal(session.penWidth, 6);
  assert.equal(session.stylusOnly, true);
});

test('brush settings capture width and erasing; theme changes replay auto ink with visible contrast', () => {
  const { instance, send } = component();
  instance.selectWidth(2);
  send(TouchType.Down); send(TouchType.Up, 4, 40, 20);
  assert.equal(ink(instance.session)[0].width, 6);
  assert.ok(instance.context.calls.some(call => call[0] === 'stroke' && call[1] === '#202632' && call[2] === 6));
  instance.selectTool(true);
  send(TouchType.Down, 8); send(TouchType.Up, 8, 40, 20);
  assert.ok(instance.context.calls.some(call => call[0] === 'stroke' && call[3] === 'destination-out'));
  instance.undoInk();
  assert.equal(ink(instance.session).length, 1);
  instance.redoInk();
  assert.equal(ink(instance.session)[1].eraser, true);
  instance.是否深色 = true;
  instance.redraw();
  assert.ok(instance.context.calls.some(call => call[0] === 'stroke' && call[1] === '#F3F4F6' && call[3] === 'source-over'));
  instance.selectColor(1);
  assert.equal(instance.eraserSelected, false);
  assert.equal(instance.session.color, WHITEBOARD_COLORS[1]);
  const retained = instance.session;
  instance.close();
  const reopened = new Component(); reopened.session = retained; reopened.aboutToAppear(); reopened.canvasReady();
  assert.equal(reopened.selectedColor, WHITEBOARD_COLORS[1]);
  assert.equal(reopened.selectedWidth, 6);
  assert.equal(ink(reopened.session).length, 2);
  reopened.session.reset(); reopened.resetRequested();
  assert.equal(reopened.hasUndo, false);
  assert.equal(reopened.hasRedo, false);
  assert.equal(reopened.hasInk, false);
});

test('stylus-only rejects palm input and cancellation; coalesced samples retain turns and pointer identity', () => {
  const { instance } = component();
  instance.setStylusOnly(true);
  const send = (type, sourceTool, id, x, y, history = []) => instance.handleTouch({ type, sourceTool,
    changedTouches: [{ id, x, y }], stopPropagation() {}, getHistoricalPoints: () => history });
  send(TouchType.Down, 1, 4, 10, 10);
  assert.equal(instance.hasInk, false);
  send(TouchType.Down, 2, 9, 10, 10);
  send(TouchType.Cancel, 1, 4, 10, 10);
  assert.equal(instance.session.currentPointer(), 9);
  send(TouchType.Move, 2, 9, 80, 10, [
    { touchObject: { id: 9, x: 30, y: 50 } },
    { touchObject: { id: 3, x: 150, y: 90 } },
    { touchObject: { id: 9, x: 60, y: 30 } }
  ]);
  send(TouchType.Up, 2, 9, 100, 10);
  assert.deepEqual(ink(instance.session)[0].points, [
    { x: .05, y: .1 }, { x: .15, y: .5 }, { x: .3, y: .3 }, { x: .4, y: .1 }, { x: .5, y: .1 }
  ]);
  send(TouchType.Down, 2, 9, 10, 10);
  send(TouchType.Cancel, 0, 9, 10, 10);
  assert.equal(instance.session.currentPointer(), -1, 'system cancellation with unknown source still cancels input');
  assert.equal(ink(instance.session).length, 1);
  instance.setStylusOnly(false);
  send(TouchType.Down, 1, 1, 20, 20); send(TouchType.Up, 1, 1, 20, 20);
  assert.equal(ink(instance.session).length, 2);
});

test('JIDE reads the same visible controls, live brush state and history availability; closing removes observation', () => {
  const { instance, send } = component();
  const view = () => tracker.snapshot().find(item => item.surface === 'study_whiteboard');
  assert.equal(view().items.find(item => item.id === 'redo').enabled, false);
  assert.equal(view().items.some(item => item.id === 'color_0'), false);
  instance.openToolSettings(false);
  instance.selectColor(2);
  instance.setStylusOnly(true);
  assert.equal(view().items.find(item => item.id === 'color_2').title, '蓝色');
  assert.equal(view().items.find(item => item.id === 'color_2').selected, true);
  const structure = buildAgentAppStructure({ simple: true, agent: true, cloudDeck: false, themeHasTextures: false },
    'study_whiteboard', '', key => labels.get(key) ?? key, [], [], tracker.snapshot(), 'study');
  const tools = structure.surfaces.find(surface => surface.id === 'study_whiteboard').items;
  assert.equal(tools.find(item => item.id === 'color_2').visibility, 'observed');
  assert.equal(tools.find(item => item.id === 'color_2').selected, true);
  assert.equal(tools.find(item => item.id === 'color_2').writeTool, '', 'observing a button does not grant click permission');
  assert.equal(view().values.find(item => item.id === 'stylus_only').value, 'true');
  instance.setStylusOnly(false);
  instance.closeToolSettings();
  send(TouchType.Down); send(TouchType.Up);
  instance.undoInk();
  assert.equal(view().items.find(item => item.id === 'redo').enabled, true);
  instance.reviewPhase = 'answer'; instance.publishInterface();
  assert.equal(view().items.some(item => item.id === 'again'), true);
  assert.equal(view().items.some(item => item.id === 'show_answer'), false);
  instance.isInputEnabled = false; instance.inputEnabledChanged();
  assert.equal(view(), undefined);
  instance.isInputEnabled = true; instance.inputEnabledChanged();
  assert.ok(view());
  instance.close();
  assert.equal(view(), undefined);
});

test('tool buttons open their own settings, block canvas input and ignore a stale popup dismissal', () => {
  const { instance, send } = component();
  send(TouchType.Down); send(TouchType.Up, 4, 40, 20);
  const saved = ink(instance.session);
  send(TouchType.Down, 7);
  instance.openToolSettings(false);
  assert.equal(instance.settingsTool, 'pen');
  assert.equal(instance.eraserSelected, false);
  assert.deepEqual(ink(instance.session), saved, 'opening settings cancels a partial stroke');
  send(TouchType.Down, 4); send(TouchType.Up, 4, 80, 50);
  assert.deepEqual(ink(instance.session), saved, 'settings overlay cannot draw through onto the Canvas');
  instance.selectColor(1); instance.selectWidth(2);
  assert.equal(instance.settingsTool, 'pen', 'adjust multiple values before closing');
  instance.openToolSettings(true);
  assert.equal(instance.settingsTool, 'eraser');
  assert.equal(instance.eraserSelected, true);
  instance.closeToolSettings('pen');
  assert.equal(instance.settingsTool, 'eraser');
  instance.selectEraserWidth(2);
  assert.equal(instance.session.eraserWidth, 40);
  assert.equal(instance.session.penWidth, 6);
  instance.closeToolSettings('eraser');
  assert.equal(instance.settingsTool, '');
  assert.equal(instance.eraserSelected, true);
  send(TouchType.Down); send(TouchType.Up, 4, 40, 20);
  assert.equal(ink(instance.session).at(-1).width, 40);
  assert.equal(ink(instance.session).at(-1).eraser, true);
  instance.undoInk(); instance.redoInk();
  assert.equal(ink(instance.session).at(-1).width, 40, 'eraser width survives replay');
  instance.openToolSettings(true); instance.openToolSettings(true);
  assert.equal(instance.settingsTool, '', 'a second click on the same tool closes its popup');
  instance.openToolSettings(false);
  instance.isInputEnabled = false; instance.inputEnabledChanged();
  assert.equal(instance.settingsTool, '', 'background or grading dismisses settings');
  instance.openToolSettings(true);
  assert.equal(instance.settingsTool, '', 'late disabled clicks cannot reopen the popup');
  instance.isInputEnabled = true; instance.inputEnabledChanged();
  instance.openToolSettings(true);
  instance.close();
  const reopened = new Component(); reopened.session = instance.session; reopened.aboutToAppear();
  assert.equal(reopened.selectedEraserWidth, 40);
  assert.equal(reopened.settingsTool, '');
});

test('JIDE exposes only the active tool settings and tracks adjustable eraser size', () => {
  const { instance } = component();
  const view = () => tracker.snapshot().find(item => item.surface === 'study_whiteboard');
  assert.equal(WHITEBOARD_INTERFACE_ITEMS.some(item => item.id === 'tools'), false);
  instance.reviewPhase = 'question';
  instance.openToolSettings(true);
  assert.equal(view().items.some(item => item.id === 'color_0'), false);
  assert.equal(view().items.some(item => item.id === 'width_0'), false);
  assert.equal(view().items.find(item => item.id === 'eraser_width_1').selected, true);
  instance.selectEraserWidth(0);
  assert.equal(view().items.find(item => item.id === 'eraser_width_0').selected, true);
  assert.equal(view().values.find(item => item.id === 'eraser_width').value, '12');
  assert.equal(view().items.find(item => item.id === 'show_answer').enabled, false);
  const structure = buildAgentAppStructure({ simple: true, agent: true, cloudDeck: false, themeHasTextures: false },
    'study_whiteboard', '', key => labels.get(key) ?? key, [], [], tracker.snapshot(), 'study');
  const items = structure.surfaces[0].items;
  assert.equal(items.find(item => item.id === 'eraser_width_0').visibility, 'observed');
  assert.equal(items.find(item => item.id === 'color_0').visibility, 'hidden');
  instance.closeToolSettings();
  assert.equal(view().items.some(item => item.id === 'eraser_width_0'), false);
  assert.equal(view().items.find(item => item.id === 'show_answer').enabled, true);
});
