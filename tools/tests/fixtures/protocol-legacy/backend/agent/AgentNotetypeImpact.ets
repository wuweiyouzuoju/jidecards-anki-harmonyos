// SPDX-License-Identifier: AGPL-3.0-or-later

import { 搜索服务 } from '../搜索服务';

export interface AgentNotetypeImpact {
  noteIds: number[];
  cardIds: number[];
}

/** Stable-ID search covers all decks without wildcard names or one RPC per note. */
export async function readAgentNotetypeImpact(id: number): Promise<AgentNotetypeImpact> {
  if (!Number.isSafeInteger(id) || id <= 0) { throw new Error('invalid_notetype_id'); }
  const searches: 搜索服务 = new 搜索服务();
  const query: string = `mid:${id}`;
  const noteIds: number[] = await searches.搜索笔记({ search: query, order: { kind: 'none' } });
  const cardIds: number[] = await searches.搜索卡片({ search: query, order: { kind: 'none' } });
  return { noteIds: Array.from(new Set<number>(noteIds)), cardIds: Array.from(new Set<number>(cardIds)) };
}
