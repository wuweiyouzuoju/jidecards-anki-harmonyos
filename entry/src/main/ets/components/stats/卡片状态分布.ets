// SPDX-License-Identifier: AGPL-3.0-or-later

// 卡片状态分布：渲染 GraphsView.cardCounts（对齐 Anki CardCounts）。
// Anki 为饼图 + 彩色表格；本项目按"不引 Canvas"决策用 100% 堆叠比例条替代饼图，
// 系列色与表格列（色块/标签/数量/百分比/总计）与 Anki 一致：
// 新卡 #6baed6 / 学习中 #fd8d3c / 重学中 #fb6a4a / 年轻 #74c476 / 成熟 #31a354 /
// 已暂停 #FFDC41 / 已埋藏 #808080。
// 图内"分离暂停/搁置"复选框对齐 Anki CardCounts.svelte 的 InputBox checkbox
// （bind:checked 即时保存，autoSavingPrefs 行为）：切换只换前端数据源
// （includingInactive/excludingInactive 均在 GraphsResponse 中），无需重新请求。
// Invariants: separateInactive=true 时用 excludingInactive（暂停/埋藏单独计数）。

import type { CardCounts, CardCountsBreakdown } from '../../proto/messages/StatsMessages';
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 颜色键 } from '../../model/颜色主题';
import {
  色卡片_新卡, 色卡片_学习中, 色卡片_重学中,
  色卡片_年轻, 色卡片_成熟, 色卡片_已暂停, 色卡片_已埋藏
} from '../../model/统计色板';

interface 卡片状态项 {
  标签: Resource;
  /** 行唯一标识（ForEach key 用；数值作 key 时同为 0 的行 key 冲突会被吞行） */
  标识: string;
  数值: number;
  颜色: string;
}

@Component
export struct 卡片状态分布 {
  @Prop @Watch('数据已变') 卡片计数: CardCounts | null = null;
  @Prop @Watch('数据已变') 分离暂停: boolean = false;
  /** 渲染哨兵：@Prop 变化经 @Watch 递增，驱动本组件重新渲染
   *  （@Prop 直连 UI 在统计图表分区尾闭包内不触发刷新，实测 2026-08-29） */
  @State private 渲染指纹: number = 0;
  /** 复选框切换回调：父组件负责即时写 GraphPreferences（Anki autoSavingPrefs 行为） */
  on分离变更: (值: boolean) => void = (): void => {};
  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景: string = '#2F5FD0';

  private 数据已变(): void {
    this.渲染指纹 = this.渲染指纹 + 1;
  }

  private 取数据(): CardCountsBreakdown | null {
    if (this.卡片计数 === null) return null;
    if (this.分离暂停) {
      return this.卡片计数.excludingInactive ?? this.卡片计数.includingInactive;
    }
    return this.卡片计数.includingInactive ?? this.卡片计数.excludingInactive;
  }

  private 取总数(数据: CardCountsBreakdown): number {
    return 数据.newCards + 数据.learn + 数据.relearn + 数据.young + 数据.mature
      + 数据.suspended + 数据.buried;
  }

  private 取百分比(数值: number, 总数: number): string {
    if (总数 <= 0) {
      return '0';
    }
    return (数值 / 总数 * 100).toFixed(2);
  }

  /** 表格行顺序与 Anki 扇区顺序一致，恒显 7 行（Anki 官方 CardCounts 表格含
   *  Suspended/Buried 行；未分离时这两项为 0 也照显，与官方口径一致） */
  private 取条目(数据: CardCountsBreakdown): 卡片状态项[] {
    return [
      { 标签: $r('app.string.stats_cards_new'), 标识: 'new', 数值: 数据.newCards, 颜色: 色卡片_新卡 },
      { 标签: $r('app.string.stats_cards_learn'), 标识: 'learn', 数值: 数据.learn, 颜色: 色卡片_学习中 },
      { 标签: $r('app.string.stats_cards_relearn'), 标识: 'relearn', 数值: 数据.relearn, 颜色: 色卡片_重学中 },
      { 标签: $r('app.string.stats_cards_young'), 标识: 'young', 数值: 数据.young, 颜色: 色卡片_年轻 },
      { 标签: $r('app.string.stats_cards_mature'), 标识: 'mature', 数值: 数据.mature, 颜色: 色卡片_成熟 },
      { 标签: $r('app.string.stats_cards_suspended'), 标识: 'suspended', 数值: 数据.suspended, 颜色: 色卡片_已暂停 },
      { 标签: $r('app.string.stats_cards_buried'), 标识: 'buried', 数值: 数据.buried, 颜色: 色卡片_已埋藏 }
    ];
  }

