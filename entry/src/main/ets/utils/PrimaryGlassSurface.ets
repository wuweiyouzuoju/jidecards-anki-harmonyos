// SPDX-License-Identifier: AGPL-3.0-or-later
import { PrimaryGlassStyle } from '../model/ThemeCatalog';
import { themeGradient } from './ThemeVisuals';

/** 主操作按钮常驻主题玻璃；按下加厚色层，不做实时模糊或白字实体底。 */
export class PrimaryGlassSurface implements AttributeModifier<CommonAttribute> {
  private pressed: boolean;
  private style: PrimaryGlassStyle;
  private borderColor: ResourceColor;
  private borderWidth: number;

  constructor(pressed: boolean, style: PrimaryGlassStyle, borderColor: ResourceColor = style.border,
    borderWidth: number = 1) {
    this.pressed = pressed;
    this.style = style;
    this.borderColor = borderColor;
    this.borderWidth = borderWidth;
  }

  applyNormalAttribute(instance: CommonAttribute): void {
    instance.backgroundColor(Color.Transparent)
      .linearGradient({ angle: 110, colors: themeGradient(this.pressed ? this.style.pressedColors : this.style.colors) })
      .border({ width: this.borderWidth, color: this.borderColor });
  }
}
