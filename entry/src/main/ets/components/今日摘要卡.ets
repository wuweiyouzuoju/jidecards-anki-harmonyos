import { MODULE_OPACITY_KEY, MaterialOpacity, DEFAULT_MODULE_OPACITY } from '../model/SurfaceMaterial';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { SeriesVisual } from '../utils/SeriesVisual';
import { LengthMetrics } from '@kit.ArkUI';
import { ThemeDefinition, themeDefinition, THEME_VISUALS_KEY } from '../model/ThemeCatalog';
import { themeProgressGradient } from '../utils/ThemeVisuals';
import { homeSummaryGeometry, homeSummaryStacksMetrics, HomeSummaryGeometry } from '../model/HomeHeaderLayout';

import { 应用尺寸 } from '../utils/应用尺寸';
import { 颜色键 } from '../model/颜色主题';

// ========================================================
// @块ID UI-TODAY-SUMMARY-001
// @名称 今日摘要卡 组件主体字段
//
// @作用
// 今日进度摘要卡：完成/待学/今日答对率与进度条。牌组数在顶部小字显示。
// 空态仅一种情况：deckCount=0（用户还没建牌组）→ "点击右上角新建牌组"。
// deckCount>0 但 completed+pending=0 时不再算空态，显示正常进度条（0%）+ 三列指标，
// 让用户看到牌组数和今日无待学状态。
//
// @输入
// @Prop 已完成数 / 待学数 / 牌组数 / 今日答对率（0-1，-1 表示无数据）。
//
// @输出
// 渲染今日进度摘要卡（固定展开，高度由宿主提供（默认 150））。
//
// @业务规则
// 三个 计数指标 不能用 @Builder 方法接收 number 参数来实现——ArkUI 的 @Builder 对参数值
// 在首次渲染时被捕获，不响应 @Prop 后续变化，会导致学完卡后上方 小字更新但下方三个数字不刷新。
// 必须 inline 写在 build()。
//
// @副作用
// 无。仅渲染。
// ========================================================
@Component
export struct 今日摘要卡 {
  @StorageProp('surface_material') private surfaceMaterial: string = 'flat';
  @StorageProp(MODULE_OPACITY_KEY) private moduleOpacity: MaterialOpacity = DEFAULT_MODULE_OPACITY;
  @StorageProp('themeMode') private themeMode: string = 'system';
  @StorageProp('systemDarkMode') private systemDark: boolean = false;
  @StorageProp(颜色键.页面底色微染) private pageTint: string = '';

  @State private contentWidth: number = 0;
  @Prop indicatorSpace: number = 0;
  @Prop cardHeight: number = 150;
  @Prop compactCard: boolean = false;
  @StorageProp(THEME_VISUALS_KEY) private visual: ThemeDefinition = themeDefinition('aurora');
  @Prop 已完成数: number = 0;
  @Prop 待学数: number = 0;
  @Prop 牌组数: number = 0;
  // 今日答对率 0-1（来自 graphs.today 的 1 - todayAgainRate = correctCount/answerCount）；-1 表示今日无数据（未学习/拉取失败）
  @Prop 今日答对率: number = -1;

  @StorageProp(颜色键.动作主色) private 动作主色: string = '#2F5FD0';
  @StorageProp(颜色键.主色容器) private 主色容器色: string = '#E8EEFC';
  @StorageProp(颜色键.新卡计数色) private 新卡计数色: string = '#3974D9';
  @StorageProp(颜色键.学习中计数色) private 学习中计数色: string = '#B56A22';
  @StorageProp(颜色键.复习中计数色) private 复习中计数色: string = '#7056C8';

  // ========================================================
  // @块ID UI-TODAY-SUMMARY-002
  // @名称 进度值 / 空态判断 / 空态提示
  //
  // @作用
  // 计算进度条百分比、判断是否空态、返回空态提示文案。
  //
  // @输入
  // this.已完成数 / 待学数 / 牌组数。
  //
  // @输出
  // 进度值 = 已完成数 / (已完成数 + 待学数) * 100（总数<=0 时返回 0）。
  // 是否空态 = 牌组数 === 0。
  // 空态提示 = $r('app.string.today_empty_no_decks_hint')。
  //
  // @业务规则
  // B12-Y2 2026-07-23：仅 牌组数=0 算空态。有牌组但今日无待学时显示正常进度条+指标。
  //
  // @副作用
  // 无。
  // ========================================================
  private 进度值(): number {
    const 总数: number = this.已完成数 + this.待学数;
    if (总数 <= 0) {
      return 0;
    }
    return this.已完成数 / 总数 * 100;
  }

