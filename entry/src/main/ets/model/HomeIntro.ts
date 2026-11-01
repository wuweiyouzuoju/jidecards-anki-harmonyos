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
  { id: 'basics', titleKey: 'home_intro_flashcards_title', blocks: [
    { titleKey: 'home_intro_flashcards_title', bodyKey: 'home_intro_flashcards_body' }] },
  { id: 'prepare', titleKey: 'home_intro_manual_title', blocks: [
    { titleKey: 'home_intro_manual_title', bodyKey: 'home_intro_manual_body' }] },
  { id: 'review', titleKey: 'home_intro_daily_title', blocks: [
    { titleKey: 'home_intro_daily_title', bodyKey: 'intro_novice_daily' }] },
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
  { id: 'next', titleKey: 'home_intro_next' },
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
  if (id === 'glass' || id === 'keep_material') return page === 5;
  if (id === 'next') return !experienced && page >= 2 && page <= 4;
  if (id === 'start_import' || id === 'start_create') return page === 1;
  if (id === 'start_sync') return page === 1 && experienced;
  return id === 'later';
}

/** 经验用户跳过基础教学；新手准备页依据实际开始方式复用原文案。 */
export function homeIntroBlocks(index: number, start: string): HomeIntroBlock[] {
  if (homeIntroPageIndex(index) === 3 && start === 'start_import') return [
    {titleKey:'home_intro_apkg_title',bodyKey:'home_intro_apkg_body'}];
  return HOME_INTRO_PAGES[homeIntroPageIndex(index)].blocks;
}
export function homeIntroTarget(index: number, forward: boolean, experienced: boolean): number {
  if(experienced && forward && index === 1) return 5;
  if(experienced && !forward && index === 5) return 1;
  return homeIntroPageIndex(index + (forward ? 1 : -1));
}
