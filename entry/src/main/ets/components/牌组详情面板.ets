import { MODULE_OPACITY_KEY, MaterialOpacity, DEFAULT_MODULE_OPACITY } from '../model/SurfaceMaterial';
import { rememberPopupTrigger } from '../utils/PopupTrigger';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { AppInterfaceControl } from '../model/AppInterface';
import { SurfaceBorder } from '../utils/SurfaceBorder';
import { HomeActionAnchor } from '../model/HomeHeaderLayout';
import { appInterface } from '../backend/AppInterfaceService';
import { interfaceItemText } from '../utils/AppInterfaceText';
import { IconActionButton } from './common/IconActionButton';
import { AI_AGENT_CHANNELS_APP_STORAGE_KEY } from '../model/ReleaseFeatures';
import { DeckStudyHistoryCard } from './DeckStudyHistoryCard';
import { deckHistorySearch } from '../model/DeckStudyHistory';
import { PAGE_COMPACT_LAYOUT_KEY } from '../model/AppLayoutState';

import { 牌组汇总, 主页快照, 牌组显示名 } from '../model/主页模型';
import { 应用尺寸 } from '../utils/应用尺寸';
import { 开始学习按钮 } from './开始学习按钮';
import { 颜色键 } from '../model/颜色主题';
import { DisclosureChevron } from './common/DisclosureChevron';
import { PressFeedback } from '../utils/PressFeedback';
import { namedResourceText } from '../utils/UiFeedback';
import { deckDetailShortcuts, DeckDetailShortcut } from '../model/DeckDetailShortcut';
import { SeriesVisual } from '../utils/SeriesVisual';

// ========================================================
// @块ID UI-DECK-DETAIL-001
// @名称 牌组详情面板 组件主体字段
//
// @作用
// 宽屏详情 pane：选中卡组的名称、描述、三类计数、牌组选项入口与开始学习按钮。
// 牌组设置由首页推入独立 DeckOptionsPage；
// 更多通过宿主复用首页牌组操作弹窗。
//
// @输入
// @Prop 是否深色 / 牌组选项加载中 / 牌组选项错误；
// @Consume('selectedDeckId') / @Consume('snapshot')（@Provide 来自 Index.ets，key 字符串保留以维持链路）；
// 父组件持有学习、制卡、预览、JIDE 与共享牌组菜单回调。
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
// 图标按钮按压由公共 IconActionButton 处理，不写入面板状态。
//
// @副作用
// 无。仅渲染与上抛回调。
//
// @注意
// @Consume key 'selectedDeckId' / 'snapshot' 是与 Index.ets @Provide 配对的协议字段，禁止修改。
// ========================================================
@Component
export struct 牌组详情面板 {
  @StorageProp('surface_material') private surfaceMaterial: string = 'flat';
  @StorageProp(MODULE_OPACITY_KEY) private moduleOpacity: MaterialOpacity = DEFAULT_MODULE_OPACITY;
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @StorageProp(PAGE_COMPACT_LAYOUT_KEY) private narrowDeckLayout: boolean = false;
  @StorageLink(AI_AGENT_CHANNELS_APP_STORAGE_KEY) @Watch('publishInterface') private Agent入口已启用: boolean = false;
  @Prop historyRefreshToken: number = 0;
  @Prop @Watch('publishInterface') showHeaderActions: boolean = true;
  @Prop @Watch('publishInterface') headerActionHeight: number = 应用尺寸.按钮高度;
  @Prop previewBusy: boolean = false;
  onPreviewHold: () => void = (): void => {};
  onPreviewCancel: () => void = (): void => {};
  @Prop @Watch('publishInterface') filteredBusy: boolean = false;
  onActionAnchorChange: (anchor: HomeActionAnchor) => void = (_anchor: HomeActionAnchor): void => {};
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
  onMore: () => void = (): void => {};
  private shortcutAreas: Map<string, Area> = new Map<string, Area>();
  private activateShortcut(id: string): void {
    const area: Area | undefined = this.shortcutAreas.get(id);
    if (area !== undefined) rememberPopupTrigger(area);
    this.onShortcut(id);
  }
  onShortcut: (id: string) => void = (_id: string): void => {};
  预览: () => void = (): void => {
  };

