// SPDX-License-Identifier: AGPL-3.0-or-later
/** 几何和命中语义直接沿用当前 jidecards；旋转/动效由宿主负责。 */
@Component
export struct SharedDisclosureChevron {
  @Prop tint: ResourceColor = Color.Transparent;

  build() {
    Polyline().points([[9, 6], [15, 12], [9, 18]])
      .width(24).height(24).fill(Color.Transparent).stroke(this.tint).strokeWidth(2)
      .hitTestBehavior(HitTestMode.None).accessibilityLevel('no')
  }
}
