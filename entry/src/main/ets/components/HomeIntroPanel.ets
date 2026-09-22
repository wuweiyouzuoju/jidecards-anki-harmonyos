// SPDX-License-Identifier: AGPL-3.0-or-later
import { showToastSafely } from '../utils/UiFeedback';
import { DialogHeader } from './common/DialogHeader';
import { 应用尺寸 } from '../utils/应用尺寸';
import { common } from '@kit.AbilityKit';
import { pasteboard } from '@kit.BasicServicesKit';

/** 简短入门说明，随内容收缩，小屏可滚动，确认按钮始终可见。 */
@Component
export struct HomeIntroPanel {
  onClose: () => void = (): void => {};
  @State private contentHeight: number = 400;
  private readonly groupNumber: string = '726837065';
  private readonly decksUrl: string = 'https://ankiweb.net/shared/decks/';

  /** 两处群号共用复制动作，只写入群号本身。 */
  private async copyGroup(): Promise<void> {
    try {
      await pasteboard.getSystemPasteboard().setData(
        pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, this.groupNumber));
      showToastSafely(this.getUIContext(), {
        message: $r('app.string.about_qq_group_copied') });
    } catch {
      showToastSafely(this.getUIContext(), {
        message: $r('app.string.redemption_copy_failed') });
    }
  }

  /** 牌组网站由系统浏览器打开，失败在当前弹窗内提示。 */
  private async openDecksWebsite(): Promise<void> {
    try {
      const context: common.UIAbilityContext = this.getUIContext().getHostContext() as common.UIAbilityContext;
      await context.startAbility({ action: 'ohos.want.action.viewData', uri: this.decksUrl });
    } catch {
      showToastSafely(this.getUIContext(), {
        message: $r('app.string.home_intro_website_failed') });
    }
  }

  @Builder
  private sourcesSection() {
    Column({ space: 6 }) {
      Text($r('app.string.home_intro_sources_title'))
        .fontSize(应用尺寸.字号_按钮).fontWeight(FontWeight.Medium)
        .fontColor($r('app.color.text_primary')).width('100%')
      Text() {
        Span($r('app.string.home_intro_source_one_prefix'))
        Span(this.groupNumber)
          .fontColor($r('app.color.home_intro_link')).fontWeight(FontWeight.Medium)
          .onClick((): void => { this.copyGroup(); })
        Span($r('app.string.home_intro_source_one_suffix'))
        Span($r('app.string.home_intro_source_two_prefix'))
        Span(this.decksUrl)
          .fontColor($r('app.color.home_intro_link')).fontWeight(FontWeight.Medium)
          .onClick((): void => { this.openDecksWebsite(); })
        Span($r('app.string.home_intro_source_two_suffix'))
      }
      .fontSize(应用尺寸.字号_正文_中)
      .fontColor($r('app.color.text_secondary'))
      .width('100%')
      Text($r('app.string.home_intro_source_three'))
        .fontSize(应用尺寸.字号_正文_中)
        .fontColor($r('app.color.text_secondary')).width('100%')
      Text($r('app.string.home_intro_source_four'))
        .fontSize(应用尺寸.字号_正文_中)
        .fontColor($r('app.color.text_secondary')).width('100%')
    }
    .width('100%').alignItems(HorizontalAlign.Start)
  }

  @Builder
  private themeSection() {
    Column({ space: 10 }) {
      Text($r('app.string.home_intro_theme_title'))
        .fontSize(应用尺寸.字号_按钮).fontWeight(FontWeight.Medium)
        .fontColor($r('app.color.text_primary')).width('100%')
      Text() {
        Span($r('app.string.home_intro_theme_body'))
        Span($r('app.string.home_intro_theme_group_prefix'))
        Span(this.groupNumber)
          .fontColor($r('app.color.home_intro_link')).fontWeight(FontWeight.Medium)
          .onClick((): void => { this.copyGroup(); })
        Span($r('app.string.home_intro_theme_group_suffix'))
      }
      .fontSize(应用尺寸.字号_正文_中)
      .fontColor($r('app.color.text_secondary'))
      .width('100%')
      Text($r('app.string.home_intro_theme_preview'))
        .fontSize(应用尺寸.字号_正文_小)
        .fontColor($r('app.color.text_secondary')).width('100%')
      Image($r('app.media.iridescent_preview'))
        .width('100%')
        .constraintSize({ maxWidth: 260 })
        .aspectRatio(1320 / 2856)
        .objectFit(ImageFit.Contain)
        .borderRadius(应用尺寸.圆角_卡片)
        .accessibilityText(
          $r('app.string.home_intro_theme_preview'))
    }
    .width('100%').alignItems(HorizontalAlign.Center)
  }

  @Builder
  private section(title: Resource, body: Resource) {
    Column({ space: 6 }) {
      Text(title)
        .fontSize(应用尺寸.字号_按钮)
        .fontWeight(FontWeight.Medium)
        .fontColor($r('app.color.text_primary'))
        .width('100%')
      Text(body)
        .fontSize(应用尺寸.字号_正文_中)
        .fontColor($r('app.color.text_secondary'))
        .copyOption(CopyOptions.LocalDevice)
        .width('100%')
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
  }

  build() {
    Stack() {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor('rgba(0,0,0,0.35)')
        .onClick((): void => {})
      Column() {
        DialogHeader({
          title: $r('app.string.home_intro_title'),
          actionLabel: $r('app.string.study_guide_start'),
          showClose: false,
          onAction: (): void => { this.onClose(); }
        })
        .padding({ left: 20, right: 20, top: 12 })
        Scroll() {
          Column({ space: 20 }) {
            this.section($r('app.string.home_intro_flashcards_title'), $r('app.string.home_intro_flashcards_body'))
            this.sourcesSection()
            this.section($r('app.string.home_intro_agent_title'), $r('app.string.home_intro_agent_body'))
            this.section($r('app.string.home_intro_apkg_title'), $r('app.string.home_intro_apkg_body'))
            this.themeSection()
          }
          .width('100%')
          .padding(20)
        }
        .width('100%')
        .constraintSize({ maxHeight: this.contentHeight })
        .scrollBar(BarState.Auto)
        .edgeEffect(EdgeEffect.Spring)
      }
      .width('90%')
      .constraintSize({ maxWidth: 520 })
      .backgroundColor($r('app.color.surface_card'))
      .borderRadius(应用尺寸.圆角_卡片)
    }
    .width('100%')
    .height('100%')
    .alignContent(Alignment.Center)
    .onAreaChange((_old: Area, area: Area): void => {
      const height: number = Number(area.height);
      if (height > 0) this.contentHeight = Math.max(100, height * 0.86 - 76);
    })
  }
}
