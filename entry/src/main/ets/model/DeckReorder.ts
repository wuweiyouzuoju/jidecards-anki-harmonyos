// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DeckTreeNode } from '../proto/messages/DeckMessages';
import { deckHierarchyEntries } from './DeckReparent';
import type { DeckHierarchyEntry } from './DeckReparent';

export interface DeckOrderEntry { id: number; path: string; }
export interface DeckOrderSnapshot { parentId: number; parentName: string; decks: DeckOrderEntry[]; }
export interface DeckReorderPlan { parentId: number; parentName: string; before: DeckOrderEntry[]; after: DeckOrderEntry[]; }
export type DeckDropPosition = 'before' | 'after';
export interface DeckDropTarget {
  sourceId: number; targetId: number; position: DeckDropPosition;
  sourcePath?: string; targetPath?: string;
}
export interface DeckArrangeRow { id: string; parentId: string; ancestorIds: string[]; fullName: string; filtered?: boolean; }

/** 与首页平铺共用：失效/重复覆盖项忽略，新增子牌组保留 Core 原序追加。 */
export function orderDeckChildren(children: DeckTreeNode[], stored: string[] | null): DeckTreeNode[] {
  if (stored === null || stored.length === 0) return children.slice();
  const result: DeckTreeNode[] = [];
  const byId: Map<string, DeckTreeNode> = new Map<string, DeckTreeNode>();
  const used: Set<string> = new Set<string>();
  for (const child of children) byId.set(String(child.deckId), child);
  for (const id of stored) {
    const child = byId.get(id);
    if (child !== undefined && !used.has(id)) { result.push(child); used.add(id); }
  }
  for (const child of children) if (!used.has(String(child.deckId))) result.push(child);
  return result;
}

function findNode(root: DeckTreeNode, id: number): DeckTreeNode | null {
  if (root.deckId === id) return root;
  for (const child of root.children) {
    const found: DeckTreeNode | null = findNode(child, id);
    if (found !== null) return found;
  }
  return null;
}

export function validateDeckReorderIds(ids: number[], parentId: number): void {
  if (!Number.isSafeInteger(parentId) || parentId < 0 || !Array.isArray(ids) || ids.length === 0 ||
    ids.length > 1000 || ids.some((id: number): boolean => !Number.isSafeInteger(id) || id <= 0) ||
    new Set<number>(ids).size !== ids.length) throw new Error('deck_reorder_invalid_ids');
}

export function deckOrderSnapshot(root: DeckTreeNode, parentId: number, stored: string[] | null): DeckOrderSnapshot {
  if (!Number.isSafeInteger(parentId) || parentId < 0) throw new Error('deck_reorder_invalid_ids');
  const parent: DeckTreeNode | null = findNode(root, parentId);
  if (parent === null) throw new Error('deck_move_missing');
  const entries: DeckHierarchyEntry[] = deckHierarchyEntries(root);
  const parentName: string = entries.find((entry): boolean => entry.id === parentId)?.path ?? '';
  const decks: DeckOrderEntry[] = orderDeckChildren(parent.children, stored).map((child: DeckTreeNode): DeckOrderEntry =>
    ({ id: child.deckId, path: entries.find((entry): boolean => entry.id === child.deckId)?.path ?? child.name }));
  return { parentId: parentId, parentName: parentName, decks: decks };
}

/** JIDE 必须提交完整同级排列，隐藏牌组也保留，不能将跨父级操作伪装成排序。 */
export function planDeckReorder(snapshot: DeckOrderSnapshot, ids: number[]): DeckReorderPlan {
  validateDeckReorderIds(ids, snapshot.parentId);
  if (ids.length !== snapshot.decks.length || ids.some((id: number): boolean =>
    !snapshot.decks.some((entry): boolean => entry.id === id))) throw new Error('deck_reorder_siblings');
  if (ids.every((id: number, index: number): boolean => id === snapshot.decks[index].id)) {
    throw new Error('deck_move_unchanged');
  }
  return { parentId: snapshot.parentId, parentName: snapshot.parentName,
    before: snapshot.decks.map((entry): DeckOrderEntry => ({ id: entry.id, path: entry.path })),
    after: ids.map((id: number): DeckOrderEntry => ({ id: id,
      path: snapshot.decks.find((entry): boolean => entry.id === id)!.path })) };
}

