// SPDX-License-Identifier: AGPL-3.0-or-later
/** 玻璃不叠资源色填充，保持文字和图标的不透明度及资源主题语义。 */
export function translucentGlassFill(color: ResourceColor): ResourceColor {
  return Color.Transparent;
}

export function usesGlassMaterial(material: string = AppStorage.get<string>('surface_material') ?? 'flat'): boolean {
  return material === 'glass';
}
export function darkMaterial(): boolean {
  const mode: string = AppStorage.get<string>('themeMode') ?? 'system';
  return mode === 'dark' || (mode !== 'light' && (AppStorage.get<boolean>('systemDarkMode') ?? false));
}

/** 保留调用契约；玻璃底层不再染主题色或叠加底色。 */
export function themedGlassFill(fill: string, dark: boolean, accent: string = AppStorage.get<string>('theme_color_action_primary') ?? ''): string {
  return '#00000000';
}

/** 弹窗内层沿用外层真实折射，不叠色层或注册自身采样。 */
export function insetMaterialFill(color: ResourceColor, material: string = AppStorage.get<string>('surface_material') ?? 'flat'): ResourceColor {
  return usesGlassMaterial(material) ? translucentGlassFill(color) : color;
}

/** 玻璃页面或已设置壁纸时，页面壳透出根背景；卡片正文、画布和输入表面不使用此规则。 */
export function pageMaterialFill(flatFill: ResourceColor, material: string, wallpaperPath: string): ResourceColor {
  return usesGlassMaterial(material) || wallpaperPath !== '' ? Color.Transparent : flatFill;
}
