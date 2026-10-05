// SPDX-License-Identifier: AGPL-3.0-or-later
import { PressFeedback } from './PressFeedback';
import { SurfaceBorder } from './SurfaceBorder';
import { themePressGradient } from './ThemeVisuals';

/** 由 ArkUI 按压状态直接改变色层，不经组件 @State 重建文字或切换透明底。 */
export class GlassSurface extends PressFeedback {
  private colors: string[];
  private background: ResourceColor;
  private outline: BorderOptions;

  constructor(colors: string[], background: ResourceColor = $r('app.color.surface_card'),
    outline: BorderOptions = SurfaceBorder.options()) {
    super();
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
    this.applySurface(instance, true);
  }

  applyDisabledAttribute(instance: CommonAttribute): void {
    this.applyNormalAttribute(instance);
    super.applyDisabledAttribute(instance);
  }

  private applySurface(instance: CommonAttribute, pressed: boolean): void {
    instance.backgroundColor(this.background)
      .linearGradient({ angle: 110, colors: themePressGradient(this.colors, pressed) })
      .border(this.outline);
  }
}
