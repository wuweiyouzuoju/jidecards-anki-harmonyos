// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { saveLocalPreference } from './LocalPreferenceWrite';

export const STUDY_TWO_BUTTONS_KEY: string = 'studyTwoButtons';

/** @throws {Error} 上下文或设置存储不可用，由加载与保存入口处理。 */
function answerButtonPreferences(): preferences.Preferences {
  const context: common.UIAbilityContext | undefined = AppStorage.get<common.UIAbilityContext>('abilityContext');
  if (context === undefined) throw new Error('Ability context unavailable');
  return preferences.getPreferencesSync(context, { name: 'jidecards_settings' });
}

export function initializeStudyAnswerButtons(): void {
  let enabled: boolean = false;
  try { enabled = answerButtonPreferences().getSync(STUDY_TWO_BUTTONS_KEY, false) === true; }
  catch (error) { hilog.warn(0x4342, 'jidecards', 'Answer button preference could not be loaded'); }
  AppStorage.setOrCreate<boolean>(STUDY_TWO_BUTTONS_KEY, enabled);
}

/** 保存成功后同时更新底部与悬浮评分栏。 */
/** @throws {Error} 保存失败或原值已变化，设置页恢复实际值并提示。 */
export async function saveStudyTwoButtons(enabled: boolean, expected: boolean): Promise<void> {
  await saveLocalPreference(answerButtonPreferences(), STUDY_TWO_BUTTONS_KEY, enabled, false, expected);
}
