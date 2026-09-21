// SPDX-License-Identifier: AGPL-3.0-or-later
export interface HomeExpandableDeck { id: string; hasChildren: boolean; }

export interface HomeDeckExpansion { expanded: Set<string>; known: Set<string>; }

/** 首次展开父牌组；刷新只展开新父牌组，保留用户主动折叠。 */
export function reconcileHomeExpansion(decks: HomeExpandableDeck[], expanded: Set<string>, known: Set<string>,
  initialized: boolean): HomeDeckExpansion {
  const next: Set<string> = new Set<string>();
  const ids: Set<string> = new Set<string>();
  for (const deck of decks) {
    ids.add(deck.id);
    if (deck.hasChildren && (!initialized || expanded.has(deck.id) || !known.has(deck.id))) next.add(deck.id);
  }
  return { expanded: next, known: ids };
}
