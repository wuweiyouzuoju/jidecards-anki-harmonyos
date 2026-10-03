// SPDX-License-Identifier: AGPL-3.0-or-later

import type { AgentImageAttachment, ChangeDraft, DraftOperation } from './AgentTypes';
import { readAgentDeckDeletionSnapshot } from './AgentDeckDeletion';
import type { AgentDeckDeletionSnapshot } from './AgentDeckDeletion';

interface RetryItemResult {
  targetId: number;
  succeeded: boolean;
}

interface RetryExecutionResult {
  failed: number;
  items: RetryItemResult[];
}

function failedTargets(result: RetryExecutionResult): Set<number> {
  const values: Set<number> = new Set<number>();
  for (const item of result.items) {
    if (!item.succeeded) { values.add(item.targetId); }
  }
  return values;
}

function operationNeedsRetry(operation: DraftOperation, result: RetryExecutionResult,
  targets: Set<number>): boolean {
  if (operation.kind === 'create_note') { return targets.has(operation.noteId); }
  if (operation.kind === 'update_field' || operation.kind === 'update_tags' ||
    operation.kind === 'delete_note') { return targets.has(operation.noteId); }
  if (operation.kind === 'move_card' || operation.kind === 'delete_card') {
    return targets.has(operation.cardId);
  }
  if (operation.kind === 'delete_deck') { return targets.has(operation.deckId); }
  // 笔记类型变更与模板变更都是单个原子工具结果，失败时整项重试。
  return result.failed > 0;
}

function uniquePositive(values: number[]): number[] {
  const result: number[] = [];
  for (const value of values) {
    if (value > 0 && result.indexOf(value) < 0) { result.push(value); }
  }
  return result;
}

/** 只保留上次执行失败的最小操作集；成功项绝不再执行。 */
export function buildFailedOperationsRetryDraft(original: ChangeDraft,
  result: RetryExecutionResult, retryId: string): ChangeDraft | null {
  if (result.failed <= 0) { return null; }
  const targets: Set<number> = failedTargets(result);
  const operations: DraftOperation[] = original.operations.filter(
    (operation: DraftOperation): boolean => operationNeedsRetry(operation, result, targets));
  const imageAttachments: AgentImageAttachment[] = (original.imageAttachments ?? []).filter(
    (attachment: AgentImageAttachment): boolean => targets.has(attachment.noteId));
  if (operations.length === 0 && imageAttachments.length === 0) { return null; }
  const noteIds: number[] = uniquePositive(
    operations.map((value: DraftOperation): number => value.noteId)
      .concat(imageAttachments.map((value: AgentImageAttachment): number => value.noteId)));
  const cardIds: number[] = uniquePositive(operations.map((value: DraftOperation): number => value.cardId));
  const deckIds: number[] = uniquePositive(operations.map((value: DraftOperation): number => value.deckId));
  for (const operation of operations) {
    if (operation.kind !== 'delete_deck') continue;
    const impact: AgentDeckDeletionSnapshot | null = readAgentDeckDeletionSnapshot(operation.after);
    if (impact !== null) {
      noteIds.push(...impact.noteIds); cardIds.push(...impact.cardIds); deckIds.push(...impact.deckIds);
    }
  }
  const retriesNoteMutation: boolean = imageAttachments.some(
    (value: AgentImageAttachment): boolean => value.noteId > 0) ||
    operations.some((value: DraftOperation): boolean =>
      value.kind === 'update_field' || value.kind === 'update_tags');
  const retriesSharedType: boolean = operations.some((value: DraftOperation): boolean =>
    value.kind === 'update_template' || value.kind === 'change_note_type' || value.kind === 'delete_note_type');
  return {
    id: retryId, risk: original.risk,
    summary: original.summary,
    baselineHash: original.baselineHash, confirmationLevel: original.confirmationLevel,
    status: 'pending', affectedNoteIds: retriesSharedType ? original.affectedNoteIds.slice() : uniquePositive(noteIds),
    affectedCardIds: retriesNoteMutation || retriesSharedType ? original.affectedCardIds.slice() : uniquePositive(cardIds),
    affectedDeckIds: deckIds.length > 0 ? uniquePositive(deckIds) : original.affectedDeckIds.slice(),
    affectedNotetypeIds: original.affectedNotetypeIds.slice(), operations: operations,
    imageAttachments: imageAttachments.length > 0 ? imageAttachments : undefined
  };
}
