import { STUDY_KEYBOARD_ACTIONS, studyChordLabel } from './StudyKeyboard';
import type { StudyKeyBinding } from './StudyKeyboard';
import { NOTE_FIELD_SHORTCUTS } from './NoteFieldEditing';
import { BROWSER_SHORTCUTS } from './BrowserKeyboard';
import type { BrowserShortcut } from './BrowserKeyboard';
import { defaultStudyControls, effectiveStudyKeyboard, validateStudyControls } from './StudyControls';
import type { StudyControls } from './StudyControls';
// SPDX-License-Identifier: AGPL-3.0-or-later
/** 默认键位与页面指引共用；具体操作仍由原页面/会话执行。 */
export const FIELD_SHORTCUTS = NOTE_FIELD_SHORTCUTS;
export interface KeyboardShortcut { command: string; keys: string; titleKey: string; }
export interface KeyboardHelpTopic {
  id: string;
  titleKey: string;
  hintKey: string;
}
export interface KeyboardHelpSection extends KeyboardHelpTopic { shortcuts: KeyboardShortcut[]; }
export const KEYBOARD_HELP_SECTIONS: KeyboardHelpTopic[] = [
  { id: 'home', titleKey: 'keyboard_help_home', hintKey: 'keyboard_home_scope_hint' },
  { id: 'study', titleKey: 'keyboard_help_study', hintKey: 'keyboard_study_scope_hint' },
  { id: 'browser', titleKey: 'keyboard_help_browser', hintKey: 'browser_shortcuts_hint' },
  { id: 'editor', titleKey: 'keyboard_help_editor', hintKey: 'keyboard_scope_hint' },
  { id: 'template', titleKey: 'keyboard_help_template', hintKey: 'keyboard_scope_hint' }
];
export const HOME_SHORTCUTS: KeyboardShortcut[] = [
  { command: 'add', keys: 'A', titleKey: 'add_note_title' },
  { command: 'browse', keys: 'B', titleKey: 'browser_title' },
  { command: 'sync', keys: 'Y', titleKey: 'sync_now' },
  { command: 'study', keys: 'S', titleKey: 'start_study' },
  { command: 'stats', keys: 'T', titleKey: 'stats_page_title' },
  { command: 'search', keys: '/', titleKey: 'home_search_title' },
  { command: 'create_deck', keys: 'D', titleKey: 'create_deck' },
  { command: 'filtered', keys: 'F', titleKey: 'filtered_deck_title' },
  { command: 'check_database', keys: 'C', titleKey: 'check_db_title' },
  { command: 'backup', keys: 'Ctrl+Shift+B', titleKey: 'backup_management_create' },
  { command: 'restore', keys: 'Ctrl+B', titleKey: 'backup_management_title' },
  { command: 'settings', keys: 'P', titleKey: 'top_settings' },
  { command: 'media', keys: 'M', titleKey: 'settings_media_management' },
  { command: 'export', keys: 'Ctrl+E', titleKey: 'transfer_export_personal' },
  { command: 'import', keys: 'Ctrl+Shift+I', titleKey: 'transfer_import_file' },
  { command: 'notetypes', keys: 'Ctrl+Shift+N', titleKey: 'notetype_mgmt_title' },
  { command: 'rename', keys: 'R', titleKey: 'deck_rename_title' },
  { command: 'delete', keys: 'Delete', titleKey: 'deck_menu_delete' },
  { command: 'delete', keys: 'Shift+Delete', titleKey: 'deck_menu_delete' }
];
export const EDITOR_SHORTCUTS: KeyboardShortcut[] = [
  { command: 'save', keys: 'Ctrl+Enter', titleKey: 'browser_detail_save' },
  { command: 'save', keys: 'Ctrl+S', titleKey: 'browser_detail_save' },
  { command: 'deck', keys: 'Ctrl+D', titleKey: 'add_note_deck' },
  { command: 'templates', keys: 'Ctrl+L', titleKey: 'notetype_editor_templates' },
  { command: 'notetype', keys: 'Ctrl+N', titleKey: 'add_note_notetype' },
  { command: 'tags', keys: 'Ctrl+Shift+T', titleKey: 'add_note_tags' },
  { command: 'preview', keys: 'Ctrl+P', titleKey: 'note_draft_preview' },
  { command: 'field', keys: 'Ctrl+Shift+1…0', titleKey: 'keyboard_select_field' }
];
export const TEMPLATE_SHORTCUTS: KeyboardShortcut[] = [
  { command: 'preview', keys: 'Ctrl+P', titleKey: 'note_draft_preview' }
];

