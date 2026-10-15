// SPDX-License-Identifier: AGPL-3.0-or-later
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { HelpLabel } from './HelpLabel';
import { IconActionButton } from './IconActionButton';
import { 按下态按钮 } from './按下态按钮';
import { 颜色键 } from '../../model/颜色主题';
import { DIALOG_ACTION_PRESENTATION } from '../../model/InteractionFeedback';
import { 应用尺寸 } from '../../utils/应用尺寸';

/** 固定标题操作栏：图标位于标题两侧，可见文字操作在标题下方；业务校验由调用方传入。 */
@Component
export struct DialogHeader {
  @Prop title: ResourceStr = '';
  @Prop highlightLabel: ResourceStr = '';
  @Prop highlightColors: string[] = [];
  @Prop actionLabel: ResourceStr = $r('app.string.done');
  @Prop actionIcon: ResourceStr = '';
  @Prop closeLabel: ResourceStr = $r('app.string.cancel');
  @Prop closeIcon: ResourceStr = $r('app.media.ic_common_close');
  // 引导继续、取消传输和风险确认需要可见文案解释结果。
  @Prop showCloseLabel: boolean = false;
  // 普通确认/完成用勾号；引导、传输、检查和忙碌状态由宿主显式保留文字。
  @Prop showActionLabel: boolean = false;
  @Prop actionEnabled: boolean = true;
  @Prop closeEnabled: boolean = true;
  @Prop showClose: boolean = true;
  @Prop showAction: boolean = true;
  @Prop showHelp: boolean = false;
  @Prop helpEnabled: boolean = true;
  @Prop destructive: boolean = false;
  @Prop showDivider: boolean = true;
  // 页面复用标题操作时，顶栏到首卡的留白由页面内容区独占。
  @Prop isPageToolbar: boolean = false;
  onHelp: () => void = (): void => {};
  onAction: () => void = (): void => {};
  onClose: () => void = (): void => {};
  @StorageProp(颜色键.动作主色) private actionColor: string = '#2F5FD0';

  private actionUsesIcon(): boolean { return !this.showActionLabel && !this.destructive; }
  private usesTextRow(): boolean {
    return (this.showClose && this.showCloseLabel) || (this.showAction && !this.actionUsesIcon());
  }
  private titleInset(): number {
    const hasIcon: boolean = (this.showClose && !this.showCloseLabel) || (this.showAction && this.actionUsesIcon());
    return hasIcon ? 应用尺寸.按钮高度 + 应用尺寸.间距_16 : 0;
  }

  build() {
    Column({ space: 8 }) {
      Stack({ alignContent: Alignment.Center }) {
        Row() {
          Row() {
            if (this.showClose && !this.showCloseLabel) {
              IconActionButton({ toolbarStyle: true, source: this.closeIcon, label: this.closeLabel,
                isInteractive: this.closeEnabled, onAction: this.onClose })
            }
          }.width(应用尺寸.按钮高度).justifyContent(FlexAlign.Start)
          Blank().layoutWeight(1)
          Row() {
            if (this.showAction && this.actionUsesIcon()) {
              IconActionButton({ toolbarStyle: true, source: this.actionIcon || $r('app.media.' + DIALOG_ACTION_PRESENTATION.confirmIconKey),
                label: this.actionLabel, isInteractive: this.actionEnabled, onAction: this.onAction })
            }
          }.width(应用尺寸.按钮高度).justifyContent(FlexAlign.End)
        }.width('100%')
        // 完整标题按按钮尺寸对称留边；标题层不截获两侧按钮的点击。
        Row() {
          HelpLabel({ title: this.title, textSize: 18, textWeight: FontWeight.Bold,
            highlightLabel: this.highlightLabel, highlightColors: this.highlightColors,
            centered: true, limitTitleLines: false, showHelp: this.showHelp,
            isHelpEnabled: this.helpEnabled, onHelp: this.onHelp })
            .layoutWeight(1)
        }.width('100%').padding({ left: this.titleInset(), right: this.titleInset() })
          .hitTestBehavior(HitTestMode.Transparent)
      }.width('100%').constraintSize({ minHeight: 44 })
      if (this.usesTextRow()) {
        // 需要文字解释的操作独占一行，避免挤在标题两侧而截断。
        Row({ space: 8 }) {
          if (this.showClose && this.showCloseLabel) {
            按下态按钮({ 文案: this.closeLabel, 字色: $r('app.color.text_secondary'),
              是否启用: this.closeEnabled, singleLine: false, fillWidth: true, autoHeight: true, 点击回调: this.onClose })
              .layoutWeight(1)
          }
          if (this.showAction && !this.actionUsesIcon()) {
            按下态按钮({ 文案: this.actionLabel, 字色: this.destructive ? $r('app.color.error_text') : this.actionColor,
              themeText: !this.destructive, 是否启用: this.actionEnabled, singleLine: false, fillWidth: true, autoHeight: true, 点击回调: this.onAction })
              .layoutWeight(1)
          }
        }.width('100%')
      }
    }
    .width('100%')
    .constraintSize({ minHeight: this.isPageToolbar ? 应用尺寸.按钮高度 : 48 })
    .padding({ bottom: this.isPageToolbar ? 0 : 8 })
    .border(SurfaceBorder.options({ bottom: this.showDivider ? 0.5 : 0 }))
  }
}
