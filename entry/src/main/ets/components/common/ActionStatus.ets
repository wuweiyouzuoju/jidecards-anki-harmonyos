// SPDX-License-Identifier: AGPL-3.0-or-later
import { currentMotionProfile, motionAnimation } from '../../utils/AppMotion';

/** 固定绘制槽由真实请求状态驱动；取消和等待不显示成功。 */
@Component
export struct ActionStatus {
  @Prop phase: string = 'idle';
  @Prop tint: ResourceColor = $r('app.color.text_secondary');

  build() {
    Stack() {
      if (this.phase === 'busy') {
        LoadingProgress().width(18).height(18).color(this.tint)
          .transition(TransitionEffect.OPACITY.animation(motionAnimation(currentMotionProfile().statusMs)))
      } else if (this.phase === 'success' || this.phase === 'failure') {
        Text(this.phase === 'success' ? '✓' : '×').fontSize(18).fontColor(this.tint)
          .transition(TransitionEffect.OPACITY.animation(motionAnimation(currentMotionProfile().statusMs)))
      }
    }.width(20).height(20).accessibilityLevel('no').hitTestBehavior(HitTestMode.None)
  }
}
