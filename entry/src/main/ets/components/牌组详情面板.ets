// SPDX-License-Identifier: AGPL-3.0-or-later
import { GlassSurface } from '../utils/GlassSurface';
import { GLASS_COLORS_KEY, GLASS_HIGHLIGHT_COLORS } from '../model/ThemeCatalog';
import { 按下态按钮 } from './common/按下态按钮';
import { DeckStudyHistoryCard } from './DeckStudyHistoryCard';
import { deckHistorySearch } from '../model/DeckStudyHistory';

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
// 按下按钮编号：0=无，2=更多，3=创建子牌组，4=牌组选项，5=导出。
//
// @副作用
// 无。仅渲染与上抛回调。
//
// @注意
// @Consume key 'selectedDeckId' / 'snapshot' 是与 Index.ets @Provide 配对的协议字段，禁止修改。
// ========================================================
@Component
export struct 牌组详情面板 {
  @StorageProp(GLASS_COLORS_KEY) private glassColors: string[] = GLASS_HIGHLIGHT_COLORS;
  @Prop showAddCard: boolean = true;
  @Prop historyRefreshToken: number = 0;
  @StorageProp('导航条高度') private navigationBottomInset: number = 0;
  @Prop 是否深色: boolean = false;
  // 注：@Consume key 字符串 'selectedDeckId' / 'snapshot' 与 Index.ets 的 @Provide 配对，保留不动。
  @Consume('selectedDeckId') 选中牌组Id: string;
  @Consume('snapshot') 主页快照数据: 主页快照;
  @Prop 牌组选项加载中: boolean = false;
  @Prop 牌组选项错误: string = '';
  开始学习: () => void = (): void => {
  };
  添加卡片: () => void = (): void => {
  };
  创建子牌组: () => void = (): void => {
  };
  导出牌组: () => void = (): void => {
  };
  打开牌组选项: () => void = (): void => {
  };
  预览: () => void = (): void => {
  };

  @State private 显示更多: boolean = false;
  private detailScroller: Scroller = new Scroller();
  private scrollToMorePending: boolean = false;
  @StorageProp(颜色键.新卡计数色) private 新卡计数色: string = '#3974D9';
  @StorageProp(颜色键.学习中计数色) private 学习中计数色: string = '#B56A22';
  @StorageProp(颜色键.复习中计数色) private 复习中计数色: string = '#7056C8';
  @StorageProp(颜色键.动作主色) private 动作主色: string = '#2F5FD0';
  // 更多及其子按钮共用按下状态，添加卡片使用共用工具栏按钮。
  @State private 按下按钮编号: number = 0;

