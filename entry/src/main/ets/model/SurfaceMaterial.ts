// SPDX-License-Identifier: AGPL-3.0-or-later
export const DEFAULT_SURFACE_MATERIAL: string = 'flat';
export const GLASS_SUGGESTION_HANDLED_KEY: string = 'glass_suggestion_handled_v1';
export const GLASS_SUGGESTION_PENDING_KEY: string = 'glass_suggestion_pending';
export const SURFACE_MATERIAL_KEY: string = 'surface_material';
export const SURFACE_MATERIALS: string[] = ['flat', 'glass'];
export function isSurfaceMaterial(value: string): boolean { return SURFACE_MATERIALS.includes(value); }
export function surfaceMaterialTitleKey(value: string): string { return value === 'glass' ? 'surface_material_glass' : 'surface_material_flat'; }

export const MODULE_OPACITY_KEY: string = 'module_opacity';
export const FLAT_MODULE_OPACITY_KEY: string = 'flat_module_opacity';
export const GLASS_MODULE_OPACITY_KEY: string = 'glass_module_opacity';
export interface MaterialOpacity { flat: number; glass: number; }
export const DEFAULT_MODULE_OPACITY: MaterialOpacity = { flat: 100, glass: -1 };

export function validModuleOpacity(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 100;
}

export function moduleOpacityPercent(values: MaterialOpacity, material: string, dark: boolean): number {
  return material === 'glass' ? (values.glass < 0 ? (dark ? 35 : 32) : values.glass) : values.flat;
}

export const BUTTON_OPACITY_KEY: string = 'button_opacity';
export const FLAT_BUTTON_OPACITY_KEY: string = 'flat_button_opacity';
export const GLASS_BUTTON_OPACITY_KEY: string = 'glass_button_opacity';
export const DEFAULT_BUTTON_OPACITY: MaterialOpacity = { flat: 100, glass: 100 };

export function buttonOpacityPercent(values: MaterialOpacity | undefined, material: string): number {
  const opacity: MaterialOpacity = values ?? DEFAULT_BUTTON_OPACITY;
  return material === 'glass' ? opacity.glass : opacity.flat;
}

export const DIALOG_OPACITY_KEY: string = 'dialog_opacity';
export const FLAT_DIALOG_OPACITY_KEY: string = 'flat_dialog_opacity';
export const GLASS_DIALOG_OPACITY_KEY: string = 'glass_dialog_opacity';
export const DEFAULT_DIALOG_OPACITY: MaterialOpacity = { flat: 94, glass: 0 };

export function dialogOpacityPercent(values: MaterialOpacity | undefined, material: string): number {
  const opacity: MaterialOpacity = values ?? DEFAULT_DIALOG_OPACITY;
  return material === 'glass' ? opacity.glass : opacity.flat;
}

export interface SurfaceMaterialItem { id: string; titleKey: string; }
export const SURFACE_MATERIAL_ITEMS: SurfaceMaterialItem[] = [
  { id: 'surface_material', titleKey: 'surface_material' },
  { id: 'module_opacity', titleKey: 'module_opacity' },
  { id: 'button_opacity', titleKey: 'button_opacity' },
  { id: 'dialog_opacity', titleKey: 'dialog_opacity' }
];
