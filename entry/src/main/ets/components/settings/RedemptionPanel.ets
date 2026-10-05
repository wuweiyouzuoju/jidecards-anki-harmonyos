// SPDX-License-Identifier: AGPL-3.0-or-later
import { settingsItemText } from '../../utils/SettingsStructureText';
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { PressFeedback } from '../../utils/PressFeedback';
import { LabeledActionRow } from '../common/LabeledActionRow';
import { HelpLabel } from '../common/HelpLabel';
import { 字段帮助对话框 } from '../字段帮助面板';
import { DisclosureChevron } from '../common/DisclosureChevron';
import { showToastSafely, resourceText, namedResourceText } from '../../utils/UiFeedback';
import { ThemeTextSpans } from '../common/ThemeText';
import { THEME_TEXT_COLORS_KEY } from '../../model/ThemeCatalog';
import { pasteboard } from '@kit.BasicServicesKit';
import { ThemeId, themeForContent } from '../../model/ThemeCatalog';
import { displayFingerprint, parseRedemption } from '../../model/Redemption';
import { getApplicationFingerprint, redeemContent, RedemptionResult } from '../../utils/RedemptionStore';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { DialogHeader } from '../common/DialogHeader';
import { 颜色主题, 颜色键 } from '../../model/颜色主题';

/** 两种模式共用的独立兑换分类，直接展示识别码与主题兑换入口。 */
@Component
export struct RedemptionPanel {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  @Prop developerGroup: string = '';
  onUseTheme: (theme: 颜色主题) => void = (): void => {};
  @State private fingerprint: string = '';
  @State private expanded: boolean = false;
  private contentHelp: CustomDialogController = new CustomDialogController({
    builder: 字段帮助对话框({ 标题: $r('app.string.redemption_contents_title'),
      内容: (): void => { this.contentInfo(); } }),
    customStyle: true, autoCancel: true, alignment: DialogAlignment.Center,
    width: '100%', height: '100%', maskColor: Color.Transparent
  });

  aboutToDisappear(): void { this.contentHelp.close(); }
  @State private code: string = '';
  @State private busy: boolean = false;
  @State private loadFailed: boolean = false;
  @State private message: ResourceStr = '';
  @State private unlocked: boolean = false;
  @State private unlockedTheme: ThemeId = 'aurora';
  @StorageProp(颜色键.动作主色) private primary: string = '#2F5FD0';

  aboutToAppear(): void { this.loadFingerprint(); }

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

