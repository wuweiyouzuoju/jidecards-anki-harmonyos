// SPDX-License-Identifier: AGPL-3.0-or-later
import { elementRadius } from './AppearanceElements';
import { activeElementStyle } from './AppearanceElements';
import { 应用尺寸 } from './应用尺寸';
import { SurfaceBorder } from './SurfaceBorder';

/** 多行表单沿用单行输入的视觉规范；高度、焦点与编辑行为由调用方负责。 */
export class FormTextAreaStyle implements AttributeModifier<TextAreaAttribute> {
  private embedded: boolean;
  private appearance: string;

  constructor(appearance: string = '', embedded: boolean = false) {
    this.embedded = embedded;
    this.appearance = appearance;
  }
  applyNormalAttribute(instance: TextAreaAttribute): void {
    instance.width('100%')
      .fontSize(应用尺寸.字号_正文).fontColor(activeElementStyle().text || $r('app.color.text_primary'))
      .placeholderColor($r('app.color.text_tertiary'))
      .backgroundColor(this.embedded ? Color.Transparent : $r('app.color.surface_card'))
      .border(SurfaceBorder.options(this.embedded ? 0 : undefined, undefined, this.appearance))
      .borderRadius(elementRadius(应用尺寸.圆角_面板))
      .padding(this.embedded ? 应用尺寸.间距_8 : 应用尺寸.间距_10);
  }
}
