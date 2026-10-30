// SPDX-License-Identifier: AGPL-3.0-or-later

// proto/messages StatsMessages 扩展字段字节级测试（T1）：
// 覆盖 GraphsResponse 的 forecast/hours/decks/ease/interval/buttons/added/
// true_retention/rollover_hour/difficulty/stability 子消息与 GraphPreferences 编解码。
// 与 proto-extra.test.mjs 互补（后者只覆盖 today/retrievability/reviews）。
import assert from 'node:assert/strict';
import test from 'node:test';

import { 协议写入器 } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';
import {
  Weekday,
  decodeGraphPreferences,
  decodeGraphsResponse,
  encodeEmpty,
  encodeGraphPreferences
} from '../../entry/src/main/ets/proto/messages/StatsMessages.ts';

function hex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(' ');
}

// ── Buttons（field 1）──

test('GraphsResponse.buttons decodes 4 windows × 3 button classes × 4 buttons', () => {
  // ButtonCounts.learning = [1, 2, 3, 4]（4 评分按钮），young/mature 同理
  const bc = new 协议写入器();
  bc.写入字节(1, new Uint8Array([1, 2, 3, 4])); // packed uint32
  bc.写入字节(2, new Uint8Array([5, 6, 7, 8]));
  bc.写入字节(3, new Uint8Array([9, 10, 11, 12]));
  const buttons = new 协议写入器();
  buttons.写入子消息(1, bc); // one_month
  buttons.写入子消息(4, bc); // all_time

  const top = new 协议写入器();
  top.写入子消息(1, buttons);

  const view = decodeGraphsResponse(top.转为字节());
  assert.notEqual(view.buttons, null);
  assert.notEqual(view.buttons.oneMonth, null);
  assert.deepEqual(view.buttons.oneMonth.learning, [1, 2, 3, 4]);
  assert.deepEqual(view.buttons.oneMonth.mature, [9, 10, 11, 12]);
  assert.equal(view.buttons.threeMonths, null);
  assert.notEqual(view.buttons.allTime, null);
  assert.deepEqual(view.buttons.allTime.young, [5, 6, 7, 8]);
});

test('GraphsResponse.buttons handles empty sub-message (all defaults)', () => {
  const buttons = new 协议写入器();
  const top = new 协议写入器();
  top.写入子消息(1, buttons);

  const view = decodeGraphsResponse(top.转为字节());
  assert.notEqual(view.buttons, null);
  assert.equal(view.buttons.oneMonth, null);
  assert.deepEqual(view.buttons.allTime, null);
});

test('GraphsResponse.buttons.ButtonCounts accepts unpacked repeated uint32 (proto3 parser requirement)', () => {
  // proto3 repeated uint32 默认 packed，但解析器必须同时接受 unpacked（每个值单独 wire type 0）。
  // 构造 unpacked ButtonCounts：learning=[1,2,3,4] 写成 4 个独立 field1 varint。
  const bc = new 协议写入器();
  bc.写入变长整数(1, 1);
  bc.写入变长整数(1, 2);
  bc.写入变长整数(1, 3);
  bc.写入变长整数(1, 4);
  bc.写入变长整数(2, 5);  // young unpacked
  bc.写入变长整数(2, 6);
  const buttons = new 协议写入器();
  buttons.写入子消息(1, bc);

  const top = new 协议写入器();
  top.写入子消息(1, buttons);

  const view = decodeGraphsResponse(top.转为字节());
  assert.notEqual(view.buttons, null);
  assert.notEqual(view.buttons.oneMonth, null);
  assert.deepEqual(view.buttons.oneMonth.learning, [1, 2, 3, 4]);
  assert.deepEqual(view.buttons.oneMonth.young, [5, 6]);
  assert.deepEqual(view.buttons.oneMonth.mature, []);
});

// ── CardCounts（field 2）──

