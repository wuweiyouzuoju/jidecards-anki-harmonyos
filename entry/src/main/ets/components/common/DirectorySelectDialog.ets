// SPDX-License-Identifier: AGPL-3.0-or-later
import { DirectoryRow, DirectoryView } from '../../model/DirectoryTree';
import { DirectoryTree } from './DirectoryTree';
import { DialogFrame } from './DialogFrame';
import { DialogHeader } from './DialogHeader';
import { 应用尺寸 } from '../../utils/应用尺寸';

/** @internal 只承载公共目录，选择立即交回原业务入口。 */
@CustomDialog
export struct DirectorySelectDialog {
  controller?: CustomDialogController;
  @Link rows: DirectoryRow[];
  @Link isInteractive: boolean;
  @Prop title: ResourceStr = '';
  onSelect: (id: string) => void = (_id: string): void => {};
  onClose: () => void = (): void => {};
  onViewChanged: (view: DirectoryView | null) => void = (_view: DirectoryView | null): void => {};
  @Builder
  private header() {
    DialogHeader({ title: this.title, showAction: false, onClose: this.onClose })
  }
  @Builder
  private content() {
    DirectoryTree({ rows: this.rows, isInteractive: this.isInteractive,
      onSelect: this.onSelect, onViewChanged: this.onViewChanged })
  }
  build() {
    DialogFrame({ nativeHost: true, maximumWidth: 应用尺寸.dialogMaxWidth,
      header: () => { this.header(); }, content: () => { this.content(); }, onDismiss: this.onClose })
  }
}

