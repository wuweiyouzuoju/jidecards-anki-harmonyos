// SPDX-License-Identifier: AGPL-3.0-or-later
import { 按下态按钮 } from './按下态按钮';
import { SelectStyle } from '../../utils/SelectStyle';
import { 应用尺寸 } from '../../utils/应用尺寸';

/** 与状态或标题对应的辅助操作靠右；整表提交与危险确认仍使用原操作区。 */
@Component
export struct LabeledActionRow {
  @Prop label: ResourceStr = '';
  @Prop actionLabel: ResourceStr = '';
  @Prop tint: ResourceColor = $r('app.color.action_primary');
  @Prop textColor: ResourceColor = $r('app.color.text_primary');
  @Prop isInteractive: boolean = true;
  onAction: () => void = (): void => {};

  private activate(): void {
    if (this.isInteractive) this.onAction();
  }

  build() {
    Row({ space: 应用尺寸.间距_12 }) {
      Text(this.label).fontSize(应用尺寸.字号_正文).fontColor(this.textColor)
        .textAlign(TextAlign.Start).layoutWeight(1).constraintSize({ minWidth: 0 })
      按下态按钮({ 文案: this.actionLabel, 字色: this.tint, 是否启用: this.isInteractive,
        singleLine: true, 点击回调: (): void => { this.activate(); } })
        .constraintSize(SelectStyle.fieldConstraint).flexShrink(0)
    }.width('100%').constraintSize({ minHeight: SelectStyle.controlHeight }).alignItems(VerticalAlign.Center)
  }
}
