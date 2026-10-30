// SPDX-License-Identifier: AGPL-3.0-or-later
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

  static control(material: string, dark: boolean, action: string, radius: number, visible: boolean): SharedSurface {
    return new ProductControl(dark, material, radius, SeriesVisual.palette(dark, action), visible);
  }

  /** 同层级表面只保留一档轻投影；内嵌、深色和扁平表面显式清除。 */
  static shadow(material: string, dark: boolean, nested: boolean = false): ShadowOptions {
    const visible: boolean = material === 'glass' && !dark && !nested;
    return { radius: visible ? 8 : 0, color: visible ? '#0C20304A' : '#00000000', offsetX: 0, offsetY: visible ? 2 : 0 };
  }

  static material(): string { return AppStorage.get<string>('surface_material') ?? 'flat'; }

  static settingsSurface(material: string, dark: boolean, action: string, pageTint: string, radius: number): SharedSurface {
    return SeriesVisual.clearSurface(material, dark, action, pageTint, radius);
  }

  /** 设置及详情模块共用有承托感的玻璃底层，扁平模式沿用原表面。 */
  static clearSurface(material: string, dark: boolean, action: string, pageTint: string, radius: number = VisualTokens.cardRadius): SharedSurface {
    return SeriesVisual.surfaceFor(material, dark, action, pageTint, radius);
  }

  static surfaceFor(material: string, dark: boolean, action: string, pageTint: string = '',
    radius: number = VisualTokens.cardRadius): SharedSurface {
    return new ProductSurface(dark, material, radius, SeriesVisual.palette(dark, action, pageTint));
  }

  /** 已有玻璃容器内仅保留边界，避免嵌套重复叠加不透明度。 */
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

/** 产品材质只调整表面：扁平清除所有旧效果，深色玻璃避免亮白塑料高光。 */
class ProductSurface extends SharedSurface {
  private productDark: boolean;
  private glass: boolean;
  private nested: boolean;
  private productRadius: number;
  private outline: BorderOptions;
  private tintedFill: string;
  constructor(dark: boolean, material: string, radius: number, palette: VisualPalette, reduce: boolean = false, nested: boolean = false) {
    super(dark, material, reduce, radius, palette);
    this.tintedFill = tintGlassFill(dark ? '#AD18202B' : '#A6FFFFFF', palette.action, dark);
    this.productDark = dark;
    this.glass = material === 'glass' && !reduce;
    this.nested = nested;
    this.productRadius = radius;
    this.outline = SurfaceBorder.materialOptions(this.glass ? 'glass' : 'flat', dark);
  }
  applyNormalAttribute(instance: CommonAttribute): void {
    super.applyNormalAttribute(instance);
    instance.shadow(SeriesVisual.shadow(this.glass ? 'glass' : 'flat', this.productDark, this.nested));
    if (!this.glass) {
      instance.backgroundColor(this.productDark ? '#000000' : '#FFFFFF')
        .border(this.productDark ? SurfaceBorder.options() : {width: 1, color: '#E5E5E5'}).borderRadius(this.productRadius);
    } else {
      instance.backgroundBlurStyle(BlurStyle.NONE).backdropBlur(0)
        .backgroundColor(this.nested ? Color.Transparent : this.tintedFill)
        .linearGradient({angle:135,colors:this.nested ? [[Color.Transparent,0],[Color.Transparent,1]] :
          [['#00FFFFFF',0],['#00FFFFFF',1]]})
        .border(this.outline).borderRadius(this.productRadius)
        .shadow(SeriesVisual.shadow('glass', this.productDark, this.nested));
    }
  }
}

/** 选中覆盖层由牌组行拥有，材质始终完整绘制背景与边框。 */
export class SeriesDeckSurface extends ProductSurface {
  constructor(material: string, dark: boolean, action: string, pageTint: string, radius: number) {
    super(dark, material, radius, SeriesVisual.palette(dark, action, pageTint));
  }
}


class ProductControl extends SharedSurface {
  private active: boolean;
  private controlDarkFlat: boolean;
  private lightGlass: boolean;
  private controlOutline: BorderOptions;
  private controlRadius: number;
  private controlShadow: ShadowOptions;
  constructor(dark: boolean, material: string, radius: number, palette: VisualPalette, active: boolean) {
    super(dark, material, false, radius, palette, true, 'control');
    this.controlShadow = SeriesVisual.shadow(material, dark);
    this.controlOutline = SurfaceBorder.materialOptions(material, dark);
    this.active = active;
    this.lightGlass = !dark && material === 'glass';
    this.controlDarkFlat = dark && material !== 'glass';
    this.controlRadius = radius;
  }
  applyNormalAttribute(instance: CommonAttribute): void {
    if (this.active) {
      super.applyNormalAttribute(instance);
      instance.shadow(this.controlShadow);
      if (this.lightGlass) instance.border(this.controlOutline).borderRadius(this.controlRadius);
      if (this.controlDarkFlat) instance.border(SurfaceBorder.options()).borderRadius(this.controlRadius);
    }
  }
}

