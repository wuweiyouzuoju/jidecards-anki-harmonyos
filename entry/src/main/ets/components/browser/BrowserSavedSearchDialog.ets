// SPDX-License-Identifier: AGPL-3.0-or-later
import { DialogFrame } from '../common/DialogFrame';
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { DialogHeader } from '../common/DialogHeader';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { localizedResourceText } from '../../utils/UiFeedback';

@Component
export struct BrowserSavedSearchDialog {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop isDark: boolean = false;
  @Prop busy: boolean = false;
  @Prop editing: boolean = false;
  @Prop initialName: string = '';
  @Prop initialSearch: string = '';
  @Prop error: string = '';
  onClose: () => void = (): void => {};
  onSubmit: (name: string) => void = (_name: string): void => {};
  @State private name: string = '';

  aboutToAppear(): void { this.name = this.initialName; }

  private title(): Resource {
    return this.editing ? $r('app.string.browser_saved_search_rename_title') :
      $r('app.string.browser_saved_search_save_title');
  }

  @Builder
  private dialogHeader() {
    DialogHeader({ title: this.title(), closeLabel: $r('app.string.browser_detail_cancel'),
      closeEnabled: !this.busy, actionLabel: this.busy ? $r('app.string.browser_saved_search_saving') : $r('app.string.browser_detail_confirm'),
      actionEnabled: !this.busy, onClose: (): void => this.onClose(),
      onAction: (): void => this.onSubmit(this.name) })
  }

  @Builder
  private dialogContent() {
    Text(this.initialSearch).fontSize(应用尺寸.字号_正文_小)
      .fontColor($r('app.color.text_secondary')).width('100%').maxLines(2);
    TextInput({ text: this.name, placeholder: localizedResourceText(this.getUIContext(), this.uiLanguage, $r('app.string.browser_saved_search_name_placeholder')) })
      .border(SurfaceBorder.options())
      .fontSize(应用尺寸.字号_正文).height(应用尺寸.按钮高度).width('100%')
      .enabled(!this.busy).onChange((value: string): void => { this.name = value; });
    if (this.error !== '') Text(this.error).fontSize(应用尺寸.字号_正文_小)
      .fontColor($r('app.color.error_text')).width('100%');
  }

  build() {
    DialogFrame({ maximumWidth: 应用尺寸.dialogMaxWidth, canDismiss: !this.busy,
      header: () => { this.dialogHeader(); }, content: () => { this.dialogContent(); },
      onDismiss: (): void => { this.onClose(); } })
  }
}