test('GraphsResponse.card_counts decodes including/excluding inactive breakdowns', () => {
  const incl = new 协议写入器();
  incl.写入变长整数(1, 10); // newCards
  incl.写入变长整数(2, 5);   // learn
  incl.写入变长整数(4, 20); // young
  incl.写入变长整数(5, 30); // mature
  // suspended/buried counts 为 0（includingInactive 口径下）

  const excl = new 协议写入器();
  excl.写入变长整数(6, 3); // suspended
  excl.写入变长整数(7, 2); // buried

  const cc = new 协议写入器();
  cc.写入子消息(1, incl);
  cc.写入子消息(2, excl);

  const top = new 协议写入器();
  top.写入子消息(2, cc);

  const view = decodeGraphsResponse(top.转为字节());
  assert.notEqual(view.cardCounts, null);
  assert.equal(view.cardCounts.includingInactive.newCards, 10);
  assert.equal(view.cardCounts.includingInactive.young, 20);
  assert.equal(view.cardCounts.includingInactive.suspended, 0);
  assert.equal(view.cardCounts.excludingInactive.suspended, 3);
  assert.equal(view.cardCounts.excludingInactive.buried, 2);
});

// ── Hours（field 3）──

test('GraphsResponse.hours decodes 4 windows × 24 hours buckets', () => {
  const hour0 = new 协议写入器();
  hour0.写入变长整数(1, 50); // total
  hour0.写入变长整数(2, 40); // correct
  const hour23 = new 协议写入器();
  hour23.写入变长整数(1, 5);

  // repeated Hour 在 wire format 中是同一 field 号多次出现（非 packed），
  // 每个 Hour 是独立的 wire type 2 子消息，不套额外的 list 层。
  const hours = new 协议写入器();
  hours.写入子消息(1, hour0);   // one_month[0]
  hours.写入子消息(1, hour23);  // one_month[1]
  hours.写入子消息(3, hour0);   // one_year[0]
  hours.写入子消息(3, hour23);  // one_year[1]

  const top = new 协议写入器();
  top.写入子消息(3, hours);

  const view = decodeGraphsResponse(top.转为字节());
  assert.notEqual(view.hours, null);
  assert.equal(view.hours.oneMonth.length, 2);
  assert.equal(view.hours.oneMonth[0].total, 50);
  assert.equal(view.hours.oneMonth[0].correct, 40);
  assert.equal(view.hours.oneMonth[1].total, 5);
  assert.equal(view.hours.oneMonth[1].correct, 0);
  assert.equal(view.hours.threeMonths.length, 0);
  assert.equal(view.hours.oneYear.length, 2);
  assert.equal(view.hours.allTime.length, 0);
});

// ── Eases（field 5）+ difficulty（field 11）──

test('GraphsResponse.eases decodes map<uint32,uint32> + average float', () => {
  // 两条 map entry：key=2500 value=3, key=3000 value=7
  const e1 = new 协议写入器();
  e1.写入变长整数(1, 2500);
  e1.写入变长整数(2, 3);
  const e2 = new 协议写入器();
  e2.写入变长整数(1, 3000);
  e2.写入变长整数(2, 7);
  const eases = new 协议写入器();
  eases.写入子消息(1, e1);
  eases.写入子消息(1, e2);
  eases.写入浮点(2, 2.5); // average

  const top = new 协议写入器();
  top.写入子消息(5, eases);

  const view = decodeGraphsResponse(top.转为字节());
  assert.notEqual(view.eases, null);
  assert.equal(view.eases.eases.size, 2);
  assert.equal(view.eases.eases.get(2500), 3);
  assert.equal(view.eases.eases.get(3000), 7);
  assert.ok(Math.abs(view.eases.average - 2.5) < 1e-6);
  assert.equal(view.difficulty, null);
});

