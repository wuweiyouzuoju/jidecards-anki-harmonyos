// SPDX-License-Identifier: AGPL-3.0-or-later

// 间隔分布卡：渲染 GraphsView.intervals 为蓝色渐变直方图（对齐 Anki IntervalsGraph）。
// 色带 Blues t∈[0.3,0.7]：短间隔浅蓝 → 长间隔深蓝；范围切换 1个月/50%/95%/全部（默认 95%）。
// 底部统计行：中位间隔（Anki Median interval）。
// Invariants: build 单根 Column；范围切换为前端切片。

import type { Intervals } from '../../proto/messages/StatsMessages';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 取间隔柱色 } from '../../model/统计色板';
import { 展开为序列, 取序列分位, 取轴域 } from '../../model/统计分箱';
import type { 轴域 } from '../../model/统计分箱';
import { 纵轴刻度, 纵轴宽 } from './图表轴';

@Component
export struct 间隔分布卡 {
  @Prop @Watch('更新缓存') 间隔数据: Intervals | null = null;
  @Prop 是否显示全部: boolean = true;
  @Prop @Watch('更新缓存') 范围索引: number = 2;
  @State private 柱缓存: number[] = [];
  @State private 显示上限: number = 0;
  private readonly 柱区高度: number = 108;

  aboutToAppear(): void {
    this.更新缓存();
  }

  /** 展开为序列（每间隔重复卡数次），供分位数与中位数计算 */
  private 取序列(): number[] {
    if (this.间隔数据 === null || this.间隔数据.intervals === null) {
      return [];
    }
    return 展开为序列(this.间隔数据.intervals);
  }

  /** 范围 → 显示上限：1个月=min(最大,30)；50%/95% = 分位；全部 = 最大 */
  private 取显示上限(): number {
    const 序列: number[] = this.取序列();
    if (序列.length === 0) {
      return 0;
    }
    const 最大: number = 序列[序列.length - 1];
    switch (this.范围索引) {
      case 0: return Math.min(最大, 30);
      case 1: return Math.max(1, 取序列分位(序列, 0.5));
      case 2: return Math.max(1, 取序列分位(序列, 0.95));
      default: return 最大;
    }
  }

  更新缓存(): void {
    const 上限: number = this.取显示上限();
    this.显示上限 = 上限;
    if (上限 <= 0) {
      this.柱缓存 = [];
      return;
    }
    // 柱数 ≤70（Anki desiredBars = min(70, xMax)）
    const 步长: number = Math.max(1, Math.ceil(上限 / 70));
    const 柱数: number = Math.floor(上限 / 步长) + 1;
    const 柱: number[] = [];
    for (let i = 0; i < 柱数; i++) {
      柱.push(0);
    }
    if (this.间隔数据 !== null && this.间隔数据.intervals !== null) {
      this.间隔数据.intervals.forEach((卡数: number, 间隔: number) => {
        if (间隔 < 0 || 间隔 > 上限) {
          return;
        }
        const 索引: number = Math.floor(间隔 / 步长);
        if (索引 >= 0 && 索引 < 柱数) {
          柱[索引] += 卡数;
        }
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

  /** 中位间隔（Anki Median interval = quantile 0.5，四舍五入） */
  private 取中位间隔(): number {
    return Math.round(取序列分位(this.取序列(), 0.5));
  }

  private 数据为空(): boolean {
    return this.柱缓存.length === 0 || this.取总计() === 0;
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
        // 直方图内联（原 @Builder 值传参参数被固化，牌组切换后纵轴/柱高不更新，2026-08-29 修复）
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
                  .backgroundColor(取间隔柱色((索引 + 1) / this.柱缓存.length))
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

        // 轴标签内联（@Builder 内读 @State 也不响应，数据变化时上限固化）
        Row() {
          Text('0')
            .fontSize(应用尺寸.字号_说明_小)
            .fontColor($r('app.color.text_tertiary'))
            .layoutWeight(1)
            .textAlign(TextAlign.Start)
          Text(`${this.显示上限}`)
            .fontSize(应用尺寸.字号_说明_小)
            .fontColor($r('app.color.text_tertiary'))
            .layoutWeight(1)
            .textAlign(TextAlign.End)
        }
        .width('100%')
        .padding({ left: 纵轴宽 })

        // 统计行内联（@Builder 内读 @State 也不响应，牌组切换后中位间隔固化）
        Row() {
          Text($r('app.string.stats_interval_median'))
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.text_secondary'))
          Blank()
          Text($r('app.string.stats_interval_median_days', this.取中位间隔()))
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.text_primary'))
        }
        .width('100%')
      }
    }
    .width('100%')
  }
}
