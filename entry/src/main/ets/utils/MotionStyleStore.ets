// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { MOTION_STYLE_KEY, isMotionStyle } from '../model/MotionStyle';
import { saveLocalPreference } from './LocalPreferenceWrite';

/** @throws {Error} 缺少应用上下文时由设置控件或 JIDE 展示失败。 */
function motionPreferences(): preferences.Preferences {
  const context: common.UIAbilityContext | undefined = AppStorage.get<common.UIAbilityContext>('abilityContext');
  if (context === undefined) { throw new Error('ability_context_unavailable'); }
  return preferences.getPreferencesSync(context, { name: 'jidecards_settings' });
}

/** 首屏前恢复；旧安装默认保持克制，失败只影响本次显示默认值。 */
export function initializeMotionStyle(): void {
  let style: string = 'restrained';
  try {
    const saved: preferences.ValueType = motionPreferences().getSync(MOTION_STYLE_KEY, style);
    if (typeof saved !== 'string' || !isMotionStyle(saved)) { throw new Error('invalid_saved_setting:motion_style'); }
    style = saved;
  } catch (error) { hilog.warn(0x4342, 'jidecards', 'Motion style could not be loaded'); }
  AppStorage.setOrCreate<string>(MOTION_STYLE_KEY, style);
}

/** @throws {Error} 设置页与 JIDE 共用确认保存、回读和广播；写入不随页面离开取消。 */
export async function saveMotionStyle(style: string, expected: string | null = null): Promise<void> {
  if (!isMotionStyle(style)) { throw new Error('invalid_setting_value'); }
  await saveLocalPreference(motionPreferences(), MOTION_STYLE_KEY, style, 'restrained', expected);
}
