// SPDX-License-Identifier: AGPL-3.0-or-later
import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { resourceText, namedResourceText } from '../../utils/UiFeedback';

@Component
export struct BrowserRenameTagDialog {
  @Prop isDark: boolean = false;
  @Prop busy: boolean = false;
  onClose: () => void = (): void => {};
  @Prop original: string = '';
  @Prop error: string = '';
  @State private name: string = '';
  onSubmit: (name: string) => void = (_name: string): void => {};
  aboutToAppear(): void { this.name = this.original; }

  @Builder
  private dialogHeader() {
    DialogHeader({
      title: $r('app.string.browser_tag_rename_title'),
      closeLabel: $r('app.string.browser_detail_cancel'),
      closeEnabled: !this.busy,
      onClose: (): void => {
        this.onClose();
      },
      actionLabel: this.busy ? $r('app.string.browser_tag_rename_running') : $r('app.string.browser_detail_confirm'),
      actionEnabled: !this.busy,
      onAction: (): void => {
        this.onSubmit(this.name);
      }
    })
  }

  @Builder
  private dialogContent() {
    Column({ space: 应用尺寸.间距_4 }) {
      Text($r('app.string.browser_tag_rename_current'))
        .fontSize(应用尺寸.字号_正文_小)
        .fontColor($r('app.color.text_secondary'))
      Text(this.original)
        .fontSize(应用尺寸.字号_正文)
        .fontColor($r('app.color.text_primary'))
        .width('100%')
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)

    Column({ space: 应用尺寸.间距_4 }) {
      Text($r('app.string.browser_tag_rename_new'))
        .fontSize(应用尺寸.字号_正文_小)
        .fontColor($r('app.color.text_secondary'))
      TextInput({ text: this.name, placeholder: resourceText(this.getUIContext(), $r('app.string.browser_tag_rename_placeholder')) })
        .fontSize(应用尺寸.字号_正文)
        .fontColor($r('app.color.text_primary'))
        .backgroundColor($r('app.color.surface_page'))
        .borderRadius(应用尺寸.圆角_面板)
        .height(应用尺寸.按钮高度)
        .width('100%')
        .enabled(!this.busy)
        .onChange((值: string): void => {
          this.name = 值;
        })
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)

    if (this.error !== '') {
      Text(this.error)
        .fontSize(应用尺寸.字号_正文_小)
        .fontColor($r('app.color.error_text'))
        .width('100%')
    }
  }

  build() {
    DialogFrame({ maximumWidth: 应用尺寸.dialogMaxWidth, canDismiss: !this.busy,
      header: () => { this.dialogHeader(); }, content: () => { this.dialogContent(); },
      onDismiss: (): void => { this.onClose(); } })
  }
}
