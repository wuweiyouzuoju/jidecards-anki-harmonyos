// SPDX-License-Identifier: AGPL-3.0-or-later
import { SharedSurface } from 'jide_foundation';
import { SeriesVisual } from './SeriesVisual';
import { usesGlassMaterial, darkMaterial } from './GlassMaterial';
import { PressFeedback } from './PressFeedback';
import { SurfaceBorder } from './SurfaceBorder';

/** 按钮复用共享光学表面，按压与禁用继续由公共反馈拥有。 */
export class GlassSurface extends PressFeedback {
  private outline: BorderOptions | undefined;

  private material: string;
  private buttonOpacity: number;
  private radius: number;

  constructor(material: string, colors: string[], background: ResourceColor = $r('app.color.surface_card'),
    outline: BorderOptions | undefined = undefined, stableAnchor: boolean = false, buttonOpacity: number = 100, appearance: string = '', radius: number = 18) {
    super(1, 0.4, stableAnchor);
    this.radius = radius;
    this.buttonOpacity = buttonOpacity;
    this.material = material;
    this.outline = outline;
  }

  backgroundSurface(): SharedSurface {
    return SeriesVisual.control(this.material, darkMaterial(), '#2F5FD0', this.radius, true, undefined, this.buttonOpacity);
  }

  applyNormalAttribute(instance: CommonAttribute): void {
    super.applyNormalAttribute(instance);
    this.applySurface(instance);
  }

  applyPressedAttribute(instance: CommonAttribute): void {
    super.applyPressedAttribute(instance);
    this.applySurface(instance);
  }

  applyDisabledAttribute(instance: CommonAttribute): void {
    this.applyNormalAttribute(instance);
    super.applyDisabledAttribute(instance);
  }

  private applySurface(instance: CommonAttribute): void {
    const fill: ResourceColor | undefined = usesGlassMaterial(this.material) ? undefined :
      darkMaterial() ? '#000000' : '#FFFFFF';
    SeriesVisual.control(this.material, darkMaterial(), '#2F5FD0', this.radius, true,
      fill, this.buttonOpacity).applyNormalAttribute(instance);
    if (this.outline !== undefined) instance.border(this.outline);
  }
}
