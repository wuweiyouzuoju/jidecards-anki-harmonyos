// SPDX-License-Identifier: AGPL-3.0-or-later
import { IconActionButton } from '../common/IconActionButton';
import { MenuSurface } from '../common/MenuSurface';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { homeHeaderGeometry, HomeHeaderGeometry } from '../../model/HomeHeaderLayout';
import { 主页摘要分页 } from './主页摘要分页';
import { 主页快照, 空主页快照 } from '../../model/主页模型';
import { 桌面卡片数据 } from '../../model/桌面卡片数据存储';
import { safePopupContentHeight, WINDOW_SAFE_TOP_KEY, WINDOW_SAFE_BOTTOM_KEY, WINDOW_HEIGHT_KEY } from '../../model/WindowSafeLayout';

/** 只拥有首行几何和按钮锚点；菜单状态与业务操作归首页。 */
@Component
export struct HomeSummaryHeader {
  @Prop @Watch('layoutChanged') showSummary: boolean = true;
  @Prop actionsVisible: boolean = true;
  @Prop agentEnabled: boolean = false;
  @Prop moreOpen: boolean = false;
  @Prop createOpen: boolean = false;
  @Prop actionColor: string = '#2F5FD0';
  @Prop syncIndicator: string = 'hidden';
  @Prop syncStatusText: string = '';
  @Prop homeSnapshot: 主页快照 = 空主页快照;
  @Prop graphsSnapshot: 桌面卡片数据 | null = null;
  onMore: () => void = (): void => {};
  onCreate: () => void = (): void => {};
  onAgent: () => void = (): void => {};
  onSearch: () => void = (): void => {};
  onSync: () => void = (): void => {};
  onBrowser: () => void = (): void => {};
  onMoreClose: () => void = (): void => {};
  onCreateClose: () => void = (): void => {};
  @BuilderParam moreContent: (maxHeight: number) => void = this.emptyContent;
  @BuilderParam createContent: (maxHeight: number) => void = this.emptyContent;
  @State private contentWidth: number = 0;
  @State private headerTop: number = 0;
  @StorageProp(WINDOW_SAFE_TOP_KEY) @Watch('layoutChanged') private safeTop: number = 0;
  @StorageProp(WINDOW_SAFE_BOTTOM_KEY) @Watch('layoutChanged') private safeBottom: number = 0;
  @StorageProp(WINDOW_HEIGHT_KEY) @Watch('layoutChanged') private windowHeight: number = 0;

  @Builder
  private emptyContent(_maxHeight: number): void {}

  private menuHeight(): number {
    const popupTop: number = this.headerTop + this.geometry().controlHeight + 应用尺寸.间距_8 + MenuSurface.pointerDepth;
    return safePopupContentHeight(this.windowHeight, popupTop,
      this.safeTop, this.safeBottom, 应用尺寸.间距_8);
  }

  @Builder
  private safeMoreContent(): void {
    this.moreContent(this.menuHeight());
  }

  @Builder
  private safeCreateContent(): void {
    this.createContent(this.menuHeight());
  }

  private geometry(): HomeHeaderGeometry { return homeHeaderGeometry(this.contentWidth, 应用尺寸.间距_8, this.showSummary); }
  private closeMenus(): void { this.onMoreClose(); this.onCreateClose(); }
  private layoutChanged(): void {
    this.closeMenus();
  }
  aboutToDisappear(): void { this.closeMenus(); }

  @Builder
  private summaryCard() {
    主页摘要分页({ 主页快照数据: this.homeSnapshot, 图表快照: this.graphsSnapshot,
      cardHeight: this.geometry().summaryHeight, compactCard: this.geometry().compactCard })
      .width(this.geometry().summaryWidth).height(this.geometry().summaryHeight).flexShrink(0)
  }

  @Builder
  private agentButton() {
      IconActionButton({ source: $r('app.media.ic_study_agent'), label: $r('app.string.ai_agent_title'),
        controlSize: this.geometry().controlHeight, controlWidth: this.geometry().controlWidth, controlGlyphSize: this.geometry().controlGlyphSize,
        squareSurface: true, surface: $r('app.color.surface_card'), glyphColor: this.actionColor, onAction: this.onAgent })
        .visibility(this.agentEnabled ? Visibility.Visible : Visibility.Hidden)
  }

  @Builder
  private searchButton() {
      IconActionButton({ source: $r('app.media.ic_settings_search'), label: $r('app.string.home_search_title'),
        controlSize: this.geometry().controlHeight, controlWidth: this.geometry().controlWidth, controlGlyphSize: this.geometry().controlGlyphSize,
        squareSurface: true, surface: $r('app.color.surface_card'), glyphColor: this.actionColor, onAction: this.onSearch })
  }

