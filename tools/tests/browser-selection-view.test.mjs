// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadComponentLogic } from './platform-module-harness.mjs';

const Table = loadComponentLogic('components/browser/卡片表格.ets', '卡片表格', {});

test('browser row gestures emit selection intents without retaining a second selection', () => {
  const table = new Table(), events = [];
  table.onRowClick = id => events.push(['open', id]);
  table.onMultiSelectChange = value => events.push(['mode', value]);
  table.onSelectionChange = ids => events.push(['selection', ids]);
  table.处理行点击(1);
  table.处理长按(2);
  assert.deepEqual(events, [['open', 1], ['mode', true], ['selection', [2]]]);
  assert.equal(table.多选模式, false); assert.deepEqual(table.选中IDs, []);

  table.多选模式 = true; table.选中IDs = [2, 3];
  table.处理行点击(2);
  assert.deepEqual(events.at(-1), ['selection', [3]]);
  assert.deepEqual(table.选中IDs, [2, 3]);
  table.选中IDs = [3];
  table.设置选中(4, true);
  assert.deepEqual(events.at(-1), ['selection', [3, 4]]);
  table.多选模式 = false; table.选中IDs = [];
  table.处理行点击(4);
  assert.deepEqual(events.at(-1), ['open', 4]);
});
