// SPDX-License-Identifier: AGPL-3.0-or-later
import { ThemeTextSpans } from '../common/ThemeText';
import { THEME_TEXT_COLORS_KEY } from '../../model/ThemeCatalog';

// 统计图表分区：统计页内每个图表区块的统一外壳（标题 + 内容 + 卡片样式）。
// 用 @BuilderParam 槽位接收内容，visible=false 时不渲染（由偏好面板控制）。
// 可选 i 帮助按钮：传入 帮助标题/帮助正文 时标题右侧显示 i，点击触发 onHelp 回调，
// 由统计页页面级 Stack 统一弹字段帮助面板（确保遮罩全屏 + 浮层居中屏幕）。

import { 应用尺寸 } from '../../utils/应用尺寸';
import { 颜色键 } from '../../model/颜色主题';

@Component
export struct 统计图表分区 {
  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  @Prop 标题: Resource = $r('app.string.stats_no_data');
  @Prop 有数据: boolean = true;
  @Prop 帮助标题: Resource | null = null;
  @Prop 帮助正文: Resource | null = null;
  @StorageProp(颜色键.动作主色) private 主色: string = '#2F5FD0';
  onHelp: (标题: Resource, 正文: Resource) => void = (): void => {};
  @BuilderParam 内容: () => void = this.默认内容;

  @Builder
  private 默认内容(): void {}

  build() {
    Column({ space: 应用尺寸.间距_8 }) {
      Row({ space: 应用尺寸.间距_4 }) {
        Text(this.标题)
          .fontSize(应用尺寸.字号_分区标题)
          .fontWeight(FontWeight.Bold)
          .fontColor($r('app.color.text_primary'))
        if (this.帮助标题 !== null && this.帮助正文 !== null) {
          Button() {
            Text() { ThemeTextSpans($r('app.string.field_help_button'), this.themeAccentColors, this.getUIContext()) }.fontColor(this.主色).fontSize(应用尺寸.字号_正文)
          }
            .type(ButtonType.Normal)
            .backgroundColor(Color.Transparent)
            .fontColor(this.主色)
            .fontSize(应用尺寸.字号_正文)
            .onClick((): void => {
              this.onHelp(this.帮助标题 as Resource, this.帮助正文 as Resource);
            })
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
    .borderRadius(应用尺寸.圆角_卡片)
  }
}
