// SPDX-License-Identifier: AGPL-3.0-or-later
import { compactLandscapeScale } from '../../model/AppLayoutState';
import { WINDOW_SIZE_KEY, WindowSizeVp } from '../../model/WindowSafeLayout';
import { HOME_RIGHT_WHEEL_OPEN_KEY } from '../../model/HomeLayout';
import { saveHomeWheelExpanded } from '../../utils/HomeLayoutStore';
import { buildNoteEditorWheel, NoteEditorWheelParams } from '../editor/NoteEditorWheel';
import { NoteEditorWheelTool } from '../../model/NoteEditorWheel';
import { WINDOW_SAFE_TOP_KEY } from '../../model/WindowSafeLayout';
import { 牌组详情面板 } from '../牌组详情面板';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { PAGE_COMPACT_LAYOUT_KEY } from '../../model/AppLayoutState';
import { PAGE_SURFACE_KEY } from '../../model/ThemeCatalog';
import { AI_AGENT_CHANNELS_APP_STORAGE_KEY } from '../../model/ReleaseFeatures';
import { DeckPreviewScopeMenu } from './DeckPreviewScopeMenu';
import { DeckPreviewScope } from '../../model/DeckPreviewSession';
import { APP_FOREGROUND_KEY } from '../../model/AppLifecycleState';
import { GlassSource } from '../common/GlassSource';
import { GLASS_DECK_DETAILS_SOURCE, GLASS_HOME_SOURCE } from '../../utils/GlassBackdrop';
import { AnchoredMenu } from '../common/AnchoredMenu';
import { rememberPopupTrigger } from '../../utils/PopupTrigger';
import { MenuSlideScope } from '../../model/MenuSlideSession';
import { HomeActionAnchor } from '../../model/HomeHeaderLayout';
import { IconActionButton } from '../common/IconActionButton';
import { AppInterfaceItem, AppInterfaceControl, visibleInterfaceItems } from '../../model/AppInterface';
import { appInterface } from '../../backend/AppInterfaceService';
import { interfaceItemText } from '../../utils/AppInterfaceText';

/** 手机详情与宽屏侧栏共用展示，动作及选择仍由首页持有。 */
@Component
export struct HomeDeckDetails {
  @StorageProp(WINDOW_SIZE_KEY) private densityWindow: WindowSizeVp = { width: 0, height: 0 };
  private densityScale(): number {
    return compactLandscapeScale(this.densityWindow.width, this.densityWindow.height);
  }

