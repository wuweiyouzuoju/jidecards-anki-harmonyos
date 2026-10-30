// SPDX-License-Identifier: AGPL-3.0-or-later
/** 菜单按文字和入口宽度收缩，宽屏不无限拉伸；长标签自然换行。 */
export function selectionMenuWidth(textWidth: number, triggerWidth: number): number {
  return Math.min(280, Math.max(160, Math.max(0, textWidth) + 32, Math.max(0, triggerWidth)));
}
export function selectionMenuMaxHeight(height: number, safeTop: number, safeBottom: number): number {
  return Math.max(44, height - safeTop - safeBottom - 32);
}

export interface SelectionRect { left: number; top: number; width: number; height: number; }
/** 以实际弹层与入口的边缘关系判定方向，系统避让后仍指向真实弹层。 */
export function selectionPopupAngle(trigger: SelectionRect, popup: SelectionRect): number {
  if (popup.top >= trigger.top + trigger.height - 1) return 90;
  if (popup.top + popup.height <= trigger.top + 1) return -90;
  if (popup.left >= trigger.left + trigger.width - 1) return 0;
  if (popup.left + popup.width <= trigger.left + 1) return 180;
  return popup.top + popup.height / 2 >= trigger.top + trigger.height / 2 ? 90 : -90;
}
export function selectionClosedAngle(openAngle: number): number {
  return openAngle === 0 || openAngle === 180 ? 90 : 0;
}
