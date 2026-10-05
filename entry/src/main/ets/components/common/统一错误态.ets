// SPDX-License-Identifier: AGPL-3.0-or-later
import { 按下态按钮 } from './按下态按钮';

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
// 重试文案：可选，默认本地化重试文案
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
  @Prop 重试文案: ResourceStr = $r('app.string.common_retry');
  onRetry: (() => void) | undefined = undefined;

  private retry(): void { this.onRetry?.(); }

  build() {
    Column({ space: 应用尺寸.间距_12 }) {
      SymbolGlyph($r('sys.symbol.exclamationmark_triangle'))
        .fontSize(48).fontColor([$r('app.color.text_secondary')]).accessibilityLevel('no')
      Text(this.文案)
        .fontSize(应用尺寸.字号_正文)
        .fontColor($r('app.color.text_secondary'))
        .textAlign(TextAlign.Center)
      if (this.onRetry !== undefined) {
        按下态按钮({ 文案: this.重试文案, 点击回调: (): void => { this.retry(); } })
      }
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
    .padding({ left: 应用尺寸.间距_16, right: 应用尺寸.间距_16 })
  }
}
