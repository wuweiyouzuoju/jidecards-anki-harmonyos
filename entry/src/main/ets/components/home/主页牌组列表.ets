// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID UI-HOME-LIST-001
// @名称 主页牌组列表
//
// @作用
// 渲染主页牌组分区：标题行 + 排序模式 Bar + 下拉刷新 + LazyForEach 牌组列表 + 三态（加载/空/错）。
// 替换原 首页.ets 的 @Builder 牌组列表()。
//
// @输入
// 牌组数据源: 牌组列表数据源  LazyForEach 数据源
// 选中的牌组ID: string  当前选中牌组（高亮当前项）
// 展开的牌组ID集合: Set<string>  展开的父牌组集合
// 排序模式中: boolean  拖拽排序模式开关
// 加载状态: 主页加载状态  'loading' / 'ready' / 'empty' / 'error'
// 牌组列表滚动器: Scroller  List 滚动控制器
// 动作主色: string  LoadingProgress 颜色
// 主色按钮背景色: string  预留（与主页主色联动）
// onMove: (from: number, to: number) => void  拖拽排序回调
// onItemSelect: (deckId: string) => void  点击牌组项回调
// onItemToggle: (deckId: string) => void  展开/折叠牌组项回调
// onItemToneChange: (deckId: string, tone: 牌组色调) => void  牌组色调变更回调
// onItemCustomize: (deckId: string) => void  牌组定制回调
// onItemEnterReorder: (deckId: string) => void  进入排序模式回调
// onItemDelete: (deckId: string) => void  删除牌组回调
// onItemHide: (deckId: string) => void  隐藏牌组回调
// onItemDoubleTap: (deckId: string) => void  递归展开回调
// onItemCustomStudy: (deckId: string) => void  打开自定义学习对话框回调
// onRefresh: () => Promise<void>  下拉刷新完成信号
// onRetry: () => void  错误态重试回调
//
// @输出
// 渲染 Column(Refresh(List(LazyForEach + 三态 ListItem)))
//
// @业务规则
// LazyForEach keyItem 必须含全部可变字段（id/tone/displayName/newCount/learningCount/reviewCount/totalCards/backgroundImage + 排序模式中?1:0），
// 否则 ArkUI 认为是同一项不重建 ListItem，build() 不被调用，UI 不刷新（project_memory 教训）
// 三态 ListItem 使用 统一加载态 / 统一空态 / 统一错误态 替换散写
//
// @副作用
// 无。
// ========================================================

import { hilog } from '@kit.PerformanceAnalysisKit';
import { 牌组列表项 } from '../牌组列表项';
import { DECK_LIST_NARROW_KEY, DECK_LIST_STYLE_KEY, isDoubleColumnDeckListStyle,
  deckListOverflows, groupDeckListRows, groupedDeckListOverflows, DeckListGroup } from '../../model/DeckListAppearance';
import { 统一加载态 } from '../common/统一加载态';
import { 统一空态 } from '../common/统一空态';
import { 统一错误态 } from '../common/统一错误态';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 牌组列表数据源, 牌组汇总, 牌组色调, 主页加载状态 } from '../../model/主页模型';

interface HomeDeckGroup {
  rootId: string;
  decks: 牌组汇总[];
}

/** 展示适配器只拥有顶级分组快照；持久顺序和展开状态仍归原数据源。 */
class HomeDeckGroupSource implements IDataSource {
  private groups: HomeDeckGroup[] = [];
  private listeners: DataChangeListener[] = [];

  totalCount(): number { return this.groups.length; }
  getData(index: number): HomeDeckGroup { return this.groups[index]; }
  groupCounts(): number[] { return this.groups.map((group: HomeDeckGroup): number => group.decks.length); }