  /** 沿用关于页的联系群号，点击整行即可复制。 */
  private async copyDeveloperGroup(): Promise<void> {
    try {
      await pasteboard.getSystemPasteboard().setData(pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, this.developerGroup));
      showToastSafely(this.getUIContext(), { message: $r('app.string.about_qq_group_copied') });
    } catch (error) {
      showToastSafely(this.getUIContext(), { message: $r('app.string.redemption_copy_failed') });
    }
  }

  @Builder
  private contentInfo() {
    Column({ space: 18 }) {
      Text($r('app.string.redemption_contents_iridescent'))
        .fontSize(16).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_primary')).width('100%')
      Text($r('app.string.redemption_contents_eligibility'))
        .fontSize(14).fontColor($r('app.color.text_secondary')).width('100%')
      Divider().color(SurfaceBorder.color())
      Text($r('app.string.redemption_contact_developer'))
        .fontSize(13).fontColor($r('app.color.text_secondary')).width('100%')
      Button() {
        Row({ space: 8 }) {
          Text($r('app.string.about_qq_group_title')).fontSize(14).fontColor($r('app.color.text_secondary'))
          Text() { ForEach([this.uiLanguage], (_locale: string) => { ThemeTextSpans(this.developerGroup, this.themeAccentColors, this.getUIContext()) }, (_locale: string): string => _locale) }.fontSize(16).fontWeight(FontWeight.Medium).fontColor(this.primary).textAlign(TextAlign.Start).layoutWeight(1)
          Text() { ForEach([this.uiLanguage], (_locale: string) => { ThemeTextSpans(settingsItemText(this.getUIContext(), 'fingerprint_copy', this.uiLanguage), this.themeAccentColors, this.getUIContext()) }, (_locale: string): string => _locale) }.fontSize(14).fontColor(this.primary)
        }.width('100%')
      }
      .width('100%').height(48).padding({ left: 14, right: 14 }).borderRadius(12).border(SurfaceBorder.options())
      .backgroundColor($r('app.color.surface_page')).attributeModifier(new PressFeedback())
      .stateEffect(false)
      .onClick((): void => { this.copyDeveloperGroup(); })
    }.width('100%')
  }

  private resultMessage(resource: Resource, _locale: string = this.uiLanguage): string {
    return resourceText(this.getUIContext(), resource,
      namedResourceText(this.getUIContext(), 'theme_color_' + this.unlockedTheme));
  }

  private closeRedemption(): void {
    if (this.busy) return;
    this.expanded = false;
    this.code = '';
  }

  private dismissRedemption(action: DismissSheetAction): void {
    if (this.busy) return;
    this.closeRedemption();
    action.dismiss();
  }

  private async redeem(): Promise<void> {
    if (this.busy || this.code.trim() === '') return;
    this.busy = true;
    this.message = '';
    this.unlocked = false;
    try {
      const parsed = parseRedemption(this.code);
      const theme = parsed === null ? undefined : themeForContent(parsed.contentId);
      const result: RedemptionResult = await redeemContent(this.code);
      if (theme !== undefined) this.unlockedTheme = theme.id;
      this.unlocked = result === 'success' || result === 'already';
      if (result === 'success') this.message = this.resultMessage($r('app.string.redemption_success'));
      else if (result === 'already') this.message = this.resultMessage($r('app.string.redemption_already'));
      else if (result === 'wrong_installation') this.message = $r('app.string.redemption_wrong_installation');
      else if (result === 'unsupported') this.message = $r('app.string.redemption_unsupported');
      else this.message = $r('app.string.redemption_invalid');
      if (this.unlocked) this.code = '';
    } catch (error) { this.message = $r('app.string.redemption_storage_failed'); }
    finally { this.busy = false; }
  }

  /** 固定四组一行，窄屏也不会留下孤立的尾码。 */
  private fingerprintLine(start: number): string {
    return this.fingerprint.split('-').slice(start, start + 4).join('  ');
  }

  @Builder
  private redemptionForm() {
    Column({ space: 16 }) {
      DialogHeader({
        title: settingsItemText(this.getUIContext(), 'redemption', this.uiLanguage), actionLabel: $r('app.string.redemption_submit'),
        actionEnabled: !this.busy && this.code.trim() !== '', closeEnabled: !this.busy,
        onClose: (): void => { this.closeRedemption(); },
        onAction: (): void => { this.redeem(); }
      })
      Text($r('app.string.redemption_form_hint'))
        .fontSize(13).fontColor($r('app.color.text_secondary')).width('100%')
      TextArea({ text: this.code, placeholder: $r('app.string.redemption_placeholder') })
        .border(SurfaceBorder.options())
        .height(108).maxLength(1024).enabled(!this.busy).fontSize(14)
        .fontColor($r('app.color.text_primary')).placeholderColor($r('app.color.text_tertiary'))
        .backgroundColor($r('app.color.surface_page')).borderRadius(14).padding(14)
        .onChange((value: string): void => { this.code = value; this.message = ''; this.unlocked = false; })
      if (this.message !== '' && !this.unlocked) {
        Text(this.message).fontSize(13).fontColor($r('app.color.text_secondary')).width('100%')
      }
      if (this.unlocked) {
        LabeledActionRow({ label: this.message, actionLabel: $r('app.string.redemption_use_theme'), tint: this.primary,
          textColor: $r('app.color.text_secondary'), isInteractive: !this.busy,
          onAction: (): void => { this.onUseTheme(this.unlockedTheme); this.expanded = false; } })
      }
    }.padding({ left: 20, right: 20, top: 8, bottom: 28 }).width('100%')
  }

  @Builder
  private redemptionDetails() {
    Column({ space: 12 }) {
      Row() {

        Text(settingsItemText(this.getUIContext(), 'installation_fingerprint', this.uiLanguage))
          .fontSize(15).fontColor($r('app.color.text_primary')).textAlign(TextAlign.Start).layoutWeight(1)
        Button() {
          Text() { ForEach([this.uiLanguage], (_locale: string) => { ThemeTextSpans(settingsItemText(this.getUIContext(), 'fingerprint_copy', this.uiLanguage), this.themeAccentColors, this.getUIContext()) }, (_locale: string): string => _locale) }.fontColor(this.primary)
        }
          .fontColor(this.primary).backgroundColor(Color.Transparent)
          .enabled(this.fingerprint !== '').attributeModifier(new PressFeedback())
          .stateEffect(false)
          .onClick((): void => { this.copyFingerprint(); })
      }.width('100%')
      Column({ space: 6 }) {
        Text(this.fingerprintLine(1))
          .fontSize(14).fontFamily('monospace').fontColor($r('app.color.text_secondary')).width('100%')
        Text(this.fingerprintLine(5))
          .fontSize(14).fontFamily('monospace').fontColor($r('app.color.text_secondary')).width('100%')
      }.width('100%').padding(12).borderRadius(12).border(SurfaceBorder.options()).backgroundColor($r('app.color.surface_page'))
      HelpLabel({ title: $r('app.string.redemption_fingerprint_hint'), textSize: 12,
        textColor: $r('app.color.text_secondary'),
        onHelp: (): void => { this.contentHelp.open(); }
      }).width('100%')
      if (this.loadFailed) {
        Button($r('app.string.redemption_retry'))
          .attributeModifier(new PressFeedback())
          .stateEffect(false)
          .onClick((): void => { this.loadFingerprint(); })
      }
      Divider().color(SurfaceBorder.color()).margin({ top: 4 })
      Button() {
        Row() {

          Text() { ForEach([this.uiLanguage], (_locale: string) => { ThemeTextSpans(settingsItemText(this.getUIContext(), 'redemption', this.uiLanguage), this.themeAccentColors, this.getUIContext()) }, (_locale: string): string => _locale) }.fontSize(15).fontColor(this.primary).textAlign(TextAlign.Start).layoutWeight(1)
          DisclosureChevron({ tint: $r('app.color.text_tertiary') })
        }.width('100%')
      }
        .width('100%').height(44).backgroundColor(Color.Transparent).borderRadius(12)
        .enabled(this.fingerprint !== '')
        .attributeModifier(new PressFeedback())
        .stateEffect(false)
        .onClick((): void => { this.expanded = true; this.message = ''; this.unlocked = false; this.code = ''; })
        .bindSheet($$this.expanded, this.redemptionForm(), {
          height: SheetSize.FIT_CONTENT, preferType: SheetType.CENTER, width: 应用尺寸.dialogMaxWidth,
          showClose: false, dragBar: false,
          onWillDismiss: (action: DismissSheetAction): void => { this.dismissRedemption(action); },
          onWillSpringBackWhenDismiss: (action: SpringBackAction): void => { if (this.busy) action.springBack(); },
          backgroundColor: $r('app.color.surface_card')
        })

    }
    .padding(16).width('100%').borderRadius(20).border(SurfaceBorder.options()).backgroundColor($r('app.color.surface_card'))
  }
  build() {
    this.redemptionDetails()
  }
}
