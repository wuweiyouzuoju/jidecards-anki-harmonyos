// SPDX-License-Identifier: AGPL-3.0-or-later
import { CARD_FLAGS } from './CardMarking';
import { DECK_OPTION_GROUPS } from './DeckOptionsCatalog';
import type { NoteAudioStatus } from './NoteAudioDraft';
export interface AppInterfaceContext {
  simple: boolean;
  agent: boolean;
  cloudDeck: boolean;
  themeHasTextures: boolean;
}
export interface AppInterfaceItem {
  id: string;
  titleKey: string;
  opens?: string;
  fullOnly?: boolean;
  agentOnly?: boolean;
  cloudOnly?: boolean;
  condition?: string;
}
export interface AppInterfaceSurface {
  id: string;
  titleKey: string;
  instructionsKey?: string;
  parent: string;
  items: AppInterfaceItem[];
}

export const STATS_INTERFACE_SECTIONS: AppInterfaceItem[] = [
  { id: 'today', titleKey: 'stats_section_today', opens: 'stats_today' },
  { id: 'forecast', titleKey: 'stats_section_forecast', opens: 'stats_forecast' },
  { id: 'calendar', titleKey: 'stats_section_calendar', opens: 'stats_calendar' },
  { id: 'reviews', titleKey: 'stats_section_reviews', opens: 'stats_reviews' },
  { id: 'card_counts', titleKey: 'stats_section_card_counts', opens: 'stats_card_counts' },
  { id: 'interval', titleKey: 'stats_section_interval', opens: 'stats_interval' },
  { id: 'stability', titleKey: 'stats_section_stability', opens: 'stats_stability', condition: 'fsrs' },
  { id: 'ease', titleKey: 'stats_section_ease', opens: 'stats_ease' },
  { id: 'retrievability', titleKey: 'stats_section_retrievability', opens: 'stats_retrievability', condition: 'fsrs' },
  { id: 'retention', titleKey: 'stats_section_retention', opens: 'stats_retention' },
  { id: 'hours', titleKey: 'stats_section_hours', opens: 'stats_hours' },
  { id: 'buttons', titleKey: 'stats_section_buttons', opens: 'stats_buttons' },
  { id: 'added', titleKey: 'stats_section_added', opens: 'stats_added' }
];

export const WHITEBOARD_INTERFACE_ITEMS: AppInterfaceItem[] = [
  { id: 'close', titleKey: 'study_whiteboard_close' },
  { id: 'official_tools', titleKey: 'study_whiteboard_official_tools', condition: 'official_suite' },
  { id: 'undo', titleKey: 'image_occlusion_undo', condition: 'local_suite' },
  { id: 'redo', titleKey: 'study_whiteboard_redo', condition: 'local_suite' },
  { id: 'clear', titleKey: 'study_whiteboard_clear', condition: 'local_suite' },
  { id: 'pen', titleKey: 'study_whiteboard_pen', condition: 'local_suite' },
  { id: 'eraser', titleKey: 'study_whiteboard_eraser', condition: 'local_suite' },
  { id: 'color_0', titleKey: 'study_whiteboard_auto_color', condition: 'pen_settings' },
  { id: 'color_1', titleKey: 'study_whiteboard_red', condition: 'pen_settings' },
  { id: 'color_2', titleKey: 'study_whiteboard_blue', condition: 'pen_settings' },
  { id: 'color_3', titleKey: 'study_whiteboard_green', condition: 'pen_settings' },
  { id: 'width_0', titleKey: 'study_whiteboard_thin', condition: 'pen_settings' },
  { id: 'width_1', titleKey: 'study_whiteboard_medium', condition: 'pen_settings' },
  { id: 'width_2', titleKey: 'study_whiteboard_thick', condition: 'pen_settings' },
  { id: 'eraser_width_0', titleKey: 'study_whiteboard_small', condition: 'eraser_settings' },
  { id: 'eraser_width_1', titleKey: 'study_whiteboard_medium_size', condition: 'eraser_settings' },
  { id: 'eraser_width_2', titleKey: 'study_whiteboard_large', condition: 'eraser_settings' },
  { id: 'stylus', titleKey: 'study_whiteboard_stylus', condition: 'tool_settings' },
  { id: 'settings_close', titleKey: 'done', condition: 'tool_settings' },
  { id: 'retry', titleKey: 'study_whiteboard_retry', condition: 'failed' },
  { id: 'show_answer', titleKey: 'study_show_answer', condition: 'question' },
  { id: 'again', titleKey: 'rating_again', condition: 'answer' },
  { id: 'hard', titleKey: 'rating_hard', condition: 'answer' },
  { id: 'good', titleKey: 'rating_good', condition: 'answer' },
  { id: 'easy', titleKey: 'rating_easy', condition: 'answer' }
];

