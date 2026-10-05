// SPDX-License-Identifier: AGPL-3.0-or-later
import { 按下态按钮 } from './按下态按钮';

// ========================================================
// @块ID UI-COMMON-EMPTY-001
// @名称 统一空态
//
// @作用
// 提供统一的空态视觉：图标 + 标题 + 副标题 + 可选动作按钮，
// 替换各处散写的 if (empty) Column() { Text() } 组合。
//
// @输入
// 图标：可选 Resource，默认无
// 标题：必填 ResourceStr
// 副标题：可选 ResourceStr，默认空串
// 动作文案：可选 ResourceStr，非空时渲染动作按钮
// onAction：可选回调，动作按钮点击时触发
//
// @输出
// 渲染居中的空态内容
//
// @副作用
// 无。
// ========================================================

import { 应用尺寸 } from '../../utils/应用尺寸';

@Component
export struct 统一空态 {
  @Prop 图标: Resource | undefined = undefined;
  @Prop 标题: ResourceStr;
  @Prop 副标题: ResourceStr = '';
  @Prop 动作文案: ResourceStr = '';
  onAction: () => void = () => {};

  build() {
    Column({ space: 应用尺寸.间距_12 }) {
      if (this.图标 !== undefined) {
        Image(this.图标).width(56).height(56)
      }
      Text(this.标题)
        .fontSize(应用尺寸.字号_标题)
        .fontColor($r('app.color.text_primary'))
        .fontWeight(FontWeight.Medium)
      if (this.副标题 !== '') {
        Text(this.副标题)
          .fontSize(应用尺寸.字号_正文)
          .fontColor($r('app.color.text_secondary'))
          .textAlign(TextAlign.Center)
      }
      if (this.动作文案 !== '') {
        按下态按钮({ 文案: this.动作文案, 点击回调: (): void => { this.onAction(); } })
      }
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
    .padding({ left: 应用尺寸.间距_16, right: 应用尺寸.间距_16 })
  }
}
