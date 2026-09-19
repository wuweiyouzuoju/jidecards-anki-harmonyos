// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

const source = readFileSync(new URL('../../entry/src/main/ets/components/stats/日历卡.ets', import.meta.url), 'utf8');
const methods = ['重算格子', '取格数据', '数据为空', 'alignCalendarToLatestDay'].map(name => {
  const start = source.indexOf(`  private ${name}(`);
  assert.ok(start >= 0);
  return source.slice(start, source.indexOf('\n  }', start) + 4);
});
const helpers = ['周首日转数字', '取日期'].map(name => {
  const start = source.indexOf(`function ${name}(`);
  return source.slice(start, source.indexOf('\n}', start) + 2);
});
const Weekday = { SUNDAY: 0, MONDAY: 1, FRIDAY: 5, SATURDAY: 6 };

function calendar(now, year, firstDay) {
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now.getTime()])); }
  }
  const Calendar = new Function('Date', 'Weekday', stripTypeScriptTypes(
    `${helpers.join('\n')}\nclass Calendar { ${methods.join('\n')} }`, { mode: 'transform' }) + '; return Calendar;')(Clock, Weekday);
  const value = new Calendar();
  Object.assign(value, {
    目标年份: year, 周首日: firstDay, 总列数: 54,
    calendarWidth: 768, calendarViewportWidth: 0, calendarAlignmentKey: '',
    复习计数: new Map([[0, { learn: 1, relearn: 2, young: 3, mature: 4, filtered: 5 }],
      [1, { learn: 99, relearn: 0, young: 0, mature: 0, filtered: 0 }]])
  });
  value.重算格子();
  return value;
}

test('annual heatmap shows past zero-review dates but leaves future dates absent for every supported week start', () => {
  for (const firstDay of Object.values(Weekday)) {
    const value = calendar(new Date(2026, 8, 19, 12), 2026, firstDay);
    const days = [...value.格子缓存.values()];
    assert.equal(days.length, 262);
    assert.equal(days.find(day => day.日期 === '2026-09-19').数量, 15);
    assert.equal(days.find(day => day.日期 === '2026-09-18').数量, 0);
    assert.equal(days.some(day => day.日期 > '2026-09-19'), false);
    assert.equal(value.最大计数, 15);
    const first = days.find(day => day.日期 === '2026-01-01');
    assert.equal(first.列, 0);
    assert.equal(first.行, (4 - firstDay + 7) % 7);
    assert.equal(value.取格数据(53, 6), null);
  }
});

test('calendar aligns today to the viewport right across week starts and clamps year edges and wide layouts', () => {
  for (const now of [new Date(2026, 0, 1, 12), new Date(2026, 8, 19, 12), new Date(2028, 11, 31, 12)]) {
    for (const firstDay of Object.values(Weekday)) {
      for (const width of [280, 420, 900]) {
        const value = calendar(now, now.getFullYear(), firstDay);
        const calls = [];
        value.calendarScroller = { scrollTo: options => calls.push(options) };
        value.alignCalendarToLatestDay();
        assert.equal(calls.length, 0, 'wait for measured layout');
        value.calendarViewportWidth = width;
        value.alignCalendarToLatestDay();
        const today = [...value.格子缓存.values()].at(-1);
        const cellWidth = (768 - 10 - 54 * 2) / 54;
        const right = 12 + today.列 * (cellWidth + 2) + cellWidth;
        const offset = calls[0].xOffset;
        assert.ok(offset >= 0 && offset <= Math.max(0, 768 - width));
        if (right > width && width < 768) assert.ok(Math.abs(right - offset - width) < 0.001);
        else assert.equal(offset, 0);
        assert.equal(calls[0].animation, false);
        assert.equal(calls[0].yOffset, 0);
      }
    }
  }
});

test('refresh preserves manual scroll; width, year and week start changes realign', () => {
  const value = calendar(new Date(2026, 8, 19, 12), 2026, Weekday.SUNDAY);
  const calls = [];
  value.calendarViewportWidth = 320;
  value.calendarScroller = { scrollTo: options => calls.push(options) };
  value.alignCalendarToLatestDay();
  value.重算格子();
  value.alignCalendarToLatestDay();
  assert.equal(calls.length, 1);
  value.calendarViewportWidth = 400;
  value.alignCalendarToLatestDay();
  assert.equal(calls.length, 2);
  value.周首日 = Weekday.MONDAY;
  value.重算格子(); value.alignCalendarToLatestDay();
  assert.equal(calls.length, 3);
  value.目标年份 = 2025;
  value.复习计数 = new Map([[-262, { learn: 1, relearn: 0, young: 0, mature: 0, filtered: 0 }]]);
  value.重算格子(); value.alignCalendarToLatestDay();
  assert.equal(calls.length, 4);
  assert.ok(calls.at(-1).xOffset > 350, 'previous year shows its last week');
  assert.match(source, /Scroll\(this\.calendarScroller\)/);
  assert.match(source, /scrollBar\(BarState\.On\)/);
  assert.match(source, /onAreaChange[\s\S]*?this\.alignCalendarToLatestDay\(\)/);
});

test('year boundaries and leap day remain distinct calendar cells', () => {
  const january = calendar(new Date(2026, 0, 1, 12), 2026, Weekday.SUNDAY);
  assert.equal(january.格子缓存.size, 1);
  const leap = calendar(new Date(2028, 11, 31, 12), 2028, Weekday.SUNDAY);
  const dates = [...leap.格子缓存.values()].map(day => day.日期);
  assert.equal(dates.length, 366);
  assert.ok(dates.includes('2028-02-29'));
  assert.ok(dates.includes('2028-12-31'));
});