test('GraphsResponse.difficulty (field 11) reuses Eases decoder', () => {
  const e = new 协议写入器();
  const entry = new 协议写入器();
  entry.写入变长整数(1, 100);
  entry.写入变长整数(2, 9);
  e.写入子消息(1, entry);
  e.写入浮点(2, 0.1);

  const top = new 协议写入器();
  top.写入子消息(11, e); // difficulty

  const view = decodeGraphsResponse(top.转为字节());
  assert.notEqual(view.difficulty, null);
  assert.equal(view.difficulty.eases.get(100), 9);
  assert.ok(Math.abs(view.difficulty.average - 0.1) < 1e-6);
  assert.equal(view.eases, null); // eases (field 5) 未出现
});

// ── Intervals（field 6）+ stability（field 14）──

test('GraphsResponse.intervals decodes map<uint32,uint32>', () => {
  const e1 = new 协议写入器();
  e1.写入变长整数(1, 1);   // 1 天
  e1.写入变长整数(2, 10);
  const e2 = new 协议写入器();
  e2.写入变长整数(1, 7);   // 7 天
  e2.写入变长整数(2, 5);
  const intervals = new 协议写入器();
  intervals.写入子消息(1, e1);
  intervals.写入子消息(1, e2);

  const top = new 协议写入器();
  top.写入子消息(6, intervals);

  const view = decodeGraphsResponse(top.转为字节());
  assert.notEqual(view.intervals, null);
  assert.equal(view.intervals.intervals.size, 2);
  assert.equal(view.intervals.intervals.get(1), 10);
  assert.equal(view.intervals.intervals.get(7), 5);
});

test('GraphsResponse.stability (field 14) reuses Intervals decoder', () => {
  const e = new 协议写入器();
  e.写入变长整数(1, 30);
  e.写入变长整数(2, 4);
  const stab = new 协议写入器();
  stab.写入子消息(1, e);

  const top = new 协议写入器();
  top.写入子消息(14, stab);

  const view = decodeGraphsResponse(top.转为字节());
  assert.notEqual(view.stability, null);
  assert.equal(view.stability.intervals.get(30), 4);
});

// ── FutureDue / forecast（field 7）──

test('GraphsResponse.future_due decodes int32 keys (incl. backlog negatives) + bool + daily_load', () => {
  // backlog: -3 天 → 5 张；今天（0 天）→ 12 张；+7 天 → 8 张
  // int32 负数：prost sign-extend 到 64 位再 varint，故 -3 → 0xfffffffffffffffdN
  // 编码：BigInt.asUintN(64, BigInt(-3)) → varint 10 字节
  const eBack = new 协议写入器();
  eBack.写入64位整数(1, -3); // 用 写入64位整数 也能正确编出 -3 的补码（10 字节 varint）
  eBack.写入变长整数(2, 5);
  const eToday = new 协议写入器();
  eToday.写入变长整数(1, 0);
  eToday.写入变长整数(2, 12);
  const eFuture = new 协议写入器();
  eFuture.写入变长整数(1, 7);
  eFuture.写入变长整数(2, 8);

  const fd = new 协议写入器();
  fd.写入子消息(1, eBack);
  fd.写入子消息(1, eToday);
  fd.写入子消息(1, eFuture);
  fd.写入布尔(2, true);   // have_backlog
  fd.写入变长整数(3, 15);  // daily_load

  const top = new 协议写入器();
  top.写入子消息(7, fd);

  const view = decodeGraphsResponse(top.转为字节());
  assert.notEqual(view.futureDue, null);
  assert.equal(view.futureDue.futureDue.size, 3);
  assert.equal(view.futureDue.futureDue.get(-3), 5);
  assert.equal(view.futureDue.futureDue.get(0), 12);
  assert.equal(view.futureDue.futureDue.get(7), 8);
  assert.equal(view.futureDue.haveBacklog, true);
  assert.equal(view.futureDue.dailyLoad, 15);
});

// ── Added（field 8）──

