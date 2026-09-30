// SPDX-License-Identifier: AGPL-3.0-or-later
import { PressFeedback } from '../../utils/PressFeedback';

// ========================================================
// @块ID UI-COMMON-ERROR-001
// @名称 统一错误态
//
// @作用
// 提供统一的错误态视觉：错误图标 + 文案 + 可选重试按钮，
// 替换各处散写的 if (error) Column() { Text() } 组合。
//
// @输入
// 文案：必填 ResourceStr，错误描述
// 重试文案：可选，默认"重试"
// onRetry：可选回调，非空时渲染重试按钮
//
// @输出
// 渲染居中的错误态内容
//
// @副作用
// 无。
// ========================================================

import { 应用尺寸 } from '../../utils/应用尺寸';

@Component
export struct 统一错误态 {
  @Prop 文案: ResourceStr;
  @Prop 重试文案: ResourceStr = '重试';
  onRetry: () => void = (): void => {};

  build() {
    Column({ space: 应用尺寸.间距_12 }) {
      Text('⚠️').fontSize(48)
      Text(this.文案)
        .fontSize(应用尺寸.字号_正文)
        .fontColor($r('app.color.text_secondary'))
        .textAlign(TextAlign.Center)
      Button(this.重试文案)
        .type(ButtonType.Capsule)
        .height(应用尺寸.按钮高度)
        .padding({ left: 应用尺寸.间距_16, right: 应用尺寸.间距_16 })
        .fontSize(应用尺寸.字号_按钮)
        .backgroundColor($r('app.color.surface_card'))
        .fontColor($r('app.color.text_primary'))
        .attributeModifier(new PressFeedback())
        .stateEffect(false)
        .onClick(() => this.onRetry())
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
    .padding({ left: 应用尺寸.间距_16, right: 应用尺寸.间距_16 })
  }
}
