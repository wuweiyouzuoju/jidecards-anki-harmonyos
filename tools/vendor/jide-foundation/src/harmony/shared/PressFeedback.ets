// SPDX-License-Identifier: AGPL-3.0-or-later
/** 原生按压完整沿用当前 jidecards；产品只提供动作时的缩放，不暴露全局状态。 */
export class SharedPressFeedback implements AttributeModifier<CommonAttribute> {
  private restingOpacity: number;
  private disabledOpacity: number;
  private readPressScale: () => number;
  private pressedOpacityFactor: number;

  constructor(restingOpacity: number = 1, disabledOpacity: number = 0.4,
    readPressScale: () => number = (): number => 1, pressedOpacityFactor: number = 0.72) {
    this.restingOpacity = restingOpacity;
    this.disabledOpacity = disabledOpacity;
    this.readPressScale = readPressScale;
    this.pressedOpacityFactor = Number.isFinite(pressedOpacityFactor) ? Math.max(0, Math.min(1, pressedOpacityFactor)) : 0.72;
  }

  applyNormalAttribute(instance: CommonAttribute): void {
    instance.opacity(this.restingOpacity).scale({ x: 1, y: 1 });
  }
  applyPressedAttribute(instance: CommonAttribute): void {
    const scale: number = this.readPressScale();
    instance.opacity(this.restingOpacity * this.pressedOpacityFactor).scale({ x: scale, y: scale });
  }
  applyDisabledAttribute(instance: CommonAttribute): void {
    instance.opacity(Math.min(this.restingOpacity, this.disabledOpacity)).scale({ x: 1, y: 1 });
  }
}
