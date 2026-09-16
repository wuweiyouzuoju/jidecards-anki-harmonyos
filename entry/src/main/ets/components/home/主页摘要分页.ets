// SPDX-License-Identifier: AGPL-3.0-or-later
import { ThemeTextSpans } from '../common/ThemeText';

// ========================================================
// @块ID UI-HOME-SUMMARY-001
// @名称 主页摘要分页
//
// @作用
// 主页顶部摘要卡：Swiper 8 页（可左右滑动，与桌面卡片形态一致）。
//   1. 今日进度 / 2. 记忆率 / 3. 今日计数 / 4. 卡片状态
//   5. 小时分布 / 6. 难度分布 / 7. 间隔分布 / 8. 未来到期预测
// 第1页用 主页快照数据 渲染今日摘要卡；第2-8页用 图表快照 渲染简化统计。
// 图表快照 为 null（图表未加载）时只显示第1页，不显示 Swiper。
//
// @输入
// 主页快照数据: 主页快照（今日完成/记忆率等）
// 图表快照: 桌面卡片数据 | null（提取卡片数据 转换的纯基础类型统计）
//
// @输出
// 渲染 Swiper 8 页或单页今日摘要卡
//
// @副作用
// 无。
// ========================================================

import { 今日摘要卡 } from '../今日摘要卡';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 颜色键 } from '../../model/颜色主题';
import { 桌面卡片数据 } from '../../model/桌面卡片数据存储';
import { 主页快照 } from '../../model/主页模型';
import {
  取小时柱色, 取难度柱色, 取间隔柱色, 取预测柱色,
  色卡片_新卡, 色卡片_学习中, 色卡片_重学中, 色卡片_年轻,
  色卡片_成熟, 色卡片_已暂停, 色卡片_已埋藏
} from '../../model/统计色板';

// ========================================================
// 计数格组件：独立 struct 而非 @Builder——@Builder 按值传参不响应状态变化
// （ArkUI 限制），图表快照更新后数值不刷新（学完卡回主页卡片数据停留旧值的根因）。
// @Prop 数值变化自动触发重渲染。
// ========================================================
@Component
struct 计数格组件 {
  @Prop 标签: string = '';
  @Prop 数值: number = 0;
  /** 色型：primary/new/learn/review 主题色标记，或静态 hex */
  @Prop 色型: string = 'primary';
  @StorageProp(颜色键.动作主色) private 动作主色: string = '#2F5FD0';
  @StorageProp(颜色键.新卡计数色) private 新卡计数色: string = '#3974D9';
  @StorageProp(颜色键.学习中计数色) private 学习中计数色: string = '#B56A22';
  @StorageProp(颜色键.复习中计数色) private 复习中计数色: string = '#7056C8';

  private 计数色取(色型: string): string {
    switch (色型) {
      case 'primary': return this.动作主色;
      case 'new': return this.新卡计数色;
      case 'learn': return this.学习中计数色;
      case 'review': return this.复习中计数色;
      default: return 色型;
    }
  }

  build() {
    Column({ space: 2 }) {
      Text(this.数值.toString())
        .fontSize(应用尺寸.字号_指标)
        .fontWeight(FontWeight.Bold)
        .fontColor(this.计数色取(this.色型))
      Text(this.标签)
        .fontSize(应用尺寸.字号_正文_小)
        .fontColor($r('app.color.text_secondary'))
    }
    .layoutWeight(1)
    .alignItems(HorizontalAlign.Center)
  }
}

// ========================================================
// 柱状图组件：同 计数格组件 原因抽成 struct（@Builder 数组按值传参不刷新）。
// 柱色跟随统计页同款 Anki 官方色带（取色口径与统计页各图一致）：
//   hour=小时分布 Blues 按计数归一化 / difficulty=RdYlGn 按难度键归一化
//   interval=间隔 Blues 按位置 / future=预测 Greens 按位置
// ========================================================
@Component
struct 柱状图组件 {
  /** 计数：柱高数据 */
  @Prop 计数: number[] = [];
  /** 键：难度取色用（难度桶百分比），其余色带可传空 */
  @Prop 键: number[] = [];
  /** 色带类型：hour / difficulty / interval / future */
  @Prop 色带: string = 'hour';