  private interfaceMounted: boolean = false;
  @StorageProp(颜色键.新卡计数色) private 新卡计数色: string = '#3974D9';
  @StorageProp(颜色键.学习中计数色) private 学习中计数色: string = '#B56A22';
  @StorageProp(颜色键.复习中计数色) private 复习中计数色: string = '#7056C8';
  @StorageProp(颜色键.动作主色) private 动作主色: string = '#2F5FD0';
  @StorageProp(颜色键.页面底色微染) private 页面底色微染: string = '';

  aboutToAppear(): void { this.interfaceMounted = true; this.publishInterface(); }

  aboutToDisappear(): void {
    this.interfaceMounted = false;
    appInterface.leave('deck_details');
  }

  private publishInterface(): void {
    if (!this.interfaceMounted) return;
    const deck: 牌组汇总 | undefined = this.主页快照数据.decks.find((entry: 牌组汇总): boolean => entry.id === this.选中牌组Id);
    if (deck === undefined) { appInterface.leave('deck_details'); return; }
    appInterface.observe({ surface: 'deck_details', sectionId: this.showHeaderActions ? 'wide' : 'compact',
      selectedId: deck.id, optionIds: [], optionLabels: [], busy: this.牌组选项加载中,
      items: deckDetailShortcuts(deck.filtered === true).map((item: DeckDetailShortcut): AppInterfaceControl => ({ id: item.id,
        titleKey: item.titleKey, title: namedResourceText(this.getUIContext(), item.titleKey) + ' · ' + namedResourceText(this.getUIContext(), item.instructionsKey),
        enabled: true, selected: false, opens: item.opens })),
      values: [{ id: 'name', value: 牌组显示名(deck) }, { id: 'core_name', value: deck.fullName }, { id: 'filtered', value: String(deck.filtered === true) },
        { id: 'header_actions_position', value: this.showHeaderActions ?
          (this.headerActionHeight > 0 ? 'above_card' : 'hidden') : 'toolbar_right' },
        { id: 'header_actions_style', value: 'icons' },
        { id: 'header_actions_layout', value: this.showHeaderActions ? (this.headerActionHeight > 0 ?
          (this.Agent入口已启用 ? 'add_note:left,agent:after_add_note,preview:right_group,more:right' : 'add_note:left,preview:right_group,more:right') : 'hidden') :
          (this.Agent入口已启用 ? 'add_note:right_group,agent:right_group,preview:right_group,more:right_group' : 'add_note:right_group,preview:right_group,more:right_group') },
        { id: 'local_display_name', value: deck.displayName }, { id: 'description', value: deck.description },
        { id: 'total', value: String(deck.totalCards) }, { id: 'new', value: String(deck.newCount) },
        { id: 'learning', value: String(deck.learningCount) }, { id: 'review', value: String(deck.reviewCount) }] });
  }

  @Builder
  private countShortcut(id: string, count: number, tint: ResourceColor, filtered: boolean) {
    Button({ type: ButtonType.Normal }) {
      Row({ space: 8 }) {
        Column({ space: 4 }) {
          Text(interfaceItemText(this.getUIContext(), 'deck_details', id, this.uiLanguage))
            .fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_secondary')).width('100%')
        }.layoutWeight(1).alignItems(HorizontalAlign.Start)
        Text(count.toString()).fontSize(应用尺寸.字号_卡片标题).fontWeight(FontWeight.Bold)
          .fontColor(tint).flexShrink(0)
        DisclosureChevron({ tint: $r('app.color.text_tertiary') }).flexShrink(0)
      }.width('100%').constraintSize({ minHeight: 44 })
    }.width('100%').padding({ top: 4, bottom: 4 }).backgroundColor(Color.Transparent)
      .attributeModifier(new PressFeedback(1, 0.4, true)).stateEffect(false)
      .onAreaChange((_old: Area, area: Area): void => { this.shortcutAreas.set(id, area); })
      .onClick((): void => { this.activateShortcut(id); })
  }

