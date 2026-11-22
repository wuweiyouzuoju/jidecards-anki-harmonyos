// SPDX-License-Identifier: AGPL-3.0-or-later
/** 模糊底图按像素预算采样；不改变原生文字、网格几何或物理模糊半径。 */
export function glassCaptureScale(width: number, height: number, blurStrength: number = 1): number {
  const longest: number = Math.max(width, height);
  // 清晰玻璃不能放大512px磨砂底图；无模糊时保留真实采样像素。
  if (blurStrength <= 0.05) return 1;
  const budget: number = blurStrength < 0.5 ? 1536 : blurStrength < 1 ? 1024 : 512;
  const maximum: number = blurStrength < 0.5 ? 1 : 0.5;
  return longest > 0 ? Math.min(maximum, budget / longest) : maximum;
}

export interface GlassCaptureGeometry { left: number; top: number; width: number; height: number; }

/** 采样帧只能用于同一窗口几何，容忍原生测量的半像素舍入。 */
export function sameGlassCaptureGeometry(a: GlassCaptureGeometry, b: GlassCaptureGeometry): boolean {
  return Math.abs(a.left - b.left) <= 0.5 && Math.abs(a.top - b.top) <= 0.5 &&
    Math.abs(a.width - b.width) <= 0.5 && Math.abs(a.height - b.height) <= 0.5;
}
