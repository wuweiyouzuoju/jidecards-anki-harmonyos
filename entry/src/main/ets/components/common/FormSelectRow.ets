// SPDX-License-Identifier: AGPL-3.0-or-later
import { SelectStyle } from '../../utils/SelectStyle';
import { FormRowLayout } from '../../utils/FormRowLayout';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { ActionIcon } from './ActionIcon';
import { HelpLabel } from './HelpLabel';

/** 标签与帮助的统一选择行；默认原生枚举，层级选择可提供同样限宽的控件。 */
@Component
export struct FormSelectRow {
  @Prop label: ResourceStr = '';
  @Prop icon: ResourceStr | undefined = undefined;
  @Prop showHelp: boolean = false;
  @Prop labelActionIcon: ResourceStr | undefined = undefined;
  @Prop labelActionLabel: ResourceStr = '';
  @Prop isLabelActionEnabled: boolean = true;
  onLabelAction: () => void = (): void => {};
  @Prop showValuePreview: boolean = false;
  @BuilderParam valuePreview: () => void = this.emptyValuePreview;
  @Prop useCustomControl: boolean = false;
  @BuilderParam customControl: () => void = this.emptyValuePreview;
  onHelp: () => void = (): void => {};
  @Prop options: SelectOption[] = [];
  @Prop selectedIndex: number = -1;
  @Prop value: string = '';
  @Prop isInteractive: boolean = true;
  @Prop surfaceColor: ResourceColor = $r('app.color.surface_sidebar');
  onSelect: (index: number) => void = (_index: number): void => {};

  @Builder
  private emptyValuePreview(): void {}

  private select(index: number): void {
    if (!this.useCustomControl && this.isInteractive && Number.isInteger(index) && index >= 0 && index < this.options.length) {
      this.onSelect(index);
    }
  }

  build() {
    Row({ space: FormRowLayout.gap }) {
      if (this.icon !== undefined) { ActionIcon({ source: this.icon }).flexShrink(0) }
      if (this.showHelp || this.labelActionIcon !== undefined) {
        HelpLabel({ title: this.label, textSize: 应用尺寸.字号_正文, showHelp: this.showHelp, onHelp: this.onHelp,
          actionIcon: this.labelActionIcon, actionLabel: this.labelActionLabel,
          isActionEnabled: this.isLabelActionEnabled, onAction: this.onLabelAction })
          .layoutWeight(1).constraintSize({ minWidth: 0 })
      } else {
        Text(this.label).fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_primary'))
          .textAlign(TextAlign.Start).layoutWeight(1).constraintSize({ minWidth: 0 })
      }
      if (this.showValuePreview) { this.valuePreview() }
      if (this.useCustomControl) {
        this.customControl()
      } else {
        Select(this.options).selected(this.selectedIndex).value(this.value)
        .width(SelectStyle.fieldWidth).constraintSize(SelectStyle.fieldConstraint).flexShrink(0)
        .enabled(this.isInteractive).attributeModifier(new SelectStyle(this.surfaceColor))
        .height(SelectStyle.controlHeight).padding(SelectStyle.controlPadding).space(SelectStyle.controlSpace)
        .font(SelectStyle.controlFont).optionFont(SelectStyle.optionFont).selectedOptionFont(SelectStyle.selectedOptionFont)
        .textModifier(SelectStyle.labelText()).border(SelectStyle.controlBorder).borderRadius(SelectStyle.controlRadius)
        .onSelect((index: number): void => { this.select(index); })
      }
    }.width('100%').constraintSize({ minHeight: FormRowLayout.controlHeight }).alignItems(VerticalAlign.Center)
  }
}
