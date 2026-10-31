// SPDX-License-Identifier: AGPL-3.0-or-later
import { 自定义学习预设 } from '../proto/messages/SchedulerMessages';
import type { 自定义学习默认值 } from '../proto/messages/SchedulerMessages';

export function isCustomStudyLimit(preset: number): boolean {
  return preset === 自定义学习预设.新卡上限增量 || preset === 自定义学习预设.复习上限增量;
}

/** 与 AnkiDroid 的整数输入一致：额度可减，其余必须为正数，排除小数与溢出。 */
export function customStudyValueValid(preset: number, text: string): boolean {
  if (!new RegExp('^-?[0-9]+$').test(text.trim())) { return false; }
  const value = Number(text);
  if (!Number.isInteger(value) || value === 0 || value > 2147483647 || value < -2147483648) { return false; }
  if (!isCustomStudyLimit(preset) && value < 1) { return false; }
  return preset !== 自定义学习预设.提前复习天数 || value <= 99999;
}

/** 所有预设首次输入统一20；记忆值由本机偏好拥有，不用Core建议值覆盖。 */
export function customStudyInitialValue(_preset: number, _defaults: 自定义学习默认值 | null): number {
  return 20;
}
