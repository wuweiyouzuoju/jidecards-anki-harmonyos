// SPDX-License-Identifier: AGPL-3.0-or-later
import type { TagTreeNode } from '../proto/messages/TagsMessages';
import type { EditableNote } from '../proto/messages/NoteMessages';
import type { SearchNode } from '../proto/messages/SearchMessages';
import { makeTagNode, makeParsableTextNode, SearchNodeJoiner } from '../proto/messages/SearchMessages';

/** Core 负责引号与通配符转义；AND 分组保持已有 OR 搜索的含义。 */
export function tagSearchNode(name: string, existing: string = ''): SearchNode {
  const tag: SearchNode = makeTagNode(name);
  return existing.trim() === '' ? tag : { kind: 'group',
    group: { joiner: SearchNodeJoiner.AND, nodes: [makeParsableTextNode(existing), tag] } };
}

export interface TagRow {
  fullName: string;
  name: string;
  level: number;
  hasChildren: boolean;
  collapsed: boolean;
  // -1: 浏览，0: 无，1: 全部有，2: 部分有。
  selection: number;
}

/** Core 的子节点 name 只有末级名称，所有动作必须使用重建的完整路径。 */
export function flattenTagTree(root: TagTreeNode): TagRow[] {
  const rows: TagRow[] = [];
  const visit = (node: TagTreeNode, prefix: string, level: number): void => {
    for (const child of node.children) {
      const fullName: string = prefix === '' ? child.name : `${prefix}::${child.name}`;
      rows.push({ fullName, name: child.name, level, hasChildren: child.children.length > 0,
        collapsed: child.collapsed, selection: -1 });
      visit(child, fullName, level + 1);
    }
  };
  visit(root, '', 0);
  return rows;
}

export function visibleTagRows(rows: TagRow[], query: string): TagRow[] {
  const needle: string = query.trim().toLowerCase();
  if (needle === '') {
    let hiddenBelow: number = -1;
    return rows.filter((row: TagRow): boolean => {
      if (hiddenBelow >= 0 && row.level > hiddenBelow) return false;
      hiddenBelow = row.hasChildren && row.collapsed ? row.level : -1;
      return true;
    });
  }
  const visible: Set<string> = new Set<string>();
  const expanded: Set<string> = new Set<string>();
  for (const row of rows) {
    if (!row.fullName.toLowerCase().includes(needle)) continue;
    visible.add(row.fullName.toLowerCase());
    let parent: string = row.fullName;
    let separator: number = parent.lastIndexOf('::');
    while (separator >= 0) {
      parent = parent.slice(0, separator);
      visible.add(parent.toLowerCase()); expanded.add(parent.toLowerCase());
      separator = parent.lastIndexOf('::');
    }
  }
  return rows.filter((row: TagRow): boolean => visible.has(row.fullName.toLowerCase()))
    .map((row: TagRow): TagRow => ({ fullName: row.fullName, name: row.name, level: row.level,
      hasChildren: row.hasChildren, collapsed: expanded.has(row.fullName.toLowerCase()) ? false : row.collapsed,
      selection: row.selection }));
}

/** 新建单个标签时空白作为层级分隔；普通手输标签仍以空白分隔多个标签。 */
export function newTagName(input: string): string {
  const value: string = input.trim().replace(new RegExp('\\s+', 'g'), '::');
  if (value === '') return '';
  const parts: string[] = value.split('::');
  if (parts[parts.length - 1] === '') parts.pop();
  return parts.map((part: string): string => part === '' ? 'blank' : part).join('::');
}

export interface TagSelectionChange { name: string; selected: boolean; }

/** 只记录用户调整的完整标签；虚拟父节点和未动过的混合标签不会被写入。 */
export class TagSelection {
  private rows: TagRow[];
  private index: Map<string, TagRow> = new Map<string, TagRow>();
  private initial: Map<string, number> = new Map<string, number>();
  private states: Map<string, number> = new Map<string, number>();

  constructor(root: TagTreeNode, noteTags: string[][]) {
    this.rows = flattenTagTree(root);
    for (const row of this.rows) this.index.set(row.fullName.toLowerCase(), row);
    const counts: Map<string, number> = new Map<string, number>();
    for (const tags of noteTags) {
      const unique: Set<string> = new Set<string>();
      for (const tag of tags) {
        this.addPath(tag);
        unique.add(tag.toLowerCase());
      }
      for (const key of unique) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const row of this.rows) {
      const key: string = row.fullName.toLowerCase();
      const count: number = counts.get(key) ?? 0;
      const state: number = count === 0 ? 0 : count === noteTags.length ? 1 : 2;
      this.initial.set(key, state); this.states.set(key, state);
      if (count > 0) this.expandParents(row.fullName);
    }
    this.sort();
  }

