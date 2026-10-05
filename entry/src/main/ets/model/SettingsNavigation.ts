// SPDX-License-Identifier: AGPL-3.0-or-later

export interface SettingsEntry {
  id: string;
  titleKey: string;
  descriptionKey: string;
  simpleDescriptionKey?: string;
  searchKeys?: string[];
  fullOnly: boolean;
  agentOnly: boolean;
}

/** 设置目录是界面和 JIDE 的共同入口，具体设置仍由原分组负责读写。 */
export const SETTINGS_ENTRIES: SettingsEntry[] = [
  { id: 'general', titleKey: 'settings_directory_general', descriptionKey: 'settings_directory_general_hint', fullOnly: false, agentOnly: false },
  { id: 'scheduler', titleKey: 'settings_directory_review', descriptionKey: 'settings_directory_algorithm_hint', simpleDescriptionKey: 'settings_directory_review_simple_hint', searchKeys: ['settings_rollover', 'settings_learn_ahead', 'settings_timebox', 'settings_quick_answer', 'settings_study_layout', 'settings_study_layout_row', 'settings_study_layout_bottom', 'settings_study_layout_float', 'settings_study_layout_smart'], fullOnly: false, agentOnly: false },
  { id: 'sync', titleKey: 'settings_directory_sync', descriptionKey: 'settings_directory_sync_hint', simpleDescriptionKey: 'settings_directory_sync_simple_hint', fullOnly: false, agentOnly: false },
  { id: 'appearance', searchKeys: ['settings_show_remaining', 'settings_show_intervals'], titleKey: 'settings_directory_appearance', descriptionKey: 'settings_directory_appearance_hint', simpleDescriptionKey: 'settings_directory_appearance_simple_hint', fullOnly: false, agentOnly: false },
  { id: 'data', titleKey: 'settings_data_management', descriptionKey: 'settings_directory_data_hint', simpleDescriptionKey: 'settings_directory_data_simple_hint', searchKeys: ['hidden_decks_entry', 'hidden_decks_entry_subtitle', 'transfer_import_file', 'transfer_import_file_hint', 'transfer_export_deck', 'backup_hub_title', 'backup_full_restore_hint'], fullOnly: false, agentOnly: false },
  { id: 'help', titleKey: 'settings_directory_help', descriptionKey: 'settings_directory_help_hint', fullOnly: false, agentOnly: false },
  { id: 'ai', titleKey: 'ai_agent_settings_title', descriptionKey: 'settings_directory_ai_hint', fullOnly: false, agentOnly: true },
  { id: 'redemption', titleKey: 'settings_directory_redemption', descriptionKey: 'settings_directory_redemption_hint', fullOnly: false, agentOnly: false },
  { id: 'about', titleKey: 'settings_about', descriptionKey: 'settings_directory_about_hint', fullOnly: false, agentOnly: false },
  { id: 'advanced', titleKey: 'settings_directory_advanced', descriptionKey: 'settings_directory_advanced_hint', fullOnly: true, agentOnly: false }
];

export function settingsEntryVisible(entry: SettingsEntry, simple: boolean, agent: boolean): boolean {
  return !(entry.fullOnly && simple) && !(entry.agentOnly && !agent);
}

/** 搜索标题、说明及两种模式均可用的设置项资源，同时遵守入口可见性。 */
export function filterSettingsEntries(query: string, simple: boolean, agent: boolean,
  localize: (key: string) => string): SettingsEntry[] {
  const terms: string[] = query.trim().toLocaleLowerCase().split(new RegExp('\\s+')).filter((term: string): boolean => term !== '');
  return SETTINGS_ENTRIES.filter((entry: SettingsEntry): boolean => {
    if (!settingsEntryVisible(entry, simple, agent)) return false;
    const descriptionKey: string = simple ? (entry.simpleDescriptionKey ?? entry.descriptionKey) : entry.descriptionKey;
    const keywords: string = (entry.searchKeys ?? []).map((key: string): string => localize(key)).join(' ');
    const text: string = `${localize(entry.titleKey)} ${localize(descriptionKey)} ${keywords}`.toLocaleLowerCase();
    return terms.every((term: string): boolean => text.includes(term));
  });
}
