import { rememberPopupTrigger } from '../../utils/PopupTrigger';
import { NativeDialogHost, NativeDialogFactory, NativeDialogDismiss, NativeDialogPresentation } from '../common/NativeDialogHost';
import { RedemptionDialog } from './RedemptionDialog';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { settingsItemText } from '../../utils/SettingsStructureText';
import { SeriesVisual } from '../../utils/SeriesVisual';
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { PressFeedback } from '../../utils/PressFeedback';
import { DisclosureChevron } from '../common/DisclosureChevron';
import { showToastSafely, resourceText, namedResourceText } from '../../utils/UiFeedback';
import { ThemeTextSpans, themeTextKey } from '../common/ThemeText';
import { THEME_TEXT_COLORS_KEY } from '../../model/ThemeCatalog';
import { pasteboard } from '@kit.BasicServicesKit';
import { ThemeId, themeForContent } from '../../model/ThemeCatalog';
import { displayFingerprint, parseRedemption } from '../../model/Redemption';
import { getApplicationFingerprint, redeemContent, RedemptionResult } from '../../utils/RedemptionStore';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 颜色主题, 颜色键 } from '../../model/颜色主题';

/** 两种模式共用的独立兑换分类，直接展示识别码与主题兑换入口。 */
@Component
export struct RedemptionPanel {
  @StorageProp('surface_material') private surfaceMaterial: string = 'flat';
  @StorageProp('themeMode') private materialMode: string = 'system';
  @StorageProp('systemDarkMode') private materialSystemDark: boolean = false;
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  onUseTheme: (theme: 颜色主题) => void = (): void => {};
  @State private fingerprint: string = '';
  @State private expanded: boolean = false;
  aboutToDisappear(): void {
    this.active = false; this.showCelebration = false; this.dialog.dispose();
  }
  @State private code: string = '';
  @State private busy: boolean = false;
  @State private loadFailed: boolean = false;
  @State private message: ResourceStr = '';
  @State private showCelebration: boolean = false;
  @State private unlocked: boolean = false;
  @State private unlockedTheme: ThemeId = 'aurora';
  private readonly dialog: NativeDialogHost = new NativeDialogHost();
  private readonly createDialog: NativeDialogFactory = (dismiss: NativeDialogDismiss): CustomDialogController => {
    const presentation: NativeDialogPresentation = this.dialog.presentation();
    return new CustomDialogController({
      builder: RedemptionDialog({ busy: this.busy, code: this.code, message: this.message,
        unlocked: this.unlocked, unlockedTheme: this.unlockedTheme, showCelebration: this.showCelebration,
        onClose: this.dialog.guard((): void => { this.closeRedemption(); }),
        onSubmit: this.dialog.guard((): void => { this.redeem(); }),
        onUse: this.dialog.guard((): void => { this.useUnlockedTheme(); }) }),
      onWillDismiss: dismiss, autoCancel: presentation.autoCancel, customStyle: presentation.customStyle,
      alignment: presentation.alignment, width: presentation.width, height: presentation.height,
      keyboardAvoidMode: presentation.keyboardAvoidMode, maskColor: presentation.maskColor,
      openAnimation: presentation.openAnimation, closeAnimation: presentation.closeAnimation
    });
  };
  private redemptionArea: Area | undefined = undefined;
  private openRedemption(): void {
    if (!this.active || this.busy || this.fingerprint === '') return;
    this.expanded = true; this.message = ''; this.unlocked = false; this.showCelebration = false; this.code = '';
    try { this.dialog.open(this.createDialog, (): boolean => {
      if (this.busy) return false;
      this.expanded = false; this.code = ''; return true;
    }); } catch (error) {
      this.expanded = false; showToastSafely(this.getUIContext(), { message: $r('app.string.directory_open_error') });
    }
  }
  private active: boolean = false;
  @StorageProp(颜色键.动作主色) private primary: string = '#2F5FD0';

  aboutToAppear(): void { this.active = true; this.dialog.activate(); this.loadFingerprint(); }

  private async loadFingerprint(): Promise<void> {
    this.loadFailed = false;
    try { this.fingerprint = displayFingerprint(await getApplicationFingerprint()); }
    catch (error) { this.loadFailed = true; }
  }

