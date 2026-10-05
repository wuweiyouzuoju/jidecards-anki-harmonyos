// SPDX-License-Identifier: AGPL-3.0-or-later
import { SETTINGS_ENTRIES, settingsEntryVisible } from './SettingsNavigation';

export interface SettingsItem {
  id: string;
  titleKey: string;
  settingId?: string;
  opens?: string;
  fullOnly?: boolean;
  /** 状态相关内容保留条件，不把尚未读取的账号/提供商状态当成已显示。 */
  condition?: string;
  sensitive?: boolean;
}
export interface SettingsGroup {
  id: string;
  sectionId: string;
  titleKey: string;
  fullOnly?: boolean;
  items: SettingsItem[];
}

/** 分组顺序、标题和项名称共用；设置面板从此处选择实际渲染的卡片。 */
export const SETTINGS_GROUPS: SettingsGroup[] = [
  { id: 'general_display', sectionId: 'general', titleKey: 'settings_general_display', items: [
    { id: 'language', titleKey: 'settings_language', settingId: 'language' },
    { id: 'home_today_summary', titleKey: 'settings_home_today_summary', settingId: 'home_today_summary' }
  ] },
  { id: 'review_controls', sectionId: 'scheduler', titleKey: 'settings_controls_review', items: [
    { id: 'study_haptics', titleKey: 'settings_study_haptics', settingId: 'study_haptics' },
    { id: 'study_quick_answer', titleKey: 'settings_quick_answer', settingId: 'study_quick_answer' }
  ] },
  { id: 'global_review', sectionId: 'scheduler', titleKey: 'settings_core_review', fullOnly: true, items: [
    { id: 'rollover', titleKey: 'settings_rollover' },
    { id: 'learn_ahead', titleKey: 'settings_learn_ahead' },
    { id: 'timebox', titleKey: 'settings_timebox' }
  ] },
  { id: 'study_layout', sectionId: 'scheduler', titleKey: 'settings_study_layout', items: [
    { id: 'study_layout', titleKey: 'settings_study_layout_row', settingId: 'study_layout' }
  ] },
  { id: 'algorithm', sectionId: 'scheduler', titleKey: 'settings_scheduler', fullOnly: true, items: [
    { id: 'algorithm_scope', titleKey: 'settings_algorithm_scope' },
    { id: 'algorithm_deck_options', titleKey: 'settings_algorithm_deck_options' },
    { id: 'fsrs_enabled', titleKey: 'settings_fsrs_label', settingId: 'fsrs_enabled' }
  ] },
  { id: 'sync', sectionId: 'sync', titleKey: 'settings_sync_group', items: [
    { id: 'sync_account', titleKey: 'sync_current_account', condition: 'logged_in', sensitive: true },
    { id: 'auto_sync', titleKey: 'sync_auto_label', settingId: 'auto_sync', condition: 'sync_endpoint_available' },
    { id: 'sync_register', titleKey: 'sync_register_link', condition: 'official_sync_logged_out' },
    { id: 'sync_username', titleKey: 'sync_username_hint', condition: 'sync_logged_out', sensitive: true },
    { id: 'sync_password', titleKey: 'sync_password_hint', condition: 'sync_logged_out', sensitive: true },
    { id: 'sync_login', titleKey: 'sync_login', condition: 'sync_logged_out' },
    { id: 'sync_media', titleKey: 'settings_sync_media_toggle', settingId: 'sync_media', condition: 'logged_in' },
    { id: 'sync_backup_first', titleKey: 'sync_backup_first', condition: 'logged_in' },
    { id: 'sync_now', titleKey: 'sync_now', condition: 'logged_in' },
    { id: 'sync_logout', titleKey: 'sync_logout', condition: 'logged_in' },
    { id: 'sync_custom_server', titleKey: 'sync_custom_server_entry' }
  ] },
  { id: 'appearance', sectionId: 'appearance', titleKey: 'settings_appearance_display', items: [
    { id: 'theme_mode', titleKey: 'appearance_theme', settingId: 'theme_mode' },
    { id: 'color_theme', titleKey: 'appearance_color_theme', settingId: 'color_theme' },
    { id: 'theme_motion', titleKey: 'iridescent_motion', settingId: 'theme_motion', condition: 'theme_has_textures' },
    { id: 'deck_list_style', titleKey: 'deck_width', settingId: 'deck_list_style' },
    { id: 'card_text_size', titleKey: 'card_text_size', settingId: 'card_text_size' }
  ] },
  { id: 'study_display', sectionId: 'appearance', titleKey: 'settings_study_display', items: [
    { id: 'show_remaining', titleKey: 'settings_show_remaining' },
    { id: 'show_intervals', titleKey: 'settings_show_intervals' }
  ] },

  { id: 'data', sectionId: 'data', titleKey: 'settings_data_management', items: [
    { id: 'import', titleKey: 'transfer_import_file' },
    { id: 'export_deck', titleKey: 'transfer_export_deck' },
    { id: 'backups', titleKey: 'backup_hub_title', opens: 'backup_management' },
    { id: 'notetypes', titleKey: 'notetype_mgmt_entry', fullOnly: true },
    { id: 'hidden_decks', titleKey: 'hidden_decks_entry' },
    { id: 'media_management', titleKey: 'settings_media_management', opens: 'media_maintenance' },
    { id: 'check_database', titleKey: 'check_db_title', fullOnly: true },
    { id: 'empty_cards', titleKey: 'empty_cards_entry', fullOnly: true },
    { id: 'duplicate_notes', titleKey: 'find_dupes_entry', fullOnly: true },
    { id: 'unused_tags', titleKey: 'settings_clear_unused_tags', fullOnly: true }
  ] },
  { id: 'help', sectionId: 'help', titleKey: 'settings_glossary', items: [
    { id: 'help_bury', titleKey: 'glossary_bury_label' },
    { id: 'help_suspend', titleKey: 'glossary_suspend_label' },
    { id: 'help_siblings', titleKey: 'glossary_siblings_label' },
    { id: 'help_delete', titleKey: 'glossary_delete_label' },
    { id: 'help_undo', titleKey: 'glossary_undo_label' },
    { id: 'help_rating', titleKey: 'glossary_ratings_label' },
    { id: 'help_lapse', titleKey: 'glossary_lapse_label' },
    { id: 'help_leech', titleKey: 'glossary_leech_label' },
    { id: 'help_graduate', titleKey: 'glossary_graduating_interval_label' },
    { id: 'help_fsrs', titleKey: 'glossary_fsrs_retention_label' },
    { id: 'help_fuzz', titleKey: 'glossary_fuzz_label' },
    { id: 'help_shortcuts', titleKey: 'glossary_shortcuts_label' },
    { id: 'help_sidebar', titleKey: 'browser_action_sidebar' },
    { id: 'help_find_replace', titleKey: 'browser_action_find_replace' },
    { id: 'help_batch', titleKey: 'browser_help_batch_title' },
    { id: 'help_browser_info', titleKey: 'glossary_browser_info_label' }
  ] },
  { id: 'ai', sectionId: 'ai', titleKey: 'ai_agent_settings_title', items: [
    { id: 'ai_provider', titleKey: 'ai_agent_provider' },
    { id: 'ai_model', titleKey: 'ai_card_model', condition: 'builtin_provider' },
    { id: 'ai_custom_url', titleKey: 'ai_agent_custom_url_hint', condition: 'custom_provider' },
    { id: 'ai_custom_model', titleKey: 'ai_card_model_hint', condition: 'custom_provider' },
    { id: 'ai_vision', titleKey: 'ai_agent_custom_vision', condition: 'custom_provider' },
    { id: 'ai_key', titleKey: 'ai_card_api_key', sensitive: true },
    { id: 'ai_batch_limit', titleKey: 'ai_agent_batch_limit' },
    { id: 'ai_save', titleKey: 'ai_card_save_config' },
    { id: 'ai_web_enabled', titleKey: 'ai_web_enabled' },
    { id: 'ai_web_provider', titleKey: 'ai_web_provider', condition: 'web_enabled' },
    { id: 'ai_web_purchase', titleKey: 'ai_web_purchase', condition: 'web_enabled' },
    { id: 'ai_web_key', titleKey: 'ai_web_key_hint', condition: 'web_enabled', sensitive: true },
    { id: 'ai_web_save', titleKey: 'ai_web_save' }
  ] },
  { id: 'redemption', sectionId: 'redemption', titleKey: 'settings_directory_redemption', items: [
    { id: 'installation_fingerprint', titleKey: 'redemption_fingerprint', sensitive: true },
    { id: 'fingerprint_copy', titleKey: 'redemption_copy' },
    { id: 'redemption', titleKey: 'redemption_entry' }
  ] },
  { id: 'about', sectionId: 'about', titleKey: 'settings_about', items: [
    { id: 'app_information', titleKey: 'app_about_title' },
    { id: 'feedback', titleKey: 'feedback_title' },
    { id: 'rate', titleKey: 'about_rate_title' },
    { id: 'ankiweb', titleKey: 'about_ankiweb_title' },
    { id: 'community', titleKey: 'about_qq_group_title' },
    { id: 'licenses', titleKey: 'licenses_title' },
    { id: 'anki_documentation', titleKey: 'about_anki_docs_title' }
  ] },
  { id: 'advanced', sectionId: 'advanced', titleKey: 'settings_developer_debug_title', items: [
    { id: 'agent_enabled', titleKey: 'settings_developer_debug_enabled', condition: 'agent_enabled' },
    { id: 'developer_description', titleKey: 'settings_developer_debug_description', condition: 'agent_disabled' },
    { id: 'developer_contact', titleKey: 'settings_developer_debug_qq_hint', condition: 'agent_disabled' },
    { id: 'developer_key', titleKey: 'settings_developer_debug_key_placeholder', condition: 'agent_disabled', sensitive: true },
    { id: 'developer_enable', titleKey: 'settings_developer_debug_enable', condition: 'agent_disabled' }
  ] }
];

