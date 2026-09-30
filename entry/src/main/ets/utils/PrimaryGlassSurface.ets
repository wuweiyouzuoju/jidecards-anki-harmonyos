// SPDX-License-Identifier: AGPL-3.0-or-later
import { PressFeedback } from './PressFeedback';
import { PrimaryGlassStyle } from '../model/ThemeCatalog';
import { themePressGradient } from './ThemeVisuals';

/** 主操作保持不透明卡片底；按压由 ArkUI 多态属性叠色，不重建按钮内容。 */
export class PrimaryGlassSurface extends PressFeedback {
  private style: PrimaryGlassStyle;

  constructor(style: PrimaryGlassStyle) {
    super();
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
    instance.backgroundColor($r('app.color.surface_card'))
      .linearGradient({ angle: 110, colors: themePressGradient(this.style.pressedColors, pressed) })
      .border({ width: 0 });
  }
}
