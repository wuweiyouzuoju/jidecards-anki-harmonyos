// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { StudyAnnotationView, annotationLayerTranslation } from '../../entry/src/main/ets/model/StudyAnnotationView.ts';
import { StudyWhiteboard } from '../../entry/src/main/ets/model/StudyWhiteboard.ts';
import { loadComponentLogic } from './platform-module-harness.mjs';

const point = (id, x, y) => ({ id, x, y });
const view = () => { const instance = new StudyAnnotationView(); instance.setViewport(400, 300); return instance; };

const TouchType = { Down: 0, Up: 1, Move: 2, Cancel: 3 };
class ScrollableTargetInfo { getId() { return 'native_canvas_scroll'; } }
const viewport = () => {
  const Component = loadComponentLogic('components/StudyContentViewport.ets', 'StudyContentViewport', {
    annotationLayerTranslation, TouchType, HitTestMode: { Default: 0, Block: 1 }, SourceTool: { Finger: 1, Pen: 2 }, ScrollableTargetInfo,
    GestureJudgeResult: { CONTINUE: 0, REJECT: 1 }, GestureControl: { GestureType: { PAN_GESTURE: 2 } }
  });
  const instance = new Component(); instance.onNavigationAllowed = () => true;
  return instance;
};
const recognizer = (tag = 'study_global_pan', fingers = 2, builtIn = false, target = { getId: () => 'slider' }) => ({
  getTag: () => tag, getFingerCount: () => fingers, getType: () => 2, isBuiltIn: () => builtIn,
  getEventTargetInfo: () => target,
  setEnabled() { assert.fail('recognizers must remain available for the next stroke'); },
  preventBegin() { assert.fail('native brush recognizers must not be disabled'); }
});
const touchRecognizer = (id, cancelTouch) => ({ getEventTargetInfo: () => ({ getId: () => id }), cancelTouch });

test('hit-test observation sees a pen down before child consumption and preserves pen delivery', () => {
  const instance = viewport(), observed = [];
  instance.onTouchInput = event => observed.push(event);
  const down = { type: TouchType.Down, sourceTool: 2, changedTouches: [{ id: 27 }], touches: [{ id: 27 }] };
  assert.equal(instance.observeTouchTest(down), 0);
  assert.deepEqual(observed, [down]);
  assert.equal(instance.observeTouchTest({ ...down, type: TouchType.Up }), 0);
  assert.equal(observed.length, 1, 'up is tracked through normal touch delivery, not guessed at hit test');
});

test('pen-mode stationary finger taps never reach raw drawing while pen, tools and no-pen writing still do', () => {
  const instance = viewport(); let mode = false, dots = 0;
  instance.onFingerDrawingBlocked = () => mode;
  instance.onControlTouch = event => event.tool === true;
  instance.onTouchInput = event => { if (event.sourceTool === 2 && event.type === TouchType.Down) mode = true; };
  const press = (sourceTool, tool = false) => {
    const event = { type: TouchType.Down, sourceTool, tool, changedTouches: [{ id: 7 }], touches: [{ id: 7 }] };
    const route = instance.observeTouchTest(event);
    if (route === 0 && !tool) dots++;
    instance.trackInput({ ...event, type: TouchType.Up, touches: [] });
    return route;
  };
  assert.equal(press(1), 0); assert.equal(dots, 1, 'normal finger writing reaches the engine');
  assert.equal(press(2), 0); assert.equal(dots, 2, 'real pen both latches mode and writes');
  for (const scale of [1, 2, 4]) {
    const before = dots;
    instance.viewScale = scale;
    assert.equal(press(1), 1);
    assert.equal(dots, before, 'no movement is needed to exclude raw ink Down/Up');
    assert.equal(press(1, true), 0, 'native controls retain their input');
    assert.equal(press(2), 0, 'pen brushes remain enabled');
  }
  mode = false; assert.equal(press(1), 0, 'reopening restores no-pen writing');
});

