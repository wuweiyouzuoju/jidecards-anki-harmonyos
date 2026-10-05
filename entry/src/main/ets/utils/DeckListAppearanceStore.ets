// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { hilog } from '@kit.PerformanceAnalysisKit';
import {
  DECK_LIST_NARROW_KEY, DECK_WIDTH_HINT_HANDLED_KEY, DECK_DOUBLE_COLUMN_HINT_HANDLED_KEY,
  DECK_LIST_STYLE_KEY, isDeckListStyle, isNarrowDeckListStyle, deckListStyle
} from '../model/DeckListAppearance';
import { saveLocalPreference } from './LocalPreferenceWrite';

/** @throws {Error} 偏好不可用时由启动日志或设置页展示。 */
function getDeckListPreferences(): preferences.Preferences {
  const context: common.UIAbilityContext | undefined = AppStorage.get<common.UIAbilityContext>('abilityContext');
  if (context === undefined) {
    throw new Error('Ability context unavailable');
  }
  return preferences.getPreferencesSync(context, { name: 'jidecards_settings' });
}

/** @throws {Error} 缺少新键时从旧宽窄偏好派生，损坏值不能冒充默认样式。 */
export function legacyDeckListStyle(store: preferences.Preferences): string {
  if (store.getSync(DECK_LIST_STYLE_KEY, '') !== '') { return 'single_wide'; }
  const narrow: preferences.ValueType = store.getSync(DECK_LIST_NARROW_KEY, false);
  if (typeof narrow !== 'boolean') { throw new Error('invalid_saved_setting:deck_list_style'); }
  return deckListStyle(narrow, false);
}

/** 首屏前恢复；旧安装沿用已保存的单列宽窄。 */
export function initializeDeckListAppearance(): void {
  let style: string = 'single_wide';
  let hintHandled: boolean = false;
  let doubleColumnHintHandled: boolean = false;
  try {
    const store: preferences.Preferences = getDeckListPreferences();
    const stored: preferences.ValueType = store.getSync(DECK_LIST_STYLE_KEY, legacyDeckListStyle(store));
    if (typeof stored === 'string' && isDeckListStyle(stored)) { style = stored; }
    hintHandled = store.getSync(DECK_WIDTH_HINT_HANDLED_KEY, false) === true;
    doubleColumnHintHandled = store.getSync(DECK_DOUBLE_COLUMN_HINT_HANDLED_KEY, false) === true;
  } catch (error) {
    hilog.warn(0x4342, 'jidecards', 'Deck list appearance could not be loaded');
  }
  AppStorage.setOrCreate<string>(DECK_LIST_STYLE_KEY, style);
  AppStorage.setOrCreate<boolean>(DECK_LIST_NARROW_KEY, isNarrowDeckListStyle(style));
  AppStorage.setOrCreate<boolean>(DECK_WIDTH_HINT_HANDLED_KEY, hintHandled);
  AppStorage.setOrCreate<boolean>(DECK_DOUBLE_COLUMN_HINT_HANDLED_KEY, doubleColumnHintHandled);
}

/** @throws {Error} 记录失败由提示宿主反馈，本次会话仍不重复弹出。 */
export async function completeDeckWidthHint(doubleColumn: boolean = false): Promise<void> {
  const store: preferences.Preferences = getDeckListPreferences();
  await saveLocalPreference(store,
    doubleColumn ? DECK_DOUBLE_COLUMN_HINT_HANDLED_KEY : DECK_WIDTH_HINT_HANDLED_KEY, true, false);
}

/** @throws {Error} 保存失败保持原外观，交由设置控件显示错误。 */
export async function saveDeckListStyle(style: string, expected: string | null = null): Promise<void> {
  if (!isDeckListStyle(style)) { throw new Error('invalid_setting_value'); }
  const store: preferences.Preferences = getDeckListPreferences();
  await saveLocalPreference(store, DECK_LIST_STYLE_KEY, style, legacyDeckListStyle(store), expected, (): void => {
    AppStorage.setOrCreate<boolean>(DECK_LIST_NARROW_KEY, isNarrowDeckListStyle(style));
  });
}
