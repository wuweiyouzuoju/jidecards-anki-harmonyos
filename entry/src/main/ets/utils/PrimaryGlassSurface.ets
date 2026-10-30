import { SeriesVisual } from './SeriesVisual';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { translucentGlassFill, usesGlassMaterial, darkMaterial } from './GlassMaterial';
import { PressFeedback } from './PressFeedback';
import { PrimaryGlassStyle } from '../model/ThemeCatalog';
import { themePressGradient } from './ThemeVisuals';
import { SurfaceBorder } from './SurfaceBorder';

/** 主操作仅给背景色加透射，不降低正文不透明度；按压由 ArkUI 多态属性叠色，不重建按钮内容。 */
export class PrimaryGlassSurface extends PressFeedback {
  private style: PrimaryGlassStyle;

  private material: string;

  constructor(material: string, style: PrimaryGlassStyle) {
    super();
    this.material = material;
    this.style = style;
  }

  applyNormalAttribute(instance: CommonAttribute): void {
    super.applyNormalAttribute(instance);
    this.applySurface(instance, false);
  }

  applyPressedAttribute(instance: CommonAttribute): void {
    super.applyPressedAttribute(instance);
    this.applySurface(instance, true);
  }

  applyDisabledAttribute(instance: CommonAttribute): void {
    this.applyNormalAttribute(instance);
    super.applyDisabledAttribute(instance);
  }

  private applySurface(instance: CommonAttribute, pressed: boolean): void {
    if (!usesGlassMaterial(this.material)) {
      instance.backgroundColor(darkMaterial() ? '#000000' : '#FFFFFF').backgroundBlurStyle(BlurStyle.NONE).backdropBlur(0)
        .linearGradient({angle:0,colors:[[Color.Transparent,0],[Color.Transparent,1]]})
        .shadow({radius:0,color:Color.Transparent,offsetX:0,offsetY:0}).border(SurfaceBorder.options());
      return;
    }

    instance.backgroundColor(translucentGlassFill($r('app.color.surface_card')))
      .backgroundBlurStyle(BlurStyle.NONE).backdropBlur(24)
      .linearGradient({ angle: 110, colors: darkMaterial() ? [['#04FFFFFF',0],['#00FFFFFF',1]] : themePressGradient(this.style.pressedColors, pressed) })
      .shadow(SeriesVisual.shadow(this.material, darkMaterial()))
      .border(SurfaceBorder.options());
  }
}
