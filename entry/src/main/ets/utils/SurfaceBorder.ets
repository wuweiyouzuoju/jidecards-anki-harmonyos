// SPDX-License-Identifier: AGPL-3.0-or-later
import { 应用尺寸 } from './应用尺寸';

/** 原生界面容器、表单和分隔线的公共轮廓；不覆盖底色、圆角、布局或按压反馈。 */
export class SurfaceBorder {
  static color(): Resource { return $r('app.color.surface_border'); }

  /** 玻璃搜索栏、模块、按钮和弹层使用相同的轮廓等级。 */
  static materialOptions(material: string, dark: boolean): BorderOptions {
    return material === 'glass' ? { width: dark ? 0.8 : 1, color: dark ? '#22FFFFFF' : '#506B7C96' } : SurfaceBorder.options();
  }

  /** 分隔线拥有固定布局高度，不随相邻行挤压或继承透明度。 */
  static readonly separatorWidth: number = 1;

  static options(width: Length | EdgeWidths = 应用尺寸.卡片边框,
    color: ResourceColor | EdgeColors = SurfaceBorder.color()): BorderOptions {
    return { width: width, color: color };
  }
}
