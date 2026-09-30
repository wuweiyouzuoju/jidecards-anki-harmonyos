// SPDX-License-Identifier: AGPL-3.0-or-later

/** 按钮和可点击行共用的单次按压反馈，不依赖底色、触摸状态或隐式动画。 */
export class PressFeedback implements AttributeModifier<CommonAttribute> {
  private restingOpacity: number;
  private disabledOpacity: number;

  constructor(restingOpacity: number = 1, disabledOpacity: number = 0.4) {
    this.restingOpacity = restingOpacity;
    this.disabledOpacity = disabledOpacity;
  }

  applyNormalAttribute(instance: CommonAttribute): void {
    instance.opacity(this.restingOpacity);
  }

  applyPressedAttribute(instance: CommonAttribute): void {
    instance.opacity(this.restingOpacity * 0.72);
  }

  applyDisabledAttribute(instance: CommonAttribute): void {
    instance.opacity(Math.min(this.restingOpacity, this.disabledOpacity));
  }
}
