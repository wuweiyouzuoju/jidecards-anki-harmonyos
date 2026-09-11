// SPDX-License-Identifier: AGPL-3.0-or-later

// 设置页所有可折叠主分组的统一外壳：标题、可选帮助按钮、旋转箭头、色板与卡片尺寸只在此维护。
import { 设置面板色板_取 } from '../../utils/设置面板配色';
import { 应用尺寸 } from '../../utils/应用尺寸';

@Component
export struct 设置分组卡片 {
  @Prop 标题: Resource = $r('app.string.settings_about');
  @Prop 是否深色: boolean = false;
  @Prop 是否展开: boolean = false;
  @Prop 帮助标题: Resource | null = null;
  @Prop 帮助正文: Resource | null = null;
  切换展开回调: () => void = (): void => {};
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
        if (this.是否展开 && this.帮助标题 !== null && this.帮助正文 !== null) {
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
        Blank()
        Text('▼')
          .fontSize(11)
          .fontColor(设置面板色板_取(this.是否深色).弱化文字)
          .rotate({ angle: this.是否展开 ? 0 : -90 })
          .animation({ duration: 150, curve: Curve.EaseOut })
      }
      .width('100%')
      .height(40)
      .onClick((): void => {
        this.切换展开回调();
      })

      if (this.是否展开) {
        this.内容()
      }
    }
    .width('100%')
    .padding(应用尺寸.卡片内边距)
    .backgroundColor(设置面板色板_取(this.是否深色).背景)
    .borderRadius(应用尺寸.圆角_卡片)
  }
}
