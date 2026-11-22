// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { HOME_LAYOUT_KEY, DEFAULT_HOME_LAYOUT, isHomeLayout, HOME_LEFT_WHEEL_OPEN_KEY, HOME_RIGHT_WHEEL_OPEN_KEY } from '../model/HomeLayout';
import { saveLocalPreference } from './LocalPreferenceWrite';
import { isHomeSummaryPage } from '../model/HomeHeaderLayout';

const SUMMARY_PAGE_KEYS: string[] = ['home_summary_left_page', 'home_summary_right_page'];
const summaryPages: Map<number, number> = new Map<number, number>();

/** @throws {Error} 缺少上下文不能冒充保存成功。 */
function homeLayoutPreferences(): preferences.Preferences {
  const context = AppStorage.get<common.UIAbilityContext>('abilityContext');
  if (context === undefined) throw new Error('Ability context unavailable');
  return preferences.getPreferencesSync(context, { name: 'jidecards_settings' });
}
/** 缺失新键时始终沿用旧版，升级不自动改变已有用户的主页。 */
export function initializeHomeLayout(): void {
  let mode: string = DEFAULT_HOME_LAYOUT;
  try {
    const stored = homeLayoutPreferences().getSync(HOME_LAYOUT_KEY, DEFAULT_HOME_LAYOUT);
    if (typeof stored !== 'string' || !isHomeLayout(stored)) throw new Error('invalid_saved_setting:home_layout');
    mode = stored;
  } catch (_error) { hilog.warn(0x4342, 'jidecards', 'Home layout could not be loaded; keeping classic layout'); }
  AppStorage.setOrCreate<string>(HOME_LAYOUT_KEY, mode);
  for (const key of [HOME_LEFT_WHEEL_OPEN_KEY, HOME_RIGHT_WHEEL_OPEN_KEY]) {
    let expanded: boolean = true;
    try {
      const value = homeLayoutPreferences().getSync(key, true);
      if (typeof value !== 'boolean') throw new Error('invalid_saved_wheel_state');
      expanded = value;
    } catch (_error) { hilog.warn(0x4342, 'jidecards', 'Home wheel state could not be loaded'); }
    AppStorage.setOrCreate<boolean>(key, expanded);
  }
}
/** @throws {Error} 确认保存及回读之后才广播，失败由设置页展示。 */
export async function saveHomeLayout(mode: string, expected: string | null = null): Promise<void> {
  if (!isHomeLayout(mode)) throw new Error('invalid_setting_value');
  await saveLocalPreference(homeLayoutPreferences(), HOME_LAYOUT_KEY, mode, DEFAULT_HOME_LAYOUT, expected);
}

/** @throws {Error} 左右独立保存；失败不冒充下次启动已记住。 */
export async function saveHomeWheelExpanded(key: string, expanded: boolean): Promise<void> {
  if (key !== HOME_LEFT_WHEEL_OPEN_KEY && key !== HOME_RIGHT_WHEEL_OPEN_KEY) throw new Error('invalid_wheel_state_key');
  await saveLocalPreference(homeLayoutPreferences(), key, expanded, true);
}

export function readHomeSummaryPage(slot: number): number {
  const page: number | undefined = summaryPages.get(slot);
  if (page !== undefined) return page;
  let restored: number = slot;
  try {
    const value = homeLayoutPreferences().getSync(SUMMARY_PAGE_KEYS[slot], slot);
    if (typeof value === 'number' && isHomeSummaryPage(value)) restored = value;
  } catch (_error) {
    hilog.warn(0x4342, 'jidecards', 'Home summary page could not be loaded');
  }
  summaryPages.set(slot, restored);
  return restored;
}

/** 同一进程即刻记住位置，保存队列按滑动顺序写入各自的键。 */
export async function rememberHomeSummaryPage(slot: number, page: number): Promise<void> {
  if ((slot !== 0 && slot !== 1) || !isHomeSummaryPage(page)) return;
  summaryPages.set(slot, page);
  try {
    await saveLocalPreference(homeLayoutPreferences(), SUMMARY_PAGE_KEYS[slot], page, slot);
  } catch (_error) {
    hilog.warn(0x4342, 'jidecards', 'Home summary page could not be saved');
  }
}
