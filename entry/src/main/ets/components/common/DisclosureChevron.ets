// SPDX-License-Identifier: AGPL-3.0-or-later

/** 详情/展开入口箭头的唯一绘制入口。用几何中心对齐，避免字体基线让 › 偏下。 */
@Component
export struct DisclosureChevron {
  @Prop tint: ResourceColor = $r('app.color.text_secondary');

  build() {
    Polyline()
      .points([[9, 6], [15, 12], [9, 18]])
      .width(24)
      .height(24)
      .fill(Color.Transparent)
      .stroke(this.tint)
      .strokeWidth(2)
      .hitTestBehavior(HitTestMode.None)
      .accessibilityLevel('no')
  }
}
