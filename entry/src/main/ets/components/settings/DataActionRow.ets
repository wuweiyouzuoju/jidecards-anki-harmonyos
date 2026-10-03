// SPDX-License-Identifier: AGPL-3.0-or-later
import { PressFeedback } from '../../utils/PressFeedback';
import { DisclosureChevron } from '../common/DisclosureChevron';
import { 应用尺寸 } from '../../utils/应用尺寸';

/** 数据管理与备份入口共用行几何；水平边距由外层卡片/弹窗提供。 */
@Component
export struct DataActionRow {
  @Prop title: ResourceStr = '';
  @Prop hint: ResourceStr = '';
  @Prop isInteractive: boolean = true;
  onAction: () => void = (): void => {};
  build() {
    Row({ space: 应用尺寸.间距_8 }) {
      Column({ space: 2 }) {
        Text(this.title).fontSize(15).fontColor($r('app.color.text_primary'))
        Text(this.hint).fontSize(12).fontColor($r('app.color.text_secondary'))
      }.alignItems(HorizontalAlign.Start).layoutWeight(1)
      DisclosureChevron({ tint: $r('app.color.text_secondary') })
    }.width('100%').constraintSize({ minHeight: 58 })
    .padding({ top: 应用尺寸.间距_8, bottom: 应用尺寸.间距_8 })
    .attributeModifier(new PressFeedback()).enabled(this.isInteractive)
    .onClick((): void => { if (this.isInteractive) this.onAction(); })
  }
}
