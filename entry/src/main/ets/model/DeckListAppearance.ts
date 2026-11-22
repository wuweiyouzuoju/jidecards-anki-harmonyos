// SPDX-License-Identifier: AGPL-3.0-or-later

import { PAGE_COMPACT_LAYOUT_KEY } from './AppLayoutState';

/** 牌组偏好兼容入口；通用页面和组件使用 AppLayoutState。 */
export const DECK_LIST_NARROW_KEY: string = PAGE_COMPACT_LAYOUT_KEY;
export const DECK_WIDTH_HINT_HANDLED_KEY: string = 'deckWidthHintHandled';
export const DECK_DOUBLE_COLUMN_HINT_HANDLED_KEY: string = 'deckDoubleColumnHintHandled';
export const DECK_LIST_STYLE_KEY: string = 'deckListStyle';
export const DESKTOP_HOME_LAYOUT_KEY: string = 'desktopHomeLayout';
export const DECK_LIST_STYLES: string[] = ['single_wide', 'single_narrow', 'double_wide', 'double_narrow'];
export const TRIPLE_DECK_LIST_STYLE: string = 'triple_wide';

export function availableDeckListStyles(desktop: boolean): string[] {
  return desktop ? DECK_LIST_STYLES.concat([TRIPLE_DECK_LIST_STYLE]) : DECK_LIST_STYLES;
}

export function defaultDeckListStyle(desktop: boolean): string {
  return desktop ? 'double_wide' : 'single_wide';
}

export interface DeckLayoutSuggestion { target: string; titleKey: string; messageKey: string; keepKey: string; confirmKey: string; }
/** 实际确认框和 JIDE 共用名称与目标，不从翻译后的文字推断动作。 */
export function deckLayoutSuggestion(target: string): DeckLayoutSuggestion {
  if (target !== 'single_narrow' && target !== 'double_narrow') throw new Error('Invalid deck layout suggestion');
  const prefix: string = target === 'double_narrow' ? 'deck_double_column_hint_' : 'deck_width_hint_';
  return { target: target, titleKey: prefix + 'title', messageKey: prefix + 'message',
    keepKey: prefix + 'keep', confirmKey: prefix + 'confirm' };
}

export function isDeckListStyle(style: string): boolean {
  return DECK_LIST_STYLES.includes(style) || style === TRIPLE_DECK_LIST_STYLE;
}

export function isNarrowDeckListStyle(style: string): boolean {
  return style === 'single_narrow' || style === 'double_narrow';
}

export function isDoubleColumnDeckListStyle(style: string): boolean {
  return style === 'double_wide' || style === 'double_narrow';
}

export function deckListColumnCount(style: string, canUseColumns: boolean = true): number {
  if (!canUseColumns) return 1;
  if (style === TRIPLE_DECK_LIST_STYLE) return 3;
  return isDoubleColumnDeckListStyle(style) ? 2 : 1;
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

/** 与 WaterFlow 一致：完整顶级子树依次进入较短列，同高时从左列开始。 */
export function groupedDeckColumnHeights(groupCounts: number[], rowHeight: number, gap: number, columns: number = 2): number[] {
  const heights: number[] = Array<number>(columns).fill(0);
  for (const count of groupCounts) {
    if (count <= 0) { continue; }
    let column: number = 0;
    for (let index: number = 1; index < heights.length; index++) {
      if (heights[index] < heights[column]) column = index;
    }
    heights[column] += (heights[column] > 0 ? gap : 0) + count * rowHeight + Math.max(0, count - 1) * gap;
  }
  return heights;
}

/** 溢出按最终较高列计算，不能把后代摊到另一列，也不保留旧的成对空白。 */
export function groupedDeckListOverflows(groupCounts: number[], rowHeight: number, gap: number,
  viewportHeight: number, columns: number = 2): boolean {
  if (viewportHeight <= 0 || groupCounts.length === 0) { return false; }
  return Math.max(...groupedDeckColumnHeights(groupCounts, rowHeight, gap, columns)) > viewportHeight + 0.5;
}

/** 使用实际列表视口和已展开的固定高度行；恰好放下时不提示。 */
export function deckListOverflows(count: number, rowHeight: number, gap: number, viewportHeight: number,
  columns: number = 1): boolean {
  const rows: number = Math.ceil(count / columns);
  return count > 0 && viewportHeight > 0 &&
    rows * rowHeight + Math.max(0, rows - 1) * gap > viewportHeight + 0.5;
}
