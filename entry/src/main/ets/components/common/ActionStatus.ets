// SPDX-License-Identifier: AGPL-3.0-or-later
import { appearanceTextColor } from '../../utils/AppearanceElements';
import { currentMotionProfile, motionAnimation } from '../../utils/AppMotion';

/** 状态槽由真实请求驱动；宿主决定显隐，图标尺寸不随正文字号放大。 */
@Component
export struct ActionStatus {
  @StorageProp('appearance_elements_active') private appearanceElements: string = '';
  @Prop phase: string = 'idle';
  @Prop tint: ResourceColor = $r('app.color.text_secondary');
  @Prop glyphSize: number = 18;

  build() {
    Stack() {
      if (this.phase === 'busy') {
        LoadingProgress().width(this.glyphSize).height(this.glyphSize).color(appearanceTextColor(this.appearanceElements, this.tint))
          .transition(TransitionEffect.OPACITY.animation(motionAnimation(currentMotionProfile().statusMs)))
      } else if (this.phase === 'success' || this.phase === 'failure') {
        Text(this.phase === 'success' ? '✓' : '×').fontSize(`${this.glyphSize}vp`).fontColor(appearanceTextColor(this.appearanceElements, this.tint))
          .transition(TransitionEffect.OPACITY.animation(motionAnimation(currentMotionProfile().statusMs)))
      }
    }.width(this.glyphSize + 2).height(this.glyphSize + 2).accessibilityLevel('no').hitTestBehavior(HitTestMode.None)
  }
}
