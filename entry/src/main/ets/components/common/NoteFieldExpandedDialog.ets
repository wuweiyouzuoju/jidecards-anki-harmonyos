// SPDX-License-Identifier: AGPL-3.0-or-later
import { DialogFrame } from './DialogFrame';
import { DialogHeader } from './DialogHeader';

/** 只承载当前字段；草稿、模式和输入控制器仍由原编辑器拥有。 */
@CustomDialog
export struct NoteFieldExpandedDialog {
  controller?: CustomDialogController;
  fieldName: string = '';
  onClose: () => void = (): void => {};
  @BuilderParam content: () => void = this.empty;
  @Builder
  private empty(): void {}
  @Builder
  private header() {
    DialogHeader({ title: this.fieldName, showAction: false, closeLabel: $r('app.string.done'),
      onClose: (): void => { this.onClose(); } })
  }
  build() {
    DialogFrame({ nativeHost: true, maximumWidth: 960, fillBody: true,
      header: (): void => { this.header(); }, content: (): void => { this.content(); },
      onDismiss: (): void => { this.onClose(); } })
  }
}
