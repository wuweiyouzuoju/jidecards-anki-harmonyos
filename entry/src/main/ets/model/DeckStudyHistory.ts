// SPDX-License-Identifier: AGPL-3.0-or-later
import type { GraphsView, ReviewKindCounts } from '../proto/messages/StatsMessages';

export interface HistoryDeck {
  id: string;
  fullName: string;
}

export interface DeckStudyDay {
  daysAgo: number;
  count: number;
}

export interface DeckStudyHistory {
  days: DeckStudyDay[];
  activeDays: number;
  totalCount: number;
  totalMillis: number;
  maxCount: number;
  rolloverHour: number;
}

/** 按真实牌组ID选择整棵子树，别名、引号、通配符均不影响统计范围。 */
export function deckHistorySearch(deckId: string, decks: HistoryDeck[]): string {
  const root = decks.find((deck: HistoryDeck): boolean => deck.id === deckId);
  if (root === undefined) return '';
  const ids = decks.filter((deck: HistoryDeck): boolean =>
    deck.id === deckId || deck.fullName.startsWith(root.fullName + '::'))
    .map((deck: HistoryDeck): string => deck.id);
  if (ids.some((id: string): boolean => !/^[1-9]\d*$/.test(id))) return '';
  return 'did:' + ids.join(',');
}

function sumKinds(counts: ReviewKindCounts | undefined): number {
  if (counts === undefined) return 0;
  return counts.learn + counts.relearn + counts.young + counts.mature + counts.filtered;
}

/** Anki reviews.rs 使用负的历史日偏移；仅显示含今天的7个学习日。 */
export function buildDeckStudyHistory(graphs: GraphsView): DeckStudyHistory {
  if (graphs.reviewCountsByDaysAgo === null || graphs.reviewTimesByDaysAgo === null) {
    throw new Error('Missing deck review statistics');
  }
  const result: DeckStudyHistory = {
    days: [], activeDays: 0, totalCount: 0, totalMillis: 0, maxCount: 0,
    rolloverHour: graphs.rolloverHour
  };
  for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
    const count = sumKinds(graphs.reviewCountsByDaysAgo.get(-daysAgo));
    result.days.push({ daysAgo, count });
    result.totalCount += count;
    result.totalMillis += sumKinds(graphs.reviewTimesByDaysAgo.get(-daysAgo));
    result.maxCount = Math.max(result.maxCount, count);
    if (count > 0) result.activeDays++;
  }
  return result;
}

/** 使用本地日历的日切边界，避免午夜提前刷新或夏令时固定24小时偏移。 */
export function historyStudyDayKey(now: Date, rolloverHour: number): string {
  const date = new Date(now.getTime());
  if (date.getHours() < rolloverHour) date.setDate(date.getDate() - 1);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
