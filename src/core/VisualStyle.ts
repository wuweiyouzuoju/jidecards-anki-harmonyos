// SPDX-License-Identifier: AGPL-3.0-or-later
import { ThemePalette, themePalette } from './Theme';
import { motionProfile } from './Motion';

/** 新视觉档显式采用；旧产品的12vp/18vp几何不随依赖更新而改变。 */
export class VisualTokens {
  static readonly pageInset: number = 16;
  static readonly contentMaxWidth: number = 560;
  static readonly cardRadius: number = 22;
  static readonly cardInset: number = 16;
  static readonly sectionGap: number = 12;
  static readonly controlHeight: number = 44;
  static readonly actionHeight: number = 52;
  static readonly actionRadius: number = 26;
}

export interface VisualPalette extends ThemePalette {
  pageTint: string;
  ambient: string;
}

/** 产品可提供完整语义色；默认值沿用基础库配色。ARGB与鸿蒙资源一致。 */
export function visualPalette(dark: boolean): VisualPalette {
  const base: ThemePalette = themePalette(dark);
  return { page: base.page, surface: base.surface, text: base.text,
    secondaryText: base.secondaryText, border: base.border, action: base.action,
    pageTint: dark ? '#1C263D' : '#E9EEFC', ambient: dark ? '#292C40' : '#F0EAF8' };
}

export function visualAlpha(color: string, opacity: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(color) || !Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
    throw new Error('Expected RGB color and opacity in [0,1]');
  }
  return '#' + Math.round(opacity * 255).toString(16).padStart(2, '0') + color.slice(1);
}

export interface SurfaceAppearance {
  fill: string;
  border: string;
  borderWidth: number;
  shadowColor: string;
  shadowRadius: number;
  shadowY: number;
  blur: boolean;
  highlight: string[];
}

/** 透明度偏好关闭材质后仍保留表面边界；扁平档始终无模糊和投影。 */
export function surfaceAppearance(palette: VisualPalette, dark: boolean,
  material: string = 'glass', reduceTransparency: boolean = false, role: string = 'content',
  profile: string = 'legacy', opacityPercent: number = -1, nested: boolean = false): SurfaceAppearance {
  if (material !== 'glass' && material !== 'flat') { throw new Error('Invalid surface material'); }
  if (role !== 'content' && role !== 'control') { throw new Error('Invalid surface role'); }
  if (profile !== 'legacy' && profile !== 'series') { throw new Error('Invalid surface profile'); }
  if (profile === 'series') return seriesSurfaceAppearance(palette, dark, material, reduceTransparency, role, opacityPercent, nested);
  const control: boolean = role === 'control';
  const glass: boolean = material === 'glass' && !reduceTransparency;
  return {
    fill: glass ? visualAlpha(palette.surface, control ? (dark ? 0.24 : 0.14) : (dark ? 0.68 : 0.48)) : palette.surface,
    border: glass ? (dark ? '#22FFFFFF' : '#CCFFFFFF') : palette.border,
    borderWidth: glass ? 0.8 : 1,
    shadowColor: glass ? (dark ? '#18000000' : '#10000000') : '#00000000',
    shadowRadius: glass ? (dark ? 10 : 14) : 0, shadowY: glass ? (dark ? 3 : 6) : 0, blur: glass,
    highlight: glass ? (dark ? ['#08FFFFFF', '#00FFFFFF', '#03FFFFFF'] : ['#45FFFFFF', '#04FFFFFF', '#20FFFFFF']) : ['#00FFFFFF', '#00FFFFFF', '#00FFFFFF']
  };
}

/** 当前闪卡中性材质：内容是绝对不透明度，按钮是不透明度倍率；产品持有偏好与资源。 */
export function seriesSurfaceAppearance(palette: VisualPalette, dark: boolean,
  material: string = 'glass', reduceTransparency: boolean = false, role: string = 'content',
  opacityPercent: number = -1, nested: boolean = false): SurfaceAppearance {
  if (material !== 'glass' && material !== 'flat') throw new Error('Invalid surface material');
  if (role !== 'content' && role !== 'control') throw new Error('Invalid surface role');
  if (opacityPercent !== -1 && (!Number.isInteger(opacityPercent) || opacityPercent < 0 || opacityPercent > 100))
    throw new Error('Invalid surface opacity');
  const glass: boolean = material === 'glass' && !reduceTransparency;
  const control: boolean = role === 'control';
  const defaults: number = glass ? (dark ? 35 : 32) : 100;
  const percent: number = opacityPercent < 0 ? defaults : control ? defaults * opacityPercent / 100 : opacityPercent;
  const neutral: string = dark ? '#1C1C1E' : '#FFFFFF';
  const fill: string = glass && nested ? '#00000000' : visualAlpha(!glass && control ? palette.surface : neutral, percent / 100).toUpperCase();
  const shadow: boolean = glass && !dark && !nested;
  return {
    fill, border: glass ? (dark ? '#22FFFFFF' : control ? '#9EFFFFFF' : '#00000000') : palette.border,
    borderWidth: glass ? (nested ? 0 : dark ? 0.8 : control ? 0.9 : 0) : (dark && !nested || control ? 1 : 0),
    shadowColor: shadow ? '#0C20304A' : '#00000000', shadowRadius: shadow ? 8 : 0,
    shadowY: shadow ? 2 : 0, blur: glass && control && !nested,
    highlight: ['#00FFFFFF', '#00FFFFFF', '#00FFFFFF']
  };
}

export function visualPressScale(style: string, reduceMotion: boolean): number {
  const scale: number = motionProfile(style).pressScale;
  return reduceMotion ? 1 : scale;
}