/** 菜单直接遍历这里的条目；标签、顺序和显隐由 UI 与 JIDE 共用。 */
export const APP_INTERFACE_SURFACES: AppInterfaceSurface[] = [
  { id: 'home', titleKey: 'home_interface_title', instructionsKey: 'home_actions_instructions', parent: '', items: [
    { id: 'more', titleKey: 'study_more', opens: 'home_more' },
    { id: 'agent', titleKey: 'ai_agent_title', opens: 'agent', agentOnly: true },
    { id: 'search', titleKey: 'home_search_title', opens: 'home_search' },
    { id: 'browser', titleKey: 'browser_title', opens: 'browser' },
    { id: 'sync', titleKey: 'home_sync', opens: 'sync' },
    { id: 'create', titleKey: 'create_deck', opens: 'home_create' },
    { id: 'today', titleKey: 'settings_home_today_summary', condition: 'home_today_summary' },
    { id: 'decks', titleKey: 'home_interface_decks', opens: 'deck_details' },
    { id: 'deck_menu', titleKey: 'deck_more', opens: 'deck_row_menu', condition: 'deck_long_press' },
    { id: 'reorder', titleKey: 'deck_menu_reorder', opens: 'deck_reorder', condition: 'deck_long_press' }
  ] },
  { id: 'deck_reorder', titleKey: 'deck_menu_reorder', instructionsKey: 'deck_reorder_instructions', parent: 'home', items: [
    { id: 'exit', titleKey: 'deck_reorder_exit' },
    { id: 'done', titleKey: 'deck_reorder_done' },
    { id: 'decks', titleKey: 'home_interface_decks', condition: 'drag_sibling_decks_in_reorder_mode' }
  ] },
  { id: 'home_more', titleKey: 'study_more', parent: 'home', items: [
    { id: 'settings', titleKey: 'top_settings', opens: 'settings' },
    { id: 'history', titleKey: 'collection_history_title', opens: 'collection_history' },
    { id: 'stats', titleKey: 'stats_page_title', opens: 'stats' },
    { id: 'reminders', titleKey: 'reminder_list_title', opens: 'reminders' },
    { id: 'intro', titleKey: 'home_intro_menu_title', opens: 'intro' }
  ] },
  { id: 'home_search', titleKey: 'home_search_title', instructionsKey: 'home_search_instructions', parent: 'home', items: [
    { id: 'query', titleKey: 'home_search_placeholder' },
    { id: 'results', titleKey: 'home_interface_decks', opens: 'deck_details' },
    { id: 'retry', titleKey: 'common_retry', condition: 'error' },
    { id: 'close', titleKey: 'close' }
  ] },
    { id: 'home_create', titleKey: 'create_deck', parent: 'home', items: [
      { id: 'create_deck', titleKey: 'create_deck_title', opens: 'create_deck' },
      { id: 'import', titleKey: 'transfer_import_file', opens: 'import' },
      { id: 'cloud_deck', titleKey: 'cloud_deck_menu_entry', opens: 'cloud_deck', cloudOnly: true },
      { id: 'filtered_deck', titleKey: 'filtered_deck_title', opens: 'filtered_deck', fullOnly: true }
  ] },
  { id: 'create_deck', titleKey: 'create_deck_title', parent: 'home_create', items: [
    { id: 'name', titleKey: 'deck_name_placeholder' },
    { id: 'top_level', titleKey: 'top_level_deck' },
    { id: 'parent_decks', titleKey: 'create_deck_parent_options', condition: 'loaded_parent_decks' },
    { id: 'confirm', titleKey: 'create_deck_confirm' },
    { id: 'cancel', titleKey: 'create_deck_cancel' }
  ] },
  { id: 'deck_details', titleKey: 'home_interface_decks', parent: 'home', items: [
    { id: 'add_note', titleKey: 'deck_add_card', opens: 'add_note' },
    { id: 'agent', titleKey: 'ai_agent_title', opens: 'agent', agentOnly: true },
    { id: 'preview', titleKey: 'deck_preview', opens: 'deck_preview_scope' },
    { id: 'total', titleKey: 'deck_total_cards' },
    { id: 'new', titleKey: 'new_cards' },
    { id: 'learning', titleKey: 'learning_cards' },
    { id: 'review', titleKey: 'review_cards' },
    { id: 'more', titleKey: 'deck_more', opens: 'deck_details_more' },
    { id: 'study', titleKey: 'start_study', opens: 'study' }
  ] },
  { id: 'deck_actions', titleKey: 'deck_more', parent: 'deck_details', items: [] },
  { id: 'deck_options', titleKey: 'deck_options_title', parent: 'deck_details', items: [
    { id: 'close', titleKey: 'create_deck_cancel' },
      { id: 'retry', titleKey: 'common_retry', condition: 'error' },
    { id: 'form', titleKey: 'deck_options_title', opens: 'deck_options_form', condition: 'ready' }
  ] },
  { id: 'deck_options_form', titleKey: 'deck_options_title', parent: 'deck_options', items: [
    { id: 'cancel', titleKey: 'create_deck_cancel' },
    { id: 'save', titleKey: 'deck_options_save' },
      { id: 'help', titleKey: 'field_help_button' },
    { id: 'newPerDay', titleKey: 'deck_newPerDay_label', condition: 'simple_mode' },
    { id: 'reviewsPerDay', titleKey: 'deck_reviewsPerDay_label', condition: 'simple_mode' },
    { id: 'learnSteps', titleKey: 'deck_learnSteps_label', condition: 'simple_mode' },
    { id: 'reviewOrder', titleKey: 'deck_reviewOrder_label', condition: 'simple_mode' },
    { id: 'preset', titleKey: 'deck_preset_label', fullOnly: true },
    { id: 'rename_preset', titleKey: 'deck_preset_rename', fullOnly: true },
    { id: 'create_preset', titleKey: 'deck_preset_create', fullOnly: true },
    { id: 'clone_preset', titleKey: 'deck_preset_clone', fullOnly: true },
    { id: 'remove_preset', titleKey: 'deck_preset_remove', fullOnly: true },
    { id: 'save_mode', titleKey: 'deck_save_mode_label', fullOnly: true },
    ...DECK_OPTION_GROUPS.map((group): AppInterfaceItem => ({ id: group.id, titleKey: group.titleKey,
      opens: 'deck_options_group_' + group.id, fullOnly: true }))
  ] },
  ...DECK_OPTION_GROUPS.map((group): AppInterfaceSurface => ({ id: 'deck_options_group_' + group.id, titleKey: group.titleKey,
    parent: 'deck_options_form', items: group.fields.map((field): AppInterfaceItem => ({ id: field.key,
      titleKey: field.titleKey, fullOnly: true, condition: field.scheduler === '' ? undefined : field.scheduler })) })),
  { id: 'deck_details_more', titleKey: 'deck_more', parent: 'deck_details', items: [
    { id: 'create_child', titleKey: 'deck_create_subdeck', opens: 'create_deck' },
    { id: 'rename', titleKey: 'deck_rename_title', opens: 'deck_rename' },
    { id: 'move', titleKey: 'deck_move_title', opens: 'deck_move' },
    { id: 'options', titleKey: 'deck_options_title', opens: 'deck_options' },
    { id: 'export', titleKey: 'deck_export_this', opens: 'export' }
  ] },
  { id: 'deck_move', titleKey: 'deck_move_title', parent: 'deck_details_more', items: [
    { id: 'parent', titleKey: 'deck_move_parent' },
    { id: 'confirm', titleKey: 'deck_move_confirm' },
    { id: 'cancel', titleKey: 'cancel' },
    { id: 'reload', titleKey: 'deck_move_reload' }
  ] },
  { id: 'deck_rename', titleKey: 'deck_rename_title', instructionsKey: 'deck_rename_hint', parent: 'deck_details_more', items: [
    { id: 'name', titleKey: 'deck_rename_name' },
    { id: 'confirm', titleKey: 'deck_rename_confirm' },
    { id: 'cancel', titleKey: 'cancel' },
    { id: 'reload', titleKey: 'common_retry' }
  ] },
  { id: 'deck_customize', titleKey: 'deck_customize_title', instructionsKey: 'deck_customize_alias_hint', parent: 'home', items: [
    { id: 'name', titleKey: 'deck_customize_name_label' },
    { id: 'background', titleKey: 'deck_customize_background_label' },
    { id: 'confirm', titleKey: 'deck_customize_save' },
    { id: 'cancel', titleKey: 'cancel' }
  ] },
  { id: 'deck_row_menu', titleKey: 'deck_more', parent: 'home', items: [
    { id: 'rename', titleKey: 'deck_rename_title', opens: 'deck_rename' },
    { id: 'customize', titleKey: 'deck_customize', opens: 'deck_customize' }
  ] },
  { id: 'deck_preview_scope', titleKey: 'deck_preview', parent: 'deck_details', items: [
    { id: '0', titleKey: 'deck_preview_remaining', opens: 'preview' },
    { id: '1', titleKey: 'deck_preview_due', opens: 'preview' },
    { id: '2', titleKey: 'deck_preview_studied', opens: 'preview' },
    { id: '3', titleKey: 'deck_preview_all', opens: 'preview' }
  ] },
  { id: 'browser', titleKey: 'browser_title', parent: 'home', items: [
    { id: 'search', titleKey: 'browser_search_placeholder' },
    { id: 'cards', titleKey: 'browser_mode_cards', opens: 'browser_view' },
    { id: 'notes', titleKey: 'browser_mode_notes', opens: 'browser_view' },
    { id: 'filter', titleKey: 'browser_action_sidebar', opens: 'browser_view' },
    { id: 'sort', titleKey: 'browser_sort_default', opens: 'browser_view' },
    { id: 'more', titleKey: 'study_more', opens: 'browser_more' },
    { id: 'selection', titleKey: 'browser_selection_actions', opens: 'browser_batch' }
  ] },
  { id: 'browser_more', titleKey: 'study_more', parent: 'browser', items: [
    { id: 'filter', titleKey: 'browser_action_sidebar', opens: 'browser_sidebar' },
    { id: 'find_replace', titleKey: 'browser_action_find_replace', opens: 'browser_find_replace' },
    { id: 'save_search', titleKey: 'browser_saved_search_save', opens: 'browser_save_search' },
    { id: 'flag_names', titleKey: 'card_mark_flag_names' },
    { id: 'history', titleKey: 'collection_history_title', opens: 'collection_history' },
    { id: 'subtitle_deck', titleKey: 'browser_subtitle_deck' },
    { id: 'subtitle_answer', titleKey: 'browser_subtitle_answer' },
    { id: 'subtitle_due', titleKey: 'browser_subtitle_due' }
  ] },
  { id: 'browser_batch', titleKey: 'browser_help_batch_title', parent: 'browser', items: [
    { id: 'reset', titleKey: 'browser_reset_title', opens: 'browser_reset' },
    { id: 'suspend', titleKey: 'browser_action_toggle_suspend' },
    { id: 'bury', titleKey: 'browser_action_toggle_bury' },
    { id: 'notetype', titleKey: 'browser_action_change_notetype' },
    { id: 'deck', titleKey: 'browser_action_change_deck' },
    { id: 'reposition', titleKey: 'browser_action_reposition' },
    { id: 'due', titleKey: 'browser_action_set_due' },
    { id: 'tags', titleKey: 'tags_batch_title', opens: 'tag_picker' },
    { id: 'marking', titleKey: 'study_marking_title', opens: 'browser_batch_marking' },
    { id: 'agent', titleKey: 'ai_card_edit', agentOnly: true },
    { id: 'help', titleKey: 'browser_help_batch_title' },
    { id: 'exit', titleKey: 'browser_exit_selection' },
    { id: 'delete', titleKey: 'browser_action_delete' }
  ] },
  { id: 'media_maintenance', titleKey: 'settings_media_management', parent: 'settings', items: [
    { id: 'check', titleKey: 'media_check' }, { id: 'trash_unused', titleKey: 'media_trash_all_unused' },
    { id: 'view_missing', titleKey: 'media_view_missing', opens: 'browser' }, { id: 'tag_missing', titleKey: 'media_tag_missing' },
    { id: 'empty', titleKey: 'media_empty_trash' }, { id: 'restore', titleKey: 'media_restore_trash' }, { id: 'close', titleKey: 'close' }
  ] },
  { id: 'collection_history', titleKey: 'collection_history_title', parent: 'home_more', items: [
    { id: 'undo', titleKey: 'collection_history_undo' }, { id: 'redo', titleKey: 'collection_history_redo' },
    { id: 'reload', titleKey: 'collection_history_reload' }, { id: 'close', titleKey: 'browser_detail_cancel' }
  ] },
  { id: 'backup_management', titleKey: 'backup_hub_title', parent: 'settings', items: [
    { id: 'export_collection', titleKey: 'transfer_export_personal' },
    { id: 'import_collection', titleKey: 'transfer_import_personal' },
    { id: 'automatic', titleKey: 'backup_management_auto' },
    { id: 'create', titleKey: 'backup_management_create' },
    { id: 'restore', titleKey: 'backup_management_restore' }, { id: 'close', titleKey: 'close' }
  ] },
  { id: 'browser_reset', titleKey: 'browser_reset_title', parent: 'browser_batch', items: [
    { id: 'restore_position', titleKey: 'browser_reset_restore_position' }, { id: 'reset_counts', titleKey: 'browser_reset_reset_counts' },
    { id: 'confirm', titleKey: 'browser_detail_confirm' }, { id: 'close', titleKey: 'browser_detail_cancel' },
    { id: 'retry', titleKey: 'common_retry', condition: 'error' }
  ] },
  { id: 'browser_batch_marking', titleKey: 'study_marking_title', parent: 'browser_batch', items: [
    { id: 'mark', titleKey: 'card_mark_mark' },
    { id: 'unmark', titleKey: 'card_mark_unmark' },
    { id: 'flag', titleKey: 'browser_action_set_flag', opens: 'browser_batch_flags' },
    { id: 'flag_names', titleKey: 'card_mark_flag_names' }
  ] },
  { id: 'browser_batch_flags', titleKey: 'browser_action_set_flag', parent: 'browser_batch_marking', items: [
    ...CARD_FLAGS.map((flag): AppInterfaceItem => ({ id: String(flag.value), titleKey: flag.labelKey }))
  ] },
  // 筛选与排序的选项由浏览页真实列/筛选模型提供，不能在这里另抄一份。
  { id: 'browser_view', titleKey: 'browser_title', parent: 'browser', items: [] },
  { id: 'agent', titleKey: 'ai_agent_title', parent: 'home', items: [
    { id: 'back', titleKey: 'study_back' },
    { id: 'history', titleKey: 'ai_agent_history', opens: 'agent_history', condition: 'conversation' },
    { id: 'new', titleKey: 'ai_agent_history_new', condition: 'history' },
    { id: 'input', titleKey: 'ai_card_input_hint', condition: 'conversation' },
    { id: 'import', titleKey: 'ai_agent_import_files', condition: 'conversation' },
    { id: 'submit', titleKey: 'ai_card_send', condition: 'conversation' }
  ] },
  { id: 'agent_history', titleKey: 'ai_agent_history_title', parent: 'agent', items: [
    { id: 'delete', titleKey: 'ai_agent_history_delete', condition: 'has_conversations' }
  ] },
  { id: 'reminders', titleKey: 'reminder_list_title', parent: 'home_more', items: [
    { id: 'back', titleKey: 'study_back' },
    { id: 'create', titleKey: 'reminder_list_create_button', opens: 'reminder_editor' }
  ] },
  { id: 'reminder_editor', titleKey: 'reminder_edit_title_create', parent: 'reminders', items: [
    { id: 'cancel', titleKey: 'create_deck_cancel' },
    { id: 'confirm', titleKey: 'create_deck_confirm' },
    { id: 'time', titleKey: 'reminder_edit_time_label' },
    { id: 'title', titleKey: 'reminder_edit_notification_title' },
    { id: 'content', titleKey: 'reminder_edit_notification_content' },
    { id: 'insert_new', titleKey: 'reminder_edit_insert_new' },
    { id: 'insert_review', titleKey: 'reminder_edit_insert_review' },
    { id: 'delete', titleKey: 'reminder_edit_delete', condition: 'editing' }
  ] },
  { id: 'stats', titleKey: 'stats_page_title', parent: 'home_more', items: [
    { id: 'back', titleKey: 'study_back' },
    { id: 'deck', titleKey: 'stats_deck_all', condition: 'charts_and_decks' },
    { id: 'year', titleKey: 'stats_history_range_year', condition: 'charts' },
    { id: 'all', titleKey: 'stats_history_range_all', condition: 'charts' },
    { id: 'sections', titleKey: 'stats_page_title', opens: 'stats_sections', condition: 'charts' }
  ] },
  { id: 'stats_sections', titleKey: 'stats_page_title', parent: 'stats', items: STATS_INTERFACE_SECTIONS },
  ...STATS_INTERFACE_SECTIONS.map((item: AppInterfaceItem): AppInterfaceSurface => ({
    id: 'stats_' + item.id, titleKey: item.titleKey, parent: 'stats_sections',
    items: [{ id: 'help', titleKey: 'field_help_button' }]
  })),
  { id: 'add_note', titleKey: 'add_note_title', instructionsKey: 'note_editor_format_action', parent: 'deck_details', items: [
    { id: 'back', titleKey: 'study_back' }, { id: 'save', titleKey: 'add_note_save_continue' },
    { id: 'save_return', titleKey: 'add_note_save_return' },
    { id: 'type', titleKey: 'add_note_notetype', opens: 'add_note_types' },
    { id: 'tags_entry', titleKey: 'add_note_tags', fullOnly: true },
    { id: 'tags', titleKey: 'add_note_tags', opens: 'tag_picker', fullOnly: true, condition: 'tags_expanded' },
    { id: 'image', titleKey: 'add_note_image_occlusion_pick_image', condition: 'image_occlusion' },
    { id: 'masks', titleKey: 'add_note_image_occlusion_edit_masks', condition: 'image_source' }
  ] },
  { id: 'add_note_types', titleKey: 'add_note_notetype', parent: 'add_note', items: [] },
  { id: 'edit_note', titleKey: 'note_editor_edit_title', parent: 'browser', items: [
    { id: 'back', titleKey: 'study_back', condition: 'no_form' },
    { id: 'save', titleKey: 'browser_detail_save', condition: 'no_form' },
    { id: 'retry', titleKey: 'note_editor_retry', condition: 'load_failed' },
    { id: 'form', titleKey: 'note_editor_edit_title', opens: 'edit_note_form', condition: 'loaded' }
  ] },
  { id: 'edit_note_form', titleKey: 'note_editor_edit_title', instructionsKey: 'note_editor_format_action', parent: 'edit_note', items: [
    { id: 'back', titleKey: 'study_back' }, { id: 'save', titleKey: 'browser_detail_save' },
    { id: 'tags', titleKey: 'browser_detail_tags', opens: 'tag_picker' }
  ] },
  { id: 'note_audio_manage', titleKey: 'note_audio_manage', parent: '', items: [
    { id: 'close', titleKey: 'cancel' }, { id: 'apply', titleKey: 'done' },
    { id: 'add', titleKey: 'note_audio_add' }, { id: 'record', titleKey: 'note_audio_record' },
    { id: 'pause', titleKey: 'note_audio_pause', condition: 'recording' },
    { id: 'cancel_recording', titleKey: 'note_audio_record_cancel', condition: 'recording' }
  ] },
  { id: 'tag_picker', titleKey: 'tags_choose', parent: '', items: [
    { id: 'search', titleKey: 'tags_search_hint' },
    { id: 'tags', titleKey: 'tags_choose' },
    { id: 'create', titleKey: 'tags_create' },
    { id: 'retry', titleKey: 'home_retry' }
  ] },
  { id: 'deck_options_fsrs', titleKey: 'deck_fsrs_tools_title', parent: 'deck_options_form', items: [
    { id: 'optimize_current', titleKey: 'deck_fsrs_optimize_current' },
    { id: 'optimize_all', titleKey: 'deck_fsrs_optimize_all' },
    { id: 'evaluate', titleKey: 'deck_fsrs_evaluate_current' },
    { id: 'retry', titleKey: 'deck_fsrs_retry_failed' },
    { id: 'days', titleKey: 'deck_fsrs_days' },
    { id: 'simulate', titleKey: 'deck_fsrs_simulate' },
    { id: 'compare_retention', titleKey: 'deck_fsrs_compare_retention' },
    { id: 'use_retention', titleKey: 'deck_fsrs_use_retention' }
  ] },
  { id: 'study', titleKey: 'start_study', parent: 'deck_details', items: [
    { id: 'back', titleKey: 'study_back' },
    { id: 'more', titleKey: 'study_more', opens: 'study_more' },
    { id: 'show_answer', titleKey: 'study_show_answer', condition: 'question' },
    { id: 'again', titleKey: 'rating_again', condition: 'answer' },
    { id: 'hard', titleKey: 'rating_hard', condition: 'answer' },
    { id: 'good', titleKey: 'rating_good', condition: 'answer' },
    { id: 'easy', titleKey: 'rating_easy', condition: 'answer' }
  ] },
  { id: 'custom_scheduling_warning', titleKey: 'custom_scheduling_title', parent: 'study', items: [
    { id: 'exit', titleKey: 'custom_scheduling_exit' }, { id: 'continue', titleKey: 'custom_scheduling_continue' }
  ] },
  { id: 'study_more', titleKey: 'study_more', parent: 'study', items: [
    { id: 'edit', titleKey: 'study_edit_note', opens: 'edit_note' },
    { id: 'agent', titleKey: 'ai_card_edit', opens: 'agent', agentOnly: true, condition: 'has_card_phase' },
    { id: 'undo', titleKey: 'study_undo' },
    { id: 'marking', titleKey: 'study_marking_title', opens: 'study_marking' },
    { id: 'audio', titleKey: 'study_replay_sound' },
    { id: 'card_actions', titleKey: 'study_card_actions_title', opens: 'study_card_actions' },
    { id: 'handwrite', titleKey: 'study_handwrite', opens: 'study_whiteboard', condition: 'has_card_phase' },
    { id: 'guide', titleKey: 'study_guide_title' }
  ] },
  { id: 'study_whiteboard', titleKey: 'study_handwrite', instructionsKey: 'study_whiteboard_instructions',
    parent: 'study_more', items: WHITEBOARD_INTERFACE_ITEMS },
  { id: 'study_marking', titleKey: 'study_marking_title', parent: 'study_more', items: [
    { id: 'mark', titleKey: 'card_mark_mark', condition: 'has_card_phase' },
    { id: 'flag', titleKey: 'browser_action_set_flag', opens: 'study_flags', condition: 'has_card_phase' },
    { id: 'flag_names', titleKey: 'card_mark_flag_names' }
  ] },
  { id: 'study_flags', titleKey: 'browser_action_set_flag', parent: 'study_marking', items: [
    ...CARD_FLAGS.map((flag): AppInterfaceItem => ({ id: String(flag.value), titleKey: flag.labelKey }))
  ] },
  { id: 'study_card_actions', titleKey: 'study_card_actions_title', parent: 'study_more', items: [
    { id: 'bury', titleKey: 'study_bury' },
    { id: 'suspend', titleKey: 'study_suspend' },
    { id: 'delete', titleKey: 'study_delete_card' },
    { id: 'auto_advance', titleKey: 'study_auto_advance_title' }
  ] }
];

