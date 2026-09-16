// SPDX-License-Identifier: AGPL-3.0-or-later
import { PrimaryGlassStyle } from '../model/ThemeCatalog';
import { themeGradient } from './ThemeVisuals';

/** 主操作按钮常驻主题玻璃；按下加厚色层，不做实时模糊或白字实体底。 */
export class PrimaryGlassSurface implements AttributeModifier<CommonAttribute> {
  private pressed: boolean;
  private style: PrimaryGlassStyle;

  constructor(pressed: boolean, style: PrimaryGlassStyle) {
    this.pressed = pressed;
    this.style = style;
  }

  applyNormalAttribute(instance: CommonAttribute): void {
    instance.backgroundColor(Color.Transparent)
      .linearGradient({ angle: 110, colors: themeGradient(this.pressed ? this.style.pressedColors : this.style.colors) })
      .border({ width: 1, color: this.style.border });
  }
}
