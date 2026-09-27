// SPDX-License-Identifier: AGPL-3.0-or-later

export const DECK_LIST_NARROW_KEY: string = 'deckListNarrow';
export const DECK_WIDTH_HINT_HANDLED_KEY: string = 'deckWidthHintHandled';

/** 使用实际列表视口和已展开的固定高度行；恰好放下时不提示。 */
export function deckListOverflows(count: number, rowHeight: number, gap: number, viewportHeight: number): boolean {
  return count > 0 && viewportHeight > 0 &&
    count * rowHeight + Math.max(0, count - 1) * gap > viewportHeight + 0.5;
}