export function visibleInterfaceItems(surfaceId: string, context: AppInterfaceContext): AppInterfaceItem[] {
  const surface = APP_INTERFACE_SURFACES.find((entry: AppInterfaceSurface): boolean => entry.id === surfaceId);
  if (surface === undefined) return [];
  return surface.items.filter((item: AppInterfaceItem): boolean =>
    !(item.fullOnly && context.simple) && !(item.agentOnly && !context.agent) && !(item.cloudOnly && !context.cloudDeck));
}

export interface AppInterfaceObservation {
  surface: string;
  titleKey?: string;
  sectionId: string;
  /** 实际 UI 状态；只传明确登记的状态，凭证、输入中的密钥不进入快照。 */
  selectedId: string;
  optionIds: string[];
  optionLabels: string[];
  optionsTotal?: number;
  busy: boolean;
  items?: AppInterfaceControl[];
  /** 发布者明确列出全部当前声明控件时，未出现的声明项才可判为隐藏。 */
  controlsComplete?: boolean;
  values?: AppInterfaceValue[];
}

export interface AppInterfaceControl {
  id: string;
  title: string;
  titleKey?: string;
  enabled: boolean;
  selected: boolean;
}
export interface AppInterfaceValue { id: string; value: string; }
export interface AppInterfaceMenuItem extends AppInterfaceItem {
  enabled: boolean;
  selected: boolean;
  children?: AppInterfaceMenuItem[];
}
export interface StudyInterfaceContext {
  phase: string; busy: boolean; hasCard: boolean; hasAudio: boolean; canUndo: boolean; agent: boolean; marked?: boolean;
}

