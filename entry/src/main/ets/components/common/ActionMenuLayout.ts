// SPDX-License-Identifier: AGPL-3.0-or-later
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
  density: number, border: number, cornerRadius: number, depth: number, span: number): string {
  const inset: number = border / 2;
  const left: number = inset * density;
  const right: number = (width - inset) * density;
  const top: number = inset * density;
  const bottom: number = (height - inset) * density;
  const radius: number = Math.min(cornerRadius, (height - border) / 2, (width - border) / 2) * density;
  const half: number = Math.min(span / 2, Math.max(0, (height - border) / 2 - radius / density)) * density;
  const center: number = Math.max(top + radius + half, Math.min(bottom - radius - half, pointerCenter * density));
  const tip: number = right + depth * density;
  const bend: number = 2 * density;
  return `M ${left + radius} ${top} H ${right - radius} Q ${right} ${top} ${right} ${top + radius}` +
    ` V ${center - half} C ${right} ${center - half / 2} ${tip} ${center - bend} ${tip} ${center}` +
    ` C ${tip} ${center + bend} ${right} ${center + half / 2} ${right} ${center + half}` +
    ` V ${bottom - radius} Q ${right} ${bottom} ${right - radius} ${bottom} H ${left + radius}` +
    ` Q ${left} ${bottom} ${left} ${bottom - radius} V ${top + radius} Q ${left} ${top} ${left + radius} ${top} Z`;
}
