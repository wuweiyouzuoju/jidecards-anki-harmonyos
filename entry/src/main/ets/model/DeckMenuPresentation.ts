// SPDX-License-Identifier: AGPL-3.0-or-later
export interface DeckMenuRect { left: number; top: number; width: number; height: number; }
export interface DeckMenuPlacement { preview: DeckMenuRect; menu: DeckMenuRect; }
function clamp(value: number, low: number, high: number): number { return Math.max(low, Math.min(value, Math.max(low, high))); }
/** 预览保持原列中心，短窗口抬高整组；不把宽屏侧栏的菜单搬到全窗口中心。 */
export function deckMenuPlacement(anchor: DeckMenuRect, bounds: DeckMenuRect, previewHeight: number, menuHeight: number = 400): DeckMenuPlacement {
  const gap = 12;
  const width = Math.max(48, Math.min(anchor.width || 360, bounds.width));
  const left = clamp(anchor.left + anchor.width / 2 - width / 2, bounds.left, bounds.left + bounds.width - width);
  const height = Math.max(32, Math.min(previewHeight, Math.max(32, bounds.height - 60)));
  const top = clamp(anchor.top, bounds.top,
    bounds.top + bounds.height - height - gap - Math.min(menuHeight, Math.max(48, bounds.height - height - gap)));
  const menuWidth = Math.min(280, width, bounds.width);
  const menuLeft = clamp(left + width / 2 - menuWidth / 2, bounds.left, bounds.left + bounds.width - menuWidth);
  const menuTop = top + height + gap;
  return { preview: { left, top, width, height }, menu: { left: menuLeft, top: menuTop, width: menuWidth,
    height: Math.max(48, bounds.top + bounds.height - menuTop) } };
}
