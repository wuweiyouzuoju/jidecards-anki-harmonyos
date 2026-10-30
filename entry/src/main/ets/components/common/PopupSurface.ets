// SPDX-License-Identifier: AGPL-3.0-or-later
import { popupAppearance, PopupAppearance } from './PopupAppearance';
import { themedGlassFill } from '../../utils/GlassMaterial';
import { SurfaceBorder } from '../../utils/SurfaceBorder';

/** 弹窗与菜单的唯一材质入口；本体不叠模糊，页面遮罩独占背景效果。 */
export class PopupSurface implements AttributeModifier<CommonAttribute> {
  private material: string;
  private dark: boolean;
  private radius: number;
  private role: string;
  private visible: boolean;
  private accent: string;
  private opaque: boolean;
  constructor(material: string, dark: boolean, radius: number, role: string = 'dialog', visible: boolean = true, accent: string = AppStorage.get<string>('theme_color_action_primary') ?? '', opaque: boolean = false) {
    this.accent = accent; this.opaque = opaque;
    this.material = material; this.dark = dark; this.radius = radius; this.role = role; this.visible = visible;
  }
  applyNormalAttribute(instance: CommonAttribute): void {
    if (!this.visible) { instance.backgroundColor(Color.Transparent).backgroundBlurStyle(BlurStyle.NONE).backdropBlur(0).border({ width: 0 }); return; }
    const style: PopupAppearance = popupAppearance(this.material, this.dark, this.role, this.opaque);
    instance.backgroundBlurStyle(BlurStyle.NONE)
      .backdropBlur(0).backgroundColor(!this.opaque && this.material === 'glass' && this.role !== 'preview' ? themedGlassFill(style.fill, this.dark, this.accent) : style.fill)
      .linearGradient({ angle: 135, colors: [[Color.Transparent, 0], [Color.Transparent, 1]] })
      .border(SurfaceBorder.materialOptions(this.material, this.dark)).borderRadius(this.radius)
      .shadow({ radius: 0, color: Color.Transparent, offsetX: 0, offsetY: 0 });
    if (!this.opaque && this.material === 'glass') instance.linearGradient({ angle: 135,
      colors: this.dark ? [['#0CFFFFFF',0],['#00FFFFFF',0.5],['#05FFFFFF',1]] : [['#30FFFFFF',0],['#00FFFFFF',0.5],['#12FFFFFF',1]] });
  }
}
