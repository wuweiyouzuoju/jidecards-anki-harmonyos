import { 颜色键 } from '../../model/颜色主题';
import { GLASS_HOME_SOURCE } from '../../utils/GlassBackdrop';
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
  @StorageProp(颜色键.动作主色) private actionColor: string = '#2F5FD0';
  @State private requestedGlass: boolean = true;
  onReady: () => void = (): void => {};
  onConfirm: () => void = (): void => {};
  onKeep: () => void = (): void => {};

  /** 按钮与遮罩走同一入口，等待存储时不能换动作或重复提交。 */
  private choose(useGlass: boolean): void {
    if (this.busy) return;
    this.requestedGlass = useGlass;
    if (useGlass) this.onConfirm(); else this.onKeep();
  }

  @Builder
  private body() {
    AppearanceReveal({ label: $r('app.string.surface_material_glass'), colors: ['#8893A3', '#8893A3', '#8893A3'] })
    Text($r('app.string.glass_suggestion_title')).fontSize(应用尺寸.字号_标题).fontWeight(FontWeight.Bold)
      .fontColor($r('app.color.text_primary')).width('100%').textAlign(TextAlign.Center).margin({ top: 8 })
    Text($r('app.string.glass_suggestion_message')).fontSize(应用尺寸.字号_正文)
      .fontColor($r('app.color.text_secondary')).lineHeight(24).width('100%')
  }

  @Builder
  private actions() {
    Column({ space: 8 }) {
      PrimaryActionButton({ label: $r('app.string.glass_suggestion_confirm'), isInteractive: !this.busy,
        glassSurface: true, glassAccent: this.actionColor, tint: `#33${this.actionColor.slice(-6)}`, foreground: this.actionColor,
        feedback: this.busy && this.requestedGlass ? 'busy' : '',
        onAction: (): void => { this.choose(true); } })
      按下态按钮({ 文案: $r('app.string.glass_suggestion_keep'), compact: true, fillWidth: true,
        字号: 应用尺寸.字号_正文, 字色: $r('app.color.text_secondary'),
        feedback: this.busy && !this.requestedGlass ? 'busy' : '',
        是否启用: !this.busy, 点击回调: (): void => { this.choose(false); } })
    }.width('100%')
  }

  build() {
    DialogFrame({ nativeHost: true, onPrepared: this.onReady, showPreparation: true, materialOverride: 'glass', surfaceRole: 'preview', refractionSource: GLASS_HOME_SOURCE, maximumWidth: 应用尺寸.dialogCompactMaxWidth, actionsAtBottom: true,
      canDismiss: !this.busy, onDismiss: (): void => { this.choose(false); },
      header: (): void => { this.actions(); }, content: (): void => { this.body(); } })
  }
}
