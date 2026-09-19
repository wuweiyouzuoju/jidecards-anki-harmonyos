// SPDX-License-Identifier: AGPL-3.0-or-later

// 难度分布卡：渲染 eases（SM-2 难度系数）或 difficulty（FSRS 难度）为直方图
// （对齐 Anki EaseGraph / DifficultyGraph）。
// 色带 RdYlGn：FSRS 难度 100 红 → 0 绿（domain [100,0]）；
// SM-2 难度系数 130 红 → 300 绿（domain [130,300]）。约 20 柱（Anki desiredBars=20）。
// FSRS 模式带范围切换（Anki PercentageRange，默认全部）：全部 [0,100] / 100% / 95% / 50%（加权分位截断）。
// 底部统计行：平均难度（后端 average 已是百分比口径）。
// Invariants: build 单根 Column；FSRS 优先取 difficulty，SM-2 取 eases。

import type { Eases } from '../../proto/messages/StatsMessages';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 取难度柱色, 取红黄绿 } from '../../model/统计色板';
import { 加权分位, 取轴域 } from '../../model/统计分箱';
import type { 轴域 } from '../../model/统计分箱';
import { 纵轴刻度, 纵轴宽 } from './图表轴';

/** 单柱：区间右端（百分比口径）+ 卡数 */
interface 难度柱 {
  右端: number;
  卡数: number;
}

@Component
export struct 难度分布卡 {
  @Prop @Watch('更新缓存') 难度数据: Eases | null = null;
  @Prop @Watch('更新缓存') FSRS难度: Eases | null = null;
  @Prop @Watch('更新缓存') 是否FSRS: boolean = false;
  @Prop @Watch('更新缓存') 范围索引: number = 0;
  @State private 柱缓存: 难度柱[] = [];
  @State private 域下限: number = 0;
  @State private 域上限: number = 100;
  private readonly 柱区高度: number = 108;
  private readonly 柱数上限: number = 20;

  aboutToAppear(): void {
    this.更新缓存();
  }

  private 取数据(): Eases | null {
    if (this.是否FSRS && this.FSRS难度 !== null) {
      return this.FSRS难度;
    }
    return this.难度数据;
  }

