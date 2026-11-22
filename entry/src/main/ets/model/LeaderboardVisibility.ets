// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { saveLocalPreference } from '../utils/LocalPreferenceWrite';

export const LEADERBOARD_HIDDEN_KEY: string = 'studyLeaderboardHidden';
const STORE: string = 'jidecards_settings';

export function initializeLeaderboardVisibility(context: common.UIAbilityContext): void {
  try {
    const store = preferences.getPreferencesSync(context, { name: STORE });
    AppStorage.setOrCreate<boolean>(LEADERBOARD_HIDDEN_KEY, store.getSync(LEADERBOARD_HIDDEN_KEY, false) === true);
  } catch (error) {
    // 初次读取失败时沿用默认可见。
  }
}

/** @throws {Error} 持久化失败时保留原菜单状态。 */
export async function saveLeaderboardHidden(context: common.UIAbilityContext, hidden: boolean): Promise<void> {
  const store = await preferences.getPreferences(context, STORE);
  await saveLocalPreference(store, LEADERBOARD_HIDDEN_KEY, hidden, false, null,
    (): void => { AppStorage.setOrCreate<boolean>(LEADERBOARD_HIDDEN_KEY, hidden); });
}
