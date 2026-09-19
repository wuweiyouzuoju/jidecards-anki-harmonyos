// SPDX-License-Identifier: AGPL-3.0-or-later

// 新增卡：渲染 GraphsResponse.added 为直方图（对齐 Anki AddedGraph）。
// 蓝色渐变柱（最近深蓝 → 最旧浅蓝，Blues t∈[0.3,0.7]）；
// 底部统计表：总计 / 日均。数据键为负数距今天数（0=今天，-1=昨天）。
// Invariants: build 单根 Column；范围切换为前端切片（数据已含全量 added）。

import type { Added } from '../../proto/messages/StatsMessages';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 取新增柱色 } from '../../model/统计色板';
import { 取轴域 } from '../../model/统计分箱';
import type { 轴域 } from '../../model/统计分箱';
import { 纵轴刻度, 横轴日期条, 纵轴宽 } from './图表轴';

@Component
export struct 新增卡 {
  @Prop @Watch('更新缓存') 新增数据: Added | null = null;
  @Prop 是否显示全部: boolean = false;
  @Prop @Watch('更新缓存') 范围索引: number = 0;
  @State private 柱缓存: number[] = [];
  private readonly 柱区高度: number = 108;

  aboutToAppear(): void {
    this.更新缓存();
  }

  /** 范围 → 回看天数（键为负数：0=今天，-31=31 天前） */
  private 取范围天数(): number {
    if (this.新增数据 === null || this.新增数据.added === null || this.新增数据.added.size === 0) {
      return 31;
    }
    switch (this.范围索引) {
      case 0: return 31;
      case 1: return 90;
      case 2: return 365;
      default: {
        let 最旧: number = 0;
        this.新增数据.added.forEach((量: number, 键: number) => {
          if (量 > 0 && 键 < 最旧) {
            最旧 = 键;
          }
        });
        return Math.abs(最旧);
      }
    }
  }

  /** 分箱步长：1月=1 天/柱，3月=2，1年=5，全部=ceil(天数/70)（Anki 70 柱上限） */
  private 取步长(): number {
    const 天数: number = this.取范围天数();
    if (this.范围索引 === 0) {
      return 1;
    }
    if (this.范围索引 === 1) {
      return 2;
    }
    if (this.范围索引 === 2) {
      return 5;
    }
    return Math.max(1, Math.ceil((天数 + 1) / 70));
  }

  更新缓存(): void {
    const 步长: number = this.取步长();
    const 天数上限: number = this.取范围天数();
    const 柱数: number = Math.floor(天数上限 / 步长) + 1;
    const 柱: number[] = [];
    for (let i = 0; i < 柱数; i++) {
      柱.push(0);
    }
    if (this.新增数据 !== null && this.新增数据.added !== null) {
      this.新增数据.added.forEach((量: number, 键: number) => {
        const 距今: number = -键;
        if (距今 < 0 || 距今 > 天数上限) {
          return;
        }
        const 索引: number = Math.floor(距今 / 步长);
        if (索引 >= 0 && 索引 < 柱数) {
          柱[索引] += 量;
        }
      });
    }
    // 显示顺序：旧→新（左→右）
    柱.reverse();
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

  private 取期间天数(): number {
    return this.取范围天数();
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
        // 柱区内联（原 @Builder 值传参参数被固化，牌组切换后纵轴/柱高不更新，2026-08-29 修复）
        Column({ space: 应用尺寸.间距_2 }) {
          Row() {
            纵轴刻度({
              刻度: this.取轴().刻度,
              高度: this.柱区高度
            })
            Row({ space: 1 }) {
              // key 含数据字段：数据变 → key 变 → 柱子重建（key 仅索引时数据变化 UI 冻结）
              ForEach(this.柱缓存, (数量: number, 索引: number) => {
                Stack({ alignContent: Alignment.Bottom }) {
                  Column()
                    .width('70%')
                    .height(Math.max(数量 / this.取轴().上限 * this.柱区高度, 数量 > 0 ? 4 : 0))
                    .backgroundColor(取新增柱色(1 - 索引 / Math.max(1, this.柱缓存.length - 1)))
                    .borderRadius(1)
                }
                .width('100%')
                .height(this.柱区高度)
                .layoutWeight(1)
              }, (数量: number, 索引: number) => `${索引}_${数量}`)
            }
            .layoutWeight(1)
            .height(this.柱区高度)
          }
          .width('100%')

          // 横轴日期：左端 = 范围最早日，右端 = 今天
          横轴日期条({
            左端偏移天: -this.取范围天数(),
            右端偏移天: 0,
            轴左宽: 纵轴宽
          })
        }
        .width('100%')

        // 统计表内联（原 @Builder 值传参的 Text 文本固化在首次渲染，牌组切换后数字不更新）
        Column({ space: 应用尺寸.间距_4 }) {
          Row() {
            Text($r('app.string.stats_total_label'))
              .fontSize(应用尺寸.字号_正文_小)
              .fontColor($r('app.color.text_secondary'))
            Blank()
            Text($r('app.string.stats_forecast_total', this.取总计()))
              .fontSize(应用尺寸.字号_正文_小)
              .fontColor($r('app.color.text_primary'))
          }
          .width('100%')
          Row() {
            Text($r('app.string.stats_average_label'))
              .fontSize(应用尺寸.字号_正文_小)
              .fontColor($r('app.color.text_secondary'))
            Blank()
            Text($r('app.string.stats_forecast_average', `${Math.round(this.取总计() / this.取期间天数())}`))
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
}
