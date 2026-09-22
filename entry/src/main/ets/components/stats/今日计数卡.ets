// SPDX-License-Identifier: AGPL-3.0-or-later

// 今日计数卡：渲染 GraphsView.today 为 4 行文字列表（对齐 Anki TodayStats）。
// 行 1 今天学习了 N 张，用时 X（Y 秒/张）；行 2 重来次数 N (P%)；
// 行 3 学习/复习/重学/过滤 计数；行 4 成熟卡正确率（无成熟卡时提示）。
// Invariants: 摘要始终可见；详细答题统计按需展开，缺失字段不当作零。

import { common } from '@kit.AbilityKit';
import { resourceText } from '../../utils/UiFeedback';
import { dueOverview } from '../../model/StatsOverview';
import type { FutureDue, TodayCounts } from '../../proto/messages/StatsMessages';
import { 应用尺寸 } from '../../utils/应用尺寸';

@Component
export struct 今日计数卡 {
  @Prop @Watch('数据已变') 今日数据: TodayCounts | null = null;
  /** 渲染哨兵：@Prop 变化经 @Watch 递增，驱动本组件重新渲染
   *  （@Prop 直连 UI 在统计图表分区尾闭包内不触发刷新，实测 2026-08-29） */
  @Prop @Watch('数据已变') 预测数据: FutureDue | null = null;
  @State private showDetails: boolean = false;
  @State private 渲染指纹: number = 0;

  private 数据已变(): void {
    this.渲染指纹 = this.渲染指纹 + 1;
  }

  private 取能力上下文(): common.UIAbilityContext | null {
    const ctx: common.UIAbilityContext | undefined =
      AppStorage.get<common.UIAbilityContext>('abilityContext');
    return ctx === undefined ? null : ctx;
  }

  private 格式化用时(毫秒: number): string {
    const 总秒: number = Math.floor(毫秒 / 1000);
    if (总秒 < 1) return '0s';
    const 分钟: number = Math.floor(总秒 / 60);
    const 秒: number = 总秒 % 60;
    if (分钟 < 1) return `${秒}s`;
    if (分钟 < 60) {
      const ctx = this.取能力上下文();
      if (ctx !== null) {
        return resourceText(this.getUIContext(), $r('app.string.stats_time_format'), 分钟, 秒);
      }
      return `${分钟}m${秒}s`;
    }
    const 小时: number = Math.floor(分钟 / 60);
    const 余分: number = 分钟 % 60;
    const ctx = this.取能力上下文();
    if (ctx !== null) {
      return resourceText(this.getUIContext(), $r('app.string.stats_time_format_hour'), 小时, 余分);
    }
    return `${小时}h${余分}m`;
  }

  /** 每张卡平均用时（秒，1 位小数；Anki secsPerCard） */
  private 取每卡秒(数据: TodayCounts): string {
    if (数据.answerCount <= 0) {
      return '0';
    }
    return (数据.answerMillis / 1000 / 数据.answerCount).toFixed(1);
  }

  /** 重来次数 = 已答 - 正确（Anki againCount） */
  private 取重来次数(数据: TodayCounts): number {
    return Math.max(0, 数据.answerCount - 数据.correctCount);
  }

  private 取重来百分比(数据: TodayCounts): string {
    if (数据.answerCount <= 0) {
      return '0%';
    }
    return `${(this.取重来次数(数据) / 数据.answerCount * 100).toFixed(2)}%`;
  }

  private 取成熟正确率(数据: TodayCounts): string {
    if (数据.matureCount <= 0) {
      return '0%';
    }
    return `${(数据.matureCorrect / 数据.matureCount * 100).toFixed(2)}%`;
  }

  /** 缺失数据保留未知态，不能显示为零。 */
  private dueLabel(overdue: boolean): ResourceStr {
    const counts = dueOverview(this.预测数据);
    return counts === null ? '—' : $r('app.string.stats_summary_cards', overdue ? counts.overdue : counts.due);
  }

