// SPDX-License-Identifier: AGPL-3.0-or-later
import { isWideLandscapeWindow } from './AppLayoutState';
export const HOME_LAYOUT_KEY: string = 'home_layout_mode';
export const HOME_LAYOUT_MODES: string[] = ['classic', 'wheel'];
export const DEFAULT_HOME_LAYOUT: string = 'classic';
export interface HomeLandscapeAction {
  id: string; titleKey: string; iconKey: string; opens: string; agentOnly?: boolean;
}
export const HOME_LANDSCAPE_ACTIONS: HomeLandscapeAction[] = [
  { id: 'reminders', titleKey: 'reminder_list_title', iconKey: 'ic_home_reminders', opens: 'reminders' },
  { id: 'settings', titleKey: 'top_settings', iconKey: 'ic_home_settings', opens: 'settings' },
  { id: 'history', titleKey: 'collection_history_title', iconKey: 'ic_study_undo', opens: 'collection_history' },
  { id: 'stats', titleKey: 'stats_page_title', iconKey: 'ic_home_stats', opens: 'stats' },
  { id: 'agent', titleKey: 'ai_agent_title', iconKey: 'ic_study_agent', opens: 'agent', agentOnly: true },
  { id: 'search', titleKey: 'home_search_title', iconKey: 'ic_settings_search', opens: 'home_search' },
  { id: 'browser', titleKey: 'browser_title', iconKey: 'ic_home_browser', opens: 'browser' },
  { id: 'sync', titleKey: 'home_sync', iconKey: 'ic_home_sync', opens: 'sync' },
  { id: 'create', titleKey: 'create_deck', iconKey: 'ic_home_new', opens: 'home_create' }
];
export const HOME_DIRECT_ACTION_IDS: string[] = ['reminders', 'settings', 'history', 'stats'];
export function isHomeLayout(value: string): boolean { return HOME_LAYOUT_MODES.includes(value); }
export function useHomeActionWheels(mode: string, width: number, height: number): boolean {
  return mode === 'wheel' && isWideLandscapeWindow(width, height);
}
export function homeLayoutTitleKey(mode: string): string { return mode === 'wheel' ? 'home_layout_wheel' : 'home_layout_classic'; }

export const HOME_LEFT_WHEEL_OPEN_KEY: string = 'home_left_wheel_open';
export const HOME_RIGHT_WHEEL_OPEN_KEY: string = 'home_right_wheel_open';
