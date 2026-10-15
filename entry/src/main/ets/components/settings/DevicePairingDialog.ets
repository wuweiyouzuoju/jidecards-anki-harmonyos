// SPDX-License-Identifier: AGPL-3.0-or-later
import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';
import { 应用尺寸 } from '../../utils/应用尺寸';

/** 只展示本次配对码；窗口、有效期和配对完成后的关闭由设备直连宿主持有。 */
@CustomDialog
export struct DevicePairingDialog {
  controller?: CustomDialogController;
  @Prop invitation: string = '';
  onClose: () => void = (): void => {};

  @Builder
  private dialogHeader() {
    DialogHeader({ title: $r('app.string.device_link_code_title'), closeLabel: $r('app.string.close'),
      showAction: false, onClose: (): void => { this.onClose(); } })
  }

  @Builder
  private dialogContent() {
    Column({ space: 应用尺寸.间距_12 }) {
      QRCode(this.invitation).width('100%').constraintSize({ maxWidth: 240 }).aspectRatio(1).padding(8)
        .color($r('app.color.device_link_qr_foreground')).backgroundColor($r('app.color.device_link_qr_background'))
        .accessibilityText($r('app.string.device_link_code_title'))
      Text($r('app.string.device_link_code_hint')).fontSize(应用尺寸.字号_正文_小)
        .fontColor($r('app.color.text_secondary')).width('100%').textAlign(TextAlign.Start)
    }.width('100%').alignItems(HorizontalAlign.Center)
  }

  build() {
    DialogFrame({ nativeHost: true, maximumWidth: 应用尺寸.dialogCompactMaxWidth,
      onDismiss: (): void => { this.onClose(); },
      header: (): void => { this.dialogHeader(); }, content: (): void => { this.dialogContent(); } })
  }
}
