// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID UI-COMMON-PRESSBTN-001
// @名称 按下态按钮
//
// @作用
// 包装 Button，自带 pressed 视觉反馈，
// 替换各处用数字编码（如 工具栏按下状态 1/2）手动管理按下态的写法。
//
// @输入
// 文案：必填 ResourceStr
// 图标：可选 Resource
// 选中态背景：必填，按下时背景色
// 字号：可选，默认 应用尺寸.字号_按钮
// 字色：可选，默认 text_primary
// 是否启用：可选，默认 true
// 点击回调：必填回调
//
// @输出
// 渲染带按下态视觉反馈的按钮
//
// @副作用
// 无。
// ========================================================

import { 应用尺寸 } from '../../utils/应用尺寸';

@Component
export struct 按下态按钮 {
  @Prop 文案: ResourceStr;
  @Prop 图标: Resource | undefined = undefined;
  @Prop 选中态背景: ResourceColor;
  @Prop 字号: number = 应用尺寸.字号_按钮;
  @Prop 字色: ResourceColor = $r('app.color.text_primary');
  @Prop 是否启用: boolean = true;
  点击回调: () => void = (): void => {};
  @State private 按下中: boolean = false;

  build() {
    Button() {
      Row({ space: 应用尺寸.间距_8 }) {
        if (this.图标 !== undefined) {
          Image(this.图标).width(16).height(16)
        }
        Text(this.文案)
          .fontSize(this.字号)
          .fontColor(this.字色)
      }
      .justifyContent(FlexAlign.Center)
    }
    .height(应用尺寸.按钮高度)
    .padding({ left: 应用尺寸.卡片内边距, right: 应用尺寸.卡片内边距 })
    .constraintSize({ minWidth: 0 })
    .fontColor(this.字色)
    .backgroundColor(this.按下中 ? this.选中态背景 : $r('app.color.surface_card'))
    .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
    .borderRadius(应用尺寸.圆角_胶囊)
    .enabled(this.是否启用)
    .animation({ duration: 80, curve: Curve.EaseOut })
    .onTouch((event: TouchEvent): void => {
      if (event.type === TouchType.Down) { this.按下中 = true; }
      else if (event.type === TouchType.Up || event.type === TouchType.Cancel) { this.按下中 = false; }
    })
    .onClick(() => { this.点击回调(); })
  }
}
