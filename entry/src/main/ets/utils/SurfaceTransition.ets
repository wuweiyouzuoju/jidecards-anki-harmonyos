// SPDX-License-Identifier: AGPL-3.0-or-later
import { curves } from '@kit.ArkUI';
import { currentMotionProfile, navigationEnterOffset, materialPopupAnimation } from './AppMotion';
import { 取全屏转场时长, 取全屏转场曲线 } from './转场时长';

/** 界面转场的唯一效果入口；宿主只选择页面、覆盖预览或弹窗语义。 */
export class SurfaceTransition {
  static readonly popupEnterMs: number = 200;
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

  /** 玻璃按宿主语义呈现；不借布局尺寸动画重测正文或重新采样。 */
  static glassScale(menu: boolean, drawer: boolean): number {
    if (drawer) return 1;
    const lively: boolean = currentMotionProfile().springFeedback;
    return menu ? (lively ? 0.88 : 0.92) : (lively ? 0.95 : 0.97);
  }

  static glassOffset(drawer: boolean): number {
    return drawer ? (currentMotionProfile().springFeedback ? -32 : -24) : 0;
  }

  static glassEnterAnimation(menu: boolean, drawer: boolean): AnimateParam {
    const lively: boolean = currentMotionProfile().springFeedback;
    return { duration: SurfaceTransition.popupEnterMs,
      curve: lively ? curves.interpolatingSpring(0, 1, 380, 38) : curves.cubicBezierCurve(0.16, 1, 0.3, 1),
      expectedFrameRateRange: { min: 60, max: 120, expected: 60 } };
  }

  static glassExit(menu: boolean, drawer: boolean, centerX: string, centerY: string): TransitionEffect {
    return TransitionEffect.opacity(0)
      .combine(TransitionEffect.scale({ x: drawer ? 1 : menu ? 0.72 : 0.86,
        y: drawer ? 1 : menu ? 0.72 : 0.86, centerX: centerX, centerY: centerY }))
      .combine(TransitionEffect.translate({ x: drawer ? -16 : 0 }))
      .animation({ duration: drawer ? 180 : 190, curve: Curve.EaseIn });
  }

  static dialogEnterAnimation(): AnimateParam {
    return materialPopupAnimation(SurfaceTransition.popupEnterMs);
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
