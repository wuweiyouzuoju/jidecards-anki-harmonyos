// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeScheduleCardsAsNew, decodeScheduleCardsAsNewDefaults } from '../../entry/src/main/ets/proto/messages/SchedulerMessages.ts';
import { 协议读取器 } from '../../entry/src/main/ets/proto/core/ProtoReader.ts';
import { 调度器方法 } from '../../entry/src/main/ets/backend/服务索引.ts';
import { readFileSync } from 'node:fs';
test('reset sends selected identities, manual logging, both options and present BROWSER context', () => {
  for (const restorePosition of [true, false]) for (const resetCounts of [true, false]) {
    const reader = new 协议读取器(encodeScheduleCardsAsNew([1700000000001,1700000000002], {restorePosition, resetCounts}));
    const fields = new Map(); let tag;
    while ((tag = reader.读取标签()) !== null) {
      const value = reader.读取64位整数(); fields.set(tag.字段号, [...(fields.get(tag.字段号) ?? []), value]);
    }
    assert.deepEqual(fields.get(1), [1700000000001,1700000000002]);
    assert.deepEqual(fields.get(2), [1]); assert.deepEqual(fields.get(3), [Number(restorePosition)]);
    assert.deepEqual(fields.get(4), [Number(resetCounts)]); assert.deepEqual(fields.get(5), [0]);
  }
  assert.throws(() => encodeScheduleCardsAsNew([-1], {restorePosition:true,resetCounts:true}), /Invalid card/);
  assert.deepEqual(decodeScheduleCardsAsNewDefaults(new Uint8Array([8,1,16,0,24,7])), {restorePosition:true,resetCounts:false});
});
test('reset RPC identities come from the locked Core dispatch', () => {
  const baseline = JSON.parse(readFileSync(new URL('../rpc-index-baseline.json', import.meta.url)));
  assert.equal(baseline.services.scheduler.methods[调度器方法.scheduleCardsAsNew], 'schedule_cards_as_new');
  assert.equal(baseline.services.scheduler.methods[调度器方法.scheduleCardsAsNewDefaults], 'schedule_cards_as_new_defaults');
});
