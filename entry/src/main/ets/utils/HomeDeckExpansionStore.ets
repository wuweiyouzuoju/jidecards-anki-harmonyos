// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { HomeDeckExpansion, encodeHomeExpansion, decodeHomeExpansion } from '../model/HomeDeckExpansion';

const HOME_EXPANSION_KEY: string = 'homeDeckExpansion';
let flushQueue: Promise<void> = Promise.resolve();

/** @throws {Error} 由首页记录偏好不可用，不影响本次展开操作。 */
function expansionPreferences(): preferences.Preferences {
  const context: common.UIAbilityContext | undefined = AppStorage.get<common.UIAbilityContext>('abilityContext');
  if (context === undefined) throw new Error('Ability context unavailable');
  return preferences.getPreferencesSync(context, { name: 'jidecards_settings' });
}

/** @throws {Error} 首屏前同步恢复，避免迟到读取覆盖用户点击。 */
export function loadHomeDeckExpansion(): HomeDeckExpansion | null {
  const value: preferences.ValueType = expansionPreferences().getSync(HOME_EXPANSION_KEY, '');
  if (typeof value !== 'string') throw new Error('Invalid home deck expansion preference type');
  return decodeHomeExpansion(value);
}

/** @throws {Error} 写入立即更新偏好缓存；落盘串行且独立于页面销毁，失败由首页记录。 */
export async function saveHomeDeckExpansion(state: HomeDeckExpansion): Promise<void> {
  const store: preferences.Preferences = expansionPreferences();
  store.putSync(HOME_EXPANSION_KEY, encodeHomeExpansion(state));
  const pending: Promise<void> = flushQueue.then((): Promise<void> => store.flush());
  // 返回原始 rejection 给调用方；队列自身恢复，后续点击仍能保存。
  flushQueue = pending.catch((): void => {});
  await pending;
}
