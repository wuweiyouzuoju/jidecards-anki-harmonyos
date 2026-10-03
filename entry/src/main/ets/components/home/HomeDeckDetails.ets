// SPDX-License-Identifier: AGPL-3.0-or-later
import { PressFeedback } from '../../utils/PressFeedback';
import { 牌组详情面板 } from '../牌组详情面板';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { DECK_LIST_NARROW_KEY } from '../../model/DeckListAppearance';
import { PAGE_SURFACE_KEY } from '../../model/ThemeCatalog';
import { AI_AGENT_CHANNELS_APP_STORAGE_KEY } from '../../model/ReleaseFeatures';
import { DeckPreviewScopeMenu } from './DeckPreviewScopeMenu';
import { DeckPreviewScope } from '../../model/DeckPreviewSession';
import { APP_FOREGROUND_KEY } from '../../model/Redemption';
import { AnchoredMenu } from '../common/AnchoredMenu';
import { AnchoredMenuItem } from '../common/MenuItem';
import { 按下态按钮 } from '../common/按下态按钮';
import { AppInterfaceItem, AppInterfaceControl, visibleInterfaceItems } from '../../model/AppInterface';
import { appInterface } from '../../backend/AppInterfaceService';
import { interfaceItemText } from '../../utils/AppInterfaceText';

/** 手机详情与宽屏侧栏共用展示，动作及选择仍由首页持有。 */
@Component
export struct HomeDeckDetails {
  @Prop @Watch('compactChanged') compact: boolean = false;
  @Prop isDark: boolean = false;
  @Prop optionsBusy: boolean = false;
  @Prop historyRefreshToken: number = 0;
  @Prop @Watch('closeActionsMenu') deckId: string = '';
  @Prop @Watch('publishInterface') previewBusy: boolean = false;
  @StorageProp(APP_FOREGROUND_KEY) @Watch('foregroundChanged') private foreground: boolean = true;
  @StorageProp(DECK_LIST_NARROW_KEY) private narrowDeckLayout: boolean = false;
  @StorageProp('状态栏高度') private 状态栏高度: number = 0;
  @StorageProp(PAGE_SURFACE_KEY) private 页面底色微染值: string = '#F5F7FA';
  @StorageLink(AI_AGENT_CHANNELS_APP_STORAGE_KEY) @Watch('publishInterface') private agentEnabled: boolean = false;
  @State @Watch('publishInterface') private actionsMenuOpen: boolean = false;
  private interfaceMounted: boolean = false;
  @State private previewMenuOpen: boolean = false;
  onBackHandlerChange: (handler: (() => boolean) | null) => void = (): void => {};
  onBack: () => void = (): void => {};
  onStudy: () => void = (): void => {};
  onPreview: (scope: DeckPreviewScope) => void = (_scope: DeckPreviewScope): void => {};
  onMenuStateChange: (open: boolean) => void = (_open: boolean): void => {};
  onAddNote: () => void = (): void => {};
  onCreateWithAI: () => void = (): void => {};
  onCreateChild: () => void = (): void => {};
  onExport: () => void = (): void => {};
  onOptions: () => void = (): void => {};

  aboutToAppear(): void {
    this.interfaceMounted = true;
    this.compactChanged();
  }

  aboutToDisappear(): void {
    this.interfaceMounted = false;
    appInterface.leave('deck_actions');
    this.closeActionsMenu();
    this.onBackHandlerChange(null);
  }

  private publishInterface(): void {
    if (!this.interfaceMounted) return;
    if (!this.actionsMenuOpen) { appInterface.leave('deck_actions'); return; }
    const items: AppInterfaceItem[] = visibleInterfaceItems('deck_details', { simple: false, agent: this.agentEnabled,
      cloudDeck: false, themeHasTextures: false }).filter((item: AppInterfaceItem): boolean => ['add_note', 'agent', 'preview'].includes(item.id));
    appInterface.observe({ surface: 'deck_actions', sectionId: '', selectedId: this.deckId, busy: this.previewBusy,
      optionIds: items.map((item: AppInterfaceItem): string => item.id),
      optionLabels: items.map((item: AppInterfaceItem): string => interfaceItemText(this.getUIContext(), 'deck_details', item.id)),
      items: items.map((item: AppInterfaceItem): AppInterfaceControl => ({ id: item.id,
        titleKey: item.titleKey,
        title: interfaceItemText(this.getUIContext(), 'deck_details', item.id), enabled: item.id !== 'preview' || !this.previewBusy, selected: false })) });
  }

  private compactChanged(): void {
    this.closeActionsMenu();
    this.onBackHandlerChange((): boolean => this.consumeBack());
  }

  private foregroundChanged(): void {
    if (!this.foreground) this.closeActionsMenu();
  }