export interface AgentInterfaceContext {
  history: boolean; processing: boolean; parsing: boolean; batchRunning: boolean;
  pendingClarification: boolean; canSubmit: boolean;
}

export function agentInterfaceTitle(mode: string, history: boolean): string {
  return history ? 'ai_agent_history_title' : mode === 'assistant' ? 'ai_agent_title' :
    mode === 'create' ? 'ai_card_title' : 'ai_card_edit';
}
export function agentImportLabelKey(parsing: boolean): string {
  return parsing ? 'ai_agent_file_parsing' : 'ai_agent_import_files';
}
export function reminderEditorTitle(creating: boolean): string {
  return creating ? 'reminder_edit_title_create' : 'reminder_edit_title_edit';
}

export function agentInterfaceControls(context: AgentInterfaceContext): AppInterfaceMenuItem[] {
  const surface = APP_INTERFACE_SURFACES.find((entry): boolean => entry.id === 'agent');
  return (surface?.items ?? []).filter((item): boolean => item.condition === undefined ||
    (item.condition === 'history' ? context.history : !context.history))
    .map((item): AppInterfaceMenuItem => ({ id: item.id,
      titleKey: item.id === 'submit' && context.processing ? 'ai_agent_cancel' :
        item.id === 'import' ? agentImportLabelKey(context.parsing) : item.titleKey, opens: item.opens,
      condition: item.condition, selected: false,
      enabled: item.id === 'back' ? true : ['history', 'new'].includes(item.id) ?
        !context.processing && !context.parsing && !context.batchRunning : item.id === 'input' ?
          !context.pendingClarification : item.id === 'import' ?
            !context.processing && !context.parsing && !context.pendingClarification : context.processing || context.canSubmit }));
}

