// SPDX-License-Identifier: AGPL-3.0-or-later
import { currentMotionProfile, motionAnimation } from '../../utils/AppMotion';

/** 只过渡变化的短文字；快速更新合并到下次短过渡，当前过渡不中断。 */
@Component
export struct ChangingText {
  @Prop @Watch('changed') value: string = '';
  @Prop textSize: number = 14;
  @Prop tint: ResourceColor = $r('app.color.text_secondary');
  @Prop minimumWidth: number = 0;
  @Prop alignment: TextAlign = TextAlign.Center;
  @Prop fillWidth: boolean = false;
  @State private previous: string = '';
  @State private current: string = '';
  @State private progress: number = 1;
  @State private reservedWidth: number = 0;
  private animating: boolean = false;
  private version: number = 0;
  private mounted: boolean = false;

  aboutToAppear(): void { this.mounted = true; this.current = this.value; this.previous = this.value; }
  aboutToDisappear(): void { this.mounted = false; this.version++; }
  private changed(): void {
    if (!this.mounted || this.animating || this.current === this.value) return;
    const version: number = ++this.version;
    this.animating = true; this.previous = this.current; this.current = this.value; this.progress = 0;
    const options: AnimateParam = motionAnimation(currentMotionProfile().textMs);
    options.onFinish = (): void => {
      if (!this.mounted || version !== this.version) return;
      this.animating = false; this.previous = this.current; this.changed();
    };
    this.getUIContext().animateTo(options, (): void => { this.progress = 1; });
  }
  build() {
    Stack({ alignContent: this.alignment === TextAlign.End ? Alignment.End :
      this.alignment === TextAlign.Start ? Alignment.Start : Alignment.Center }) {
      Text(this.previous).fontSize(this.textSize).fontColor(this.tint).opacity(1 - this.progress)
        .maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).textAlign(this.alignment)
        .translate({ y: -currentMotionProfile().textOffset * this.progress }).accessibilityLevel('no')
      Text(this.current).fontSize(this.textSize).fontColor(this.tint).opacity(this.progress)
        .maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).textAlign(this.alignment)
        .translate({ y: currentMotionProfile().textOffset * (1 - this.progress) })
    }
      // 外层分配的宽度需传到实际 Stack；填充模式不把旧窗口宽度缓存为最小宽度。
      .width(this.fillWidth ? '100%' : undefined)
      .constraintSize({ minWidth: this.fillWidth ? this.minimumWidth : Math.max(this.minimumWidth, this.reservedWidth) })
      .onAreaChange((_old: Area, area: Area): void => {
        if (!this.fillWidth) this.reservedWidth = Math.max(this.reservedWidth, Number(area.width));
      })
  }
}