test('intercepted drawing fingers can pan and pinch with no SDK touch recognizers, without reusing IDs from a prior opening', () => {
  const instance = viewport(); instance.onFingerDrawingBlocked = () => true; instance.onSinglePanAllowed = () => true;
  const down = (id, ids) => instance.observeTouchTest({ type: TouchType.Down, sourceTool: 1,
    changedTouches: [{ id }], touches: ids.map(id => ({ id })) });
  down(7, [7]);
  assert.equal(instance.judgeRecognizer({ sourceTool: 1, fingerList: [{ id: 7 }] }, recognizer('study_view_pan', 1), [], []), 0);
  down(9, [7, 9]);
  const sparse = new Array(10); sparse[7] = { id: 7 }; sparse[9] = { id: 9 };
  for (const tag of ['study_global_pan', 'study_global_zoom']) {
    assert.equal(instance.judgeRecognizer({ sourceTool: 1, fingerList: [{ id: 7 }, { id: 9 }] }, recognizer(tag), [], []), 0);
    assert.equal(instance.judgeRecognizer({ sourceTool: 1, fingerList: sparse }, recognizer(tag), [], []), 0);
    assert.equal(instance.judgeRecognizer({ sourceTool: 1, fingerList: [{ id: 31 }], fingerInfos: [{ id: 7 }, { id: 9 }] }, recognizer(tag), [], []), 0);
  }
  assert.equal(instance.judgeRecognizer({ sourceTool: 1, fingerList: [{ id: 7 }, { id: 31 }] }, recognizer(), [], []), 1);
  instance.onFingerDrawingBlocked = () => false;
  down(7, [7]); down(9, [7, 9]);
  assert.equal(instance.judgeRecognizer({ sourceTool: 1, fingerList: [{ id: 7 }, { id: 9 }] }, recognizer(), [], []), 1,
    'a new no-pen opening must still cancel raw ink before navigation');
});

test('a native tool press keeps its entire pointer sequence, even if it later moves like a pan', () => {
  const instance = viewport(); instance.onFingerDrawingBlocked = () => true; instance.onSinglePanAllowed = () => true;
  instance.onControlTouch = () => true;
  instance.observeTouchTest({ type: TouchType.Down, sourceTool: 1, changedTouches: [{ id: 7 }], touches: [{ id: 7 }] });
  const tool = touchRecognizer('native_tool', () => assert.fail('a tool sequence cannot be cancelled for viewport navigation'));
  assert.equal(instance.judgeRecognizer({ sourceTool: 1, fingerList: [{ id: 7 }] }, recognizer('study_view_pan', 1), [], [tool]), 1);
  assert.equal(instance.judgeRecognizer({ sourceTool: 1, fingerList: [{ id: 7 }, { id: 9 }] }, recognizer(), [], [tool]), 1);
  instance.trackInput({ type: TouchType.Up, changedTouches: [{ id: 7 }] });
  instance.onControlTouch = () => false;
  instance.observeTouchTest({ type: TouchType.Down, sourceTool: 1, changedTouches: [{ id: 7 }], touches: [{ id: 7 }] });
  assert.equal(instance.judgeRecognizer({ sourceTool: 1, fingerList: [{ id: 7 }] }, recognizer('study_view_pan', 1), [], []), 0);
});

test('a latched single-finger pan cancels drawing only when its owner allows it and never consumes a pen or slider', () => {
  const instance = viewport(); let cancellations = 0;
  const native = touchRecognizer('native_ink', () => cancellations++), current = recognizer('study_view_pan', 1);
  assert.equal(instance.judgeRecognizer({ sourceTool: 1 }, current, [], [native]), 1);
  assert.equal(cancellations, 0);
  instance.onSinglePanAllowed = () => true;
  assert.equal(instance.judgeRecognizer({ sourceTool: 2 }, current, [], [native]), 1);
  assert.equal(instance.judgeRecognizer({ sourceTool: 1 }, current, [recognizer('slider', 1, true)], [native]), 1);
  assert.equal(instance.judgeRecognizer({ sourceTool: 1 }, current, []), 1);
  assert.equal(cancellations, 0);
  assert.equal(instance.judgeRecognizer({ sourceTool: 1 }, current,
    [recognizer('sdk_scroll', 1, true, new ScrollableTargetInfo())], [native]), 0);
  assert.equal(cancellations, 1);
});

