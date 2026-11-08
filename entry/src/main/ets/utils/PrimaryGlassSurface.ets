import { SeriesVisual } from './SeriesVisual';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { darkMaterial } from './GlassMaterial';
import { PressFeedback } from './PressFeedback';
import { PrimaryGlassStyle } from '../model/ThemeCatalog';

/** 主操作仅给背景色加透射，不降低正文不透明度；按压由 ArkUI 多态属性叠色，不重建按钮内容。 */
export class PrimaryGlassSurface extends PressFeedback {
  private style: PrimaryGlassStyle;

  private material: string;
  private actionColor: string;
  private isDark: boolean;
  private opacityPercent: number;

  constructor(material: string, style: PrimaryGlassStyle, actionColor: string = '#2F5FD0', isDark: boolean = darkMaterial(), opacity: number = 100) {
    super();
    this.opacityPercent = opacity;
    this.material = material;
    this.style = style; this.actionColor = actionColor; this.isDark = isDark;
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
    SeriesVisual.primaryAction(this.material, this.isDark, this.actionColor,
      18, this.opacityPercent).applyNormalAttribute(instance);
  }
}
