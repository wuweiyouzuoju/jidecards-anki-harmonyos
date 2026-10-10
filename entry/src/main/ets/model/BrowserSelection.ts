// SPDX-License-Identifier: AGPL-3.0-or-later
import type { BrowserOperationContext } from './BrowserOperationController';
import type { 变更笔记类型请求 } from '../proto/messages/NotetypeMessages';

/** 信息/笔记预览使用真实代表卡片；没有卡片时不得把 noteId 当 cardId。 */
export async function resolveBrowserRepresentativeCard(id: number, mode: string,
  cardsForNote: (noteId: number) => Promise<number[]>): Promise<number | null> {
  if (mode === 'cards') return id;
  if (mode !== 'notes') throw new Error('Invalid browser mode');
  const cards: number[] = await cardsForNote(id);
  return cards.length === 0 ? null : cards[0];
}

/** 区间按完整结果顺序确定，包含尚未加载的行。 */
export function selectBrowserRange(resultIds: number[], selected: number[], anchor: number, target: number): number[] {
  const start: number = resultIds.indexOf(anchor);
  const end: number = resultIds.indexOf(target);
  if (end < 0) return selected.slice();
  const selection: Set<number> = new Set<number>(selected);
  if (start < 0) selection.add(target);
  else resultIds.slice(Math.min(start, end), Math.max(start, end) + 1).forEach((id: number): void => { selection.add(id); });
  return resultIds.filter((id: number): boolean => selection.has(id));
}

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
