// SPDX-License-Identifier: AGPL-3.0-or-later
import { PressFeedback } from '../../utils/PressFeedback';

import { 应用尺寸 } from '../../utils/应用尺寸';

@Component
export struct AgentDisclosureCard {
  @Prop title: ResourceStr = '';
  @Prop status: ResourceStr = '';
  @Prop showStatus: boolean = false;
  @Prop expanded: boolean = false;
  @Prop toggleLocked: boolean = false;
  onToggle: () => void = (): void => {};
  @BuilderParam content: () => void = this.emptyContent;

  @Builder
  private emptyContent(): void {}

  build() {
    Column({ space: 应用尺寸.间距_5 }) {
      Row({ space: 应用尺寸.间距_5 }) {
        Text(this.title)
          .fontSize(应用尺寸.字号_正文_小)
          .fontWeight(FontWeight.Medium)
          .fontColor($r('app.color.text_primary'))
          .layoutWeight(1)
        if (this.showStatus) {
          Text(this.status)
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.text_secondary'))
        }
        Text('▼')
          .fontSize(11)
          .fontColor($r('app.color.text_tertiary'))
          .rotate({ angle: this.expanded ? 0 : -90 })
          .animation({ duration: 150, curve: Curve.EaseOut })
      }
      .width('100%')
      .attributeModifier(new PressFeedback())
      .onClick((): void => {
        if (!this.toggleLocked) { this.onToggle(); }
      })
      if (this.expanded) { this.content(); }
    }
    .width('100%')
    .padding(应用尺寸.间距_8)
    .backgroundColor($r('app.color.surface_page'))
    .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
    .borderRadius(应用尺寸.圆角_卡片)
  }
}
