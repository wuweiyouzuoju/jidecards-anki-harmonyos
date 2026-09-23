// SPDX-License-Identifier-Identifier: AGPL-3.0-or-later
import type { BrowserDisplayRow as 浏览行数据 } from '../../model/BrowserSearchSession';

// ========================================================
// @块ID UI-BROWSER-TABLE-001
// @名称 卡片表格
//
// @作用
// 浏览页结果列表组件。从 浏览页.结果列表区() 提取为独立组件：
// 扁平列表展示卡片/笔记行（对标 Anki 桌面端 Browser 列表），
// 点击行触发 onRowClick，长按行进入多选模式并显示复选框，
// 空结果显示统一空态。滚动到底触发懒加载。
//
// @输入
// 行列表：浏览行数据[]（来自 SearchMessages.BrowserRow）
// 结果总数：搜索结果总数（可能 > 行列表长度，因懒加载；为 0 显示空态）
// 已加载行数：当前已加载的行数（用于判断是否还有更多）
// onRowClick：非多选模式下点击行回调
// onLongPress：长按行进入多选模式时回调
// onLoadMore：滚动到底部时触发，宿主应加载下一批行并在请求完成后 resolve
//
// @输出
// 渲染扁平列表 / 空态
//
// @业务规则
// - 结果总数 === 0 时显示 统一空态（标题 browser_empty）
// - 非多选模式：点击行 → onRowClick(id)
// - 多选模式：长按行进入并选中该行；点击行切换选中（不触发 onRowClick）
// - 选中计数和退出入口由浏览页顶栏统一渲染，本组件不额外占用列表空间
// - 选择状态属于页面；列表只根据 Prop 展示并上抛新的选择快照
// - 滚动到底部且 已加载行数 < 结果总数 时触发 onLoadMore
//
// @副作用
// 无。
// ========================================================

import { 应用尺寸 } from '../../utils/应用尺寸';
import { 统一空态 } from '../common/统一空态';
import { BrowserRowColor } from '../../proto/messages/SearchMessages';
import type { BrowserCell } from '../../proto/messages/SearchMessages';

/**
 * List data source for browser rows.  The page owns the query and mutation
 * state; this object owns only the visible row snapshot and its change
 * notifications, which keeps list virtualization out of the page component.
 */
export class 浏览行数据源 implements IDataSource {
  private rows: 浏览行数据[] = [];
  private readonly listeners: DataChangeListener[] = [];

  totalCount(): number { return this.rows.length; }
  getData(index: number): 浏览行数据 { return this.rows[index]; }
  keyFor(index: number): string {
    return this.keyForRow(this.rows[index]);
  }
  keyForRow(row: 浏览行数据): string {
    // ID 在一次搜索结果中唯一；显示颜色/挂起状态变化应更新同一行，而不是重建节点。
    return `${row.id}`;
  }
  replaceAll(rows: 浏览行数据[]): void {
    this.rows = rows.slice();
    for (const listener of this.listeners) listener.onDataReloaded();
  }
  registerDataChangeListener(listener: DataChangeListener): void {
    if (this.listeners.indexOf(listener) < 0) this.listeners.push(listener);
  }
  unregisterDataChangeListener(listener: DataChangeListener): void {
    const index: number = this.listeners.indexOf(listener);
    if (index >= 0) this.listeners.splice(index, 1);
  }
}

/** 单行展示数据：卡片/笔记 ID + 后端返回的单元格 + 行颜色提示（标志/挂起等） */
export type { BrowserDisplayRow as 浏览行数据 } from '../../model/BrowserSearchSession';

@Component
export struct 卡片表格 {
  @Prop @Watch('同步行数据源') 行列表: 浏览行数据[] = [];
  @Prop 结果总数: number = 0;
  @Prop 已加载行数: number = 0;
  @Prop subtitleIndex: number = 1;
  @Prop notesMode: boolean = false;
  /** 从 Agent 改卡入口进入时，首次挂载即显示多选框。 */
  @Prop 多选模式: boolean = false;
  @Prop 选中IDs: number[] = [];
  onRowClick: (id: number) => void = (): void => {};
  onLongPress: () => void = (): void => {};
  onLoadMore: () => Promise<void> = async (): Promise<void> => {};
  /** T11 卡片信息：非多选模式下点击行右侧 info 按钮触发 */
  onInfoClick: (id: number) => void = (): void => {};
  /** T8 批量操作栏：选中ID集合变化时上抛（数组快照），宿主据此显示/隐藏批量操作栏 */
  onSelectionChange: (选中IDs: number[]) => void = (): void => {};
  /** T8 批量操作栏：多选模式切换时上抛（true=进入多选，false=退出） */
  onMultiSelectChange: (多选: boolean) => void = (): void => {};
  // 手势导航条高度（列表滚到底时最后一行需完整滚出导航条区域）
  @StorageProp('导航条高度') private 导航条高度: number = 0;

