// SPDX-License-Identifier: AGPL-3.0-or-later
export interface HomeSearchDeck {
  id: string;
  name: string;
  fullName: string;
  displayName: string;
  ancestorIds: string[];
}

/** 搜索全量牌组（包括折叠子牌组），隐藏牌组及其子树保持隐藏。结果保留原有层级顺序。 */
export function searchHomeDecks<T extends HomeSearchDeck>(decks: T[], hiddenIds: Set<string>, query: string): T[] {
  const terms: string[] = query.normalize('NFC').trim().toLowerCase().split(/\s+/).filter((term: string): boolean => term.length > 0);
  return decks.filter((deck: T): boolean => {
    if (hiddenIds.has(deck.id) || deck.ancestorIds.some((id: string): boolean => hiddenIds.has(id))) return false;
    const label: string = `${deck.fullName}\n${deck.name}\n${deck.displayName}`.normalize('NFC').toLowerCase();
    return terms.every((term: string): boolean => label.includes(term));
  });
}
