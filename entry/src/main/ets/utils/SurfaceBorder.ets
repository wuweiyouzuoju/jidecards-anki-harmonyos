// SPDX-License-Identifier: AGPL-3.0-or-later
import { activeElementStyle, elementBorder } from './AppearanceElements';
import { 应用尺寸 } from './应用尺寸';

/** 原生界面容器、表单和分隔线的公共轮廓；不覆盖底色、圆角、布局或按压反馈。 */
export class SurfaceBorder {
  static color(): ResourceColor { return activeElementStyle().outline || $r('app.color.surface_border'); }

  static glassOutlineWidth(dark: boolean): number { return dark ? 0.8 : 1; }
  static glassOutlineColor(dark: boolean): string { return dark ? '#22FFFFFF' : '#506B7C96'; }

  /** 玻璃搜索栏、模块、按钮和弹层使用相同的轮廓等级。 */
  static materialOptions(material: string, dark: boolean, appearance: string = ''): BorderOptions {
    return elementBorder(material === 'glass' ? { width: SurfaceBorder.glassOutlineWidth(dark), color: SurfaceBorder.glassOutlineColor(dark) } : SurfaceBorder.options());
  }

  /** 同级模块共享轮廓；切回浅色或内嵌状态必须显式清掉旧线。 */
  static contentOptions(material: string, dark: boolean, nested: boolean = false, appearance: string = ''): BorderOptions {
    if (nested) return { width: 0, color: Color.Transparent };
    const border: BorderOptions = dark ? (material === 'glass' ?
      { width: 0.8, color: '#22FFFFFF' } : { width: 应用尺寸.卡片边框, color: $r('app.color.surface_border') }) :
      { width: 0, color: Color.Transparent };
    return elementBorder(border, 'module');
  }

  /** 常驻按钮不叠浅色实线；深色和用户显式自定义保留一条轮廓。 */
  static controlOptions(material: string, dark: boolean, appearance: string = ''): BorderOptions {
    return elementBorder({ width: dark ? (material === 'glass' ? 0.8 : 1) : 0,
      color: dark && material === 'glass' ? '#22FFFFFF' : SurfaceBorder.color() });
  }

  /** 分隔线拥有固定布局高度，不随相邻行挤压或继承透明度。 */
  static readonly separatorWidth: number = 1;

  static options(width: Length | EdgeWidths = 应用尺寸.卡片边框,
    color: ResourceColor | EdgeColors = SurfaceBorder.color(), appearance: string = ''): BorderOptions {
    // 局部边线保留边方向；显式0表示无边框，不由全局粗细重新开启。
    if (typeof width === 'object' || width === 0) {
      return { width: width, color: activeElementStyle().outline || color };
    }
    return elementBorder({ width: width, color: color });
  }
}
