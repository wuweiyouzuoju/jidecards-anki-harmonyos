// SPDX-License-Identifier: AGPL-3.0-or-later
import { SharedSurface, sharedGlassBlurRadius } from 'jide_foundation';
import { SeriesVisual } from './SeriesVisual';
import { themedGlassFill } from './GlassMaterial';
/** 编辑轮盘玻璃档不叠色层；不改半圆、选中态和触控边界。 */
export class EditorWheelSurface implements AttributeModifier<CommonAttribute> {
  private accent: string;
  private material: string;
  private dark: boolean;
  private flatFill: ResourceColor;
  constructor(material: string, dark: boolean, flatFill: ResourceColor, accent: string = '') {
    this.accent = accent;
    this.material = material; this.dark = dark; this.flatFill = flatFill;
  }
  backgroundSurface(radius: number, contourPath: string = ''): SharedSurface {
    return SeriesVisual.control(this.material, this.dark, this.accent, radius, true, undefined, 100, '', '#00000000', true).withContour(contourPath);
  }
  applyNormalAttribute(instance: CommonAttribute): void {
    const glass: boolean = this.material === 'glass';
    instance.backgroundBlurStyle(BlurStyle.NONE).backdropBlur(glass ? sharedGlassBlurRadius() : 0)
      .backgroundColor(glass ? themedGlassFill(this.dark ? '#CC18202B' : '#B3FFFFFF', this.dark, this.accent) : this.flatFill)
      .linearGradient({ angle: 135, colors: [['#00FFFFFF', 0], ['#00FFFFFF', 1]] });
  }
}