  /** 域：FSRS 难度按范围索引（全部 [0,100] / 100% / 95% / 50% 加权分位截断）；
   *  SM-2 难度系数固定 [130, 最大键+1]（Anki EaseGraph 无范围切换） */
  private 取域(): number[] {
    const 数据: Eases | null = this.取数据();
    if (数据 === null || 数据.eases === null || 数据.eases.size === 0) {
      return this.是否FSRS ? [0, 100] : [130, 300];
    }
    if (this.是否FSRS) {
      switch (this.范围索引) {
        case 0:
          return [0, 100];
        case 1: {
          let 最小: number = 100;
          let 最大: number = 0;
          数据.eases.forEach((卡数: number, 键: number) => {
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
          return [Math.floor(加权分位(数据.eases, 0.025)), Math.ceil(加权分位(数据.eases, 0.975))];
        default:
          return [Math.floor(加权分位(数据.eases, 0.25)), Math.ceil(加权分位(数据.eases, 0.75))];
      }
    }
    let 最大: number = 130;
    数据.eases.forEach((卡数: number, 键: number) => {
      if (卡数 > 0 && 键 > 最大) {
        最大 = 键;
      }
    });
    return [130, 最大 + 1];
  }

  /** 柱色：FSRS 按难度（右端/100，高=红）；SM-2 按难度系数（(值-130)/170，低=红高=绿） */
  private 取柱色(柱: 难度柱): string {
    if (this.是否FSRS) {
      return 取难度柱色(柱.右端 / 100);
    }
    return 取红黄绿((柱.右端 - 130) / 170);
  }

  更新缓存(): void {
    const 域: number[] = this.取域();
    this.域下限 = 域[0];
    this.域上限 = 域[1];
    const 数据: Eases | null = this.取数据();
    const 柱: 难度柱[] = [];
    if (数据 !== null && 数据.eases !== null && 域[1] > 域[0]) {
      const 步长: number = Math.max(1, Math.ceil((域[1] - 域[0]) / this.柱数上限));
      const 柱数: number = Math.floor((域[1] - 域[0]) / 步长) + 1;
      for (let i = 0; i < 柱数; i++) {
        柱.push({ 右端: 域[0] + (i + 1) * 步长, 卡数: 0 });
      }
      数据.eases.forEach((卡数: number, 键: number) => {
        if (键 < 域[0] || 键 > 域[1]) {
          return;
        }
        const 索引: number = Math.floor((键 - 域[0]) / 步长);
        if (索引 >= 0 && 索引 < 柱数) {
          柱[索引].卡数 += 卡数;
        }
      });
    }
    this.柱缓存 = 柱;
  }

  /** Y 轴域（上限与刻度绑定产出，柱高归一化用 域.上限） */
  private 取轴(): 轴域 {
    let 峰值: number = 0;
    for (let i = 0; i < this.柱缓存.length; i++) {
      if (this.柱缓存[i].卡数 > 峰值) {
        峰值 = this.柱缓存[i].卡数;
      }
    }
    return 取轴域(峰值, 4);
  }

  private 取总计(): number {
    let 总计: number = 0;
    for (let i = 0; i < this.柱缓存.length; i++) {
      总计 += this.柱缓存[i].卡数;
    }
    return 总计;
  }

  private 数据为空(): boolean {
    if (this.取数据() === null) {
      return true;
    }
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
        // 直方图内联（原 @Builder 值传参参数被固化，牌组切换后柱高/统计行不更新，2026-08-29 修复）
        Column({ space: 应用尺寸.间距_8 }) {
          Row() {
            纵轴刻度({
              刻度: this.取轴().刻度,
              高度: this.柱区高度
            })
            Row({ space: 1 }) {
              // key 含数据字段：数据变 → key 变 → 柱子重建（key 仅索引时数据变化 UI 冻结）
              ForEach(this.柱缓存, (柱: 难度柱, 索引: number) => {
                Stack({ alignContent: Alignment.Bottom }) {
                  Column()
                    .width('70%')
                    .height(Math.max(柱.卡数 / this.取轴().上限 * this.柱区高度, 柱.卡数 > 0 ? 4 : 0))
                    .backgroundColor(this.取柱色(柱))
                    .borderRadius(1)
                }
                .width('100%')
                .height(this.柱区高度)
                .layoutWeight(1)
              }, (柱: 难度柱, 索引: number) => `${索引}_${柱.右端}_${柱.卡数}`)
            }
            .layoutWeight(1)
            .height(this.柱区高度)
          }
          .width('100%')

          // 轴标签：域两端百分比
          Row() {
            Text(`${this.域下限}%`)
              .fontSize(应用尺寸.字号_说明_小)
              .fontColor($r('app.color.text_tertiary'))
              .layoutWeight(1)
              .textAlign(TextAlign.Start)
            Text(`${this.域上限}%`)
              .fontSize(应用尺寸.字号_说明_小)
              .fontColor($r('app.color.text_tertiary'))
              .layoutWeight(1)
              .textAlign(TextAlign.End)
          }
          .width('100%')
          .padding({ left: 纵轴宽 })

          // 平均难度（Anki average 直出行；后端已换算为百分比口径）
          if ((this.取数据() as Eases).average > 0) {
            Row() {
              Text($r('app.string.stats_ease_average_label'))
                .fontSize(应用尺寸.字号_正文_小)
                .fontColor($r('app.color.text_secondary'))
              Blank()
              // % 放入参数而非资源模式，避免资源格式化歧义出现双 %%
              Text($r('app.string.stats_ease_average', `${(this.取数据() as Eases).average.toFixed(0)}%`))
                .fontSize(应用尺寸.字号_正文_小)
                .fontColor($r('app.color.text_primary'))
            }
            .width('100%')
          }
        }
        .width('100%')
      }
    }
    .width('100%')
  }
}
