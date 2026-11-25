// SPDX-License-Identifier: AGPL-3.0-or-later
import { UiTokens } from '../../core/UiTokens';
import { activateAction } from '../../core/Motion';
import { SharedPressFeedback } from './PressFeedback';

/** 原生动作语义与44vp热区共用；产品提供图标、表面和动作时的动效偏好。 */
@Component
export struct SharedIconButton {
  @Prop label: ResourceStr = '';
  @Prop controlSize: number = UiTokens.controlHeight;
  @Prop isInteractive: boolean = true;
  @Prop circular: boolean = false;
  @Prop radius: number = UiTokens.surfaceRadius;
  @Prop frameLineWidth: number = 1;
  @Prop frameLineColor: ResourceColor = Color.Transparent;
  @Prop surfaceColor: ResourceColor = Color.Transparent;
  @Prop restingOpacity: number = 1;
  readPressScale: () => number = (): number => 1;
  onAction: () => void = (): void => {};
  @BuilderParam glyph: () => void = this.emptyGlyph;

  @Builder
  private emptyGlyph(): void {}

  build() {
    Button() { this.glyph() }
      .type(this.circular ? ButtonType.Circle : ButtonType.Normal)
      .width(this.controlSize).height(this.controlSize)
      .padding(0).flexShrink(0)
      .backgroundColor(this.surfaceColor)
      .border({ width: this.frameLineWidth, color: this.frameLineColor }).borderRadius(this.radius)
      .enabled(this.isInteractive).stateEffect(false)
      .attributeModifier(new SharedPressFeedback(this.restingOpacity, 0.4, this.readPressScale))
      // ArkUI分别重载string和Resource；类型断言不转换实际资源值。
      .accessibilityText(this.label as string)
      .onClick((): void => { activateAction(this.isInteractive, false, this.onAction); })
  }
}
