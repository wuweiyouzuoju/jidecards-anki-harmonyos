// SPDX-License-Identifier: AGPL-3.0-or-later
import { PressFeedback } from '../utils/PressFeedback';
import { AppInterfaceItem, AppInterfaceControl, visibleInterfaceItems } from '../model/AppInterface';
import { appInterface } from '../backend/AppInterfaceService';
import { interfaceItemText } from '../utils/AppInterfaceText';
import { ExpansionReveal } from '../utils/ExpansionReveal';
import { DisclosureChevron } from './common/DisclosureChevron';
import { AI_AGENT_CHANNELS_APP_STORAGE_KEY } from '../model/ReleaseFeatures';
import { GlassSurface } from '../utils/GlassSurface';
import { GLASS_COLORS_KEY, GLASS_HIGHLIGHT_COLORS } from '../model/ThemeCatalog';
import { ThemeTextSpans } from './common/ThemeText';
import { THEME_TEXT_COLORS_KEY } from '../model/ThemeCatalog';
import { DeckStudyHistoryCard } from './DeckStudyHistoryCard';
import { deckHistorySearch } from '../model/DeckStudyHistory';
import { DECK_LIST_NARROW_KEY } from '../model/DeckListAppearance';
import { DeckPreviewScopeMenu } from './home/DeckPreviewScopeMenu';
import { DeckPreviewScope } from '../model/DeckPreviewSession';

import { 牌组汇总, 主页快照, 牌组显示名 } from '../model/主页模型';
import { 应用尺寸 } from '../utils/应用尺寸';
import { 开始学习按钮 } from './开始学习按钮';
import { 颜色键 } from '../model/颜色主题';

// ========================================================
// @块ID UI-DECK-DETAIL-001
// @名称 牌组详情面板 组件主体字段
//
// @作用
// 宽屏详情 pane：选中卡组的名称、描述、三类计数、牌组选项入口与开始学习按钮。
// 牌组选项的渲染由父页面在根 Stack 中挂载以实现全局磨砂覆盖；
// pane 仅在点击「牌组选项」时通过 onOpenDeckOptions 回调上抛。
//
// @输入
// @Prop 是否深色 / 牌组选项加载中 / 牌组选项错误；
// @Consume('selectedDeckId') / @Consume('snapshot')（@Provide 来自 Index.ets，key 字符串保留以维持链路）；
// 父组件回调 onStart / onAddCard / onCreateSubdeck / onExportDeck / onOpenDeckOptions。
//
// @输出
// 渲染宽屏详情面板；通过回调上抛用户操作。
//
// @业务规则
// ArkUI V1 限制（前 5 次失败根因）：
// - @Prop / @State 对 plain interface 不响应后续更新
// - @Consume 在 private 方法内部访问不建立响应式依赖
// - @Watch 回调中 @State 赋值不触发 build() 重新执行
// - build() 中模板字符串引用 @Consume 不可靠
// 最终方案：ForEach(this.snapshot.decks) + if (deck.id === this.selectedDeckId) 直接渲染。
// 按钮按压由公共 GlassSurface 处理，不写入面板状态。
//
// @副作用
// 无。仅渲染与上抛回调。
//
// @注意
// @Consume key 'selectedDeckId' / 'snapshot' 是与 Index.ets @Provide 配对的协议字段，禁止修改。
// ========================================================
@Component
export struct 牌组详情面板 {
  @StorageProp(DECK_LIST_NARROW_KEY) private narrowDeckLayout: boolean = false;
  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  @StorageProp(GLASS_COLORS_KEY) private glassColors: string[] = GLASS_HIGHLIGHT_COLORS;
  @StorageLink(AI_AGENT_CHANNELS_APP_STORAGE_KEY) @Watch('publishInterface') private Agent入口已启用: boolean = false;
  @Prop historyRefreshToken: number = 0;
  @Prop @Watch('publishInterface') showHeaderActions: boolean = true;
  @Prop previewMenuOpen: boolean = false;
  @Prop previewBusy: boolean = false;
  onPreviewMenuClose: () => void = (): void => {};
  onPreviewScope: (scope: DeckPreviewScope) => void = (_scope: DeckPreviewScope): void => {};
  @StorageProp('导航条高度') private navigationBottomInset: number = 0;
  @Prop 是否深色: boolean = false;
  // 注：@Consume key 字符串 'selectedDeckId' / 'snapshot' 与 Index.ets 的 @Provide 配对，保留不动。
  @Consume('selectedDeckId') @Watch('publishInterface') 选中牌组Id: string;
  @Consume('snapshot') @Watch('publishInterface') 主页快照数据: 主页快照;
  @Prop @Watch('publishInterface') 牌组选项加载中: boolean = false;
  @Prop 牌组选项错误: string = '';
  开始学习: () => void = (): void => {
  };
  添加卡片: () => void = (): void => {
  };
  onCreateWithAI: () => void = (): void => {};
  创建子牌组: () => void = (): void => {
  };
  导出牌组: () => void = (): void => {
  };
  打开牌组选项: () => void = (): void => {
  };
  预览: () => void = (): void => {
  };

