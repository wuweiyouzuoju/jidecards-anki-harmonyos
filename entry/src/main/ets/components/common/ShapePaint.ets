// SPDX-License-Identifier: AGPL-3.0-or-later
/** 使用API 11已有的公共Shape属性，避免新版Circle同名重载抬高最低版本。 */
export class ShapePaint implements AttributeModifier<ShapeAttribute> {
  private fillColor: ResourceColor;
  private strokeColor: ResourceColor | undefined;
  constructor(fillColor: ResourceColor, strokeColor?: ResourceColor) {
    this.fillColor = fillColor; this.strokeColor = strokeColor;
  }
  applyNormalAttribute(shape: ShapeAttribute): void {
    shape.fill(this.fillColor);
    if (this.strokeColor !== undefined) shape.stroke(this.strokeColor);
  }
}
