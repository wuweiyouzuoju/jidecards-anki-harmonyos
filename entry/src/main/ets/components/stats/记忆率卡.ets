// SPDX-License-Identifier: AGPL-3.0-or-later

// 记忆率卡：渲染 GraphsView.retrievability 为直方图（对齐 Anki RetrievabilityGraph）。
// 色带 RdYlGn domain [0,100]：低可提取性红 → 高可提取性绿；约 20 柱。
// 范围切换（Anki PercentageRange，默认全部）：全部 [0,100] / 100% 全数据 / 95% 中间 95% / 50% 中间 50%，
// 截断用加权分位（按卡片数加权）。
// 底部统计行：平均可提取性（Anki Average retrievability）+
// 预估已掌握 X 张 / Y 条笔记（Anki Estimated total knowledge）。
// Invariants: build 单根 Column；仅 FSRS 有意义（无 memory_state 卡片时 average 为 0）。

import type { RetrievabilitySummary } from '../../proto/messages/StatsMessages';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 取可提取性柱色 } from '../../model/统计色板';
import { 加权分位, 取轴域 } from '../../model/统计分箱';
import type { 轴域 } from '../../model/统计分箱';
import { 纵轴刻度, 纵轴宽 } from './图表轴';

@Component
export struct 记忆率卡 {
  @Prop @Watch('更新缓存') 记忆率数据: RetrievabilitySummary | null = null;
  @Prop @Watch('更新缓存') 范围索引: number = 0;
  @State private 柱缓存: number[] = [];
  @State private 域下限: number = 0;
  @State private 域上限: number = 100;
  private readonly 柱区高度: number = 108;

  aboutToAppear(): void {
    this.更新缓存();
  }

  /** 范围 → 值域 [下, 上]（Anki PercentageRange 分位映射：1 / 0.975 / 0.75） */
  private 取值域(): number[] {
    const 桶: Map<number, number> | null =
      this.记忆率数据 !== null ? this.记忆率数据.buckets : null;
    if (桶 === null || 桶.size === 0) {
      return [0, 100];
    }
    switch (this.范围索引) {
      case 0:
        return [0, 100];
      case 1: {
        let 最小: number = 100;
        let 最大: number = 0;
        桶.forEach((卡数: number, 键: number) => {
          if (卡数 > 0) {
            if (键 < 最小) {
              最小 = 键;
            }
            if (键 > 最大) {
              最大 = 键;
            }
          }
        });
        return 最大 > 最小 ? [最小, 最大 + 1] : [0, 100];
      }
      case 2:
        return [加权分位(桶, 0.025), 加权分位(桶, 0.975)];
      default:
        return [加权分位(桶, 0.25), 加权分位(桶, 0.75)];
    }
  }

  更新缓存(): void {
    const 域: number[] = this.取值域();
    const 下: number = 域[0];
    const 上: number = 域[1];
    this.域下限 = 下;
    this.域上限 = 上;
    if (上 <= 下) {
      this.柱缓存 = [];
      return;
    }
    // Anki desiredBars = 20：范围内等分 20 桶（后端键为 1% 粒度百分比）
    const 柱数: number = 20;
    const 桶宽: number = (上 - 下) / 柱数;
    const 柱: number[] = [];
    for (let i = 0; i < 柱数; i++) {
      柱.push(0);
    }
    if (this.记忆率数据 !== null && this.记忆率数据.buckets !== null) {
      this.记忆率数据.buckets.forEach((卡数: number, 键: number) => {
        if (键 < 下 || 键 >= 上 || 卡数 <= 0) {
          return;
        }
        const 索引: number = Math.min(柱数 - 1, Math.floor((键 - 下) / 桶宽));
        柱[索引] += 卡数;
      });
    }
    this.柱缓存 = 柱;
  }

  /** Y 轴域（上限与刻度绑定产出，柱高归一化用 域.上限） */
  private 取轴(): 轴域 {
    let 峰值: number = 0;
    for (let i = 0; i < this.柱缓存.length; i++) {
      if (this.柱缓存[i] > 峰值) {
        峰值 = this.柱缓存[i];
      }
    }
    return 取轴域(峰值, 4);
  }

