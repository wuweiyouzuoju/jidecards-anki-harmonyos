// SPDX-License-Identifier: AGPL-3.0-or-later
import { bundleManager, common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';

const INTRO_KEY: string = 'home_intro_completed_v1';

/** 与旧更新日志独立，一次确认对所有牌组生效。 */
/** @throws {Error} 入门确认未持久化，调用方不得标记完成。 */
function getStore(): preferences.Preferences {
  const context: common.UIAbilityContext | undefined = AppStorage.get<common.UIAbilityContext>('abilityContext');
  if (context === undefined) throw new Error('Ability context unavailable');
  return preferences.getPreferencesSync(context, { name: 'jidecards_settings' });
}

/** 只有首次安装且未完成的用户会自动看到引导。 */
export async function isHomeIntroCompleted(): Promise<boolean> {
  try {
    if (getStore().getSync(INTRO_KEY, false) === true) return true;
    return !await isFreshInstall();
  } catch { return true; }
}

export async function isFreshInstall(): Promise<boolean> {
  try {
    const info: bundleManager.BundleInfo = await bundleManager.getBundleInfoForSelf(
      bundleManager.BundleFlag.GET_BUNDLE_INFO_WITH_APPLICATION);
    return info.installTime > 0 && info.installTime === info.updateTime;
  } catch { return false; }
}

/** 只有用户确认且写入成功才完成；失败恢复缓存供下次重试。 */
/** @throws {Error} 入门确认未持久化，调用方不得标记完成。 */
export async function completeHomeIntro(): Promise<void> {
  const store: preferences.Preferences = getStore();
  const previous: preferences.ValueType = store.getSync(INTRO_KEY, false);
  store.putSync(INTRO_KEY, true);
  try { await store.flush(); } catch (error) {
    store.putSync(INTRO_KEY, previous);
    throw new Error('Home introduction could not be saved');
  }
}
