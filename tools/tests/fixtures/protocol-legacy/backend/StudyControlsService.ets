// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { preferences } from '@kit.ArkData';
import { STUDY_CONTROLS_KEY, defaultStudyControls, validateStudyControls } from '../model/StudyControls';
import type { StudyControls } from '../model/StudyControls';
import { StudyScreenAwakeSession } from '../model/StudyScreenAwakeSession';
import { readLocalPreference, saveLocalPreference } from '../utils/LocalPreferenceWrite';

function context(): common.UIAbilityContext {
  const value: common.UIAbilityContext | undefined = AppStorage.get<common.UIAbilityContext>('abilityContext');
  if (value === undefined) throw new Error('ability_context_unavailable');
  return value;
}
/** @throws {Error} 上下文、偏好或格式错误交给工具/学习页，不伪造已保存状态。 */
async function readSaved(): Promise<StudyControls> {
  const store = await preferences.getPreferences(context(), 'jidecards_preferences');
  const value = await readLocalPreference(store, STUDY_CONTROLS_KEY, JSON.stringify(defaultStudyControls()));
  if (typeof value !== 'string') throw new Error('invalid_study_controls');
  return validateStudyControls(JSON.parse(value) as StudyControls);
}
/** @throws {Error} 读取失败保留为实际工具错误。 */
export async function readStudyControls(): Promise<StudyControls> {
  return readSaved();
}
/** @throws {Error} 学习页捕获加载错误并提示，不覆盖已有值。 */
export async function loadStudyControls(): Promise<void> {
  AppStorage.setOrCreate<string>(STUDY_CONTROLS_KEY, JSON.stringify(await readStudyControls()));
}
/** @throws {Error} 共用保存队列拒绝陈旧提案，区分未确认保存与已保存但未应用。 */
export async function saveStudyControls(after: StudyControls, expected: StudyControls): Promise<StudyControls> {
  const next: StudyControls = validateStudyControls(after);
  const before: string = JSON.stringify(validateStudyControls(expected));
  const store = await preferences.getPreferences(context(), 'jidecards_preferences');
  await saveLocalPreference(store, STUDY_CONTROLS_KEY, JSON.stringify(next), JSON.stringify(defaultStudyControls()), before);
  return next;
}
export function createStudyScreenAwake(): StudyScreenAwakeSession {
  let current: window.Window | null = null;
  return new StudyScreenAwakeSession({
    read: async (): Promise<boolean> => {
      current = await window.getLastWindow(context());
      return current.getWindowProperties().isKeepScreenOn;
    },
    set: async (value: boolean): Promise<void> => {
      if (current === null) throw new Error('study_window_unavailable');
      await current.setWindowKeepScreenOn(value);
    }
  });
}