  @State @Watch('publishInterface') private 显示更多: boolean = false;
  private interfaceMounted: boolean = false;
  private moreReveal: ExpansionReveal = new ExpansionReveal();
  @StorageProp(颜色键.新卡计数色) private 新卡计数色: string = '#3974D9';
  @StorageProp(颜色键.学习中计数色) private 学习中计数色: string = '#B56A22';
  @StorageProp(颜色键.复习中计数色) private 复习中计数色: string = '#7056C8';
  @StorageProp(颜色键.动作主色) private 动作主色: string = '#2F5FD0';
  // 更多及其子按钮共用按下状态。

  aboutToAppear(): void { this.interfaceMounted = true; this.publishInterface(); }

  aboutToDisappear(): void {
    this.interfaceMounted = false;
    appInterface.leave('deck_details');
    appInterface.leave('deck_details_more');
    this.moreReveal.cancel();
  }

  private moreItems(): AppInterfaceItem[] {
    return visibleInterfaceItems('deck_details_more', { simple: false, agent: this.Agent入口已启用,
      cloudDeck: false, themeHasTextures: false });
  }

  private publishInterface(): void {
    if (!this.interfaceMounted) return;
    const deck: 牌组汇总 | undefined = this.主页快照数据.decks.find((entry: 牌组汇总): boolean => entry.id === this.选中牌组Id);
    if (deck === undefined) { appInterface.leave('deck_details'); appInterface.leave('deck_details_more'); return; }
    appInterface.observe({ surface: 'deck_details', sectionId: this.showHeaderActions ? 'wide' : 'compact',
      selectedId: deck.id, optionIds: [], optionLabels: [], busy: this.牌组选项加载中,
      values: [{ id: 'name', value: 牌组显示名(deck) }, { id: 'description', value: deck.description },
        { id: 'total', value: String(deck.totalCards) }, { id: 'new', value: String(deck.newCount) },
        { id: 'learning', value: String(deck.learningCount) }, { id: 'review', value: String(deck.reviewCount) }] });
    if (!this.显示更多) { appInterface.leave('deck_details_more'); return; }
    const items: AppInterfaceItem[] = this.moreItems();
    appInterface.observe({ surface: 'deck_details_more', sectionId: '', selectedId: deck.id,
      optionIds: items.map((item: AppInterfaceItem): string => item.id),
      optionLabels: items.map((item: AppInterfaceItem): string => interfaceItemText(this.getUIContext(), 'deck_details_more', item.id)),
      busy: this.牌组选项加载中,
      items: items.map((item: AppInterfaceItem): AppInterfaceControl => ({ id: item.id,
        titleKey: item.titleKey,
        title: interfaceItemText(this.getUIContext(), 'deck_details_more', item.id),
        enabled: item.id !== 'options' || !this.牌组选项加载中, selected: false })) });
  }

