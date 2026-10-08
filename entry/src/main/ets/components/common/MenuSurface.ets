// SPDX-License-Identifier: AGPL-3.0-or-later
import { 应用尺寸 } from '../../utils/应用尺寸';
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { currentMotionProfile, motionAnimation } from '../../utils/AppMotion';

/** 所有锚点菜单共用的小弹窗表面；一个菜单只由一个表面拥有轮廓和阴影。 */
export class MenuSurface implements AttributeModifier<CommonAttribute> {
  static readonly pointerSpan: number = 20;
  static readonly pointerDepth: number = 6;

  /** 缩放围绕触发边缘；原生 Popup 未指定锚点时保留系统居中语义。 */
  static popupTransition(centerX: number | string = '50%',
    centerY: number | string = '50%'): TransitionEffect {
    const profile = currentMotionProfile();
    return TransitionEffect.asymmetric(
      TransitionEffect.opacity(0).combine(
        TransitionEffect.scale({ x: profile.menuScale, y: profile.menuScale, centerX: centerX, centerY: centerY }))
        .animation(motionAnimation(profile.menuEnterMs)),
      TransitionEffect.opacity(0).animation({ duration: profile.menuExitMs, curve: Curve.EaseOut })
    );
  }

  private active: boolean;
  private cornerRadius: number;

  constructor(active: boolean = true, cornerRadius: number = 应用尺寸.radiusLg) {
    this.active = active;
    this.cornerRadius = cornerRadius;
  }

  applyNormalAttribute(instance: CommonAttribute): void {
    instance.backgroundColor(this.active ? $r('app.color.menu_surface') : Color.Transparent)
      .border(SurfaceBorder.options(this.active ? 应用尺寸.卡片边框 : 0))
      .borderRadius(this.cornerRadius)
      .shadow({ radius: this.active ? 12 : 0, color: $r('app.color.menu_shadow'), offsetX: 0, offsetY: 4 })
      .clip(this.active);
  }
}
