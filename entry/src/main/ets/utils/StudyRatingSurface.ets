import { SeriesVisual } from './SeriesVisual';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { ColorMetrics } from '@kit.ArkUI';
import { GlassSurface } from './GlassSurface';
import { 应用尺寸 } from './应用尺寸';
import { darkMaterial } from './GlassMaterial';

/** 四项评分保留红橙绿蓝语义色，不混入当前主题主色；扁平沿用原表面。 */
export class StudyRatingSurface extends GlassSurface {
  private ratingMaterial: string;
  private semanticFill: ResourceColor;
  private isRating: boolean;
  private actionColor: string;
  private isDark: boolean;
  private opacityPercent: number;
  constructor(material: string, colors: string[], fill: ResourceColor, isRating: boolean = true, actionColor: string = '#2F5FD0', isDark: boolean = darkMaterial(), opacity: number = 100) {
    super(material, colors, fill);
    this.opacityPercent = opacity;
    this.ratingMaterial = material; this.semanticFill = fill; this.isRating = isRating; this.actionColor = actionColor; this.isDark = isDark;
  }
  applyNormalAttribute(instance: CommonAttribute): void {
    super.applyNormalAttribute(instance); this.applyRating(instance, false);
  }
  applyPressedAttribute(instance: CommonAttribute): void {
    super.applyPressedAttribute(instance); this.applyRating(instance, true);
  }
  private applyRating(instance: CommonAttribute, pressed: boolean): void {
    if (!this.isRating) {
      SeriesVisual.primaryAction(this.ratingMaterial, this.isDark, this.actionColor,
        应用尺寸.圆角_面板, this.opacityPercent).applyNormalAttribute(instance);
      return;
    }
    if (this.ratingMaterial !== 'glass') {
      if (this.opacityPercent !== 100) {
        instance.backgroundColor(SeriesVisual.buttonFill(darkMaterial() ? '#000000' : '#FFFFFF', this.opacityPercent));
      }
      return;
    }
    const dark: boolean = this.isDark;
    const color: ColorMetrics = ColorMetrics.resourceColor(this.semanticFill);
    const alpha: number = (dark ? 0.8 : 0.62) * this.opacityPercent / 100;
    instance.backgroundColor(`rgba(${color.red},${color.green},${color.blue},${alpha})`)
      .backgroundBlurStyle(BlurStyle.NONE).backdropBlur(0)
      .linearGradient({angle:0,colors:pressed ? [[dark ? '#0CFFFFFF' : '#08000000',0],[dark ? '#0CFFFFFF' : '#08000000',1]] :
        [[Color.Transparent,0],[Color.Transparent,1]]})
      .border({width:1,color:dark ? '#40FFFFFF' : '#E6FFFFFF'})
      .shadow(SeriesVisual.shadow(this.ratingMaterial, dark));
  }
}
