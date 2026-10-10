// SPDX-License-Identifier: AGPL-3.0-or-later
export interface BrowserKeyInput {
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  editable: boolean;
  blocked: boolean;
  busy: boolean;
}
export interface BrowserShortcut { command: string; keys: string; titleKey: string; }
/** 与浏览菜单使用同一动作 ID；仅列表作用域消费，编辑器和弹层保留自己的输入。 */
export const BROWSER_SHORTCUTS: BrowserShortcut[] = [
  { command: 'select_all', keys: 'Ctrl+A', titleKey: 'browser_select_all' },
  { command: 'search', keys: 'Ctrl+F', titleKey: 'browser_search_placeholder' },
  { command: 'mode', keys: 'Ctrl+Alt+T', titleKey: 'browser_mode_notes' },
  { command: 'sort', keys: 'Ctrl+O', titleKey: 'browser_sort_default' },
  { command: 'edit', keys: 'E', titleKey: 'browser_edit_fields' },
  { command: 'preview', keys: 'Ctrl+Shift+P', titleKey: 'browser_preview_selection' },
  { command: 'info', keys: 'Ctrl+Shift+I', titleKey: 'browser_card_info_title' },
  { command: 'export', keys: 'Ctrl+Shift+E', titleKey: 'browser_export_selection' },
  { command: 'grade', keys: 'Ctrl+Shift+G', titleKey: 'browser_grade_now' },
  { command: 'tags', keys: 'Ctrl+Shift+A', titleKey: 'tags_batch_title' },
  { command: 'deck', keys: 'Ctrl+D', titleKey: 'browser_action_change_deck' },
  { command: 'suspend', keys: 'Ctrl+J', titleKey: 'browser_action_toggle_suspend' },
  { command: 'bury', keys: 'Ctrl+Shift+J', titleKey: 'browser_action_toggle_bury' },
  { command: 'mark', keys: 'Ctrl+K', titleKey: 'card_mark_mark' },
  { command: 'due', keys: 'Ctrl+Alt+R', titleKey: 'browser_action_set_due' },
  { command: 'reset', keys: 'Ctrl+Alt+N', titleKey: 'browser_reset_title' },
  { command: 'reposition', keys: 'Ctrl+Shift+S', titleKey: 'browser_action_reposition' },
  { command: 'save_search', keys: 'Ctrl+S', titleKey: 'browser_saved_search_save' },
  { command: 'filter', keys: 'Ctrl+Alt+S', titleKey: 'browser_action_sidebar' },
  { command: 'delete', keys: 'Delete', titleKey: 'browser_action_delete' },
  { command: 'refresh', keys: 'F5', titleKey: 'common_retry' },
  { command: 'undo', keys: 'Ctrl+Z', titleKey: 'collection_history_undo' },
  { command: 'redo', keys: 'Ctrl+Shift+Z', titleKey: 'collection_history_redo' },
  { command: 'escape', keys: 'Escape', titleKey: 'browser_exit_selection' }
];
export function browserKeyCommand(input: BrowserKeyInput): string {
  if (input.blocked || input.editable || input.busy) return '';
  const key: string = input.key.toLowerCase();
  const chord: string = `${input.ctrl ? 'Ctrl+' : ''}${input.alt ? 'Alt+' : ''}${input.shift ? 'Shift+' : ''}${key}`;
  if (input.ctrl && !input.alt && !input.shift && /^[0-7]$/.test(key)) return `flag_${key}`;
  if (!input.ctrl && !input.alt && (key === 'arrowup' || key === 'arrowdown'))
    return `${input.shift ? 'range_' : ''}${key === 'arrowup' ? 'up' : 'down'}`;
  if (!input.ctrl && !input.alt && !input.shift && (key === 'enter' || key === ' ')) return key === ' ' ? 'toggle' : 'open';
  const shortcut: BrowserShortcut | undefined = BROWSER_SHORTCUTS.find((item: BrowserShortcut): boolean => item.keys.toLowerCase() === chord.toLowerCase());
  return shortcut === undefined ? '' : shortcut.command;
}
