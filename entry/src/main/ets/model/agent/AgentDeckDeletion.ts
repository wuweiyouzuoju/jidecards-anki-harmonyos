// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DeckTreeNode } from '../../proto/messages/DeckMessages';

export interface AgentDeckDeletionSnapshot { deckIds: number[]; cardIds: number[]; noteIds: number[]; name?: string; }

export function agentDeletionFullName(node: DeckTreeNode, id: number, prefix: string = ''): string {
  const full: string = node.deckId > 0 ? (prefix.length > 0 ? `${prefix}::${node.name}` : node.name) : '';
  if (node.deckId === id) return full;
  for (const child of node.children) {
    const found: string = agentDeletionFullName(child, id, full);
    if (found.length > 0) return found;
  }
  return '';
}

export function findAgentDeletionDeck(node: DeckTreeNode, id: number): DeckTreeNode | null {
  if (node.deckId === id) return node;
  for (const child of node.children) {
    const found: DeckTreeNode | null = findAgentDeletionDeck(child, id);
    if (found !== null) return found;
  }
  return null;
}

export function agentDeletionDeckIds(node: DeckTreeNode, normalOnly: boolean = false): number[] {
  const ids: number[] = normalOnly && node.filtered ? [] : [node.deckId];
  for (const child of node.children) ids.push(...agentDeletionDeckIds(child, normalOnly));
  return ids;
}

/** 选中父牌组时，子牌组包含在同一操作中；输入顺序不改变递归删除范围。 */
export function agentDeletionRoots(tree: DeckTreeNode, ids: number[]): DeckTreeNode[] {
  const selected: DeckTreeNode[] = [];
  for (const id of ids) {
    const deck: DeckTreeNode | null = findAgentDeletionDeck(tree, id);
    if (deck === null) throw new Error('deck_not_found');
    if (!selected.some((item: DeckTreeNode): boolean => item.deckId === id)) selected.push(deck);
  }
  return selected.filter((item: DeckTreeNode): boolean => !selected.some((parent: DeckTreeNode): boolean =>
    parent.deckId !== item.deckId && findAgentDeletionDeck(parent, item.deckId) !== null));
}

/** 空串兼容旧草稿；新草稿保存逐操作影响，供确认校验与失败重试使用。 */
export function readAgentDeckDeletionSnapshot(json: string): AgentDeckDeletionSnapshot | null {
  if (json === '') return null;
  const value: AgentDeckDeletionSnapshot = JSON.parse(json) as AgentDeckDeletionSnapshot;
  if (value === null || typeof value !== 'object' || !Array.isArray(value.deckIds) ||
    !Array.isArray(value.cardIds) || !Array.isArray(value.noteIds) || value.deckIds.length === 0 ||
    (value.name !== undefined && typeof value.name !== 'string')) {
    throw new Error('invalid_draft_payload');
  }
  for (const id of value.deckIds.concat(value.cardIds, value.noteIds)) {
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('invalid_draft_payload');
  }
  return value;
}
