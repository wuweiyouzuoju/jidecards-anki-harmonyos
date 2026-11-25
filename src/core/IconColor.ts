// SPDX-License-Identifier: AGPL-3.0-or-later
/** 当前 ActionIcon 的颜色矩阵：独立染色 RGB，原始 alpha 原样保留。 */
export function iconArgbMatrix(color: number): number[] {
  const red: number = ((color >>> 16) & 255) / 255;
  const green: number = ((color >>> 8) & 255) / 255;
  const blue: number = (color & 255) / 255;
  return [0, 0, 0, 0, red, 0, 0, 0, 0, green, 0, 0, 0, 0, blue, 0, 0, 0, 1, 0];
}

export function iconStrokeMatrix(strokeColor: string): number[] {
  if (!/^#[0-9a-fA-F]{6}$/.test(strokeColor)) {
    return [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
  }
  return iconArgbMatrix(Number.parseInt(strokeColor.slice(1), 16));
}

/** 空心图标用描边表达语义色，不能将半透明内填色重新涂入封闭路径。 */
export function iconOutlineColor(tint: string, strokeColor: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(strokeColor)) return strokeColor;
  if (/^#[0-9a-fA-F]{6}$/.test(tint)) return tint;
  if (/^#[0-9a-fA-F]{8}$/.test(tint) && Number.parseInt(tint.slice(1, 3), 16) > 0) return `#${tint.slice(3)}`;
  return '';
}
