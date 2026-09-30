// SPDX-License-Identifier: AGPL-3.0-or-later
import { HelpLabel } from '../common/HelpLabel';

// 统计图表分区：统计页内每个图表区块的统一外壳（标题 + 内容 + 卡片样式）。
// 用 @BuilderParam 槽位接收内容，visible=false 时不渲染（由偏好面板控制）。
// 可选 i 帮助按钮：传入 帮助标题/帮助正文 时标题右侧显示 i，点击触发 onHelp 回调，
// 由统计页页面级 Stack 统一弹字段帮助面板（确保遮罩全屏 + 浮层居中屏幕）。

import { 应用尺寸 } from '../../utils/应用尺寸';
import { 范围切换条 } from './范围切换条';

@Component
export struct 统计图表分区 {
  @Prop 标题: Resource = $r('app.string.stats_no_data');
  @Prop 有数据: boolean = true;
  @Prop 帮助标题: Resource | null = null;
  @Prop 帮助正文: Resource | null = null;
  @Prop rangeLabels: Resource[] = [];
  @Prop rangeIndex: number = 0;
  onRangeChange: (index: number) => void = (): void => {};
  onHelp: (标题: Resource, 正文: Resource) => void = (): void => {};
  @BuilderParam 内容: () => void = this.默认内容;

  @Builder
  private 默认内容(): void {}

  build() {
    Column({ space: 应用尺寸.间距_8 }) {
      Row({ space: 应用尺寸.间距_4 }) {
        HelpLabel({ title: this.标题, textSize: 18, textWeight: FontWeight.Bold,
          showHelp: this.帮助标题 !== null && this.帮助正文 !== null,
          onHelp: (): void => { this.onHelp(this.帮助标题 as Resource, this.帮助正文 as Resource); }
        }).layoutWeight(1)
        if (this.rangeLabels.length > 0) {
          范围切换条({
            当前索引: this.rangeIndex,
            标签集: this.rangeLabels,
            onRangeChange: (index: number): void => { this.onRangeChange(index); }
          }).constraintSize({ maxWidth: '48%' })
        }
      }
      .width('100%')

      if (this.有数据) {
        this.内容()
      } else {
        Text($r('app.string.stats_empty_section'))
          .fontSize(应用尺寸.字号_正文)
          .fontColor($r('app.color.text_tertiary'))
          .width('100%')
          .textAlign(TextAlign.Center)
          .padding({ top: 应用尺寸.间距_16, bottom: 应用尺寸.间距_16 })
      }
    }
    .width('100%')
    .padding(应用尺寸.卡片内边距)
    .backgroundColor($r('app.color.surface_card'))
    .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
    .borderRadius(应用尺寸.圆角_指标卡)
  }
}
