// SPDX-License-Identifier: AGPL-3.0-or-later
import { IconActionButton } from '../common/IconActionButton';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { homeHeaderGeometry, HomeHeaderGeometry, HomeActionAnchor } from '../../model/HomeHeaderLayout';
import { 主页摘要分页 } from './主页摘要分页';
import { 主页快照, 空主页快照 } from '../../model/主页模型';
import { 桌面卡片数据 } from '../../model/桌面卡片数据存储';
import { PAGE_COMPACT_LAYOUT_KEY } from '../../model/AppLayoutState';
import { homeSyncIndicator, homeSyncLabelKey } from '../../model/HomeSyncStatusController';

/** 只拥有首行几何和按钮锚点；菜单状态与业务操作归首页。 */
@Component
export struct HomeSummaryHeader {
  @StorageProp(PAGE_COMPACT_LAYOUT_KEY) @Watch('layoutChanged') private narrowDeckLayout: boolean = false;
  @Prop @Watch('layoutChanged') showSummary: boolean = true;
  @Prop actionsVisible: boolean = true;
  @Prop agentEnabled: boolean = false;
  @Prop actionColor: string = '#2F5FD0';
  @Prop syncIndicator: string = 'hidden';
  @Prop syncStatusText: string = '';
  @Prop syncAccountState: string = 'normal';
  @Prop homeSnapshot: 主页快照 = 空主页快照;
  @Prop graphsSnapshot: 桌面卡片数据 | null = null;
  onMore: () => void = (): void => {};
  onCreate: () => void = (): void => {};
  onAgent: () => void = (): void => {};
  onSearch: () => void = (): void => {};
  onSync: () => void = (): void => {};
  onBrowser: () => void = (): void => {};
  onMenusClose: () => void = (): void => {};
  onMenuAnchor: (anchor: HomeActionAnchor) => void = (): void => {};
  @State private contentWidth: number = 0;
  private menuAnchor: HomeActionAnchor = { left: 0, top: 0, width: 0 };

  private geometry(): HomeHeaderGeometry {
    return homeHeaderGeometry(this.contentWidth, 应用尺寸.页面分组间距(this.narrowDeckLayout), this.showSummary, 应用尺寸.按钮高度);
  }
  private closeMenus(): void { this.onMenusClose(); }
  private layoutChanged(): void {
    this.closeMenus();
  }
  aboutToDisappear(): void { this.closeMenus(); }

  private updateAnchor(area: Area): void {
    const next: number = Number(area.width);
    const anchor: HomeActionAnchor = { left: Number(area.globalPosition.x), width: next,
      top: Number(area.globalPosition.y) + homeHeaderGeometry(next, 应用尺寸.页面分组间距(this.narrowDeckLayout),
        this.showSummary, 应用尺寸.按钮高度).controlHeight + 应用尺寸.页面内容顶部间距(this.narrowDeckLayout) };
    if (Math.abs(anchor.left - this.menuAnchor.left) > 0.1 || Math.abs(anchor.top - this.menuAnchor.top) > 0.1 ||
      Math.abs(anchor.width - this.menuAnchor.width) > 0.1) {
      this.closeMenus(); this.contentWidth = next; this.menuAnchor = anchor; this.onMenuAnchor(anchor);
    }
  }

  @Builder
  private summaryCard() {
    主页摘要分页({ 主页快照数据: this.homeSnapshot, 图表快照: this.graphsSnapshot,
      cardHeight: this.geometry().summaryHeight, compactCard: this.geometry().compactCard })
      .width(this.geometry().summaryWidth).height(this.geometry().summaryHeight).flexShrink(0)
  }

  @Builder
  private agentButton() {
      IconActionButton({ toolbarStyle: true, source: $r('app.media.ic_study_agent'), label: $r('app.string.ai_agent_title'),
        controlSize: this.geometry().controlHeight, controlWidth: this.geometry().controlWidth, controlGlyphSize: this.geometry().controlGlyphSize,
        onAction: this.onAgent })
        .visibility(this.agentEnabled ? Visibility.Visible : Visibility.Hidden)
  }

  @Builder
  private searchButton() {
      IconActionButton({ toolbarStyle: true, source: $r('app.media.ic_settings_search'), label: $r('app.string.home_search_title'),
        controlSize: this.geometry().controlHeight, controlWidth: this.geometry().controlWidth, controlGlyphSize: this.geometry().controlGlyphSize,
        onAction: this.onSearch })
  }