export function reminderEditorControls(creating: boolean, busy: boolean): AppInterfaceMenuItem[] {
  const surface = APP_INTERFACE_SURFACES.find((entry): boolean => entry.id === 'reminder_editor');
  return (surface?.items ?? []).filter((item): boolean => item.id !== 'delete' || !creating)
    .map((item): AppInterfaceMenuItem => ({ id: item.id,
      titleKey: item.id === 'confirm' && !creating ? 'deck_customize_save' : item.titleKey,
      condition: item.condition, selected: false,
      // 占位符标签当前不禁用；观察必须忠实于实际 UI。
      enabled: item.id.startsWith('insert_') || (item.id !== 'time' && !busy) }));
}

export function statsInterfaceSections(fsrs: boolean): AppInterfaceItem[] {
  return STATS_INTERFACE_SECTIONS.filter((item): boolean => item.condition !== 'fsrs' || fsrs)
    .map((item): AppInterfaceItem => ({ id: item.id,
      titleKey: item.id === 'ease' && !fsrs ? 'stats_section_ease_sm2' : item.titleKey,
      opens: 'stats_' + item.id, condition: item.condition }));
}

export interface AddNoteInterfaceContext {
  simple: boolean; tagsExpanded: boolean; occlusion: boolean; hasSource: boolean;
  busy: boolean; blocked: boolean; saveEnabled: boolean; hasTypes: boolean;
}
export function addNoteInterfaceControls(context: AddNoteInterfaceContext): AppInterfaceMenuItem[] {
  return visibleInterfaceItems('add_note', { simple: context.simple, agent: false, cloudDeck: false, themeHasTextures: false })
    .filter((item): boolean => item.id !== 'tags' || context.tagsExpanded)
    .filter((item): boolean => item.id !== 'image' || context.occlusion)
    .filter((item): boolean => item.id !== 'masks' || (context.occlusion && context.hasSource))
    .map((item): AppInterfaceMenuItem => ({ id: item.id, titleKey:
      (item.id === 'save' || item.id === 'save_return') && context.busy ? 'add_note_saving' : item.id === 'image' && context.hasSource ?
        'add_note_image_occlusion_change_image' : item.titleKey,
      opens: item.opens, condition: item.condition, selected: item.id === 'tags_entry' && context.tagsExpanded,
      enabled: item.id === 'save' || item.id === 'save_return' ? context.saveEnabled && !context.blocked :
        !context.blocked && (item.id !== 'type' || context.hasTypes) }));
}

