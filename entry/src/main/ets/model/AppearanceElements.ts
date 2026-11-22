// SPDX-License-Identifier: AGPL-3.0-or-later
import { validAccent } from './AppearanceCustomization';
export const APPEARANCE_ELEMENTS_KEY: string = 'appearance_elements';
export const APPEARANCE_ELEMENTS_PREVIEW_KEY: string = 'appearance_elements_preview';
export const APPEARANCE_ELEMENTS_ACTIVE_KEY: string = 'appearance_elements_active';
export interface AppearanceElementStyle {
  text: string; moduleOutline: string; outline: string; background: string; radius: number; width: number; moduleRadius: number; moduleWidth: number; blur: number;
}
export interface AppearanceElementProfiles { light: AppearanceElementStyle; dark: AppearanceElementStyle; }
export interface AppearanceElementItem { id: string; titleKey: string; opens?: string; }
export const APPEARANCE_ELEMENT_ITEMS: AppearanceElementItem[] = [
  { id: 'appearance_text', titleKey: 'appearance_element_text', opens: 'appearance_customization' },
  { id: 'appearance_module_outline', titleKey: 'appearance_element_module_outline', opens: 'appearance_customization' },
  { id: 'appearance_outline', titleKey: 'appearance_element_outline', opens: 'appearance_customization' },
  { id: 'appearance_background', titleKey: 'appearance_element_background', opens: 'appearance_customization' }
];
export const APPEARANCE_ELEMENT_CONTROLS: AppearanceElementItem[] = [
  { id: 'appearance_element_color', titleKey: 'appearance_element_color' },
  { id: 'appearance_border_radius', titleKey: 'appearance_border_radius' },
  { id: 'appearance_border_width', titleKey: 'appearance_border_width' },
  { id: 'appearance_element_reset', titleKey: 'appearance_element_reset' },
  { id: 'appearance_element_apply', titleKey: 'appearance_element_apply' }
];
export function defaultElementStyle(): AppearanceElementStyle {
  return { text: '', moduleOutline: '', outline: '', background: '', radius: -1, width: -1, moduleRadius: -1, moduleWidth: -1, blur: 80 };
}
export function parseElementStyle(raw: string): AppearanceElementStyle {
  if (raw === '') return defaultElementStyle();
  const value: AppearanceElementStyle = JSON.parse(raw) as AppearanceElementStyle;
  if (value && value.moduleRadius === undefined) value.moduleRadius = -1;
  if (value && value.moduleWidth === undefined) value.moduleWidth = -1;
  if (value && value.moduleOutline === undefined) value.moduleOutline = '';
  if (!value || ![value.moduleOutline, value.text, value.outline, value.background].every((color: string): boolean => color === '' || typeof color === 'string' && validAccent(color)) ||
    !Number.isInteger(value.radius) || value.radius < -1 || value.radius > 32 ||
    !Number.isFinite(value.width) || (value.width !== -1 && (value.width < 0 || value.width > 4 || !Number.isInteger(value.width * 2))) ||
    !Number.isInteger(value.moduleRadius) || value.moduleRadius < -1 || value.moduleRadius > 32 ||
    !Number.isFinite(value.moduleWidth) || value.moduleWidth !== -1 && (value.moduleWidth < 0 || value.moduleWidth > 4 || !Number.isInteger(value.moduleWidth * 2)) ||
    !Number.isInteger(value.blur) || value.blur < 0 || value.blur > 100) throw new Error('invalid_appearance_elements');
  return value;
}
export function parseElementProfiles(raw: string): AppearanceElementProfiles {
  if (raw === '') return { light: defaultElementStyle(), dark: defaultElementStyle() };
  const value: AppearanceElementProfiles = JSON.parse(raw) as AppearanceElementProfiles;
  return { light: parseElementStyle(JSON.stringify(value.light)), dark: parseElementStyle(JSON.stringify(value.dark)) };
}
export function elementStyleFor(raw: string, dark: boolean): AppearanceElementStyle {
  const profiles: AppearanceElementProfiles = parseElementProfiles(raw);
  return dark ? profiles.dark : profiles.light;
}
export function replaceElementStyle(raw: string, dark: boolean, style: AppearanceElementStyle): string {
  const profiles: AppearanceElementProfiles = parseElementProfiles(raw);
  const checked: AppearanceElementStyle = parseElementStyle(JSON.stringify(style));
  if (dark) profiles.dark = checked; else profiles.light = checked;
  return JSON.stringify(profiles);
}

export const APPEARANCE_EDITOR_SECTION_KEY: string = 'appearance_editor_section';
export const APPEARANCE_EDITOR_SECTIONS: AppearanceElementItem[] = [
  { id: 'color', titleKey: 'appearance_custom_color' },
  ...APPEARANCE_ELEMENT_ITEMS,
  { id: 'material', titleKey: 'surface_material' },
  { id: 'wallpaper', titleKey: 'appearance_wallpaper' }
];
export function validAppearanceSection(section: string): boolean {
  return APPEARANCE_EDITOR_SECTIONS.some((item): boolean => item.id === section);
}

/** 自定义细线以完整物理像素绘制，0保持隐藏，不改写持久化用户值。 */
export function alignedOutlineWidth(width: number, density: number): number {
  if (width <= 0 || !Number.isFinite(density) || density <= 0) return width;
  return Math.max(1, Math.round(width * density)) / density;
}