  @Builder
  private browserButton() {
      IconActionButton({ toolbarStyle: true, source: $r('app.media.ic_home_browser'), label: $r('app.string.browser_title'),
        controlSize: this.geometry().controlHeight, controlWidth: this.geometry().controlWidth, controlGlyphSize: this.geometry().controlGlyphSize,
        onAction: this.onBrowser })
  }

  @Builder
  private moreButton() {
      IconActionButton({ toolbarStyle: true, source: $r('app.media.ic_home_more'), label: $r('app.string.study_more'),
        controlSize: this.geometry().controlHeight, controlWidth: this.geometry().controlWidth, controlGlyphSize: this.geometry().controlGlyphSize,
        onAction: this.onMore })
  }

  @Builder
  private createButton() {
      IconActionButton({ toolbarStyle: true, source: $r('app.media.ic_home_new'), label: $r('app.string.create_deck'),
        controlSize: this.geometry().controlHeight, controlWidth: this.geometry().controlWidth, controlGlyphSize: this.geometry().controlGlyphSize,
        onAction: this.onCreate })
  }

  @Builder
  private syncButton() {
      Stack({ alignContent: Alignment.TopEnd }) {
        IconActionButton({ toolbarStyle: true, source: $r('app.media.ic_home_sync'), label: this.syncLabel(),
          controlSize: this.geometry().controlHeight, controlWidth: this.geometry().controlWidth, controlGlyphSize: this.geometry().controlGlyphSize,
          onAction: this.onSync })
        if (homeSyncIndicator(this.syncAccountState, this.syncIndicator) === 'syncing') {
          LoadingProgress().width(14).height(14)
            .color(this.actionColor).hitTestBehavior(HitTestMode.None).accessibilityText(this.syncStatusText)
        } else if (homeSyncIndicator(this.syncAccountState, this.syncIndicator) === 'attention') {
          Text('!').fontSize(14).fontWeight(FontWeight.Bold)
            .fontColor(Color.White).backgroundColor($r('app.color.error_text'))
            .width(16).height(16).textAlign(TextAlign.Center).borderRadius(8)
            .hitTestBehavior(HitTestMode.None).accessibilityLevel('no')
        } else if (homeSyncIndicator(this.syncAccountState, this.syncIndicator) === 'pending') {
          Circle().width(8).height(8).fill($r('app.color.warning_text'))
            .hitTestBehavior(HitTestMode.None).accessibilityLevel('no')
        }
      }.width(this.geometry().controlWidth).height(this.geometry().controlHeight)
  }

  private syncLabel(): ResourceStr {
    if (this.syncIndicator !== 'hidden' && this.syncStatusText !== '') return this.syncStatusText;
    const key: string = homeSyncLabelKey(this.syncAccountState, this.syncIndicator);
    if (key === 'home_sync_not_logged_in') return $r('app.string.home_sync_not_logged_in');
    if (key === 'home_sync_one_way') return $r('app.string.home_sync_one_way');
    if (key === 'home_sync_pending_changes') return $r('app.string.home_sync_pending_changes');
    return $r('app.string.home_sync');
  }

  @Builder
  private actions() {
    Row() {
      this.moreButton()
      Blank().width(this.geometry().actionSeparation).flexShrink(0)
      Row({ space: this.geometry().actionGap }) {
        this.agentButton()
        this.searchButton()
        this.browserButton()
        this.syncButton()
        this.createButton()
      }.width(this.geometry().trailingWidth).height(this.geometry().actionsHeight).flexShrink(0)
    }.width('100%').height(this.geometry().actionsHeight).flexShrink(0)
  }

  build() {
    Column({ space: 应用尺寸.页面内容顶部间距(this.narrowDeckLayout) }) {
      if (this.contentWidth <= 0) {
        // 保留可测量的首行；宽度就绪后一次性展示，避免零宽图标和溢出按钮。
        Blank().height((this.showSummary ? this.geometry().summaryHeight : 0) +
          (this.actionsVisible ? this.geometry().actionsHeight + 应用尺寸.页面内容顶部间距(this.narrowDeckLayout) : 0))
      } else {
        if (this.actionsVisible) { this.actions() }
        if (this.showSummary) { this.summaryCard() }
      }
    }.width('100%').flexShrink(0)
      .onAreaChange((_old: Area, area: Area): void => { this.updateAnchor(area); })
  }
}
