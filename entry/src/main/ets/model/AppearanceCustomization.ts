// SPDX-License-Identifier: AGPL-3.0-or-later
export const PREVIEW_ACCENT_KEY: string = 'appearance_preview_accent';
export const ACCENT_LIGHT_ADAPTATION_KEY: string = 'appearance_accent_light_adaptation';
export const ACCENT_DARK_ADAPTATION_KEY: string = 'appearance_accent_dark_adaptation';
export const PREVIEW_LIGHT_ADAPTATION_KEY: string = 'appearance_preview_light_adaptation';
export const PREVIEW_DARK_ADAPTATION_KEY: string = 'appearance_preview_dark_adaptation';
export interface AccentAdaptation { light: number; dark: number; }
export function adaptationStrength(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error('invalid_accent_adaptation');
  return value;
}
export function adaptedAccent(seed: string, automatic: string, strength: number): string {
  const amount: number = adaptationStrength(strength) / 100;
  if (amount === 1) return automatic;
  if (amount === 0) return normalizedAccent(seed);
  const channels: number[] = [1, 3, 5].map((offset: number): number =>
    parseInt(seed.slice(offset, offset + 2), 16) * (1 - amount) + parseInt(automatic.slice(offset, offset + 2), 16) * amount);
  return rgbAccent(channels[0], channels[1], channels[2]);
}
export const CUSTOM_ACCENT_KEY: string = 'appearance_custom_accent';
export const WALLPAPER_KEY: string = 'appearance_wallpaper';
export const WALLPAPER_OPACITY_KEY: string = 'wallpaper_opacity';
export const WALLPAPER_LIGHT_KEY: string = 'appearance_wallpaper_light';
export const WALLPAPER_DARK_KEY: string = 'appearance_wallpaper_dark';
export const DEFAULT_CUSTOM_ACCENT: string = '#5B6B8A';
export function validAccent(value: string): boolean { return /^#[0-9a-fA-F]{6}$/.test(value); }
export function normalizedAccent(value: string): string {
  if (!validAccent(value)) throw new Error('invalid_custom_accent');
  return value.toUpperCase();
}
export function maskOpacity(value: number): number {
  if (!Number.isFinite(value)) throw new Error('invalid_wallpaper_mask');
  return Math.max(0, Math.min(0.85, value));
}
export function rgbAccent(red: number, green: number, blue: number): string {
  return '#' + [red, green, blue].map((channel: number): string =>
    Math.round(Math.max(0, Math.min(255, channel))).toString(16).padStart(2, '0')).join('').toUpperCase();
}

export interface AppearanceCustomizationItem { id: string; titleKey: string; }
export const APPEARANCE_CUSTOMIZATION_ITEMS: AppearanceCustomizationItem[] = [
  { id: 'custom_accent', titleKey: 'appearance_custom_color' },
  { id: 'accent_light_adaptation', titleKey: 'appearance_light_adaptation' },
  { id: 'accent_dark_adaptation', titleKey: 'appearance_dark_adaptation' },
  { id: 'apply_accent', titleKey: 'appearance_apply_color' },
  { id: 'wallpaper_choose', titleKey: 'appearance_choose_wallpaper' },
  { id: 'wallpaper_remove', titleKey: 'appearance_remove_wallpaper' },
  { id: 'wallpaper_crop_apply', titleKey: 'appearance_apply_crop' },
  { id: 'wallpaper_save_lossless', titleKey: 'appearance_wallpaper_lossless' },
  { id: 'wallpaper_save_compact', titleKey: 'appearance_wallpaper_compact' },
  { id: 'wallpaper_crop_cancel', titleKey: 'appearance_cancel_crop' },
  { id: 'wallpaper_opacity', titleKey: 'appearance_wallpaper_opacity' },
  { id: 'wallpaper_apply', titleKey: 'deck_customize_save' },
  { id: 'wallpaper_masks', titleKey: 'appearance_apply_masks' }
];
