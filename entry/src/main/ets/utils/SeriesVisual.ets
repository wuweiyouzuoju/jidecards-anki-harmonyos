// SPDX-License-Identifier: AGPL-3.0-or-later
import { ColorMetrics } from '@kit.ArkUI';
import { MaterialOpacity, moduleOpacityPercent } from '../model/SurfaceMaterial';
import { tintGlassFill } from '../model/GlassTheme';
import { SurfaceBorder } from './SurfaceBorder';
import { SharedSurface, VisualPalette, VisualTokens, visualPalette } from 'jide_foundation';

/** 记得系列新视觉档的产品适配：只做语义色和几何映射，不拥有页面状态。 */
export class SeriesVisual {
  static readonly pageInset: number = VisualTokens.pageInset;
  static readonly contentMaxWidth: number = VisualTokens.contentMaxWidth;
  static readonly cardRadius: number = VisualTokens.cardRadius;
  static readonly cardInset: number = VisualTokens.cardInset;
  static readonly sectionGap: number = VisualTokens.sectionGap;
  static readonly actionHeight: number = VisualTokens.actionHeight;

  static isDark(mode: string, systemDark: boolean): boolean {
    return mode === 'dark' || (mode !== 'light' && systemDark);
  }

  /** 产品主题色覆盖系列默认动作色；页面底色微染仅在为六位 RGB 时采用。 */
  static palette(dark: boolean, action: string, pageTint: string = ''): VisualPalette {
    const base: VisualPalette = visualPalette(dark);
    return {
      page: base.page, surface: SeriesVisual.material() === 'flat' ? (dark ? '#000000' : '#FFFFFF') : tintGlassFill(base.surface, action, dark), text: base.text, secondaryText: base.secondaryText,
      border: dark ? '#77869A' : base.border, action: action, pageTint: SeriesVisual.rgb(pageTint) ? pageTint : base.pageTint,
      ambient: base.ambient
    };
  }

  static control(material: string, dark: boolean, action: string, radius: number, visible: boolean, fill: ResourceColor | undefined = undefined, opacity: number = 100): SharedSurface {
    return new ProductControl(dark, material, radius, SeriesVisual.palette(dark, action), visible, fill, opacity);
  }

  static primaryAction(material: string, dark: boolean, action: string, radius: number, opacity: number = 100): SharedSurface {
    const fill: ResourceColor | undefined = material === 'glass' && SeriesVisual.rgb(action) ?
      (dark ? '#33' : '#26') + action.slice(1) : undefined;
    return SeriesVisual.control(material, dark, action, radius, true, fill, opacity);
  }

  static buttonFill(fill: ResourceColor, opacity: number): ResourceColor {
    if (opacity === 100) return fill;
    try {
      const color: ColorMetrics = ColorMetrics.resourceColor(fill);
      return `rgba(${color.red},${color.green},${color.blue},${color.alpha * opacity / 25500})`;
    } catch (error) {
      return fill;
    }
  }

  /** 同层级表面只保留一档轻投影；内嵌、深色和扁平表面显式清除。 */
  static shadow(material: string, dark: boolean, nested: boolean = false): ShadowOptions {
    const visible: boolean = material === 'glass' && !dark && !nested;
    return { radius: visible ? 8 : 0, color: visible ? '#0C20304A' : '#00000000', offsetX: 0, offsetY: visible ? 2 : 0 };
  }

  static material(): string { return AppStorage.get<string>('surface_material') ?? 'flat'; }

  static settingsSurface(material: string, dark: boolean, action: string, pageTint: string, radius: number, opacity?: MaterialOpacity): SharedSurface {
    return SeriesVisual.clearSurface(material, dark, action, pageTint, radius, opacity);
  }

  /** 设置及详情模块共用轻透明底层，扁平模式沿用原表面。 */
  static clearSurface(material: string, dark: boolean, action: string, pageTint: string, radius: number = VisualTokens.cardRadius, opacity?: MaterialOpacity): SharedSurface {
    return SeriesVisual.surfaceFor(material, dark, action, pageTint, radius, opacity);
  }

