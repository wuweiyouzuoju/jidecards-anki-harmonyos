// SPDX-License-Identifier: AGPL-3.0-or-later

// 复习卡：渲染 GraphsResponse.reviews.count（次数）或 reviews.time（用时）为
// 5 系列堆叠柱状图（对齐 Anki ReviewsGraph，含 showTime「时间」复选框）。
// 堆叠顺序自下而上：成熟(深绿)→年轻(浅绿)→重学(红)→学习(橙)→过滤(紫)，色带随时间从旧到新加深。
// 底部统计表对齐 Anki：学习天数（X/Y 天 Z%）/ 总计 / 期间日均 / 学习日日均；
// 时间模式总计/日均为时长（分钟/天），另加「平均答题时间」（秒/张 + 张/分钟）。
// Invariants: 数据键为距今天数（rslib 语义：0=今天，-1=昨天，-N=N 天前；正数=未来不出现）；build 单根 Column。

import { common } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import type { ReviewKindCounts } from '../../proto/messages/StatsMessages';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 颜色键 } from '../../model/颜色主题';
import { 取复习系列色 } from '../../model/统计色板';
import { 取轴域 } from '../../model/统计分箱';
import type { 轴域 } from '../../model/统计分箱';
import { 纵轴刻度, 横轴日期条, 纵轴宽 } from './图表轴';

/** 单柱数据：5 系列计数（下→上：成熟/年轻/重学/学习/过滤） */
interface 复习柱 {
  成熟: number;
  年轻: number;
  重学: number;
  学习: number;
  过滤: number;
}

@Component
export struct 复习卡 {
  @Prop @Watch('更新缓存') 复习计数: Map<number, ReviewKindCounts> | null = null;
  /** 每日答题用时（毫秒）：「时间」模式数据源（Anki ReviewsGraph reviewTime） */
  @Prop @Watch('更新缓存') 复习时间: Map<number, ReviewKindCounts> | null = null;
  @Prop 是否显示全部: boolean = false;
  @Prop @Watch('更新缓存') 范围索引: number = 0;
  @State private 显示时间: boolean = false;
  @State private 柱缓存: 复习柱[] = [];
  private readonly 柱区高度: number = 110;
  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景: string = '#2F5FD0';

  aboutToAppear(): void {
    this.更新缓存();
  }

  /** 当前数据源：时间模式取每日用时（毫秒），否则取每日次数 */
  private 取源数据(): Map<number, ReviewKindCounts> | null {
    if (this.显示时间 && this.复习时间 !== null && this.复习时间.size > 0) {
      return this.复习时间;
    }
    return this.复习计数;
  }

  /** 范围 → 回看天数上限（0=1月 1=3月 2=1年 3=全部；AllTime 上限按 count 源最深过去键，与 Anki 一致）。
   *  键语义（rslib reviews.rs:18 elapsed_secs_since(next_day_start)）：0=今天，-1=昨天，-N=N 天前。 */
  private 取范围天数(): number {
    if (this.复习计数 === null || this.复习计数.size === 0) {
      return 30;
    }
    switch (this.范围索引) {
      case 0: return 30;
      case 1: return 89;
      case 2: return 364;
      default: {
        let 最深: number = 0;
        this.复习计数.forEach((_计数: ReviewKindCounts, 天: number) => {
          if (天 < 最深) {
            最深 = 天;
          }
        });
        return Math.abs(最深);
      }
    }
  }

