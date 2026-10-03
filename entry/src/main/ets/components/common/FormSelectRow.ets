// SPDX-License-Identifier: AGPL-3.0-or-later
import { SelectStyle } from '../../utils/SelectStyle';
import { 应用尺寸 } from '../../utils/应用尺寸';

/** 标签可换行；选择框靠右且限宽，完整选项仍保留在下拉菜单中。 */
@Component
export struct FormSelectRow {
  @Prop label: ResourceStr = '';
  @Prop options: SelectOption[] = [];
  @Prop selectedIndex: number = -1;
  @Prop value: string = '';
  @Prop isInteractive: boolean = true;
  @Prop surfaceColor: ResourceColor = $r('app.color.surface_sidebar');
  onSelect: (index: number) => void = (_index: number): void => {};

  private select(index: number): void {
    if (this.isInteractive && Number.isInteger(index) && index >= 0 && index < this.options.length) {
      this.onSelect(index);
    }
  }

  build() {
    Row({ space: 应用尺寸.间距_12 }) {
      Text(this.label).fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_primary'))
        .textAlign(TextAlign.Start).layoutWeight(1).constraintSize({ minWidth: 0 })
      Select(this.options).selected(this.selectedIndex).value(this.value)
        .width(SelectStyle.fieldWidth).constraintSize(SelectStyle.fieldConstraint).flexShrink(0)
        .enabled(this.isInteractive).attributeModifier(new SelectStyle(this.surfaceColor))
        .height(SelectStyle.controlHeight).padding(SelectStyle.controlPadding).space(SelectStyle.controlSpace)
        .font(SelectStyle.controlFont).optionFont(SelectStyle.optionFont).selectedOptionFont(SelectStyle.selectedOptionFont)
        .textModifier(SelectStyle.labelText()).borderRadius(SelectStyle.controlRadius)
        .onSelect((index: number): void => { this.select(index); })
    }.width('100%').constraintSize({ minHeight: SelectStyle.controlHeight }).alignItems(VerticalAlign.Center)
  }
}
