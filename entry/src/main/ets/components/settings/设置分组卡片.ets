// SPDX-License-Identifier: AGPL-3.0-or-later

// 二级设置页的静态分区：选项直接呈现，帮助按钮仍打开页面级说明。
import { 设置面板色板_取 } from '../../utils/设置面板配色';
import { 应用尺寸 } from '../../utils/应用尺寸';

@Component
export struct 设置分组卡片 {
  @Prop 标题: Resource = $r('app.string.settings_about');
  @Prop 是否深色: boolean = false;
  @Prop 帮助标题: Resource | null = null;
  @Prop 帮助正文: Resource | null = null;
  打开说明回调: (标题: Resource, 正文: Resource) => void =
    (_标题: Resource, _正文: Resource): void => {};
  @BuilderParam 内容: () => void = this.默认内容;

  @Builder
  private 默认内容(): void {}

  build() {
    Column() {
      Row() {
        Text(this.标题)
          .fontSize(14)
          .fontWeight(FontWeight.Medium)
          .fontColor(设置面板色板_取(this.是否深色).次文字)
        if (this.帮助标题 !== null && this.帮助正文 !== null) {
          Button($r('app.string.field_help_button'))
            .type(ButtonType.Normal)
            .backgroundColor(Color.Transparent)
            .fontSize(14)
            .fontColor(设置面板色板_取(this.是否深色).三级文字)
            .width(28)
            .height(28)
            .padding(0)
            .onClick((): void => {
              this.打开说明回调(this.帮助标题 as Resource, this.帮助正文 as Resource);
            })
        }
      }
      .width('100%')
      .height(36)

      this.内容()
    }
    .width('100%')
    .padding({ left: 应用尺寸.卡片内边距, right: 应用尺寸.卡片内边距, top: 8, bottom: 8 })
    .backgroundColor(设置面板色板_取(this.是否深色).背景)
    .borderRadius(16)
  }
}
