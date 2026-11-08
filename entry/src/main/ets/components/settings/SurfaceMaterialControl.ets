// SPDX-License-Identifier: AGPL-3.0-or-later
import { FormRowLayout } from '../../utils/FormRowLayout';
import { settingsItemText } from '../../utils/SettingsStructureText';
import { SURFACE_MATERIAL_KEY, surfaceMaterialTitleKey } from '../../model/SurfaceMaterial';
import { FormSelectRow } from '../common/FormSelectRow';
import { SelectionValueButton } from '../common/SelectionValueButton';
import { NativeDialogHost, NativeDialogDismiss, NativeDialogPresentation } from '../common/NativeDialogHost';
import { SelectStyle } from '../../utils/SelectStyle';
import { localizedNamedResourceText } from '../../utils/UiFeedback';
import { SurfaceMaterialDialog } from './SurfaceMaterialDialog';

@Component
export struct SurfaceMaterialControl {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @StorageProp(SURFACE_MATERIAL_KEY) private style: string = 'flat';
  private readonly host: NativeDialogHost = new NativeDialogHost();
  private dismissGuard: () => boolean = (): boolean => true;
  private readonly createDialog = (dismiss: NativeDialogDismiss): CustomDialogController => {
    const presentation: NativeDialogPresentation = this.host.presentation();
    return new CustomDialogController({
      builder: SurfaceMaterialDialog({
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
  private materialValue(value: string) {
    SelectionValueButton({ value: value, label: $r('app.string.surface_material'), disclosureAngle: 0,
      controlWidth: this.valueWidth(value), onAction: (): void => { this.open(); } })
      .constraintSize(FormRowLayout.trailingConstraint).flexShrink(0)
  }

  private valueWidth(value: string): number {
    const ui = this.getUIContext();
    return Math.ceil(ui.px2vp(ui.getMeasureUtils().measureText({ textContent: value,
      fontSize: SelectStyle.controlFont.size, fontWeight: SelectStyle.controlFont.weight }))) +
      Number(SelectStyle.controlPadding.left) + Number(SelectStyle.controlPadding.right) + SelectStyle.controlSpace + 24;
  }

  build() {
    FormSelectRow({ label: settingsItemText(this.getUIContext(), 'surface_material', this.uiLanguage),
      useCustomControl: true, customControl: (): void => {
        this.materialValue(localizedNamedResourceText(this.getUIContext(), this.uiLanguage, surfaceMaterialTitleKey(this.style)));
      } })
  }
}
