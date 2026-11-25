// SPDX-License-Identifier: AGPL-3.0-or-later
import { VisualPalette, visualPalette, VisualTokens, visualPressScale } from '../../core/VisualStyle';
import { activateAction } from '../../core/Motion';
import { SharedSurface } from './Surface';
import { SharedPressFeedback } from './PressFeedback';

/** 学习/训练动作；总高度至少52vp，长文案和大字号按内容增长。 */
@Component
export struct SharedActionButton {
  @Prop label: string = '';
  @Prop surfaceVisible: boolean = true;
  @Prop contentVisible: boolean = true;
  @Prop subtitle: string = '';
  @Prop isDark: boolean = false;
  @Prop palette: VisualPalette | undefined = undefined;
  @Prop isInteractive: boolean = true;
  @Prop busy: boolean = false;
  @Prop material: string = 'glass';
  @Prop reduceTransparency: boolean = false;
  @Prop reduceMotion: boolean = false;
  @Prop motionStyle: string = 'restrained';
  onAction: () => void = (): void => {};

  private colors(): VisualPalette { return this.palette ?? visualPalette(this.isDark); }

  build() {
    Button({ type: ButtonType.Normal }) {
      Row({ space: 8 }) {
        if (this.busy) {
          LoadingProgress().width(20).height(20).color(this.colors().action).flexShrink(0)
        }
        Column({ space: 2 }) {
          Text(this.label).fontSize(17).fontWeight(FontWeight.Medium)
            .fontColor(this.colors().action).textAlign(TextAlign.Center)
          if (this.subtitle.length > 0) {
            Text(this.subtitle).fontSize(12).fontColor(this.colors().secondaryText).textAlign(TextAlign.Center)
          }
        }.layoutWeight(1)
      }.width('100%').opacity(this.contentVisible ? 1 : 0)
    }
    .width('100%').constraintSize({ minHeight: VisualTokens.actionHeight })
    .padding({ left: 16, right: 16, top: 10, bottom: 10 })
    .attributeModifier(new SharedSurface(this.isDark, this.material, this.reduceTransparency,
      VisualTokens.actionRadius, this.colors(), this.surfaceVisible, 'control'))
    .attributeModifier(new SharedPressFeedback(1, 0.4,
      (): number => visualPressScale(this.motionStyle, this.reduceMotion)))
    .enabled(this.isInteractive && !this.busy).stateEffect(false)
    .accessibilityText(this.label + (this.subtitle.length > 0 ? '，' + this.subtitle : ''))
    .onClick((): void => { activateAction(this.isInteractive, this.busy, this.onAction); })
  }
}
