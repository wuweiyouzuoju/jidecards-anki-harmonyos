// SPDX-License-Identifier: AGPL-3.0-or-later
export interface HomeExpandableDeck { id: string; hasChildren: boolean; }

export interface HomeDeckExpansion { expanded: Set<string>; known: Set<string>; }

interface SavedHomeDeckExpansion { version: number; expanded: string[]; known: string[]; }

/** 同时保存已知 ID，重启后才能区分主动折叠与新导入的父牌组。 */
export function encodeHomeExpansion(state: HomeDeckExpansion): string {
  const saved: SavedHomeDeckExpansion = {
    version: 1, expanded: Array.from(state.expanded), known: Array.from(state.known)
  };
  return JSON.stringify(saved);
}

/** @throws {Error} 无效偏好交给存储调用方记录，不把损坏内容当作首次启动。 */
export function decodeHomeExpansion(value: string): HomeDeckExpansion | null {
  if (value === '') return null;
  const saved: SavedHomeDeckExpansion = JSON.parse(value) as SavedHomeDeckExpansion;
  if (saved === null || saved.version !== 1 || !Array.isArray(saved.expanded) || !Array.isArray(saved.known) ||
    !saved.expanded.every((id: string): boolean => typeof id === 'string' && id.length > 0) ||
    !saved.known.every((id: string): boolean => typeof id === 'string' && id.length > 0)) {
    throw new Error('Invalid home deck expansion preference');
  }
  const known: Set<string> = new Set<string>(saved.known);
  return { expanded: new Set<string>(saved.expanded.filter((id: string): boolean => known.has(id))), known: known };
}

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
