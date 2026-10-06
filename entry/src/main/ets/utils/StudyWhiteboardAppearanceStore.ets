// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { saveLocalPreference } from './LocalPreferenceWrite';

const PAPER_TRANSPARENCY_KEY: string = 'study_whiteboard_paper_transparency';
const DEFAULT_PAPER_TRANSPARENCY: number = 80;

/** 与字号等本机外观共用偏好文件，不随卡片、翻面或画布重建清空。
 * @throws {Error} 偏好不可用时由读取兜底或保存入口反馈。
 */
function getStore(): preferences.Preferences {
  const context: common.UIAbilityContext | undefined = AppStorage.get<common.UIAbilityContext>('abilityContext');
  if (context === undefined) throw new Error('Ability context unavailable');
  return preferences.getPreferencesSync(context, { name: 'jidecards_settings' });
}

export function loadStudyPaperTransparency(): number {
  try {
    const value: preferences.ValueType = getStore().getSync(PAPER_TRANSPARENCY_KEY, DEFAULT_PAPER_TRANSPARENCY);
    if (typeof value === 'number' && Number.isFinite(value)) return Math.round(Math.max(0, Math.min(100, value)));
  } catch (error) {
    console.warn('Study paper transparency could not be loaded');
  }
  return DEFAULT_PAPER_TRANSPARENCY;
}

/** @throws {Error} 写盘失败交由透明度入口反馈，不能冒充已经记住。 */
export async function saveStudyPaperTransparency(value: number): Promise<void> {
  if (!Number.isFinite(value)) throw new Error('Invalid paper transparency');
  await saveLocalPreference(getStore(), PAPER_TRANSPARENCY_KEY,
    Math.round(Math.max(0, Math.min(100, value))), DEFAULT_PAPER_TRANSPARENCY);
}
