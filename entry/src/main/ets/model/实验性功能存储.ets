// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';

// 保留旧 Tap Zones 键以兼容已保存偏好；学习手势与四象限现均可在两种模式使用。
const TAP_ZONES_KEY: string = 'tap_zones_enabled';
const GESTURES_KEY: string = 'study_gestures_enabled';
const GUIDE_KEY: string = 'tapZonesGuideCompletedV1';
export const TapZones开关AppStorage键: string = 'tapZonesEnabled';
export const STUDY_GESTURES_KEY: string = 'studyGesturesEnabled';
let saving: Promise<void> = Promise.resolve();

/** @throws {Error} 缺少上下文或偏好不可读，由界面显示失败。 */
function controlsStore(): preferences.Preferences {
  const context: common.UIAbilityContext | undefined = AppStorage.get<common.UIAbilityContext>('abilityContext');
  if (context === undefined) throw new Error('Ability context unavailable');
  return preferences.getPreferencesSync(context, { name: 'jidecards_settings' });
}

/** @throws {Error} 读取失败不冒充关闭，调用方显示可重试提示。 */
export async function 加载TapZones开关(): Promise<boolean> {
  return controlsStore().getSync(TAP_ZONES_KEY, false) === true;
}

/** @throws {Error} 读取失败由界面处理。 */
export async function loadStudyGestures(): Promise<boolean> {
  return controlsStore().getSync(GESTURES_KEY, false) === true;
}

/** 同一存储串行写入；落盘成功才广播，失败恢复内存以允许重试。 */
/** @throws {Error} 写入失败由调用方显示。 */
function saveControl(key: string, broadcast: string, value: boolean): Promise<void> {
  const work: Promise<void> = saving.then(async (): Promise<void> => {
    const store: preferences.Preferences = controlsStore();
    const previous: preferences.ValueType = store.getSync(key, false);
    const previousGuide: preferences.ValueType = store.getSync(GUIDE_KEY, false);
    const resetGuide: boolean = key === TAP_ZONES_KEY && value && previous !== true;
    store.putSync(key, value);
    if (resetGuide) store.putSync(GUIDE_KEY, false);
    try {
      await store.flush();
    } catch (error) {
      store.putSync(key, previous);
      if (resetGuide) store.putSync(GUIDE_KEY, previousGuide);
      throw new Error(error instanceof Error ? error.message : `${error}`);
    }
    if (broadcast !== '') AppStorage.setOrCreate<boolean>(broadcast, value);
  });
  saving = work.catch((): void => {});
  return work;
}

/** @throws {Error} 保存失败，调用方保留开关原值。 */
export function 保存TapZones开关(enabled: boolean): Promise<void> {
  return saveControl(TAP_ZONES_KEY, TapZones开关AppStorage键, enabled);
}

/** @throws {Error} 保存失败，调用方保留开关原值。 */
export function saveStudyGestures(enabled: boolean): Promise<void> {
  return saveControl(GESTURES_KEY, STUDY_GESTURES_KEY, enabled);
}

/** @throws {Error} 未能读取时仍展示引导，不消耗确认机会。 */
export function isTapZonesGuideCompleted(): boolean {
  return controlsStore().getSync(GUIDE_KEY, false) === true;
}

/** @throws {Error} 只有明确确认才保存；返回/离页不会标为已读。 */
export function completeTapZonesGuide(): Promise<void> {
  return saveControl(GUIDE_KEY, '', true);
}
