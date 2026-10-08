// SPDX-License-Identifier: AGPL-3.0-or-later
import { currentMotionProfile } from './AppMotion';

/** 唯一按压反馈入口；仅灵动档增加轻缩放，不另建触摸状态或延迟点击。 */
export class PressFeedback implements AttributeModifier<CommonAttribute> {
  private restingOpacity: number;
  private disabledOpacity: number;

  constructor(restingOpacity: number = 1, disabledOpacity: number = 0.4) {
    this.restingOpacity = restingOpacity;
    this.disabledOpacity = disabledOpacity;
  }

  applyNormalAttribute(instance: CommonAttribute): void {
    instance.opacity(this.restingOpacity).scale({ x: 1, y: 1 });
  }

  applyPressedAttribute(instance: CommonAttribute): void {
    const profile = currentMotionProfile();
    instance.opacity(this.restingOpacity * 0.72).scale({ x: profile.pressScale, y: profile.pressScale });
  }

  applyDisabledAttribute(instance: CommonAttribute): void {
    instance.opacity(Math.min(this.restingOpacity, this.disabledOpacity)).scale({ x: 1, y: 1 });
  }
}
