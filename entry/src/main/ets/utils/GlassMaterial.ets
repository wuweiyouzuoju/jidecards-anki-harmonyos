// SPDX-License-Identifier: AGPL-3.0-or-later
import { tintGlassFill } from '../model/GlassTheme';
import { ColorMetrics } from '@kit.ArkUI';
/** 只改变绘制背景，保持文字和图标的不透明度及资源主题语义。 */
export function translucentGlassFill(color: ResourceColor): ResourceColor {
  const resolved: ColorMetrics = ColorMetrics.resourceColor(color);
  const hex: string = '#' + [resolved.red, resolved.green, resolved.blue].map((value: number): string =>
    value.toString(16).padStart(2, '0')).join('');
  const tinted: ColorMetrics = ColorMetrics.resourceColor(themedGlassFill(hex, darkMaterial()));
  return `rgba(${tinted.red},${tinted.green},${tinted.blue},${resolved.alpha / 255 * (darkMaterial() ? 0.24 : 0.14)})`;
}

export function usesGlassMaterial(material: string = AppStorage.get<string>('surface_material') ?? 'flat'): boolean {
  return material === 'glass';
}
export function darkMaterial(): boolean {
  const mode: string = AppStorage.get<string>('themeMode') ?? 'system';
  return mode === 'dark' || (mode !== 'light' && (AppStorage.get<boolean>('systemDarkMode') ?? false));
}

/** 非系列控件和弹层也读取同一主题主色。 */
export function themedGlassFill(fill: string, dark: boolean, accent: string = AppStorage.get<string>('theme_color_action_primary') ?? ''): string {
  return tintGlassFill(fill, accent, dark);
}

/** 弹窗内层沿用外层真实折射，只增加轻色层，不注册自身采样。 */
export function insetMaterialFill(color: ResourceColor, material: string = AppStorage.get<string>('surface_material') ?? 'flat'): ResourceColor {
  return usesGlassMaterial(material) ? translucentGlassFill(color) : color;
}