test('two-finger navigation cancels raw native drawing once before pose updates and retains its own pen observer', () => {
  const instance = viewport(), calls = [];
  const own = touchRecognizer('study_view_input', () => assert.fail('the input observer must survive navigation'));
  const native = touchRecognizer('native_ink', () => {
    calls.push('cancel');
    instance.trackInput({ type: TouchType.Cancel });
  });
  instance.onTouchInput = () => calls.push('observer');
  for (const tag of ['study_global_pan', 'study_global_zoom']) {
    assert.equal(instance.judgeRecognizer({ sourceTool: 1 }, recognizer(tag), [], [own, native]), 0);
    calls.push('pose');
  }
  assert.deepEqual(calls, ['cancel', 'pose', 'pose'], 'child Cancel cannot end navigation or cause a second cancellation');
  instance.trackInput({ type: TouchType.Up });
  instance.trackInput({ type: TouchType.Down });
  assert.equal(instance.judgeRecognizer({ sourceTool: 1 }, recognizer(), [], [native]), 0);
  assert.deepEqual(calls, ['cancel', 'pose', 'pose', 'observer', 'observer', 'cancel'], 'the next gesture can cancel new ink');
});

test('single fingers, pen input, sliders and unavailable touch cancellation cannot take over drawing', () => {
  const instance = viewport(); let cancellations = 0;
  const native = touchRecognizer('native_ink', () => cancellations++);
  assert.equal(instance.judgeRecognizer({ sourceTool: 1 }, recognizer('sdk_pen', 1), [], [native]), 0);
  assert.equal(instance.judgeRecognizer({ sourceTool: 1 }, recognizer('study_global_pan', 1), [], [native]), 1);
  assert.equal(instance.judgeRecognizer({ sourceTool: 2 }, recognizer(), [], [native]), 1);
  assert.equal(instance.judgeRecognizer({ sourceTool: 0, pressure: 1 }, recognizer(), [], [native]), 1);
  assert.equal(instance.judgeRecognizer({ sourceTool: 1 }, recognizer(), [recognizer('slider', 1, true)], [native]), 1);
  assert.equal(instance.judgeRecognizer({ sourceTool: 1 }, recognizer(), []), 1);
  assert.equal(instance.judgeRecognizer({ sourceTool: 1 }, recognizer(), [], []), 1);
  assert.equal(instance.judgeRecognizer({ sourceTool: 1 }, recognizer(), [], [touchRecognizer('study_view_input', () => cancellations++)]), 1);
  instance.onNavigationAllowed = () => false;
  assert.equal(instance.judgeRecognizer({ sourceTool: 1 }, recognizer(), [], [native]), 1);
  assert.equal(cancellations, 0);
});

test('the native scroll container does not block two-finger takeover but its raw ink input is cancelled', () => {
  const instance = viewport(); let cancellations = 0;
  assert.equal(instance.judgeRecognizer({ sourceTool: 1 }, recognizer(),
    [recognizer('sdk_scroll', 1, true, new ScrollableTargetInfo())],
    [touchRecognizer('native_ink', () => cancellations++)]), 0);
  assert.equal(cancellations, 1);
});

test('two fingers continuously pan zoomed content without changing scale', () => {
  const instance = view();
  instance.navigate([point(4, 100, 100), point(9, 200, 100)]);
  instance.navigate([point(4, 50, 100), point(9, 250, 100)]);
  for (let step = 1; step <= 5; step++) {
    assert.equal(instance.navigate([point(4, 50 + step * 10, 100 + step * 5), point(9, 250 + step * 10, 100 + step * 5)]), true);
    assert.deepEqual(instance.snapshot(), { scale: 2, x: -150 + step * 10, y: -100 + step * 5 });
  }
  const before = instance.snapshot();
  instance.navigate([point(4, 150, 200)]);
  instance.navigate([point(4, 180, 220)]);
  assert.deepEqual(instance.snapshot(), before);
  instance.reset(); assert.deepEqual(instance.snapshot(), { scale: 1, x: 0, y: 0 });
});

