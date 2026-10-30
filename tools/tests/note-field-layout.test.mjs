// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { NOTE_FIELD_EDITING_SUPPORT } from '../../entry/src/main/ets/model/NoteFieldEditing.ts';
import { loadComponentLogic } from './platform-module-harness.mjs';

const Layout = loadComponentLogic('components/common/NoteFieldLayout.ets', 'NoteFieldLayout', {
  应用尺寸: { 间距_8: 8, 间距_5: 5, 按钮高度:44 }
});
const caller = readFileSync(new URL('../../entry/src/main/ets/components/common/NoteFieldEditor.ets', import.meta.url), 'utf8');
const binding = caller.match(/NoteFieldLayout\((\{[\s\S]*?\})\)/)[1];
const layoutProps = new Function('NOTE_FIELD_EDITING_SUPPORT',
  stripTypeScriptTypes('const props = ' + binding + ';', { mode: 'transform' }) + 'return props;');
function makeLayout() {
  // 执行真实宿主接线，避免测试自行复制断点而漏掉 UI 的参数传递。
  return Object.assign(new Layout(), layoutProps.call({}, NOTE_FIELD_EDITING_SUPPORT));
}
function child(height) {
  return { measureResult: null, position: null, measures: [],
    measure(constraint) {
      this.measures.push(constraint);
      this.measureResult = { width: constraint.maxWidth, height: Math.max(constraint.minHeight, height) };
      return this.measureResult;
    },
    layout(position) { this.position = position; }
  };
}
function arrange(layout, children, width) {
  const constraint = { minWidth: width, maxWidth: width, minHeight: 0, maxHeight: Infinity };
  const size = layout.onMeasureSize({ width: 0, height: 0 }, children, constraint);
  layout.onPlaceChildren(size, children, constraint);
  return size;
}

test('the first measurement places wide mode controls on the right without a width callback', () => {
  const layout = makeLayout(), children = [child(44), child(44), child(112)];
  assert.deepEqual(arrange(layout, children, 800), { width: 800, height: 112 });
  assert.deepEqual(children.map(item => item.measureResult.width), [96, 96, 696]);
  assert.deepEqual(children.map(item => item.position), [{ x: 704, y: 0 }, { x: 704, y: 68 }, { x: 0, y: 0 }]);
  assert.ok(children.every(item => item.measures.length === 1));
});

test('first render and resizing use actual field constraints while keeping the same children', () => {
  const layout = makeLayout();
  for (const inputHeight of [112, 336, 120, 640, 1800]) for (const hintHeight of [0, 24, 52]) {
    const children = [child(44), child(50), child(inputHeight)];
    if (hintHeight) children.push(child(hintHeight));
    const identities = children.slice();
    for (const width of [1600, 320, 479, 480, 800, 360]) {
      const size = arrange(layout, children, width), wide = width >= 480;
      const buttonWidth = wide ? 96 : (width - 8) / 2, inputWidth = wide ? width - 104 : width;
      const inputTop = wide ? 0 : 55;
      assert.deepEqual(children, identities);
      assert.deepEqual(children.map(item => item.measureResult.width),
        hintHeight ? [buttonWidth, buttonWidth, inputWidth, inputWidth] : [buttonWidth, buttonWidth, inputWidth]);
      assert.deepEqual(children[0].position, { x: wide ? inputWidth + 8 : 0, y: 0 });
      assert.deepEqual(children[1].position, { x: wide ? inputWidth + 8 : buttonWidth + 8,
        y: wide ? inputHeight - 50 : 0 });
      assert.deepEqual(children[2].position, { x: 0, y: inputTop });
      assert.equal(size.height, inputTop + inputHeight + (hintHeight ? hintHeight + 5 : 0));
      if (hintHeight) assert.deepEqual(children[3].position, { x: 0, y: inputTop + inputHeight + 5 });
    }
  }
});

// Shared Button minimum height must survive the custom parent measurement.
test('mode controls preserve the shared 44vp minimum when their labels are short', () => {
  const children=[child(20),child(18),child(112)];
  assert.deepEqual(arrange(makeLayout(),children,800),{width:800,height:112});
  assert.equal(children[0].measureResult.height,44);assert.equal(children[1].measureResult.height,44);
  assert.equal(children[1].position.y,68);
});
