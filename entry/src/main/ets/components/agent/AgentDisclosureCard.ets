// SPDX-License-Identifier: AGPL-3.0-or-later
import { PressFeedback } from '../../utils/PressFeedback';
import { SurfaceBorder } from '../../utils/SurfaceBorder';

import { 应用尺寸 } from '../../utils/应用尺寸';
import { DisclosureChevron } from '../common/DisclosureChevron';

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
    Column({ space: 应用尺寸.间距_4 }) {
      Row({ space: 应用尺寸.间距_8 }) {
        SymbolGlyph($r('sys.symbol.wrench_and_screwdriver'))
          .fontSize(18).fontColor([$r('app.color.text_secondary')]).flexShrink(0)
        Text(this.title)
          .fontSize(应用尺寸.字号_正文_小)
          .fontWeight(FontWeight.Medium)
          .fontColor($r('app.color.text_primary'))
          .layoutWeight(1)
        if (this.showStatus) {
          Text(this.status)
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.text_secondary'))
            .flexShrink(0)
        }
        DisclosureChevron({ tint: $r('app.color.text_tertiary') })
          .rotate({ angle: this.expanded ? 90 : 0 })
          .animation({ duration: 150, curve: Curve.EaseOut })
          .flexShrink(0)
      }
      .width('100%')
      .constraintSize({ minHeight: 应用尺寸.按钮高度 })
      .padding({ left: 应用尺寸.间距_10, right: 应用尺寸.间距_10 })
      .attributeModifier(new PressFeedback())
      .onClick((): void => {
        if (!this.toggleLocked) { this.onToggle(); }
      })
      if (this.expanded) {
        Scroll() {
          Column({ space: 应用尺寸.间距_8 }) { this.content(); }
            .width('100%').alignItems(HorizontalAlign.Start)
            .padding(应用尺寸.间距_10)
        }
        .width('100%').constraintSize({ maxHeight: 240 })
        .align(Alignment.TopStart).scrollBar(BarState.Auto)
        .border(SurfaceBorder.options({ top: 应用尺寸.卡片边框 }))
      }
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
    .backgroundColor($r('app.color.surface_card'))
    .border(SurfaceBorder.options())
    .borderRadius(应用尺寸.圆角_面板)
    .clip(true)
  }
}