export function assertDeckOrderUnchanged(snapshot: DeckOrderSnapshot, plan: DeckReorderPlan): void {
  if (JSON.stringify([snapshot.parentId, snapshot.parentName, snapshot.decks]) !==
    JSON.stringify([plan.parentId, plan.parentName, plan.before])) throw new Error('deck_reorder_stale');
}

export function deckDropParent(root: DeckTreeNode, drop: DeckDropTarget): number {
  const entries: DeckHierarchyEntry[] = deckHierarchyEntries(root);
  const source = entries.find((entry): boolean => entry.id === drop.sourceId);
  if (source === undefined) throw new Error('deck_move_missing');
  const target = entries.find((entry): boolean => entry.id === drop.targetId);
  if (target === undefined) throw new Error('deck_move_missing');
  if ((drop.sourcePath !== undefined && drop.sourcePath !== source.path) ||
    (drop.targetPath !== undefined && drop.targetPath !== target.path)) throw new Error('deck_move_stale');
  if (drop.sourceId === drop.targetId || target.ancestors.includes(drop.sourceId)) throw new Error('deck_move_cycle');
  if (source.parentId !== target.parentId) throw new Error('deck_reorder_siblings');
  if (drop.position !== 'before' && drop.position !== 'after') throw new Error('deck_reorder_invalid_ids');
  return source.parentId;
}

export function planDeckDrop(root: DeckTreeNode, drop: DeckDropTarget, stored: string[] | null): DeckReorderPlan {
  const parentId: number = deckDropParent(root, drop);
  const source = deckHierarchyEntries(root).find((entry): boolean => entry.id === drop.sourceId)!;
  const snapshot: DeckOrderSnapshot = deckOrderSnapshot(root, parentId, stored);
  const next: DeckOrderEntry[] = snapshot.decks.filter((entry): boolean => entry.id !== source.id);
  const index: number = next.findIndex((entry): boolean => entry.id === drop.targetId);
  const insertion: number = drop.position === 'before' ? index : index + 1;
  next.splice(insertion, 0, { id: source.id, path: source.path });
  const order: DeckReorderPlan = { parentId: parentId, parentName: snapshot.parentName,
    before: snapshot.decks, after: next };
  if (JSON.stringify(order.before) === JSON.stringify(order.after)) throw new Error('deck_move_unchanged');
  return order;
}

/** 展开的子行也代表其同级祖先落点；拖动只调整源牌组的兄弟顺序。 */
export function deckSiblingDrop(rows: DeckArrangeRow[], from: number, to: number): DeckDropTarget | null {
  if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return null;
  const source: DeckArrangeRow = rows[from];
  const hovered: DeckArrangeRow = rows[to];
  if (hovered.ancestorIds.includes(source.id)) return null;
  const target = rows.find((row): boolean => row.parentId === source.parentId &&
    (row.id === hovered.id || hovered.ancestorIds.includes(row.id)));
  if (target === undefined || target.id === source.id) return null;
  return { sourceId: Number(source.id), targetId: Number(target.id), position: from > to ? 'before' : 'after',
    sourcePath: source.fullName, targetPath: target.fullName };
}

/** 同级父牌组移动时整棵子树一起重排，防止瞬时行序破坏下一次拖动的索引。 */
export function reorderDeckRows<T extends DeckArrangeRow>(rows: T[], fromId: string, targetId: string,
  position: 'before' | 'after'): T[] {
  const source = rows.find((row): boolean => row.id === fromId);
  const target = rows.find((row): boolean => row.id === targetId);
  if (source === undefined || target === undefined || source.id === target.id || source.parentId !== target.parentId) return rows.slice();
  const moved: T[] = rows.filter((row): boolean => row.id === fromId || row.ancestorIds.includes(fromId));
  const next: T[] = rows.filter((row): boolean => row.id !== fromId && !row.ancestorIds.includes(fromId));
  let index: number = next.findIndex((row): boolean => row.id === targetId);
  if (position === 'after') {
    index++;
    while (index < next.length && next[index].ancestorIds.includes(targetId)) index++;
  }
  next.splice(index, 0, ...moved);
  return next;
}
