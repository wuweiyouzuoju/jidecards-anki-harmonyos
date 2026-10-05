// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DeckTreeNode } from '../proto/messages/DeckMessages';
import { deckHierarchyEntries } from './DeckReparent';
import type { DeckHierarchyEntry, DeckPathChange } from './DeckReparent';

export interface DeckRenamePlan {
  deckId: number;
  name: string;
  changes: DeckPathChange[];
}

/** 改名只改当前层名称；移动父级由既有移动入口负责。拒绝会被 Core 静默清理的字符。 */
export function deckRenameName(deckId: number, value: string): string {
  if (!Number.isSafeInteger(deckId) || deckId <= 0 || typeof value !== 'string') throw new Error('deck_rename_invalid');
  const name: string = value.trim().normalize('NFC');
  if (name === '' || name.length > 200 || name.includes('::') || /^:|:$/.test(name) || /[\x00-\x1f\x7f]/.test(name)) {
    throw new Error('deck_rename_invalid');
  }
  return name;
}

/** 预览 Core RenameDeck 将更新的整棵子树；本机别名和顺序不参与改名。 */
export function planDeckRename(root: DeckTreeNode, deckId: number, value: string): DeckRenamePlan {
  const name: string = deckRenameName(deckId, value);
  const entries: DeckHierarchyEntry[] = deckHierarchyEntries(root);
  const source: DeckHierarchyEntry | undefined = entries.find((entry: DeckHierarchyEntry): boolean => entry.id === deckId);
  if (source === undefined) throw new Error('deck_rename_missing');
  if (source.name === name) throw new Error('deck_rename_unchanged');
  const path: string = source.path.slice(0, source.path.length - source.name.length) + name;
  const changes: DeckPathChange[] = entries.filter((entry: DeckHierarchyEntry): boolean =>
    entry.id === deckId || entry.ancestors.includes(deckId)).map((entry: DeckHierarchyEntry): DeckPathChange =>
    ({ id: entry.id, before: entry.path, after: path + entry.path.slice(source.path.length), filtered: entry.filtered }));
  changes.sort((left: DeckPathChange, right: DeckPathChange): number => left.id - right.id);
  const changed: Set<number> = new Set<number>(changes.map((entry: DeckPathChange): number => entry.id));
  const occupied: Set<string> = new Set<string>(entries.filter((entry: DeckHierarchyEntry): boolean => !changed.has(entry.id))
    .map((entry: DeckHierarchyEntry): string => entry.path.toLowerCase()));
  for (const change of changes) {
    if (occupied.has(change.after.toLowerCase())) throw new Error('deck_rename_conflict');
  }
  return { deckId: deckId, name: name, changes: changes };
}

export function assertDeckRenameUnchanged(root: DeckTreeNode, plan: DeckRenamePlan): void {
  if (JSON.stringify(planDeckRename(root, plan.deckId, plan.name)) !== JSON.stringify(plan)) throw new Error('deck_rename_stale');
}
