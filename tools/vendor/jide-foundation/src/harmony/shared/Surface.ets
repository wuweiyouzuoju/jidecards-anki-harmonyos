// SPDX-License-Identifier: AGPL-3.0-or-later
import { popupAppearance, PopupAppearance, dialogPanelFill } from '../../core/PopupAppearance';
import { VisualPalette, visualPalette, surfaceAppearance, SurfaceAppearance, VisualTokens } from '../../core/VisualStyle';

/** 只拥有表面绘制；内外间距、布局、转场和关闭策略仍由调用方拥有。 */
export class SharedSurface implements AttributeModifier<CommonAttribute> {
  private dark: boolean;
  private material: string;
  private reduceTransparency: boolean;
  private radius: number;
  private palette: VisualPalette;
  private visible: boolean;
  private role: string;
  private profile: string;
  private sharedOpacityPercent: number;
  private sharedNested: boolean;

  constructor(dark: boolean = false, material: string = 'glass', reduceTransparency: boolean = false,
    radius: number = VisualTokens.cardRadius, palette: VisualPalette = visualPalette(dark), visible: boolean = true, role: string = 'content',
    profile: string = 'legacy', opacityPercent: number = -1, nested: boolean = false) {
    this.dark = dark;
    this.material = material;
    this.reduceTransparency = reduceTransparency;
    this.radius = radius;
    this.palette = palette;
    this.visible = visible;
    this.role = role;
    this.profile = profile;
    this.sharedOpacityPercent = opacityPercent;
    this.sharedNested = nested;
  }

  applyNormalAttribute(instance: CommonAttribute): void {
    if (!this.visible) {
      instance.backgroundColor(Color.Transparent).backgroundBlurStyle(BlurStyle.NONE).backdropBlur(0)
        .linearGradient({ angle: 135, colors: [[Color.Transparent, 0], [Color.Transparent, 0.5], [Color.Transparent, 1]] })
        .border({ width: 0, color: Color.Transparent }).shadow({ radius: 0, color: Color.Transparent, offsetX: 0, offsetY: 0 });
      return;
    }
    const style: SurfaceAppearance = surfaceAppearance(this.palette, this.dark, this.material, this.reduceTransparency, this.role,
      this.profile, this.sharedOpacityPercent, this.sharedNested);
    instance.backgroundBlurStyle(BlurStyle.NONE).backdropBlur(style.blur ? 24 : 0)
      .backgroundColor(style.fill)
      .linearGradient({ angle: 135, colors: [[style.highlight[0], 0], [style.highlight[1], 0.5], [style.highlight[2], 1]] })
      .border({ width: style.borderWidth, color: style.border }).borderRadius(this.radius)
      .shadow({ radius: style.shadowRadius, color: style.shadowColor, offsetX: 0, offsetY: style.shadowY });
  }
}


/** 弹窗与菜单的唯一材质入口；本体不叠模糊，页面遮罩独占背景效果。 */
export class SharedPopupSurface implements AttributeModifier<CommonAttribute> {
  private material: string;
  private dark: boolean;
  private radius: number;
  private role: string;
  private visible: boolean;
  private opaque: boolean;
  private lineColor: ResourceColor;
  private panelOpacity: number | undefined;
  constructor(material: string, dark: boolean, radius: number, role: string = 'dialog', visible: boolean = true, opaque: boolean = false, panelOpacity?: number, lineColor: ResourceColor = '#CFD7E3') {
    this.panelOpacity = panelOpacity; this.lineColor = lineColor;
    this.opaque = opaque;
    this.material = material; this.dark = dark; this.radius = radius; this.role = role; this.visible = visible;
  }
  applyNormalAttribute(instance: CommonAttribute): void {
    if (!this.visible) {
      instance.backgroundColor(Color.Transparent).backgroundBlurStyle(BlurStyle.NONE).backdropBlur(0).border({ width: 0 })
        .linearGradient({ angle: 135, colors: [[Color.Transparent, 0], [Color.Transparent, 1]] });
      return;
    }
    const style: PopupAppearance = popupAppearance(this.material, this.dark, this.role, this.opaque);
    const fill: string = !this.opaque && (this.role === 'dialog' || this.role === 'menu') && this.material === 'flat' && this.panelOpacity !== undefined ?
      dialogPanelFill(this.dark, this.panelOpacity) :
      style.fill;
    instance.backgroundBlurStyle(BlurStyle.NONE)
      .backdropBlur(0).backgroundColor(fill)
      .linearGradient({ angle: 135, colors: [[Color.Transparent, 0], [Color.Transparent, 1]] })
      .border(this.role === 'menu' ? { width: 0 } : { width: this.material === 'glass' ? (this.dark ? 0.8 : 1) : 1, color: this.material === 'glass' ? (this.dark ? '#22FFFFFF' : '#506B7C96') : this.lineColor }).borderRadius(this.radius)
      .shadow({ radius: 0, color: Color.Transparent, offsetX: 0, offsetY: 0 });
  }
}