export function shortcutCommand(shortcuts: KeyboardShortcut[], chord: string, blocked: boolean = false): string {
  if (blocked || chord === '') return '';
  const normalized: string = chord.toLowerCase().replace('numpadenter', 'enter').replace('slash', '/');
  return shortcuts.find((item: KeyboardShortcut): boolean =>
    item.keys.toLowerCase().replace('ctrl+alt+shift+', 'ctrl+shift+alt+') === normalized)?.command ?? '';
}
export function editorShortcutCommand(chord: string, blocked: boolean): string {
  if (blocked) return '';
  if (/^ctrl\+shift\+(?:numpad)?[0-9]$/.test(chord)) {
    const digit: number = Number(chord.slice(-1));
    return 'field_' + String(digit === 0 ? 9 : digit - 1);
  }
  return shortcutCommand(EDITOR_SHORTCUTS, chord);
}

/** 合并同一动作的别名，保留题目/答案面的差异和自定义空配置。 */
export function studyShortcutRows(bindings: StudyKeyBinding[]): KeyboardShortcut[] {
  const rows: KeyboardShortcut[] = [];
  for (const binding of bindings) {
    const id: string = binding.command + ':' + binding.side;
    const label: string = studyChordLabel(binding.key);
    const row: KeyboardShortcut | undefined = rows.find((item: KeyboardShortcut): boolean => item.command === id);
    const suffix: string = binding.side === 'question' ? ' [Q]' : binding.side === 'answer' ? ' [A]' : '';
    if (row !== undefined) row.keys = row.keys.replace(suffix, '') + ' / ' + label + suffix;
    else rows.push({ command: id, keys: label + suffix,
      titleKey: STUDY_KEYBOARD_ACTIONS.find((action): boolean => action.id === binding.command)?.titleKey ?? 'keyboard_shortcuts_title' });
  }
  return rows;
}

/** 学习帮助复用执行端声明；学习页一组读取当前生效配置，空绑定仍保持为空。 */
export function keyboardHelpSections(controlsJson: string): KeyboardHelpSection[] {
  let controls: StudyControls = defaultStudyControls();
  try { controls = validateStudyControls(JSON.parse(controlsJson) as StudyControls); } catch (_) {}
  return KEYBOARD_HELP_SECTIONS.map((section: KeyboardHelpTopic): KeyboardHelpSection => {
    let shortcuts: KeyboardShortcut[] = [];
    if (section.id === 'home') shortcuts = HOME_SHORTCUTS;
    else if (section.id === 'study') shortcuts = studyShortcutRows(effectiveStudyKeyboard(controls).bindings);
    else if (section.id === 'browser') shortcuts = BROWSER_SHORTCUTS.map((item: BrowserShortcut): KeyboardShortcut =>
      ({ command: item.command, keys: item.keys, titleKey: item.titleKey }));
    else if (section.id === 'editor') shortcuts = EDITOR_SHORTCUTS.concat(FIELD_SHORTCUTS);
    else if (section.id === 'template') shortcuts = TEMPLATE_SHORTCUTS;
    return { id: section.id, titleKey: section.titleKey, hintKey: section.hintKey, shortcuts };
  });
}
