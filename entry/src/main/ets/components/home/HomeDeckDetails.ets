// SPDX-License-Identifier: AGPL-3.0-or-later
import { WINDOW_SAFE_TOP_KEY } from '../../model/WindowSafeLayout';
import { 牌组详情面板 } from '../牌组详情面板';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { PAGE_COMPACT_LAYOUT_KEY } from '../../model/AppLayoutState';
import { PAGE_SURFACE_KEY } from '../../model/ThemeCatalog';
import { AI_AGENT_CHANNELS_APP_STORAGE_KEY } from '../../model/ReleaseFeatures';
import { DeckPreviewScopeMenu } from './DeckPreviewScopeMenu';
import { DeckPreviewScope } from '../../model/DeckPreviewSession';
import { APP_FOREGROUND_KEY } from '../../model/AppLifecycleState';
import { AnchoredMenu } from '../common/AnchoredMenu';
import { HomeActionAnchor } from '../../model/HomeHeaderLayout';
import { IconActionButton } from '../common/IconActionButton';
import { AppInterfaceItem, AppInterfaceControl, visibleInterfaceItems } from '../../model/AppInterface';
import { appInterface } from '../../backend/AppInterfaceService';
import { interfaceItemText } from '../../utils/AppInterfaceText';

/** 手机详情与宽屏侧栏共用展示，动作及选择仍由首页持有。 */
@Component
export struct HomeDeckDetails {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop @Watch('compactChanged') compact: boolean = false;
  @Prop @Watch('closePreviewMenu') headerActionHeight: number = 应用尺寸.按钮高度;
  @Prop isDark: boolean = false;
  @Prop optionsBusy: boolean = false;
  @Prop historyRefreshToken: number = 0;
  @Prop @Watch('closePreviewMenu') deckId: string = '';
  @Prop @Watch('publishInterface') previewBusy: boolean = false;
  @StorageProp(APP_FOREGROUND_KEY) @Watch('foregroundChanged') private foreground: boolean = true;
  @StorageProp(PAGE_COMPACT_LAYOUT_KEY) private narrowDeckLayout: boolean = false;
  @StorageProp('状态栏高度') private 状态栏高度: number = 0;
  @StorageProp(WINDOW_SAFE_TOP_KEY) private toolbarSafeTop: number = 0;
  @StorageProp(PAGE_SURFACE_KEY) private 页面底色微染值: string = '#F5F7FA';
  @StorageLink(AI_AGENT_CHANNELS_APP_STORAGE_KEY) @Watch('publishInterface') private agentEnabled: boolean = false;
  private interfaceMounted: boolean = false;
  @State @Watch('publishInterface') private previewMenuOpen: boolean = false;
  @State private actionAnchor: HomeActionAnchor = { left: 0, top: 0, width: 0 };
  @State private detailsOrigin: HomeActionAnchor = { left: 0, top: 0, width: 0 };
  onBackHandlerChange: (handler: (() => boolean) | null) => void = (): void => {};
  onBack: () => void = (): void => {};
  onStudy: () => void = (): void => {};
  onPreview: (scope: DeckPreviewScope) => void = (_scope: DeckPreviewScope): void => {};
  onMenuStateChange: (open: boolean) => void = (_open: boolean): void => {};
  onAddNote: () => void = (): void => {};
  onCreateWithAI: () => void = (): void => {};
  onCreateChild: () => void = (): void => {};
  onMoveDeck: () => void = (): void => {};
  onRenameDeck: () => void = (): void => {};
  onExport: () => void = (): void => {};
  onOptions: () => void = (): void => {};

  aboutToAppear(): void {
    this.interfaceMounted = true;
    this.compactChanged();
  }

  aboutToDisappear(): void {
    this.interfaceMounted = false;
    appInterface.leave('deck_actions');
    this.closePreviewMenu();
    this.onBackHandlerChange(null);
  }

  private publishInterface(): void {
    if (!this.interfaceMounted) return;
    if (!this.compact || !this.foreground || this.previewMenuOpen) { appInterface.leave('deck_actions'); return; }
    const items: AppInterfaceItem[] = visibleInterfaceItems('deck_details', { simple: false, agent: this.agentEnabled,
      cloudDeck: false, themeHasTextures: false }).filter((item: AppInterfaceItem): boolean => ['add_note', 'agent', 'preview'].includes(item.id));
    appInterface.observe({ surface: 'deck_actions', sectionId: 'toolbar_right', selectedId: this.deckId, busy: this.previewBusy,
      optionIds: items.map((item: AppInterfaceItem): string => item.id),
      optionLabels: items.map((item: AppInterfaceItem): string => interfaceItemText(this.getUIContext(), 'deck_details', item.id, this.uiLanguage)),
      items: items.map((item: AppInterfaceItem): AppInterfaceControl => ({ id: item.id,
        titleKey: item.titleKey,
        iconKey: item.iconKey,
        title: interfaceItemText(this.getUIContext(), 'deck_details', item.id, this.uiLanguage),
        enabled: this.deckId !== '' && (item.id !== 'preview' || !this.previewBusy), selected: false })) });
  }

  private compactChanged(): void {
    this.closePreviewMenu();
    this.onBackHandlerChange((): boolean => this.consumeBack());
    this.publishInterface();
  }

  private foregroundChanged(): void {
    if (!this.foreground) this.closePreviewMenu();
    this.publishInterface();
  }

  private closePreviewMenu(): void {
    this.previewMenuOpen = false;
    this.onMenuStateChange(false);
    this.publishInterface();
  }

