// SPDX-License-Identifier: AGPL-3.0-or-later
import { AppearanceCustomizationHubDialog } from './AppearanceCustomizationHubDialog';
import { FormSelectRow } from '../common/FormSelectRow';
import { SelectionValueButton } from '../common/SelectionValueButton';
import { FormRowLayout } from '../../utils/FormRowLayout';
import { SelectStyle } from '../../utils/SelectStyle';
import { localizedResourceText } from '../../utils/UiFeedback';
import { NativeDialogHost, NativeDialogDismiss, NativeDialogPresentation } from '../common/NativeDialogHost';

/** 外观分组只展示标准设置行，编辑草稿由独立公共弹窗承载。 */
@Component
export struct AppearanceCustomizationControl {
  @StorageProp('系统语言') private language: string = 'zh-Hans';
  private readonly host: NativeDialogHost = new NativeDialogHost();
  private dismissGuard: () => boolean = (): boolean => true;
  private readonly createDialog = (dismiss: NativeDialogDismiss): CustomDialogController => {
    const presentation: NativeDialogPresentation = this.host.presentation();
    return new CustomDialogController({
      builder: AppearanceCustomizationHubDialog({
        registerDismiss: (guard: () => boolean): void => { this.dismissGuard = guard; },
        onClose: this.host.guard((): void => { this.host.close(); }) }),
      autoCancel: presentation.autoCancel, customStyle: presentation.customStyle,
      alignment: presentation.alignment, width: presentation.width, height: presentation.height,
      maskColor: presentation.maskColor, keyboardAvoidMode: presentation.keyboardAvoidMode,
      openAnimation: presentation.openAnimation, closeAnimation: presentation.closeAnimation,
      onWillDismiss: dismiss
    });
  };
  aboutToAppear(): void { this.host.activate(); }
  aboutToDisappear(): void { this.host.dispose(); }
  private open(): void {
    this.dismissGuard = (): boolean => true;
    this.host.open(this.createDialog, (): boolean => this.dismissGuard());
  }
  @Builder
  private entry() {
    SelectionValueButton({ value: localizedResourceText(this.getUIContext(), this.language, $r('app.string.appearance_adjust')),
      label: $r('app.string.appearance_customize'), disclosureAngle: 0,
      controlWidth: this.valueWidth(), onAction: (): void => { this.open(); } })
      .constraintSize(FormRowLayout.trailingConstraint).flexShrink(0)
  }
  private valueWidth(): number {
    const ui = this.getUIContext();
    const value: string = localizedResourceText(ui, this.language, $r('app.string.appearance_adjust'));
    return Math.ceil(ui.px2vp(ui.getMeasureUtils().measureText({textContent: value,
      fontSize: SelectStyle.controlFont.size, fontWeight: SelectStyle.controlFont.weight}))) +
      Number(SelectStyle.controlPadding.left) + Number(SelectStyle.controlPadding.right) + SelectStyle.controlSpace + 24;
  }
  build() {
    FormSelectRow({ label: $r('app.string.appearance_customize'), useCustomControl: true,
      customControl: (): void => { this.entry(); } })
  }
}
