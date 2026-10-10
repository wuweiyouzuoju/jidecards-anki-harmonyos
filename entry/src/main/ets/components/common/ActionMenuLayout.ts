// SPDX-License-Identifier: AGPL-3.0-or-later
export interface ActionMenuAnchor { left: number; top: number; width: number; height: number; }
export enum ActionMenuPointerSide { Right, Top, Bottom, Left }
export interface AnchoredActionMenuPlacement extends ActionMenuAnchor {
  pointerSide: ActionMenuPointerSide;
  pointerCenter: number;
}
export interface ActionMenuBubble {
  left: number;
  width: number;
  pointerSide: ActionMenuPointerSide;
  pointerCenter: number;
}

/** 窗口锚点仅在菜单宿主边界转换；保留滚动后部分越界的行坐标。 */
export function actionMenuHostAnchor(anchor: ActionMenuAnchor, hostLeft: number, hostTop: number): ActionMenuAnchor {
  return { left: anchor.left - hostLeft, top: anchor.top - hostTop, width: anchor.width, height: anchor.height };
}

/** 主菜单对齐目标行中心，子面板向左展开；上下避让及整组限界由公共外壳负责。 */
export function placeAnchoredActionMenu(anchor: ActionMenuAnchor, width: number, height: number,
  primaryWidth: number, bounds: ActionMenuAnchor, gap: number = 6,
  groupsOnRight: boolean = false): AnchoredActionMenuPlacement {
  const menuWidth: number = Math.min(width, bounds.width);
  const below: number = Math.max(bounds.top + gap, anchor.top + anchor.height + gap);
  const above: number = Math.min(bounds.top + bounds.height - gap, anchor.top - gap);
  const belowHeight: number = Math.max(0, bounds.top + bounds.height - below);
  const aboveHeight: number = Math.max(0, above - bounds.top);
  const useBelow: boolean = height <= belowHeight || height > aboveHeight && belowHeight >= aboveHeight;
  const menuHeight: number = Math.min(height, useBelow ? belowHeight : aboveHeight);
  const primaryOffset: number = groupsOnRight ? 0 : menuWidth - primaryWidth;
  const left: number = anchor.left + (anchor.width - primaryWidth) / 2 - primaryOffset;
  const menuLeft: number = Math.max(bounds.left, Math.min(bounds.left + bounds.width - menuWidth, left));
  return { left: menuLeft, top: useBelow ? below : above - menuHeight, width: menuWidth, height: menuHeight,
    pointerSide: useBelow ? ActionMenuPointerSide.Top : ActionMenuPointerSide.Bottom,
    pointerCenter: anchor.left + anchor.width / 2 - (menuLeft + primaryOffset) };
}

/** 根据实测行高计算触发行锚点，不改变主菜单行距。 */
export function actionMenuGroupInset(rowHeights: number[], triggerIndex: number,
  groupHeight: number, fallbackRowHeight: number): number {
  let before: number = 0;
  for (let index: number = 0; index < triggerIndex; index++) before += rowHeights[index] ?? fallbackRowHeight;
  const triggerHeight: number = rowHeights[triggerIndex] ?? fallbackRowHeight;
  return Math.max(0, before + triggerHeight / 2 - groupHeight / 2);
}

export interface ActionMenuPanelPlacement { top: number; pointerCenter: number; }

/** 避让只移动左侧面板。尖角在面板边缘追随原触发行，右侧行距始终不变。 */
export function placeActionMenuGroups(anchors: number[], heights: number[], clearance: number,
  gap: number = 8): ActionMenuPanelPlacement[] {
  const tops: number[] = [];
  anchors.forEach((anchor: number, index: number): void => {
    const ideal: number = Math.max(0, anchor - heights[index] / 2);
    let top: number = Math.max(ideal, index === 0 ? 0 : tops[index - 1] + heights[index - 1] + gap);
    const latest: number = Math.max(0, anchor - clearance);
    if (index > 0 && top > latest) {
      let shift: number = top - latest;
      for (let previous: number = 0; previous < index; previous++) {
        shift = Math.min(shift, tops[previous] - Math.max(0, anchors[previous] - heights[previous] + clearance));
      }
      for (let previous: number = 0; previous < index; previous++) tops[previous] -= Math.max(0, shift);
      top = Math.max(ideal, tops[index - 1] + heights[index - 1] + gap);
    }
    tops.push(top);
  });
  return tops.map((top: number, index: number): ActionMenuPanelPlacement => {
    const edge: number = Math.min(clearance, heights[index] / 2);
    return { top: top, pointerCenter: Math.max(edge, Math.min(heights[index] - edge, anchors[index] - top)) };
  });
}

/** 路径坐标显式转换成 px；组件宽高及线宽继续使用 vp。 */
export function actionMenuBubbleOutline(width: number, height: number, pointerCenter: number,
  density: number, border: number, cornerRadius: number, depth: number, span: number,
  side: ActionMenuPointerSide = ActionMenuPointerSide.Right): string {
  const vertical: boolean = side === ActionMenuPointerSide.Top || side === ActionMenuPointerSide.Bottom;
  const bodyWidth: number = vertical ? height : width;
  const bodyHeight: number = vertical ? width : height;
  const inset: number = border / 2;
  const left: number = inset;
  const right: number = bodyWidth - inset;
  const top: number = inset;
  const bottom: number = bodyHeight - inset;
  const radius: number = Math.max(0, Math.min(cornerRadius, (bodyHeight - border) / 2, (bodyWidth - border) / 2));
  const half: number = Math.min(span / 2, Math.max(0, (bodyHeight - border) / 2 - radius));
  const requested: number = side === ActionMenuPointerSide.Bottom ? bodyHeight - pointerCenter : pointerCenter;
  const center: number = Math.max(top + radius + half, Math.min(bottom - radius - half, requested));
  const tip: number = right + depth;
  const point = (x: number, y: number): string => {
    if (side === ActionMenuPointerSide.Top) return `${y * density} ${(bodyWidth + depth - x) * density}`;
    if (side === ActionMenuPointerSide.Bottom) return `${(bodyHeight - y) * density} ${x * density}`;
    if (side === ActionMenuPointerSide.Left) return `${(bodyWidth + depth - x) * density} ${y * density}`;
    return `${x * density} ${y * density}`;
  };
  return `M ${point(left + radius, top)} L ${point(right - radius, top)} Q ${point(right, top)} ${point(right, top + radius)}` +
    ` L ${point(right, center - half)} C ${point(right, center - half / 2)} ${point(tip, center - 2)} ${point(tip, center)}` +
    ` C ${point(tip, center + 2)} ${point(right, center + half / 2)} ${point(right, center + half)}` +
    ` L ${point(right, bottom - radius)} Q ${point(right, bottom)} ${point(right - radius, bottom)} L ${point(left + radius, bottom)}` +
    ` Q ${point(left, bottom)} ${point(left, bottom - radius)} L ${point(left, top + radius)} Q ${point(left, top)} ${point(left + radius, top)} Z`;
}
