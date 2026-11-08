// SPDX-License-Identifier: AGPL-3.0-or-later
export interface HomeIntroBlock { titleKey: string; bodyKey: string; }
export interface HomeIntroPage { id: string; titleKey: string; blocks: HomeIntroBlock[]; }
export interface HomeIntroAction { id: string; titleKey: string; }

/** 问题、真实可见操作及结果文案同时供 UI 与 JIDE 使用。 */
export const HOME_INTRO_PAGES: HomeIntroPage[] = [
  { id: 'appearance', titleKey: 'intro_appearance_title', blocks: [
    { titleKey: 'intro_appearance_title', bodyKey: 'intro_appearance_hint' }] },
  { id: 'experience', titleKey: 'home_intro_experience_title', blocks: [
    { titleKey: 'home_intro_experience_title', bodyKey: 'intro_experience_hint' }] },
  { id: 'basics', titleKey: 'home_intro_flashcards_title', blocks: [
    { titleKey: 'home_intro_flashcards_title', bodyKey: 'home_intro_flashcards_body' }] },
  { id: 'prepare', titleKey: 'home_intro_manual_title', blocks: [
    { titleKey: 'home_intro_manual_title', bodyKey: 'home_intro_manual_body' }] },
  { id: 'review', titleKey: 'home_intro_daily_title', blocks: [
    { titleKey: 'home_intro_daily_title', bodyKey: 'intro_novice_daily' }] },
  { id: 'community', titleKey: 'settings_about', blocks: [
    { titleKey: 'about_qq_group_title', bodyKey: 'home_intro_community_body' }] },
];
export const HOME_INTRO_ACTIONS: HomeIntroAction[] = [
  { id: 'used_anki', titleKey: 'intro_answer_used' },
  { id: 'new_anki', titleKey: 'intro_answer_new' },
  { id: 'glass', titleKey: 'glass_suggestion_confirm' },
  { id: 'keep_material', titleKey: 'glass_suggestion_keep' },
  { id: 'finish', titleKey: 'done' },
  { id: 'next', titleKey: 'home_intro_next' },
  { id: 'previous', titleKey: 'home_intro_previous' },
  { id: 'copy_qq', titleKey: 'home_intro_copy_qq' }
];
export function homeIntroPageIndex(index: number): number {
  return Number.isFinite(index) ? Math.max(0, Math.min(HOME_INTRO_PAGES.length - 1, Math.floor(index))) : 0;
}
export function homeIntroActionVisible(id: string, index: number, _experienced: boolean = false, ready: boolean = false): boolean {
  const page: number = homeIntroPageIndex(index);
  if (id === 'previous') return page > 0;
  if (id === 'used_anki' || id === 'new_anki') return page === 1;
  if (id === 'glass' || id === 'keep_material') return page === 0;
  if (id === 'finish') return page === 5;
  if (id === 'next') return (page === 1 && ready) || (page >= 2 && page < 5);
  return id === 'copy_qq' && page === 5;
}

export function homeIntroTarget(index: number, forward: boolean, experienced: boolean): number {
  if (experienced && forward && index === 1) return 5;
  if (experienced && !forward && index === 5) return 1;
  return homeIntroPageIndex(index + (forward ? 1 : -1));
}