  /** 计数峰值：柱高与小时柱色归一化基准 */
  private 峰值(): number {
    let 最大值: number = 1;
    for (let i: number = 0; i < this.计数.length; i++) {
      if (this.计数[i] > 最大值) {
        最大值 = this.计数[i];
      }
    }
    return 最大值;
  }

  /** 柱高：按计数峰值等比缩放，最小 2vp 保证可见 */
  private 柱高(值: number): number {
    if (值 <= 0) {
      return 2;
    }
    return Math.max(值 / this.峰值() * 70, 2);
  }

  /** 柱色：按色带类型 + 统计页归一化口径取 Anki 官方色 */
  private 柱色(索引: number): string {
    const 柱数: number = this.计数.length;
    switch (this.色带) {
      case 'difficulty':
        return 取难度柱色((索引 < this.键.length ? this.键[索引] : 0) / 100);
      case 'interval':
        return 取间隔柱色((索引 + 1) / Math.max(1, 柱数));
      case 'future':
        return 取预测柱色(索引 / Math.max(1, 柱数 - 1));
      default:
        return 取小时柱色((索引 < this.计数.length ? this.计数[索引] : 0) / this.峰值());
    }
  }

  build() {
    Row({ space: 1 }) {
      ForEach(this.计数, (值: number, 索引: number) => {
        Stack({ alignContent: Alignment.Bottom }) {
          Column()
            .width('70%')
            .height(this.柱高(值))
            .backgroundColor(this.柱色(索引))
            .borderRadius(1)
        }
        .width('100%')
        .height('100%')
        .layoutWeight(1)
      }, (值: number, 索引: number) => `${索引}_${值}`)
    }
    .width('100%')
    .height(70)
    .alignItems(VerticalAlign.Bottom)
  }
}

@Component
export struct 主页摘要分页 {
  @Prop 主页快照数据: 主页快照;
  @Prop 图表快照: 桌面卡片数据 | null = null;
  @StorageProp(颜色键.动作主色) private 动作主色: string = '#2F5FD0';
  @StorageProp(颜色键.主色容器) private 主色容器色: string = '#E8EEFC';
  @StorageProp(颜色键.新卡计数色) private 新卡计数色: string = '#3974D9';
  @StorageProp(颜色键.学习中计数色) private 学习中计数色: string = '#B56A22';
  @StorageProp(颜色键.复习中计数色) private 复习中计数色: string = '#7056C8';
  @StorageProp('系统语言') private 系统语言: string = 'zh-Hans';
  @State private 当前页: number = 0;

  // 本地化文案：系统语言为 en 时返回英，否则返回中
  private t(中: string, 英: string): string {
    return this.系统语言.startsWith('en') ? 英 : 中;
  }

  // ========================================================
  // 页1：今日进度（复用 今日摘要卡 组件）
  // ========================================================
  @Builder
  今日进度页() {
    今日摘要卡({
      已完成数: this.主页快照数据.today.completedCount,
      待学数: this.主页快照数据.today.pendingCount,
      牌组数: this.主页快照数据.today.deckCount,
      今日答对率: this.主页快照数据.memory.state === 'today_answered'
        ? 1 - this.主页快照数据.memory.todayAgainRate : -1
    })
  }

