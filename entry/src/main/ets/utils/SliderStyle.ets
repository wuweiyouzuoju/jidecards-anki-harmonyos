// SPDX-License-Identifier: AGPL-3.0-or-later
/** 普通数值滑杆共用主题轨道和滑块，业务范围/禁用/保存时机仍由宿主拥有。 */
export class SliderStyle implements AttributeModifier<SliderAttribute> {
  private accent: ResourceColor;
  constructor(accent: ResourceColor) { this.accent = accent; }
  applyNormalAttribute(instance: SliderAttribute): void {
    instance.selectedColor(this.accent).blockColor(this.accent);
  }
}