  private consumeBack(): boolean {
    if (!this.previewMenuOpen) return false;
    this.closePreviewMenu();
    return true;
  }

  private selectAction(action: () => void): void {
    this.closePreviewMenu();
    action();
  }

  private openPreviewMenu(): void {
    if (this.previewBusy) return;
    this.previewMenuOpen = true;
    this.onMenuStateChange(true);
  }

  private selectPreview(scope: DeckPreviewScope): void {
    this.closePreviewMenu();
    this.onPreview(scope);
  }

  private compactAnchorChanged(area: Area): void {
    const inset: number = 应用尺寸.页面内边距_水平;
    this.actionAnchor = { left: Number(area.globalPosition.x) + inset,
      top: Number(area.globalPosition.y) + Number(area.height) + 应用尺寸.页面内容顶部间距(this.narrowDeckLayout),
      width: Math.max(0, Number(area.width) - 2 * inset) };
  }

  private detailsAreaChanged(area: Area): void {
    this.detailsOrigin = { left: Number(area.globalPosition.x), top: Number(area.globalPosition.y),
      width: Number(area.width) };
  }

  private menuAnchor(): HomeActionAnchor {
    // 宽屏详情位于右侧分栏：窗口实测坐标只在宿主边界转换一次。
    return { left: Math.max(0, this.actionAnchor.left - this.detailsOrigin.left),
      top: Math.max(0, this.actionAnchor.top - this.detailsOrigin.top), width: this.actionAnchor.width };
  }

  @Builder
  private previewScopes() {
    DeckPreviewScopeMenu({ onSelect: (scope: DeckPreviewScope): void => { this.selectPreview(scope); } })
  }

  build() {
    Stack() {
      Column() {
        if (this.compact) {
          Row() {
            IconActionButton({ toolbarStyle: true, source: $r('app.media.ic_common_arrow_left'), label: $r('app.string.study_back'),
              onAction: (): void => {
                if (!this.consumeBack()) this.onBack();
              } })
            Blank()
            Row({ space: 应用尺寸.页面分组间距(this.narrowDeckLayout) }) {
              IconActionButton({ toolbarStyle: true, source: $r('app.media.ic_study_edit'),
                label: interfaceItemText(this.getUIContext(), 'deck_details', 'add_note', this.uiLanguage),
                isInteractive: this.deckId !== '', onAction: (): void => { this.selectAction(this.onAddNote); } })
              if (this.agentEnabled) {
                IconActionButton({ toolbarStyle: true, source: $r('app.media.ic_study_agent'),
                  label: interfaceItemText(this.getUIContext(), 'deck_details', 'agent', this.uiLanguage),
                  isInteractive: this.deckId !== '', onAction: (): void => { this.selectAction(this.onCreateWithAI); } })
              }
              IconActionButton({ toolbarStyle: true, source: $r('app.media.ic_common_preview'),
                label: interfaceItemText(this.getUIContext(), 'deck_details', 'preview', this.uiLanguage),
                isInteractive: this.deckId !== '' && !this.previewBusy, onAction: (): void => { this.openPreviewMenu(); } })
            }
          }
          .width('100%')
          .height(应用尺寸.pageToolbarHeight(this.状态栏高度, this.narrowDeckLayout, this.toolbarSafeTop))
          .padding({
            left: 应用尺寸.页面内边距_水平,
            right: 应用尺寸.页面内边距_水平,
            top: 应用尺寸.pageToolbarTop(this.状态栏高度, this.narrowDeckLayout, this.toolbarSafeTop),
            bottom: 0
          })
          .backgroundColor(this.页面底色微染值)
          .onAreaChange((_old: Area, area: Area): void => { this.compactAnchorChanged(area); })
        }

      牌组详情面板({
          historyRefreshToken: this.historyRefreshToken,
          showHeaderActions: !this.compact,
          headerActionHeight: this.headerActionHeight,
          是否深色: this.isDark,
          牌组选项加载中: this.optionsBusy,
          开始学习: (): void => {
            this.onStudy();
          },
          previewBusy: this.previewBusy,
          onActionAnchorChange: (anchor: HomeActionAnchor): void => { this.actionAnchor = anchor; },
          预览: (): void => { this.openPreviewMenu(); },
          添加卡片: (): void => {
            this.onAddNote();
          },
          onCreateWithAI: (): void => { this.onCreateWithAI(); },
          onMoveDeck: (): void => { this.onMoveDeck(); },
          onRenameDeck: (): void => { this.onRenameDeck(); },
          创建子牌组: (): void => {
            this.onCreateChild();
          },
          导出牌组: (): void => {
            this.onExport();
          },
          打开牌组选项: (): void => {
            this.onOptions();
          }
        })
        .layoutWeight(1)
      }
      .width('100%')
      .height('100%')
      .backgroundColor(this.compact ? this.页面底色微染值 : Color.Transparent)
      if (this.previewMenuOpen && this.actionAnchor.width > 0) {
        AnchoredMenu({ menuWidth: Math.min(应用尺寸.compactMenuWidth, this.actionAnchor.width), alignEnd: true,
          contentLeft: this.menuAnchor().left, contentMaxWidth: this.actionAnchor.width,
          topOffset: this.menuAnchor().top,
          onClose: (): void => { this.closePreviewMenu(); } }) {
          this.previewScopes()
        }
      }
    }
    .width('100%')
    .height('100%')
    .onAreaChange((_old: Area, area: Area): void => { this.detailsAreaChanged(area); })
  }
}
