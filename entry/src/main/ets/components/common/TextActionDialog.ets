// SPDX-License-Identifier: AGPL-3.0-or-later
import { DialogFrame } from './DialogFrame';
import { PrimaryActionButton } from './PrimaryActionButton';
import { 按下态按钮 } from './按下态按钮';
import { 应用尺寸 } from '../../utils/应用尺寸';

/** 长文字确认：完整动作纵向排列并按内容增高，正文独立滚动。业务拥有一次确认与持久化。 */
@CustomDialog
export struct TextActionDialog {
  controller?: CustomDialogController;
  @Prop title: ResourceStr = '';
  @Prop message: ResourceStr = '';
  @Prop confirmLabel: ResourceStr = '';
  @Prop cancelLabel: ResourceStr = '';
  onConfirm: () => void = (): void => {};
  onCancel: () => void = (): void => {};

  @Builder
  private actions() {
    Column({ space: 应用尺寸.间距_8 }) {
      PrimaryActionButton({ label: this.confirmLabel, onAction: this.onConfirm }).width('100%')
      按下态按钮({ 文案: this.cancelLabel, fillWidth: true, 点击回调: this.onCancel })
    }.width('100%')
  }

  @Builder
  private body() {
    Text(this.title).fontSize(应用尺寸.字号_标题).fontWeight(FontWeight.Bold)
      .fontColor($r('app.color.text_primary')).width('100%').textAlign(TextAlign.Start)
    Text(this.message).fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_primary'))
      .width('100%').textAlign(TextAlign.Start)
  }

  build() {
    DialogFrame({ nativeHost: true, actionsAtBottom: true, canDismiss: false,
      header: () => { this.actions(); }, content: () => { this.body(); } })
  }
}