  @State private 加载中: boolean = false;
  private readonly 行数据源: 浏览行数据源 = new 浏览行数据源();

  aboutToAppear(): void {
    this.同步行数据源();

  }

  private 同步行数据源(): void {
    this.行数据源.replaceAll(this.行列表);
  }



  /** 取行第一列文本作为主文案（Question 列，空则回退 #id）。 */
  private 取行主文案(行: 浏览行数据): string {
    if (行.cells.length === 0) {
      return `#${行.id}`;
    }
    return 行.cells[0].text || `#${行.id}`;
  }

  /** 按选择读取副标题；牌组仅展示末级名称，完整路径仍保留在详情。 */
  private 取行副文案(行: 浏览行数据): string {
    const text: string = 行.cells[this.subtitleIndex]?.text ?? '';
    if (this.subtitleIndex !== 1) return text;
    const deck: string = text.split('::').pop() ?? text;
    const due: string = this.notesMode ? '' : (行.cells[2]?.text ?? '');
    return due === '' ? deck : `${deck} · ${due}`;
  }

  /** 行标志色：根据 BrowserRowColor 返回色条颜色，无标志返回透明。 */
  private 取行标志色(行: 浏览行数据): string {
    switch (行.color) {
      case BrowserRowColor.COLOR_FLAG_RED: return '#D92D20';
      case BrowserRowColor.COLOR_FLAG_ORANGE: return '#D97A1C';
      case BrowserRowColor.COLOR_FLAG_GREEN: return '#238463';
      case BrowserRowColor.COLOR_FLAG_BLUE: return '#2F5FD0';
      case BrowserRowColor.COLOR_FLAG_PINK: return '#D9408F';
      case BrowserRowColor.COLOR_FLAG_TURQUOISE: return '#1CA7A0';
      case BrowserRowColor.COLOR_FLAG_PURPLE: return '#7B2CBF';
      default: return 'transparent';
    }
  }

  /** 暂停状态独立于旗标颜色，用于弱化行背景。 */
  private 是否挂起行(行: 浏览行数据): boolean {
    return 行.hasSuspendedCards;
  }

  /** 点击行：多选模式下切换选中，否则触发 onRowClick。 */
  private 处理行点击(id: number): void {
    if (this.多选模式) {
      this.设置选中(id, this.选中IDs.indexOf(id) < 0);
    } else {
      this.onRowClick(id);
    }
  }

  /** 长按行：进入多选模式并选中当前行，通知宿主。 */
  private 处理长按(id: number): void {
    if (this.多选模式) {
      return;
    }
    this.onMultiSelectChange(true);
    this.onSelectionChange([id]);
    this.onLongPress();
  }

  /** 提交某行选择意图，页面决定并回传最新快照。 */
  private 设置选中(id: number, 选中: boolean): void {
    const 新集合: Set<number> = new Set<number>(this.选中IDs);
    if (选中) {
      新集合.add(id);
    } else {
      新集合.delete(id);
    }
    this.onSelectionChange(Array.from(新集合));
  }

