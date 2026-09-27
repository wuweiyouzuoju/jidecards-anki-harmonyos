// SPDX-License-Identifier: AGPL-3.0-or-later
import { PrimaryGlassStyle } from '../model/ThemeCatalog';
import { themeGradient } from './ThemeVisuals';

/** 主操作共用不透明卡片底（浅色为白）；仅按下时叠加主题反馈。 */
export class PrimaryGlassSurface implements AttributeModifier<CommonAttribute> {
  private pressed: boolean;
  private style: PrimaryGlassStyle;

  constructor(pressed: boolean, style: PrimaryGlassStyle) {
    this.pressed = pressed;
    this.style = style;
  }

  applyNormalAttribute(instance: CommonAttribute): void {
    instance.backgroundColor($r('app.color.surface_card'))
      .linearGradient({ angle: 110, colors: themeGradient(this.pressed ? this.style.pressedColors : []) })
      .border({ width: 0 });
  }
}
