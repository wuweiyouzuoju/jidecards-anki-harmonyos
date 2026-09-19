// SPDX-License-Identifier: AGPL-3.0-or-later

// 真实保留率卡：渲染 GraphsView.trueRetention 为周期表格（对齐 Anki TrueRetention）。
// 视图切换（Anki DisplayMode，默认汇总=全部）：年轻单列 / 成熟单列 / 汇总表。
// 汇总表行 = 周期（今天/昨天/本周/本月/本年/全部）；列 = 年轻/成熟/总计/次数。
// 年轻列 #64c476、成熟列 #31a354（Anki 系列色）；单列视图 Pass #3bc464 / Fail #c43b3b。
// 百分比 1 位小数，分母为 0 显示 —。
// Invariants: build 单根 Column；全部时间行仅在统计天数=全部（days=0）时显示（Anki revlogRange 语义）。

import type { TrueRetention, TrueRetentionStats } from '../../proto/messages/StatsMessages';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 色保留率_年轻, 色保留率_成熟 } from '../../model/统计色板';

/** 单行数据 */
interface 保留率行 {
  标题: Resource;
  /** 周期唯一标识（ForEach key 用；Resource 对象转字符串全同，不能做 key） */
  周期: string;
  数据: TrueRetention | null;
}

@Component
export struct 真实保留率卡 {
  @Prop 保留率数据: TrueRetentionStats | null = null;
  /** 统计天数=0（全部）时显示"全部时间"行 */
  @Prop 是否显示全部: boolean = false;
  /** 视图：0=年轻单列 1=成熟单列 2=汇总（Anki 默认 Summary） */
  @Prop 视图索引: number = 2;

  private 取率(通过: number, 未通过: number): string {
    const 总: number = 通过 + 未通过;
    if (总 === 0) return '—';
    return `${(通过 / 总 * 100).toFixed(1)}%`;
  }

  private 取总计通过(数据: TrueRetention): number {
    return 数据.youngPassed + 数据.maturePassed;
  }

  private 取总计未通过(数据: TrueRetention): number {
    return 数据.youngFailed + 数据.matureFailed;
  }

  private 取次数(数据: TrueRetention): number {
    return this.取总计通过(数据) + this.取总计未通过(数据);
  }

  /** 单列视图数据：0=年轻 1=成熟（其他视为成熟） */
  private 取单列通过(数据: TrueRetention): number {
    return this.视图索引 === 0 ? 数据.youngPassed : 数据.maturePassed;
  }

  private 取单列未通过(数据: TrueRetention): number {
    return this.视图索引 === 0 ? 数据.youngFailed : 数据.matureFailed;
  }

  private 取行列表(): 保留率行[] {
    if (this.保留率数据 === null) {
      return [];
    }
    const d: TrueRetentionStats = this.保留率数据;
    const 行: 保留率行[] = [
      { 标题: $r('app.string.stats_section_today'), 周期: 'today', 数据: d.today },
      { 标题: $r('app.string.stats_period_yesterday'), 周期: 'yesterday', 数据: d.yesterday },
      { 标题: $r('app.string.stats_period_week'), 周期: 'week', 数据: d.week },
      { 标题: $r('app.string.stats_period_month'), 周期: 'month', 数据: d.month },
      { 标题: $r('app.string.stats_period_year'), 周期: 'year', 数据: d.year }
    ];
    if (this.是否显示全部) {
      行.push({ 标题: $r('app.string.stats_period_all'), 周期: 'all', 数据: d.allTime });
    }
    return 行;
  }

  build() {
    Column({ space: 应用尺寸.间距_8 }) {
      if (this.保留率数据 === null) {
        Text($r('app.string.stats_empty_section'))
          .fontSize(应用尺寸.字号_正文)
          .fontColor($r('app.color.text_tertiary'))
          .width('100%')
          .textAlign(TextAlign.Center)
          .padding({ top: 应用尺寸.间距_16, bottom: 应用尺寸.间距_16 })
      } else if (this.视图索引 === 2) {
        this.渲染保留率表()
      } else {
        this.渲染单列表()
      }
    }
    .width('100%')
  }

  /** 行键数值部分：空数据显示 -，数据变化时 key 跟随变化 */
  private 取行键(行: 保留率行): string {
    if (行.数据 === null) {
      return 'null';
    }
    const d: TrueRetention = 行.数据;
    return `${d.youngPassed}_${d.youngFailed}_${d.maturePassed}_${d.matureFailed}`;
  }