  @Builder
  private creationAction(source: ResourceStr, label: ResourceStr, action: () => void,
    isInteractive: boolean = true, previewMenu: boolean = false) {
    IconActionButton({ toolbarStyle: true, source: source, label: label,
      controlSize: this.headerActionHeight, controlWidth: this.headerActionHeight,
      controlGlyphSize: Math.min(18, this.headerActionHeight * 0.46),
      isInteractive: this.选中牌组Id !== '' && isInteractive, onAction: action,
      slideMenu: previewMenu, onHoldOpen: this.onPreviewHold, onHoldCancel: this.onPreviewCancel })
  }

  @Builder
  private headerActions() {
    // 制卡和 JIDE 共用左侧工具组，预览与更多位于右侧，更多贴齐右缘。
    Row() {
      ForEach(this.主页快照数据.decks, (deck: 牌组汇总) => {
        if (deck.id === this.选中牌组Id) {
          Row({ space: 应用尺寸.页面分组间距(this.narrowDeckLayout) }) {
            this.creationAction($r('app.media.ic_study_edit'),
              interfaceItemText(this.getUIContext(), 'deck_details', 'add_note', this.uiLanguage), (): void => { this.添加卡片(); })
            if (this.Agent入口已启用) {
              this.creationAction($r('app.media.ic_study_agent'),
                interfaceItemText(this.getUIContext(), 'deck_details', 'agent', this.uiLanguage), (): void => { this.onCreateWithAI(); })
            }
          }
          Blank()
          Row({ space: 应用尺寸.页面分组间距(this.narrowDeckLayout) }) {
          this.creationAction($r('app.media.ic_common_preview'),
            interfaceItemText(this.getUIContext(), 'deck_details', 'preview', this.uiLanguage),
            (): void => { this.预览(); }, !this.previewBusy, true)
          this.creationAction($r('app.media.ic_home_more'),
            interfaceItemText(this.getUIContext(), 'deck_details', 'more', this.uiLanguage), (): void => { this.onMore(); })
          }
        }
      }, (deck: 牌组汇总): string => deck.id)
    }
    .width('100%')
    .height(this.headerActionHeight)
    .alignItems(VerticalAlign.Center)
    .flexShrink(0)
    .margin({ bottom: 应用尺寸.页面内容顶部间距(this.narrowDeckLayout) })
    .onAreaChange((_old: Area, area: Area): void => {
      this.onActionAnchorChange({ left: Number(area.globalPosition.x),
        top: Number(area.globalPosition.y) + Number(area.height) + 应用尺寸.页面内容顶部间距(this.narrowDeckLayout),
        width: Number(area.width) });
    })
  }

  // ========================================================
  // @块ID UI-DECK-DETAIL-002
  // @名称 牌组详情面板主渲染
  //
  // @作用
  // 宽屏操作位于名称上方，手机操作在顶栏右侧直接展示；开始学习独立固定。
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
  // 详情内容独立滚动，开始学习按钮固定在底部。
  //
  // @副作用
  // 无。仅上抛回调。
  // ========================================================