  build() {
    Column({ space: 应用尺寸.间距_8 }) {
      // 分离暂停/搁置复选框（对齐 Anki CardCounts InputBox，恒显、切换即时生效）
      Row({ space: 应用尺寸.间距_7 }) {
        Checkbox()
          .select(this.分离暂停)
          .selectedColor(this.主色按钮背景)
          .onChange((值: boolean): void => {
            this.on分离变更(值);
          })
        Text($r('app.string.stats_counts_separate_inactive'))
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_secondary'))
      }
      .alignItems(VerticalAlign.Center)
      .width('100%')
      .justifyContent(FlexAlign.Center)

      // 渲染哨兵：读 渲染指纹 建立依赖，@Prop 变化 → @Watch → 指纹变化 → 本组件重新渲染
      Text(`${this.渲染指纹}`).fontSize(1).opacity(0).height(0)

      if (this.取数据() === null || this.取总数(this.取数据() as CardCountsBreakdown) === 0) {
        Text($r('app.string.stats_empty_section'))
          .fontSize(应用尺寸.字号_正文)
          .fontColor($r('app.color.text_tertiary'))
          .width('100%')
          .textAlign(TextAlign.Center)
          .padding({ top: 应用尺寸.间距_16, bottom: 应用尺寸.间距_16 })
      } else {
        // 分布内联（原 @Builder 值传参参数被固化，牌组切换后计数不更新，2026-08-29 修复）
        Column({ space: 应用尺寸.间距_10 }) {
          // 100% 堆叠比例条（替代 Anki 饼图的占比可视化）
          Row() {
            ForEach(this.取条目(this.取数据() as CardCountsBreakdown), (项: 卡片状态项) => {
              Column()
                .layoutWeight(项.数值 > 0 ? Math.max(项.数值, 1) : 0)
                .height(应用尺寸.进度条高度)
                .backgroundColor(项.颜色)
            }, (项: 卡片状态项) => `${项.标识}_${项.数值}`)
          }
          .width('100%')
          .height(应用尺寸.进度条高度)
          .borderRadius(应用尺寸.圆角_进度条)
          .clip(true)

          // 计数表：色块 + 标签 + 数量 + 百分比（Anki 表格列结构）
          Column({ space: 应用尺寸.间距_5 }) {
            ForEach(this.取条目(this.取数据() as CardCountsBreakdown), (项: 卡片状态项) => {
              Row({ space: 应用尺寸.间距_8 }) {
                Column()
                  .width(10)
                  .height(10)
                  .borderRadius(2)
                  .backgroundColor(项.颜色)
                Text(项.标签)
                  .fontSize(应用尺寸.字号_正文_小)
                  .fontColor($r('app.color.text_secondary'))
                  .layoutWeight(1)
                Text(`${项.数值}`)
                  .fontSize(应用尺寸.字号_正文_小)
                  .fontColor($r('app.color.text_primary'))
                  .width(48)
                  .textAlign(TextAlign.End)
                Text(`${this.取百分比(项.数值,
                  this.取总数(this.取数据() as CardCountsBreakdown))}%`)
                  .fontSize(应用尺寸.字号_正文_小)
                  .fontColor($r('app.color.text_tertiary'))
                  .width(64)
                  .textAlign(TextAlign.End)
              }
              .width('100%')
              .alignItems(VerticalAlign.Center)
            }, (项: 卡片状态项) => `${项.标识}_${项.数值}_${this.取百分比(项.数值,
              this.取总数(this.取数据() as CardCountsBreakdown))}`)
            // 总计行
            Row({ space: 应用尺寸.间距_8 }) {
              Text($r('app.string.stats_cards_total_label'))
                .fontSize(应用尺寸.字号_正文_小)
                .fontWeight(FontWeight.Medium)
                .fontColor($r('app.color.text_primary'))
                .layoutWeight(1)
              Text(`${this.取总数(this.取数据() as CardCountsBreakdown)}`)
                .fontSize(应用尺寸.字号_正文_小)
                .fontWeight(FontWeight.Medium)
                .fontColor($r('app.color.text_primary'))
            }
            .width('100%')
            .padding({ top: 应用尺寸.间距_4 })
            .border(SurfaceBorder.options({ top: 0.5 }))
          }
          .width('100%')
        }
        .width('100%')
      }
    }
    .width('100%')
  }
}
