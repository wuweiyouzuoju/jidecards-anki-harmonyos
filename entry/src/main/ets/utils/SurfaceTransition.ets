// SPDX-License-Identifier: AGPL-3.0-or-later
import { currentMotionProfile, navigationEnterOffset } from './AppMotion';
import { 取全屏转场时长, 取全屏转场曲线 } from './转场时长';

/** 界面转场的唯一效果入口；宿主只选择页面、覆盖预览或弹窗语义。 */
export class SurfaceTransition {
  static pageAnimation(): AnimateParam {
    return { duration: 取全屏转场时长(), curve: Curve.EaseOut,
      expectedFrameRateRange: { min: 60, max: 120, expected: 60 } };
  }

  /** 透明页面只淡入进入方，退出方立即隐藏，避免两套文字叠影。 */
  static pageContent(forward: boolean, enabled: boolean = true): TransitionEffect {
    if (!enabled) return TransitionEffect.IDENTITY;
    return TransitionEffect.asymmetric(
      TransitionEffect.opacity(0).combine(TransitionEffect.translate({ x: navigationEnterOffset(forward) }))
        .animation(SurfaceTransition.pageAnimation()),
      TransitionEffect.opacity(0).animation({ duration: 0 })
    );
  }

  /** 覆盖式预览自带完整背景，只淡入淡出，避免移动 Web 内容与背景。 */
  static pageOverlay(): TransitionEffect {
    return TransitionEffect.opacity(0).animation(SurfaceTransition.pageAnimation());
  }

  static backdrop(): TransitionEffect {
    return TransitionEffect.opacity(0).animation(SurfaceTransition.dialogExitAnimation());
  }

  static dialogEnterAnimation(): AnimateParam {
    return { duration: 取全屏转场时长(), curve: 取全屏转场曲线() };
  }

  static dialogExitAnimation(): AnimateParam {
    return { duration: 取全屏转场时长(), curve: Curve.EaseOut };
  }

  static dialog(): TransitionEffect {
    const scale: number = currentMotionProfile().dialogScale;
    return TransitionEffect.asymmetric(
      TransitionEffect.opacity(0).combine(TransitionEffect.scale({ x: scale, y: scale }))
        .animation(SurfaceTransition.dialogEnterAnimation()),
      SurfaceTransition.backdrop()
    );
  }
}