  private selectMoreItem(id: string): void {
    if (id === 'options' && this.牌组选项加载中) return;
    this.closeMore();
    if (id === 'create_child') this.创建子牌组();
    else if (id === 'options') this.打开牌组选项();
    else if (id === 'export') this.导出牌组();
  }

  private toggleMore(): void {
    this.显示更多 = !this.显示更多;
    this.moreReveal.request(this.显示更多);
  }

  private closeMore(): void {
    this.显示更多 = false;
    this.moreReveal.cancel();
  }

  @Builder
  private creationAction(label: ResourceStr, action: () => void, secondary: boolean = false) {
    Button({ type: ButtonType.Normal }) {
      Text() {
        if (secondary) {
          Span(label)
        } else {
          ThemeTextSpans(label, this.themeAccentColors, this.getUIContext())
        }
      }
      .fontSize(应用尺寸.字号_按钮)
      .fontColor(secondary ? $r('app.color.text_tertiary') : this.动作主色)
      .width('100%')
      .textAlign(TextAlign.Center)
      .maxLines(1)
      .textOverflow({ overflow: TextOverflow.Ellipsis })
    }
    .height(应用尺寸.按钮高度)
    .layoutWeight(1)
    .constraintSize({ minWidth: 0 })
    .padding({ left: 应用尺寸.间距_4, right: 应用尺寸.间距_4 })
    .backgroundColor(Color.Transparent)
    .enabled(this.选中牌组Id !== '')
    .attributeModifier(new PressFeedback())
    .stateEffect(false)
    .onClick((): void => { action(); })
  }

  @Builder
  private previewScopes() {
    DeckPreviewScopeMenu({ onSelect: (scope: DeckPreviewScope): void => { this.onPreviewScope(scope); } })
  }

