// SPDX-License-Identifier: AGPL-3.0-or-later
import { SETTINGS_ENTRIES, settingsEntryVisible } from '../SettingsNavigation';
import type { AppInterfaceContext } from '../AppInterface';

export interface AppPageRoute { surface: string; name: string; titleKey: string; }

/** Navigation 和 JIDE 共用目的地标识；页面内弹层仍由 AppInterface 声明。 */
export const APP_PAGE_ROUTES: AppPageRoute[] = [
  { surface: 'study', name: 'StudyPage', titleKey: 'start_study' },
  { surface: 'browser', name: 'BrowserPage', titleKey: 'browser_title' },
  { surface: 'edit_note', name: 'EditNotePage', titleKey: 'note_editor_edit_title' },
  { surface: 'note_draft_preview', name: 'NoteDraftPreviewPage', titleKey: 'deck_preview' },
  { surface: 'stats', name: 'StatsPage', titleKey: 'stats_page_title' },
  { surface: 'add_note', name: 'AddNotePage', titleKey: 'add_note_title' },
  { surface: 'agent', name: 'AiCardPage', titleKey: 'ai_agent_title' },
  { surface: 'reminders', name: 'ReminderPage', titleKey: 'reminder_list_title' },
  { surface: 'settings', name: 'SettingsPage', titleKey: 'top_settings' }
];

export function appPageName(surface: string): string {
  return APP_PAGE_ROUTES.find((route: AppPageRoute): boolean => route.surface === surface)?.name ?? '';
}

export function browserNavigationQuery(deckId: number | undefined, query: string): string {
  if (deckId === undefined) return query;
  return 'did:' + deckId + (query.trim() === '' ? '' : ' (' + query + ')');
}

export type AppNavigationArgumentName = 'deckId' | 'noteId' | 'cardId' | 'sectionId' | 'query' | 'notesMode';
export interface AppNavigationAction {
  id: string; surface: string; titleKey: string; required: AppNavigationArgumentName[]; optional: AppNavigationArgumentName[];
  resetsStack?: boolean;
}
export const APP_NAVIGATION_ACTIONS: AppNavigationAction[] = [
  { id: 'start_study', surface: 'study', titleKey: 'start_study', required: ['deckId'], optional: [] },
  { id: 'open_browser', surface: 'browser', titleKey: 'browser_title', required: [], optional: ['deckId', 'query', 'notesMode'] },
  { id: 'open_settings', surface: 'settings', titleKey: 'top_settings', required: [], optional: ['sectionId'] },
  { id: 'open_stats', surface: 'stats', titleKey: 'stats_page_title', required: [], optional: [] },
  { id: 'open_reminders', surface: 'reminders', titleKey: 'reminder_list_title', required: [], optional: [] },
  { id: 'open_add_note', surface: 'add_note', titleKey: 'add_note_title', required: ['deckId'], optional: [] },
  { id: 'open_home', surface: 'home', titleKey: 'home_interface_title', required: [], optional: [], resetsStack: true },
  { id: 'open_edit_note', surface: 'edit_note', titleKey: 'note_editor_edit_title', required: ['noteId'], optional: [] },
  { id: 'open_card_preview', surface: 'browser', titleKey: 'deck_preview', required: ['cardId'], optional: [] },
  { id: 'open_deck_details', surface: 'deck_details', titleKey: 'home_interface_decks', required: ['deckId'], optional: [], resetsStack: true },
  { id: 'open_deck_options', surface: 'deck_options', titleKey: 'deck_options_title', required: ['deckId'], optional: [], resetsStack: true }
];

/** 根宿主与 JIDE 使用同一栈约束；了解页面不授予丢弃表单或重复学习的权限。 */
export function appNavigationStackBlockReason(actionId: string, names: string[]): string {
  if (names[names.length - 1] !== appPageName('agent')) return 'navigation_unavailable';
  const action = APP_NAVIGATION_ACTIONS.find((item): boolean => item.id === actionId);
  if (action === undefined) return 'unknown_navigation_action';
  if (actionId === 'start_study' && names.includes(appPageName('study'))) return 'navigation_study_active';
  if (action.resetsStack === true && names.some((name: string): boolean =>
    name === appPageName('edit_note') || name === appPageName('add_note'))) return 'navigation_unsaved_page';
  return '';
}

export interface AppNavigationArguments {
  action: string; deckId?: number; noteId?: number; cardId?: number; sectionId?: string; query?: string; notesMode?: boolean;
}
export interface AppNavigationRequest extends AppNavigationArguments {
  surface: string; deckName: string;
}

/** 固定语义动作，不接收任意页面名、URL、参数对象或回调。 */
export function validateAppNavigation(value: AppNavigationArguments, context: AppInterfaceContext): AppNavigationAction {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_navigation_arguments');
  const action = APP_NAVIGATION_ACTIONS.find((item: AppNavigationAction): boolean => item.id === value.action);
  if (action === undefined) throw new Error('unknown_navigation_action');
  const keys: string[] = ['action'].concat(action.required, action.optional);
  if (Object.keys(value).some((key: string): boolean => !keys.includes(key))) throw new Error('invalid_navigation_arguments');
  if (action.required.some((key: AppNavigationArgumentName): boolean => value[key] === undefined)) throw new Error('invalid_navigation_arguments');
  if (value.deckId !== undefined &&
    (!Number.isSafeInteger(value.deckId) || (value.deckId ?? 0) <= 0)) throw new Error('invalid_navigation_deck');
  if (value.noteId !== undefined && (!Number.isSafeInteger(value.noteId) || value.noteId <= 0)) throw new Error('invalid_navigation_note');
  if (value.cardId !== undefined && (!Number.isSafeInteger(value.cardId) || value.cardId <= 0)) throw new Error('invalid_navigation_card');
  if (value.query !== undefined && (typeof value.query !== 'string' || value.query.length > 1000)) throw new Error('invalid_navigation_query');
  if (value.notesMode !== undefined && typeof value.notesMode !== 'boolean') throw new Error('invalid_navigation_mode');
  if (value.sectionId !== undefined) {
    const section = SETTINGS_ENTRIES.find((item): boolean => item.id === value.sectionId);
    if (section === undefined || !settingsEntryVisible(section, context.simple, context.agent)) throw new Error('navigation_section_unavailable');
  }
  return action;
}

/** 只检查本轮用户文字；资料、历史和恢复接续不能单独触发跳转。 */
export function appNavigationRequested(text: string): boolean {
  const value: string = text.trim().toLowerCase();
  if (new RegExp('不要|别打开|别进入|别返回|先别|不用打开|无需打开|不需要打开|怎么|如何|介绍|解释|do not|don.t|how (do|can|to)|explain').test(value)) return false;
  return new RegExp('打开|进入|开始|带我|跳转|切换到|返回首页|回到首页|回首页|预览|去.{0,20}(学|复习|浏览|设置)|帮我.{0,20}(学|复习)|^(学|复习)|open|start|take me|go to|navigate|show me|preview|return (to )?home|back (to )?home').test(value);
}
