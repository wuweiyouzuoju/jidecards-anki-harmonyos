// SPDX-License-Identifier: AGPL-3.0-or-later
import { 统计服务 } from './统计服务';
/** Core 的 browserLinksSupported 是只读能力，不属于持久化偏好。 */
export interface WritableGraphPreferences {
  calendarFirstDayOfWeek: number;
  cardCountsSeparateInactive: boolean;
  futureDueShowBacklog: boolean;
}
let tail: Promise<void> = Promise.resolve();
export function graphPreferencesSnapshot(value: WritableGraphPreferences): string {
  return JSON.stringify({calendarFirstDayOfWeek:value.calendarFirstDayOfWeek,
    cardCountsSeparateInactive:value.cardCountsSeparateInactive,
    futureDueShowBacklog:value.futureDueShowBacklog});
}
/** 统计页与 JIDE 共用队列；核对可写偏好，能力位始终来自 Core 的最新读取。 */
export function saveGraphPreferences(value: WritableGraphPreferences, expected?: string): Promise<void> {
  const snapshot = graphPreferencesSnapshot(value);
  const result = tail.then(async (): Promise<void> => {
    const service = new 统计服务();
    const current = await service.获取图表偏好();
    if (expected !== undefined && graphPreferencesSnapshot(current) !== graphPreferencesSnapshot(JSON.parse(expected) as WritableGraphPreferences)) throw new Error('graph_preferences_changed');
    const writable = JSON.parse(snapshot) as WritableGraphPreferences;
    await service.设置图表偏好({calendarFirstDayOfWeek:writable.calendarFirstDayOfWeek,
      cardCountsSeparateInactive:writable.cardCountsSeparateInactive,futureDueShowBacklog:writable.futureDueShowBacklog,
      browserLinksSupported:current.browserLinksSupported});
    if (graphPreferencesSnapshot(await service.获取图表偏好()) !== snapshot) throw new Error('graph_preferences_save_unverified');
  });
  tail = result.then((): void => {}, (): void => {}); return result;
}
