// SPDX-License-Identifier: AGPL-3.0-or-later

// 预测卡：渲染 GraphsView.futureDue 为绿色渐变柱状图（对齐 Anki FutureDue）。
// 色带 Greens t∈[0.3,0.7]：积压/最近深绿 → 最远浅绿；范围切换 1月/3月/1年/全部；
// haveBacklog 时图内显示"积压"复选框（切换即写偏好，与 Anki autoSavingPrefs 一致）。
// 底部统计表：总计 / 平均 / 明日到期 / 日均负载。
// Invariants: build 单根 Column；负键 = 积压天数，仅在 显示积压 时参与渲染与总计。

import { forecastAverage } from '../../model/StatsOverview';
import type { FutureDue } from '../../proto/messages/StatsMessages';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 颜色键 } from '../../model/颜色主题';
import { 取预测柱色 } from '../../model/统计色板';
import { 取轴域 } from '../../model/统计分箱';
import type { 轴域 } from '../../model/统计分箱';
import { 纵轴刻度, 横轴日期条, 纵轴宽 } from './图表轴';

/** 单柱：位置（0=最左/最深积压）+ 数量 */
interface 预测柱 {
  数量: number;
  是否积压: boolean;
}

@Component
export struct 预测卡 {
  @Prop @Watch('更新缓存') 预测数据: FutureDue | null = null;
  @Prop @Watch('更新缓存') 显示积压: boolean = false;
  @Prop 是否显示全部: boolean = false;
  /** 积压复选框切换回调：父组件负责写 GraphPreferences（Anki 保存即生效） */
  on积压变更: (值: boolean) => void = (): void => {};
  @Prop @Watch('更新缓存') 范围索引: number = 0;
  @State private 柱缓存: 预测柱[] = [];
  private readonly 柱区高度: number = 108;
  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景: string = '#2F5FD0';

  aboutToAppear(): void {
    this.更新缓存();
  }

