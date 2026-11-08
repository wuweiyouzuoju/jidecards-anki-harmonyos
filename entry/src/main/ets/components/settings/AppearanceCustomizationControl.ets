// SPDX-License-Identifier: AGPL-3.0-or-later
import { FormSelectRow } from '../common/FormSelectRow';
import { SelectionValueButton } from '../common/SelectionValueButton';
import { FormRowLayout } from '../../utils/FormRowLayout';
import { SelectStyle } from '../../utils/SelectStyle';
import { localizedResourceText } from '../../utils/UiFeedback';
import { NativeDialogHost, NativeDialogDismiss, NativeDialogPresentation } from '../common/NativeDialogHost';
import { AppearanceCustomizationDialog } from './AppearanceCustomizationDialog';
import { CUSTOM_ACCENT_KEY, DEFAULT_CUSTOM_ACCENT, WALLPAPER_KEY } from '../../model/AppearanceCustomization';

/** 外观分组只展示标准设置行，编辑草稿由独立公共弹窗承载。 */
@Component
export struct AppearanceCustomizationControl {
  @StorageProp('系统语言') private language: string = 'zh-Hans';
  @StorageProp(CUSTOM_ACCENT_KEY) private accent: string = DEFAULT_CUSTOM_ACCENT;
  @StorageProp(WALLPAPER_KEY) private wallpaper: string = '';
  private readonly host: NativeDialogHost = new NativeDialogHost();
  private pane: string = 'color';
  private dismissGuard: () => boolean = (): boolean => true;
  private readonly createDialog = (dismiss: NativeDialogDismiss): CustomDialogController => {
    const presentation: NativeDialogPresentation = this.host.presentation();
    return new CustomDialogController({
      builder: AppearanceCustomizationDialog({ pane: this.pane,
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
  private open(pane: string): void {
    this.pane = pane; this.dismissGuard = (): boolean => true;
    this.host.open(this.createDialog, (): boolean => this.dismissGuard());
  }
  private wallpaperValue(): string {
    return localizedResourceText(this.getUIContext(), this.language, this.wallpaper === '' ?
      $r('app.string.appearance_choose_wallpaper') : $r('app.string.appearance_wallpaper_configured'));
  }
  private valueWidth(value: string): number {
    const ui = this.getUIContext();
    return Math.ceil(ui.px2vp(ui.getMeasureUtils().measureText({ textContent: value,
      fontSize: SelectStyle.controlFont.size, fontWeight: SelectStyle.controlFont.weight }))) +
      Number(SelectStyle.controlPadding.left) + Number(SelectStyle.controlPadding.right) + SelectStyle.controlSpace + 24;
  }
  @Builder
  private colorValue() {
    SelectionValueButton({ value: this.accent, label: $r('app.string.appearance_custom_color'),
      controlWidth: this.valueWidth(this.accent), disclosureAngle: 0,
      onAction: (): void => { this.open('color'); } })
      .constraintSize(FormRowLayout.trailingConstraint).flexShrink(0)
  }
  @Builder
  private wallpaperEntry() {
    SelectionValueButton({ value: this.wallpaperValue(), label: $r('app.string.appearance_wallpaper'),
      controlWidth: this.valueWidth(this.wallpaperValue()), disclosureAngle: 0,
      onAction: (): void => { this.open('wallpaper'); } })
      .constraintSize(FormRowLayout.trailingConstraint).flexShrink(0)
  }
  build() {
    Column({ space: FormRowLayout.rowGap }) {
      FormSelectRow({ label: $r('app.string.appearance_custom_color'), useCustomControl: true,
        customControl: (): void => { this.colorValue(); } })
      FormSelectRow({ label: $r('app.string.appearance_wallpaper'), useCustomControl: true,
        customControl: (): void => { this.wallpaperEntry(); } })
    }.width('100%')
  }
}