  replaceDecks(decks: 牌组汇总[]): void {
    const ranges: DeckListGroup[] = groupDeckListRows(decks.map((deck: 牌组汇总): string =>
      deck.ancestorIds.length > 0 ? deck.ancestorIds[0] : deck.id));
    this.groups = ranges.map((range: DeckListGroup): HomeDeckGroup => {
      return { rootId: range.rootId, decks: decks.slice(range.start, range.start + range.count) };
    });
    for (const listener of this.listeners) { listener.onDataReloaded(); }
  }

  registerDataChangeListener(listener: DataChangeListener): void {
    if (!this.listeners.includes(listener)) { this.listeners.push(listener); }
  }
  unregisterDataChangeListener(listener: DataChangeListener): void {
    const index: number = this.listeners.indexOf(listener);
    if (index >= 0) { this.listeners.splice(index, 1); }
  }
}

@Component
export struct 主页牌组列表 {
  @StorageProp(DECK_LIST_NARROW_KEY) @Watch('reportOverflow') private narrow: boolean = false;
  @StorageProp(DECK_LIST_STYLE_KEY) @Watch('reportOverflow') private style: string = 'single_wide';
  // 引用类型字段：保持引用同一性，不深拷贝。
  // 牌组数据源 内部维护 DataChangeListener，LazyForEach 通过它自刷新；@Prop 深拷贝会破坏监听关系。
  牌组数据源: 牌组列表数据源 = new 牌组列表数据源([]);
  // Scroller 是 ArkUI 控制器实例，引用同对象才能复用滚动位置。
  牌组列表滚动器: Scroller = new Scroller();
  // 展开状态必须响应父级替换，让现有行的 expanded 更新并播放旋转，而不是重建行。
  @Prop 展开的牌组ID集合: Set<string> = new Set<string>();

  @Prop 选中的牌组ID: string = '';
  @Prop @Watch('reportOverflow') 排序模式中: boolean = false;
  @Prop reorderBusy: boolean = false;
  @Prop @Watch('reportOverflow') 加载状态: 主页加载状态 = 'loading';
  @Prop 动作主色: string = '#2F5FD0';
  @Prop 主色按钮背景色: string = '#2F5FD0';

  @State private 刷新指示器开关: boolean = false;

  // 牌组列表项 的所有回调转调外部回调
  onMove: (from: number, to: number) => void = (from: number, to: number): void => {};
  onItemSelect: (deckId: string) => void = (deckId: string): void => {};
  onItemToggle: (deckId: string) => void = (deckId: string): void => {};
  onItemToneChange: (deckId: string, tone: 牌组色调) => void
    = (deckId: string, tone: 牌组色调): void => {};
  onItemCustomize: (deckId: string) => void = (deckId: string): void => {};
  onItemRename: (deckId: string) => void = (_deckId: string): void => {};
  onItemEnterReorder: (deckId: string) => void = (deckId: string): void => {};
  onItemDelete: (deckId: string) => void = (deckId: string): void => {};
  onItemHide: (deckId: string) => void = (deckId: string): void => {};
  onItemDoubleTap: (deckId: string) => void = (deckId: string): void => {};
  onItemCustomStudy: (deckId: string) => void = (deckId: string): void => {};
  onRefresh: () => Promise<void> = (): Promise<void> => Promise.resolve();
  onRetry: () => void = (): void => {};
  onOverflowChange: (overflow: boolean) => void = (_overflow: boolean): void => {};
  private viewportHeight: number = 0;
  private readonly groupSource: HomeDeckGroupSource = new HomeDeckGroupSource();
  private readonly overflowListener: DataChangeListener = {
    onDataReloaded: (): void => { this.refreshDeckGroups(); },
    onDataAdded: (_index: number): void => { this.refreshDeckGroups(); },
    onDataChanged: (_index: number): void => { this.refreshDeckGroups(); },
    onDataDeleted: (_index: number): void => { this.refreshDeckGroups(); },
    onDataMoved: (_from: number, _to: number): void => { this.refreshDeckGroups(); },
    onDataAdd: (_index: number): void => { this.refreshDeckGroups(); },
    onDataChange: (_index: number): void => { this.refreshDeckGroups(); },
    onDataDelete: (_index: number): void => { this.refreshDeckGroups(); },
    onDataMove: (_from: number, _to: number): void => { this.refreshDeckGroups(); },
    onDatasetChange: (_operations: DataOperation[]): void => { this.refreshDeckGroups(); }
  };

