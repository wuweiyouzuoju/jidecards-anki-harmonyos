// SPDX-License-Identifier: AGPL-3.0-or-later
import { themedGlassFill } from './GlassMaterial';
import { SurfaceBorder } from './SurfaceBorder';
import { 应用尺寸 } from './应用尺寸';
/** 搜索输入独立材质；只绘制背景，不改变输入、尺寸与文字。 */
export class SearchFieldSurface implements AttributeModifier<TextInputAttribute> {
  private accent: string;
  private material: string;
  private dark: boolean;
  private radius: number;
  constructor(material: string, dark: boolean, radius: number = 应用尺寸.圆角_面板, accent: string = '') { this.accent = accent; this.material = material; this.dark = dark; this.radius = radius; }
  applyNormalAttribute(instance: TextInputAttribute): void {
    const glass: boolean = this.material === 'glass';
    instance.backgroundBlurStyle(BlurStyle.NONE).backdropBlur(0)
      .backgroundColor(glass ? themedGlassFill(this.dark ? '#80121820' : '#66FFFFFF', this.dark, this.accent) : $r('app.color.surface_card'))
      .linearGradient({ angle: 135, colors: glass ? [[this.dark ? '#04FFFFFF' : '#08FFFFFF', 0], ['#00FFFFFF', 1]] :
        [['#00FFFFFF', 0], ['#00FFFFFF', 1]] });
    instance.border(SurfaceBorder.materialOptions(this.material, this.dark)).borderRadius(this.radius);
  }
}
