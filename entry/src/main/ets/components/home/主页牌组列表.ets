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
// 刷新中: boolean  下拉刷新指示器开关
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
// onItemCreateFilteredDeck: () => void  打开创建过滤牌组面板回调
// onRefresh: () => void  下拉刷新回调
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

import { 牌组列表项 } from '../牌组列表项';
import { 统一加载态 } from '../common/统一加载态';
import { 统一空态 } from '../common/统一空态';
import { 统一错误态 } from '../common/统一错误态';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 牌组列表数据源, 牌组汇总, 牌组色调, 主页加载状态 } from '../../model/主页模型';

@Component
export struct 主页牌组列表 {
  // 引用类型字段：保持引用同一性，不深拷贝。
  // 牌组数据源 内部维护 DataChangeListener，LazyForEach 通过它自刷新；@Prop 深拷贝会破坏监听关系。
  牌组数据源: 牌组列表数据源 = new 牌组列表数据源([]);
  // Scroller 是 ArkUI 控制器实例，引用同对象才能复用滚动位置。
  牌组列表滚动器: Scroller = new Scroller();
  // Set<string> 是 ES6 引用类型，作为普通字段传递；LazyForEach 重建 ListItem 时重新读 .has(deck.id)。
  展开的牌组ID集合: Set<string> = new Set<string>();

  @Prop 选中的牌组ID: string = '';
  @Prop 排序模式中: boolean = false;
  @Prop 加载状态: 主页加载状态 = 'loading';
  // 父组件控制 刷新中 状态：onRefresh 回调后由父组件加载完毕置 false。
  // 子组件通过 @Watch 同步到本地 @State 刷新指示器开关，供 Refresh 容器 $$ 双向绑定（任务约束不允许 @Link）。
  @Prop @Watch('同步刷新指示器') 刷新中: boolean = false;
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
  onItemEnterReorder: (deckId: string) => void = (deckId: string): void => {};
  onItemDelete: (deckId: string) => void = (deckId: string): void => {};
  onItemHide: (deckId: string) => void = (deckId: string): void => {};
  onItemDoubleTap: (deckId: string) => void = (deckId: string): void => {};
  onItemCustomStudy: (deckId: string) => void = (deckId: string): void => {};
  onItemCreateFilteredDeck: () => void = (): void => {};
  onRefresh: () => void = (): void => {};
  onRetry: () => void = (): void => {};

  aboutToAppear(): void {
    // 首次渲染时把父组件 刷新中 同步到本地指示器开关，避免 Refresh 容器初始状态错位。
    this.刷新指示器开关 = this.刷新中;
  }

  // 父组件 刷新中 变化时同步到本地 @State，让 $$ 刷新指示器开关 跟随父组件状态收起指示器。
  同步刷新指示器(): void {
    this.刷新指示器开关 = this.刷新中;
  }

  build() {
    Column({ space: 应用尺寸.间距_10 }) {
      // 排序模式的退出/完成入口在顶部工具栏（主页顶部工具栏 排序模式分支），此处不再渲染操作行。
      // 下拉刷新容器：onRefreshing 触发后调 onRefresh；
      // 父组件加载完毕置 刷新中=false → @Watch 同步 刷新指示器开关=false 收起指示器。
      Refresh({ refreshing: $$this.刷新指示器开关 }) {
        List({ scroller: this.牌组列表滚动器, space: 应用尺寸.pageSectionGap }) {
          LazyForEach(this.牌组数据源, (deck: 牌组汇总) => {
            ListItem() {
              牌组列表项({
                deck: deck,
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
                },
                onCreateFilteredDeck: (): void => {
                  this.onItemCreateFilteredDeck();
                }
              })
            }
          }, (deck: 牌组汇总) => `${deck.id}_${deck.tone}_${deck.displayName}_${deck.newCount}_${deck.learningCount}_${deck.reviewCount}_${deck.totalCards}_${deck.backgroundImage}_${this.排序模式中 ? 1 : 0}`)
          .onMove((from: number, to: number): void => {
            this.onMove(from, to);
          })

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
        .layoutWeight(1)
        .scrollBar(BarState.Auto)
        .edgeEffect(EdgeEffect.Spring)
      }
      .onRefreshing(() => {
        // 用户下拉到阈值后触发；父组件加载完毕后置 刷新中=false，@Watch 同步收起指示器。
        this.onRefresh();
      })
      .layoutWeight(1)
    }
    .width('100%')
    .layoutWeight(1)
  }
}