  /** 分箱步长：1月=1 天/柱，3月=2，1年=5，全部=ceil(天数/70)（与 Anki 70 柱上限一致） */
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
    const 源: Map<number, ReviewKindCounts> | null = this.取源数据();
    const 步长: number = this.取步长();
    const 天数上限: number = this.取范围天数();
    const 柱数: number = Math.floor(天数上限 / 步长) + 1;
    const 柱: 复习柱[] = [];
    for (let i = 0; i < 柱数; i++) {
      柱.push({ 成熟: 0, 年轻: 0, 重学: 0, 学习: 0, 过滤: 0 });
    }
    if (源 !== null) {
      源.forEach((计数: ReviewKindCounts, 天: number) => {
        // 键域 [-天数上限, 0]：负=过去（保留），0=今天，正=未来（丢弃）
        if (天 > 0 || 天 < -天数上限) {
          return;
        }
        // 索引映射：-上限→0（最旧，最左），0→柱数-1（今天，最右）
        const 索引: number = Math.floor((天 + 天数上限) / 步长);
        if (索引 >= 0 && 索引 < 柱数) {
          柱[索引].成熟 += 计数.mature;
          柱[索引].年轻 += 计数.young;
          柱[索引].重学 += 计数.relearn;
          柱[索引].学习 += 计数.learn;
          柱[索引].过滤 += 计数.filtered;
        }
      });
    }
    // 索引已按 旧→新 排列（索引 0=最旧，柱数-1=今天），无需 reverse
    this.柱缓存 = 柱;
    let 样例: string = '无';
    if (源 !== null && 源.size > 0) {
      const 首键: number[] = [];
      源.forEach((_v: ReviewKindCounts, k: number): void => { 首键.push(k); });
      首键.sort((a: number, b: number): number => a - b);
      const v: ReviewKindCounts | undefined = 源.get(首键[0]);
      样例 = `天${首键[0]}:成熟${v !== undefined ? v.mature : 'undef'}年轻${v !== undefined ? v.young : 'undef'}`;
    }
    hilog.info(0xFFFE, '复习卡', `缓存重算 源键数=${源 !== null ? 源.size : -1} 柱数=${柱.length} 总计=${this.取总计()} ${样例}`);
  }

  private 取柱总量(柱: 复习柱): number {
    return 柱.成熟 + 柱.年轻 + 柱.重学 + 柱.学习 + 柱.过滤;
  }

  /** Y 轴域（上限与刻度绑定产出）。时间模式在分钟域取轴域：
   *  上限换算回毫秒供柱高归一化，刻度保留分钟值供纵轴显示 m/h。 */
  private 取轴(): 轴域 {
    let 峰值: number = 0;
    for (let i = 0; i < this.柱缓存.length; i++) {
      const 总: number = this.取柱总量(this.柱缓存[i]);
      if (总 > 峰值) {
        峰值 = 总;
      }
    }
    if (峰值 === 0) {
      return 取轴域(1, 4);
    }
    if (this.处于时间模式()) {
      const 分域: 轴域 = 取轴域(Math.ceil(峰值 / 60000), 4);
      return { 上限: 分域.上限 * 60000, 刻度: 分域.刻度 };
    }
    return 取轴域(峰值, 4);
  }

  private 取总计(): number {
    let 总计: number = 0;
    for (let i = 0; i < this.柱缓存.length; i++) {
      总计 += this.取柱总量(this.柱缓存[i]);
    }
    return 总计;
  }

  /** 有复习记录的天数（Anki studiedDays = Σbin.length） */
  private 取学习天数(): number {
    const 源: Map<number, ReviewKindCounts> | null = this.取源数据();
    if (源 === null) {
      return 0;
    }
    const 上限: number = this.取范围天数();
    let 天数: number = 0;
    源.forEach((计数: ReviewKindCounts, 天: number) => {
      const 总: number = 计数.mature + 计数.young + 计数.relearn + 计数.learn + 计数.filtered;
      if (总 > 0 && 天 <= 0 && 天 >= -上限) {
        天数 += 1;
      }
    });
    return 天数;
  }

  /** 期间内复习总次数（count 源）：时间模式下计算平均答题时间用 */
  private 取总次数(): number {
    if (this.复习计数 === null) {
      return 0;
    }
    const 上限: number = this.取范围天数();
    let 总: number = 0;
    this.复习计数.forEach((计数: ReviewKindCounts, 天: number) => {
      if (天 <= 0 && 天 >= -上限) {
        总 += 计数.mature + 计数.young + 计数.relearn + 计数.learn + 计数.filtered;
      }
    });
    return 总;
  }

  /** 当前是否处于时间模式（有 time 数据且勾选） */
  private 处于时间模式(): boolean {
    return this.显示时间 && this.复习时间 !== null && this.复习时间.size > 0;
  }

  /** 平均答题秒数（时间模式：总秒 / 总次数；无效返回 0） */
  private 取平均答题秒(): number {
    const 总秒: number = this.取总计() / 1000;
    const 总次数: number = this.取总次数();
    if (总秒 <= 0 || 总次数 <= 0) {
      return 0;
    }
    return 总秒 / 总次数;
  }

  /** 每分钟答题卡数（时间模式；无效返回 0） */
  private 取每分钟卡数(): number {
    const 总秒: number = this.取总计() / 1000;
    const 总次数: number = this.取总次数();
    if (总秒 <= 0 || 总次数 <= 0) {
      return 0;
    }
    return 总次数 * 60 / 总秒;
  }

  private 取能力上下文(): common.UIAbilityContext | null {
    const context: common.UIAbilityContext | undefined =
      AppStorage.get<common.UIAbilityContext>('abilityContext');
    return context === undefined ? null : context;
  }

  /** 毫秒 → 本地化时长（X小时Y分 / X分Y秒），复用今日计数卡的格式化资源 */
  private 格式化时长(毫秒: number): string {
    const 总秒: number = Math.floor(毫秒 / 1000);
    const 小时: number = Math.floor(总秒 / 3600);
    const 分: number = Math.floor((总秒 % 3600) / 60);
    const ctx: common.UIAbilityContext | null = this.取能力上下文();
    if (小时 > 0) {
      return ctx !== null
        ? ctx.resourceManager.getStringSync($r('app.string.stats_time_format_hour').id, 小时, 分)
        : `${小时}h${分}m`;
    }
    const 秒: number = 总秒 % 60;
    return ctx !== null
      ? ctx.resourceManager.getStringSync($r('app.string.stats_time_format').id, 分, 秒)
      : `${分}m${秒}s`;
  }

  private 取期间天数(): number {
    return this.取范围天数() + 1;
  }

  private 数据为空(): boolean {
    return this.柱缓存.length === 0 || this.取总计() === 0;
  }

  build() {
    Column({ space: 应用尺寸.间距_8 }) {
      // 「时间」复选框（Anki ReviewsGraph showTime）：切换次数 ↔ 答题用时
      Row({ space: 应用尺寸.间距_7 }) {
        Checkbox()
          .select(this.显示时间)
          .selectedColor(this.主色按钮背景)
          .onChange((值: boolean): void => {
            this.显示时间 = 值;
            this.更新缓存();
          })
        Text($r('app.string.stats_reviews_time_checkbox'))
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_secondary'))
      }
      .alignItems(VerticalAlign.Center)
      .width('100%')
      .justifyContent(FlexAlign.Center)

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
              高度: this.柱区高度,
              是否时长: this.处于时间模式()
            })
            Row({ space: 1 }) {
              // key 含全部数据字段：数据变 → key 变 → 柱子重建（key 仅索引时数据变化 UI 冻结）
              ForEach(this.柱缓存, (柱: 复习柱, 索引: number) => {
                Stack({ alignContent: Alignment.Bottom }) {
                  // 自下而上：成熟→年轻→重学→学习→过滤
                  Column().width('70%').height(柱.成熟 / this.取轴().上限 * this.柱区高度)
                    .backgroundColor(取复习系列色(0, 索引 / Math.max(1, this.柱缓存.length - 1)))
                  Column().width('70%').height(柱.年轻 / this.取轴().上限 * this.柱区高度)
                    .backgroundColor(取复习系列色(1, 索引 / Math.max(1, this.柱缓存.length - 1)))
                  Column().width('70%').height(柱.重学 / this.取轴().上限 * this.柱区高度)
                    .backgroundColor(取复习系列色(2, 索引 / Math.max(1, this.柱缓存.length - 1)))
                  Column().width('70%').height(柱.学习 / this.取轴().上限 * this.柱区高度)
                    .backgroundColor(取复习系列色(3, 索引 / Math.max(1, this.柱缓存.length - 1)))
                  Column().width('70%').height(柱.过滤 / this.取轴().上限 * this.柱区高度)
                    .backgroundColor(取复习系列色(4, 索引 / Math.max(1, this.柱缓存.length - 1)))
                }
                .width('100%')
                .height(this.柱区高度)
                .layoutWeight(1)
              }, (柱: 复习柱, 索引: number) => `${索引}_${柱.成熟}_${柱.年轻}_${柱.重学}_${柱.学习}_${柱.过滤}`)
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

        this.渲染图例()

        // 统计表内联（原 @Builder 值传参的 Text 文本固化在首次渲染，牌组切换后数字不更新）
        Column({ space: 应用尺寸.间距_4 }) {
          Row() {
            Text($r('app.string.stats_reviews_days_studied'))
              .fontSize(应用尺寸.字号_正文_小)
              .fontColor($r('app.color.text_secondary'))
            Blank()
            Text($r('app.string.stats_reviews_days_of_total', this.取学习天数(),
              this.取期间天数(), `${(this.取学习天数() / this.取期间天数() * 100).toFixed(0)}%`))
              .fontSize(应用尺寸.字号_正文_小)
              .fontColor($r('app.color.text_primary'))
          }
          .width('100%')

          if (this.处于时间模式()) {
            Row() {
              Text($r('app.string.stats_total_label'))
                .fontSize(应用尺寸.字号_正文_小)
                .fontColor($r('app.color.text_secondary'))
              Blank()
              Text(this.格式化时长(this.取总计()))
                .fontSize(应用尺寸.字号_正文_小)
                .fontColor($r('app.color.text_primary'))
            }
            .width('100%')
            Row() {
              Text($r('app.string.stats_reviews_avg_period'))
                .fontSize(应用尺寸.字号_正文_小)
                .fontColor($r('app.color.text_secondary'))
              Blank()
              Text($r('app.string.stats_reviews_minutes_per_day',
                Math.round(this.取总计() / 1000 / 60 / this.取期间天数())))
                .fontSize(应用尺寸.字号_正文_小)
                .fontColor($r('app.color.text_primary'))
            }
            .width('100%')
            if (this.取学习天数() > 0 && this.取学习天数() < this.取期间天数()) {
              Row() {
                Text($r('app.string.stats_reviews_avg_studied'))
                  .fontSize(应用尺寸.字号_正文_小)
                  .fontColor($r('app.color.text_secondary'))
                Blank()
                Text($r('app.string.stats_reviews_minutes_per_day',
                  Math.round(this.取总计() / 1000 / 60 / this.取学习天数())))
                  .fontSize(应用尺寸.字号_正文_小)
                  .fontColor($r('app.color.text_primary'))
              }
              .width('100%')
            }
            if (this.取平均答题秒() > 0) {
              Row() {
                Text($r('app.string.stats_average_answer_time_label'))
                  .fontSize(应用尺寸.字号_正文_小)
                  .fontColor($r('app.color.text_secondary'))
                Blank()
                Text($r('app.string.stats_average_answer_time',
                  `${this.取平均答题秒().toFixed(1)}`,
                  `${this.取每分钟卡数().toFixed(1)}`))
                  .fontSize(应用尺寸.字号_正文_小)
                  .fontColor($r('app.color.text_primary'))
              }
              .width('100%')
            }
          } else {
            Row() {
              Text($r('app.string.stats_total_label'))
                .fontSize(应用尺寸.字号_正文_小)
                .fontColor($r('app.color.text_secondary'))
              Blank()
              Text($r('app.string.stats_reviews_total_count', this.取总计()))
                .fontSize(应用尺寸.字号_正文_小)
                .fontColor($r('app.color.text_primary'))
            }
            .width('100%')
            Row() {
              Text($r('app.string.stats_reviews_avg_period'))
                .fontSize(应用尺寸.字号_正文_小)
                .fontColor($r('app.color.text_secondary'))
              Blank()
              Text($r('app.string.stats_reviews_per_day', Math.round(this.取总计() / this.取期间天数())))
                .fontSize(应用尺寸.字号_正文_小)
                .fontColor($r('app.color.text_primary'))
            }
            .width('100%')
            if (this.取学习天数() > 0 && this.取学习天数() < this.取期间天数()) {
              Row() {
                Text($r('app.string.stats_reviews_avg_studied'))
                  .fontSize(应用尺寸.字号_正文_小)
                  .fontColor($r('app.color.text_secondary'))
                Blank()
                Text($r('app.string.stats_reviews_per_day', Math.round(this.取总计() / this.取学习天数())))
                  .fontSize(应用尺寸.字号_正文_小)
                  .fontColor($r('app.color.text_primary'))
              }
              .width('100%')
            }
          }
        }
        .width('100%')
        .alignItems(HorizontalAlign.Center)
      }
    }
    .width('100%')
  }

  @Builder
  private 渲染图例() {
    Flex({ wrap: FlexWrap.Wrap, justifyContent: FlexAlign.Center }) {
      this.图例项($r('app.string.stats_cards_mature'), 取复习系列色(0, 1))
      this.图例项($r('app.string.stats_cards_young'), 取复习系列色(1, 1))
      this.图例项($r('app.string.stats_cards_relearn'), 取复习系列色(2, 1))
      this.图例项($r('app.string.stats_cards_learn'), 取复习系列色(3, 1))
      this.图例项($r('app.string.stats_cards_filtered'), 取复习系列色(4, 1))
    }
    .width('100%')
  }

  @Builder
  private 图例项(标签: Resource, 颜色: string) {
    Row({ space: 应用尺寸.间距_4 }) {
      Column()
        .width(8)
        .height(8)
        .borderRadius(2)
        .backgroundColor(颜色)
      Text(标签)
        .fontSize(应用尺寸.字号_说明_小)
        .fontColor($r('app.color.text_secondary'))
    }
    .alignItems(VerticalAlign.Center)
    .margin({ right: 应用尺寸.间距_10, bottom: 应用尺寸.间距_4 })
  }
}
