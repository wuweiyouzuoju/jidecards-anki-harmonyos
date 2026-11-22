// SPDX-License-Identifier: AGPL-3.0-or-later
import { elementRadius } from './AppearanceElements';
import { 应用尺寸 } from './应用尺寸';
import { SurfaceBorder } from './SurfaceBorder';

/** 笔记图片预览与遮罩画布共用可辨识的中性灰容器；不改变图片尺寸或命中坐标。 */
export class ImageSurfaceStyle implements AttributeModifier<CommonAttribute> {
  private appearance: string;
  constructor(appearance: string = '') { this.appearance = appearance; }
  applyNormalAttribute(instance: CommonAttribute): void {
    instance.backgroundColor($r('app.color.surface_image'))
      .border(SurfaceBorder.options(应用尺寸.卡片边框, $r('app.color.border_image'), this.appearance))
      .borderRadius(elementRadius(应用尺寸.圆角_面板)).clip(true);
  }
}
