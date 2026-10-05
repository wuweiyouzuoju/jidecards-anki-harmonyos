// SPDX-License-Identifier: AGPL-3.0-or-later

import { PAGE_COMPACT_LAYOUT_KEY } from './AppLayoutState';

/** 牌组偏好兼容入口；通用页面和组件使用 AppLayoutState。 */
export const DECK_LIST_NARROW_KEY: string = PAGE_COMPACT_LAYOUT_KEY;
export const DECK_WIDTH_HINT_HANDLED_KEY: string = 'deckWidthHintHandled';
export const DECK_DOUBLE_COLUMN_HINT_HANDLED_KEY: string = 'deckDoubleColumnHintHandled';
export const DECK_LIST_STYLE_KEY: string = 'deckListStyle';
export const DECK_LIST_STYLES: string[] = ['single_wide', 'single_narrow', 'double_wide', 'double_narrow'];

export function isDeckListStyle(style: string): boolean {
  return DECK_LIST_STYLES.includes(style);
}

export function isNarrowDeckListStyle(style: string): boolean {
  return style === 'single_narrow' || style === 'double_narrow';
}

export function isDoubleColumnDeckListStyle(style: string): boolean {
  return style === 'double_wide' || style === 'double_narrow';
}

export function deckListStyle(narrow: boolean, doubleColumn: boolean): string {
  return doubleColumn ? (narrow ? 'double_narrow' : 'double_wide') : (narrow ? 'single_narrow' : 'single_wide');
}

export function deckListStyleTitleKey(style: string): string {
  return 'deck_style_' + style;
}

export interface DeckListGroup {
  rootId: string;
  start: number;
  count: number;
}

/** 可见列表已按树的先序排列；分栏只移动整棵顶级子树，不改变牌组顺序。 */
export function groupDeckListRows(rootIds: string[]): DeckListGroup[] {
  const groups: DeckListGroup[] = [];
  for (let index: number = 0; index < rootIds.length; index++) {
    const last: DeckListGroup | undefined = groups[groups.length - 1];
    if (last !== undefined && last.rootId === rootIds[index]) { last.count++; }
    else { groups.push({ rootId: rootIds[index], start: index, count: 1 }); }
  }
  return groups;
}

/** 每对整组同排，排高取较高的一组；不能把后代摊到另一列来估算高度。 */
export function groupedDeckListOverflows(groupCounts: number[], rowHeight: number, gap: number,
  viewportHeight: number): boolean {
  if (viewportHeight <= 0 || groupCounts.length === 0) { return false; }
  let height: number = 0;
  for (let index: number = 0; index < groupCounts.length; index += 2) {
    const count: number = Math.max(groupCounts[index], groupCounts[index + 1] ?? 0);
    height += count * rowHeight + Math.max(0, count - 1) * gap;
    if (index > 0) { height += gap; }
  }
  return height > viewportHeight + 0.5;
}

/** 使用实际列表视口和已展开的固定高度行；恰好放下时不提示。 */
export function deckListOverflows(count: number, rowHeight: number, gap: number, viewportHeight: number,
  columns: number = 1): boolean {
  const rows: number = Math.ceil(count / columns);
  return count > 0 && viewportHeight > 0 &&
    rows * rowHeight + Math.max(0, rows - 1) * gap > viewportHeight + 0.5;
}
