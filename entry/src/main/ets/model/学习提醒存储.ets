// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { readLocalPreference, saveLocalPreference } from '../utils/LocalPreferenceWrite';

const 存储名: string = 'jidecards_settings';
const 提醒项列表键: string = 'study_reminder_items';
const 提醒ID列表键: string = 'study_reminder_ids';
const 通知设置已引导键: string = 'reminder_notification_guided';
export const 学习提醒AppStorage键: string = 'studyReminderEnabled';

export interface 提醒项 {
  唯一ID: number;
  小时: number;
  分钟: number;
  标题: string;
  内容: string;
  开启: boolean;
}
export interface 学习提醒设置 { 提醒项列表: 提醒项[]; }
let 下一个ID: number = 1;
export function 生成提醒项ID(): number { return 下一个ID++; }

/** @throws {Error} 失败由领域调用方报告，不以默认值或假成功继续。 */
async function reminderStore(): Promise<preferences.Preferences> {
  const context: common.UIAbilityContext | undefined = AppStorage.get<common.UIAbilityContext>('abilityContext');
  if (context === undefined) throw new Error('reminder_storage_unavailable');
  return preferences.getPreferences(context, 存储名);
}

function validateItems(items: 提醒项[]): void {
  if (!Array.isArray(items)) throw new Error('reminder_invalid_settings');
  const ids: Set<number> = new Set<number>();
  for (const item of items) {
    if (item === null || typeof item !== 'object' || !Number.isInteger(item.唯一ID) || item.唯一ID < 1 ||
      ids.has(item.唯一ID) || !Number.isInteger(item.小时) || item.小时 < 0 || item.小时 > 23 ||
      !Number.isInteger(item.分钟) || item.分钟 < 0 || item.分钟 > 59 ||
      typeof item.标题 !== 'string' || typeof item.内容 !== 'string' || typeof item.开启 !== 'boolean') {
      throw new Error('reminder_invalid_settings');
    }
    ids.add(item.唯一ID);
  }
}

/** 缺省键表示空列表；损坏或读取失败必须阻止取消系统提醒。 */
/** @throws {Error} 失败由领域调用方报告，不以默认值或假成功继续。 */
export async function 加载学习提醒设置(): Promise<学习提醒设置> {
  const store: preferences.Preferences = await reminderStore();
  const raw: string = await readLocalPreference(store, 提醒项列表键, '[]') as string;
  return { 提醒项列表: parseReminderItems(raw) };
}

/** @throws {Error} 比较采用同一迁移规则，兼容旧空键和没有单项开关的提醒。 */
function parseReminderItems(raw: string): 提醒项[] {
  const items: 提醒项[] = raw === '' ? [] : JSON.parse(raw) as 提醒项[];
  if (!Array.isArray(items)) throw new Error('reminder_invalid_settings');
  for (const item of items) {
    // 旧版本没有单项开关，迁移成开启；其他坏字段不猜测。
    if (item !== null && item.开启 === undefined) item.开启 = true;
  }
  validateItems(items);
  for (const item of items) 下一个ID = Math.max(下一个ID, item.唯一ID + 1);
  return items;
}

/** 冻结提交内容；落盘、回读确认之后才广播。写入不受页面销毁影响。 */
/** @throws {Error} 失败由领域调用方报告，不以默认值或假成功继续。 */
export async function 保存学习提醒设置(items: 提醒项[], expected: string | null = null): Promise<void> {
  validateItems(items);
  const raw: string = JSON.stringify(items);
  const enabled: boolean = items.some((item: 提醒项): boolean => item.开启);
  const store: preferences.Preferences = await reminderStore();
  const previous: string = await readLocalPreference(store, 提醒项列表键, '[]') as string;
  if (expected !== null && JSON.stringify(parseReminderItems(previous)) !== expected) throw new Error('setting_changed_since_proposal');
  await saveLocalPreference(store, 提醒项列表键, raw, '[]', expected === null ? null : previous,
    (): void => { AppStorage.setOrCreate<boolean>(学习提醒AppStorage键, enabled); });
}

/** @throws {Error} 失败由领域调用方报告，不以默认值或假成功继续。 */
export async function 保存提醒ID列表(ids: number[]): Promise<void> {
  const raw: string = JSON.stringify(ids);
  await saveLocalPreference(await reminderStore(), 提醒ID列表键, raw, '[]');
}
/** @throws {Error} 失败由领域调用方报告，不以默认值或假成功继续。 */
export async function 加载提醒ID列表(): Promise<number[]> {
  const raw: string = await readLocalPreference(await reminderStore(), 提醒ID列表键, '[]') as string;
  const ids: number[] = JSON.parse(raw) as number[];
  if (!Array.isArray(ids) || ids.some((id: number): boolean => !Number.isInteger(id) || id < 0)) {
    throw new Error('reminder_invalid_ids');
  }
  return ids;
}
/** @throws {Error} 失败由领域调用方报告，不以默认值或假成功继续。 */
export async function 是否已引导通知设置(): Promise<boolean> {
  return await readLocalPreference(await reminderStore(), 通知设置已引导键, false) as boolean;
}
/** @throws {Error} 失败由领域调用方报告，不以默认值或假成功继续。 */
export async function 标记已引导通知设置(): Promise<void> {
  await saveLocalPreference(await reminderStore(), 通知设置已引导键, true, false);
}