  private refreshDeckGroups(): void {
    this.groupSource.replaceDecks(this.牌组数据源.snapshotDecks());
    this.reportOverflow();
  }

  private reportOverflow(): void {
    const rowHeight: number = 应用尺寸.deckRowHeight(this.narrow, isDoubleColumnDeckListStyle(this.style));
    const gap: number = 应用尺寸.页面分组间距(this.narrow);
    const overflow: boolean = this.columnCount() === 2 ? groupedDeckListOverflows(
      this.groupSource.groupCounts(), rowHeight, gap, this.viewportHeight) : deckListOverflows(
        this.牌组数据源.totalCount(), rowHeight, gap, this.viewportHeight);
    this.onOverflowChange(this.加载状态 === 'ready' && overflow);
  }

  private columnCount(): number {
    // 排序需要每个牌组的原始索引，临时恢复单列；退出后仍保留所选样式。
    return isDoubleColumnDeckListStyle(this.style) && !this.排序模式中 && this.加载状态 === 'ready' ? 2 : 1;
  }

  aboutToAppear(): void {
    this.牌组数据源.registerDataChangeListener(this.overflowListener);
    this.refreshDeckGroups();
  }

  aboutToDisappear(): void {
    this.牌组数据源.unregisterDataChangeListener(this.overflowListener);
    this.onOverflowChange(false);
  }

  private async refreshDecks(): Promise<void> {
    if (this.排序模式中 || this.reorderBusy) return;
    this.刷新指示器开关 = true;
    try {
      await this.onRefresh();
    } finally {
      // 由本次请求直接收尾，避免父级 true→false 被同帧合并后漏掉 Watch。
      this.刷新指示器开关 = false;
    }
  }

  private deckKey(deck: 牌组汇总): string {
    return `${deck.id}_${deck.fullName}_${deck.hasChildren}_${deck.tone}_${deck.displayName}_${deck.description}_${deck.newCount}_${deck.learningCount}_${deck.reviewCount}_${deck.totalCards}_${deck.backgroundImage}`;
  }

  @Builder
  private deckItem(deck: 牌组汇总) {
    牌组列表项({
      deck: deck,
      hideStudyCounts: isDoubleColumnDeckListStyle(this.style),
      selected: deck.id === this.选中的牌组ID,
      reorderMode: this.排序模式中,
      onSelect: (deckId: string): void => {
        this.onItemSelect(deckId);
      },
      expanded: this.展开的牌组ID集合.has(deck.id),
      onToggle: (deckId: string): void => {
        this.onItemToggle(deckId);
      },
      onToneChange: (deckId: string, tone: 牌组色调): void => {
        this.onItemToneChange(deckId, tone);
      },
      onCustomizeDeck: (deckId: string): void => {
        this.onItemCustomize(deckId);
      },
      onRenameDeck: (deckId: string): void => { this.onItemRename(deckId); },
      onEnterReorder: (deckId: string): void => {
        this.onItemEnterReorder(deckId);
      },
      onDeleteDeck: (deckId: string): void => {
        this.onItemDelete(deckId);
      },
      onHideDeck: (deckId: string): void => {
        this.onItemHide(deckId);
      },
      onDoubleTap: (deckId: string): void => {
        this.onItemDoubleTap(deckId);
      },
      onCustomStudy: (deckId: string): void => {
        this.onItemCustomStudy(deckId);
      }
    })
  }