  // ========================================================
  // @块ID UI-DECK-DETAIL-002
  // @名称 牌组详情面板主渲染
  //
  // @作用
  // 直接展示详情时三个操作位于名称上方；手机由顶栏菜单承接，开始学习独立固定。
  //
  // @输入
  // @Consume 主页快照数据 + 选中牌组Id（直接在 build() 内 ForEach + if 建立响应式依赖）。
  //
  // @输出
  // 宽屏详情面板视觉；通过 5 个回调上抛按钮点击。
  //
  // @业务规则
  // 第 6 次修复：完全绕过 @State/@Watch/@Builder 间接响应链，
  // 直接在 build() 中用 ForEach + if 从 @Consume snapshot 渲染。
  // ForEach 建立 @Consume 主页快照数据 响应式依赖，
  // if (deck.id === this.选中牌组Id) 建立 @Consume 选中牌组Id 依赖。
  // B12-Y2 2026-07-23：Scroll 包裹，"更多"展开后内容超出时可滚动，开始学习按钮 不被推出边界。
  //
  // @副作用
  // 无。仅上抛回调。
  // ========================================================
  build() {
    Stack() {
      Column() {
      // B12-Y2 2026-07-23：Scroll 包裹，"更多"展开后内容超出时可滚动，开始学习按钮 不被推出边界
      Scroll(this.moreReveal.scroller) {
      Column({ space: 应用尺寸.页面分组间距(this.narrowDeckLayout) }) {
        // 第 6 次修复：完全绕过 @State/@Watch/@Builder 间接响应链，
        // 直接在 build() 中用 ForEach + if 从 @Consume 主页快照数据 渲染。
        // ForEach 建立 @Consume 主页快照数据 响应式依赖，
        // if (deck.id === this.选中牌组Id) 建立 @Consume 选中牌组Id 依赖，
        // 直接用 deck.totalCards 等渲染，不经过 @State 中转。
        ForEach(this.主页快照数据.decks, (deck: 牌组汇总) => {
          if (deck.id === this.选中牌组Id) {
            // 直接展示详情时操作在名称上方；手机操作由顶栏菜单承接。
            if (this.showHeaderActions) {
              Row({ space: 应用尺寸.页面分组间距(this.narrowDeckLayout) }) {
                this.creationAction(interfaceItemText(this.getUIContext(), 'deck_details', 'add_note'), (): void => { this.添加卡片(); })
                if (this.Agent入口已启用) {
                  this.creationAction(interfaceItemText(this.getUIContext(), 'deck_details', 'agent'), (): void => { this.onCreateWithAI(); })
                }
                Row() {
                  this.creationAction(interfaceItemText(this.getUIContext(), 'deck_details', 'preview'), (): void => { this.预览(); }, true)
                }
                .layoutWeight(1)
                .constraintSize({ minWidth: 0 })
                .enabled(!this.previewBusy)
                .bindPopup(this.previewMenuOpen, {
                  builder: this.previewScopes,
                  placement: Placement.Bottom,
                  popupColor: $r('app.color.surface_card'),
                  enableArrow: true,
                  onStateChange: (event: PopupStateChangeParam): void => {
                    if (!event.isVisible) this.onPreviewMenuClose();
                  }
                })
              }
              .width('100%')
              .alignItems(VerticalAlign.Center)
            }
            Text(牌组显示名(deck))
              .fontSize(应用尺寸.字号_牌组标题)
              .fontWeight(FontWeight.Bold)
              .fontColor($r('app.color.text_primary'))
              .width('100%')
              .wordBreak(WordBreak.BREAK_ALL)
            if (deck.description !== '') {
              Text(deck.description)
                .fontSize(应用尺寸.字号_正文)
                .fontColor($r('app.color.text_secondary'))
                .width('100%')
            }
            Column({ space: 应用尺寸.间距_15 }) {
              Row() {
                Text(interfaceItemText(this.getUIContext(), 'deck_details', 'total'))
                  .fontSize(应用尺寸.字号_正文)
                  .fontColor($r('app.color.text_secondary'))
                Blank()
                Text(deck.totalCards.toString())
                  .fontSize(应用尺寸.字号_卡片标题)
                  .fontWeight(FontWeight.Bold)
                  .fontColor($r('app.color.text_primary'))
              }
              .width('100%')
              Row() {
                Text(interfaceItemText(this.getUIContext(), 'deck_details', 'new'))
                  .fontSize(应用尺寸.字号_正文)
                  .fontColor($r('app.color.text_secondary'))
                Blank()
                Text(deck.newCount.toString())
                  .fontSize(应用尺寸.字号_卡片标题)
                  .fontWeight(FontWeight.Bold)
                  .fontColor(this.新卡计数色)
              }
              .width('100%')
              Row() {
                Text(interfaceItemText(this.getUIContext(), 'deck_details', 'learning'))
                  .fontSize(应用尺寸.字号_正文)
                  .fontColor($r('app.color.text_secondary'))
                Blank()
                Text(deck.learningCount.toString())
                  .fontSize(应用尺寸.字号_卡片标题)
                  .fontWeight(FontWeight.Bold)
                  .fontColor(this.学习中计数色)
              }
              .width('100%')
              Row() {
                Text(interfaceItemText(this.getUIContext(), 'deck_details', 'review'))
                  .fontSize(应用尺寸.字号_正文)
                  .fontColor($r('app.color.text_secondary'))
                Blank()
                Text(deck.reviewCount.toString())
                  .fontSize(应用尺寸.字号_卡片标题)
                  .fontWeight(FontWeight.Bold)
                  .fontColor(this.复习中计数色)
              }
              .width('100%')
            }
            .width('100%')
            .padding(应用尺寸.卡片内边距)
            .backgroundColor($r('app.color.surface_card'))
            .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
            .borderRadius(应用尺寸.圆角_指标卡)

            DeckStudyHistoryCard({
              search: deckHistorySearch(deck.id, this.主页快照数据.decks),
              refreshToken: this.historyRefreshToken
            })

            Row() {
              DisclosureChevron()
                .rotate({ angle: this.显示更多 ? 90 : 0 })
                .animation({ duration: 150, curve: Curve.EaseOut })
              Text(interfaceItemText(this.getUIContext(), 'deck_details', 'more'))
                .fontSize(应用尺寸.字号_按钮)
                .fontColor($r('app.color.text_primary'))
                .layoutWeight(1)
                .textAlign(TextAlign.Center)
              Blank()
                .width(24)
            }
            .width('100%')
            .height(应用尺寸.按钮高度)
            .padding({ left: 应用尺寸.卡片内边距, right: 应用尺寸.卡片内边距 })
            .attributeModifier(new GlassSurface(this.glassColors))
            .borderRadius(应用尺寸.圆角_胶囊)
            .onClick((): void => {
              this.toggleMore();
            })

            if (this.显示更多) {
              Column({ space: 应用尺寸.间距_8 }) {
                ForEach(this.moreItems(), (item: AppInterfaceItem) => {
                Button(item.id === 'options' && this.牌组选项加载中 ? $r('app.string.deck_options_loading') :
                  interfaceItemText(this.getUIContext(), 'deck_details_more', item.id))
                  .width('100%')
                  .height(应用尺寸.按钮高度)
                  .fontSize(应用尺寸.字号_按钮)
                  .fontColor($r('app.color.text_primary'))
                  .attributeModifier(new GlassSurface(this.glassColors))
                  .stateEffect(false)
                  .borderRadius(应用尺寸.圆角_胶囊)
                  .onClick((): void => {
                    this.selectMoreItem(item.id);
                  })
                  .enabled(item.id !== 'options' || !this.牌组选项加载中)
                }, (item: AppInterfaceItem): string => item.id)
              }
              .width('100%')
              .onAreaChange((_oldArea: Area, newArea: Area): void => {
                this.moreReveal.revealAfterLayout(this.显示更多, Number(newArea.height));
              })
            }

            if (this.牌组选项错误 !== '') {
              Text(this.牌组选项错误)
                .fontSize(应用尺寸.字号_正文_小)
                .fontColor($r('app.color.error_text'))
                .width('100%')
                .maxLines(3)
                .textOverflow({ overflow: TextOverflow.Ellipsis })
            }

          }
        }, (deck: 牌组汇总) => `${deck.id}_${deck.totalCards}_${deck.newCount}_${deck.learningCount}_${deck.reviewCount}_${deck.displayName}`)
      }
      .alignItems(HorizontalAlign.Start)
      .width('100%')
      .padding({
        left: 应用尺寸.卡片内边距,
        right: 应用尺寸.卡片内边距,
        top: 应用尺寸.卡片内边距,
        bottom: 应用尺寸.页面底部间距(this.narrowDeckLayout)
      })
      }
      .width('100%')
      .layoutWeight(1)
      .align(Alignment.Top)
      .scrollBar(BarState.Off)
      .edgeEffect(EdgeEffect.Spring)
      .backgroundColor($r('app.color.surface_card'))
      .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
      .borderRadius(应用尺寸.圆角_卡片)
      .clip(true)
      // 操作区自己贡献唯一的区块间距，避免卡片 margin 与按钮 padding 叠加。
      .margin({ bottom: 0 })
      ForEach(this.主页快照数据.decks, (deck: 牌组汇总) => {
        if (deck.id === this.选中牌组Id) {
          Row() {
            开始学习按钮({
              开始学习回调: (): void => { this.开始学习(); }
            })
          }
          .width('100%')
          .flexShrink(0)
          .padding({
            top: 应用尺寸.操作区顶部间距(this.narrowDeckLayout),
            bottom: 应用尺寸.操作区底部间距(this.narrowDeckLayout, this.navigationBottomInset)
          })
        }
      }, (deck: 牌组汇总): string => deck.id)
      }
      .width('100%')
      .height('100%')
    }
    .width('100%')
    .height('100%')
    .padding({
      left: 应用尺寸.页面内边距_水平,
      right: 应用尺寸.页面内边距_水平,
      top: 应用尺寸.页面内容顶部间距(this.narrowDeckLayout)
    })
  }
}
