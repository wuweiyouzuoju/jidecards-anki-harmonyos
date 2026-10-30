// SPDX-License-Identifier: AGPL-3.0-or-later
import { DialogFrame } from '../common/DialogFrame';
import { PrimaryActionButton } from '../common/PrimaryActionButton';
import { 按下态按钮 } from '../common/按下态按钮';
import { AppearanceReveal } from '../common/AppearanceReveal';
import { 应用尺寸 } from '../../utils/应用尺寸';

/** 材质示意只做一次系统合成动画；不截取自身、不循环计时，也不提前更改用户偏好。 */
@CustomDialog
export struct GlassSuggestionDialog {
  controller?: CustomDialogController;
  @Link busy: boolean;
  onConfirm: () => void = (): void => {};
  onKeep: () => void = (): void => {};

  @Builder
  private body() {
    AppearanceReveal({ label: $r('app.string.surface_material_glass') })
    Text($r('app.string.glass_suggestion_title')).fontSize(应用尺寸.字号_标题).fontWeight(FontWeight.Bold)
      .fontColor($r('app.color.text_primary')).width('100%').textAlign(TextAlign.Center).margin({ top: 8 })
    Text($r('app.string.glass_suggestion_message')).fontSize(应用尺寸.字号_正文)
      .fontColor($r('app.color.text_secondary')).lineHeight(24).width('100%')
  }

  @Builder
  private actions() {
    Column({ space: 8 }) {
      PrimaryActionButton({ label: $r('app.string.glass_suggestion_confirm'), isInteractive: !this.busy,
        feedback: this.busy ? 'busy' : '', onAction: this.onConfirm })
      按下态按钮({ 文案: $r('app.string.glass_suggestion_keep'), compact: true, fillWidth: true,
        是否启用: !this.busy, 点击回调: this.onKeep })
    }.width('100%')
  }

  build() {
    DialogFrame({ nativeHost: true, maximumWidth: 应用尺寸.dialogCompactMaxWidth, actionsAtBottom: true,
      canDismiss: !this.busy, onDismiss: this.onKeep,
      header: (): void => { this.actions(); }, content: (): void => { this.body(); } })
  }
}
