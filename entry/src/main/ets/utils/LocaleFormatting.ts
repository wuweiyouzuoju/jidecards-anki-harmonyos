// SPDX-License-Identifier: AGPL-3.0-or-later
import { resolveAppLocale } from '../model/AppLocales';

/** 只格式化显示值；协议数字、搜索语法及文件名继续使用原始值。 */
export function localeNumber(value: number, locale: string, digits: number = 0): string {
  return new Intl.NumberFormat(resolveAppLocale(locale), {
    minimumFractionDigits: digits, maximumFractionDigits: digits
  }).format(value);
}

export function localeDate(timestamp: number, locale: string, withTime: boolean = true): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '—';
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit' };
  if (withTime) { options.hour = '2-digit'; options.minute = '2-digit'; }
  return new Intl.DateTimeFormat(resolveAppLocale(locale), options).format(new Date(timestamp));
}

export function localeMonthDay(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(resolveAppLocale(locale), { month: 'numeric', day: 'numeric' }).format(date);
}

export function localePercent(ratio: number, locale: string, digits: number = 0): string {
  return new Intl.NumberFormat(resolveAppLocale(locale), {
    style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits
  }).format(ratio);
}

export function localeCompact(value: number, locale: string): string {
  return new Intl.NumberFormat(resolveAppLocale(locale), { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function localeWeekdays(locale: string): string[] {
  const formatter: Intl.DateTimeFormat = new Intl.DateTimeFormat(resolveAppLocale(locale), { weekday: 'narrow' });
  return [0, 1, 2, 3, 4, 5, 6].map((day: number): string => formatter.format(new Date(2026, 9, 18 + day, 12)));
}
