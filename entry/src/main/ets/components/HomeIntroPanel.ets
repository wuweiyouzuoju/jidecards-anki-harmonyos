import { insetMaterialFill } from '../utils/GlassMaterial';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { DialogFrame } from './common/DialogFrame';
import { appInterface } from '../backend/AppInterfaceService';
import { HomeIntroPage, HomeIntroBlock, HomeIntroAction, HOME_INTRO_PAGES, HOME_INTRO_ACTIONS, homeIntroPageIndex, homeIntroActionVisible } from '../model/HomeIntro';
import { AppInterfaceControl } from '../model/AppInterface';
import { 颜色键 } from '../model/颜色主题';
import { 按下态按钮 } from './common/按下态按钮';
import { namedResourceText, resourceText } from '../utils/UiFeedback';
import { showToastSafely } from '../utils/UiFeedback';
import { DialogHeader } from './common/DialogHeader';
import { 应用尺寸 } from '../utils/应用尺寸';
import { common } from '@kit.AbilityKit';
import { pasteboard } from '@kit.BasicServicesKit';
import { OFFICIAL_QQ_GROUP } from '../model/OfficialCommunity';

/** 每页的信息块共用标题、内边距和底色，正文不叠加水平留白。 */
@Component
struct HomeIntroSection {
  @Prop title: ResourceStr = $r('app.string.home_intro_title');
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
    .backgroundColor(insetMaterialFill($r('app.color.surface_page')))
    .borderRadius(应用尺寸.圆角_面板)
  }
}

/** 分页入门；弹窗外壳拥有安全区和固定页脚，页面正文独立滚动。 */
@Component
export struct HomeIntroPanel {
  onClose: () => void = (): void => {};
  onDismiss: () => void = (): void => {};
  @StorageProp('系统语言') @Watch('publishInterface') private uiLanguage: string = 'zh-Hans';
  @StorageProp(颜色键.动作主色) private primaryColor: string = '#2F5FD0';
  @State @Watch('onPageChanged') private pageIndex: number = 0;
  private readonly bodyScroller: Scroller = new Scroller();
  private isActive: boolean = false;

  aboutToAppear(): void { this.isActive = true; this.publishInterface(); }
  aboutToDisappear(): void { this.isActive = false; appInterface.leave('intro'); }

  private currentPage(): HomeIntroPage { return HOME_INTRO_PAGES[homeIntroPageIndex(this.pageIndex)]; }

  private text(key: string, _locale: string = this.uiLanguage): string {
    return namedResourceText(this.getUIContext(), key);
  }

  private onPageChanged(): void {
    if (!this.isActive) return;
    this.bodyScroller.scrollTo({ xOffset: 0, yOffset: 0, animation: false });
    this.publishInterface();
  }

  private selectAction(id: string): void {
    if (!this.isActive || !homeIntroActionVisible(id, this.pageIndex)) return;
    if (id === 'previous') this.pageIndex = homeIntroPageIndex(this.pageIndex - 1);
    else if (id === 'next') this.pageIndex = homeIntroPageIndex(this.pageIndex + 1);
    else if (id === 'finish') this.onClose();
    else if (id === 'later') this.onDismiss();
    else if (id === 'copy_group') this.copyGroup();
    else if (id === 'open_decks') this.openDecksWebsite();
  }

