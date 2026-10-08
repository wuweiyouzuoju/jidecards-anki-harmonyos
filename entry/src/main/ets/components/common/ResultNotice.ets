// SPDX-License-Identifier: AGPL-3.0-or-later
import { 按下态按钮 } from './按下态按钮';
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { currentMotionProfile, motionAnimation } from '../../utils/AppMotion';
import { 应用尺寸 } from '../../utils/应用尺寸';

/** 宿主拥有结果、有效撤销步号及重试；提示条只提供就近的可见反馈。 */
@Component
export struct ResultNotice {
  @Prop @Watch('restart') message: ResourceStr = '';
  @Prop @Watch('restart') duration: number = 0;
  @Prop actionLabel: ResourceStr = '';
  @Prop canAct: boolean = true;
  onAction: () => void = (): void => {};
  onDismiss: () => void = (): void => {};
  private timer: number = -1;
  private mounted: boolean = false;
  aboutToAppear(): void { this.mounted = true; this.restart(); }
  aboutToDisappear(): void { this.mounted = false; this.stop(); }
  private stop(): void { if (this.timer >= 0) clearTimeout(this.timer); this.timer = -1; }
  private restart(): void {
    this.stop();
    if (this.mounted && this.duration > 0) this.timer = setTimeout((): void => {
      this.timer = -1; if (this.mounted) this.onDismiss();
    }, this.duration);
  }

  build() {
    Row({ space: 应用尺寸.间距_8 }) {
      Text(this.message).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_primary'))
        .layoutWeight(1).maxLines(3)
      if (this.actionLabel !== '') {
        按下态按钮({ 文案: this.actionLabel, 是否启用: this.canAct,
          点击回调: (): void => { if (this.canAct) this.onAction(); } })
      }
    }.width('100%').padding(应用尺寸.间距_12)
      .backgroundColor($r('app.color.surface_card')).border(SurfaceBorder.options())
      .borderRadius(应用尺寸.圆角_卡片)
      .transition(TransitionEffect.OPACITY.animation(motionAnimation(currentMotionProfile().menuEnterMs)))
  }
}
