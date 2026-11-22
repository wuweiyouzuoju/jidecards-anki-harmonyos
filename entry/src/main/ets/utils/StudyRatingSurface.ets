// SPDX-License-Identifier: AGPL-3.0-or-later
import { SharedSurface } from 'jide_foundation';
import { SeriesVisual } from './SeriesVisual';
import { ColorMetrics } from '@kit.ArkUI';
import { GlassSurface } from './GlassSurface';
import { 应用尺寸 } from './应用尺寸';
import { darkMaterial } from './GlassMaterial';
import { AppLog } from '../model/AppLog';

/** 四项评分在扁平和玻璃材质下均保留红橙绿蓝语义色。 */
export class StudyRatingSurface extends GlassSurface {
  private ratingMaterial: string;
  private semanticFill: ResourceColor;
  private isRating: boolean;
  private actionColor: string;
  private isDark: boolean;
  private opacityPercent: number;
  constructor(material: string, colors: string[], fill: ResourceColor, isRating: boolean = true, actionColor: string = '#2F5FD0', isDark: boolean = darkMaterial(), opacity: number = 100, appearance: string = '') {
    super(material, colors, fill);
    this.opacityPercent = opacity;
    this.ratingMaterial = material; this.semanticFill = fill; this.isRating = isRating; this.actionColor = actionColor; this.isDark = isDark;
  }
  backgroundSurface(): SharedSurface {
    if (!this.isRating) return SeriesVisual.primaryAction(this.ratingMaterial, this.isDark, this.actionColor,
      应用尺寸.圆角_面板, this.opacityPercent);
    let tint: string = '';
    if (this.ratingMaterial === 'glass') {
      try {
        const color: ColorMetrics = ColorMetrics.resourceColor(this.semanticFill);
        tint = '#' + Math.round((this.isDark ? 0.8 : 0.62) * this.opacityPercent / 100 * 255).toString(16).padStart(2, '0') +
          color.red.toString(16).padStart(2, '0') + color.green.toString(16).padStart(2, '0') + color.blue.toString(16).padStart(2, '0');
      } catch (error) { AppLog.warn('StudyRating', '[rating] Semantic color resolution failed'); }
    }
    // background 层画在 backgroundColor 之上；扁平材质必须在这一层带语义色，否则通用表面会把四个按钮盖成白色。
    const flatFill: ResourceColor | undefined = this.ratingMaterial === 'glass' ? undefined : this.semanticFill;
    return SeriesVisual.control(this.ratingMaterial, this.isDark, this.actionColor,
      应用尺寸.圆角_面板, true, flatFill, this.opacityPercent, '', tint);
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
      instance.backgroundColor(SeriesVisual.buttonFill(this.semanticFill, this.opacityPercent));
      return;
    }
    const dark: boolean = this.isDark;
    let color: ColorMetrics;
    try { color = ColorMetrics.resourceColor(this.semanticFill); }
    catch (error) {
      AppLog.warn('StudyRating', '[rating] Semantic color resolution failed');
      instance.backgroundColor(this.semanticFill);
      return;
    }
    const alpha: number = (dark ? 0.8 : 0.62) * this.opacityPercent / 100;
    const tint: string = '#' + Math.round(alpha * 255).toString(16).padStart(2, '0') +
      color.red.toString(16).padStart(2, '0') + color.green.toString(16).padStart(2, '0') +
      color.blue.toString(16).padStart(2, '0');
    SeriesVisual.control(this.ratingMaterial, dark, this.actionColor, 应用尺寸.圆角_面板,
      true, undefined, this.opacityPercent, '', tint).applyNormalAttribute(instance);
    instance.backgroundColor(`rgba(${color.red},${color.green},${color.blue},${alpha})`)
      .backgroundBlurStyle(BlurStyle.NONE)
      .linearGradient({angle:0,colors:pressed ? [[dark ? '#0CFFFFFF' : '#08000000',0],[dark ? '#0CFFFFFF' : '#08000000',1]] :
        [[Color.Transparent,0],[Color.Transparent,1]]})
      .border({width:1,color:dark ? '#40FFFFFF' : '#E6FFFFFF'});
  }
}
