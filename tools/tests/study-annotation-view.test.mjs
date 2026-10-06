// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { StudyAnnotationView, annotationLayerTranslation } from '../../entry/src/main/ets/model/StudyAnnotationView.ts';
import { StudyWhiteboard } from '../../entry/src/main/ets/model/StudyWhiteboard.ts';
import { loadComponentLogic } from './platform-module-harness.mjs';

const point = (id, x, y) => ({ id, x, y });
const view = () => { const instance = new StudyAnnotationView(); instance.setViewport(400, 300); return instance; };

test('two fingers continuously pan without changing scale and one finger cannot navigate', () => {
  const instance = view();
  instance.navigate([point(4, 50, 100), point(9, 150, 100)]);
  for (let step = 1; step <= 5; step++) {
    assert.equal(instance.navigate([point(4, 50 + step * 10, 100 + step * 5), point(9, 150 + step * 10, 100 + step * 5)]), true);
    assert.deepEqual(instance.snapshot(), { scale: 1, x: step * 10, y: step * 5 });
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

test('the production content viewport compensates for its position below fixed controls and a nonzero window origin', () => {
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
  assert.equal(instance.navigate([point(4, 80, 130), point(9, 180, 130)]), true);
  assert.deepEqual(instance.snapshot(), { scale: 1, x: 30, y: 30 });
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

test('zoom limits retain a visible canvas edge and invalid or coincident points cannot poison the view', () => {
  const instance = view();
  instance.navigate([point(1, 100, 100), point(2, 200, 100)]);
  instance.navigate([point(1, -10000, 100), point(2, 10000, 100)]);
  assert.equal(instance.snapshot().scale, 4);
  instance.navigate([point(1, 149, 100), point(2, 151, 100)]);
  assert.equal(instance.snapshot().scale, 0.5);
  instance.endGesture();
  instance.navigate([point(3, 10000, 10000), point(4, 10100, 10000)]);
  instance.navigate([point(3, 9900, 10000), point(4, 10200, 10000)]);
  assert.deepEqual(instance.snapshot(), { scale: 1.5, x: -552, y: -402 });
  const saved = instance.snapshot();
  assert.equal(instance.navigate([point(NaN, 1, 2), point(4, Infinity, 2)]), false);
  assert.equal(instance.navigate([point(3, 10, 10), point(4, 10, 10)]), false);
  assert.deepEqual(instance.snapshot(), saved);
  instance.setViewport(NaN, 10); assert.deepEqual(instance.snapshot(), saved);
  instance.reset(); assert.deepEqual(instance.snapshot(), { scale: 1, x: 0, y: 0 });
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