test('card and ink layers with different layout origins map the same window point to the same screen position', () => {
  for (const scale of [0.5, 1, 1.5, 2, 4]) {
    for (const origin of [{ x: 0, y: 0 }, { x: 0, y: 64 }, { x: 120, y: 80 }]) {
      const pose = { scale, x: 30, y: -20 }, windowPoint = { x: 200, y: 180 };
      const layer = annotationLayerTranslation(pose, origin.x, origin.y);
      assert.equal(origin.x + (windowPoint.x - origin.x) * scale + layer.x, windowPoint.x * scale + pose.x);
      assert.equal(origin.y + (windowPoint.y - origin.y) * scale + layer.y, windowPoint.y * scale + pose.y);
    }
  }
});

test('the production content viewport compensates for different measured layer and window origins', () => {
  const Component = loadComponentLogic('components/StudyContentViewport.ets', 'StudyContentViewport', {
    annotationLayerTranslation, GestureJudgeResult: { REJECT: 1 }
  });
  const instance = new Component();
  Object.assign(instance, { viewScale: 2, viewX: -100, viewY: -100, rootX: 20, rootY: 40, originX: 20, originY: 104 });
  assert.deepEqual(instance.translation(), { x: -100, y: -36 });
});

test('zoom and pan keep the content under the initial center beneath the moving finger center', () => {
  const instance = view();
  assert.equal(instance.navigate([point(4, 50, 100), point(9, 150, 100)]), false);
  const anchor = instance.toContent(100, 100);
  assert.equal(instance.navigate([point(9, 250, 130), point(4, 50, 130)]), true);
  assert.deepEqual(instance.snapshot(), { scale: 2, x: -50, y: -70 });
  assert.deepEqual(instance.toContent(150, 130), anchor);
  assert.deepEqual(instance.toScreen(anchor.x, anchor.y), { x: 150, y: 130 });
  assert.equal(instance.navigate([point(4, 80, 200), point(9, 280, 200)]), true, 'equal-distance motion pans at the current scale');
  assert.deepEqual(instance.snapshot(), { scale: 2, x: -20, y: 0 });
  assert.equal(instance.navigate([point(9, 280, 200), point(4, 80, 200)]), false, 'array order cannot restart navigation');
});

test('single fingers cannot navigate and pointer replacement or gesture end rebases without jumping', () => {
  const instance = view();
  instance.navigate([point(1, 10, 10)]); instance.navigate([point(1, 40, 35)]);
  assert.deepEqual(instance.snapshot(), { scale: 1, x: 0, y: 0 });
  instance.navigate([point(2, 100, 100), point(3, 200, 100)]);
  instance.navigate([point(2, 50, 100), point(3, 250, 100)]);
  let saved = instance.snapshot();
  assert.equal(instance.navigate([point(4, 10, 10), point(5, 110, 10)]), false);
  assert.deepEqual(instance.snapshot(), saved);
  instance.navigate([point(4, 40, 30), point(5, 140, 30)]);
  assert.deepEqual(instance.snapshot(), { scale: saved.scale, x: saved.x + 30, y: saved.y + 20 });
  saved = instance.snapshot();
  instance.endGesture();
  assert.equal(instance.navigate([point(4, 10, 10), point(5, 110, 10)]), false);
  assert.deepEqual(instance.snapshot(), saved);
  instance.navigate([point(4, 20, 10)]);
  assert.equal(instance.navigate([point(4, 30, 10), point(5, 80, 10)]), false, 'lifting one finger ends the prior anchor');
  assert.deepEqual(instance.snapshot(), saved);
});

