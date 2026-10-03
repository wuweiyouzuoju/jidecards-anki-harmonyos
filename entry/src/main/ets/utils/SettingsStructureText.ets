// SPDX-License-Identifier: AGPL-3.0-or-later
import { UIContext } from '@kit.ArkUI';
import { SETTINGS_GROUPS, settingsItem } from '../model/SettingsStructure';
import { namedResourceText } from './UiFeedback';

export function settingsItemText(context: UIContext, id: string): string {
  try { return namedResourceText(context, settingsItem(id).titleKey); }
  catch (error) { return '[' + id + ']'; }
}
export function settingsGroupText(context: UIContext, id: string): string {
  const group = SETTINGS_GROUPS.find((entry): boolean => entry.id === id);
  return group === undefined ? '[' + id + ']' : namedResourceText(context, group.titleKey);
}
