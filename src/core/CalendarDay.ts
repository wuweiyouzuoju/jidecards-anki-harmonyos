// SPDX-License-Identifier: AGPL-3.0-or-later
const DAY_MS: number = 86400000;

function pad(value: number, width: number): string { return value.toString().padStart(width, '0'); }

function keyFromUtc(date: Date): string {
  const year: number = date.getUTCFullYear();
  if (year < 1 || year > 9999) { throw new Error('Calendar year out of range'); }
  return pad(year, 4) + '-' + pad(date.getUTCMonth() + 1, 2) + '-' + pad(date.getUTCDate(), 2);
}

function calendarDate(key: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) { throw new Error('Invalid calendar day'); }
  const year: number = Number(key.substring(0, 4));
  const month: number = Number(key.substring(5, 7));
  const day: number = Number(key.substring(8, 10));
  const date: Date = new Date(0);
  // setUTCFullYear 避免 Date 构造器把 1–99 年解释成 1901–1999。
  date.setUTCFullYear(year, month - 1, day);
  if (year < 1 || keyFromUtc(date) !== key) { throw new Error('Invalid calendar day'); }
  return date;
}

/** 统计日由产品选定时区；本函数明确使用运行环境的本地日历。 */
export function localDayKey(date: Date): string {
  const year: number = date.getFullYear();
  if (!Number.isFinite(date.getTime()) || year < 1 || year > 9999) { throw new Error('Invalid local date'); }
  return pad(year, 4) + '-' + pad(date.getMonth() + 1, 2) + '-' + pad(date.getDate(), 2);
}

export function isCalendarDay(key: string): boolean {
  try { calendarDate(key); return true; } catch { return false; }
}

/** 日历运算使用 UTC 日期序号，不把本地跨日当作固定 24 小时。 */
export function addCalendarDays(key: string, offset: number): string {
  if (!Number.isSafeInteger(offset)) { throw new Error('Invalid day offset'); }
  const date: Date = calendarDate(key);
  date.setUTCDate(date.getUTCDate() + offset);
  if (!Number.isFinite(date.getTime())) { throw new Error('Calendar year out of range'); }
  return keyFromUtc(date);
}

export function calendarDayDistance(from: string, to: string): number {
  return (calendarDate(to).getTime() - calendarDate(from).getTime()) / DAY_MS;
}
