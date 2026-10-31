import { rememberPopupTrigger } from '../../utils/PopupTrigger';
import { disclosureAnimation } from '../../utils/AppMotion';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { SelectStyle } from '../../utils/SelectStyle';
import { PressFeedback } from '../../utils/PressFeedback';
import { localizedResourceText } from '../../utils/UiFeedback';
import { DisclosureChevron } from './DisclosureChevron';

/** 目录和设置枚举共用无外框的当前值入口；选项窗口与提交仍归原选择器。 */
@Component
export struct SelectionValueButton {
  @StorageProp('系统语言') private language: string = 'zh-Hans';
  @Prop value: string = '';
  @Prop label: ResourceStr = '';
  @Prop disclosureAngle: number = 90;
  @Prop controlWidth: Length = 'auto';
  @Prop controlMaxWidth: Length = '100%';
  @Prop valueMaxLines: number = 2;
  @Prop isInteractive: boolean = true;
  onAction: () => void = (): void => {};
  private triggerArea: Area | undefined = undefined;

  private activate(): void { if (this.isInteractive) {
      if (this.triggerArea !== undefined) rememberPopupTrigger(this.triggerArea);
      this.onAction();
    } }
  build() {
    Button() {
      Row({ space: SelectStyle.controlSpace }) {
        Text(this.value).fontSize(SelectStyle.controlFont.size).fontWeight(SelectStyle.controlFont.weight)
          .fontColor($r('app.color.text_primary')).maxLines(this.valueMaxLines).textOverflow({ overflow: TextOverflow.Ellipsis })
          .constraintSize({ minWidth: 0 }).flexShrink(1)
        DisclosureChevron().rotate({ angle: this.disclosureAngle, centerX: '50%', centerY: '50%' })
          .animation(disclosureAnimation()).flexShrink(0)
      }.width('100%').justifyContent(FlexAlign.End).alignItems(VerticalAlign.Center)
    }.type(ButtonType.Normal).width(this.controlWidth).flexShrink(0)
      .height(this.valueMaxLines > 1 ? 'auto' : SelectStyle.controlHeightFor(this.getUIContext()))
      .constraintSize({ maxWidth: this.controlMaxWidth, minHeight: SelectStyle.controlHeightFor(this.getUIContext()) })
      .padding({ left: SelectStyle.controlPadding.left, right: SelectStyle.controlPadding.right,
        top: this.valueMaxLines > 1 ? 8 : 0, bottom: this.valueMaxLines > 1 ? 8 : 0 })
      .backgroundColor(Color.Transparent).border({ width: 0 }).borderRadius(0)
      .enabled(this.isInteractive).attributeModifier(new PressFeedback(1, 0.4, true)).stateEffect(false)
      .accessibilityText(typeof this.label === 'string' ? this.label : localizedResourceText(this.getUIContext(), this.language, this.label))
      .accessibilityDescription(this.value).onAreaChange((_old: Area, area: Area): void => { this.triggerArea = area; })
    .onClick((): void => { this.activate(); })
  }
}
