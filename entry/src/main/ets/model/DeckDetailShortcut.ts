// SPDX-License-Identifier: AGPL-3.0-or-later
import { 自定义学习预设 } from '../proto/messages/SchedulerMessages';

export interface DeckDetailShortcut {
  id: string;
  titleKey: string;
  instructionsKey: string;
  opens: string;
  query: string;
  preset: number;
}

/** 数量来自 Core；普通牌组只调整今日额度，筛选牌组回到真实卡片列表。 */
export function deckDetailShortcuts(filtered: boolean): DeckDetailShortcut[] {
  return [
    { id: 'name', titleKey: 'deck_rename_name', instructionsKey: 'deck_rename_title', opens: 'deck_rename', query: '', preset: 0 },
    { id: 'total', titleKey: 'deck_total_cards', instructionsKey: 'browser_title', opens: 'browser', query: '', preset: 0 },
    { id: 'new', titleKey: 'new_cards', instructionsKey: filtered ? 'browser_title' : 'custom_study_preset_new_limit',
      opens: filtered ? 'browser' : 'custom_study', query: 'is:new', preset: 自定义学习预设.新卡上限增量 },
    { id: 'learning', titleKey: 'learning_cards', instructionsKey: 'browser_title', opens: 'browser', query: 'is:learn', preset: 0 },
    { id: 'review', titleKey: 'review_cards', instructionsKey: filtered ? 'browser_title' : 'custom_study_preset_review_limit',
      opens: filtered ? 'browser' : 'custom_study', query: 'is:review is:due', preset: 自定义学习预设.复习上限增量 }
  ];
}

export function deckDetailShortcut(id: string, filtered: boolean): DeckDetailShortcut | undefined {
  return deckDetailShortcuts(filtered).find((item: DeckDetailShortcut): boolean => item.id === id);
}
