// SPDX-License-Identifier: AGPL-3.0-or-later
import { 应用尺寸 } from './应用尺寸';

/** 原生界面容器、表单和分隔线的公共轮廓；不覆盖底色、圆角、布局或按压反馈。 */
export class SurfaceBorder {
  static color(): Resource { return $r('app.color.surface_border'); }

  static options(width: Length | EdgeWidths = 应用尺寸.卡片边框,
    color: ResourceColor | EdgeColors = SurfaceBorder.color()): BorderOptions {
    return { width: width, color: color };
  }
}