/** 音频弹层发布真实状态；不给 JIDE 暴露字段正文、录音文件或原始错误。 */
export function noteAudioInterfaceObservation(status: NoteAudioStatus): AppInterfaceObservation {
  const surface = APP_INTERFACE_SURFACES.find((entry): boolean => entry.id === 'note_audio_manage');
  const items: AppInterfaceControl[] = (surface?.items ?? [])
    .filter((item): boolean => item.id !== 'add' || !status.recording)
    .filter((item): boolean => item.condition !== 'recording' || status.recording)
    .map((item): AppInterfaceControl => ({ id: item.id, title: '',
      titleKey: item.id === 'record' && status.recording ? 'note_audio_record_done' :
        item.id === 'pause' && status.paused ? 'note_audio_resume' : item.titleKey,
      enabled: !status.working && (item.id === 'close' || item.id === 'apply' ? !status.recording && !status.disabled :
        status.recording || !status.disabled), selected: item.id === 'record' && status.recording }));
  for (const attachment of status.attachments) {
    items.push({ id: attachment.id + '-play', title: '',
      titleKey: attachment.playing ? 'note_audio_stop' : 'note_audio_play',
      enabled: !status.working && !status.disabled, selected: attachment.playing });
    if (attachment.replace) items.push({ id: attachment.id + '-replace', title: '', titleKey: 'note_media_replace',
      enabled: !status.working && !status.disabled && !status.recording, selected: false });
    if (attachment.remove) items.push({ id: attachment.id + '-remove', title: '', titleKey: 'note_audio_remove',
      enabled: !status.working && !status.disabled && !status.recording, selected: false });
  }
  return { surface: 'note_audio_manage', sectionId: status.paused ? 'paused' : status.recording ? 'recording' : 'idle',
    selectedId: '', optionIds: items.map((item): string => item.id), optionLabels: [], optionsTotal: items.length,
    busy: status.working, controlsComplete: items.length <= 100, items: items,
    values: [{ id: 'recording', value: String(status.recording) }, { id: 'paused', value: String(status.paused) },
      { id: 'recorded_seconds', value: String(status.seconds) }, { id: 'has_error', value: String(status.hasError) }] };
}

