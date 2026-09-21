// SPDX-License-Identifier: AGPL-3.0-or-later
import type { BrowserOperationContext } from './BrowserOperationController';
import type { 变更笔记类型请求 } from '../proto/messages/NotetypeMessages';

/** 转换必须全部成功再写入；空数组在某些 Anki RPC 中表示全库，不能吞掉解析失败。 */
export async function resolveBrowserCardIds(selection: BrowserOperationContext,
  cardsForNote: (noteId: number) => Promise<number[]>): Promise<number[]> {
  const ids: number[] = selection.ids.slice();
  if (selection.mode === 'cards') return ids;
  if (selection.mode !== 'notes') throw new Error('Invalid browser mode');
  const result: Set<number> = new Set<number>();
  for (const noteId of ids) {
    for (const cardId of await cardsForNote(noteId)) result.add(cardId);
  }
  return Array.from(result);
}

export async function resolveBrowserNoteIds(selection: BrowserOperationContext,
  noteForCard: (cardId: number) => Promise<number>): Promise<number[]> {
  const ids: number[] = selection.ids.slice();
  if (selection.mode === 'notes') return ids;
  if (selection.mode !== 'cards') throw new Error('Invalid browser mode');
  const result: Set<number> = new Set<number>();
  for (const cardId of ids) result.add(await noteForCard(cardId));
  return Array.from(result);
}

/** Schema 与映射共同固定，不能在等待卡片解析期间读取/修改弹层对象。 */
export function snapshotNotetypeChange(input: 变更笔记类型请求,
  fields: number[], templates: number[]): 变更笔记类型请求 {
  return {
    noteIds: [], newFields: fields.slice(), newTemplates: templates.slice(),
    oldNotetypeId: input.oldNotetypeId, newNotetypeId: input.newNotetypeId,
    currentSchema: input.currentSchema, oldNotetypeName: input.oldNotetypeName, isCloze: input.isCloze
  };
}