  private async copyFingerprint(): Promise<void> {
    try {
      await pasteboard.getSystemPasteboard().setData(pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, this.fingerprint));
      showToastSafely(this.getUIContext(), { message: $r('app.string.redemption_copied') });
    } catch (error) {
      showToastSafely(this.getUIContext(), { message: $r('app.string.redemption_copy_failed') });
    }
  }

  private resultMessage(resource: Resource, _locale: string = this.uiLanguage): string {
    return resourceText(this.getUIContext(), resource,
      namedResourceText(this.getUIContext(), 'theme_color_' + this.unlockedTheme));
  }

  private closeRedemption(): void {
    if (this.busy) return;
    this.dialog.close(); this.expanded = false;
    this.code = ''; this.showCelebration = false;
  }

  private useUnlockedTheme(): void {
    if (this.busy || !this.unlocked) return;
    this.onUseTheme(this.unlockedTheme);
    this.closeRedemption();
  }

  private async redeem(): Promise<void> {
    if (!this.active || this.busy || this.code.trim() === '') return;
    this.busy = true;
    this.message = '';
    this.unlocked = false;
    this.showCelebration = false;
    try {
      const parsed = parseRedemption(this.code);
      const theme = parsed === null ? undefined : themeForContent(parsed.contentId);
      const result: RedemptionResult = await redeemContent(this.code);
      if (!this.active) return;
      if (theme !== undefined) this.unlockedTheme = theme.id;
      this.unlocked = result === 'success' || result === 'already';
      if (result === 'success') {
        this.message = this.resultMessage($r('app.string.redemption_success'));
        this.showCelebration = theme?.id === 'iridescent' && this.expanded;
      } else if (result === 'already') this.message = this.resultMessage($r('app.string.redemption_already'));
      else if (result === 'wrong_installation') this.message = $r('app.string.redemption_wrong_installation');
      else if (result === 'unsupported') this.message = $r('app.string.redemption_unsupported');
      else this.message = $r('app.string.redemption_invalid');
      if (this.unlocked) this.code = '';
    } catch (error) { if (this.active) this.message = $r('app.string.redemption_storage_failed'); }
    finally { if (this.active) this.busy = false; }
  }

  /** 固定四组一行，窄屏也不会留下孤立的尾码。 */
  private fingerprintLine(start: number): string {
    return this.fingerprint.split('-').slice(start, start + 4).join('  ');
  }

  @Builder
  private redemptionDetails() {
    Column({ space: 12 }) {
      Row() {

        Text(settingsItemText(this.getUIContext(), 'installation_fingerprint', this.uiLanguage))
          .fontSize(15).fontColor($r('app.color.text_primary')).textAlign(TextAlign.Start).layoutWeight(1)
        Button() {
          Text() { ForEach([themeTextKey(settingsItemText(this.getUIContext(), 'fingerprint_copy', this.uiLanguage), this.themeAccentColors, this.getUIContext(), this.uiLanguage)], (_textKey: string) => { ThemeTextSpans(settingsItemText(this.getUIContext(), 'fingerprint_copy', this.uiLanguage), this.themeAccentColors, this.getUIContext()) }, (_textKey: string): string => _textKey) }.fontColor(this.primary)
        }
          .fontColor(this.primary).backgroundColor(Color.Transparent)
          .enabled(this.fingerprint !== '').attributeModifier(new PressFeedback(1, 0.4, true))
          .stateEffect(false)
          .onClick((): void => { this.copyFingerprint(); })
      }.width('100%')
      Column({ space: 6 }) {
        Text(this.fingerprintLine(1))
          .fontSize(14).fontFamily('monospace').fontColor($r('app.color.text_secondary')).width('100%')
        Text(this.fingerprintLine(5))
          .fontSize(14).fontFamily('monospace').fontColor($r('app.color.text_secondary')).width('100%')
      }.width('100%').padding(12).border(SurfaceBorder.options()).borderRadius(12)
        .attributeModifier(SeriesVisual.insetSurface(this.surfaceMaterial, SeriesVisual.isDark(this.materialMode, this.materialSystemDark), this.primary, '', 12))
      Text($r('app.string.redemption_fingerprint_hint'))
        .fontSize(12).fontColor($r('app.color.text_secondary')).width('100%')
      if (this.loadFailed) {
        Button($r('app.string.redemption_retry'))
          .attributeModifier(new PressFeedback(1, 0.4, true))
          .stateEffect(false)
          .onClick((): void => { this.loadFingerprint(); })
      }
      Divider().color(SurfaceBorder.color()).margin({ top: 4 })
      Button() {
        Row() {

          Text() { ForEach([themeTextKey(settingsItemText(this.getUIContext(), 'redemption', this.uiLanguage), this.themeAccentColors, this.getUIContext(), this.uiLanguage)], (_textKey: string) => { ThemeTextSpans(settingsItemText(this.getUIContext(), 'redemption', this.uiLanguage), this.themeAccentColors, this.getUIContext()) }, (_textKey: string): string => _textKey) }.fontSize(15).fontColor(this.primary).textAlign(TextAlign.Start).layoutWeight(1)
          DisclosureChevron({ tint: $r('app.color.text_tertiary') })
        }.width('100%')
      }
        .width('100%').height(44).backgroundColor(Color.Transparent).borderRadius(12)
        .enabled(this.fingerprint !== '')
        .attributeModifier(new PressFeedback(1, 0.4, true))
        .stateEffect(false)
        .onAreaChange((_old: Area, area: Area): void => { this.redemptionArea = area; })
        .onClick((): void => {
          if (this.redemptionArea !== undefined) rememberPopupTrigger(this.redemptionArea);
          this.openRedemption();
        })

    }
    .padding(16).width('100%').border(SurfaceBorder.options()).borderRadius(20)
    .attributeModifier(SeriesVisual.settingsSurface(this.surfaceMaterial, SeriesVisual.isDark(this.materialMode, this.materialSystemDark), this.primary, '', 20))
  }
  build() {
    this.redemptionDetails()
  }
}
