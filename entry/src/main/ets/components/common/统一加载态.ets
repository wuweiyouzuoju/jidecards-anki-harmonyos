// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID UI-COMMON-LOADING-001
// @名称 统一加载态
//
// @作用
// 提供统一的加载中视觉：圆形 LoadingProgress + 文案，
// 替换各处散写的 if (loading) Progress() + Text() 组合。
//
// @输入
// 文案：可选，默认本地化加载文案
// 尺寸：可选，默认公共加载指示器尺寸
//
// @输出
// 渲染居中的加载指示器与文案
//
// @副作用
// 无。
// ========================================================

import { 应用尺寸 } from '../../utils/应用尺寸';

@Component
export struct 统一加载态 {
  @Prop 文案: ResourceStr = $r('app.string.common_loading');
  @Prop 尺寸: number = 应用尺寸.加载指示器尺寸;

  build() {
    Column({ space: 应用尺寸.间距_8 }) {
      LoadingProgress().width(this.尺寸).height(this.尺寸).color($r('app.color.text_secondary'))
      Text(this.文案).fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_secondary'))
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
  }
}
