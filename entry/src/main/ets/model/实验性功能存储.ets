// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { StudyQuickAnswerMode, resolveStudyQuickAnswerMode } from './StudyGestures';

// 旧开关仅用于兼容读取；运行时只广播一个互斥模式。
const MODE_KEY: string = 'study_quick_answer_mode';
const TAP_ZONES_KEY: string = 'tap_zones_enabled';
const GESTURES_KEY: string = 'study_gestures_enabled';
const GUIDE_KEY: string = 'tapZonesGuideCompletedV1';
export const STUDY_QUICK_ANSWER_KEY: string = 'studyQuickAnswerMode';
let saving: Promise<void> = Promise.resolve();

/** @throws {Error} 缺少上下文或偏好不可读，由界面显示失败。 */
function controlsStore(): preferences.Preferences {
  const context: common.UIAbilityContext | undefined = AppStorage.get<common.UIAbilityContext>('abilityContext');
  if (context === undefined) throw new Error('Ability context unavailable');
  return preferences.getPreferencesSync(context, { name: 'jidecards_settings' });
}

/** @throws {Error} 偏好读取失败经加载入口传回设置页或学习页的错误处理。 */
function readMode(store: preferences.Preferences): StudyQuickAnswerMode {
  const value: preferences.ValueType = store.getSync(MODE_KEY, -1);
  return resolveStudyQuickAnswerMode(typeof value === 'number' ? value : -1,
    store.getSync(TAP_ZONES_KEY, false) === true, store.getSync(GESTURES_KEY, false) === true);
}

/** @throws {Error} 读取失败不冒充关闭，由界面显示可重试提示。 */
export async function loadStudyQuickAnswerMode(): Promise<StudyQuickAnswerMode> {
  const mode: StudyQuickAnswerMode = await readSavedStudyQuickAnswerMode();
  AppStorage.setOrCreate<StudyQuickAnswerMode>(STUDY_QUICK_ANSWER_KEY, mode);
  return mode;
}

/** @throws {Error} 与设置页共用兼容解析和保存队列，仅读取不广播 UI。 */
export async function readSavedStudyQuickAnswerMode(): Promise<StudyQuickAnswerMode> {
  await saving;
  return readMode(controlsStore());
}

/** 同一存储串行写入；模式与兼容键一起落盘，成功才广播，失败全部恢复。 */
/** @throws {Error} 保存失败，调用方保留原模式。 */
export function saveStudyQuickAnswerMode(mode: StudyQuickAnswerMode): Promise<void> {
  if (mode !== StudyQuickAnswerMode.Off && mode !== StudyQuickAnswerMode.TapZones &&
    mode !== StudyQuickAnswerMode.Gestures) return Promise.reject(new Error('Invalid study quick answer mode'));
  const work: Promise<void> = saving.then(async (): Promise<void> => {
    const store: preferences.Preferences = controlsStore();
    const previous: preferences.ValueType = store.getSync(MODE_KEY, -1);
    const previousTapZones: preferences.ValueType = store.getSync(TAP_ZONES_KEY, false);
    const previousGestures: preferences.ValueType = store.getSync(GESTURES_KEY, false);
    const previousGuide: preferences.ValueType = store.getSync(GUIDE_KEY, false);
    const resetGuide: boolean = mode === StudyQuickAnswerMode.TapZones && readMode(store) !== mode;
    try {
      store.putSync(MODE_KEY, mode);
      store.putSync(TAP_ZONES_KEY, mode === StudyQuickAnswerMode.TapZones);
      store.putSync(GESTURES_KEY, mode === StudyQuickAnswerMode.Gestures);
      if (resetGuide) store.putSync(GUIDE_KEY, false);
      await store.flush();
    } catch (error) {
      store.putSync(MODE_KEY, previous);
      store.putSync(TAP_ZONES_KEY, previousTapZones);
      store.putSync(GESTURES_KEY, previousGestures);
      if (resetGuide) store.putSync(GUIDE_KEY, previousGuide);
      throw new Error(error instanceof Error ? error.message : `${error}`);
    }
    AppStorage.setOrCreate<StudyQuickAnswerMode>(STUDY_QUICK_ANSWER_KEY, mode);
  });
  saving = work.catch((): void => {});
  return work;
}

/** @throws {Error} 未能读取时仍展示引导，不消耗确认机会。 */
export function isTapZonesGuideCompleted(): boolean {
  return controlsStore().getSync(GUIDE_KEY, false) === true;
}

/** @throws {Error} 只有明确确认才保存；返回/离页不会标为已读。 */
export function completeTapZonesGuide(): Promise<void> {
  const work: Promise<void> = saving.then(async (): Promise<void> => {
    const store: preferences.Preferences = controlsStore();
    const previous: preferences.ValueType = store.getSync(GUIDE_KEY, false);
    try {
      store.putSync(GUIDE_KEY, true);
      await store.flush();
    } catch (error) {
      store.putSync(GUIDE_KEY, previous);
      throw new Error(error instanceof Error ? error.message : `${error}`);
    }
  });
  saving = work.catch((): void => {});
  return work;
}
