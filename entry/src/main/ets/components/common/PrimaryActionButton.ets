// SPDX-License-Identifier: AGPL-3.0-or-later
import { PressFeedback } from '../../utils/PressFeedback';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { localizedResourceText } from '../../utils/UiFeedback';
import { 颜色键 } from '../../model/颜色主题';
import { ActionStatus } from './ActionStatus';

/** 主操作按钮统一几何与反馈；宿主决定可用状态、忙碌文案及业务动作。 */
@Component
export struct PrimaryActionButton {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @StorageProp(颜色键.主色按钮背景) private primaryBackground: string = '#2F5FD0';
  @Prop label: ResourceStr = '';
  @Prop isInteractive: boolean = true;
  @Prop tint: ResourceColor | undefined = undefined;
  @Prop feedback: string = '';
  onAction: () => void = (): void => {};

  private activate(): void {
    if (this.isInteractive) this.onAction();
  }

  private resolvedTint(): ResourceColor { return this.tint ?? this.primaryBackground; }

  build() {
    Button() {
      Row({ space: 8 }) {
        if (this.feedback !== '') { ActionStatus({ phase: this.feedback, tint: '#FFFFFF' }) }
        Text(this.label).fontSize(应用尺寸.字号_按钮).fontColor('#FFFFFF').maxLines(1)
      }.justifyContent(FlexAlign.Center)
    }
      .width('100%')
      .height(应用尺寸.按钮高度)
      .fontSize(应用尺寸.字号_按钮)
      .fontColor('#FFFFFF')
      .backgroundColor(this.resolvedTint())
      .borderRadius(应用尺寸.圆角_胶囊)
      .enabled(this.isInteractive)
      .opacity(this.isInteractive ? 1 : 0.6)
      .attributeModifier(new PressFeedback(this.isInteractive ? 1 : 0.6))
      .stateEffect(false)
      .accessibilityText(typeof this.label === 'string' ? this.label : localizedResourceText(this.getUIContext(), this.uiLanguage, this.label))
      .onClick((): void => { this.activate(); })
  }
}
