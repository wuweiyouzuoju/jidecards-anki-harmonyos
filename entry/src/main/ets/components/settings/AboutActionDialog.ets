// SPDX-License-Identifier: AGPL-3.0-or-later
import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';
import { 按下态按钮 } from '../common/按下态按钮';
import { 应用尺寸 } from '../../utils/应用尺寸';

/** 关于页的反馈与赞赏弹窗；系统负责遮罩、返回键和点击外部关闭。 */
@CustomDialog
export struct AboutActionDialog {
  controller?: CustomDialogController;
  @Prop sponsor: boolean = false;
  @Prop groupNumber: string = '';
  onCopyGroup: () => void = (): void => {};
  onClose: () => void = (): void => {};

  @Builder
  private dialogHeader() {
    DialogHeader({
      title: this.sponsor ? $r('app.string.sponsor_title') : $r('app.string.feedback_title'),
      actionLabel: $r('app.string.done'),
      showClose: false,
          onAction: (): void => { this.onClose(); }
    })
  }

  @Builder
  private dialogContent() {
    Column({ space: 应用尺寸.间距_12 }) {
      Text(this.sponsor ? $r('app.string.sponsor_hint') : $r('app.string.feedback_hint'))
        .fontSize(应用尺寸.字号_正文)
        .fontColor($r('app.color.text_secondary'))
        .width('100%')
      if (this.sponsor) {
        Image($r('app.media.sponsor_qrcode'))
          .width(180).height(180)
          .objectFit(ImageFit.Contain)
          .borderRadius(8)
          .accessibilityText($r('app.string.sponsor_qrcode_hint'))
        Text($r('app.string.sponsor_qrcode_hint'))
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_secondary'))
      } else {
        Text(this.groupNumber)
          .fontSize(24)
          .fontWeight(FontWeight.Medium)
          .fontColor($r('app.color.text_primary'))
          .copyOption(CopyOptions.LocalDevice)
        按下态按钮({
          文案: $r('app.string.feedback_copy_group'),
          点击回调: (): void => { this.onCopyGroup(); }
        })
      }
    }
    .width('100%')
  }

  build() {
    DialogFrame({ nativeHost: true, maximumWidth: 应用尺寸.dialogMaxWidth,
      onDismiss: (): void => { this.onClose(); },
      header: () => { this.dialogHeader(); }, content: () => { this.dialogContent(); } })
  }
}