  build() {
    Column({ space: 应用尺寸.间距_10 }) {
      // 排序模式的退出/完成入口在顶部工具栏（主页顶部工具栏 排序模式分支），此处不再渲染操作行。
      // 指示器等待刷新 Promise 落定，成功、失败或跳过都收起。
      Refresh({ refreshing: $$this.刷新指示器开关 }) {
        List({ scroller: this.牌组列表滚动器, space: 应用尺寸.页面分组间距(this.narrow) }) {
          if (this.columnCount() === 2) {
            LazyForEach(this.groupSource, (group: HomeDeckGroup) => {
              ListItem() {
                Column({ space: 应用尺寸.页面分组间距(this.narrow) }) {
                  ForEach(group.decks, (deck: 牌组汇总) => {
                    this.deckItem(deck)
                  }, (deck: 牌组汇总): string => this.deckKey(deck))
                }
                .width('100%')
                .alignItems(HorizontalAlign.Start)
              }
            }, (group: HomeDeckGroup): string => group.rootId + ':' +
              group.decks.map((deck: 牌组汇总): string => this.deckKey(deck)).join('|'))
          } else {
            LazyForEach(this.牌组数据源, (deck: 牌组汇总) => {
              ListItem() {
                this.deckItem(deck)
              }
            }, (deck: 牌组汇总) => `${deck.id}_${deck.fullName}_${deck.hasChildren}_${deck.tone}_${deck.displayName}_${deck.newCount}_${deck.learningCount}_${deck.reviewCount}_${deck.totalCards}_${deck.backgroundImage}_${this.排序模式中 ? 1 : 0}`)
            .onMove(this.排序模式中 && !this.reorderBusy ? this.onMove : undefined)
          }

          // 三态 ListItem：加载 / 错误 / 空。统一使用 共用积木 组件，
          // 外层 Row + padding 控制高度（统一三态积木自身 height 100% 会撑满，padding 吸收垂直空间）。
          if (this.加载状态 === 'loading') {
            ListItem() {
              Row() {
                统一加载态({
                  尺寸: 应用尺寸.加载指示器尺寸
                })
              }
              .width('100%')
              .justifyContent(FlexAlign.Center)
              .padding({ top: 应用尺寸.空态垂直内边距, bottom: 应用尺寸.空态垂直内边距 })
            }
          }
          if (this.加载状态 === 'error') {
            ListItem() {
              Row() {
                统一错误态({
                  文案: $r('app.string.home_load_error'),
                  重试文案: $r('app.string.home_retry'),
                  onRetry: (): void => {
                    this.onRetry();
                  }
                })
              }
              .width('100%')
              .justifyContent(FlexAlign.Center)
              .padding({ top: 应用尺寸.空态垂直内边距, bottom: 应用尺寸.空态垂直内边距 })
            }
          }
          if (this.加载状态 === 'empty') {
            ListItem() {
              Row() {
                统一空态({
                  标题: $r('app.string.empty_decks_title'),
                  副标题: $r('app.string.empty_decks_hint')
                })
              }
              .width('100%')
              .justifyContent(FlexAlign.Center)
              .padding({ top: 应用尺寸.空态垂直内边距, bottom: 应用尺寸.空态垂直内边距 })
            }
          }
        }
        .width('100%')
        .lanes(this.columnCount(), 应用尺寸.页面分组间距(this.narrow))
        .layoutWeight(1)
        .scrollBar(BarState.Auto)
        .edgeEffect(EdgeEffect.Spring)
        .onAreaChange((_old: Area, area: Area): void => {
          this.viewportHeight = Number(area.height);
          this.reportOverflow();
        })
      }
      .onRefreshing(() => {
        this.refreshDecks().catch((error: Error): void => {
          hilog.warn(0x4342, 'jidecards', `首页: 下拉刷新失败 ${error}`);
        });
      })
      .layoutWeight(1)
    }
    .width('100%')
    .layoutWeight(1)
  }
}