test('pinching clamps scale between one and four and scale one returns to the origin', () => {
  const instance = view();
  instance.navigate([point(1, 100, 100), point(2, 200, 100)]);
  instance.navigate([point(1, -10000, 100), point(2, 10000, 100)]);
  assert.equal(instance.snapshot().scale, 4);
  instance.navigate([point(1, -1, 100), point(2, 1, 100)]);
  assert.deepEqual(instance.snapshot(), { scale: 1, x: 0, y: 0 }, 'shrinking beyond the minimum clamps both scale and position');
  instance.reset();
  assert.deepEqual(instance.snapshot(), { scale: 1, x: 0, y: 0 });
  instance.endGesture();
  instance.navigate([point(3, 10000, 10000), point(4, 10100, 10000)]);
  instance.navigate([point(3, 9900, 10000), point(4, 10200, 10000)]);
  assert.deepEqual(instance.snapshot(), { scale: 3, x: -800, y: -600 });
  const saved = instance.snapshot();
  assert.equal(instance.navigate([point(NaN, 1, 2), point(4, Infinity, 2)]), false);
  assert.equal(instance.navigate([point(3, 10, 10), point(4, 10, 10)]), false);
  assert.deepEqual(instance.snapshot(), saved);
  instance.setViewport(NaN, 10); assert.deepEqual(instance.snapshot(), saved);
  instance.reset(); assert.deepEqual(instance.snapshot(), { scale: 1, x: 0, y: 0 });
});

test('pinching shrinks and enlarges within or across gestures while single-finger pan requires a zoomed view', () => {
  const instance = view();
  instance.navigate([point(1, 100, 100), point(2, 200, 100)]);
  instance.navigate([point(1, 50, 100), point(2, 250, 100)]);
  instance.navigate([point(1, 75, 100), point(2, 225, 100)]);
  assert.deepEqual(instance.snapshot(), { scale: 1.5, x: -75, y: -50 });
  assert.deepEqual(instance.toContent(150, 100), { x: 150, y: 100 }, 'shrinking keeps the content anchor under the finger center');
  instance.navigate([point(1, 62.5, 100), point(2, 237.5, 100)]);
  assert.deepEqual(instance.snapshot(), { scale: 1.75, x: -112.5, y: -75 });
  instance.endGesture();
  instance.navigate([point(3, 50, 100), point(4, 250, 100)]);
  instance.navigate([point(3, 100, 100), point(4, 200, 100)]);
  assert.deepEqual(instance.snapshot(), { scale: 1, x: 0, y: 0 }, 'a new pinch can shrink back to the original size');
  assert.equal(instance.beginPan(point(7, 100, 100)), false, 'scale one hands single-finger input back to the engine');
  instance.navigate([point(3, 50, 100), point(4, 250, 100)]);
  instance.navigate([point(3, 125, 100), point(4, 175, 100)]);
  assert.deepEqual(instance.snapshot(), { scale: 1, x: 0, y: 0 });
  instance.navigate([point(3, 0, 100), point(4, 300, 100)]);
  assert.equal(instance.snapshot().scale, 1.5);
  assert.equal(instance.beginPan(point(7, 100, 100)), true);
  assert.equal(instance.pan(point(7, 120, 120)), true, 'one-finger movement resumes after enlarging again');
});

test('resizing preserves normalized offsets and navigation never changes ink or undo history', () => {
  const instance = view(), ink = new StudyWhiteboard(); ink.setViewport(400, 300);
  ink.begin(3, 100, 100, 'auto'); ink.append(3, 200, 200); ink.finish(3);
  const before = []; ink.visitStrokes(stroke => before.push(structuredClone(stroke)));
  instance.navigate([point(4, 50, 100), point(9, 150, 100)]);
  instance.navigate([point(4, 50, 130), point(9, 250, 130)]);
  instance.setViewport(800, 600);
  assert.deepEqual(instance.snapshot(), { scale: 2, x: -100, y: -140 });
  instance.reset();
  const after = []; ink.visitStrokes(stroke => after.push(structuredClone(stroke)));
  assert.deepEqual(after, before);
  assert.equal(ink.undo(), true); assert.equal(ink.hasInk(), false);
  assert.equal(ink.redo(), true); assert.equal(ink.hasInk(), true);
});

