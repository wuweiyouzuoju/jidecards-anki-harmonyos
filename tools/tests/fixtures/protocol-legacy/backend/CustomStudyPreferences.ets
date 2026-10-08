// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';

/** AnkiDroid 的天数和抽取数量是本机偏好；牌组额度默认值仍来自 Core。 */
export class CustomStudyPreferences {
  /** @throws {Error} 本机设置不可用，交由表单显示。 */
  private store(): preferences.Preferences {
    const context = AppStorage.get<common.UIAbilityContext>('abilityContext');
    if (context === undefined) { throw new Error('Ability context unavailable'); }
    return preferences.getPreferencesSync(context, { name: 'jidecards_settings' });
  }

  /** @throws {Error} 读取失败不能冒充已经读取默认值。 */
  read(preset: number, fallback: number): number {
    const value = this.store().getSync(`custom_study_value_${preset}`, fallback);
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
  }

  /** @throws {Error} 保存失败由调用方反馈，不能诱导重复创建牌组。 */
  async save(preset: number, value: number): Promise<void> {
    const store = this.store();
    const key = `custom_study_value_${preset}`;
    const previous = store.getSync(key, 1);
    store.putSync(key, value);
    try { await store.flush(); } catch (error) {
      store.putSync(key, previous);
      throw new Error('Custom study preference could not be saved');
    }
  }
}
