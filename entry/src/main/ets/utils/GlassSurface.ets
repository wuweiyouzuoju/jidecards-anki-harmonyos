import { SeriesVisual } from './SeriesVisual';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { translucentGlassFill, usesGlassMaterial, darkMaterial } from './GlassMaterial';
import { PressFeedback } from './PressFeedback';
import { SurfaceBorder } from './SurfaceBorder';

/** 玻璃表面不叠底色或渐变；按压反馈仍由公共反馈拥有。 */
export class GlassSurface extends PressFeedback {
  private colors: string[];
  private background: ResourceColor;
  private outline: BorderOptions | undefined;

  private material: string;
  private stableAnchor: boolean;
  private buttonOpacity: number;

  constructor(material: string, colors: string[], background: ResourceColor = $r('app.color.surface_card'),
    outline: BorderOptions | undefined = undefined, stableAnchor: boolean = false, buttonOpacity: number = 100) {
    super(1, 0.4, stableAnchor);
    this.stableAnchor = stableAnchor;
    this.buttonOpacity = buttonOpacity;
    this.material = material;
    this.colors = colors;
    this.background = background;
    this.outline = outline;
  }

  applyNormalAttribute(instance: CommonAttribute): void {
    super.applyNormalAttribute(instance);
    this.applySurface(instance, false);
  }

  applyPressedAttribute(instance: CommonAttribute): void {
    super.applyPressedAttribute(instance);
    this.applySurface(instance, !this.stableAnchor);
  }

  applyDisabledAttribute(instance: CommonAttribute): void {
    this.applyNormalAttribute(instance);
    super.applyDisabledAttribute(instance);
  }

  private applySurface(instance: CommonAttribute, pressed: boolean): void {
    if (!usesGlassMaterial(this.material)) {
      const fill: string = darkMaterial() ? '#000000' : '#FFFFFF';
      instance.backgroundColor(this.buttonOpacity === 100 ? fill : SeriesVisual.buttonFill(fill, this.buttonOpacity)).backgroundBlurStyle(BlurStyle.NONE).backdropBlur(0)
        .linearGradient({angle:0,colors:[[Color.Transparent,0],[Color.Transparent,1]]})
        .shadow({radius:0,color:Color.Transparent,offsetX:0,offsetY:0}).border(SurfaceBorder.options());
      return;
    }


    instance.backgroundColor(translucentGlassFill(this.background))
      .backgroundBlurStyle(BlurStyle.NONE).backdropBlur(24)
      .linearGradient({ angle: 110, colors: [[Color.Transparent, 0], [Color.Transparent, 1]] })
      .shadow(SeriesVisual.shadow(this.material, darkMaterial()))
      .border(this.outline ?? (darkMaterial() ? SurfaceBorder.materialOptions(this.material, true) : SurfaceBorder.options()));
  }
}