  // ========================================================
  // 页2：记忆率
  // ========================================================
  @Builder
  记忆率页() {
    Column({ space: 应用尺寸.间距_8 }) {
      Row() {
        Text(this.t('记忆可提取性', 'Card Retrievability'))
          .fontSize(应用尺寸.字号_摘要标题)
          .fontWeight(FontWeight.Bold)
          .fontColor($r('app.color.text_primary'))
          .layoutWeight(1)
        Text(this.格式化时间(this.图表快照!.更新时间))
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_secondary'))
      }
      .width('100%')

      if (this.图表快照!.fsrs已启用) {
        Row() {
          Text() { ThemeTextSpans(`${Math.round(this.图表快照!.记忆率)}%`, [], this.getUIContext()) }
            .fontSize(32)
            .fontWeight(FontWeight.Bold)
            .fontColor(this.动作主色)
          Text(this.t('全库平均可提取性', 'Avg Retrieval'))
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.text_secondary'))
            .margin({ left: 8, bottom: 4 })
        }
        .width('100%')
        .layoutWeight(1)
        .alignItems(VerticalAlign.Bottom)
      } else {
        Column() {
          Text(this.t('未启用 FSRS', 'FSRS not enabled'))
            .fontSize(应用尺寸.字号_正文)
            .fontColor($r('app.color.text_secondary'))
          Text(this.t('开启 FSRS 后显示全库记忆率', 'Enable FSRS to show retention'))
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.text_secondary'))
            .margin({ top: 4 })
        }
        .width('100%')
        .layoutWeight(1)
        .justifyContent(FlexAlign.Center)
      }
    }
    .width('100%')
    .height(150)
    .padding(应用尺寸.卡片内边距)
    .backgroundColor($r('app.color.surface_card'))
    .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
    .borderRadius(应用尺寸.圆角_卡片)
  }

  // ========================================================
  // 页3：今日计数
  // ========================================================
  @Builder
  今日计数页() {
    Column({ space: 应用尺寸.间距_8 }) {
      Row() {
        Text(this.t('今日', 'Today'))
          .fontSize(应用尺寸.字号_摘要标题)
          .fontWeight(FontWeight.Bold)
          .fontColor($r('app.color.text_primary'))
          .layoutWeight(1)
      }
      .width('100%')

      Row({ space: 应用尺寸.间距_10 }) {
        计数格组件({ 标签: this.t('答题', 'Reviews'), 数值: this.图表快照!.今日答题数, 色型: 'primary' })
        计数格组件({ 标签: this.t('正确', 'Correct'), 数值: this.图表快照!.今日正确数, 色型: '#238463' })
      }
      .width('100%')

      Row({ space: 应用尺寸.间距_10 }) {
        计数格组件({ 标签: this.t('学习', 'New'), 数值: this.图表快照!.今日新学数, 色型: 'new' })
        计数格组件({ 标签: this.t('复习', 'Review'), 数值: this.图表快照!.今日复习数, 色型: 'review' })
        计数格组件({ 标签: this.t('重学', 'Relearn'), 数值: this.图表快照!.今日重学数, 色型: 'learn' })
      }
      .width('100%')
    }
    .width('100%')
    .height(150)
    .padding(应用尺寸.卡片内边距)
    .backgroundColor($r('app.color.surface_card'))
    .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
    .borderRadius(应用尺寸.圆角_卡片)
    .justifyContent(FlexAlign.Center)
  }

  // 难度刻度标签：桶数 >=5 时取五等分点（0/25%/50%/75%/100% 索引）的难度值；
  // <5 时逐桶显示。与桌面卡片同款，让三张柱图基线统一
  private 难度刻度标签(): string[] {
    const 桶: [number, number][] = this.图表快照!.难度分布.桶;
    const n: number = 桶.length;
    if (n === 0) {
      return [];
    }
    if (n < 5) {
      const 标签: string[] = [];
      for (let i: number = 0; i < n; i++) {
        标签.push(`${桶[i][0]}%`);
      }
      return 标签;
    }
    return [
      `${桶[0][0]}%`,
      `${桶[Math.round((n - 1) * 0.25)][0]}%`,
      `${桶[Math.round((n - 1) * 0.5)][0]}%`,
      `${桶[Math.round((n - 1) * 0.75)][0]}%`,
      `${桶[n - 1][0]}%`
    ];
  }

  // 间隔刻度标签：同款五等分逻辑，显示间隔天数（与统计页 `${键}天` 标签一致）
  private 间隔刻度标签(): string[] {
    const 桶: [number, number][] = this.图表快照!.间隔分布;
    const n: number = 桶.length;
    if (n === 0) {
      return [];
    }
    if (n < 5) {
      const 标签: string[] = [];
      for (let i: number = 0; i < n; i++) {
        标签.push(`${桶[i][0]}天`);
      }
      return 标签;
    }
    return [
      `${桶[0][0]}天`,
      `${桶[Math.round((n - 1) * 0.25)][0]}天`,
      `${桶[Math.round((n - 1) * 0.5)][0]}天`,
      `${桶[Math.round((n - 1) * 0.75)][0]}天`,
      `${桶[n - 1][0]}天`
    ];
  }

