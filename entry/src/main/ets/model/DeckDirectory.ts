// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DeckTreeNode } from '../proto/messages/DeckMessages';
import { directoryRow } from './DirectoryTree';
import type { DirectoryRow } from './DirectoryTree';

/** 获取完整树；是否展示子项由公共目录组件决定，不能在适配时丢掉折叠子树。 */
export function deckDirectoryRows(root: DeckTreeNode | null, selectedId: number = 0,
  preserveCollapse: boolean = false): DirectoryRow[] {
  const rows: DirectoryRow[] = [];
  if (root === null) return rows;
  const visit = (node: DeckTreeNode, prefix: string, level: number): void => {
    for (const child of node.children) {
      const path: string = prefix === '' ? child.name : `${prefix}::${child.name}`;
      const row: DirectoryRow = directoryRow(String(child.deckId), path, child.deckId === selectedId ? 1 : 0);
      row.level = level; row.hasChildren = child.children.length > 0;
      row.collapsed = preserveCollapse && child.collapsed;
      row.detail = child.totalInDeck > 0 ? String(child.totalInDeck) : '';
      rows.push(row); visit(child, path, level + 1);
    }
  };
  visit(root, '', 0);
  return rows;
}