  // ========================================================
  // @块ID UI-DECK-DETAIL-002
  // @名称 牌组详情面板主渲染
  //
  // @作用
  // 添加卡片位于右上角；计数卡和更多可滚动，开始学习固定在面板底部。
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
      Scroll(this.detailScroller) {
      Column({ space: 应用尺寸.pageSectionGap }) {
        Row() {
          Text($r('app.string.selected_deck'))
            .fontSize(应用尺寸.字号_正文_中)
            .fontColor($r('app.color.text_tertiary'))
            .layoutWeight(1)
          Text($r('app.string.deck_preview'))
            .fontSize(应用尺寸.字号_正文_中)
            .fontColor($r('app.color.text_tertiary'))
            .padding({
              left: 应用尺寸.间距_8,
              right: this.showAddCard ? 应用尺寸.间距_12 : 0,
              top: 应用尺寸.间距_8,
              bottom: 应用尺寸.间距_8
            })
            .onClick((): void => { this.预览(); })
          if (this.showAddCard) {
            按下态按钮({
              文案: $r('app.string.deck_add_card'),
              字色: this.动作主色,
              themeText: true,
              是否启用: this.选中牌组Id !== '',
              点击回调: (): void => { this.添加卡片(); }
            })
          }
        }
        .width('100%')
        // 第 6 次修复：完全绕过 @State/@Watch/@Builder 间接响应链，
        // 直接在 build() 中用 ForEach + if 从 @Consume 主页快照数据 渲染。
        // ForEach 建立 @Consume 主页快照数据 响应式依赖，
        // if (deck.id === this.选中牌组Id) 建立 @Consume 选中牌组Id 依赖，
        // 直接用 deck.totalCards 等渲染，不经过 @State 中转。
        ForEach(this.主页快照数据.decks, (deck: 牌组汇总) => {
          if (deck.id === this.选中牌组Id) {
            Text(牌组显示名(deck))
              .fontSize(应用尺寸.字号_牌组标题)
              .fontWeight(FontWeight.Bold)
              .fontColor($r('app.color.text_primary'))
              .width('100%')
            Text(deck.description)
              .fontSize(应用尺寸.字号_正文)
              .fontColor($r('app.color.text_secondary'))
              .width('100%')
            Column({ space: 应用尺寸.间距_15 }) {
              Row() {
                Text($r('app.string.deck_total_cards'))
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
                Text($r('app.string.new_cards'))
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
                Text($r('app.string.learning_cards'))
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
                Text($r('app.string.review_cards'))
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
              Text('▼')
                .fontSize(应用尺寸.字号_正文)
                .fontColor($r('app.color.text_secondary'))
                .rotate({ angle: this.显示更多 ? 0 : -90 })
                .animation({ duration: 150, curve: Curve.EaseOut })
                .width(应用尺寸.间距_16)
                .textAlign(TextAlign.Center)
              Text($r('app.string.deck_more'))
                .fontSize(应用尺寸.字号_按钮)
                .fontColor($r('app.color.text_primary'))
                .layoutWeight(1)
                .textAlign(TextAlign.Center)
              Blank()
                .width(应用尺寸.间距_16)
            }
            .width('100%')
            .height(应用尺寸.按钮高度)
            .padding({ left: 应用尺寸.卡片内边距, right: 应用尺寸.卡片内边距 })
            .attributeModifier(new GlassSurface(this.按下按钮编号 === 2, this.glassColors))
            .borderRadius(应用尺寸.圆角_胶囊)
            .animation({ duration: 80, curve: Curve.EaseOut })
            .onTouch((event: TouchEvent): void => {
              if (event.type === TouchType.Down) { this.按下按钮编号 = 2; }
              else if (event.type === TouchType.Up || event.type === TouchType.Cancel) { this.按下按钮编号 = 0; }
            })
            .onClick(() => {
              this.显示更多 = !this.显示更多;
              this.scrollToMorePending = this.显示更多;
            })

            if (this.显示更多) {
              Column({ space: 应用尺寸.间距_8 }) {
                Button($r('app.string.deck_create_subdeck'))
                  .width('100%')
                  .height(应用尺寸.按钮高度)
                  .fontSize(应用尺寸.字号_按钮)
                  .fontColor($r('app.color.text_primary'))
                  .attributeModifier(new GlassSurface(this.按下按钮编号 === 3, this.glassColors))
                  .borderRadius(应用尺寸.圆角_胶囊)
                  .animation({ duration: 80, curve: Curve.EaseOut })
                  .onTouch((event: TouchEvent): void => {
                    if (event.type === TouchType.Down) { this.按下按钮编号 = 3; }
                    else if (event.type === TouchType.Up || event.type === TouchType.Cancel) { this.按下按钮编号 = 0; }
                  })
                  .onClick((): void => {
                    this.显示更多 = false;
                    this.创建子牌组();
                  })
                Button(this.牌组选项加载中 ? $r('app.string.deck_options_loading') : $r('app.string.deck_options_title'))
                  .width('100%')
                  .height(应用尺寸.按钮高度)
                  .fontSize(应用尺寸.字号_按钮)
                  .fontColor($r('app.color.text_primary'))
                  .attributeModifier(new GlassSurface(this.按下按钮编号 === 4, this.glassColors))
                  .borderRadius(应用尺寸.圆角_胶囊)
                  .animation({ duration: 80, curve: Curve.EaseOut })
                  .onTouch((event: TouchEvent): void => {
                    if (event.type === TouchType.Down) { this.按下按钮编号 = 4; }
                    else if (event.type === TouchType.Up || event.type === TouchType.Cancel) { this.按下按钮编号 = 0; }
                  })
                  .enabled(!this.牌组选项加载中)
                  .onClick((): void => {
                    this.显示更多 = false;
                    this.打开牌组选项();
                  })
                Button($r('app.string.deck_export_this'))
                  .width('100%')
                  .height(应用尺寸.按钮高度)
                  .fontSize(应用尺寸.字号_按钮)
                  .fontColor($r('app.color.text_primary'))
                  .attributeModifier(new GlassSurface(this.按下按钮编号 === 5, this.glassColors))
                  .borderRadius(应用尺寸.圆角_胶囊)
                  .animation({ duration: 80, curve: Curve.EaseOut })
                  .onTouch((event: TouchEvent): void => {
                    if (event.type === TouchType.Down) { this.按下按钮编号 = 5; }
                    else if (event.type === TouchType.Up || event.type === TouchType.Cancel) { this.按下按钮编号 = 0; }
                  })
                  .onClick((): void => {
                    this.显示更多 = false;
                    this.导出牌组();
                  })
              }
              .width('100%')
              .onAreaChange((_oldArea: Area, newArea: Area): void => {
                // 等展开项完成布局再滚动，避免使用展开前的内容高度。
                if (this.显示更多 && this.scrollToMorePending && Number(newArea.height) > 0) {
                  this.scrollToMorePending = false;
                  this.detailScroller.scrollEdge(Edge.Bottom);
                }
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
        bottom: 应用尺寸.pageBottomInset
      })
      }
      .width('100%')
      .layoutWeight(1)
      .align(Alignment.Top)
      .scrollBar(BarState.Off)
      .edgeEffect(EdgeEffect.Spring)
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
            left: 应用尺寸.卡片内边距,
            right: 应用尺寸.卡片内边距,
            top: 应用尺寸.pageSectionGap,
            // 外层已有底部留白，合计至少保留导航安全区上方16vp。
            bottom: Math.max(应用尺寸.pageBottomInset,
              this.navigationBottomInset + 应用尺寸.间距_16 - 应用尺寸.pageBottomInset)
          })
        }
      }, (deck: 牌组汇总): string => deck.id)
      }
      .width('100%')
      .height('100%')
      .backgroundColor($r('app.color.surface_card'))
      .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
      .borderRadius(应用尺寸.圆角_卡片)
    }
    .width('100%')
    .height('100%')
    .padding({
      left: 应用尺寸.页面内边距_水平,
      right: 应用尺寸.页面内边距_水平,
      top: 应用尺寸.pageContentTopInset,
      bottom: 应用尺寸.pageBottomInset
    })
  }
}
