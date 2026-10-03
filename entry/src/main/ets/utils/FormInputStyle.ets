// SPDX-License-Identifier: AGPL-3.0-or-later
import { 应用尺寸 } from './应用尺寸';

/** 单行表单输入的公共外观；文本、输入类型、键盘、过滤与事件仍由原生 TextInput 持有。 */
export class FormInputStyle implements AttributeModifier<TextInputAttribute> {
  private horizontalPadding: number;

  constructor(horizontalPadding: number = 应用尺寸.间距_10) {
    this.horizontalPadding = horizontalPadding;
  }

  applyNormalAttribute(instance: TextInputAttribute): void {
    instance
      .width('100%')
      .height(应用尺寸.按钮高度)
      .fontSize(应用尺寸.字号_正文)
      .fontColor($r('app.color.text_primary'))
      .placeholderColor($r('app.color.text_tertiary'))
      .backgroundColor($r('app.color.surface_card'))
      .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
      .borderRadius(应用尺寸.圆角_面板)
      .padding({ left: this.horizontalPadding, right: this.horizontalPadding });
  }
}