test('GraphsResponse.added decodes map<int32,uint32>', () => {
  const e1 = new 协议写入器();
  e1.写入64位整数(1, -30); // 30 天前
  e1.写入变长整数(2, 50);
  const e2 = new 协议写入器();
  e2.写入变长整数(1, 0);
  e2.写入变长整数(2, 3);
  const added = new 协议写入器();
  added.写入子消息(1, e1);
  added.写入子消息(1, e2);

  const top = new 协议写入器();
  top.写入子消息(8, added);

  const view = decodeGraphsResponse(top.转为字节());
  assert.notEqual(view.added, null);
  assert.equal(view.added.added.size, 2);
  assert.equal(view.added.added.get(-30), 50);
  assert.equal(view.added.added.get(0), 3);
});

// ── rollover_hour（field 10）──

test('GraphsResponse.rollover_hour decodes uint32 scalar', () => {
  const top = new 协议写入器();
  top.写入变长整数(10, 4); // 凌晨 4 点日切

  const view = decodeGraphsResponse(top.转为字节());
  assert.equal(view.rolloverHour, 4);
});

// ── TrueRetentionStats（field 15）──

test('GraphsResponse.true_retention decodes 6 time windows', () => {
  const today = new 协议写入器();
  today.写入变长整数(1, 80); // young_passed
  today.写入变长整数(2, 5);  // young_failed
  today.写入变长整数(3, 50); // mature_passed
  today.写入变长整数(4, 2);  // mature_failed

  const week = new 协议写入器();
  week.写入变长整数(1, 600);

  const tr = new 协议写入器();
  tr.写入子消息(1, today);  // today
  tr.写入子消息(3, week);    // week

  const top = new 协议写入器();
  top.写入子消息(15, tr);

  const view = decodeGraphsResponse(top.转为字节());
  assert.notEqual(view.trueRetention, null);
  assert.notEqual(view.trueRetention.today, null);
  assert.equal(view.trueRetention.today.youngPassed, 80);
  assert.equal(view.trueRetention.today.matureFailed, 2);
  assert.notEqual(view.trueRetention.week, null);
  assert.equal(view.trueRetention.week.youngPassed, 600);
  assert.equal(view.trueRetention.week.maturePassed, 0);
  assert.equal(view.trueRetention.yesterday, null);
  assert.equal(view.trueRetention.allTime, null);
});

// ── 综合响应：所有字段齐备 ──

test('GraphsResponse decodes all fields together without interference', () => {
  const today = new 协议写入器();
  today.写入变长整数(1, 100);
  const buttons = new 协议写入器();
  const future = new 协议写入器();
  future.写入变长整数(3, 25);

  const top = new 协议写入器();
  top.写入子消息(1, buttons);   // buttons 空
  top.写入子消息(4, today);     // today
  top.写入子消息(7, future);    // future_due
  top.写入变长整数(10, 0);       // rollover_hour = 0（默认值，prost 会省略；这里手动写测试解码）
  top.写入布尔(13, false);       // fsrs = false（同上）

  const view = decodeGraphsResponse(top.转为字节());
  assert.notEqual(view.buttons, null);
  assert.equal(view.today.answerCount, 100);
  assert.notEqual(view.futureDue, null);
  assert.equal(view.futureDue.dailyLoad, 25);
  assert.equal(view.fsrs, false);
  // 字段未出现时回落 null/0
  assert.equal(view.cardCounts, null);
  assert.equal(view.hours, null);
  assert.equal(view.eases, null);
  assert.equal(view.intervals, null);
  assert.equal(view.added, null);
  assert.equal(view.difficulty, null);
  assert.equal(view.stability, null);
  assert.equal(view.trueRetention, null);
});

test('GraphsResponse skips unknown field numbers (forward compatibility)', () => {
  const top = new 协议写入器();
  top.写入变长整数(99, 1234); // 未知字段号
  top.写入变长整数(13, 1);     // fsrs

  const view = decodeGraphsResponse(top.转为字节());
  assert.equal(view.fsrs, true);
});

// ── GraphPreferences 编解码 ──

