// SPDX-License-Identifier: AGPL-3.0-or-later
import { preferences } from '@kit.ArkData';
import { common } from '@kit.AbilityKit';
import { APPEARANCE_EDITOR_SECTION_KEY, validAppearanceSection, APPEARANCE_ELEMENTS_KEY, AppearanceElementStyle, parseElementProfiles, replaceElementStyle } from '../model/AppearanceElements';
import { readLocalPreference, saveLocalPreference } from './LocalPreferenceWrite';
/** @throws {Error} 偏好读写失败由启动或设置入口反馈。 */
function elementPreferences(): preferences.Preferences {
  const context: common.UIAbilityContext | undefined = AppStorage.get<common.UIAbilityContext>('abilityContext');
  if (context === undefined) throw new Error('ability_context_unavailable');
  return preferences.getPreferencesSync(context, { name: 'jidecards_settings' });
}
/** @throws {Error} 偏好读写失败由启动或设置入口反馈。 */
export async function loadAppearanceElements(): Promise<void> {
  const section: preferences.ValueType = await readLocalPreference(elementPreferences(), APPEARANCE_EDITOR_SECTION_KEY, 'color');
  AppStorage.setOrCreate<string>(APPEARANCE_EDITOR_SECTION_KEY, section === 'appearance_border' ? 'appearance_module_outline' : typeof section === 'string' && validAppearanceSection(section) ? section : 'color');
  let raw: preferences.ValueType = await readLocalPreference(elementPreferences(), APPEARANCE_ELEMENTS_KEY, '');
  if (typeof raw !== 'string') throw new Error('invalid_appearance_elements');
  const resetKey: string = 'appearance_border_defaults_repair_v1';
  const repaired: preferences.ValueType = await readLocalPreference(elementPreferences(), resetKey, false);
  const profiles = parseElementProfiles(raw);
  if (repaired !== true) {
    profiles.light.width = -1; profiles.dark.width = -1;
    profiles.light.moduleWidth = -1; profiles.dark.moduleWidth = -1;
    profiles.light.outline = ''; profiles.dark.outline = '';
    profiles.light.moduleOutline = ''; profiles.dark.moduleOutline = '';
    const restored: string = raw === '' ? '' : JSON.stringify(profiles);
    if (raw !== '') await saveLocalPreference(elementPreferences(), APPEARANCE_ELEMENTS_KEY, restored, '', raw);
    await saveLocalPreference(elementPreferences(), resetKey, true, false);
    raw = restored;
  }
  AppStorage.setOrCreate<string>(APPEARANCE_ELEMENTS_KEY, raw);
}
/** 每次确认保存完整模式配置并校验原值，避免另一设置窗口覆盖新配置。 */
/** @throws {Error} 偏好读写失败由启动或设置入口反馈。 */
export async function saveAppearanceElements(dark: boolean, style: AppearanceElementStyle, expected: string): Promise<void> {
  await saveLocalPreference(elementPreferences(), APPEARANCE_ELEMENTS_KEY,
    replaceElementStyle(expected, dark, style), '', expected);
}

/** @throws {Error} 偏好读写失败由启动或设置入口反馈。 */
export async function saveAppearanceSection(section: string): Promise<void> {
  if (!validAppearanceSection(section)) throw new Error('invalid_appearance_section');
  await saveLocalPreference(elementPreferences(), APPEARANCE_EDITOR_SECTION_KEY, section, 'color');
}
