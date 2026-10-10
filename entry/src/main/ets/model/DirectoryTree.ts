// SPDX-License-Identifier: AGPL-3.0-or-later
/** 通用目录展示契约；身份、路径与选择来自宿主，组件不读写领域数据。 */
export interface DirectoryRow {
  id: string;
  path: string;
  name: string;
  level: number;
  hasChildren: boolean;
  collapsed: boolean;
  selectable: boolean;
  selection: number;
  detail: string;
  stateLabel: string;
  pinned: boolean;
}

export interface DirectoryChoice { id: string; path: string; }

export interface DirectoryView {
  query: string;
  ids: string[];
  paths: string[];
  expandedIds: string[];
  selections: number[];
  selectable: boolean[];
  total: number;
  interactive: boolean;
  mode: string;
  searchable: boolean;
  hasBranches: boolean;
}

export function directoryRow(id: string, path: string, selection: number = -1): DirectoryRow {
  const parts: string[] = path.split('::');
  return { id, path, name: parts[parts.length - 1], level: parts.length - 1,
    hasChildren: false, collapsed: false, selectable: true, selection,
    detail: '', stateLabel: '', pinned: false };
}

/** “全部/顶层/文件指定”是独立操作，不能成为目录祖先。 */
export function directorySpecial(id: string, label: string, selection: number = 0): DirectoryRow {
  const row: DirectoryRow = directoryRow(id, label, selection);
  row.name = label; row.level = 0; row.pinned = true;
  return row;
}

interface DirectoryBranch { row: DirectoryRow; children: DirectoryBranch[]; }

/** 缺失的祖先只用于导航，不可选；保留调用方顺序与真实 ID，避免同名叶子混淆。 */
export function directoryChoiceRows(choices: DirectoryChoice[], selectedId: string = ''): DirectoryRow[] {
  const roots: DirectoryBranch[] = [];
  const branches: Map<string, DirectoryBranch> = new Map<string, DirectoryBranch>();
  for (const choice of choices) {
    const parts: string[] = choice.path.split('::');
    let path: string = '';
    let parent: DirectoryBranch | undefined = undefined;
    for (let level: number = 0; level < parts.length; level++) {
      path = level === 0 ? parts[level] : `${path}::${parts[level]}`;
      let branch: DirectoryBranch | undefined = branches.get(path);
      if (branch === undefined) {
        const row: DirectoryRow = directoryRow(`directory-parent:${path}`, path, 0);
        row.selectable = false;
        branch = { row, children: [] }; branches.set(path, branch);
        if (parent === undefined) roots.push(branch);
        else { parent.children.push(branch); parent.row.hasChildren = true; }
      }
      if (level === parts.length - 1) {
        branch.row.id = choice.id; branch.row.selectable = true;
        branch.row.selection = choice.id === selectedId ? 1 : 0;
      }
      parent = branch;
    }
  }
  const rows: DirectoryRow[] = [];
  const visit = (branch: DirectoryBranch): void => {
    rows.push(branch.row);
    for (const child of branch.children) visit(child);
  };
  for (const root of roots) visit(root);
  return rows;
}

function copyDirectoryRow(row: DirectoryRow, collapsed: boolean): DirectoryRow {
  return { id: row.id, path: row.path, name: row.name, level: row.level,
    hasChildren: row.hasChildren, collapsed, selectable: row.selectable,
    selection: row.selection, detail: row.detail, stateLabel: row.stateLabel, pinned: row.pinned };
}

/** 搜索保留祖先并临时展开；清空搜索恢复原折叠，永不改动输入树。 */
export function visibleDirectoryRows(rows: DirectoryRow[], query: string,
  folds: Map<string, boolean> = new Map<string, boolean>()): DirectoryRow[] {
  const needle: string = query.trim().toLowerCase();
  if (needle === '') {
    const result: DirectoryRow[] = [];
    let hiddenBelow: number = -1;
    for (const row of rows) {
      if (row.pinned) { result.push(copyDirectoryRow(row, false)); continue; }
      if (hiddenBelow >= 0 && row.level > hiddenBelow) continue;
      const collapsed: boolean = folds.get(row.id) ?? row.collapsed;
      hiddenBelow = row.hasChildren && collapsed ? row.level : -1;
      result.push(copyDirectoryRow(row, collapsed));
    }
    return result;
  }
  const visible: Set<string> = new Set<string>();
  const expanded: Set<string> = new Set<string>();
  const ancestors: DirectoryRow[] = [];
  for (const row of rows) {
    if (row.pinned) { visible.add(row.id); continue; }
    while (ancestors.length > 0 && ancestors[ancestors.length - 1].level >= row.level) ancestors.pop();
    if (row.path.toLowerCase().includes(needle) || row.name.toLowerCase().includes(needle)) {
      visible.add(row.id);
      for (const ancestor of ancestors) { visible.add(ancestor.id); expanded.add(ancestor.id); }
    }
    ancestors.push(row);
  }
  return rows.filter((row: DirectoryRow): boolean => visible.has(row.id))
    .map((row: DirectoryRow): DirectoryRow => copyDirectoryRow(row,
      expanded.has(row.id) ? false : folds.get(row.id) ?? row.collapsed));
}

export function directoryRowKey(row: DirectoryRow): string {
  return JSON.stringify([row.id, row.path, row.name, row.level, row.hasChildren, row.collapsed,
    row.selectable, row.selection, row.detail, row.stateLabel, row.pinned]);
}

export function directorySelectionAllowed(rows: DirectoryRow[], id: string, interactive: boolean): boolean {
  return interactive && rows.some((row: DirectoryRow): boolean => row.id === id && row.selectable);
}

export function directoryListHeight(count: number, limit: number): number {
  return Math.min(Math.max(0, limit), Math.max(0, count) * 44);
}

/** 展开只属于当前目录实例；新选择显示祖先，刷新不重置用户已调整的分支。 */
export class DirectoryExpansion {
  private folds: Map<string, boolean> = new Map<string, boolean>();
  private selected: string = '';
  update(rows: DirectoryRow[], revealSelection: boolean): void {
    const ids: Set<string> = new Set<string>(rows.map((row: DirectoryRow): string => row.id));
    for (const id of this.folds.keys()) if (!ids.has(id)) this.folds.delete(id);
    const selected: string = rows.filter((row: DirectoryRow): boolean => row.selection === 1)
      .map((row: DirectoryRow): string => row.id).join('\u001f');
    if (revealSelection && selected !== this.selected) {
      const ancestors: DirectoryRow[] = [];
      for (const row of rows) {
        if (row.pinned) continue;
        while (ancestors.length > 0 && ancestors[ancestors.length - 1].level >= row.level) ancestors.pop();
        if (row.selection === 1) for (const ancestor of ancestors) this.folds.set(ancestor.id, false);
        ancestors.push(row);
      }
    }
    this.selected = selected;
  }
  visible(rows: DirectoryRow[], query: string): DirectoryRow[] { return visibleDirectoryRows(rows, query, this.folds); }
  toggle(row: DirectoryRow): void { if (row.hasChildren) this.folds.set(row.id, !row.collapsed); }
}
