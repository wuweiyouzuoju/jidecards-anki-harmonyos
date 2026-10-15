// SPDX-License-Identifier: AGPL-3.0-or-later
import { DirectoryRow, DirectoryView, directorySelectionAllowed } from '../../model/DirectoryTree';
import { DirectorySelectDialog } from './DirectorySelectDialog';
import { DisclosureChevron } from './DisclosureChevron';
import { FormSelectRow } from './FormSelectRow';
import { NativeDialogHost, NativeDialogFactory, NativeDialogDismiss, NativeDialogPresentation } from './NativeDialogHost';
import { SelectStyle } from '../../utils/SelectStyle';
import { PressFeedback } from '../../utils/PressFeedback';
import { showToastSafely } from '../../utils/UiFeedback';

/** 下拉外观的目录入口；窗口、搜索和列表共用公共实现，业务仍按稳定 ID 选择。 */
@Component
export struct DirectorySelect {
  @Prop label: ResourceStr = '';
  @Prop title: ResourceStr = '';
  @Prop showLabel: boolean = true;
  @Prop showHelp: boolean = false;
  @Prop labelActionIcon: ResourceStr | undefined = undefined;
  @Prop labelActionLabel: ResourceStr = '';
  @Prop isLabelActionEnabled: boolean = true;
  onLabelAction: () => void = (): void => {};
  onHelp: () => void = (): void => {};
  @Prop @Watch('syncRows') rows: DirectoryRow[] = [];
  @Prop value: string = '';
  @Prop @Watch('openRequested') openRequest: number = 0;
  private handledRequest: number = 0;
  private openRequested(): void {
    if (!this.alive || this.openRequest === this.handledRequest) return;
    this.handledRequest = this.openRequest; this.open();
  }
  @Prop @Watch('syncRows') isInteractive: boolean = true;
  @Prop surfaceColor: ResourceColor = $r('app.color.surface_sidebar');
  onSelect: (id: string) => void = (_id: string): void => {};
  onViewChanged: (view: DirectoryView | null) => void = (_view: DirectoryView | null): void => {};
  @State private dialogRows: DirectoryRow[] = [];
  @State private dialogInteractive: boolean = true;
  private readonly dialog: NativeDialogHost = new NativeDialogHost();
  private alive: boolean = false;
  private version: number = 0;
  private readonly createDialog: NativeDialogFactory = (dismiss: NativeDialogDismiss): CustomDialogController => {
    const version: number = this.version;
    const presentation: NativeDialogPresentation = this.dialog.presentation();
    return new CustomDialogController({
      builder: DirectorySelectDialog({ rows: this.dialogRows, isInteractive: this.dialogInteractive,
        title: this.showLabel ? this.label : this.title,
        onSelect: (id: string): void => { if (version === this.version) this.select(id); },
        onClose: this.dialog.guard((): void => { this.close(); }),
        onViewChanged: (view: DirectoryView | null): void => {
          if (version === this.version) this.onViewChanged(view);
        } }),
      onWillDismiss: dismiss, autoCancel: presentation.autoCancel, customStyle: presentation.customStyle,
      alignment: presentation.alignment, width: presentation.width, height: presentation.height,
      maskColor: presentation.maskColor, openAnimation: presentation.openAnimation, closeAnimation: presentation.closeAnimation
    });
  };
  aboutToAppear(): void { this.alive = true; this.dialog.activate(); this.syncRows(); this.openRequested(); }
  aboutToDisappear(): void { this.alive = false; this.close(); this.dialog.dispose(); }
  private syncRows(): void { this.dialogRows = this.rows; this.dialogInteractive = this.isInteractive; }
  private open(): void {
    if (!this.alive || !this.isInteractive || this.rows.length === 0) return;
    this.syncRows(); this.version++;
    try { this.dialog.open(this.createDialog, (): boolean => {
      this.version++; this.onViewChanged(null); return true;
    }); }
    catch (error) { showToastSafely(this.getUIContext(), { message: $r('app.string.directory_open_error') }); }
  }
  private close(): void { this.version++; this.dialog.close(); this.onViewChanged(null); }
  private select(id: string): void {
    if (!this.alive || this.dialog.current() === null || !directorySelectionAllowed(this.rows, id, this.isInteractive)) return;
    this.close(); this.onSelect(id);
  }
  private controlWidth(): number {
    const context = this.getUIContext();
    const textWidth: number = context.getMeasureUtils().measureText({ textContent: this.value,
      fontSize: SelectStyle.controlFont.size, fontWeight: SelectStyle.controlFont.weight });
    // 显式内容宽度让内部行按按钮的最终限宽测量；24vp 是公共展开箭头的尺寸。
    return Math.ceil(context.px2vp(textWidth)) + Number(SelectStyle.controlPadding.left) +
      Number(SelectStyle.controlPadding.right) + SelectStyle.controlSpace + 24 +
      Number(SelectStyle.controlBorder.width) * 2;
  }
  @Builder
  private control(fill: boolean = false) {
    Button() {
      Row({ space: SelectStyle.controlSpace }) {
        Text(this.value).fontSize(SelectStyle.controlFont.size).fontWeight(SelectStyle.controlFont.weight)
          .fontColor($r('app.color.text_primary')).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
          .constraintSize({ minWidth: 0 }).layoutWeight(1)
        DisclosureChevron().rotate({ angle: 90 }).flexShrink(0)
      }.width('100%')
    }.type(ButtonType.Normal).width(fill ? '100%' : this.controlWidth())
      .constraintSize(fill ? { maxWidth: '100%' } : this.labelActionIcon !== undefined ?
        SelectStyle.fieldConstraint : SelectStyle.directoryFieldConstraint).flexShrink(0)
      .height(SelectStyle.controlHeight).padding(SelectStyle.controlPadding)
      // Button.border 会覆盖默认圆角，显式圆角必须放在边框之后。
      .backgroundColor(this.surfaceColor).border(SelectStyle.controlBorder).borderRadius(SelectStyle.controlRadius)
      .clip(true)
      .attributeModifier(new PressFeedback()).stateEffect(false).enabled(this.isInteractive && this.rows.length > 0)
      .accessibilityText(this.value).onClick((): void => { this.open(); })
  }
  build() {
    if (this.showLabel) {
      FormSelectRow({ label: this.label, showHelp: this.showHelp, onHelp: this.onHelp,
        labelActionIcon: this.labelActionIcon, labelActionLabel: this.labelActionLabel,
        isLabelActionEnabled: this.isLabelActionEnabled, onLabelAction: this.onLabelAction,
        isInteractive: this.isInteractive, useCustomControl: true,
        customControl: () => { this.control(); } })
    } else {
      this.control(true)
    }
  }
}