  private addPath(name: string): void {
    const parts: string[] = name.split('::');
    let prefix: string = '';
    for (let index: number = 0; index < parts.length; index++) {
      prefix = index === 0 ? parts[index] : `${prefix}::${parts[index]}`;
      const existing: TagRow | undefined = this.index.get(prefix.toLowerCase());
      if (existing !== undefined) { if (index < parts.length - 1) existing.hasChildren = true; continue; }
      const row: TagRow = { fullName: prefix, name: parts[index], level: index,
        hasChildren: index < parts.length - 1, collapsed: false, selection: 0 };
      this.rows.push(row); this.index.set(prefix.toLowerCase(), row);
      this.initial.set(prefix.toLowerCase(), 0); this.states.set(prefix.toLowerCase(), 0);
    }
  }

  private sort(): void {
    this.rows.sort((a: TagRow, b: TagRow): number => {
      const left: string[] = a.fullName.toLowerCase().split('::');
      const right: string[] = b.fullName.toLowerCase().split('::');
      for (let index: number = 0; index < Math.min(left.length, right.length); index++) {
        if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
      }
      return left.length - right.length;
    });
  }

  private expandParents(name: string): void {
    let parent: string = name;
    let separator: number = parent.lastIndexOf('::');
    while (separator >= 0) {
      parent = parent.slice(0, separator);
      const row: TagRow | undefined = this.index.get(parent.toLowerCase());
      if (row !== undefined) row.collapsed = false;
      separator = parent.lastIndexOf('::');
    }
  }

  toggle(name: string): void {
    const key: string = name.toLowerCase();
    if (!this.states.has(key)) return;
    const state: number = this.states.get(key) ?? 0;
    this.states.set(key, state === 2 ? 1 : state === 1 ? 0 : this.initial.get(key) === 2 ? 2 : 1);
  }

  has(name: string): boolean { return this.index.has(name.toLowerCase()); }

  toggleCollapsed(name: string): void {
    const row: TagRow | undefined = this.index.get(name.toLowerCase());
    if (row !== undefined) row.collapsed = !row.collapsed;
  }

  add(input: string): string {
    const name: string = newTagName(input);
    if (name === '') return '';
    this.addPath(name); this.sort(); this.expandParents(name);
    this.states.set(name.toLowerCase(), 1);
    return name;
  }

  visible(query: string): TagRow[] {
    return visibleTagRows(this.rows.map((row: TagRow): TagRow => ({ fullName: row.fullName,
      name: row.name, level: row.level, hasChildren: row.hasChildren, collapsed: row.collapsed,
      selection: this.states.get(row.fullName.toLowerCase()) ?? 0 })), query);
  }

  changes(): TagSelectionChange[] {
    const changes: TagSelectionChange[] = [];
    for (const row of this.rows) {
      const key: string = row.fullName.toLowerCase();
      const state: number = this.states.get(key) ?? 0;
      if (state !== 2 && state !== (this.initial.get(key) ?? 0)) changes.push({ name: row.fullName, selected: state === 1 });
    }
    return changes;
  }
}

export function applyTagSelection(tags: string[], changes: TagSelectionChange[]): string[] {
  const result: string[] = tags.slice();
  for (const change of changes) {
    const key: string = change.name.toLowerCase();
    if (change.selected) {
      if (!result.some((tag: string): boolean => tag.toLowerCase() === key)) result.push(change.name);
    } else {
      for (let index: number = result.length - 1; index >= 0; index--) {
        if (result[index].toLowerCase() === key) result.splice(index, 1);
      }
    }
  }
  return result;
}

/** 全部读取成功才一次提交；用最新笔记保留字段、其他标签和子标签，Core 提供撤销。 */
export async function updateSelectedNoteTags(ids: number[], changes: TagSelectionChange[],
  read: (id: number) => Promise<EditableNote>, write: (notes: EditableNote[]) => Promise<void>): Promise<number> {
  if (ids.length === 0 || changes.length === 0) return 0;
  const snapshot: TagSelectionChange[] = changes.map((change: TagSelectionChange): TagSelectionChange =>
    ({ name: change.name, selected: change.selected }));
  const updates: EditableNote[] = [];
  for (const id of new Set<number>(ids)) {
    const note: EditableNote = await read(id);
    const tags: string[] = applyTagSelection(note.tags, snapshot);
    if (tags.join('\u001f') === note.tags.join('\u001f')) continue;
    updates.push({ id: note.id, guid: note.guid, notetypeId: note.notetypeId, mtimeSecs: note.mtimeSecs,
      usn: note.usn, fields: note.fields.slice(), tags });
  }
  if (updates.length > 0) await write(updates);
  return updates.length;
}
