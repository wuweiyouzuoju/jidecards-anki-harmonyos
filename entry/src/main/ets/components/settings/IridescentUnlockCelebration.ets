// SPDX-License-Identifier: AGPL-3.0-or-later
import { AppearanceReveal } from '../common/AppearanceReveal';
import { themeDefinition } from '../../model/ThemeCatalog';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { PrimaryActionButton } from '../common/PrimaryActionButton';

/** 首次兑换成功后保留原礼物、结果说明与使用主题操作。 */
@Component
export struct IridescentUnlockCelebration {
  onUse: () => void = (): void => {};
  private readonly colors: string[] = themeDefinition('iridescent').lightActionColors;
  build() {
    Column({ space: 应用尺寸.间距_16 }) {
      AppearanceReveal({ gift: true, colors: this.colors })
      Column({ space: 应用尺寸.间距_12 }) {
        Text($r('app.string.redemption_iridescent_unlocked_title'))
          .fontSize(应用尺寸.字号_分区标题).fontWeight(FontWeight.Bold)
          .fontColor(this.colors[1]).textAlign(TextAlign.Center).width('100%')
        Text($r('app.string.redemption_iridescent_unlocked_body'))
          .fontSize(应用尺寸.字号_正文).lineHeight(22)
          .fontColor($r('app.color.text_secondary')).textAlign(TextAlign.Center).width('100%')
      }
      .width('100%')
      PrimaryActionButton({ label: $r('app.string.redemption_use_theme'), tint: this.colors[1],
        onAction: this.onUse })
    }
    .width('100%')
  }
}