  private toggleActionsMenu(): void {
    if (this.previewBusy) return;
    this.previewMenuOpen = false;
    this.actionsMenuOpen = this.compact && !this.actionsMenuOpen;
    this.onMenuStateChange(this.actionsMenuOpen);
  }

  private closeActionsMenu(): void {
    this.actionsMenuOpen = false;
    this.previewMenuOpen = false;
    this.onMenuStateChange(false);
  }

  private consumeBack(): boolean {
    if (!this.actionsMenuOpen && !this.previewMenuOpen) return false;
    this.closeActionsMenu();
    return true;
  }

  private selectAction(action: () => void): void {
    this.closeActionsMenu();
    action();
  }

  private openPreviewMenu(): void {
    if (this.previewBusy) return;
    this.previewMenuOpen = true;
    this.onMenuStateChange(true);
  }

  private selectPreview(scope: DeckPreviewScope): void {
    this.closeActionsMenu();
    this.onPreview(scope);
  }

  @Builder
  private previewScopes() {
    DeckPreviewScopeMenu({ onSelect: (scope: DeckPreviewScope): void => { this.selectPreview(scope); } })
  }

  @Builder
  private actionsMenu() {
    // Keep the Preview row mounted: it owns the scope popup's arrow anchor.
    AnchoredMenuItem({ label: interfaceItemText(this.getUIContext(), 'deck_details', 'add_note'),
      onSelect: (): void => { this.selectAction(this.onAddNote); } })
    if (this.agentEnabled) {
      AnchoredMenuItem({ label: interfaceItemText(this.getUIContext(), 'deck_details', 'agent'), divider: true,
        onSelect: (): void => { this.selectAction(this.onCreateWithAI); } })
    }
    AnchoredMenuItem({ label: interfaceItemText(this.getUIContext(), 'deck_details', 'preview'), divider: true,
      onSelect: (): void => { this.openPreviewMenu(); } })
      .bindPopup(this.previewMenuOpen, {
        builder: this.previewScopes,
        placement: Placement.Left,
        popupColor: $r('app.color.surface_card'),
        enableArrow: true,
        onStateChange: (event: PopupStateChangeParam): void => {
          if (!event.isVisible) this.closeActionsMenu();
        }
      })
  }

  build() {
    Stack() {
      Column() {
        if (this.compact) {
          Row() {
            Button($r('app.string.study_back'))
              .height(应用尺寸.按钮高度)
              .padding({ left: 应用尺寸.卡片内边距, right: 应用尺寸.卡片内边距 })
              .constraintSize({ minWidth: 0 })
              .fontSize(应用尺寸.字号_按钮)
              .fontColor($r('app.color.text_primary'))
              .backgroundColor($r('app.color.surface_card'))
              .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
              .borderRadius(应用尺寸.圆角_胶囊)
              .attributeModifier(new PressFeedback())
              .stateEffect(false)
              .onClick(() => {
                if (!this.consumeBack()) this.onBack();
              })
            Blank()
            按下态按钮({ 文案: $r('app.string.deck_more'), singleLine: true,
              点击回调: (): void => { this.toggleActionsMenu(); } })
          }
          .width('100%')
          .height(应用尺寸.pageToolbarHeight(this.状态栏高度, this.narrowDeckLayout))
          .padding({
            left: 应用尺寸.页面内边距_水平,
            right: 应用尺寸.页面内边距_水平,
            top: 应用尺寸.pageToolbarTop(this.状态栏高度, this.narrowDeckLayout),
            bottom: 0
          })
          .backgroundColor(this.页面底色微染值)
        }

      牌组详情面板({
          historyRefreshToken: this.historyRefreshToken,
          showHeaderActions: !this.compact,
          是否深色: this.isDark,
          牌组选项加载中: this.optionsBusy,
          开始学习: (): void => {
            this.onStudy();
          },
          previewMenuOpen: this.previewMenuOpen && !this.compact,
          previewBusy: this.previewBusy,
          onPreviewMenuClose: (): void => { this.closeActionsMenu(); },
          onPreviewScope: (scope: DeckPreviewScope): void => { this.selectPreview(scope); },
          预览: (): void => { this.openPreviewMenu(); },
          添加卡片: (): void => {
            this.onAddNote();
          },
          onCreateWithAI: (): void => { this.onCreateWithAI(); },
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
      if (this.compact && this.actionsMenuOpen) {
        AnchoredMenu({ menuWidth: 应用尺寸.compactMenuWidth, alignEnd: true,
          contentMaxWidth: 应用尺寸.内容最大宽度,
          topOffset: 应用尺寸.pageContentTop(this.状态栏高度, this.narrowDeckLayout),
          onClose: (): void => { this.closeActionsMenu(); } }) {
          this.actionsMenu()
        }
      }
    }
    .width('100%')
    .height('100%')
  }
}
