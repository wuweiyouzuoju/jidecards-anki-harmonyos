// SPDX-License-Identifier: AGPL-3.0-or-later
import { themeGradient } from './ThemeVisuals';
import { 应用尺寸 } from './应用尺寸';

/** 以半透明色层呈现柔化背景，避免按下与导航重叠时反复采样背景做模糊。 */
export class GlassSurface implements AttributeModifier<CommonAttribute> {
  private active: boolean;
  private colors: string[];

  constructor(active: boolean, colors: string[]) {
    this.active = active;
    this.colors = colors;
  }

  applyNormalAttribute(instance: CommonAttribute): void {
    instance
      .backgroundColor(this.active ? Color.Transparent : $r('app.color.surface_card'))
      .linearGradient({ angle: 110, colors: themeGradient(this.active ? this.colors : []) })
      .border({ width: 应用尺寸.卡片边框, color: this.active ? '#80FFFFFF' : $r('app.color.border_subtle') });
  }
}
