// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';

/** @throws {Error} 偏好不可用时由工具按钮显示可重试提示。 */
function hintPreferences(): preferences.Preferences {
  const context = AppStorage.get<common.UIAbilityContext>('abilityContext');
  if (context === undefined) throw new Error('Ability context unavailable');
  return preferences.getPreferencesSync(context, { name: 'jidecards_settings' });
}

/** @throws {Error} 读取失败交由编辑器处理，不把失败当作已学习。 */
export function hasNoteEditingHint(key: string): boolean {
  return hintPreferences().getSync(`noteEditingHintV1_${key}`, false) === true;
}

/** @throws {Error} 写入失败恢复未学习状态，下一次可重新提示。 */
export async function completeNoteEditingHint(key: string): Promise<void> {
  const store = hintPreferences();
  const name: string = `noteEditingHintV1_${key}`;
  const previous: preferences.ValueType = store.getSync(name, false);
  store.putSync(name, true);
  try { await store.flush(); }
  catch (error) {
    store.putSync(name, previous);
    throw new Error(error instanceof Error ? error.message : `${error}`);
  }
}
