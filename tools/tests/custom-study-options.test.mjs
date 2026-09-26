// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { customStudyInitialValue, customStudyValueValid } from '../../entry/src/main/ets/model/CustomStudyOptions.ts';
import { encodeCustomStudyCramRequest, 自定义学习预设 as presets } from '../../entry/src/main/ets/proto/messages/SchedulerMessages.ts';

test('custom study takes separate new/review defaults from the deck', () => {
  const defaults = { extendNew: 20, extendReview: 80 };
  assert.equal(customStudyInitialValue(presets.新卡上限增量, defaults), 20);
  assert.equal(customStudyInitialValue(presets.复习上限增量, defaults), 80);
  assert.equal(customStudyInitialValue(presets.新卡上限增量, null), 0);
  assert.equal(customStudyInitialValue(presets.预览新卡天数, defaults), 1);
  assert.equal(customStudyInitialValue(presets.按状态或标签, defaults), 100);
});

test('custom study rejects invalid integers and only permits negative limit deltas', () => {
  for (const value of ['', '0', '1.5', '1e2', 'Infinity', '2147483648', '-2147483649']) {
    assert.equal(customStudyValueValid(presets.新卡上限增量, value), false, value);
  }
  assert.equal(customStudyValueValid(presets.新卡上限增量, '-3'), true);
  assert.equal(customStudyValueValid(presets.复习上限增量, '2147483647'), true);
  for (const preset of [presets.复习遗忘天数, presets.提前复习天数, presets.预览新卡天数, presets.按状态或标签]) {
    assert.equal(customStudyValueValid(preset, '-3'), false);
    assert.equal(customStudyValueValid(preset, '1'), true);
  }
  assert.equal(customStudyValueValid(presets.提前复习天数, '100000'), false);
});

test('custom study cram uses protobuf oneof 7 with distinct include/exclude tags', () => {
  // scheduler.proto: deck_id=1, cram=7; kind=1, card_limit=2, includes=3, excludes=4.
  for (const kind of [0, 1, 2, 3]) {
    const bytes = encodeCustomStudyCramRequest(1, {
      kind, cardLimit: 100, tagsToInclude: ['a', 'b'], tagsToExclude: ['c']
    });
    assert.deepEqual([...bytes], [8, 1, 58, 13, 8, kind, 16, 100, 26, 1, 97, 26, 1, 98, 34, 1, 99]);
  }
});