  private 是否空态(): boolean {
    // B12-Y2 2026-07-23：仅 牌组数=0 算空态。有牌组但今日无待学时显示正常进度条+指标。
    return this.牌组数 === 0;
  }

  private 空态提示(): Resource {
    return $r('app.string.today_empty_no_decks_hint');
  }

  // ========================================================
  // @块ID UI-TODAY-SUMMARY-003
  // @名称 今日摘要卡主渲染
  //
  // @作用
  // 渲染整张今日摘要卡：标题行（标题 + 小字 + 牌组数）+ 进度条/空态分支 + 三列指标。
  // 固定展开，无折叠态。
  //
  // @输入
  // 全部 @Prop + @StorageProp + 3 个私有方法。
  //
  // @输出
  // 整张今日摘要卡视觉，固定高度由宿主提供（默认 150）。
  //
  // @副作用
  // 无。
  // ========================================================
  private pageGeometry(): HomeSummaryGeometry {
    const context: UIContext = this.getUIContext();
    return homeSummaryGeometry(this.cardHeight, this.compactCard, this.indicatorSpace, context.px2vp(context.fp2px(1)));
  }

  private stackedMetrics(): boolean {
    const context: UIContext = this.getUIContext();
    return homeSummaryStacksMetrics(this.contentWidth, context.px2vp(context.fp2px(1)));
  }