  build() {
    Column() {
      if (this.结果总数 === 0) {
        统一空态({
          标题: $r('app.string.browser_empty')
        })
      } else {
        List({ space: 应用尺寸.pageSectionGap }) {
          LazyForEach(this.行数据源, (行: 浏览行数据) => {
            ListItem() {
              Row({ space: 应用尺寸.间距_8 }) {
                if (this.多选模式) {
                  Checkbox()
                    .select(this.选中IDs.indexOf(行.id) >= 0)
                    .selectedColor($r('app.color.action_primary'))
                    .width(20)
                    .height(20)
                    .onChange((value: boolean): void => {
                      this.设置选中(行.id, value);
                    })
                }

                Column({ space: 应用尺寸.间距_2 }) {
                  Text(this.取行主文案(行))
                    .fontSize(应用尺寸.字号_正文)
                    .fontColor(this.是否挂起行(行) ? $r('app.color.text_secondary') : $r('app.color.text_primary'))
                    .maxLines(2)
                    .textOverflow({ overflow: TextOverflow.Ellipsis })
                    .textAlign(TextAlign.Start)
                    .width('100%')

                  if (this.取行副文案(行) !== '') {
                    Text(this.取行副文案(行))
                      .fontSize(应用尺寸.字号_正文_小)
                      .fontColor($r('app.color.text_secondary'))
                      .maxLines(1)
                      .textOverflow({ overflow: TextOverflow.Ellipsis })
                      .textAlign(TextAlign.Start)
                      .width('100%')
                  }
                  if (行.hasSuspendedCards) {
                    Text(this.notesMode ? $r('app.string.browser_contains_suspended') :
                      $r('app.string.stats_cards_suspended'))
                      .fontSize(应用尺寸.字号_正文_小)
                      .fontColor($r('app.color.text_primary'))
                      .padding({ left: 6, right: 6, top: 2, bottom: 2 })
                      .backgroundColor($r('app.color.surface_card'))
                      .border({ width: 0.5, color: $r('app.color.border_subtle') })
                      .borderRadius(4)
                  }
                }
                .alignItems(HorizontalAlign.Start)
                .layoutWeight(1)

                // T11 卡片信息按钮：非多选模式下显示，点击触发 onInfoClick
                // hitTestBehavior(Block) 阻止点击事件冒泡到行 onClick（ClickEvent 无 stopPropagation）
                if (!this.多选模式) {
                  Text('ⓘ')
                    .accessibilityText($r('app.string.browser_card_info'))
                    .fontSize(应用尺寸.字号_正文)
                    .fontColor($r('app.color.text_secondary'))
                    .padding({
                      left: 应用尺寸.间距_8,
                      right: 应用尺寸.间距_4,
                      top: 应用尺寸.间距_4,
                      bottom: 应用尺寸.间距_4
                    })
                    .hitTestBehavior(HitTestMode.Block)
                    .onClick((): void => {
                      this.onInfoClick(行.id);
                    })
                }
              }
              .width('100%')
              .padding({
                left: 应用尺寸.卡片内边距,
                right: 应用尺寸.卡片内边距,
                top: 应用尺寸.间距_12,
                bottom: 应用尺寸.间距_12
              })
              .backgroundColor($r('app.color.surface_card'))
              // 有标志时加 4px 左边框作色条（不增加子元素，不影响布局高度）
              .border(this.取行标志色(行) !== 'transparent' ? {
                width: { left: 4 },
                color: { left: this.取行标志色(行) }
              } : { width: 0 })
              .borderRadius(应用尺寸.圆角_指标卡)
              .onClick((): void => this.处理行点击(行.id))
              .gesture(
                LongPressGesture()
                  .onAction((): void => this.处理长按(行.id))
              )
            }
          }, (行: 浏览行数据): string => this.行数据源.keyForRow(行))
        }
        .width('100%')
        .padding({ left: 应用尺寸.页面内边距_水平, right: 应用尺寸.页面内边距_水平 })
        .layoutWeight(1)
        .edgeEffect(EdgeEffect.Spring)
        // 内容末尾偏移导航条高度：滚到底时最后一行完整可见、可点（AppGallery 导航栏适配要求）
        .contentStartOffset(应用尺寸.间距_8)
        .contentEndOffset(this.导航条高度 + 应用尺寸.pageSectionGap)
        .onReachEnd((): void => {
          if (!this.加载中 && this.已加载行数 < this.结果总数) {
            this.加载中 = true;
            this.加载下一页();
          }
        })
      }
    }
    .width('100%')
    .layoutWeight(1)
  }

  /** 由请求本身结束加载态，避免固定延时造成重复请求或过早解除锁定。 */
  private async 加载下一页(): Promise<void> {
    try {
      await this.onLoadMore();
    } finally {
      this.加载中 = false;
    }
  }
}