export function noteEditInterfaceControls(busy: boolean, blocked: boolean, fieldCount: number): AppInterfaceMenuItem[] {
  return visibleInterfaceItems('edit_note_form', { simple: false, agent: false, cloudDeck: false, themeHasTextures: false })
    .map((item): AppInterfaceMenuItem => ({ id: item.id,
      titleKey: item.id === 'save' && busy ? 'browser_detail_saving' : item.titleKey,
      enabled: !blocked && (item.id !== 'save' || fieldCount > 0), selected: false }));
}

/** 实际菜单与 JIDE 读取同一份显隐/禁用判定；动作执行仍由各自页面负责。 */
export function studyInterfaceMenu(context: StudyInterfaceContext, surfaceId: string = 'study_more'): AppInterfaceMenuItem[] {
  const cardPhase: boolean = context.phase === 'question' || context.phase === 'answer';
  const canManage: boolean = cardPhase && context.hasCard && !context.busy;
  return visibleInterfaceItems(surfaceId, { simple: false, agent: context.agent, cloudDeck: false, themeHasTextures: false })
    .filter((item: AppInterfaceItem): boolean => item.condition !== 'has_card_phase' || cardPhase)
    .map((item: AppInterfaceItem): AppInterfaceMenuItem => ({ id: item.id,
      titleKey: item.id === 'mark' && context.marked === true ? 'card_mark_unmark' : item.titleKey, opens: item.opens,
      condition: item.condition, enabled: !context.busy && (item.id === 'audio' ? context.hasAudio && canManage :
        item.id === 'guide' ? context.phase !== 'loading' && !context.busy : item.id === 'undo' ? context.canUndo :
          item.id === 'delete' ? cardPhase : item.id === 'agent' ? context.hasCard : item.id === 'handwrite' ? true : canManage),
      selected: item.id === 'mark' && context.marked === true,
      children: item.opens === 'study_marking' || item.opens === 'study_card_actions' ?
        studyInterfaceMenu(context, item.opens) : undefined }));
}