test('encodeEmpty returns zero bytes for GetGraphPreferences request', () => {
  assert.equal(encodeEmpty().length, 0);
});

test('encodeGraphPreferences omits default values like prost', () => {
  // 全默认：SUNDAY=0 + 三个 false → 零字节
  const defaults = {
    calendarFirstDayOfWeek: Weekday.SUNDAY,
    cardCountsSeparateInactive: false,
    browserLinksSupported: false,
    futureDueShowBacklog: false
  };
  assert.equal(encodeGraphPreferences(defaults).length, 0);
});

test('encodeGraphPreferences writes all non-default fields in order', () => {
  const prefs = {
    calendarFirstDayOfWeek: Weekday.MONDAY, // 1
    cardCountsSeparateInactive: true,
    browserLinksSupported: true,
    futureDueShowBacklog: true
  };
  const bytes = encodeGraphPreferences(prefs);
  // field1 varint 1 → 08 01；field2 bool → 10 01；field3 bool → 18 01；field4 bool → 20 01
  assert.equal(hex(bytes), '08 01 10 01 18 01 20 01');
});

test('encodeGraphPreferences handles FRIDAY=5 and SATURDAY=6', () => {
  const friday = {
    calendarFirstDayOfWeek: Weekday.FRIDAY,
    cardCountsSeparateInactive: false,
    browserLinksSupported: false,
    futureDueShowBacklog: false
  };
  assert.equal(hex(encodeGraphPreferences(friday)), '08 05');

  const sat = {
    calendarFirstDayOfWeek: Weekday.SATURDAY,
    cardCountsSeparateInactive: false,
    browserLinksSupported: false,
    futureDueShowBacklog: false
  };
  assert.equal(hex(encodeGraphPreferences(sat)), '08 06');
});

test('decodeGraphPreferences decodes all fields', () => {
  const w = new 协议写入器();
  w.写入变长整数(1, 6);  // SATURDAY
  w.写入布尔(2, true);
  w.写入布尔(3, true);
  w.写入布尔(4, true);

  const prefs = decodeGraphPreferences(w.转为字节());
  assert.equal(prefs.calendarFirstDayOfWeek, Weekday.SATURDAY);
  assert.equal(prefs.cardCountsSeparateInactive, true);
  assert.equal(prefs.browserLinksSupported, true);
  assert.equal(prefs.futureDueShowBacklog, true);
});

test('decodeGraphPreferences returns defaults for empty bytes', () => {
  const prefs = decodeGraphPreferences(new Uint8Array(0));
  assert.equal(prefs.calendarFirstDayOfWeek, Weekday.SUNDAY);
  assert.equal(prefs.cardCountsSeparateInactive, false);
  assert.equal(prefs.browserLinksSupported, false);
  assert.equal(prefs.futureDueShowBacklog, false);
});

test('GraphPreferences roundtrip: encode → decode preserves all fields', () => {
  const original = {
    calendarFirstDayOfWeek: Weekday.MONDAY,
    cardCountsSeparateInactive: true,
    browserLinksSupported: false,
    futureDueShowBacklog: true
  };
  const decoded = decodeGraphPreferences(encodeGraphPreferences(original));
  assert.equal(decoded.calendarFirstDayOfWeek, original.calendarFirstDayOfWeek);
  assert.equal(decoded.cardCountsSeparateInactive, original.cardCountsSeparateInactive);
  assert.equal(decoded.browserLinksSupported, original.browserLinksSupported);
  assert.equal(decoded.futureDueShowBacklog, original.futureDueShowBacklog);
});

test('decodeGraphPreferences skips unknown field numbers', () => {
  const w = new 协议写入器();
  w.写入变长整数(99, 42); // unknown
  w.写入布尔(2, true);

  const prefs = decodeGraphPreferences(w.转为字节());
  assert.equal(prefs.calendarFirstDayOfWeek, Weekday.SUNDAY); // 默认
  assert.equal(prefs.cardCountsSeparateInactive, true);
});
