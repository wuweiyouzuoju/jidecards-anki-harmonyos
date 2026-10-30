// SPDX-License-Identifier: AGPL-3.0-or-later
import { AnchoredMenu } from './AnchoredMenu';
import { ActionMenuAnchor } from './ActionMenuLayout';
import { DialogFrame } from './DialogFrame';
import { DialogHeader } from './DialogHeader';
import { SelectionOptions } from './SelectionOptions';
import { ActionMenuListItem } from './ActionMenuList';
import { 应用尺寸 } from '../../utils/应用尺寸';

/** @internal 二级单选窗口；原生窗口身份与提交守卫归调用方。 */
@CustomDialog
export struct SelectionDialog {
  controller?: CustomDialogController;
  @Link items: ActionMenuListItem[];
  @Link isInteractive: boolean;
  @Prop anchor: ActionMenuAnchor | undefined = undefined;
  @State private hostLeft: number = 0;
  @State private hostTop: number = 0;
  @Prop title: ResourceStr = '';
  onSelect: (id: string) => void = (_id: string): void => {};
  onClose: () => void = (): void => {};
  @Builder
  private header() {
    DialogHeader({ title: this.title, showAction: false, closeEnabled: this.isInteractive, onClose: this.onClose })
  }
  @Builder
  private content() {
    SelectionOptions({ items: this.items, isInteractive: this.isInteractive, onSelect: this.onSelect })
  }
  build() {
    if (this.anchor !== undefined) {
      Stack() {
        AnchoredMenu({ menuWidth: this.anchor.width, contentLeft: this.anchor.left - this.hostLeft,
          topOffset: this.anchor.top - this.hostTop, alignEnd: false,
          content: (): void => { this.content(); }, onClose: this.onClose })
      }.width('100%').height('100%')
        .onAreaChange((_old: Area, area: Area): void => {
          this.hostLeft = Number(area.globalPosition.x); this.hostTop = Number(area.globalPosition.y);
        })
    } else {
    DialogFrame({ nativeHost: true, maximumWidth: 应用尺寸.dialogCompactMaxWidth, canDismiss: this.isInteractive,
      header: () => { this.header(); }, content: () => { this.content(); }, onDismiss: this.onClose })
    }
  }
}
