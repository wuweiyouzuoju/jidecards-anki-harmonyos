// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ImportSummary } from '../proto/messages/ImportExportMessages';

export const IMPORT_RESULT_BATCH_SIZE: number = 256;
export interface ImportResultCategory {
  id: string;
  titleKey: string;
  hintKey: string;
  count: number;
  noteIds: number[];
}
export interface ImportResultBatch { query: string; first: number; last: number; total: number; }
export interface ImportResultAction { id: string; titleKey: string; }
export const IMPORT_RESULT_ACTIONS: ImportResultAction[] = [
  { id: 'new', titleKey: 'transfer_result_new' }, { id: 'updated', titleKey: 'transfer_result_updated' },
  { id: 'duplicate', titleKey: 'transfer_result_duplicate' }, { id: 'conflict', titleKey: 'transfer_result_conflict' },
  { id: 'match', titleKey: 'transfer_result_match' }, { id: 'notetype', titleKey: 'transfer_result_notetype' },
  { id: 'deck', titleKey: 'transfer_result_deck' }, { id: 'empty', titleKey: 'transfer_result_empty' }
];

export function importResultCategories(summary: ImportSummary): ImportResultCategory[] {
  return [
    { id: 'new', titleKey: 'transfer_result_new', hintKey: '', count: summary.newNotes, noteIds: summary.newNoteIds ?? [] },
    { id: 'updated', titleKey: 'transfer_result_updated', hintKey: '', count: summary.updatedNotes, noteIds: summary.updatedNoteIds ?? [] },
    { id: 'duplicate', titleKey: 'transfer_result_duplicate', hintKey: '', count: summary.duplicateNotes, noteIds: summary.duplicateNoteIds ?? [] },
    { id: 'conflict', titleKey: 'transfer_result_conflict', hintKey: 'transfer_result_conflict_help', count: summary.conflictingNotes, noteIds: [] },
    { id: 'match', titleKey: 'transfer_result_match', hintKey: 'transfer_result_match_help', count: summary.firstFieldMatches, noteIds: [] },
    { id: 'notetype', titleKey: 'transfer_result_notetype', hintKey: 'transfer_result_notetype_help', count: summary.missingNotetypeNotes, noteIds: [] },
    { id: 'deck', titleKey: 'transfer_result_deck', hintKey: 'transfer_result_deck_help', count: summary.missingDeckNotes, noteIds: [] },
    { id: 'empty', titleKey: 'transfer_result_empty', hintKey: 'transfer_result_empty_help', count: summary.emptyFirstFieldNotes, noteIds: [] }
  ].filter((item: ImportResultCategory): boolean => item.count > 0);
}

/** 每次跳转仅携带一批精确 ID；结果页保留完整日志，可继续查看后续批次。 */
export function importResultBatch(summary: ImportSummary, categoryId: string, page: number): ImportResultBatch | null {
  if (!Number.isInteger(page) || page < 0) return null;
  const category = importResultCategories(summary).find((item: ImportResultCategory): boolean => item.id === categoryId);
  if (category === undefined) return null;
  const ids = category.noteIds;
  const offset: number = page * IMPORT_RESULT_BATCH_SIZE;
  if (offset >= ids.length) return null;
  const batch: number[] = ids.slice(offset, offset + IMPORT_RESULT_BATCH_SIZE);
  return { query: `nid:${batch.join(',')}`, first: offset + 1, last: offset + batch.length, total: ids.length };
}
