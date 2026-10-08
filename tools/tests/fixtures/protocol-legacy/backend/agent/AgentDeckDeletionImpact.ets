// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DeckTreeNode } from '../../proto/messages/DeckMessages';
import type { Card } from '../../proto/messages/CardsMessages';
import type { AgentDeckDeletionSnapshot } from '../../model/agent/AgentDeckDeletion';
import { agentDeletionDeckIds } from '../../model/agent/AgentDeckDeletion';
import { MAX_BATCH_LIMIT } from '../../model/agent/AgentPolicy';
import { AgentToolSchemaError } from '../../model/agent/AgentToolSchemas';
import { 搜索服务 } from '../搜索服务';
import { 卡片服务 } from '../卡片服务';

/** @throws {Error} 按真实牌组 ID 计算影响；提案和执行前校验共用，不执行写入。 */
export async function readAgentDeckDeletionImpact(deck: DeckTreeNode): Promise<AgentDeckDeletionSnapshot> {
  const deckIds: number[] = agentDeletionDeckIds(deck);
  const selected: Set<number> = new Set<number>(deckIds);
  const normalDecks: Set<number> = new Set<number>(agentDeletionDeckIds(deck, true));
  const candidates: number[] = await new 搜索服务().搜索卡片({ search: `did:${deckIds.join(',')}`, order: { kind: 'none' } });
  const cards: 卡片服务 = new 卡片服务();
  const cardIds: Set<number> = new Set<number>();
  const noteIds: Set<number> = new Set<number>();
  for (const id of candidates) {
    if (cardIds.has(id)) continue;
    const card: Card = await cards.获取卡片(id);
    // 普通牌组删除也包含借到筛选牌组的卡；筛选牌组只归还其中卡片。与 Core cards_for_deck.sql 一致。
    if (!selected.has(card.deckId) && !normalDecks.has(card.originalDeckId)) continue;
    cardIds.add(id); noteIds.add(card.noteId);
    if (cardIds.size > MAX_BATCH_LIMIT) {
      throw new AgentToolSchemaError('high_risk_batch_too_large', 'deckIds',
        `The selected deck subtree affects more than ${MAX_BATCH_LIMIT} cards. Select a smaller scope.`);
    }
  }
  return { deckIds: deckIds, cardIds: Array.from(cardIds), noteIds: Array.from(noteIds) };
}
