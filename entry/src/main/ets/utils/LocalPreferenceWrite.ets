// SPDX-License-Identifier: AGPL-3.0-or-later
import { preferences } from '@kit.ArkData';

let saving: Promise<void> = Promise.resolve();

/** 保存未确认与已保存但未应用必须区分；失败不等于磁盘已回滚。 */
export class LocalPreferenceWriteError extends Error {
  readonly saved: boolean;
  constructor(message: string, saved: boolean) { super(message); this.saved = saved; }
}

/** @throws {Error} 读取等待已接受的修改；损坏值不冒充默认设置。 */
export function readLocalPreference(store: preferences.Preferences, key: string,
  fallback: preferences.ValueType): Promise<preferences.ValueType> {
  return saving.then((): preferences.ValueType => {
    const value: preferences.ValueType = store.getSync(key, fallback);
    if (typeof value !== typeof fallback) { throw new Error('invalid_saved_setting:' + key); }
    return value;
  });
}

/** 字号、牌组宽度、触感的设置页与助手共用队列；比较原值后保存、回读、广播。 */
/** @throws {Error} 过期提案或读写失败交给调用方；已接受的写入不依赖页面生命周期。 */
export function saveLocalPreference(store: preferences.Preferences, key: string,
  value: preferences.ValueType, fallback: preferences.ValueType,
  expected: preferences.ValueType | null = null): Promise<void> {
  const work: Promise<void> = saving.then(async (): Promise<void> => {
    const previous: preferences.ValueType = store.getSync(key, fallback);
    if (typeof previous !== typeof fallback) { throw new Error('invalid_saved_setting:' + key); }
    if (expected !== null && previous !== expected) { throw new Error('setting_changed_since_proposal'); }
    if (previous !== value) {
      try {
        store.putSync(key, value);
        await store.flush();
      } catch (error) {
        store.putSync(key, previous);
        throw new LocalPreferenceWriteError(error instanceof Error ? error.message : 'setting_save_unverified', false);
      }
    }
    try {
      if (store.getSync(key, fallback) !== value) { throw new Error('setting_save_mismatch'); }
    } catch (error) {
      throw new LocalPreferenceWriteError('setting_save_unverified', false);
    }
    try { AppStorage.setOrCreate<preferences.ValueType>(key, value); }
    catch (error) { throw new LocalPreferenceWriteError('setting_apply_failed', true); }
  });
  saving = work.catch((): void => {});
  return work;
}
