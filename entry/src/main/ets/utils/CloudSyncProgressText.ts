// SPDX-License-Identifier: AGPL-3.0-or-later
import { localeNumber, localePercent } from './LocaleFormatting';

/** 只显示当前阶段有依据的计数，不把附件完成当作整个任务完成。 */
export function cloudSyncProgressText(done: number, total: number, percent: number, locale: string, unit: string = 'files'): string {
  if (total <= 0 || percent < 0) return '';
  if (unit === 'bytes') {
    const divisor = total >= 1024 * 1024 ? 1024 * 1024 : 1024;
    const suffix = divisor === 1024 ? 'KB' : 'MB';
    return `${localeNumber(done / divisor, locale, 1)} / ${localeNumber(total / divisor, locale, 1)} ${suffix} · ${localePercent(percent / 100, locale)}`;
  }
  return `${localeNumber(done, locale)} / ${localeNumber(total, locale)} · ${localePercent(percent / 100, locale)}`;
}
