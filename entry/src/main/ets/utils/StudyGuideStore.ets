// SPDX-License-Identifier: AGPL-3.0-or-later

import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';

const STUDY_GUIDE_KEY: string = 'studyGuideCompletedV2';

/** 学习教学只记录在本机应用偏好中，所有牌组共用。 */
/** @throws {Error} 教学偏好读取或确认落盘失败，调用方保留可重试状态。 */
function getStudyGuidePreferences(): preferences.Preferences {
  const context: common.UIAbilityContext | undefined = AppStorage.get<common.UIAbilityContext>('abilityContext');
  if (context === undefined) {
    throw new Error('Ability context unavailable');
  }
  return preferences.getPreferencesSync(context, { name: 'jidecards_settings' });
}

/** 未确认的教学在下次进入学习时仍可展示。 */
/** @throws {Error} 教学偏好读取或确认落盘失败，调用方保留可重试状态。 */
export function isStudyGuideCompleted(): boolean {
  return getStudyGuidePreferences().getSync(STUDY_GUIDE_KEY, false) === true;
}

/** 仅在用户确认后持久化，写入失败恢复内存值以便下次重试。 */
/** @throws {Error} 教学偏好读取或确认落盘失败，调用方保留可重试状态。 */
export async function completeStudyGuide(): Promise<void> {
  const store: preferences.Preferences = getStudyGuidePreferences();
  const previous: preferences.ValueType = store.getSync(STUDY_GUIDE_KEY, false);
  store.putSync(STUDY_GUIDE_KEY, true);
  try {
    await store.flush();
  } catch (error) {
    store.putSync(STUDY_GUIDE_KEY, previous);
    throw new Error(error instanceof Error ? error.message : `${error}`);
  }
}
