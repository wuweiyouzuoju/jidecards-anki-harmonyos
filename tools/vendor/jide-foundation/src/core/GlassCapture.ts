// SPDX-License-Identifier: AGPL-3.0-or-later
/** 模糊底图按像素预算采样；不改变原生文字、网格几何或物理模糊半径。 */
export function glassCaptureScale(width: number, height: number): number {
  const longest: number = Math.max(width, height);
  return longest > 0 ? Math.min(0.5, 512 / longest) : 0.5;
}
