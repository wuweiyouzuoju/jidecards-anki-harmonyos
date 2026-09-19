// SPDX-License-Identifier: AGPL-3.0-or-later

export interface SettingsEntry {
  id: string;
  titleKey: string;
  descriptionKey: string;
  simpleDescriptionKey?: string;
  fullOnly: boolean;
  agentOnly: boolean;
}

/** 设置目录只描述入口，具体设置仍由原分组负责读写。 */
export const SETTINGS_ENTRIES: SettingsEntry[] = [
  { id: 'general', titleKey: 'settings_directory_general', descriptionKey: 'settings_directory_general_hint', fullOnly: false, agentOnly: false },
  { id: 'scheduler', titleKey: 'settings_directory_review', descriptionKey: 'settings_directory_algorithm_hint', fullOnly: true, agentOnly: false },
  { id: 'sync', titleKey: 'settings_directory_sync', descriptionKey: 'settings_directory_sync_hint', simpleDescriptionKey: 'settings_directory_sync_simple_hint', fullOnly: false, agentOnly: false },
  { id: 'appearance', titleKey: 'settings_directory_appearance', descriptionKey: 'settings_directory_appearance_hint', simpleDescriptionKey: 'settings_directory_appearance_simple_hint', fullOnly: false, agentOnly: false },
  { id: 'controls', titleKey: 'settings_directory_controls', descriptionKey: 'settings_directory_controls_hint', fullOnly: true, agentOnly: false },
  { id: 'data', titleKey: 'settings_data_management', descriptionKey: 'settings_directory_data_hint', simpleDescriptionKey: 'settings_directory_data_simple_hint', fullOnly: false, agentOnly: false },
  { id: 'help', titleKey: 'settings_directory_help', descriptionKey: 'settings_directory_help_hint', fullOnly: false, agentOnly: false },
  { id: 'ai', titleKey: 'ai_agent_settings_title', descriptionKey: 'settings_directory_ai_hint', fullOnly: false, agentOnly: true },
  { id: 'about', titleKey: 'settings_about', descriptionKey: 'settings_directory_about_hint', fullOnly: false, agentOnly: false },
  { id: 'advanced', titleKey: 'settings_directory_advanced', descriptionKey: 'settings_directory_advanced_hint', fullOnly: true, agentOnly: false }
];

/** 搜索标题及说明，同时遵守模式和开发者入口的可见性。 */
export function filterSettingsEntries(query: string, simple: boolean, agent: boolean,
  localize: (key: string) => string): SettingsEntry[] {
  const terms: string[] = query.trim().toLocaleLowerCase().split(new RegExp('\\s+')).filter((term: string): boolean => term !== '');
  return SETTINGS_ENTRIES.filter((entry: SettingsEntry): boolean => {
    if ((entry.fullOnly && simple) || (entry.agentOnly && !agent)) return false;
    const descriptionKey: string = simple ? (entry.simpleDescriptionKey ?? entry.descriptionKey) : entry.descriptionKey;
    const text: string = `${localize(entry.titleKey)} ${localize(descriptionKey)}`.toLocaleLowerCase();
    return terms.every((term: string): boolean => text.includes(term));
  });
}
