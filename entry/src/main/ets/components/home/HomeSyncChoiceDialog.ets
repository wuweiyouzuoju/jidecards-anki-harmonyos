// SPDX-License-Identifier: AGPL-3.0-or-later
import { HOME_SYNC_CHOICES, AppInterfaceItem } from '../../model/AppInterface';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';
import { SettingsActionRow } from '../common/SettingsActionRow';

/** 只选择同步入口；设备和同步范围仍由直连页确认。 */
@Component
export struct HomeSyncChoiceDialog {
  onChoose: (target: string) => void = (_target: string): void => {};
  onClose: () => void = (): void => {};

  @Builder
  private header() {
    DialogHeader({ title: $r('app.string.sync_choice_title'), showAction: false, onClose: this.onClose })
  }

  @Builder
  private content() {
    Text($r('app.string.sync_choice_hint')).fontSize(应用尺寸.字号_正文_小)
      .fontColor($r('app.color.text_secondary')).width('100%')
    ForEach(HOME_SYNC_CHOICES, (item: AppInterfaceItem) => {
      SettingsActionRow({ title: $r('app.string.' + item.titleKey),
        hint: item.id === 'cloud' ? $r('app.string.sync_choice_cloud_hint') : $r('app.string.sync_choice_device_hint'),
        onAction: (): void => { this.onChoose(item.id); } })
    }, (item: AppInterfaceItem): string => item.id)
  }

  build() {
    DialogFrame({ maximumWidth: 应用尺寸.dialogCompactMaxWidth, onDismiss: this.onClose,
      header: () => { this.header(); }, content: () => { this.content(); } })
  }
}