  // ========================================================
  // 页4：卡片状态
  // ========================================================
  @Builder
  卡片状态页() {
    Column({ space: 应用尺寸.间距_8 }) {
      Row() {
        Text(this.t('卡片数量', 'Card States'))
          .fontSize(应用尺寸.字号_摘要标题)
          .fontWeight(FontWeight.Bold)
          .fontColor($r('app.color.text_primary'))
          .layoutWeight(1)
      }
      .width('100%')

      // 系列色对齐 Anki schemeBlues/Oranges/Reds/Greens（与统计页卡片数量图、桌面卡片一致）
      Row({ space: 应用尺寸.间距_10 }) {
        计数格组件({ 标签: this.t('未学习', 'New'), 数值: this.图表快照!.卡片状态.新卡, 色型: 色卡片_新卡 })
        计数格组件({ 标签: this.t('学习中', 'Learning'), 数值: this.图表快照!.卡片状态.学习中, 色型: 色卡片_学习中 })
        计数格组件({ 标签: this.t('重学中', 'Relearn'), 数值: this.图表快照!.卡片状态.重学中, 色型: 色卡片_重学中 })
        计数格组件({ 标签: this.t('欠熟练', 'Young'), 数值: this.图表快照!.卡片状态.年轻, 色型: 色卡片_年轻 })
      }
      .width('100%')

      Row({ space: 应用尺寸.间距_10 }) {
        计数格组件({ 标签: this.t('已熟练', 'Mature'), 数值: this.图表快照!.卡片状态.成熟, 色型: 色卡片_成熟 })
        计数格组件({ 标签: this.t('已暂停', 'Suspended'), 数值: this.图表快照!.卡片状态.暂停, 色型: 色卡片_已暂停 })
        计数格组件({ 标签: this.t('已搁置', 'Buried'), 数值: this.图表快照!.卡片状态.埋藏, 色型: 色卡片_已埋藏 })
      }
      .width('100%')
    }
    .width('100%')
    .height(150)
    .padding(应用尺寸.卡片内边距)
    .backgroundColor($r('app.color.surface_card'))
    .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
    .borderRadius(应用尺寸.圆角_卡片)
    .justifyContent(FlexAlign.Center)
  }

  // ========================================================
  // 页5：小时分布（24 柱简化柱状图，窗口跟随统计页小时分布卡的档位选择）
  // ========================================================
  private 小时分布窗口标签(): string {
    switch (this.图表快照?.小时分布窗口 ?? 0) {
      case 1: return this.t('逐小时分析（近3月）', 'Hourly (3M)');
      case 2: return this.t('逐小时分析（近1年）', 'Hourly (1Y)');
      case 3: return this.t('逐小时分析（全部）', 'Hourly (All)');
      default: return this.t('逐小时分析（近1月）', 'Hourly (1M)');
    }
  }

