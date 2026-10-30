// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { WHEEL_ON_ENTRY_KEY, WHEEL_ON_KEYBOARD_KEY, isWheelPreference } from '../model/EditorWheelPreferences';
import { saveLocalPreference } from './LocalPreferenceWrite';
function wheelPreferences(): preferences.Preferences {
  const context = AppStorage.get<common.UIAbilityContext>('abilityContext');
  if (context === undefined) throw new Error('ability_context_unavailable');
  return preferences.getPreferencesSync(context, { name: 'jidecards_settings' });
}
export function initializeEditorWheelPreferences(): void {
  for (const key of [WHEEL_ON_ENTRY_KEY, WHEEL_ON_KEYBOARD_KEY]) {
    let value: boolean = true;
    try { const saved = wheelPreferences().getSync(key, true); if (typeof saved === 'boolean') value = saved; } catch (_error) {}
    AppStorage.setOrCreate<boolean>(key, value);
  }
}
export async function saveEditorWheelPreference(key: string, value: boolean, expected: boolean | null = null): Promise<void> {
  if (!isWheelPreference(key)) throw new Error('invalid_setting');
  await saveLocalPreference(wheelPreferences(), key, value, true, expected);
}