export function visibleSettingsGroups(sectionId: string, simple: boolean, agent: boolean): SettingsGroup[] {
  const section = SETTINGS_ENTRIES.find((entry): boolean => entry.id === sectionId);
  if (section === undefined || !settingsEntryVisible(section, simple, agent)) return [];
  return SETTINGS_GROUPS.filter((group: SettingsGroup): boolean =>
    group.sectionId === sectionId && !(group.fullOnly && simple));
}

export function settingsItemVisible(item: SettingsItem, simple: boolean, themeHasTextures: boolean): boolean {
  return !(item.fullOnly && simple) && !(item.condition === 'theme_has_textures' && !themeHasTextures);
}

/** UI 显隐不抛异常；不存在的绑定不渲染，由目录契约测试报告缺项。 */
export function isSettingsItemVisible(id: string, simple: boolean, themeHasTextures: boolean): boolean {
  for (const group of SETTINGS_GROUPS) {
    const item = group.items.find((entry: SettingsItem): boolean => entry.id === id);
    if (item !== undefined) return settingsItemVisible(item, simple, themeHasTextures);
  }
  return false;
}

/** @throws {Error} 无效的 UI 绑定由构建/资源契约测试拦截，不能静默补一个假标题。 */
export function settingsItem(id: string): SettingsItem {
  for (const group of SETTINGS_GROUPS) {
    const item = group.items.find((entry: SettingsItem): boolean => entry.id === id);
    if (item !== undefined) return item;
  }
  throw new Error('unknown_settings_item:' + id);
}
