// SPDX-License-Identifier: AGPL-3.0-or-later
export interface HomeIntroBlock { titleKey: string; bodyKey: string; }
export interface HomeIntroPage { id: string; titleKey: string; blocks: HomeIntroBlock[]; }

/** UI 与 JIDE 共用入门目录；只介绍已有能力，不创建牌组或修改学习设置。 */
export const HOME_INTRO_PAGES: HomeIntroPage[] = [
  { id: 'start', titleKey: 'home_intro_flashcards_title', blocks: [
    { titleKey: 'home_intro_flashcards_title', bodyKey: 'home_intro_flashcards_body' },
    { titleKey: 'home_intro_uses_title', bodyKey: 'home_intro_uses_body' }] },
  { id: 'science', titleKey: 'home_intro_science_title', blocks: [
    { titleKey: 'home_intro_history_title', bodyKey: 'home_intro_history_body' },
    { titleKey: 'home_intro_recall_title', bodyKey: 'home_intro_recall_body' },
    { titleKey: 'home_intro_spacing_title', bodyKey: 'home_intro_spacing_body' },
    { titleKey: 'home_intro_research_title', bodyKey: 'home_intro_research_body' }] },
  { id: 'app', titleKey: 'home_intro_app_title', blocks: [
    { titleKey: 'home_intro_app_title', bodyKey: 'home_intro_app_body' },
    { titleKey: 'home_intro_fsrs_title', bodyKey: 'home_intro_fsrs_body' },
    { titleKey: 'home_intro_custom_title', bodyKey: 'home_intro_custom_body' }] },
  { id: 'sources', titleKey: 'home_intro_sources_title', blocks: [
    { titleKey: 'ankiweb_guide_title', bodyKey: 'ankiweb_guide_message' }] },
  { id: 'import', titleKey: 'home_intro_apkg_title', blocks: [
    { titleKey: 'home_intro_apkg_title', bodyKey: 'home_intro_apkg_body' },
    { titleKey: 'home_intro_sync_title', bodyKey: 'home_intro_sync_body' }] },
  { id: 'create', titleKey: 'home_intro_manual_title', blocks: [
    { titleKey: 'home_intro_manual_title', bodyKey: 'home_intro_manual_body' },
    { titleKey: 'home_intro_agent_title', bodyKey: 'home_intro_agent_body' }] },
  { id: 'daily', titleKey: 'home_intro_daily_title', blocks: [
    { titleKey: 'home_intro_daily_title', bodyKey: 'home_intro_daily_body' },
    { titleKey: 'home_intro_simple_start_title', bodyKey: 'home_intro_finish_body' }] }
];

export interface HomeIntroAction { id: string; titleKey: string; }
export const HOME_INTRO_ACTIONS: HomeIntroAction[] = [
  { id: 'previous', titleKey: 'home_intro_previous' },
  { id: 'next', titleKey: 'home_intro_next' },
  { id: 'finish', titleKey: 'welcome_section1_title' },
  { id: 'later', titleKey: 'home_intro_later' },
  { id: 'copy_group', titleKey: 'about_qq_group_title' },
  { id: 'open_decks', titleKey: 'ankiweb_guide_button_open' }
];

export function homeIntroPageIndex(index: number): number {
  return Number.isFinite(index) ? Math.max(0, Math.min(HOME_INTRO_PAGES.length - 1, Math.floor(index))) : 0;
}

export function homeIntroActionVisible(id: string, index: number): boolean {
  const page: number = homeIntroPageIndex(index);
  if (id === 'previous') return page > 0;
  if (id === 'next') return page < HOME_INTRO_PAGES.length - 1;
  if (id === 'finish') return page === HOME_INTRO_PAGES.length - 1;
  if (id === 'copy_group' || id === 'open_decks') return HOME_INTRO_PAGES[page].id === 'sources';
  return id === 'later';
}