export function browserInterfaceMenu(available: boolean, filterActive: boolean, subtitleIndex: number): AppInterfaceMenuItem[] {
  return visibleInterfaceItems('browser_more', { simple: false, agent: false, cloudDeck: false, themeHasTextures: false })
    .map((item: AppInterfaceItem): AppInterfaceMenuItem => ({ id: item.id,
      titleKey: item.id === 'filter' && filterActive ? 'browser_filter_active' : item.titleKey, opens: item.opens,
      enabled: item.id.startsWith('subtitle_') || (available && (item.id !== 'save_search' || filterActive)),
      selected: item.id === 'subtitle_deck' ? subtitleIndex === 1 : item.id === 'subtitle_answer' ? subtitleIndex === 4 :
        item.id === 'subtitle_due' && subtitleIndex === 2 }));
}

/** 工具参数从实际共享声明生成，新增已接通界面不再维护第二份 enum。 */
export function appInterfaceSurfaceIds(): string[] {
  return ['app', 'settings'].concat(APP_INTERFACE_SURFACES.map((surface: AppInterfaceSurface): string => surface.id));
}

/** 组件出现时挂载、状态变化时更新、离开时卸载。不是历史截图缓存。 */
export class AppInterfaceTracker {
  private readonly views: Map<string, AppInterfaceObservation> = new Map<string, AppInterfaceObservation>();
  private shownPage: string = '';
  private contextPage: string = '';
  showPage(surface: string): void {
    this.shownPage = surface;
    if (surface !== 'agent') this.contextPage = surface;
  }
  hidePage(surface: string): void { if (this.shownPage === surface) this.shownPage = ''; }
  currentPage(): string { return this.shownPage; }
  /** JIDE 使用最近的非助手页面；hide 保留上下文，真实销毁才移除。 */
  currentContextPage(): string { return this.shownPage === 'agent' ? this.contextPage : this.shownPage; }
  observe(view: AppInterfaceObservation): void {
    this.views.set(view.surface, { surface: view.surface, titleKey: view.titleKey, sectionId: view.sectionId,
      selectedId: view.selectedId, optionIds: view.optionIds.slice(), optionLabels: view.optionLabels.slice(),
      optionsTotal: view.optionsTotal ?? view.optionIds.length, busy: view.busy, controlsComplete: view.controlsComplete,
      items: view.items?.map((item: AppInterfaceControl): AppInterfaceControl => ({ id: item.id, title: item.title, titleKey: item.titleKey, enabled: item.enabled, selected: item.selected })),
      values: view.values?.map((value: AppInterfaceValue): AppInterfaceValue => ({ id: value.id, value: value.value })) });
  }
  leave(surface: string): void {
    this.views.delete(surface);
    if (this.contextPage === surface) this.contextPage = '';
  }
  snapshot(): AppInterfaceObservation[] {
    return Array.from(this.views.values()).map((view: AppInterfaceObservation): AppInterfaceObservation =>
      ({ surface: view.surface, titleKey: view.titleKey, sectionId: view.sectionId, selectedId: view.selectedId,
        optionIds: view.optionIds.slice(), optionLabels: view.optionLabels.slice(), optionsTotal: view.optionsTotal, busy: view.busy, controlsComplete: view.controlsComplete,
        items: view.items?.map((item: AppInterfaceControl): AppInterfaceControl => ({ id: item.id, title: item.title, titleKey: item.titleKey, enabled: item.enabled, selected: item.selected })),
        values: view.values?.map((value: AppInterfaceValue): AppInterfaceValue => ({ id: value.id, value: value.value })) }));
  }
}
