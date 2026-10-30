// SPDX-License-Identifier: AGPL-3.0-or-later
import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';
import { IridescentUnlockCelebration } from './IridescentUnlockCelebration';
import { LabeledActionRow } from '../common/LabeledActionRow';
import { SeriesVisual } from '../../utils/SeriesVisual';
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { settingsItemText } from '../../utils/SettingsStructureText';
import { 颜色键 } from '../../model/颜色主题';
import { ThemeId } from '../../model/ThemeCatalog';

/** 原生窗口直接链接草稿与结果，不能把成功状态锁在打开时的 Builder 闭包中。 */
@CustomDialog
export struct RedemptionDialog {
  controller?: CustomDialogController;
  @Link busy: boolean;
  @Link code: string;
  @Link message: ResourceStr;
  @Link unlocked: boolean;
  @Link unlockedTheme: ThemeId;
  @Link showCelebration: boolean;
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @StorageProp('surface_material') private surfaceMaterial: string = 'flat';
  @StorageProp('themeMode') private materialMode: string = 'system';
  @StorageProp('systemDarkMode') private materialSystemDark: boolean = false;
  @StorageProp(颜色键.动作主色) private primary: string = '#2F5FD0';
  onClose: () => void = (): void => {};
  onSubmit: () => void = (): void => {};
  onUse: () => void = (): void => {};

  @Builder
  private redemptionHeader() {
      DialogHeader({
        title: this.showCelebration ? $r('app.string.redemption_gift_received') :
          settingsItemText(this.getUIContext(), 'redemption', this.uiLanguage), showAction: !this.unlocked, showActionLabel: true, actionLabel: $r('app.string.redemption_submit'),
        actionEnabled: !this.busy && this.code.trim() !== '', closeEnabled: !this.busy,
        onClose: (): void => { this.onClose(); },
        onAction: (): void => { this.onSubmit(); }
      })
  }

  @Builder
  private redemptionForm() {
    Column({ space: 16 }) {
      if (this.showCelebration) {
        IridescentUnlockCelebration({ onUse: (): void => { this.onUse(); } })
      } else if (!this.unlocked) {
      Text($r('app.string.redemption_form_hint'))
        .fontSize(13).fontColor($r('app.color.text_secondary')).width('100%')
      TextArea({ text: this.code, placeholder: $r('app.string.redemption_placeholder') })
        .border(SurfaceBorder.options())
        .height(108).maxLength(1024).enabled(!this.busy).fontSize(14)
        .fontColor($r('app.color.text_primary')).placeholderColor($r('app.color.text_tertiary'))
        .borderRadius(14).padding(14)
        .attributeModifier(SeriesVisual.insetSurface(this.surfaceMaterial, SeriesVisual.isDark(this.materialMode, this.materialSystemDark), this.primary, '', 14))
        .onChange((value: string): void => { this.code = value; this.message = ''; this.unlocked = false; })
      }
      if (this.message !== '' && !this.unlocked) {
        Text(this.message).fontSize(13).fontColor($r('app.color.text_secondary')).width('100%')
      }
      if (this.unlocked && !this.showCelebration) {
        LabeledActionRow({ label: this.message, actionLabel: $r('app.string.redemption_use_theme'), tint: this.primary,
          textColor: $r('app.color.text_secondary'), isInteractive: !this.busy,
          onAction: (): void => { this.onUse(); } })
      }
    }.width('100%')
  }

  build() {
    DialogFrame({ nativeHost: true, canDismiss: !this.busy, onDismiss: this.onClose,
      header: (): void => { this.redemptionHeader(); }, content: (): void => { this.redemptionForm(); } })
  }
}
