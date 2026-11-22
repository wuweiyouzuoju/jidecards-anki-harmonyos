// SPDX-License-Identifier: AGPL-3.0-or-later

/** 首页列表、搜索与自动恢复采用同一隐藏子树规则。 */
export function isHomeDeckHidden(id: string, ancestorIds: string[], hiddenIds: Set<string>): boolean {
  return hiddenIds.has(id) || ancestorIds.some((ancestorId: string): boolean => hiddenIds.has(ancestorId));
}

/** 只统计当前集合中主动隐藏的牌组；不清理存档，以保留删除撤销后的隐藏状态。 */
export function activeHiddenDeckIds(storedIds: string[], currentDeckIds: string[]): string[] {
  const current: Set<string> = new Set<string>(currentDeckIds);
  const seen: Set<string> = new Set<string>();
  return storedIds.filter((id: string): boolean => {
    if (id === '' || !current.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