  private 取总计(): number {
    let 总计: number = 0;
    for (let i = 0; i < this.柱缓存.length; i++) {
      总计 += this.柱缓存[i];
    }
    return 总计;
  }

  private 数据为空(): boolean {
    if (this.记忆率数据 === null) {
      return true;
    }
    return this.取总计() === 0;
  }

  build() {
    Column({ space: 应用尺寸.间距_8 }) {
      if (this.数据为空()) {
        Text($r('app.string.stats_empty_section'))
          .fontSize(应用尺寸.字号_正文)
          .fontColor($r('app.color.text_tertiary'))
          .width('100%')
          .textAlign(TextAlign.Center)
          .padding({ top: 应用尺寸.间距_16, bottom: 应用尺寸.间距_16 })
      } else {
        Column({ space: 应用尺寸.间距_8 }) {
          // 直方图内联（原 @Builder 值传参参数被固化，牌组切换后柱高/统计行不更新，2026-08-29 修复）
          Row() {
            纵轴刻度({
              刻度: this.取轴().刻度,
              高度: this.柱区高度
            })
            Row({ space: 1 }) {
              // key 含数据字段：数据变 → key 变 → 柱子重建（key 仅索引时数据变化 UI 冻结）
              ForEach(this.柱缓存, (卡数: number, 索引: number) => {
                Stack({ alignContent: Alignment.Bottom }) {
                  Column()
                    .width('70%')
                    .height(Math.max(卡数 / this.取轴().上限 * this.柱区高度, 卡数 > 0 ? 4 : 0))
                    .backgroundColor(取可提取性柱色(this.取桶位置(索引)))
                    .borderRadius(1)
                }
                .width('100%')
                .height(this.柱区高度)
                .layoutWeight(1)
              }, (卡数: number, 索引: number) => `${索引}_${卡数}`)
            }
            .layoutWeight(1)
            .height(this.柱区高度)
          }
          .width('100%')

          // 轴标签：当前值域下限 ~ 上限
          Row() {
            Text(`${Math.round(this.域下限)}%`)
              .fontSize(应用尺寸.字号_说明_小)
              .fontColor($r('app.color.text_tertiary'))
              .layoutWeight(1)
              .textAlign(TextAlign.Start)
            Text(`${Math.ceil(this.域上限)}%`)
              .fontSize(应用尺寸.字号_说明_小)
              .fontColor($r('app.color.text_tertiary'))
              .layoutWeight(1)
              .textAlign(TextAlign.End)
          }
          .width('100%')
          .padding({ left: 纵轴宽 })

          // 平均可提取性（% 放入参数，避免资源格式化双 %%）
          Row() {
            Text($r('app.string.stats_retrievability_average_label'))
              .fontSize(应用尺寸.字号_正文_小)
              .fontColor($r('app.color.text_secondary'))
            Blank()
            Text($r('app.string.stats_retrievability_average_value',
              `${(this.记忆率数据 as RetrievabilitySummary).average.toFixed(0)}%`))
              .fontSize(应用尺寸.字号_正文_小)
              .fontColor($r('app.color.text_primary'))
          }
          .width('100%')

          // 预估已掌握（Anki Estimated total knowledge）
          Row() {
            Text($r('app.string.stats_retrievability_knowledge_label'))
              .fontSize(应用尺寸.字号_正文_小)
              .fontColor($r('app.color.text_secondary'))
            Blank()
            Text($r('app.string.stats_retrievability_knowledge',
              Math.round((this.记忆率数据 as RetrievabilitySummary).sumByCard),
              Math.round((this.记忆率数据 as RetrievabilitySummary).sumByNote)))
              .fontSize(应用尺寸.字号_正文_小)
              .fontColor($r('app.color.text_primary'))
          }
          .width('100%')
        }
        .width('100%')
      }
    }
    .width('100%')
  }

  /** 桶在 [0,100] 值域中的绝对位置（0-1）：截断范围下柱色仍对应真实可提取性 */
  private 取桶位置(索引: number): number {
    const 桶数: number = this.柱缓存.length;
    if (桶数 <= 1) {
      return 0.5;
    }
    const 桶中值: number = this.域下限
      + (索引 + 0.5) / 桶数 * (this.域上限 - this.域下限);
    return Math.min(1, Math.max(0, 桶中值 / 100));
  }
}