  @Builder
  private 渲染单列表() {
    Column() {
      // 表头（Anki 单列视图：Pass / Fail / Retention）
      Row() {
        Text('')
          .layoutWeight(1)
        this.表头格($r('app.string.stats_retention_passed'), '')
        this.表头格($r('app.string.stats_retention_failed'), '')
        this.表头格($r('app.string.stats_retention_rate_label'), '')
      }
      .width('100%')
      .padding({ bottom: 应用尺寸.间距_4 })

      // key 含全部数值字段：数据变 → key 变 → 行重建（key 不含数值时牌组切换后数字冻结）
      ForEach(this.取行列表(), (行: 保留率行) => {
        this.单列行(行)
      }, (行: 保留率行) => `${行.周期}_${this.视图索引}_${this.取行键(行)}`)
    }
    .width('100%')
  }

  @Builder
  private 单列行(行: 保留率行) {
    Row() {
      Text(行.标题)
        .fontSize(应用尺寸.字号_正文_小)
        .fontColor($r('app.color.text_secondary'))
        .layoutWeight(1)
      if (行.数据 === null) {
        this.空格(56)
        this.空格(56)
        this.空格(56)
      } else {
        this.数值格(`${this.取单列通过(行.数据)}`, '#3bc464')
        this.数值格(`${this.取单列未通过(行.数据)}`, '#c43b3b')
        this.数值格(this.取率(this.取单列通过(行.数据),
          this.取单列未通过(行.数据)), '')
      }
    }
    .width('100%')
    .padding({ top: 应用尺寸.间距_5, bottom: 应用尺寸.间距_5 })
    .border({ width: { bottom: 0.5 }, color: { bottom: $r('app.color.border_subtle') } })
  }

  @Builder
  private 渲染保留率表() {
    Column() {
      // 表头
      Row() {
        Text('')
          .layoutWeight(1)
        this.表头格($r('app.string.stats_retention_young'), 色保留率_年轻)
        this.表头格($r('app.string.stats_retention_mature'), 色保留率_成熟)
        this.表头格($r('app.string.stats_retention_total'), '')
        this.表头格($r('app.string.stats_retention_count'), '')
      }
      .width('100%')
      .padding({ bottom: 应用尺寸.间距_4 })

      // key 含全部数值字段：数据变 → key 变 → 行重建（key 不含数值时牌组切换后数字冻结）
      ForEach(this.取行列表(), (行: 保留率行) => {
        this.保留率行(行)
      }, (行: 保留率行) => `${行.周期}_${this.取行键(行)}`)
    }
    .width('100%')
  }

  @Builder
  private 表头格(标签: Resource, 颜色: string) {
    Text(标签)
      .fontSize(应用尺寸.字号_说明)
      .fontColor(颜色 === '' ? $r('app.color.text_secondary') : 颜色)
      .fontWeight(FontWeight.Medium)
      .width(56)
      .textAlign(TextAlign.End)
  }

  @Builder
  private 保留率行(行: 保留率行) {
    Row() {
      Text(行.标题)
        .fontSize(应用尺寸.字号_正文_小)
        .fontColor($r('app.color.text_secondary'))
        .layoutWeight(1)
      if (行.数据 === null) {
        this.空格(56)
        this.空格(56)
        this.空格(56)
        this.空格(44)
      } else {
        this.数值格(this.取率(行.数据.youngPassed, 行.数据.youngFailed), 色保留率_年轻)
        this.数值格(this.取率(行.数据.maturePassed, 行.数据.matureFailed), 色保留率_成熟)
        this.数值格(this.取率(this.取总计通过(行.数据), this.取总计未通过(行.数据)), '')
        this.数值格(`${this.取次数(行.数据)}`, '')
      }
    }
    .width('100%')
    .padding({ top: 应用尺寸.间距_5, bottom: 应用尺寸.间距_5 })
    .border({ width: { bottom: 0.5 }, color: { bottom: $r('app.color.border_subtle') } })
  }

  /** 空数据占位格（—） */
  @Builder
  private 空格(宽度: number) {
    Text('—')
      .fontSize(应用尺寸.字号_正文_小)
      .fontColor($r('app.color.text_tertiary'))
      .width(宽度)
      .textAlign(TextAlign.End)
  }

  /** 数值格：颜色为空串时用主文字色 */
  @Builder
  private 数值格(内容: string, 颜色: string) {
    Text(内容)
      .fontSize(应用尺寸.字号_正文_小)
      .fontColor(颜色 === '' ? $r('app.color.text_primary') : 颜色)
      .width(56)
      .textAlign(TextAlign.End)
  }
}