  private publishInterface(): void {
    if (!this.isActive) return;
    const page: HomeIntroPage = this.currentPage();
    const actions: HomeIntroAction[] = HOME_INTRO_ACTIONS.filter((action: HomeIntroAction): boolean =>
      homeIntroActionVisible(action.id, this.pageIndex));
    const controls: AppInterfaceControl[] = actions.map((action: HomeIntroAction): AppInterfaceControl =>
      ({ id: action.id, titleKey: action.titleKey, title: this.text(action.titleKey), enabled: true, selected: false }));
    appInterface.observe({ surface: 'intro', sectionId: page.id, selectedId: page.id, busy: false,
      items: controls, controlsComplete: true, optionIds: [], optionLabels: [],
      values: [{ id: 'page', value: String(this.pageIndex + 1) },
        { id: 'page_count', value: String(HOME_INTRO_PAGES.length) },
        { id: 'page_title', value: this.text(page.titleKey) }] });
  }

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
          .onClick((): void => { this.selectAction('copy_group'); })
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
          .onClick((): void => { this.selectAction('open_decks'); })
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
      this.paragraph($r('app.string.ankiweb_guide_notice'))
    }
    .width('100%').alignItems(HorizontalAlign.Start)
  }

  @Builder
  private paragraph(body: ResourceStr) {
    Text(body).fontSize(应用尺寸.字号_正文).lineHeight(22)
      .fontColor($r('app.color.text_secondary')).textAlign(TextAlign.Start)
      .copyOption(CopyOptions.LocalDevice).width('100%')
  }

  @Builder
  private section(title: ResourceStr, body: ResourceStr) {
    // BuilderParam 回调只调用已编译的 Builder，不能直接放声明式组件链。
    HomeIntroSection({ title, content: () => { this.paragraph(body); } })
  }

  @Builder
  private headerContent() {
    DialogHeader({ title: $r('app.string.home_intro_title'), showAction: false, showClose: true,
      closeLabel: $r('app.string.home_intro_later'),
      onClose: (): void => { this.selectAction('later'); } })
  }

  @Builder
  private bodyContent() {
    Scroll(this.bodyScroller) {
      Column({ space: 应用尺寸.间距_16 }) {
        ForEach(this.currentPage().blocks, (block: HomeIntroBlock) => {
          this.section(this.text(block.titleKey), this.text(block.bodyKey))
        }, (block: HomeIntroBlock): string => block.bodyKey)
        if (this.currentPage().id === 'sources') {
          HomeIntroSection({ title: $r('app.string.home_intro_sources_title'),
            content: () => { this.sourcesSection(); } })
        }
      }.width('100%').alignItems(HorizontalAlign.Start)
    }.width('100%').height('100%').align(Alignment.TopStart).scrollBar(BarState.Auto)
  }

  @Builder
  private footerContent() {
    Column({ space: 应用尺寸.间距_12 }) {
      Row({ space: 4 }) {
        ForEach(HOME_INTRO_PAGES, (page: HomeIntroPage, index: number) => {
          Column().height(4).layoutWeight(1).borderRadius(2)
            .backgroundColor(index <= this.pageIndex ? this.primaryColor : $r('app.color.surface_page'))
        }, (page: HomeIntroPage): string => page.id)
      }.width('100%').accessibilityLevel('no')
      Text(resourceText(this.getUIContext(), $r('app.string.home_intro_progress'), this.pageIndex + 1, HOME_INTRO_PAGES.length))
        .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary'))
      Row({ space: 应用尺寸.间距_12 }) {
        if (homeIntroActionVisible('previous', this.pageIndex)) {
          按下态按钮({ 文案: $r('app.string.home_intro_previous'), fillWidth: true,
            点击回调: (): void => { this.selectAction('previous'); } }).layoutWeight(1)
        } else {
          按下态按钮({ 文案: $r('app.string.home_intro_later'), fillWidth: true,
            点击回调: (): void => { this.selectAction('later'); } }).layoutWeight(1)
        }
        按下态按钮({ 文案: this.pageIndex === HOME_INTRO_PAGES.length - 1
          ? $r('app.string.welcome_section1_title') : $r('app.string.home_intro_next'),
          fillWidth: true, themeText: true, 字色: this.primaryColor,
          点击回调: (): void => { this.selectAction(this.pageIndex === HOME_INTRO_PAGES.length - 1 ? 'finish' : 'next'); } })
          .layoutWeight(1)
      }.width('100%')
    }.width('100%')
  }

  build() {
    DialogFrame({ opaque: true, maximumWidth: 560, canDismiss: false, fillBody: true, showFooter: true,
      header: () => { this.headerContent(); }, content: () => { this.bodyContent(); },
      footer: () => { this.footerContent(); } })
  }
}