  static surfaceFor(material: string, dark: boolean, action: string, pageTint: string = '',
    radius: number = VisualTokens.cardRadius, opacity?: MaterialOpacity): SharedSurface {
    return new ProductSurface(dark, material, radius, SeriesVisual.palette(dark, action, pageTint), false, false, opacity);
  }

  /** 已有玻璃容器内不重复绘制底色、轮廓和投影。 */
  static insetSurface(material: string, dark: boolean, action: string, pageTint: string, radius: number = VisualTokens.cardRadius): SharedSurface {
    return new ProductSurface(dark, material, radius, SeriesVisual.palette(dark, action, pageTint), false, true);
  }

  static surface(dark: boolean, action: string, pageTint: string = '', radius: number = VisualTokens.cardRadius,
    material: string = SeriesVisual.material(), reduceTransparency: boolean = false): SharedSurface {
    return new ProductSurface(dark, material, radius, SeriesVisual.palette(dark, action, pageTint), reduceTransparency);
  }

  /** 轻表面用于列表行和嵌套分组，不叠加厚材质和投影。 */
  static flatSurface(dark: boolean, action: string, pageTint: string = '',
    radius: number = VisualTokens.cardRadius, reduceTransparency: boolean = true): SharedSurface {
    return SeriesVisual.surface(dark, action, pageTint, radius, 'flat', reduceTransparency);
  }

  private static rgb(value: string): boolean {
    return /^#[0-9a-fA-F]{6}$/.test(value);
  }
}

/** 当前中性表面由公共基础 series 档绘制；本产品只映射资源和偏好。 */
class ProductSurface extends SharedSurface {
  private flatBorder: BorderOptions;
  private productRadius: number;
  private useFlatBorder: boolean;
  constructor(dark: boolean, material: string, radius: number, palette: VisualPalette, reduce: boolean = false,
    nested: boolean = false, opacity?: MaterialOpacity) {
    super(dark, material, reduce, radius, palette, true, 'content', 'series',
      opacity === undefined ? -1 : moduleOpacityPercent(opacity, material === 'glass' && !reduce ? 'glass' : 'flat', dark), nested);
    this.productRadius = radius;
    this.useFlatBorder = material !== 'glass' || reduce;
    this.flatBorder = SurfaceBorder.contentOptions('flat', dark, nested);
  }
  applyNormalAttribute(instance: CommonAttribute): void {
    super.applyNormalAttribute(instance);
    if (this.useFlatBorder) instance.border(this.flatBorder).borderRadius(this.productRadius);
  }
}

export class SeriesDeckSurface extends ProductSurface {
  constructor(material: string, dark: boolean, action: string, pageTint: string, radius: number, opacity?: MaterialOpacity) {
    super(dark, material, radius, SeriesVisual.palette(dark, action, pageTint), false, false, opacity);
  }
}

class ProductControl extends SharedSurface {
  private active: boolean;
  private flat: boolean;
  private flatFill: ResourceColor | undefined;
  private productOpacity: number;
  private controlRadius: number;
  constructor(dark: boolean, material: string, radius: number, palette: VisualPalette, active: boolean,
    fill: ResourceColor | undefined = undefined, opacity: number = 100) {
    super(dark, material, false, radius, palette, true, 'control', 'series', opacity);
    this.controlRadius = radius;
    this.active = active; this.flat = material !== 'glass'; this.flatFill = fill; this.productOpacity = opacity;
  }
  applyNormalAttribute(instance: CommonAttribute): void {
    if (!this.active) return;
    super.applyNormalAttribute(instance);
    if (this.flat) {
      instance.border(SurfaceBorder.options()).borderRadius(this.controlRadius);
      if (this.flatFill !== undefined) instance.backgroundColor(SeriesVisual.buttonFill(this.flatFill, this.productOpacity));
    }
  }
}
