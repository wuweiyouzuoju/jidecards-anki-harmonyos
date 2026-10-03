// SPDX-License-Identifier: AGPL-3.0-or-later
import { 应用尺寸 } from './应用尺寸';

/** 多行表单沿用单行输入的视觉规范；高度、焦点与编辑行为由调用方负责。 */
export class FormTextAreaStyle implements AttributeModifier<TextAreaAttribute> {
  applyNormalAttribute(instance: TextAreaAttribute): void {
    instance.width('100%')
      .fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_primary'))
      .placeholderColor($r('app.color.text_tertiary'))
      .backgroundColor($r('app.color.surface_card'))
      .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
      .borderRadius(应用尺寸.圆角_面板)
      .padding(应用尺寸.间距_10);
  }
}