  build() {
    Column({ space: 应用尺寸.间距_8 }) {
      Flex({ direction: this.stackedMetrics() ? FlexDirection.Column : FlexDirection.Row,
        alignItems: this.stackedMetrics() ? ItemAlign.Start : ItemAlign.Center }) {
        Text($r('app.string.today_progress'))
          .fontSize(this.compactCard ? 应用尺寸.字号_强调 : 应用尺寸.字号_摘要标题)
          .wordBreak(WordBreak.BREAK_WORD)
          .fontWeight(FontWeight.Bold)
          .fontColor($r('app.color.text_primary'))
          .layoutWeight(this.stackedMetrics() ? 0 : 1)
          .width(this.stackedMetrics() ? '100%' : undefined)
        Text($r('app.string.deck_count_summary', this.牌组数))
          .fontSize(this.compactCard ? 应用尺寸.字号_正文_小 : 应用尺寸.字号_正文_中)
          .width(this.stackedMetrics() ? '100%' : undefined)
          .textAlign(this.stackedMetrics() ? TextAlign.Start : TextAlign.End)
          .flexShrink(0).margin({ left: this.stackedMetrics() ? 0 : 应用尺寸.间距_4 })
          .fontColor($r('app.color.text_secondary'))
      }
      .width('100%').constraintSize({ minHeight: this.pageGeometry().titleHeight })

      Column({ space: 应用尺寸.间距_8 }) {
        if (this.是否空态()) {
          Text(this.空态提示())
            .fontSize(应用尺寸.字号_正文)
            .fontColor($r('app.color.text_secondary'))
            .textAlign(TextAlign.Center)
            .width('100%')
        } else {
          Progress({ value: this.进度值(), total: 100, type: ProgressType.Linear })
            .height(应用尺寸.进度条高度)
            .color(this.visual.progressColors.length > 0 ? themeProgressGradient(this.visual.progressColors) : this.动作主色)
            .backgroundColor(this.主色容器色)
            .borderRadius(应用尺寸.圆角_进度条)

          Scroll() {
          Flex({ direction: this.stackedMetrics() ? FlexDirection.Column : FlexDirection.Row,
            alignItems: ItemAlign.Center, space: { main: LengthMetrics.vp(应用尺寸.间距_10) } }) {
            Flex({ direction: this.stackedMetrics() ? FlexDirection.Row : FlexDirection.Column,
              alignItems: ItemAlign.Center, justifyContent: FlexAlign.Center,
              space: { main: LengthMetrics.vp(应用尺寸.间距_3) } }) {
              Text(this.已完成数.toString())
                .fontSize(应用尺寸.字号_指标)
                .minFontSize(应用尺寸.字号_正文).maxFontSize(应用尺寸.字号_指标).maxLines(1)
                .fontWeight(FontWeight.Bold)
                .fontColor(this.新卡计数色)
                .width(this.stackedMetrics() ? '28%' : '100%').textAlign(this.stackedMetrics() ? TextAlign.Start : TextAlign.Center)
            Text($r('app.string.completed_today'))
              .fontSize(应用尺寸.字号_正文_小).wordBreak(WordBreak.NORMAL)
                .fontColor($r('app.color.text_secondary'))
                .width(this.stackedMetrics() ? '72%' : '100%').textAlign(this.stackedMetrics() ? TextAlign.Start : TextAlign.Center)
            }
            .width(this.stackedMetrics() ? '100%' : undefined)
            .layoutWeight(this.stackedMetrics() ? 0 : 1).flexShrink(0)

            Flex({ direction: this.stackedMetrics() ? FlexDirection.Row : FlexDirection.Column,
              alignItems: ItemAlign.Center, justifyContent: FlexAlign.Center,
              space: { main: LengthMetrics.vp(应用尺寸.间距_3) } }) {
              Text(this.待学数.toString())
                .fontSize(应用尺寸.字号_指标)
                .minFontSize(应用尺寸.字号_正文).maxFontSize(应用尺寸.字号_指标).maxLines(1)
                .fontWeight(FontWeight.Bold)
                .fontColor(this.学习中计数色)
                .width(this.stackedMetrics() ? '28%' : '100%').textAlign(this.stackedMetrics() ? TextAlign.Start : TextAlign.Center)
            Text($r('app.string.pending_today'))
              .fontSize(应用尺寸.字号_正文_小).wordBreak(WordBreak.NORMAL)
                .fontColor($r('app.color.text_secondary'))
                .width(this.stackedMetrics() ? '72%' : '100%').textAlign(this.stackedMetrics() ? TextAlign.Start : TextAlign.Center)
            }
            .width(this.stackedMetrics() ? '100%' : undefined)
            .layoutWeight(this.stackedMetrics() ? 0 : 1).flexShrink(0)

            Flex({ direction: this.stackedMetrics() ? FlexDirection.Row : FlexDirection.Column,
              alignItems: ItemAlign.Center, justifyContent: FlexAlign.Center,
              space: { main: LengthMetrics.vp(应用尺寸.间距_3) } }) {
              Text(this.今日答对率 >= 0 ? `${Math.round(this.今日答对率 * 100)}%` : '-')
                .fontSize(应用尺寸.字号_指标)
                .minFontSize(应用尺寸.字号_正文).maxFontSize(应用尺寸.字号_指标).maxLines(1)
                .fontWeight(FontWeight.Bold)
                .fontColor(this.复习中计数色)
                .width(this.stackedMetrics() ? '28%' : '100%').textAlign(this.stackedMetrics() ? TextAlign.Start : TextAlign.Center)
            Text($r('app.string.today_pass_rate_short'))
              .fontSize(应用尺寸.字号_正文_小).wordBreak(WordBreak.NORMAL)
                .fontColor($r('app.color.text_secondary'))
                .width(this.stackedMetrics() ? '72%' : '100%').textAlign(this.stackedMetrics() ? TextAlign.Start : TextAlign.Center)
                .accessibilityText($r('app.string.today_recall_rate'))
            }
            .width(this.stackedMetrics() ? '100%' : undefined)
            .layoutWeight(this.stackedMetrics() ? 0 : 1).flexShrink(0)
          }
          .width('100%')
          }.width('100%').layoutWeight(1).scrollBar(BarState.Auto)
        }
      }.width('100%').layoutWeight(1).justifyContent(FlexAlign.Center)
    }
    .width('100%')
    .height(this.cardHeight)
    .onAreaChange((_old: Area, area: Area): void => { this.contentWidth = Number(area.width); })
    .padding({ top: this.pageGeometry().topPadding, bottom: this.pageGeometry().padding,
      left: this.pageGeometry().padding, right: this.pageGeometry().padding })
    .attributeModifier(SeriesVisual.surfaceFor(this.surfaceMaterial, SeriesVisual.isDark(this.themeMode, this.systemDark),
      this.动作主色, this.pageTint, undefined, this.moduleOpacity))
  }
}