  @Builder
  小时分布页() {
    // 间距收紧为 4：加小时刻度行后 8 间距会超出卡片固定高度 150
    Column({ space: 应用尺寸.间距_4 }) {
      Row() {
        Text(this.小时分布窗口标签())
          .fontSize(应用尺寸.字号_摘要标题)
          .fontWeight(FontWeight.Bold)
          .fontColor($r('app.color.text_primary'))
          .layoutWeight(1)
      }
      .width('100%')

      柱状图组件({
        计数: this.图表快照!.小时分布.map((项: [number, number]): number => 项[0]),
        键: [],
        色带: 'hour'
      })

      // 小时刻度：五等分居中，五个数字中心落点 10%/30%/50%/70%/90%，间距严格相等
      //（与统计页小时分布卡、桌面卡片同款）
      Row() {
        Text('0')
          .fontSize(应用尺寸.字号_说明_小)
          .fontColor($r('app.color.text_tertiary'))
          .layoutWeight(1)
          .textAlign(TextAlign.Center)
        Text('6')
          .fontSize(应用尺寸.字号_说明_小)
          .fontColor($r('app.color.text_tertiary'))
          .layoutWeight(1)
          .textAlign(TextAlign.Center)
        Text('12')
          .fontSize(应用尺寸.字号_说明_小)
          .fontColor($r('app.color.text_tertiary'))
          .layoutWeight(1)
          .textAlign(TextAlign.Center)
        Text('18')
          .fontSize(应用尺寸.字号_说明_小)
          .fontColor($r('app.color.text_tertiary'))
          .layoutWeight(1)
          .textAlign(TextAlign.Center)
        Text('23')
          .fontSize(应用尺寸.字号_说明_小)
          .fontColor($r('app.color.text_tertiary'))
          .layoutWeight(1)
          .textAlign(TextAlign.Center)
      }
      .width('100%')
    }
    .width('100%')
    .height(150)
    .padding(应用尺寸.卡片内边距)
    .backgroundColor($r('app.color.surface_card'))
    .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
    .borderRadius(应用尺寸.圆角_卡片)
  }

  // ========================================================
  // 页6：难度分布
  // ========================================================
  @Builder
  难度分布页() {
    // 间距与其他柱图页统一为 4：加刻度行后 8 间距会超出卡片固定高度 150
    Column({ space: 应用尺寸.间距_4 }) {
      Row() {
        Text(this.t('卡片难度', 'Difficulty'))
          .fontSize(应用尺寸.字号_摘要标题)
          .fontWeight(FontWeight.Bold)
          .fontColor($r('app.color.text_primary'))
          .layoutWeight(1)
        Text(this.t(`平均 ${Math.round(this.图表快照!.难度分布.平均)}%`, `Avg ${Math.round(this.图表快照!.难度分布.平均)}%`))
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_secondary'))
      }
      .width('100%')

      柱状图组件({
        计数: this.图表快照!.难度分布.桶.map((项: [number, number]): number => 项[1]),
        键: this.图表快照!.难度分布.桶.map((项: [number, number]): number => 项[0]),
        色带: 'difficulty'
      })

      // 难度刻度：五等分居中（与小时分布刻度行、桌面卡片同款），柱图基线与其他柱图页统一
      Row() {
        ForEach(this.难度刻度标签(), (标签: string) => {
          Text(标签)
            .fontSize(应用尺寸.字号_说明_小)
            .fontColor($r('app.color.text_tertiary'))
            .layoutWeight(1)
            .textAlign(TextAlign.Center)
        }, (标签: string) => 标签)
      }
      .width('100%')
    }
    .width('100%')
    .height(150)
    .padding(应用尺寸.卡片内边距)
    .backgroundColor($r('app.color.surface_card'))
    .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
    .borderRadius(应用尺寸.圆角_卡片)
  }

  // ========================================================
  // 页7：间隔分布
  // ========================================================
  @Builder
  间隔分布页() {
    // 间距与小时分布/未来到期页统一为 4：翻页时柱图起始高度一致
    Column({ space: 应用尺寸.间距_4 }) {
      Row() {
        Text(this.t('复习间隔', 'Review Intervals'))
          .fontSize(应用尺寸.字号_摘要标题)
          .fontWeight(FontWeight.Bold)
          .fontColor($r('app.color.text_primary'))
          .layoutWeight(1)
      }
      .width('100%')

      柱状图组件({
        计数: this.图表快照!.间隔分布.map((项: [number, number]): number => 项[1]),
        键: [],
        色带: 'interval'
      })

      // 间隔刻度：五等分居中显示间隔天数（与小时分布刻度行、桌面卡片同款），
      // 柱图基线与其他柱图页统一
      Row() {
        ForEach(this.间隔刻度标签(), (标签: string) => {
          Text(标签)
            .fontSize(应用尺寸.字号_说明_小)
            .fontColor($r('app.color.text_tertiary'))
            .layoutWeight(1)
            .textAlign(TextAlign.Center)
        }, (标签: string) => 标签)
      }
      .width('100%')
    }
    .width('100%')
    .height(150)
    .padding(应用尺寸.卡片内边距)
    .backgroundColor($r('app.color.surface_card'))
    .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
    .borderRadius(应用尺寸.圆角_卡片)
  }

