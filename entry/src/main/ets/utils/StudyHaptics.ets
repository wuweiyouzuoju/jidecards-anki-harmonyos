// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { vibrator } from '@kit.SensorServiceKit';
import { hilog } from '@kit.PerformanceAnalysisKit';

export const STUDY_HAPTICS_KEY: string = 'studyHapticsEnabled';
const SOFT_EFFECT: string = 'haptic.effect.soft';
let softEffectSupported: boolean = false;

/** 评分触感只保存在本机，复用现有设置存储。 */
function getHapticsPreferences(): preferences.Preferences {
  const context: common.UIAbilityContext | undefined = AppStorage.get<common.UIAbilityContext>('abilityContext');
  if (context === undefined) {
    throw new Error('Ability context unavailable');
  }
  return preferences.getPreferencesSync(context, { name: 'jidecards_settings' });
}

/** 首屏前恢复开关；提前查询效果，避免点击时等待设备查询。 */
export function initializeStudyHaptics(): void {
  let enabled: boolean = true;
  try {
    enabled = getHapticsPreferences().getSync(STUDY_HAPTICS_KEY, true) !== false;
  } catch (error) {
    hilog.warn(0x4342, 'jidecards', 'Study haptics preference could not be loaded');
  }
  AppStorage.setOrCreate<boolean>(STUDY_HAPTICS_KEY, enabled);
  prepareStudyHaptics();
}

/** 无预置效果的设备保留短时反馈；无马达时由播放异常隔离。 */
async function prepareStudyHaptics(): Promise<void> {
  try {
    softEffectSupported = await vibrator.isSupportEffect(SOFT_EFFECT);
  } catch (error) {
    softEffectSupported = false;
  }
}

/** 保存成功才广播，失败恢复 preferences 内存值并交由设置页提示。 */
export async function saveStudyHaptics(enabled: boolean): Promise<void> {
  const store: preferences.Preferences = getHapticsPreferences();
  const previous: preferences.ValueType = store.getSync(STUDY_HAPTICS_KEY, true);
  store.putSync(STUDY_HAPTICS_KEY, enabled);
  try {
    await store.flush();
  } catch (error) {
    store.putSync(STUDY_HAPTICS_KEY, previous);
    throw new Error(error instanceof Error ? error.message : `${error}`);
  }
  AppStorage.setOrCreate<boolean>(STUDY_HAPTICS_KEY, enabled);
}

/** 所有评分共享同一短震；失败不传播到评分，始终遵循系统触感开关。 */
export async function playStudyHaptic(): Promise<void> {
  if (AppStorage.get<boolean>(STUDY_HAPTICS_KEY) === false) {
    return;
  }
  try {
    const effect: vibrator.VibrateEffect = softEffectSupported
      ? { type: 'preset', effectId: SOFT_EFFECT, count: 1 }
      : { type: 'time', duration: 20 };
    await vibrator.startVibration(effect, { usage: 'touch' });
  } catch (error) {
    hilog.debug(0x4342, 'jidecards', 'Study haptic unavailable');
  }
}
