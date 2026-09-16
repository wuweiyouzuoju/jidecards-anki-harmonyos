// SPDX-License-Identifier: AGPL-3.0-or-later

/** 将主题配置中的任意多色渐变转换为 ArkUI 停靠点，组件无需写死颜色。 */
export function themeGradient(colors: string[]): Array<[ResourceColor, number]> {
  if (colors.length === 0) return [[Color.Transparent, 0], [Color.Transparent, 1]];
  return colors.map((color: string, index: number): [ResourceColor, number] =>
    [color, colors.length === 1 ? 0 : index / (colors.length - 1)]);
}

export function themeProgressGradient(colors: string[]): LinearGradient {
  return new LinearGradient(colors.map((color: string, index: number): ColorStop => ({
    color: color, offset: colors.length === 1 ? 0 : index / (colors.length - 1)
  })));
}
