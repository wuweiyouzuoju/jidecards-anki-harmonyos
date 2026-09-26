// SPDX-License-Identifier: AGPL-3.0-or-later
import { DialogHeader } from '../common/DialogHeader';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { resourceText } from '../../utils/UiFeedback';

@Component
export struct BrowserSavedSearchDialog {
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

  build() {
    Stack() {
      Column().width('100%').height('100%')
        .backgroundColor(this.isDark ? 'rgba(0,0,0,0.40)' : 'rgba(0,0,0,0.15)')
        .onClick((): void => { if (!this.busy) this.onClose(); });
      Column({ space: 应用尺寸.间距_14 }) {
        DialogHeader({ title: this.title(), closeLabel: $r('app.string.browser_detail_cancel'),
          closeEnabled: !this.busy, actionLabel: this.busy ? $r('app.string.browser_saved_search_saving') : $r('app.string.browser_detail_confirm'),
          actionEnabled: !this.busy, onClose: (): void => this.onClose(),
          onAction: (): void => this.onSubmit(this.name) });
        Text(this.initialSearch).fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_secondary')).width('100%').maxLines(2);
        TextInput({ text: this.name, placeholder: resourceText(this.getUIContext(), $r('app.string.browser_saved_search_name_placeholder')) })
          .fontSize(应用尺寸.字号_正文).height(应用尺寸.按钮高度).width('100%')
          .enabled(!this.busy).onChange((value: string): void => { this.name = value; });
        if (this.error !== '') Text(this.error).fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.error_text')).width('100%');
      }.width('85%').constraintSize({ maxWidth: 460 }).padding(应用尺寸.卡片内边距)
        .backgroundColor($r('app.color.surface_card')).borderRadius(应用尺寸.圆角_卡片)
        .onClick((): void => {});
    }.width('100%').height('100%');
  }
}
