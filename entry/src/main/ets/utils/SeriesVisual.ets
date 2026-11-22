// SPDX-License-Identifier: AGPL-3.0-or-later
import { GLASS_BACKGROUND_SOURCE, sourceCaptureAllowed } from './GlassBackdrop';
import { activeElementStyle, elementRadius, elementBorder } from './AppearanceElements';
import { ColorMetrics } from '@kit.ArkUI';
import { MaterialOpacity, moduleOpacityPercent } from '../model/SurfaceMaterial';
import { tintGlassFill } from '../model/GlassTheme';
import { SurfaceBorder } from './SurfaceBorder';
import { SharedSurface, VisualPalette, VisualTokens, visualPalette, sharedGlassShadow, sharedGlassBlurRadius } from 'jide_foundation';

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
  static palette(dark: boolean, action: string, pageTint: string = '', material: string = SeriesVisual.material()): VisualPalette {
    const base: VisualPalette = visualPalette(dark);
    return {
      page: base.page, surface: material === 'flat' ? (dark ? '#000000' : '#FFFFFF') : tintGlassFill(base.surface, action, dark), text: base.text, secondaryText: base.secondaryText,
      border: dark ? '#77869A' : base.border, action: action, pageTint: SeriesVisual.rgb(pageTint) ? pageTint : base.pageTint,
      ambient: base.ambient
    };
  }

  static control(material: string, dark: boolean, action: string, radius: number, visible: boolean, fill: ResourceColor | undefined = undefined, opacity: number = 100, appearance: string = '', opticalTint: string = '', liveBackdrop: boolean = false, outlined: boolean = false): SharedSurface {
    return new ProductControl(dark, material, radius, SeriesVisual.palette(dark, action, '', material), visible, fill, opacity, opticalTint, liveBackdrop, outlined);
  }

  static primaryAction(material: string, dark: boolean, action: string, radius: number, opacity: number = 100, appearance: string = ''): SharedSurface {
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

  /** 可滚动模块末端留出公共投影的半径和纵向偏移。 */
  static scrollShadowEndInset(material: string, pageInset: number): number {
    if (material !== 'glass') return pageInset;
    const shadow: ShadowOptions = sharedGlassShadow(false);
    return Math.max(pageInset, Number(shadow.radius) + Number(shadow.offsetY ?? 0));
  }

  static scrollShadowStartInset(material: string, pageInset: number): number {
    if (material !== 'glass') return pageInset;
    const shadow: ShadowOptions = sharedGlassShadow(false);
    return Math.max(pageInset, Number(shadow.radius) - Number(shadow.offsetY ?? 0));
  }

  static material(): string { return AppStorage.get<string>('surface_material') ?? 'flat'; }

  static settingsSurface(material: string, dark: boolean, action: string, pageTint: string, radius: number, opacity?: MaterialOpacity, appearance: string = ''): SharedSurface {
    return SeriesVisual.clearSurface(material, dark, action, pageTint, radius, opacity);
  }

  /** 设置及详情模块共用轻透明底层，扁平模式沿用原表面。 */
  static clearSurface(material: string, dark: boolean, action: string, pageTint: string, radius: number = VisualTokens.cardRadius, opacity?: MaterialOpacity, appearance: string = ''): SharedSurface {
    return SeriesVisual.surfaceFor(material, dark, action, pageTint, radius, opacity);
  }

  static surfaceFor(material: string, dark: boolean, action: string, pageTint: string = '',
    radius: number = VisualTokens.cardRadius, opacity?: MaterialOpacity, appearance: string = ''): SharedSurface {
    return new ProductSurface(dark, material, radius, SeriesVisual.palette(dark, action, pageTint, material), false, false, opacity);
  }

  /** 已有玻璃容器内不重复绘制底色、轮廓和投影。 */
  static insetSurface(material: string, dark: boolean, action: string, pageTint: string, radius: number = VisualTokens.cardRadius, appearance: string = ''): SharedSurface {
    return new ProductSurface(dark, material, radius, SeriesVisual.palette(dark, action, pageTint, material), false, true);
  }

  static surface(dark: boolean, action: string, pageTint: string = '', radius: number = VisualTokens.cardRadius,
    material: string = SeriesVisual.material(), reduceTransparency: boolean = false, appearance: string = ''): SharedSurface {
    return new ProductSurface(dark, material, radius, SeriesVisual.palette(dark, action, pageTint, material), reduceTransparency);
  }

  /** 轻表面用于列表行和嵌套分组，不叠加厚材质和投影。 */
  static flatSurface(dark: boolean, action: string, pageTint: string = '',
    radius: number = VisualTokens.cardRadius, reduceTransparency: boolean = true, appearance: string = ''): SharedSurface {
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
  private nestedSurface: boolean;
  private darkSurface: boolean;
  private moduleBorder: BorderOptions;
  constructor(dark: boolean, material: string, radius: number, palette: VisualPalette, reduce: boolean = false,
    nested: boolean = false, opacity?: MaterialOpacity) {
    super(dark, material, reduce, elementRadius(radius, 'module'), palette, true, 'content', 'series',
      opacity === undefined ? -1 : moduleOpacityPercent(opacity, material === 'glass' && !reduce ? 'glass' : 'flat', dark), nested);
    this.darkSurface = dark;
    this.productRadius = elementRadius(radius, 'module');
    this.nestedSurface = nested;
    this.useFlatBorder = material !== 'glass' || reduce;
    this.flatBorder = SurfaceBorder.contentOptions('flat', dark, nested);
    this.moduleBorder = SurfaceBorder.contentOptions(material, dark, nested);
  }
  applyNormalAttribute(instance: CommonAttribute): void {
    super.applyNormalAttribute(instance);
    if (!this.useFlatBorder && !this.nestedSurface) {
      instance.backdropBlur(sharedGlassBlurRadius()).shadow(sharedGlassShadow(this.darkSurface));
    }
    // 每次明确覆盖基础材质的轮廓，恢复默认时也清掉之前的自定义线。
    instance.border(this.moduleBorder);
    instance.borderRadius(this.productRadius);
  }
}

export class SeriesDeckSurface extends ProductSurface {
  constructor(material: string, dark: boolean, action: string, pageTint: string, radius: number, opacity?: MaterialOpacity, appearance: string = '') {
    super(dark, material, radius, SeriesVisual.palette(dark, action, pageTint, material), false, false, opacity);
  }
}

class ProductControl extends SharedSurface {
  private active: boolean;
  private flat: boolean;
  private darkControl: boolean;
  private flatFill: ResourceColor | undefined;
  private productOpacity: number;
  private controlRadius: number;
  private outlined: boolean;
  constructor(dark: boolean, material: string, radius: number, palette: VisualPalette, active: boolean,
    fill: ResourceColor | undefined = undefined, opacity: number = 100, opticalTint: string = '', liveBackdrop: boolean = false, outlined: boolean = false) {
    super(dark, material, false, elementRadius(radius), palette, active, 'control', 'series', opacity, false,
      liveBackdrop ? '' : GLASS_BACKGROUND_SOURCE, (initialFrame: boolean = false): boolean => sourceCaptureAllowed(GLASS_BACKGROUND_SOURCE, initialFrame), opticalTint);
    this.controlRadius = elementRadius(radius);
    this.darkControl = dark;
    this.outlined = outlined;
    this.active = active; this.flat = material !== 'glass'; this.flatFill = fill; this.productOpacity = opacity;
  }
  applyNormalAttribute(instance: CommonAttribute): void {
    if (!this.active) { super.applyNormalAttribute(instance); return; }
    super.applyNormalAttribute(instance);
    instance.borderRadius(this.controlRadius);
    // 缓存层只绘制窄外沿反光；整面底色和模糊由原生宿主拥有。
    const material: string = this.flat ? 'flat' : 'glass';
    if (this.outlined) instance.border(SurfaceBorder.materialOptions(material, this.darkControl));
    else instance.border(SurfaceBorder.controlOptions(material, this.darkControl));
    if (this.flat && this.flatFill !== undefined) {
      instance.backgroundColor(SeriesVisual.buttonFill(this.flatFill, this.productOpacity));
    }
    instance.borderRadius(this.controlRadius);
  }
}
