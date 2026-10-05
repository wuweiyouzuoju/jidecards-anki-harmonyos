// SPDX-License-Identifier: AGPL-3.0-or-later
import { 应用尺寸 } from '../../utils/应用尺寸';
import { SurfaceBorder } from '../../utils/SurfaceBorder';

/** 所有锚点菜单共用的小弹窗表面；一个菜单只由一个表面拥有轮廓和阴影。 */
export class MenuSurface implements AttributeModifier<CommonAttribute> {
  static readonly pointerSpan: number = 20;
  static readonly pointerDepth: number = 6;

  static popupTransition(): TransitionEffect {
    return TransitionEffect.asymmetric(
      TransitionEffect.opacity(0).combine(TransitionEffect.scale({ x: 0.98, y: 0.98 }))
        .animation({ duration: 150, curve: Curve.EaseOut }),
      TransitionEffect.opacity(0).animation({ duration: 150, curve: Curve.EaseOut })
    );
  }

  private active: boolean;

  constructor(active: boolean = true) { this.active = active; }

  applyNormalAttribute(instance: CommonAttribute): void {
    instance.backgroundColor(this.active ? $r('app.color.menu_surface') : Color.Transparent)
      .border(SurfaceBorder.options(this.active ? 应用尺寸.卡片边框 : 0))
      .borderRadius(应用尺寸.radiusLg)
      .shadow({ radius: this.active ? 12 : 0, color: $r('app.color.menu_shadow'), offsetX: 0, offsetY: 4 })
      .clip(this.active);
  }
}
