// SPDX-License-Identifier: AGPL-3.0-or-later

/** 两页共用窗口限宽；横屏利用可用宽度，不缩放字形或改写牌组模板。 */
export function cardViewportWidth(width: number, height: number): number {
  if (width <= 0 || height <= 0 || !Number.isFinite(width) || !Number.isFinite(height)) return 840;
  if (width > height) return Math.min(width, Math.max(840, width * 0.92), 1600);
  return Math.min(width, 840);
}
