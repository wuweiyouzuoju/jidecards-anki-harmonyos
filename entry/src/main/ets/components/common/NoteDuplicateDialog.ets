// SPDX-License-Identifier: AGPL-3.0-or-later
import { DialogFrame } from './DialogFrame';
import { DialogHeader } from './DialogHeader';
import { 按下态按钮 } from './按下态按钮';
import { 应用尺寸 } from '../../utils/应用尺寸';

/** 保存尚未发生；取消回到原草稿，查看重复项不消费确认。 */
@Component
export struct NoteDuplicateDialog {
  onCancel: () => void = (): void => {};
  onContinue: () => void = (): void => {};
  onView: () => void = (): void => {};
  @Builder
  private headerContent() {
    DialogHeader({ title: $r('app.string.add_note_duplicate_title'),
      closeLabel: $r('app.string.cancel'), actionLabel: $r('app.string.add_note_duplicate_continue'),
      onClose: (): void => { this.onCancel(); }, onAction: (): void => { this.onContinue(); } })
  }
  @Builder
  private content() {
    Text($r('app.string.add_note_duplicate_warning')).width('100%')
      .fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_primary'))
    按下态按钮({ 文案: $r('app.string.add_note_duplicate_view'), 点击回调: (): void => { this.onView(); } })
  }
  build() {
    DialogFrame({ onDismiss: (): void => { this.onCancel(); },
      header: () => { this.headerContent(); }, content: () => { this.content(); } })
  }
}