  /** 范围 → 前瞻天数（0=1月 1=3月 2=1年 3=全部取数据最大键） */
  private 取范围天数(): number {
    if (this.预测数据 === null || this.预测数据.futureDue === null) {
      return 31;
    }
    switch (this.范围索引) {
      case 0: return 31;
      case 1: return 90;
      case 2: return 365;
      default: {
        let 最大: number = 0;
        this.预测数据.futureDue.forEach((量: number, 键: number) => {
          if (量 > 0 && 键 > 最大) {
            最大 = 键;
          }
        });
        return Math.max(1, 最大);
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
    const 柱: 预测柱[] = [];
    if (this.预测数据 !== null && this.预测数据.futureDue !== null) {
      const 步长: number = this.取步长();
      const 前瞻天数: number = this.取范围天数();
      // 积压（负键）：仅在 显示积压 时分箱，排在最前
      if (this.显示积压) {
        let 最深积压: number = 0;
        this.预测数据.futureDue.forEach((量: number, 键: number) => {
          if (量 > 0 && 键 < 最深积压) {
            最深积压 = 键;
          }
        });
        const 积压柱数: number = Math.floor(Math.abs(最深积压) / 步长) + (最深积压 < 0 ? 1 : 0);
        for (let i = 0; i < 积压柱数; i++) {
          柱.push({ 数量: 0, 是否积压: true });
        }
        this.预测数据.futureDue.forEach((量: number, 键: number) => {
          if (键 < 0 && 量 > 0) {
            const 索引: number = Math.floor((-键 - 1) / 步长);
            if (索引 >= 0 && 索引 < 积压柱数) {
              柱[索引].数量 += 量;
            }
          }
        });
      }
      // 未来（0~前瞻天数）
      const 未来柱数: number = Math.floor(前瞻天数 / 步长) + 1;
      const 起始: number = 柱.length;
      for (let i = 0; i < 未来柱数; i++) {
        柱.push({ 数量: 0, 是否积压: false });
      }
      this.预测数据.futureDue.forEach((量: number, 键: number) => {
        if (键 >= 0 && 键 <= 前瞻天数) {
          const 索引: number = 起始 + Math.floor(键 / 步长);
          if (索引 >= 0 && 索引 < 柱.length) {
            柱[索引].数量 += 量;
          }
        }
      });
    }
    this.柱缓存 = 柱;
  }

  /** Y 轴域（上限与刻度绑定产出，柱高归一化用 域.上限） */
  private 取轴(): 轴域 {
    let 峰值: number = 0;
    for (let i = 0; i < this.柱缓存.length; i++) {
      if (this.柱缓存[i].数量 > 峰值) {
        峰值 = this.柱缓存[i].数量;
      }
    }
    return 取轴域(峰值, 4);
  }

  /** 积压跨度（天）：显示积压时的最深负键绝对值 */
  private 取积压跨度(): number {
    if (this.预测数据 === null || this.预测数据.futureDue === null || !this.显示积压) {
      return 0;
    }
    let 最深: number = 0;
    this.预测数据.futureDue.forEach((量: number, 键: number) => {
      if (量 > 0 && 键 < 最深) {
        最深 = 键;
      }
    });
    return Math.abs(最深);
  }

  /** 总计：显示范围内卡数（含积压则算入负键，Anki Total 语义） */
  private 取总计(): number {
    if (this.预测数据 === null || this.预测数据.futureDue === null) {
      return 0;
    }
    const 上限: number = this.取范围天数();
    let 总计: number = 0;
    this.预测数据.futureDue.forEach((量: number, 键: number) => {
      if ((键 >= 0 && 键 <= 上限) || (键 < 0 && this.显示积压)) {
        总计 += 量;
      }
    });
    return 总计;
  }

  /** 期间天数 = 前瞻天数 + 积压跨度（Anki periodDays = xMax - xMin） */
  private 取期间天数(): number {
    let 天数: number = this.取范围天数() + 1;
    if (this.预测数据 !== null && this.预测数据.futureDue !== null && this.显示积压) {
      let 最深: number = 0;
      this.预测数据.futureDue.forEach((量: number, 键: number) => {
        if (量 > 0 && 键 < 最深) {
          最深 = 键;
        }
      });
      天数 += Math.abs(最深);
    }
    return 天数;
  }

  /** 明日到期：future_due[1] */
  private 取明日到期(): number {
    if (this.预测数据 === null || this.预测数据.futureDue === null) {
      return 0;
    }
    const 值 = this.预测数据.futureDue.get(1);
    return 值 === undefined ? 0 : 值;
  }

  private 数据为空(): boolean {
    if (this.预测数据 === null || this.预测数据.futureDue === null) {
      return true;
    }
    return this.取总计() === 0;
  }

  build() {
    Column({ space: 应用尺寸.间距_8 }) {
      // 积压复选框：仅存在积压时显示（Anki Backlog checkbox）
      if (this.预测数据 !== null && this.预测数据.haveBacklog) {
        Row({ space: 应用尺寸.间距_7 }) {
          Checkbox()
            .select(this.显示积压)
            .selectedColor(this.主色按钮背景)
            .onChange((值: boolean): void => {
              this.on积压变更(值);
            })
          Text($r('app.string.stats_forecast_backlog'))
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.text_secondary'))
        }
        .alignItems(VerticalAlign.Center)
        .width('100%')
        .justifyContent(FlexAlign.Center)
      }

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
              ForEach(this.柱缓存, (柱: 预测柱, 索引: number) => {
                Stack({ alignContent: Alignment.Bottom }) {
                  Column()
                    .width('70%')
                    .height(Math.max(柱.数量 / this.取轴().上限 * this.柱区高度, 柱.数量 > 0 ? 4 : 0))
                    .backgroundColor(取预测柱色(索引 / Math.max(1, this.柱缓存.length - 1)))
                    .borderRadius(1)
                }
                .width('100%')
                .height(this.柱区高度)
                .layoutWeight(1)
              }, (柱: 预测柱, 索引: number) => `${索引}_${柱.数量}_${柱.是否积压}`)
            }
            .layoutWeight(1)
            .height(this.柱区高度)
          }
          .width('100%')

          // 横轴日期：左端 = 积压起点（无积压则今天），右端 = 前瞻末日
          横轴日期条({
            左端偏移天: -this.取积压跨度(),
            右端偏移天: this.取范围天数(),
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
            Text($r('app.string.stats_forecast_average', forecastAverage(this.取总计(), this.取期间天数())))
              .fontSize(应用尺寸.字号_正文_小)
              .fontColor($r('app.color.text_primary'))
          }
          .width('100%')
          Row() {
            Text($r('app.string.stats_forecast_due_tomorrow_label'))
              .fontSize(应用尺寸.字号_正文_小)
              .fontColor($r('app.color.text_secondary'))
            Blank()
            Text($r('app.string.stats_forecast_due_tomorrow', this.取明日到期()))
              .fontSize(应用尺寸.字号_正文_小)
              .fontColor($r('app.color.text_primary'))
          }
          .width('100%')
          Row() {
            Text($r('app.string.stats_forecast_daily_load_label'))
              .fontSize(应用尺寸.字号_正文_小)
              .fontColor($r('app.color.text_secondary'))
            Blank()
            Text($r('app.string.stats_forecast_daily_load_value', this.预测数据 !== null ? this.预测数据.dailyLoad : 0))
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
