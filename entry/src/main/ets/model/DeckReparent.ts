// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DeckTreeNode } from '../proto/messages/DeckMessages';

export interface DeckHierarchyEntry {
  id: number;
  name: string;
  path: string;
  parentId: number;
  ancestors: number[];
  filtered: boolean;
}

export interface DeckPathChange { id: number; before: string; after: string; filtered: boolean; }
export interface DeckReparentPlan {
  deckIds: number[];
  parentId: number;
  parentName: string;
  changes: DeckPathChange[];
}

/** 树身份与路径来自 Core；本机别名、排序和卡片数量不参与移动确认。 */
export function deckHierarchyEntries(root: DeckTreeNode): DeckHierarchyEntry[] {
  const entries: DeckHierarchyEntry[] = [];
  const visit = (node: DeckTreeNode, parent: number, prefix: string, ancestors: number[]): void => {
    const path: string = prefix === '' ? node.name : `${prefix}::${node.name}`;
    if (node.deckId > 0) entries.push({ id: node.deckId, name: node.name, path: path,
      parentId: parent, ancestors: ancestors, filtered: node.filtered });
    for (const child of node.children) visit(child, node.deckId, node.deckId === 0 ? '' : path,
      node.deckId === 0 ? [] : ancestors.concat([node.deckId]));
  };
  visit(root, 0, '', []);
  return entries;
}

export function validateDeckReparentIds(deckIds: number[], parentId: number): void {
  if (!Array.isArray(deckIds) || deckIds.length === 0 || deckIds.length > 1000 ||
    deckIds.some((id: number): boolean => !Number.isSafeInteger(id) || id <= 0) ||
    !Number.isSafeInteger(parentId) || parentId < 0) throw new Error('deck_move_invalid_ids');
}

/** 合并父子重叠选择；预览整棵被移动子树，名称冲突拒绝而不依赖 Core 自动加后缀。 */
export function planDeckReparent(root: DeckTreeNode, deckIds: number[], parentId: number): DeckReparentPlan {
  validateDeckReparentIds(deckIds, parentId);
  const entries: DeckHierarchyEntry[] = deckHierarchyEntries(root);
  const selected: Set<number> = new Set<number>(deckIds);
  for (const id of selected) {
    if (!entries.some((entry: DeckHierarchyEntry): boolean => entry.id === id)) throw new Error('deck_move_missing');
  }
  const parent: DeckHierarchyEntry | undefined = entries.find((entry: DeckHierarchyEntry): boolean => entry.id === parentId);
  if (parentId !== 0 && parent === undefined) throw new Error('deck_move_missing');
  if (parent !== undefined && parent.filtered) throw new Error('deck_move_filtered_parent');
  if (parent !== undefined && (selected.has(parent.id) || parent.ancestors.some((id: number): boolean => selected.has(id)))) {
    throw new Error('deck_move_cycle');
  }
  const roots: DeckHierarchyEntry[] = entries.filter((entry: DeckHierarchyEntry): boolean => selected.has(entry.id) &&
    !entry.ancestors.some((id: number): boolean => selected.has(id)) && entry.parentId !== parentId);
  if (roots.length === 0) throw new Error('deck_move_unchanged');
  roots.sort((left: DeckHierarchyEntry, right: DeckHierarchyEntry): number => left.id - right.id);
  const changes: DeckPathChange[] = [];
  for (const source of roots) {
    const destination: string = parent === undefined ? source.name : `${parent.path}::${source.name}`;
    for (const entry of entries) {
      if (entry.id === source.id || entry.ancestors.indexOf(source.id) >= 0) {
        changes.push({ id: entry.id, before: entry.path, after: destination + entry.path.slice(source.path.length),
          filtered: entry.filtered });
      }
    }
  }
  changes.sort((left: DeckPathChange, right: DeckPathChange): number => left.id - right.id);
  const moving: Set<number> = new Set<number>(changes.map((change: DeckPathChange): number => change.id));
  const occupied: Set<string> = new Set<string>(entries.filter((entry: DeckHierarchyEntry): boolean => !moving.has(entry.id))
    .map((entry: DeckHierarchyEntry): string => entry.path.toLowerCase()));
  for (const change of changes) {
    const path: string = change.after.toLowerCase();
    if (occupied.has(path)) throw new Error('deck_move_conflict');
    occupied.add(path);
  }
  return { deckIds: roots.map((entry: DeckHierarchyEntry): number => entry.id), parentId: parentId,
    parentName: parent === undefined ? '' : parent.path, changes: changes };
}

export function assertDeckReparentUnchanged(root: DeckTreeNode, plan: DeckReparentPlan): void {
  if (JSON.stringify(planDeckReparent(root, plan.deckIds, plan.parentId)) !== JSON.stringify(plan)) {
    throw new Error('deck_move_stale');
  }
}