  @Builder
  private browserButton() {
      IconActionButton({ source: $r('app.media.ic_home_browser'), label: $r('app.string.browser_title'),
        controlSize: this.geometry().controlHeight, controlWidth: this.geometry().controlWidth, controlGlyphSize: this.geometry().controlGlyphSize,
        squareSurface: true, surface: $r('app.color.surface_card'), glyphColor: this.actionColor, onAction: this.onBrowser })
  }

  @Builder
  private moreButton() {
      IconActionButton({ source: $r('app.media.ic_home_more'), label: $r('app.string.study_more'),
        controlSize: this.geometry().controlHeight, controlWidth: this.geometry().controlWidth, controlGlyphSize: this.geometry().controlGlyphSize,
        squareSurface: true, surface: $r('app.color.surface_card'), glyphColor: this.actionColor, onAction: this.onMore })
        .bindPopup(this.moreOpen, {
          builder: this.safeMoreContent, placement: Placement.BottomLeft, targetSpace: 应用尺寸.间距_8,
          popupColor: $r('app.color.menu_surface'), enableArrow: true,
          arrowWidth: MenuSurface.pointerSpan, arrowHeight: MenuSurface.pointerDepth,
          radius: 应用尺寸.圆角_指标卡, transition: MenuSurface.popupTransition(),
          onStateChange: (event: PopupStateChangeParam): void => { if (!event.isVisible && this.moreOpen) this.onMoreClose(); }
        })
  }

  @Builder
  private createButton() {
      IconActionButton({ source: $r('app.media.ic_home_new'), label: $r('app.string.create_deck'),
        controlSize: this.geometry().controlHeight, controlWidth: this.geometry().controlWidth, controlGlyphSize: this.geometry().controlGlyphSize,
        squareSurface: true, surface: $r('app.color.surface_card'), glyphColor: this.actionColor, onAction: this.onCreate })
        .bindPopup(this.createOpen, {
          builder: this.safeCreateContent, placement: Placement.BottomRight, targetSpace: 应用尺寸.间距_8,
          popupColor: $r('app.color.menu_surface'), enableArrow: true,
          arrowWidth: MenuSurface.pointerSpan, arrowHeight: MenuSurface.pointerDepth,
          radius: 应用尺寸.圆角_指标卡, transition: MenuSurface.popupTransition(),
          onStateChange: (event: PopupStateChangeParam): void => { if (!event.isVisible && this.createOpen) this.onCreateClose(); }
        })
  }

  @Builder
  private syncButton() {
      Stack({ alignContent: Alignment.TopEnd }) {
        IconActionButton({ source: $r('app.media.ic_home_sync'), label: $r('app.string.home_sync'),
          controlSize: this.geometry().controlHeight, controlWidth: this.geometry().controlWidth, controlGlyphSize: this.geometry().controlGlyphSize,
          squareSurface: true, surface: $r('app.color.surface_card'), glyphColor: this.actionColor, onAction: this.onSync })
        if (this.syncIndicator === 'syncing') {
          LoadingProgress().width(14).height(14)
            .color(this.actionColor).hitTestBehavior(HitTestMode.None).accessibilityText(this.syncStatusText)
        } else if (this.syncIndicator === 'attention') {
          Text('!').fontSize(14).fontWeight(FontWeight.Bold)
            .fontColor($r('app.color.error_text')).hitTestBehavior(HitTestMode.None).accessibilityText(this.syncStatusText)
        }
      }.width(this.geometry().controlWidth).height(this.geometry().controlHeight)
  }

  @Builder
  private actions() {
    Row({ space: this.geometry().actionGap }) {
      this.moreButton()
      this.agentButton()
      this.searchButton()
      this.browserButton()
      this.syncButton()
      this.createButton()
    }.width('100%').height(this.geometry().actionsHeight).flexShrink(0)
  }

  build() {
    Column({ space: 应用尺寸.间距_8 }) {
      if (this.contentWidth <= 0) {
        // 保留可测量的首行；宽度就绪后一次性展示，避免零宽图标和溢出按钮。
        Blank().height((this.showSummary ? this.geometry().summaryHeight : 0) +
          (this.actionsVisible ? this.geometry().actionsHeight + 应用尺寸.间距_8 : 0))
      } else {
        if (this.actionsVisible) { this.actions() }
        if (this.showSummary) { this.summaryCard() }
      }
    }.width('100%').flexShrink(0)
      .onAreaChange((_old: Area, area: Area): void => {
        const top: number = Number(area.globalPosition.y);
        if (Math.abs(top - this.headerTop) > 0.1) { this.closeMenus(); this.headerTop = top; }
        const next: number = Number(area.width);
        if (Math.abs(next - this.contentWidth) > 0.1) {
          this.closeMenus(); this.contentWidth = next;
        }
      })
  }
}
