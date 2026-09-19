// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FutureDue } from '../proto/messages/StatsMessages';

export interface DueOverview {
  due: number;
  overdue: number;
}

/** 聚合 Core 返回的日桶；不重算调度、不应用新卡或每日限额。 */
export function dueOverview(future: FutureDue | null): DueOverview | null {
  if (future === null || future.futureDue === null) return null;
  const result: DueOverview = { due: 0, overdue: 0 };
  future.futureDue.forEach((count: number, day: number): void => {
    if (day <= 0) result.due += count;
    if (day < 0) result.overdue += count;
  });
  return result;
}

/** 小于一张的非零日均不能显示为零。 */
export function forecastAverage(total: number, days: number): string {
  const value: number = total / Math.max(1, days);
  if (value > 0 && value < 0.1) return '<0.1';
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}