  build() {
    Column() {
      // 渲染哨兵：读 渲染指纹 建立依赖，@Prop 变化 → @Watch → 指纹变化 → 本组件重新渲染
      Text(`${this.渲染指纹}`).fontSize(1).opacity(0).height(0)

      Row({ space: 8 }) {
        Column({ space: 4 }) {
          Text(this.今日数据 === null ? '—' : $r('app.string.stats_summary_answers', this.今日数据.answerCount))
            .fontSize(应用尺寸.字号_指标).fontWeight(FontWeight.Bold)
            .fontColor($r('app.color.text_primary')).maxLines(1)
            .minFontSize(12).maxFontSize(应用尺寸.字号_指标).height(32)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
          Text($r('app.string.stats_summary_studied')).fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.text_secondary')).maxLines(2)
        }.layoutWeight(1).alignItems(HorizontalAlign.Start)
        Column({ space: 4 }) {
          Text(this.dueLabel(false))
            .fontSize(应用尺寸.字号_指标).fontWeight(FontWeight.Bold)
            .fontColor($r('app.color.text_primary')).maxLines(1)
            .minFontSize(12).maxFontSize(应用尺寸.字号_指标).height(32)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
          Text($r('app.string.stats_summary_due')).fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.text_secondary')).maxLines(2)
        }.layoutWeight(1).alignItems(HorizontalAlign.Start)
        Column({ space: 4 }) {
          Text(this.dueLabel(true))
            .fontSize(应用尺寸.字号_指标).fontWeight(FontWeight.Bold)
            .fontColor($r('app.color.text_primary')).maxLines(1)
            .minFontSize(12).maxFontSize(应用尺寸.字号_指标).height(32)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
          Text($r('app.string.stats_summary_overdue')).fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.text_secondary')).maxLines(2)
        }.layoutWeight(1).alignItems(HorizontalAlign.Start)
        Column({ space: 4 }) {
          Text(this.今日数据 === null ? '—' : this.格式化用时(this.今日数据.answerMillis))
            .fontSize(应用尺寸.字号_指标).fontWeight(FontWeight.Bold)
            .fontColor($r('app.color.text_primary')).maxLines(1)
            .minFontSize(12).maxFontSize(应用尺寸.字号_指标).height(32)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
          Text($r('app.string.stats_summary_time')).fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.text_secondary')).maxLines(2)
        }.layoutWeight(1).alignItems(HorizontalAlign.Start)
      }.width('100%').alignItems(VerticalAlign.Top)
      if (this.今日数据 !== null && this.今日数据.answerCount > 0) {
        Button($r('app.string.stats_today_details'))
          .backgroundColor(Color.Transparent).fontColor($r('app.color.text_secondary'))
          .height(36).onClick((): void => { this.showDetails = !this.showDetails; })
      }
      if (this.showDetails && this.今日数据 !== null && this.今日数据.answerCount > 0) {
        // 内容内联（原 @Builder 值传参参数被固化，牌组切换后数字不更新，2026-08-29 修复）
        Column({ space: 应用尺寸.间距_10 }) {
          Text($r('app.string.stats_today_studied', (this.今日数据 as TodayCounts).answerCount,
            this.格式化用时((this.今日数据 as TodayCounts).answerMillis),
            this.取每卡秒(this.今日数据 as TodayCounts)))
            .fontSize(应用尺寸.字号_正文)
            .fontColor($r('app.color.text_primary'))
            .width('100%')
            .textAlign(TextAlign.Center)
          Text($r('app.string.stats_today_again',
            this.取重来次数(this.今日数据 as TodayCounts),
            this.取重来百分比(this.今日数据 as TodayCounts)))
            .fontSize(应用尺寸.字号_正文)
            .fontColor($r('app.color.text_primary'))
            .width('100%')
            .textAlign(TextAlign.Center)
          Text($r('app.string.stats_today_types', (this.今日数据 as TodayCounts).learnCount,
            (this.今日数据 as TodayCounts).reviewCount, (this.今日数据 as TodayCounts).relearnCount,
            (this.今日数据 as TodayCounts).earlyReviewCount))
            .fontSize(应用尺寸.字号_正文)
            .fontColor($r('app.color.text_primary'))
            .width('100%')
            .textAlign(TextAlign.Center)
          if ((this.今日数据 as TodayCounts).matureCount > 0) {
            Text($r('app.string.stats_today_mature_line',
              (this.今日数据 as TodayCounts).matureCorrect,
              (this.今日数据 as TodayCounts).matureCount,
              this.取成熟正确率(this.今日数据 as TodayCounts)))
              .fontSize(应用尺寸.字号_正文)
              .fontColor($r('app.color.text_primary'))
              .width('100%')
              .textAlign(TextAlign.Center)
          } else {
            Text($r('app.string.stats_today_no_mature'))
              .fontSize(应用尺寸.字号_正文)
              .fontColor($r('app.color.text_secondary'))
              .width('100%')
              .textAlign(TextAlign.Center)
          }
        }
        .width('100%')
        .padding({ top: 应用尺寸.间距_8, bottom: 应用尺寸.间距_8 })
      }
    }
    .width('100%')
  }
}
