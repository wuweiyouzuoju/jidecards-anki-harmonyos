// SPDX-License-Identifier: AGPL-3.0-or-later
import { SurfaceBorder } from '../utils/SurfaceBorder';
import { pasteboard } from '@kit.BasicServicesKit';
import { OFFICIAL_QQ_GROUP } from '../model/OfficialCommunity';
import { DialogFrame } from './common/DialogFrame';
import { DialogHeader } from './common/DialogHeader';
import { 颜色键 } from '../model/颜色主题';
import { IridescentThemePreview } from './common/IridescentThemePreview';
import { ThemeHighlightedTextSpans } from './common/ThemeText';
import { themeDefinition } from '../model/ThemeCatalog';
import { 规范化主题模式, 解析是否深色 } from '../model/主题设置';
import { PressFeedback } from '../utils/PressFeedback';
import { showToastSafely } from '../utils/UiFeedback';
import { 应用尺寸 } from '../utils/应用尺寸';

/** 启动提醒和锁定主题共用领赠说明、群号与复制反馈。 */
@Component
export struct IridescentGiftPanel {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop announcement: boolean = false;
  @StorageProp(颜色键.动作主色) private primary: string = '#2F5FD0';
  @StorageProp('themeMode') private themeMode: string = 'system';
  @StorageProp('systemDarkMode') private systemDark: boolean = false;
  onClose: () => void = (): void => {};

  private iridescentTextColors(): string[] {
    const theme = themeDefinition('iridescent');
    return 解析是否深色(规范化主题模式(this.themeMode), this.systemDark) ? theme.darkActionColors : theme.lightActionColors;
  }

  private async copyGroup(): Promise<void> {
    try {
      await pasteboard.getSystemPasteboard().setData(
        pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, OFFICIAL_QQ_GROUP));
      showToastSafely(this.getUIContext(), { message: $r('app.string.about_qq_group_copied') });
    } catch (error) {
      showToastSafely(this.getUIContext(), { message: $r('app.string.redemption_copy_failed') });
    }
  }

  @Builder
  private headerContent() {
    DialogHeader({ title: $r('app.string.iridescent_gift_title'), showClose: false,
      highlightLabel: $r('app.string.iridescent_gift_name'), highlightColors: this.iridescentTextColors(),
      actionLabel: $r('app.string.ankiweb_guide_button_ok'), onAction: (): void => { this.onClose(); } })
  }

  @Builder
  private bodyContent() {
    Column({ space: 应用尺寸.间距_12 }) {
      Text() {
        ForEach([this.uiLanguage], (_locale: string) => { ThemeHighlightedTextSpans(this.announcement ? $r('app.string.iridescent_gift_announcement') :
          $r('app.string.iridescent_gift_offer'), $r('app.string.iridescent_gift_name'),
          this.iridescentTextColors(), this.getUIContext()) }, (_locale: string): string => _locale)
      }
        .fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_primary')).width('100%')
      Button() {
        Text() {
          Span($r('app.string.iridescent_gift_group_prefix'))
          Span(OFFICIAL_QQ_GROUP).fontWeight(FontWeight.Medium)
          Span($r('app.string.iridescent_gift_group_suffix'))
        }.fontSize(应用尺寸.字号_正文).fontColor(this.primary).width('100%')
      }
      .width('100%').constraintSize({ minHeight: 48 }).padding(应用尺寸.间距_12)
      .backgroundColor($r('app.color.surface_page')).borderRadius(应用尺寸.圆角_卡片).border(SurfaceBorder.options())
      .attributeModifier(new PressFeedback()).stateEffect(false)
      .onClick((): void => { this.copyGroup(); })
      Text() {
        ForEach([this.uiLanguage], (_locale: string) => { ThemeHighlightedTextSpans($r('app.string.home_intro_theme_preview'), $r('app.string.iridescent_gift_name'),
          this.iridescentTextColors(), this.getUIContext()) }, (_locale: string): string => _locale)
      }
        .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary')).width('100%')
      IridescentThemePreview()
    }.width('100%')
  }

  build() {
    DialogFrame({ canDismiss: false,
      header: () => { this.headerContent(); }, content: () => { this.bodyContent(); } })
  }
}