  // ========================================================
  // 页8：未来到期预测（整月 30 天细条）
  // ========================================================
  @Builder
  未来到期页() {
    Column({ space: 应用尺寸.间距_4 }) {
      Row() {
        Text(this.t('预测', 'Future Due'))
          .fontSize(应用尺寸.字号_摘要标题)
          .fontWeight(FontWeight.Bold)
          .fontColor($r('app.color.text_primary'))
          .layoutWeight(1)
      }
      .width('100%')

      柱状图组件({
        计数: this.图表快照!.未来到期.map((项: [number, number]): number => 项[1]),
        键: [],
        色带: 'future'
      })

      // 天数刻度：与小时分布页刻度行同款，今/+15/+29
      Row() {
        Text(this.t('今', 'Today'))
          .fontSize(应用尺寸.字号_说明_小)
          .fontColor($r('app.color.text_tertiary'))
          .layoutWeight(1)
          .textAlign(TextAlign.Start)
        Text('+15')
          .fontSize(应用尺寸.字号_说明_小)
          .fontColor($r('app.color.text_tertiary'))
          .layoutWeight(1)
          .textAlign(TextAlign.Center)
        Text('+29')
          .fontSize(应用尺寸.字号_说明_小)
          .fontColor($r('app.color.text_tertiary'))
          .layoutWeight(1)
          .textAlign(TextAlign.End)
      }
      .width('100%')
    }
    .width('100%')
    .height(150)
    .padding(应用尺寸.卡片内边距)
    .backgroundColor($r('app.color.surface_card'))
    .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
    .borderRadius(应用尺寸.圆角_卡片)
  }

  // ========================================================
  // 通用柱状图/计数格已抽成独立 struct 组件（柱状图组件/计数格组件）：
  // @Builder 按值传参不响应状态变化，图表快照更新后不刷新。
  // ========================================================

  private 格式化时间(毫秒: number): string {
    if (毫秒 <= 0) return '';
    const 日期: Date = new Date(毫秒);
    const 时: number = 日期.getHours();
    const 分: number = 日期.getMinutes();
    const 补零 = (n: number): string => n < 10 ? `0${n}` : `${n}`;
    const 前缀: string = this.t('更新于', 'Updated');
    return `${前缀} ${补零(时)}:${补零(分)}`;
  }

  build() {
    if (this.图表快照 === null) {
      // 图表未加载：只显示今日进度单页
      this.今日进度页()
    } else {
      // 指示点叠加在卡片顶部（与桌面卡片一致：卡片内部顶部）
      Stack({ alignContent: Alignment.Top }) {
        Swiper() {
          this.今日进度页()
          this.记忆率页()
          this.今日计数页()
          this.卡片状态页()
          this.小时分布页()
          this.难度分布页()
          this.间隔分布页()
          this.未来到期页()
        }
        .indicator(false)
        .loop(true)
        .autoPlay(false)
        .onAnimationStart((_index: number, targetIndex: number) => {
          this.当前页 = targetIndex;
        })
        .onChange((index: number) => {
          this.当前页 = index;
        })

        // 翻页指示点：叠加在卡片顶部中央
        Row({ space: 4 }) {
          ForEach([0, 1, 2, 3, 4, 5, 6, 7], (i: number) => {
            Circle()
              .width(i === this.当前页 ? 6 : 4)
              .height(i === this.当前页 ? 6 : 4)
              .fill(i === this.当前页 ? this.动作主色 : $r('app.color.text_secondary'))
              .opacity(i === this.当前页 ? 1 : 0.4)
          }, (i: number) => `${i}`)
        }
        .width('100%')
        .height(10)
        .justifyContent(FlexAlign.Center)
        .margin({ top: 6 })
      }
      .width('100%')
    }
  }
}
