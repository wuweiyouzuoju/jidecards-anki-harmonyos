// SPDX-License-Identifier: AGPL-3.0-or-later
import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { resourceText, namedResourceText } from '../../utils/UiFeedback';

@Component
export struct BrowserBatchConfirm {
  @Prop @Watch('handleBackRequest') backRequest: number = 0;

  private handleBackRequest(): void {
    if (!this.busy) this.onClose();
  }

  @Prop isDark: boolean = false;
  @Prop busy: boolean = false;
  onClose: () => void = (): void => {};
  @Prop title: Resource = $r('app.string.browser_action_suspend');
  @Prop message: Resource = $r('app.string.browser_action_suspend_confirm');
  @Prop destructive: boolean = false;
  onSubmit: () => void = (): void => {};

  @Builder
  private dialogHeader() {
    DialogHeader({
      title: this.title,
      closeLabel: $r('app.string.browser_detail_cancel'),
      closeEnabled: !this.busy,
      onClose: (): void => { this.onClose(); },
      actionLabel: $r('app.string.browser_detail_confirm'),
      actionEnabled: !this.busy,
      onAction: (): void => { this.onSubmit(); },
      destructive: this.destructive
    })
  }

  @Builder
  private dialogContent() {
    Text(this.message)
      .fontSize(应用尺寸.字号_正文)
      .fontColor($r('app.color.text_primary'))
      .width('100%')
  }

  build() {
    DialogFrame({ maximumWidth: 应用尺寸.dialogCompactMaxWidth, canDismiss: !this.busy,
      header: () => { this.dialogHeader(); }, content: () => { this.dialogContent(); },
      onDismiss: (): void => { this.onClose(); } })
  }
}