  build() {
    Stack() {
      Column() {
      if (this.showHeaderActions && this.headerActionHeight > 0) { this.headerActions() }
      // 详情内容独立滚动，开始学习按钮固定在底部。
      Scroll() {
      Column({ space: 应用尺寸.页面分组间距(this.narrowDeckLayout) }) {
        // 第 6 次修复：完全绕过 @State/@Watch/@Builder 间接响应链，
        // 直接在 build() 中用 ForEach + if 从 @Consume 主页快照数据 渲染。
        // ForEach 建立 @Consume 主页快照数据 响应式依赖，
        // if (deck.id === this.选中牌组Id) 建立 @Consume 选中牌组Id 依赖，
        // 直接用 deck.totalCards 等渲染，不经过 @State 中转。
        ForEach(this.主页快照数据.decks, (deck: 牌组汇总) => {
          if (deck.id === this.选中牌组Id) {
            Button({ type: ButtonType.Normal }) {
              Row({ space: 8 }) {
                Column({ space: 4 }) {
                  Text(牌组显示名(deck, this.uiLanguage))
                    .fontSize(应用尺寸.字号_牌组标题).fontWeight(FontWeight.Bold)
                    .fontColor($r('app.color.text_primary')).width('100%').wordBreak(WordBreak.BREAK_ALL)
                }.layoutWeight(1).alignItems(HorizontalAlign.Start)
                DisclosureChevron({ tint: $r('app.color.text_tertiary') }).flexShrink(0)
              }.width('100%')
            }.width('100%').padding(应用尺寸.卡片内边距)
              .attributeModifier(SeriesVisual.clearSurface(this.surfaceMaterial, this.是否深色,
                this.动作主色, this.页面底色微染, 应用尺寸.圆角_卡片, this.moduleOpacity))
              .attributeModifier(new PressFeedback(1, 0.4, true)).stateEffect(false)
              .onAreaChange((_old: Area, area: Area): void => { this.shortcutAreas.set('name', area); })
              .onClick((): void => { this.activateShortcut('name'); })
            if (deck.description !== '') {
              Text(deck.description)
                .fontSize(应用尺寸.字号_正文)
                .fontColor($r('app.color.text_secondary'))
                .width('100%')
            }
            Column({ space: 应用尺寸.间距_15 }) {
              this.countShortcut('total', deck.totalCards, $r('app.color.text_primary'), deck.filtered === true)
              this.countShortcut('new', deck.newCount, this.新卡计数色, deck.filtered === true)
              this.countShortcut('learning', deck.learningCount, this.学习中计数色, deck.filtered === true)
              this.countShortcut('review', deck.reviewCount, this.复习中计数色, deck.filtered === true)
            }
            .width('100%')
            .padding(应用尺寸.卡片内边距)
            .border(SurfaceBorder.options())
            .borderRadius(应用尺寸.圆角_指标卡)
            .attributeModifier(SeriesVisual.clearSurface(this.surfaceMaterial, this.是否深色, this.动作主色, this.页面底色微染, 应用尺寸.圆角_卡片, this.moduleOpacity))

            DeckStudyHistoryCard({
              search: deckHistorySearch(deck.id, this.主页快照数据.decks),
              refreshToken: this.historyRefreshToken
            })

            if (this.牌组选项错误 !== '') {
              Text(this.牌组选项错误)
                .fontSize(应用尺寸.字号_正文_小)
                .fontColor($r('app.color.error_text'))
                .width('100%')
                .maxLines(3)
                .textOverflow({ overflow: TextOverflow.Ellipsis })
            }

          }
        }, (deck: 牌组汇总) => `${deck.id}_${deck.totalCards}_${deck.newCount}_${deck.learningCount}_${deck.reviewCount}_${deck.displayName}_${deck.fullName}_${deck.name}_${deck.description}_${deck.filtered}`)
      }
      .alignItems(HorizontalAlign.Start)
        .width('100%')
      .padding({
        left: 0,
        right: 0,
        top: 0,
        bottom: 应用尺寸.页面底部间距(this.narrowDeckLayout)
      })
      }
      .width('100%')
      .layoutWeight(1)
      .align(Alignment.Top)
      .scrollBar(BarState.Off)
      .edgeEffect(EdgeEffect.Spring)
      // 滚动视口不绘制整栏底色，独立内容卡与左侧模块共用同一材质。
      .backgroundColor(Color.Transparent)
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
      top: this.showHeaderActions && this.headerActionHeight > 0 ? 0 : 应用尺寸.页面内容顶部间距(this.narrowDeckLayout)
    })
  }
}
