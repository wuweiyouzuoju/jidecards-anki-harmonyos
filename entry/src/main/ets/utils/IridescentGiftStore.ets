// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { UNLOCKED_CONTENTS_KEY, isThemeAvailable } from '../model/ThemeCatalog';
import { initializeRedemption } from './RedemptionStore';

const NOTICE_KEY: string = 'iridescent_gift_notice_299_completed';

/** @throws {Error} 提醒偏好不可用，交由首页显示失败并在下次启动重试。 */
function getStore(): preferences.Preferences {
  const context: common.UIAbilityContext | undefined = AppStorage.get<common.UIAbilityContext>('abilityContext');
  if (context === undefined) throw new Error('Ability context unavailable');
  return preferences.getPreferencesSync(context, { name: 'jidecards_settings' });
}

/** 先恢复验签权益，避免将已有幻彩的用户误判为未获得；提醒不授予权益。 */
/** @throws {Error} 权益或提醒读取失败，不推断未获得或已确认。 */
export async function isIridescentGiftNoticeCompleted(): Promise<boolean> {
  await initializeRedemption();
  const contents: string[] = AppStorage.get<string[]>(UNLOCKED_CONTENTS_KEY) ?? [];
  return isThemeAvailable('iridescent', contents) || getStore().getSync(NOTICE_KEY, false) === true;
}

/** @throws {Error} 确认未落盘，恢复偏好缓存供下次启动重试。 */
export async function completeIridescentGiftNotice(): Promise<void> {
  const store: preferences.Preferences = getStore();
  const previous: preferences.ValueType = store.getSync(NOTICE_KEY, false);
  store.putSync(NOTICE_KEY, true);
  try { await store.flush(); } catch (error) {
    store.putSync(NOTICE_KEY, previous);
    throw new Error('Iridescent gift notice could not be saved');
  }
}
