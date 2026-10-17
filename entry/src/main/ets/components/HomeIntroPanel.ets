// SPDX-License-Identifier: AGPL-3.0-or-later
import { DialogFrame } from './common/DialogFrame';
import { showToastSafely } from '../utils/UiFeedback';
import { DialogHeader } from './common/DialogHeader';
import { 应用尺寸 } from '../utils/应用尺寸';
import { common } from '@kit.AbilityKit';
import { pasteboard } from '@kit.BasicServicesKit';
import { OFFICIAL_QQ_GROUP } from '../model/OfficialCommunity';

/** 五个内容区共用标题、内边距和底色，正文不再自行叠加水平留白。 */
@Component
struct HomeIntroSection {
  @Prop title: Resource = $r('app.string.home_intro_title');
  @BuilderParam content: () => void = this.emptyContent;

  @Builder
  private emptyContent(): void {}

  build() {
    Column({ space: 应用尺寸.间距_12 }) {
      Text(this.title)
        .fontSize(应用尺寸.字号_按钮)
        .fontWeight(FontWeight.Bold)
        .fontColor($r('app.color.text_primary'))
        .textAlign(TextAlign.Start)
        .width('100%')
      this.content()
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
    .padding(应用尺寸.间距_12)
    .backgroundColor($r('app.color.surface_page'))
    .borderRadius(应用尺寸.圆角_面板)
  }
}

/** 分组入门说明；公共弹窗外壳负责固定操作栏、滚动和窗口安全区。 */
@Component
export struct HomeIntroPanel {
  onClose: () => void = (): void => {};
  private readonly groupNumber: string = OFFICIAL_QQ_GROUP;
  private readonly decksUrl: string = 'https://ankiweb.net/shared/decks/';

  /** 获取渠道中的群号复制动作，只写入群号本身。 */
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
    Column({ space: 应用尺寸.间距_12 }) {
      Text() {
        Span($r('app.string.home_intro_source_one_prefix'))
        Span(this.groupNumber)
          .fontColor($r('app.color.home_intro_link')).fontWeight(FontWeight.Medium)
          .onClick((): void => { this.copyGroup(); })
        Span($r('app.string.home_intro_source_one_suffix'))
      }
      .fontSize(应用尺寸.字号_正文)
      .lineHeight(22)
      .fontColor($r('app.color.text_secondary'))
      .textAlign(TextAlign.Start)
      .width('100%')
      Text() {
        Span($r('app.string.home_intro_source_two_prefix'))
        Span(this.decksUrl)
          .fontColor($r('app.color.home_intro_link')).fontWeight(FontWeight.Medium)
          .onClick((): void => { this.openDecksWebsite(); })
        Span($r('app.string.home_intro_source_two_suffix'))
      }
      .fontSize(应用尺寸.字号_正文)
      .lineHeight(22)
      .fontColor($r('app.color.text_secondary'))
      .textAlign(TextAlign.Start)
      .width('100%')
      Text($r('app.string.home_intro_source_three'))
        .fontSize(应用尺寸.字号_正文).lineHeight(22)
        .textAlign(TextAlign.Start)
        .fontColor($r('app.color.text_secondary')).width('100%')
      Text($r('app.string.home_intro_source_four'))
        .fontSize(应用尺寸.字号_正文).lineHeight(22)
        .textAlign(TextAlign.Start)
        .fontColor($r('app.color.text_secondary')).width('100%')
    }
    .width('100%').alignItems(HorizontalAlign.Start)
  }

  @Builder
  private paragraph(body: Resource) {
    Text(body).fontSize(应用尺寸.字号_正文).lineHeight(22)
      .fontColor($r('app.color.text_secondary')).textAlign(TextAlign.Start)
      .copyOption(CopyOptions.LocalDevice).width('100%')
  }

  @Builder
  private section(title: Resource, body: Resource) {
    // BuilderParam 回调只调用已编译的 Builder，不能直接放声明式组件链。
    HomeIntroSection({ title, content: () => { this.paragraph(body); } })
  }

  @Builder
  private headerContent() {
    DialogHeader({ title: $r('app.string.home_intro_title'),
      actionLabel: $r('app.string.study_guide_start'), showClose: false,
      onAction: (): void => { this.onClose(); } })
  }

  @Builder
  private bodyContent() {
    Column({ space: 应用尺寸.间距_12 }) {
      this.section($r('app.string.home_intro_flashcards_title'), $r('app.string.home_intro_flashcards_body'))
      this.section($r('app.string.home_intro_simple_start_title'), $r('app.string.home_intro_simple_start_body'))
      HomeIntroSection({ title: $r('app.string.home_intro_sources_title'),
        content: () => { this.sourcesSection(); } })
      this.section($r('app.string.home_intro_agent_title'), $r('app.string.home_intro_agent_body'))
      this.section($r('app.string.home_intro_apkg_title'), $r('app.string.home_intro_apkg_body'))
    }
    .width('100%')
  }

  build() {
    DialogFrame({ maximumWidth: 520, canDismiss: false,
      header: () => { this.headerContent(); }, content: () => { this.bodyContent(); } })
  }
}
