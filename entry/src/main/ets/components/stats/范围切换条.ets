// SPDX-License-Identifier: AGPL-3.0-or-later
import { ThemeTextSpans } from '../common/ThemeText';
import { THEME_TEXT_COLORS_KEY } from '../../model/ThemeCatalog';

// 范围切换条：Anki 统计图表卡内的范围单选（如 1月/3月/1年/全部）。
// 胶囊样式与 小时分布卡 的时间段切换一致；当前索引由父组件持有（@Link），
// 切换时回调 onRangeChange 供父组件按需持久化。
// Invariants: 纯展示层；标签集由父组件传入（@Prop Resource 数组），不持有业务语义。

import { 应用尺寸 } from '../../utils/应用尺寸';
import { 颜色键 } from '../../model/颜色主题';

@Component
export struct 范围切换条 {
  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  @Link 当前索引: number;
  标签集: Resource[] = [];
  onRangeChange: (索引: number) => void = (): void => {};
  @StorageProp(颜色键.动作主色) private 主色: string = '#2F5FD0';
  @StorageProp(颜色键.主色容器) private 容器色: string = '#E8EEFC';

  build() {
    Row({ space: 应用尺寸.间距_4 }) {
      ForEach(this.标签集, (标签: Resource, 索引: number) => {
        Text() { ThemeTextSpans(标签, (索引 === this.当前索引) ? this.themeAccentColors : [], this.getUIContext()) }
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor(索引 === this.当前索引 ? this.主色 : $r('app.color.text_secondary'))
          .fontWeight(索引 === this.当前索引 ? FontWeight.Bold : FontWeight.Normal)
          .padding({
            left: 应用尺寸.间距_8, right: 应用尺寸.间距_8,
            top: 应用尺寸.间距_4, bottom: 应用尺寸.间距_4
          })
          .backgroundColor(索引 === this.当前索引 ? this.容器色 : Color.Transparent)
          .borderRadius(应用尺寸.圆角_进度条)
          .onClick((): void => {
            this.当前索引 = 索引;
            this.onRangeChange(索引);
          })
      }, (标签: Resource, 索引: number) => `${索引}`)
    }
    .width('100%')
    .justifyContent(FlexAlign.Center)
  }
}