  private readonly previewSlideScope: MenuSlideScope = new MenuSlideScope();
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop @Watch('compactChanged') compact: boolean = false;
  @Prop @Watch('closePreviewMenu') menuDismissRequest: number = 0;
  @Prop @Watch('closePreviewMenu') headerActionHeight: number = 应用尺寸.按钮高度;
  @StorageProp(HOME_RIGHT_WHEEL_OPEN_KEY) private homeRightWheelOpen: boolean = true;
  @Prop @Watch('closePreviewMenu') actionWheelEnabled: boolean = false;
  @Prop isDark: boolean = false;
  @Prop optionsBusy: boolean = false;
  @Prop filteredBusy: boolean = false;
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
  @State private previewMenuCloseRequest: number = 0;
  @State private sidebarPreviewAnchor: HomeActionAnchor | undefined = undefined;
  @State private actionAnchor: HomeActionAnchor = { left: 0, top: 0, width: 0 };
  onBackHandlerChange: (handler: (() => boolean) | null) => void = (): void => {};
  onBack: () => void = (): void => {};
  onStudy: () => void = (): void => {};
  onPreview: (scope: DeckPreviewScope) => void = (_scope: DeckPreviewScope): void => {};
  onMenuStateChange: (open: boolean) => void = (_open: boolean): void => {};
  onAddNote: () => void = (): void => {};
  onCreateWithAI: () => void = (): void => {};
  onMore: (anchor?: HomeActionAnchor) => void = (): void => {};
  onShortcut: (id: string) => void = (_id: string): void => {};

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
      cloudDeck: false, themeHasTextures: false }).filter((item: AppInterfaceItem): boolean => ['add_note', 'agent', 'preview', 'more'].includes(item.id));
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
    this.previewMenuCloseRequest++;
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
    const inset: number = 应用尺寸.页面内边距_水平 * this.densityScale();
    this.actionAnchor = { left: Number(area.globalPosition.x) + inset,
      top: Number(area.globalPosition.y) + Number(area.height) + 应用尺寸.页面内容顶部间距(this.narrowDeckLayout) * this.densityScale(),
      width: Math.max(0, Number(area.width) - 2 * inset) };
  }

  private actionWheelParams(): NoteEditorWheelParams {
    const params: NoteEditorWheelParams = new NoteEditorWheelParams(
      { cloze: false, source: false, expanded: false, activeIds: [] }, (id: string): void => {
        if (id === 'add_note') this.selectAction(this.onAddNote);
        else if (id === 'agent') this.selectAction(this.onCreateWithAI);
        else if (id === 'more') this.selectAction((): void => { this.onMore(this.actionAnchor); });
      });
    params.onActionArea = (id: string, area: Area | undefined): void => {
      if (id !== 'preview') {
        params.onAction(id);
      } else if (area !== undefined) {
        this.sidebarPreviewAnchor = { left: Number(area.globalPosition.x), width: Number(area.width),
          top: Number(area.globalPosition.y) + Number(area.height) + 应用尺寸.页面内容顶部间距(this.narrowDeckLayout) * this.densityScale() };
        rememberPopupTrigger(area);
        this.openPreviewMenu();
      }
    };
    params.fixedSide = 'right';
    params.initialCollapsed = !this.homeRightWheelOpen;
    params.onExpandedChange = (expanded: boolean): Promise<void> => saveHomeWheelExpanded(HOME_RIGHT_WHEEL_OPEN_KEY, expanded);
    params.observationSurface = 'deck_action_wheel';
    params.observationTitleKey = 'home_interface_decks';
    params.customTools = visibleInterfaceItems('deck_details', { simple: false, agent: this.agentEnabled,
      cloudDeck: false, themeHasTextures: false })
      .filter((item: AppInterfaceItem): boolean => ['add_note', 'agent', 'preview', 'more'].includes(item.id))
      .map((item: AppInterfaceItem): NoteEditorWheelTool => ({ id: item.id, titleKey: item.titleKey,
        iconKey: item.iconKey ?? 'ic_home_more', editing: 'both', active: false,
        enabled: this.deckId !== '' && (item.id !== 'preview' || !this.previewBusy) }));
    return params;
  }

  @Builder
  private previewScopes() {
    DeckPreviewScopeMenu({ slideScope: this.previewSlideScope, onSelect: (scope: DeckPreviewScope): void => { this.selectPreview(scope); } })
  }

  build() {
    Stack() {
      GlassSource({ sourceId: GLASS_DECK_DETAILS_SOURCE, freezeDuringPanels: true, pageBackdrop: false }) {
      Column() {
        if (this.compact) {
          Row() {
            IconActionButton({ toolbarStyle: true, source: $r('app.media.ic_common_arrow_left'), label: $r('app.string.study_back'),
              onAction: (): void => {
                if (!this.consumeBack()) this.onBack();
              } })
            Blank()
            Row({ space: 应用尺寸.页面分组间距(this.narrowDeckLayout) * this.densityScale() }) {
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
                isInteractive: this.deckId !== '' && !this.previewBusy, slideMenu: true, onHoldOpen: (): void => { this.openPreviewMenu(); },
                onHoldCancel: (): void => { this.closePreviewMenu(); }, onAction: (): void => { this.openPreviewMenu(); } })
              IconActionButton({ toolbarStyle: true, source: $r('app.media.ic_home_more'),
                label: interfaceItemText(this.getUIContext(), 'deck_details', 'more', this.uiLanguage),
                isInteractive: this.deckId !== '', onAction: (): void => { this.selectAction((): void => { this.onMore(this.actionAnchor); }); } })
            }

          }
          .width('100%')
          .height(应用尺寸.pageToolbarHeight(this.状态栏高度, this.narrowDeckLayout, this.toolbarSafeTop))
          .padding({
            left: 应用尺寸.页面内边距_水平 * this.densityScale(),
            right: 应用尺寸.页面内边距_水平 * this.densityScale(),
            top: 应用尺寸.pageToolbarTop(this.状态栏高度, this.narrowDeckLayout, this.toolbarSafeTop),
            bottom: 0
          })
          .backgroundColor(Color.Transparent)
          .onAreaChange((_old: Area, area: Area): void => { this.compactAnchorChanged(area); })
        }

      牌组详情面板({

          onShortcut: (id: string): void => { this.selectAction((): void => { this.onShortcut(id); }); },
          historyRefreshToken: this.historyRefreshToken,
          showHeaderActions: !this.compact,
          headerActionHeight: !this.compact && this.actionWheelEnabled ? 0 : this.headerActionHeight,
          actionWheel: !this.compact && this.actionWheelEnabled && this.headerActionHeight > 0,
          是否深色: this.isDark,
          牌组选项加载中: this.optionsBusy,
          开始学习: (): void => {
            this.onStudy();
          },
          previewBusy: this.previewBusy,
          onActionAnchorChange: (anchor: HomeActionAnchor): void => { this.actionAnchor = anchor; },
          预览: (): void => { this.openPreviewMenu(); },
          onPreviewHold: (): void => { this.openPreviewMenu(); },
          onPreviewCancel: (): void => { this.closePreviewMenu(); },
          添加卡片: (): void => {
            this.onAddNote();
          },
          onCreateWithAI: (): void => { this.onCreateWithAI(); },
          onMore: (): void => { this.selectAction((): void => { this.onMore(this.actionAnchor); }); }
        })
        .id('home-deck-details-' + this.deckId).layoutWeight(1)
      }
      .width('100%')
      .height('100%')
      .backgroundColor(Color.Transparent)
      }
      if (!this.compact && this.actionWheelEnabled && this.headerActionHeight > 0 && this.deckId !== '') {
        buildNoteEditorWheel(this.actionWheelParams())
      }
      if (this.previewMenuOpen && ((!this.compact && this.actionWheelEnabled) ? this.sidebarPreviewAnchor !== undefined : this.actionAnchor.width > 0)) {
        AnchoredMenu({ menuWidth: !this.compact && this.actionWheelEnabled ? 应用尺寸.compactMenuWidth : Math.min(应用尺寸.compactMenuWidth, this.actionAnchor.width), alignEnd: true, slideScope: this.previewSlideScope,
          closeRequest: this.previewMenuCloseRequest, refractionSource: GLASS_HOME_SOURCE,
          toolbarBounds: !this.compact && this.actionWheelEnabled ? this.sidebarPreviewAnchor : this.actionAnchor,
          onClose: (): void => { this.closePreviewMenu(); } }) {
          this.previewScopes()
        }
      }
    }
    .width('100%')
    .height('100%')
  }
}
