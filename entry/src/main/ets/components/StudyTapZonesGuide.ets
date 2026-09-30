// SPDX-License-Identifier: AGPL-3.0-or-later
import { 按下态按钮 } from './common/按下态按钮';
import { 应用尺寸 } from '../utils/应用尺寸';

/** 与卡片 Web 同宽同高的教学层；颜色配合文字，点击分区不提交评分。 */
@Component
export struct StudyTapZonesGuide {
  onConfirm: () => void = (): void => {};

  @Builder
  private zone(label: Resource, color: ResourceColor) {
    Stack() {
      // 仅色块半透明，让原卡面透出；文字与确认操作保持不透明。
      Rect().width('100%').height('100%').fill(color).opacity(0.5)
        .hitTestBehavior(HitTestMode.None)
      Text(label).fontSize(应用尺寸.字号_标题).fontWeight(FontWeight.Bold)
        .fontColor($r('app.color.text_primary')).textAlign(TextAlign.Center)
        .padding(8).backgroundColor($r('app.color.surface_card')).borderRadius(8)
    }.layoutWeight(1).height('100%')
  }

  build() {
    Stack() {
      Column() {
        Row() {
          this.zone($r('app.string.tap_zones_top_left'), $r('app.color.study_again_background'))
          this.zone($r('app.string.tap_zones_top_right'), $r('app.color.study_hard_background'))
        }.width('100%').layoutWeight(1)
        Row() {
          this.zone($r('app.string.tap_zones_bottom_left'), $r('app.color.study_good_background'))
          this.zone($r('app.string.tap_zones_bottom_right'), $r('app.color.study_easy_background'))
        }.width('100%').layoutWeight(1)
      }.width('100%').height('100%')
      Column({ space: 8 }) {
        Text($r('app.string.tap_zones_guide_message')).fontSize(13)
          .fontColor($r('app.color.text_primary')).textAlign(TextAlign.Center)
        按下态按钮({ 文案: $r('app.string.study_guide_start'), 点击回调: this.onConfirm })
      }.width('88%').constraintSize({ maxWidth: 360 })
        .padding(12).backgroundColor($r('app.color.surface_card')).borderRadius(应用尺寸.圆角_卡片)
    }.width('100%').height('100%').onClick((): void => {})
  }
}
