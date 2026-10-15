// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DirectoryView } from './DirectoryTree';
import { FILTERED_DECK_ACTIONS } from './FilteredDeckCommands';
import { DECK_TONE_CHOICES } from './DeckTone';
import { FEEDBACK_ACTIONS } from './InteractionFeedback';
import { CARD_FLAGS } from './CardMarking';
import { IMPORT_RESULT_ACTIONS } from './ImportResults';
import { REVIEW_AUDIO_PREFERENCES } from './ReviewAudioPreferences';
import { STUDY_KEYBOARD_FIELDS } from './StudyKeyboard';
import { STUDY_GESTURE_FIELDS } from './StudyGestureConfig';
import { SETTINGS_GROUPS } from './SettingsStructure';
import { DECK_OPTION_GROUPS } from './DeckOptionsCatalog';
import type { NoteAudioStatus } from './NoteAudioDraft';
import { DRAWING_COLORS, DRAWING_TEXT_HANDLES, noteDrawingImageActionKey } from './NoteDrawing';
import { NOTE_EDITOR_TOOLS, NOTE_EDITOR_COMMON_TOOL_IDS, NOTE_FIELD_EDITING_SUPPORT,
  NOTE_EDITOR_FORMAT_MENUS, noteEditorFormatOptions } from './NoteFieldEditing';
import { noteEditorWheelTools, noteEditorWheelCommonTools, noteEditorWheelOuterTools, NOTE_EDITOR_WHEEL_VISIBLE_COUNT } from './NoteEditorWheel';
import type { NoteEditorWheelState } from './NoteEditorWheel';
export interface AppInterfaceContext {
  simple: boolean;
  agent: boolean;
  cloudDeck: boolean;
  themeHasTextures: boolean;
}
export interface AppInterfaceItem {
  id: string;
  titleKey: string;
  /** 纯图标入口的资源名；完整名称继续由 titleKey 提供。 */
  iconKey?: string;
  opens?: string;
  fullOnly?: boolean;
  agentOnly?: boolean;
  cloudOnly?: boolean;
  sensitive?: boolean;
  condition?: string;
}
export interface AppInterfaceSurface {
  id: string;
  titleKey: string;
  instructionsKey?: string;
  parent: string;
  items: AppInterfaceItem[];
}

/** 类型管理卡片与 JIDE 共用操作名称和图标；实际写入仍由管理会话确认。 */
export const NOTETYPE_MANAGEMENT_ACTIONS: Record<string, AppInterfaceItem> = {
  add: { id: 'add', titleKey: 'notetype_mgmt_add', iconKey: 'ic_home_new' },
  copy: { id: 'copy', titleKey: 'notetype_clone' },
  edit: { id: 'edit', titleKey: 'notetype_mgmt_edit', iconKey: 'ic_study_edit', opens: 'notetype_editor' },
  delete: { id: 'delete', titleKey: 'notetype_mgmt_delete', iconKey: 'ic_study_delete' }
};

export const EMPTY_CARDS_ACTIONS: Record<string, AppInterfaceItem> = {
  refresh: { id: 'refresh', titleKey: 'empty_cards_refresh', iconKey: 'ic_home_sync' },
  select_all: { id: 'select_all', titleKey: 'empty_cards_select_all' },
  deselect_all: { id: 'deselect_all', titleKey: 'empty_cards_deselect_all' },
  delete: { id: 'delete', titleKey: 'empty_cards_delete', iconKey: 'ic_study_delete' }
};

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
  { id: 'close', titleKey: 'study_whiteboard_close', iconKey: 'ic_common_close' },
  { id: 'opacity', titleKey: 'study_whiteboard_opacity', condition: 'official_suite' },
  { id: 'reset_view', titleKey: 'study_whiteboard_reset_view', condition: 'global_navigation' },
  { id: 'official_tools', titleKey: 'study_whiteboard_official_tools', condition: 'official_suite' },
  { id: 'undo', titleKey: 'image_occlusion_undo', iconKey: 'ic_study_undo', condition: 'local_suite' },
  { id: 'redo', titleKey: 'study_whiteboard_redo', iconKey: 'ic_whiteboard_redo', condition: 'local_suite' },
  { id: 'clear', titleKey: 'study_whiteboard_clear', iconKey: 'ic_study_delete', condition: 'local_suite' },
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
  { id: 'settings_close', titleKey: 'close', iconKey: 'ic_common_close', condition: 'tool_settings' },
  { id: 'retry', titleKey: 'study_whiteboard_retry', condition: 'failed' },
  { id: 'show_answer', titleKey: 'study_show_answer', condition: 'question' },
  { id: 'again', titleKey: 'rating_again', condition: 'answer' },
  { id: 'hard', titleKey: 'rating_hard', condition: 'answer' },
  { id: 'good', titleKey: 'rating_good', condition: 'answer' },
  { id: 'easy', titleKey: 'rating_easy', condition: 'answer' }
];

