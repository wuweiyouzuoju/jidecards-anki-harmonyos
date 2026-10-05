// SPDX-License-Identifier: AGPL-3.0-or-later
/** 公共菜单只认识稳定 ID、可用性和子级，不依赖资源、页面或卡片业务。 */
export interface ActionMenuNode {
  id?: string;
  enabled?: boolean;
  children?: ActionMenuNode[];
}

export interface ActionMenuRow {
  node: ActionMenuNode;
  key: string;
  depth: number;
  enabled: boolean;
}

function collectRows(items: ActionMenuNode[], expandedIds: string[], parent: string,
  depth: number, parentEnabled: boolean): ActionMenuRow[] {
  const rows: ActionMenuRow[] = [];
  items.forEach((node: ActionMenuNode, index: number): void => {
    const key: string = `${parent}/${node.id ?? index}`;
    const enabled: boolean = parentEnabled && node.enabled !== false;
    rows.push({ node: node, key: key, depth: depth, enabled: enabled });
    if (node.children !== undefined && node.id !== undefined && expandedIds.includes(node.id)) {
      rows.push(...collectRows(node.children, expandedIds, key, depth + 1, enabled));
    }
  });
  return rows;
}

/** 可见树保持目录顺序；布局由组件拥有，禁用状态沿父级传播。 */
export function actionMenuRows(root: ActionMenuNode[], expandedIds: string[]): ActionMenuRow[] {
  return collectRows(root, expandedIds, '', 0, true);
}

function branchIds(node: ActionMenuNode): string[] {
  const ids: string[] = node.children !== undefined && node.id !== undefined ? [node.id] : [];
  for (const child of node.children ?? []) ids.push(...branchIds(child));
  return ids;
}

/** 只切换当前可见、可用的分支；收起父级同时收起其后代，避免隐藏颜色残留。 */
export function toggleActionMenuBranch(root: ActionMenuNode[], expandedIds: string[], id: string): string[] {
  const row: ActionMenuRow | undefined = actionMenuRows(root, expandedIds)
    .find((item: ActionMenuRow): boolean => item.node.id === id);
  if (row === undefined || !row.enabled || row.node.children === undefined) return expandedIds.slice();
  if (!expandedIds.includes(id)) return [...expandedIds, id];
  const closed: string[] = branchIds(row.node);
  return expandedIds.filter((expanded: string): boolean => !closed.includes(expanded));
}
