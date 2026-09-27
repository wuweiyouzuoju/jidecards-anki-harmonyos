// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { DECK_LIST_NARROW_KEY, DECK_WIDTH_HINT_HANDLED_KEY } from '../model/DeckListAppearance';

/** @throws {Error} 偏好不可用时由启动日志或设置页展示。 */
function getDeckListPreferences(): preferences.Preferences {
  const context: common.UIAbilityContext | undefined = AppStorage.get<common.UIAbilityContext>('abilityContext');
  if (context === undefined) {
    throw new Error('Ability context unavailable');
  }
  return preferences.getPreferencesSync(context, { name: 'jidecards_settings' });
}

/** 首屏前恢复；旧安装没有此项时保持原有宽版。 */
export function initializeDeckListAppearance(): void {
  let narrow: boolean = false;
  let hintHandled: boolean = false;
  try {
    narrow = getDeckListPreferences().getSync(DECK_LIST_NARROW_KEY, false) === true;
    hintHandled = getDeckListPreferences().getSync(DECK_WIDTH_HINT_HANDLED_KEY, false) === true;
  } catch (error) {
    hilog.warn(0x4342, 'jidecards', 'Deck list appearance could not be loaded');
  }
  AppStorage.setOrCreate<boolean>(DECK_LIST_NARROW_KEY, narrow);
  AppStorage.setOrCreate<boolean>(DECK_WIDTH_HINT_HANDLED_KEY, hintHandled);
}

/** @throws {Error} 记录失败由提示宿主反馈，本次会话仍不重复弹出。 */
export async function completeDeckWidthHint(): Promise<void> {
  const store: preferences.Preferences = getDeckListPreferences();
  const previous: preferences.ValueType = store.getSync(DECK_WIDTH_HINT_HANDLED_KEY, false);
  store.putSync(DECK_WIDTH_HINT_HANDLED_KEY, true);
  try {
    await store.flush();
  } catch (error) {
    store.putSync(DECK_WIDTH_HINT_HANDLED_KEY, previous);
    throw new Error(error instanceof Error ? error.message : `${error}`);
  }
  AppStorage.setOrCreate<boolean>(DECK_WIDTH_HINT_HANDLED_KEY, true);
}

/** @throws {Error} 保存失败保持原外观，交由设置控件显示错误。 */
export async function saveDeckListNarrow(narrow: boolean): Promise<void> {
  const store: preferences.Preferences = getDeckListPreferences();
  const previous: preferences.ValueType = store.getSync(DECK_LIST_NARROW_KEY, false);
  store.putSync(DECK_LIST_NARROW_KEY, narrow);
  try {
    await store.flush();
  } catch (error) {
    store.putSync(DECK_LIST_NARROW_KEY, previous);
    throw new Error(error instanceof Error ? error.message : `${error}`);
  }
  AppStorage.setOrCreate<boolean>(DECK_LIST_NARROW_KEY, narrow);
}
