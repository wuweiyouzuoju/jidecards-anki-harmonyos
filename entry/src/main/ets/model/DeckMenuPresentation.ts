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

/** 详情更多把牌组预览与菜单作为一组，在整个安全窗口居中。 */
export function centeredDeckMenuPlacement(bounds: DeckMenuRect, menuHeight: number, previewHeight: number = 64, previewWidth: number = 360): DeckMenuPlacement {
  const gap = 12;
  const height = Math.min(Math.max(32, previewHeight), Math.max(32, bounds.height - gap - 48));
  const available = Math.max(48, bounds.height - height - gap);
  // 首帧先给内容可用高度，拿到实际尺寸后再将预览与菜单整体居中。
  const menuSize = menuHeight > 0 ? Math.min(Math.max(48, menuHeight), available) : available;
  const width = Math.min(previewWidth, 360, bounds.width);
  const menuWidth = Math.min(280, bounds.width);
  const top = bounds.top + (bounds.height - height - gap - menuSize) / 2;
  return { preview: { left: bounds.left + (bounds.width - width) / 2, top, width, height },
    menu: { left: bounds.left + (bounds.width - menuWidth) / 2, top: top + height + gap, width: menuWidth, height: menuSize } };
}
