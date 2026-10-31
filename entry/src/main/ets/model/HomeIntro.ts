// SPDX-License-Identifier: AGPL-3.0-or-later
export interface HomeIntroBlock { titleKey: string; bodyKey: string; }
export interface HomeIntroPage { id: string; titleKey: string; blocks: HomeIntroBlock[]; }
export interface HomeIntroAction { id: string; titleKey: string; }

/** 问题、真实可见操作及结果文案同时供 UI 与 JIDE 使用。 */
export const HOME_INTRO_PAGES: HomeIntroPage[] = [
  { id: 'experience', titleKey: 'home_intro_experience_title', blocks: [
    { titleKey: 'home_intro_experience_title', bodyKey: 'intro_experience_hint' }] },
  { id: 'start', titleKey: 'intro_start_title', blocks: [
    { titleKey: 'intro_start_title', bodyKey: 'intro_start_hint' }] },
  { id: 'appearance', titleKey: 'intro_appearance_title', blocks: [
    { titleKey: 'intro_appearance_title', bodyKey: 'intro_appearance_hint' }] }

];
export const HOME_INTRO_ACTIONS: HomeIntroAction[] = [
  { id: 'used_anki', titleKey: 'intro_answer_used' },
  { id: 'new_anki', titleKey: 'intro_answer_new' },
  { id: 'start_import', titleKey: 'intro_start_import' },
  { id: 'start_create', titleKey: 'intro_start_create' },
  { id: 'start_sync', titleKey: 'intro_start_sync' },
  { id: 'glass', titleKey: 'glass_suggestion_confirm' },
  { id: 'keep_material', titleKey: 'glass_suggestion_keep' },
  { id: 'previous', titleKey: 'home_intro_previous' },
  { id: 'later', titleKey: 'home_intro_later' }
];
export function homeIntroPageIndex(index: number): number {
  return Number.isFinite(index) ? Math.max(0, Math.min(HOME_INTRO_PAGES.length - 1, Math.floor(index))) : 0;
}
export function homeIntroActionVisible(id: string, index: number, experienced: boolean = false): boolean {
  const page: number = homeIntroPageIndex(index);
  if (id === 'previous') return page > 0;
  if (id === 'used_anki' || id === 'new_anki') return page === 0;
  if (id === 'glass' || id === 'keep_material') return page === 2;
  if (id === 'start_import' || id === 'start_create') return page === 1;
  if (id === 'start_sync') return page === 1 && experienced;
  return id === 'later';
}