/** 菜单直接遍历这里的条目；标签、顺序和显隐由 UI 与 JIDE 共用。 */
export const APP_INTERFACE_SURFACES: AppInterfaceSurface[] = [
  ...['home', 'study', 'editor', 'template'].map((scope: string): AppInterfaceSurface => ({
    id: scope + '_shortcuts', titleKey: 'keyboard_shortcuts_title', instructionsKey: 'keyboard_scope_hint',
    parent: scope === 'editor' ? 'edit_note_form' : scope === 'template' ? 'notetype_editor' : scope,
    items: [{ id: 'close', titleKey: 'done' }] })),
  { id: 'study_keyboard', titleKey: 'study_keyboard_title', instructionsKey: 'study_keyboard_help', parent: 'settings',
    items: STUDY_KEYBOARD_FIELDS },
  { id: 'study_gestures', titleKey: 'study_gesture_title', instructionsKey: 'study_gesture_help', parent: 'settings',
    items: STUDY_GESTURE_FIELDS.map((item): AppInterfaceItem => ({ id: item.id, titleKey: item.titleKey, fullOnly: true })) },
  { id: 'notetype_editor', titleKey: 'notetype_editor_title', instructionsKey: 'notetype_editor_tokens', parent: 'notetype_management', items: [
    { id: 'fields', titleKey: 'notetype_editor_fields' },
    { id: 'templates', titleKey: 'notetype_editor_templates' },
    { id: 'front', titleKey: 'notetype_editor_front_template' },
    { id: 'back', titleKey: 'notetype_editor_back_template' },
    { id: 'tokens', titleKey: 'notetype_editor_tokens' },
    { id: 'css', titleKey: 'notetype_editor_css' },
    { id: 'keyboard', titleKey: 'keyboard_shortcuts_title', opens: 'template_shortcuts' }
  ] },
  { id: 'notetype_management', titleKey: 'notetype_mgmt_title', parent: 'settings',
    items: Object.values(NOTETYPE_MANAGEMENT_ACTIONS) },
  { id: 'empty_cards', titleKey: 'empty_cards_title', instructionsKey: 'empty_cards_description', parent: 'settings',
    items: Object.values(EMPTY_CARDS_ACTIONS) },
  { id: 'directory_tree', titleKey: 'directory_title', instructionsKey: 'directory_instructions', parent: 'app', items: [
    { id: 'search', titleKey: 'directory_search' },
    { id: 'expand', titleKey: 'directory_expand' },
    { id: 'select', titleKey: 'directory_select' }
  ] },
  { id: 'study_feedback', titleKey: 'feedback_title', parent: 'study', items: FEEDBACK_ACTIONS },
  { id: 'browser_feedback', titleKey: 'feedback_title', parent: 'browser', items: FEEDBACK_ACTIONS },
  { id: 'review_audio', titleKey: 'settings_study_display', parent: 'settings',
    items: REVIEW_AUDIO_PREFERENCES.map((item): AppInterfaceItem => ({ id: item.id, titleKey: item.titleKey })) },
  { id: 'import_results', titleKey: 'transfer_result_title', instructionsKey: 'transfer_result_browse_hint', parent: 'home',
    items: IMPORT_RESULT_ACTIONS.map((item): AppInterfaceItem => ({ id: item.id, titleKey: item.titleKey,
      opens: ['new', 'updated', 'duplicate'].includes(item.id) ? 'browser' : undefined,
      condition: 'import_result_category' })).concat([
      { id: 'previous', titleKey: 'transfer_result_previous' }, { id: 'next', titleKey: 'transfer_result_next' }
    ]) },
  { id: 'note_editor_wheel', titleKey: 'note_editor_wheel_title', instructionsKey: 'note_editor_wheel_instructions',
    parent: 'edit_note_form', items: NOTE_EDITOR_TOOLS.map((tool): AppInterfaceItem => ({ id: tool.id,
      titleKey: tool.titleKey, iconKey: tool.iconKey,
      fullOnly: NOTE_EDITOR_COMMON_TOOL_IDS.indexOf(tool.id) < 0 })).concat([
      { id: 'position', titleKey: 'note_editor_wheel_move_hint', iconKey: 'ic_editor_wheel' }
    ]) },
  { id: 'note_editor_format_options', titleKey: 'note_editor_format_options',
    instructionsKey: 'note_editor_format_options_instructions', parent: 'note_editor_wheel',
    items: NOTE_EDITOR_FORMAT_MENUS.flatMap((menu): AppInterfaceItem[] =>
      menu.options.map((option): AppInterfaceItem => ({ id: menu.toolId + '_' + option.id,
        titleKey: option.titleKey, fullOnly: true, condition: menu.toolId }))) },
  { id: 'home', titleKey: 'home_interface_title', instructionsKey: 'home_actions_instructions', parent: '', items: [
    { id: 'more', titleKey: 'study_more', iconKey: 'ic_home_more', opens: 'home_more' },
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
    { id: 'exit', titleKey: 'deck_reorder_exit', iconKey: 'ic_common_close' },
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
    { id: 'cancel', titleKey: 'create_deck_cancel', iconKey: 'ic_common_close' }
  ] },
  { id: 'deck_details', titleKey: 'home_interface_decks', parent: 'home', items: [
    { id: 'add_note', titleKey: 'deck_add_card', iconKey: 'ic_study_edit', opens: 'add_note' },
    { id: 'agent', titleKey: 'ai_agent_title', iconKey: 'ic_study_agent', opens: 'agent', agentOnly: true },
    { id: 'preview', titleKey: 'deck_preview', iconKey: 'ic_common_preview', opens: 'deck_preview_scope' },
    { id: 'total', titleKey: 'deck_total_cards' },
    { id: 'new', titleKey: 'new_cards' },
    { id: 'learning', titleKey: 'learning_cards' },
    { id: 'review', titleKey: 'review_cards' },
    { id: 'more', titleKey: 'deck_more', iconKey: 'ic_home_more', opens: 'deck_details_more' },
    { id: 'study', titleKey: 'start_study', opens: 'study' }
  ] },
  { id: 'deck_actions', titleKey: 'deck_more', parent: 'deck_details', items: [] },
  { id: 'deck_options', titleKey: 'deck_options_title', parent: 'deck_details', items: [
    { id: 'close', titleKey: 'create_deck_cancel' },
      { id: 'retry', titleKey: 'common_retry', condition: 'error' },
    { id: 'form', titleKey: 'deck_options_title', opens: 'deck_options_form', condition: 'ready' }
  ] },
  { id: 'deck_options_form', titleKey: 'deck_options_title', parent: 'deck_options', items: [
    { id: 'cancel', titleKey: 'create_deck_cancel', iconKey: 'ic_common_close' },
    { id: 'save', titleKey: 'deck_options_save' },
      { id: 'help', titleKey: 'field_help_button' },
    { id: 'newPerDay', titleKey: 'deck_newPerDay_label', condition: 'simple_mode' },
    { id: 'reviewsPerDay', titleKey: 'deck_reviewsPerDay_label', condition: 'simple_mode' },
    { id: 'learnSteps', titleKey: 'deck_learnSteps_label', condition: 'simple_mode' },
    { id: 'reviewOrder', titleKey: 'deck_reviewOrder_label', condition: 'simple_mode' },
    { id: 'preset', titleKey: 'deck_preset_label', fullOnly: true },
    { id: 'save_scope', titleKey: 'deck_scope_label', fullOnly: true },
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
    { id: 'options', titleKey: 'deck_options_title', opens: 'deck_options', condition: 'normal_deck' },
    { id: 'export', titleKey: 'deck_export_this', opens: 'export' },
    ...FILTERED_DECK_ACTIONS.map((item): AppInterfaceItem => ({ id: item.id, titleKey: item.titleKey, condition: 'filtered_deck' }))
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
    { id: 'crop_confirm', titleKey: 'deck_customize_background_crop_confirm' },
    { id: 'crop_cancel', titleKey: 'deck_customize_background_crop_cancel' },
    { id: 'name', titleKey: 'deck_customize_name_label' },
    { id: 'background', titleKey: 'deck_customize_background_label' },
    { id: 'confirm', titleKey: 'deck_customize_save' },
    { id: 'cancel', titleKey: 'cancel' }
  ] },
  { id: 'deck_row_menu', titleKey: 'deck_more', parent: 'home', items: [
    { id: 'stats', titleKey: 'deck_menu_stats', opens: 'stats' },
    { id: 'browser', titleKey: 'browser_title', opens: 'browser' },
    { id: 'tone', titleKey: 'deck_menu_tone_label', opens: 'deck_tones' },
    { id: 'reorder', titleKey: 'deck_menu_reorder', opens: 'deck_reorder' },
    { id: 'rename', titleKey: 'deck_rename_title', opens: 'deck_rename' },
    { id: 'customize', titleKey: 'deck_customize', opens: 'deck_customize' },
    ...FILTERED_DECK_ACTIONS.map((item): AppInterfaceItem => ({ id: item.id, titleKey: item.titleKey, condition: 'filtered_deck' })),
    { id: 'custom_study', titleKey: 'custom_study_menu', opens: 'custom_study', fullOnly: true, condition: 'normal_deck' },
    { id: 'hide', titleKey: 'deck_menu_hide' },
    { id: 'delete', titleKey: 'deck_menu_delete' },
    { id: 'close', titleKey: 'cancel', iconKey: 'ic_common_close' }
  ] },
  { id: 'deck_tones', titleKey: 'deck_menu_tone_label', parent: 'deck_row_menu', items: [
    ...DECK_TONE_CHOICES.map((choice): AppInterfaceItem => ({ id: String(choice.tone), titleKey: choice.titleKey, iconKey: choice.iconKey }))
  ] },
  { id: 'deck_preview_scope', titleKey: 'deck_preview', parent: 'deck_details', items: [
    { id: '0', titleKey: 'deck_preview_remaining', opens: 'preview' },
    { id: '1', titleKey: 'deck_preview_due', opens: 'preview' },
    { id: '2', titleKey: 'deck_preview_studied', opens: 'preview' },
    { id: '3', titleKey: 'deck_preview_all', opens: 'preview' }
  ] },
  { id: 'browser', titleKey: 'browser_title', instructionsKey: 'browser_preferences_instructions', parent: 'home', items: [
    { id: 'back', titleKey: 'study_back', iconKey: 'ic_common_arrow_left' },
    { id: 'search', titleKey: 'browser_search_placeholder' },
    { id: 'mode', titleKey: 'browser_mode_switch', opens: 'browser_view' },
    { id: 'status', titleKey: 'browser_status_all', opens: 'browser_view' },
    { id: 'filter', titleKey: 'browser_action_sidebar', iconKey: 'ic_home_filtered_deck', opens: 'browser_sidebar' },
    { id: 'sort', titleKey: 'browser_sort_title', opens: 'browser_view' },
    { id: 'more', titleKey: 'study_more', iconKey: 'ic_home_more', opens: 'browser_more' },
    { id: 'selection', titleKey: 'browser_selection_actions', iconKey: 'ic_home_more', opens: 'browser_batch' }
  ] },
  { id: 'browser_more', titleKey: 'study_more', parent: 'browser', items: [
    { id: 'filter', titleKey: 'browser_action_sidebar', opens: 'browser_sidebar' },
    { id: 'select_all', titleKey: 'browser_select_all', opens: 'browser_batch' },
    { id: 'find_replace', titleKey: 'browser_action_find_replace', opens: 'browser_find_replace' },
    { id: 'search_tools', titleKey: 'browser_search_tools', opens: 'browser_search_tools' },
    { id: 'display_settings', titleKey: 'browser_display_settings', opens: 'browser_display_settings' },
    { id: 'history', titleKey: 'collection_history_title', opens: 'collection_history' },
    { id: 'more_settings', titleKey: 'study_more', opens: 'browser_more_settings' }
  ] },
  { id: 'browser_search_tools', titleKey: 'browser_search_tools', parent: 'browser_more', items: [
    { id: 'search_options', titleKey: 'browser_search_options', opens: 'browser_search_options' },
    { id: 'recent_searches', titleKey: 'browser_recent_searches', opens: 'browser_recent_searches' },
    { id: 'save_search', titleKey: 'browser_saved_search_save', opens: 'browser_save_search' },
  ] },
  { id: 'browser_display_settings', titleKey: 'browser_display_settings', parent: 'browser_more', items: [
    { id: 'columns', titleKey: 'browser_display_columns', opens: 'browser_display' },
    { id: 'subtitle_deck', titleKey: 'browser_subtitle_deck' },
    { id: 'subtitle_answer', titleKey: 'browser_subtitle_answer' },
    { id: 'subtitle_due', titleKey: 'browser_subtitle_due' }
  ] },
  { id: 'browser_more_settings', titleKey: 'study_more', parent: 'browser_more', items: [
    { id: 'flag_names', titleKey: 'card_mark_flag_names' },
    { id: 'keyboard', titleKey: 'browser_shortcuts', opens: 'browser_shortcuts' }
  ] },
  { id: 'browser_batch', titleKey: 'browser_help_batch_title', parent: 'browser', items: [
    { id: 'select_all', titleKey: 'browser_select_all' },
    { id: 'clear_selection', titleKey: 'browser_clear_selection' },
    { id: 'preview', titleKey: 'browser_preview_selection', opens: 'preview' },
    { id: 'export', titleKey: 'browser_export_selection', opens: 'browser_export' },
    { id: 'grade', titleKey: 'browser_grade_now', opens: 'browser_grade' },
    { id: 'reset', titleKey: 'browser_reset_title', opens: 'browser_reset' },
    { id: 'suspend', titleKey: 'browser_action_toggle_suspend' },
    { id: 'bury', titleKey: 'browser_action_toggle_bury' },
    { id: 'notetype', titleKey: 'browser_action_change_notetype' },
    { id: 'deck', titleKey: 'browser_action_change_deck' },
    { id: 'reposition', titleKey: 'browser_action_reposition', opens: 'browser_reposition' },
    { id: 'due', titleKey: 'browser_action_set_due' },
    { id: 'tags', titleKey: 'tags_batch_title', opens: 'tag_picker' },
    { id: 'marking', titleKey: 'study_marking_title', opens: 'browser_batch_marking' },
    { id: 'agent', titleKey: 'ai_card_edit', agentOnly: true },
    { id: 'help', titleKey: 'browser_help_batch_title' },
    { id: 'exit', titleKey: 'browser_exit_selection' },
    { id: 'delete', titleKey: 'browser_action_delete' }
  ] },
  { id: 'browser_display', titleKey: 'browser_display_columns', parent: 'browser_display_settings', items: [
    { id: 'columns', titleKey: 'browser_display_columns' }, { id: 'up', titleKey: 'browser_column_up' },
    { id: 'down', titleKey: 'browser_column_down' }, { id: 'save', titleKey: 'browser_detail_confirm' }, { id: 'close', titleKey: 'browser_detail_cancel' }
  ] },
  { id: 'browser_find_replace', titleKey: 'browser_action_find_replace', parent: 'browser_more', items: [
    { id: 'target', titleKey: 'browser_find_field' }, { id: 'regex', titleKey: 'browser_find_regex' },
    { id: 'match_case', titleKey: 'browser_find_match_case' }, { id: 'selected', titleKey: 'browser_find_scope_selected' },
    { id: 'results', titleKey: 'browser_find_scope_all' }, { id: 'execute', titleKey: 'browser_find_execute' },
    { id: 'close', titleKey: 'browser_find_cancel' }
  ] },
  { id: 'browser_search_options', titleKey: 'browser_search_options', parent: 'browser_search_tools', items: [
    { id: 'ignore_accents', titleKey: 'browser_ignore_accents' },
    { id: 'builder', titleKey: 'browser_search_builder' }, { id: 'close', titleKey: 'browser_detail_cancel' }
  ] },
  { id: 'browser_recent_searches', titleKey: 'browser_recent_searches', parent: 'browser_search_tools', items: [
    { id: 'recent', titleKey: 'browser_recent_searches' }, { id: 'close', titleKey: 'browser_detail_cancel' }
  ] },
  { id: 'browser_shortcuts', titleKey: 'browser_shortcuts', instructionsKey: 'browser_shortcuts_hint', parent: 'browser_more_settings', items: [
    { id: 'close', titleKey: 'browser_detail_cancel' }
  ] },
  { id: 'browser_editor', titleKey: 'note_editor_edit_title', parent: 'browser', items: [
    { id: 'close', titleKey: 'browser_editor_close' }, { id: 'form', titleKey: 'note_editor_edit_title', opens: 'edit_note_form' }
  ] },
  { id: 'browser_grade', titleKey: 'browser_grade_now', parent: 'browser_batch', items: [
    { id: 'rating', titleKey: 'browser_grade_now' }, { id: 'confirm', titleKey: 'browser_detail_confirm' }, { id: 'close', titleKey: 'browser_detail_cancel' }
  ] },
  { id: 'browser_reposition', titleKey: 'browser_action_reposition', parent: 'browser_batch', items: [
    { id: 'start', titleKey: 'browser_action_reposition_start' }, { id: 'step', titleKey: 'browser_action_reposition_step' },
    { id: 'random', titleKey: 'browser_action_reposition_random' }, { id: 'shift', titleKey: 'browser_action_reposition_shift' },
    { id: 'confirm', titleKey: 'browser_detail_confirm' }, { id: 'close', titleKey: 'browser_detail_cancel' }
  ] },
  { id: 'browser_export', titleKey: 'browser_export_selection', parent: 'browser_batch', items: [
    { id: 'format', titleKey: 'browser_export_text' }, { id: 'media', titleKey: 'browser_export_media' },
    { id: 'scheduling', titleKey: 'browser_export_scheduling' }, { id: 'confirm', titleKey: 'browser_detail_confirm' }, { id: 'close', titleKey: 'browser_detail_cancel' }
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
    { id: 'back', titleKey: 'study_back', iconKey: 'ic_common_arrow_left' },
    { id: 'more', titleKey: 'study_more', iconKey: 'ic_home_more', opens: 'agent_more', condition: 'conversation' },
    { id: 'new', titleKey: 'ai_agent_history_new', iconKey: 'ic_home_new', condition: 'history' },
    { id: 'memory_create', titleKey: 'ai_agent_memory_create', iconKey: 'ic_home_new', opens: 'agent_memory_editor', condition: 'memory' },
    { id: 'input', titleKey: 'ai_card_input_hint', condition: 'conversation' },
    { id: 'import', titleKey: 'ai_agent_import_files', condition: 'conversation' },
    { id: 'submit', titleKey: 'ai_card_send', condition: 'conversation' }
  ] },
  { id: 'agent_more', titleKey: 'study_more', parent: 'agent', items: [
    { id: 'settings', titleKey: 'ai_agent_settings_page_title', iconKey: 'ic_home_settings', opens: 'agent_settings' },
    { id: 'history', titleKey: 'ai_agent_history', iconKey: 'ic_common_history', opens: 'agent_history' }
  ] },
  { id: 'agent_history', titleKey: 'ai_agent_history_title', parent: 'agent', items: [
    { id: 'search', titleKey: 'agent_history_search' },
    { id: 'delete', titleKey: 'ai_agent_history_delete', condition: 'has_conversations' }
  ] },
  { id: 'agent_settings', titleKey: 'ai_agent_settings_page_title', parent: 'agent', items: [
    { id: 'memory', titleKey: 'agent_memory_title', iconKey: 'ic_agent_memory', opens: 'agent_memory' },
    ...(SETTINGS_GROUPS.find((group): boolean => group.id === 'ai')?.items ?? [])
  ] },
  { id: 'agent_history_management', titleKey: 'agent_history_manage', parent: 'agent_settings', items: [
    { id: 'search', titleKey: 'agent_history_search' },
    { id: 'delete', titleKey: 'ai_agent_history_delete', iconKey: 'ic_study_delete' }
  ] },
  { id: 'agent_memory', titleKey: 'agent_memory_title', parent: 'agent_settings', instructionsKey: 'agent_memory_description', items: [
    { id: 'search', titleKey: 'agent_memory_search' }, { id: 'filter', titleKey: 'agent_memory_scope' },
    { id: 'create', titleKey: 'ai_agent_memory_create', iconKey: 'ic_home_new', opens: 'agent_memory_editor' },
    { id: 'edit', titleKey: 'ai_agent_memory_update', iconKey: 'ic_study_edit', opens: 'agent_memory_editor' },
    { id: 'delete', titleKey: 'ai_agent_memory_delete', iconKey: 'ic_study_delete' },
  ] },
  { id: 'agent_memory_editor', titleKey: 'ai_agent_memory_create', parent: 'agent_memory', instructionsKey: 'agent_memory_description', items: [
    { id: 'text', titleKey: 'agent_memory_example' }, { id: 'scope', titleKey: 'agent_memory_scope' },
    { id: 'save', titleKey: 'deck_customize_save' },
    { id: 'cancel', titleKey: 'create_deck_cancel', iconKey: 'ic_common_close' }
  ] },
  { id: 'reminders', titleKey: 'reminder_list_title', parent: 'home_more', items: [
    { id: 'retry', titleKey: 'common_retry', condition: 'error' },
    { id: 'back', titleKey: 'study_back', iconKey: 'ic_common_arrow_left' },
    { id: 'create', titleKey: 'reminder_list_create_button', iconKey: 'ic_home_new', opens: 'reminder_editor' }
  ] },
  { id: 'reminder_editor', titleKey: 'reminder_edit_title_create', parent: 'reminders', items: [
    { id: 'cancel', titleKey: 'create_deck_cancel', iconKey: 'ic_common_close' },
    { id: 'confirm', titleKey: 'create_deck_confirm' },
    { id: 'time', titleKey: 'reminder_edit_time_label' },
    { id: 'title', titleKey: 'reminder_edit_notification_title' },
    { id: 'content', titleKey: 'reminder_edit_notification_content' },
    { id: 'insert_new', titleKey: 'reminder_edit_insert_new' },
    { id: 'insert_review', titleKey: 'reminder_edit_insert_review' },
    { id: 'delete', titleKey: 'reminder_edit_delete', condition: 'editing' }
  ] },
  { id: 'stats', titleKey: 'stats_page_title', parent: 'home_more', items: [
    { id: 'retry', titleKey: 'common_retry', condition: 'error' },
    { id: 'back', titleKey: 'study_back', iconKey: 'ic_common_arrow_left' },
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
    { id: 'back', titleKey: 'study_back', iconKey: 'ic_common_arrow_left' }, { id: 'save', titleKey: 'add_note_save_continue' },
    { id: 'save_return', titleKey: 'add_note_save_return' },
    { id: 'keyboard', titleKey: 'keyboard_shortcuts_title', opens: 'editor_shortcuts' },
    { id: 'deck', titleKey: 'add_note_deck', opens: 'add_note_decks' },
    { id: 'type', titleKey: 'add_note_notetype', opens: 'add_note_types' },
    { id: 'templates', titleKey: 'notetype_editor_templates', iconKey: 'ic_settings_layout', opens: 'notetype_editor' },
    { id: 'tags_entry', titleKey: 'add_note_tags' },
    { id: 'tags', titleKey: 'add_note_tags', opens: 'tag_picker', condition: 'tags_expanded' },
    { id: 'image', titleKey: 'add_note_image_occlusion_pick_image', condition: 'image_occlusion' },
    { id: 'masks', titleKey: 'add_note_image_occlusion_edit_masks', condition: 'image_source' }
  ] },
  { id: 'add_note_types', titleKey: 'add_note_notetype', parent: 'add_note', items: [] },
  { id: 'add_note_decks', titleKey: 'add_note_deck', parent: 'add_note', items: [] },
  { id: 'edit_note', titleKey: 'note_editor_edit_title', parent: 'browser', items: [
    { id: 'back', titleKey: 'study_back', iconKey: 'ic_common_arrow_left', condition: 'no_form' },
    { id: 'save', titleKey: 'browser_detail_save', condition: 'no_form' },
    { id: 'retry', titleKey: 'note_editor_retry', condition: 'load_failed' },
    { id: 'form', titleKey: 'note_editor_edit_title', opens: 'edit_note_form', condition: 'loaded' }
  ] },
  { id: 'edit_note_form', titleKey: 'note_editor_edit_title', instructionsKey: 'note_editor_format_action', parent: 'edit_note', items: [
    { id: 'back', titleKey: 'study_back', iconKey: 'ic_common_arrow_left' }, { id: 'save', titleKey: 'browser_detail_save' },
    { id: 'tags', titleKey: 'browser_detail_tags', opens: 'tag_picker' },
    { id: 'deck', titleKey: 'add_note_deck' },
    { id: 'notetype', titleKey: 'add_note_notetype' },
    { id: 'templates', titleKey: 'notetype_editor_templates', opens: 'notetype_editor' },
    { id: 'keyboard', titleKey: 'keyboard_shortcuts_title', opens: 'editor_shortcuts' }
  ] },
  { id: 'note_visual_manage', titleKey: 'note_visual_manage', instructionsKey: 'note_visual_instructions', parent: '', items: [
    { id: 'close', titleKey: 'cancel' }, { id: 'apply', titleKey: 'done' },
    { id: 'add', titleKey: 'note_visual_add', iconKey: 'ic_editor_image' },
    { id: 'drawing', titleKey: 'note_drawing_new', iconKey: 'ic_study_edit', opens: 'note_drawing_editor' }
  ] },
  { id: 'note_drawing_editor', titleKey: 'note_drawing_title', instructionsKey: 'note_drawing_instructions', parent: 'note_visual_manage', items: [
    { id: 'close', titleKey: 'cancel' }, { id: 'apply', titleKey: 'done' },
    { id: 'ink', titleKey: 'note_drawing_ink' }, { id: 'text', titleKey: 'note_drawing_text' },
    { id: 'import', titleKey: 'note_drawing_add_image', iconKey: 'ic_editor_image' },
    { id: 'text_input', titleKey: 'note_drawing_text_hint', condition: 'text' },
    { id: 'color', titleKey: 'note_drawing_color', condition: 'drawing_color' },
    { id: 'resize_text', titleKey: 'note_drawing_resize_text', condition: 'selected_text' },
    { id: 'add_text', titleKey: 'note_drawing_add_text', condition: 'text' },
    { id: 'delete_text', titleKey: 'note_drawing_delete_text', condition: 'text' },
    { id: 'eraser', titleKey: 'study_whiteboard_eraser', condition: 'local_ink' },
    { id: 'undo', titleKey: 'note_drawing_undo', condition: 'local_ink' },
    { id: 'redo', titleKey: 'note_drawing_redo', condition: 'local_ink' },
    { id: 'canvas_size', titleKey: 'note_drawing_canvas_size', condition: 'new_canvas' }
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
    { id: 'back', titleKey: 'study_back', iconKey: 'ic_common_arrow_left' },
    { id: 'more', titleKey: 'study_more', iconKey: 'ic_home_more', opens: 'study_more' },
    { id: 'show_answer', titleKey: 'study_show_answer', condition: 'question' },
    { id: 'again', titleKey: 'rating_again', condition: 'answer' },
    { id: 'hard', titleKey: 'rating_hard', condition: 'answer' },
    { id: 'good', titleKey: 'rating_good', condition: 'answer' },
    { id: 'easy', titleKey: 'rating_easy', condition: 'answer' }
  ] },
  { id: 'custom_scheduling_warning', titleKey: 'custom_scheduling_title', instructionsKey: 'custom_scheduling_hint', parent: 'study', items: [
    { id: 'exit', titleKey: 'custom_scheduling_exit', iconKey: 'ic_common_close' }, { id: 'continue', titleKey: 'custom_scheduling_continue' }
  ] },
  { id: 'study_more', titleKey: 'study_more', parent: 'study', items: [
    { id: 'edit', titleKey: 'study_edit_note', opens: 'edit_note' },
    { id: 'agent', titleKey: 'ai_card_edit', opens: 'agent', agentOnly: true, condition: 'has_card_phase' },
    { id: 'undo', titleKey: 'study_undo' },
    { id: 'marking', titleKey: 'study_marking_title', opens: 'study_marking' },
    { id: 'audio', titleKey: 'study_replay_sound' },
    { id: 'card_actions', titleKey: 'study_card_actions_title', opens: 'study_card_actions' },
    { id: 'handwrite', titleKey: 'study_handwrite', opens: 'study_whiteboard', condition: 'has_card_phase' },
    { id: 'keyboard', titleKey: 'keyboard_shortcuts_title', opens: 'study_shortcuts' },
    { id: 'guide', titleKey: 'study_guide_title' }
  ] },
  { id: 'study_voice', titleKey: 'keyboard_voice_title', instructionsKey: 'keyboard_voice_hint', parent: 'study', items: [
    { id: 'record', titleKey: 'note_audio_record' }, { id: 'replay', titleKey: 'note_audio_play' },
    { id: 'save', titleKey: 'keyboard_voice_save' }, { id: 'close', titleKey: 'done' }
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

/** 普通牌组预设不适用于筛选牌组；筛选配置使用 JIDE 提案，菜单提供维护操作。 */
export function deckDetailsMoreItems(agent: boolean, filtered: boolean): AppInterfaceItem[] {
  return visibleInterfaceItems('deck_details_more', { simple: false, agent, cloudDeck: false, themeHasTextures: false })
    .filter((item: AppInterfaceItem): boolean => item.condition === 'filtered_deck' ? filtered :
      item.condition === 'normal_deck' ? !filtered : true);
}

export function deckRowMenuItems(simple: boolean, filtered: boolean): AppInterfaceItem[] {
  return visibleInterfaceItems('deck_row_menu', { simple, agent: false, cloudDeck: false, themeHasTextures: false })
    .filter((item: AppInterfaceItem): boolean => item.id !== 'close' &&
      (item.condition === 'filtered_deck' ? filtered : item.condition === 'normal_deck' ? !filtered : true));
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
  iconKey?: string;
  enabled: boolean;
  selected: boolean;
}
export interface AppInterfaceValue { id: string; value: string; }

/** 同一左侧入口在多选态退出选择，普通态返回上一页；UI 与实时认知共用。 */
export function browserBackItem(multiSelect: boolean): AppInterfaceItem {
  return { id: 'back', titleKey: multiSelect ? 'browser_exit_selection' : 'study_back',
    iconKey: multiSelect ? 'ic_common_close' : 'ic_common_arrow_left' };
}

/** 浏览顶栏的真实入口同时供 UI 标签、图标和实时认知使用。 */
export function browserToolbarItems(multiSelect: boolean, filterActive: boolean): AppInterfaceItem[] {
  const items: AppInterfaceItem[] = APP_INTERFACE_SURFACES.find((surface: AppInterfaceSurface): boolean =>
    surface.id === 'browser')?.items ?? [];
  return items.filter((item: AppInterfaceItem): boolean => multiSelect ? item.id !== 'more' : item.id !== 'selection')
    .map((item: AppInterfaceItem): AppInterfaceItem => item.id === 'back' ? browserBackItem(multiSelect) : {
      id: item.id, titleKey: item.id === 'filter' && filterActive ? 'browser_filter_active' : item.titleKey,
      iconKey: item.iconKey, opens: item.opens });
}

export const SETTINGS_HEADER_ITEMS: AppInterfaceItem[] = [
  { id: 'back', titleKey: 'study_back', iconKey: 'ic_common_arrow_left' },
  { id: 'simple', titleKey: 'settings_simple_mode_simple', iconKey: 'ic_mode_simple' },
  { id: 'full', titleKey: 'settings_simple_mode_full', iconKey: 'ic_mode_experimental' }
];

export function settingsHeaderItems(simple: boolean): AppInterfaceItem[] {
  return SETTINGS_HEADER_ITEMS.filter((item): boolean => item.id === 'back' || item.id === (simple ? 'simple' : 'full'))
    .map((item): AppInterfaceItem => ({ id: item.id === 'back' ? 'back' : 'mode', titleKey: item.titleKey, iconKey: item.iconKey }));
}

/** 设置壳和 JIDE 使用同一个当前模式入口，菜单内名称仍由原模式选择器展示。 */
export function settingsHeaderControls(simple: boolean, menuOpen: boolean): AppInterfaceControl[] {
  return settingsHeaderItems(simple).map((item): AppInterfaceControl => ({ id: item.id, title: '',
    titleKey: item.titleKey, iconKey: item.iconKey, enabled: true, selected: item.id === 'mode' && menuOpen }));
}
export interface AppInterfaceMenuItem extends AppInterfaceItem {
  enabled: boolean;
  selected: boolean;
  children?: AppInterfaceMenuItem[];
}
export interface StudyInterfaceContext {
  phase: string; busy: boolean; hasCard: boolean; hasAudio: boolean; canUndo: boolean; agent: boolean; marked?: boolean;
}

export interface AgentInterfaceContext {
  settings?: boolean;
  settingsBusy?: boolean;
  memory?: boolean;
  memoryCanCreate?: boolean;
  history: boolean; processing: boolean; parsing: boolean; batchRunning: boolean;
  pendingClarification: boolean; canSubmit: boolean;
}

export function agentInterfaceTitle(mode: string, history: boolean, memory: boolean = false, settings: boolean = false): string {
  if (memory) return 'agent_memory_title';
  if (settings) return 'ai_agent_settings_page_title';
  return history ? 'ai_agent_history_title' : mode === 'assistant' ? 'ai_agent_title' :
    mode === 'create' ? 'ai_card_title' : 'ai_card_edit';
}
export function agentImportLabelKey(parsing: boolean): string {
  return parsing ? 'ai_agent_file_parsing' : 'ai_agent_import_files';
}

/** 两个输入动作按全部可见文案共同测宽，解析和取消切换不挤动输入框。 */
export function agentComposerLabelKeys(): string[] {
  return [agentImportLabelKey(false), agentImportLabelKey(true), 'ai_card_send', 'ai_agent_cancel'];
}
export function reminderEditorTitle(creating: boolean): string {
  return creating ? 'reminder_edit_title_create' : 'reminder_edit_title_edit';
}

export function agentInterfaceControls(context: AgentInterfaceContext): AppInterfaceMenuItem[] {
  const surface = APP_INTERFACE_SURFACES.find((entry): boolean => entry.id === 'agent');
  return (surface?.items ?? []).filter((item): boolean => item.condition === undefined ||
    (item.condition === 'memory' ? context.memory === true :
      !context.memory && !context.settings && (item.condition === 'conversation_or_history' ||
        (item.condition === 'history' ? context.history : !context.history))))
    .map((item): AppInterfaceMenuItem => ({ id: item.id,
      titleKey: item.id === 'submit' && context.processing ? 'ai_agent_cancel' :
        item.id === 'import' ? agentImportLabelKey(context.parsing) : item.titleKey, opens: item.opens,
      condition: item.condition, selected: false,
      enabled: item.id === 'back' ? !context.settingsBusy : item.id === 'memory_create' ? context.memoryCanCreate === true : ['more', 'new'].includes(item.id) ?
        !context.processing && !context.parsing && !context.batchRunning : item.id === 'input' ?
          !context.pendingClarification : item.id === 'import' ?
            !context.processing && !context.parsing && !context.pendingClarification : context.processing || context.canSubmit }));
}

/** 表单只发布非敏感状态；密钥和自定义 URL 不进入界面观察。 */
export interface AgentWebSettingsState {
  ready: boolean; busy: boolean; dirty: boolean; webEnabled: boolean; searchProvider: string;
}
export interface AgentSettingsInterfaceContext {
  provider: string; ready: boolean; busy: boolean; web: AgentWebSettingsState;
  historyReady?: boolean;
}
export function agentSettingsControls(context: AgentSettingsInterfaceContext): AppInterfaceControl[] {
  const surface = APP_INTERFACE_SURFACES.find((entry): boolean => entry.id === 'agent_settings');
  return (surface?.items ?? []).filter((item): boolean => item.condition === undefined ||
    (item.condition === 'custom_provider' ? context.provider === 'custom' :
      item.condition === 'builtin_provider' ? context.provider !== 'custom' :
        item.condition === 'web_enabled' && context.web.webEnabled))
    .map((item): AppInterfaceControl => ({ id: item.id, title: '', titleKey: item.titleKey, iconKey: item.iconKey,
      enabled: item.id.startsWith('history_') ? context.historyReady === true && !context.busy && !context.web.busy :
        item.id === 'memory' ? !context.busy && !context.web.busy : item.id.startsWith('ai_web_') ?
        context.web.ready && !context.busy && !context.web.busy : context.ready && !context.busy && !context.web.busy,
      selected: item.id === 'ai_web_enabled' && context.web.webEnabled }));
}

export function reminderEditorControls(creating: boolean, busy: boolean): AppInterfaceMenuItem[] {
  const surface = APP_INTERFACE_SURFACES.find((entry): boolean => entry.id === 'reminder_editor');
  return (surface?.items ?? []).filter((item): boolean => item.id !== 'delete' || !creating)
    .map((item): AppInterfaceMenuItem => ({ id: item.id,
      titleKey: item.id === 'confirm' && !creating ? 'deck_customize_save' : item.titleKey,
      condition: item.condition, selected: false,
      enabled: item.id !== 'time' && !busy }));
}

export function statsInterfaceSections(fsrs: boolean): AppInterfaceItem[] {
  return STATS_INTERFACE_SECTIONS.filter((item): boolean => item.condition !== 'fsrs' || fsrs)
    .map((item): AppInterfaceItem => ({ id: item.id,
      titleKey: item.id === 'ease' && !fsrs ? 'stats_section_ease_sm2' : item.titleKey,
      opens: 'stats_' + item.id, condition: item.condition }));
}

export interface AddNoteInterfaceContext {
  tagsExpanded: boolean; occlusion: boolean; hasSource: boolean;
  busy: boolean; blocked: boolean; saveEnabled: boolean; hasTypes: boolean;
}
export function addNoteInterfaceControls(context: AddNoteInterfaceContext): AppInterfaceMenuItem[] {
  return visibleInterfaceItems('add_note', { simple: false, agent: false, cloudDeck: false, themeHasTextures: false })
    .filter((item): boolean => item.id !== 'tags' || context.tagsExpanded)
    .filter((item): boolean => item.id !== 'image' || context.occlusion)
    .filter((item): boolean => item.id !== 'masks' || (context.occlusion && context.hasSource))
    .map((item): AppInterfaceMenuItem => ({ id: item.id, titleKey:
      (item.id === 'save' || item.id === 'save_return') && context.busy ? 'add_note_saving' : item.id === 'image' && context.hasSource ?
        'add_note_image_occlusion_change_image' : item.titleKey,
      opens: item.opens, condition: item.condition, selected: item.id === 'tags_entry' && context.tagsExpanded,
      enabled: item.id === 'save' || item.id === 'save_return' ? context.saveEnabled && !context.blocked :
        !context.blocked && (!['type', 'templates'].includes(item.id) || context.hasTypes) }));
}

export interface NoteVisualStatus { working: boolean; hasError: boolean; kinds: string[]; }

/** 只发布附件类型和实际操作状态，不暴露字段正文、文件名和 URI。 */
export function noteVisualInterfaceObservation(status: NoteVisualStatus): AppInterfaceObservation {
  const surface = APP_INTERFACE_SURFACES.find((entry): boolean => entry.id === 'note_visual_manage');
  const items: AppInterfaceControl[] = (surface?.items ?? []).map((item): AppInterfaceControl =>
    ({ id: item.id, title: '', titleKey: item.titleKey, iconKey: item.iconKey, enabled: !status.working, selected: false }));
  for (let index: number = 0; index < Math.min(status.kinds.length, 100); index++) {
    items.push({ id: 'attachment-' + index + '-replace', title: '', titleKey: 'note_media_replace',
      enabled: !status.working, selected: false });
    items.push({ id: 'attachment-' + index + '-remove', title: '', titleKey: 'note_visual_remove',
      enabled: !status.working, selected: false });
    if (status.kinds[index] === 'image') items.push({ id: 'attachment-' + index + '-edit', title: '',
      titleKey: 'note_drawing_edit', iconKey: 'ic_study_edit', enabled: !status.working, selected: false });
  }
  return { surface: 'note_visual_manage', sectionId: '', selectedId: '', optionIds: [], optionLabels: [],
    optionsTotal: status.kinds.length, busy: status.working, items: items,
    controlsComplete: status.kinds.length <= 100 && status.kinds.indexOf('video') < 0,
    values: [{ id: 'image_count', value: String(status.kinds.filter((kind: string): boolean => kind === 'image').length) },
      { id: 'video_count', value: String(status.kinds.filter((kind: string): boolean => kind === 'video').length) },
      { id: 'has_error', value: String(status.hasError) }, { id: 'video_playback', value: 'native_controls_not_observed' }] };
}

export interface NoteDrawingStatus {
  working: boolean; ready: boolean; official: boolean; textMode: boolean; textCount: number;
  selectedText: boolean; hasError: boolean; canUndo: boolean; canRedo: boolean;
  newCanvas?: boolean; eraser?: boolean; color?: string; size?: number; canAddText?: boolean;
  width?: number; height?: number;
  failed?: boolean;
  textTransforming?: boolean;
  colorLabels?: string[];
  hasBackground?: boolean;
}
export function noteDrawingInterfaceObservation(status: NoteDrawingStatus): AppInterfaceObservation {
  const surface = APP_INTERFACE_SURFACES.find((entry): boolean => entry.id === 'note_drawing_editor');
  const items: AppInterfaceControl[] = (surface?.items ?? [])
    .filter((item): boolean => item.condition !== 'text' || status.textMode)
    .filter((item): boolean => item.condition !== 'selected_text' || (status.textMode && status.selectedText))
    .filter((item): boolean => item.condition !== 'drawing_color' || status.textMode || !status.official)
    .filter((item): boolean => item.condition !== 'local_ink' || (!status.official && !status.textMode))
    .filter((item): boolean => item.condition !== 'new_canvas' || status.newCanvas === true)
    .map((item): AppInterfaceControl => ({ id: item.id, title: '',
      titleKey: item.id === 'import' ? noteDrawingImageActionKey(status.hasBackground === true) : item.titleKey, iconKey: item.iconKey,
      enabled: !status.working && (item.id === 'close' || (status.ready && status.failed !== true && status.textTransforming !== true &&
        (item.id !== 'delete_text' || status.selectedText) && (item.id !== 'add_text' || status.canAddText === true) &&
        (item.id !== 'undo' || status.canUndo) && (item.id !== 'redo' || status.canRedo))),
      selected: item.id === 'ink' ? !status.textMode : item.id === 'text' ? status.textMode : item.id === 'eraser' && status.eraser === true }));
  const showColors: boolean = status.textMode || !status.official;
  return { surface: 'note_drawing_editor', sectionId: status.textMode ? 'text' : 'ink', selectedId: showColors ? status.color ?? '' : '',
    optionIds: showColors ? DRAWING_COLORS.slice() : [], optionLabels: showColors ? status.colorLabels ?? [] : [],
    optionsTotal: showColors ? DRAWING_COLORS.length : 0, busy: status.working, items: items,
    controlsComplete: false,
    values: [{ id: 'engine', value: status.official ? 'huawei_pen_kit' : 'local_canvas' },
      { id: 'ready', value: String(status.ready) }, { id: 'selected_text', value: String(status.selectedText) },
      { id: 'canvas_size', value: `${status.width ?? 1200} × ${status.height ?? 900}` },
      { id: 'text_count', value: String(status.textCount) }, { id: 'has_error', value: String(status.hasError) },
      { id: 'text_size', value: String(status.size ?? 36) }, { id: 'color', value: status.color ?? '' },
      { id: 'text_transform', value: status.textMode && status.selectedText ? 'move_resize' : 'none' },
      { id: 'text_resize_handles', value: status.textMode && status.selectedText ?
        DRAWING_TEXT_HANDLES.map((handle): string => handle.id).join(',') : '' },
      { id: 'text_selection_bounds', value: 'glyph' },
      { id: 'text_transforming', value: String(status.textTransforming === true) },
      { id: 'content_access', value: 'not_exposed' }] };
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

export function noteEditorFormatObservation(toolId: string, fieldName: string, source: boolean,
  selectedId: string = '', placement: string = 'dialog'): AppInterfaceObservation {
  const items: AppInterfaceControl[] = noteEditorFormatOptions(toolId).map((option): AppInterfaceControl =>
    ({ id: toolId + '_' + option.id, title: '', titleKey: option.titleKey, enabled: true, selected: option.id === selectedId }));
  return { surface: 'note_editor_format_options', sectionId: toolId, selectedId: selectedId === '' ? '' : toolId + '_' + selectedId,
    optionIds: items.map((item): string => item.id), optionLabels: [], optionsTotal: items.length,
    busy: false, controlsComplete: true, items: items,
    values: [{ id: 'target_field', value: fieldName }, { id: 'source', value: String(source) },
      { id: 'placement', value: placement }] };
}

export function noteEditorWheelObservation(state: NoteEditorWheelState, selectedId: string, side: string,
  collapsed: boolean, grip: string, centeredId: string = ''): AppInterfaceObservation {
  const items: AppInterfaceControl[] = noteEditorWheelTools(state).map((tool): AppInterfaceControl =>
    ({ id: tool.id, title: '', titleKey: tool.titleKey, iconKey: tool.iconKey, enabled: !collapsed, selected: tool.active }));
  items.push({ id: 'position', title: '', titleKey: collapsed ? 'note_editor_wheel_open' : 'note_editor_wheel_close',
    iconKey: (side === 'right') !== collapsed ? 'ic_common_arrow_right' : 'ic_common_arrow_left', enabled: true, selected: false });
  return { surface: 'note_editor_wheel', sectionId: collapsed ? 'collapsed' : 'open', selectedId: selectedId,
    optionIds: items.map((item): string => item.id), optionLabels: [], optionsTotal: items.length,
    busy: false, controlsComplete: true, items: items,
    values: [{ id: 'side', value: side }, { id: 'grip_availability', value: grip },
      { id: 'source', value: String(state.source) }, { id: 'target_field', value: state.fieldName ?? '' },
      { id: 'input_expanded', value: String(state.expanded) },
      { id: 'cloze_enabled', value: String(state.cloze) },
      { id: 'visible_tools', value: collapsed ? '0' : String(noteEditorWheelCommonTools(state).length +
        Math.min(NOTE_EDITOR_WHEEL_VISIBLE_COUNT, noteEditorWheelOuterTools(state).length)) },
      { id: 'inner_tools', value: noteEditorWheelCommonTools(state).map((tool): string => tool.id).join(',') },
      { id: 'centered_outer_tool', value: centeredId }, { id: 'activation', value: 'click_only_rotation_preserves_multiple_selection' },
      { id: 'math_long_press', value: 'choose_block_or_chemistry' },
      { id: 'folding_selection', value: 'collapse_preserves_formats_reopen_resets_formats' },
      { id: 'one_shot_feedback', value: NOTE_FIELD_EDITING_SUPPORT.toolMenu.oneShotFeedback },
      { id: 'one_shot_flash_ms', value: String(NOTE_FIELD_EDITING_SUPPORT.toolMenu.oneShotFlashMs) },
      { id: 'labels', value: 'below_each_icon' }] };
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

export function browserInterfaceMenu(available: boolean, filterActive: boolean, subtitleIndex: number,
  surface: string = 'browser_more'): AppInterfaceMenuItem[] {
  return visibleInterfaceItems(surface, { simple: false, agent: false, cloudDeck: false, themeHasTextures: false })
    .map((item: AppInterfaceItem): AppInterfaceMenuItem => ({ id: item.id,
      titleKey: item.id === 'filter' && filterActive ? 'browser_filter_active' : item.titleKey, opens: item.opens,
      enabled: item.id === 'display_settings' || item.id.startsWith('subtitle_') || (available && (item.id !== 'save_search' || filterActive)),
      selected: item.id === 'subtitle_deck' ? subtitleIndex === 1 : item.id === 'subtitle_answer' ? subtitleIndex === 4 :
        item.id === 'subtitle_due' && subtitleIndex === 2,
      children: ['search_tools', 'display_settings', 'more_settings'].includes(item.id) ?
        browserInterfaceMenu(available, filterActive, subtitleIndex, item.opens) : undefined }));
}

/** 工具参数从实际共享声明生成，新增已接通界面不再维护第二份 enum。 */
export function appInterfaceSurfaceIds(): string[] {
  return ['app', 'settings'].concat(APP_INTERFACE_SURFACES.map((surface: AppInterfaceSurface): string => surface.id));
}

/** 组件出现时挂载、状态变化时更新、离开时卸载。不是历史截图缓存。 */
export class AppInterfaceTracker {
  private readonly views: Map<string, AppInterfaceObservation> = new Map<string, AppInterfaceObservation>();
  private readonly viewVersions: Map<string, number> = new Map<string, number>();
  private nextViewVersion: number = 0;
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
  /** 宿主传入公共组件的真实视图；这里只观察，不增加 JIDE 写入权限。 */
  observeDirectory(owner: string, view: DirectoryView | null): void {
    const key: string = 'directory_tree:' + owner;
    if (view === null) {
      this.leave(key);
      return;
    }
    const controls: AppInterfaceControl[] = [];
    if (view.searchable) controls.push({ id: 'search', title: '', titleKey: 'directory_search',
      enabled: view.interactive, selected: view.query !== '' });
    if (view.hasBranches) controls.push({ id: 'expand', title: '', titleKey: 'directory_expand',
      enabled: view.interactive && view.query.trim() === '', selected: false });
    if (view.total > 0) controls.push({ id: 'select', title: '', titleKey: 'directory_select',
      enabled: view.interactive && view.selectable.some((value: boolean): boolean => value), selected: false });
    this.storeObservation(key, { surface: 'directory_tree', sectionId: owner, selectedId: '',
      optionIds: view.ids, optionLabels: view.paths, optionsTotal: view.total, busy: !view.interactive,
      controlsComplete: true, items: controls,
      values: [{ id: 'query', value: view.query }, { id: 'mode', value: view.mode },
        { id: 'expanded_ids', value: JSON.stringify(view.expandedIds) },
        { id: 'selection_states', value: JSON.stringify(view.selections) },
        { id: 'selectable', value: JSON.stringify(view.selectable) }] });
  }
  observe(view: AppInterfaceObservation): number {
    return this.storeObservation(view.surface, view);
  }
  private storeObservation(key: string, view: AppInterfaceObservation): number {
    const version: number = ++this.nextViewVersion;
    this.viewVersions.set(key, version);
    this.views.set(key, { surface: view.surface, titleKey: view.titleKey, sectionId: view.sectionId,
      selectedId: view.selectedId, optionIds: view.optionIds.slice(), optionLabels: view.optionLabels.slice(),
      optionsTotal: view.optionsTotal ?? view.optionIds.length, busy: view.busy, controlsComplete: view.controlsComplete,
      items: view.items?.map((item: AppInterfaceControl): AppInterfaceControl => ({ id: item.id, title: item.title, titleKey: item.titleKey,
        iconKey: item.iconKey, enabled: item.enabled, selected: item.selected })),
      values: view.values?.map((value: AppInterfaceValue): AppInterfaceValue => ({ id: value.id, value: value.value })) });
    return version;
  }
  leave(surface: string, version?: number): void {
    if (version !== undefined && version !== this.viewVersions.get(surface)) return;
    this.views.delete(surface);
    this.viewVersions.delete(surface);
    if (this.contextPage === surface) this.contextPage = '';
  }
  snapshot(): AppInterfaceObservation[] {
    return Array.from(this.views.values()).map((view: AppInterfaceObservation): AppInterfaceObservation =>
      ({ surface: view.surface, titleKey: view.titleKey, sectionId: view.sectionId, selectedId: view.selectedId,
        optionIds: view.optionIds.slice(), optionLabels: view.optionLabels.slice(), optionsTotal: view.optionsTotal, busy: view.busy, controlsComplete: view.controlsComplete,
        items: view.items?.map((item: AppInterfaceControl): AppInterfaceControl => ({ id: item.id, title: item.title, titleKey: item.titleKey,
          iconKey: item.iconKey, enabled: item.enabled, selected: item.selected })),
        values: view.values?.map((value: AppInterfaceValue): AppInterfaceValue => ({ id: value.id, value: value.value })) }));
  }
}