test('single-finger viewport panning uses screen deltas on both axes and preserves the content coordinate mapping', () => {
  const instance = view();
  assert.equal(instance.beginPan(point(7, 100, 100)), false, 'scale one leaves single-finger input to the engine');
  instance.navigate([point(1, 100, 100), point(2, 200, 100)]);
  instance.navigate([point(1, 50, 100), point(2, 250, 100)]);
  instance.endGesture();
  const anchor = instance.toContent(100, 100);
  assert.equal(instance.beginPan(point(7, 100, 100)), true);
  assert.equal(instance.pan(point(7, 140, 130)), true);
  assert.deepEqual(instance.snapshot(), { scale: 2, x: -110, y: -70 });
  assert.deepEqual(instance.toContent(140, 130), anchor, 'card and ink remain beneath the same screen point');
  assert.deepEqual(instance.toScreen(anchor.x, anchor.y), { x: 140, y: 130 });
  const saved = instance.snapshot();
  for (const invalid of [point(8, 150, 150), point(7, Infinity, 50), point(NaN, 0, 0)]) {
    assert.equal(instance.pan(invalid), false);
    assert.deepEqual(instance.snapshot(), saved);
  }
  instance.endPan();
  assert.equal(instance.pan(point(7, 150, 150)), false, 'a finished drag cannot resume');
});

test('panning, zooming and rotation keep all four drawing edges outside the fixed viewport', () => {
  const instance = new StudyAnnotationView();
  for (const [width, height] of [[1600, 1000], [1000, 1600], [412, 892], [892, 412]]) {
    instance.setViewport(width, height);
    instance.reset();
    instance.navigate([point(1, width / 4, height / 2), point(2, 3 * width / 4, height / 2)]);
    instance.navigate([point(1, 0, height / 2), point(2, width, height / 2)]);
    for (const [dx, dy] of [[-100000, -100000], [100000, 100000], [-100000, 100000], [100000, -100000]]) {
      assert.equal(instance.beginPan(point(7, width / 2, height / 2)), true);
      instance.pan(point(7, width / 2 + dx, height / 2 + dy));
      const pose = instance.snapshot();
      assert.ok(pose.x <= 0 && pose.y <= 0);
      assert.ok(pose.x + width * pose.scale >= width);
      assert.ok(pose.y + height * pose.scale >= height);
      instance.endPan();
    }
  }
});

test('switching pointer counts or resizing ends the old one-finger anchor without changing ink history', () => {
  const instance = view();
  instance.navigate([point(1, 100, 100), point(2, 200, 100)]);
  instance.navigate([point(1, 50, 100), point(2, 250, 100)]);
  instance.beginPan(point(7, 100, 100));
  instance.pan(point(7, 120, 110));
  const before = instance.snapshot();
  assert.equal(instance.navigate([point(7, 120, 110), point(8, 220, 110)]), false);
  assert.deepEqual(instance.snapshot(), before, 'the second finger rebases the zoom anchor');
  assert.equal(instance.pan(point(7, 140, 130)), false);
  instance.endGesture();
  instance.beginPan(point(9, 150, 150));
  instance.setViewport(800, 600);
  assert.equal(instance.pan(point(9, 170, 180)), false, 'orientation changes invalidate the active drag');
});

test('the measured canvas between fixed controls remains covered at every zoomed pan edge', () => {
  const instance = view();
  instance.setContentBounds(0, 64, 400, 180);
  instance.navigate([point(1, 100, 120), point(2, 200, 120)]);
  instance.navigate([point(1, 50, 120), point(2, 250, 120)]);
  for (const [dx, dy] of [[100000, 100000], [-100000, -100000]]) {
    instance.beginPan(point(7, 100, 100));
    instance.pan(point(7, dx, dy));
    const pose = instance.snapshot();
    assert.ok(64 * pose.scale + pose.y <= 64);
    assert.ok(244 * pose.scale + pose.y >= 244);
    assert.ok(pose.x <= 0 && 400 * pose.scale + pose.x >= 400);
  }
  instance.reset();
  assert.deepEqual(instance.snapshot(), { scale: 1, x: 0, y: 0 });
  instance.setViewport(800, 600);
  instance.navigate([point(1, 100, 200), point(2, 200, 200)]);
  instance.navigate([point(1, 50, 200), point(2, 250, 200)]);
  instance.beginPan(point(7, 100, 100)); instance.pan(point(7, -100000, -100000));
  assert.deepEqual(instance.snapshot(), { scale: 2, x: -800, y: -488 }, 'rotation rescales the measured drawing bounds');
});
