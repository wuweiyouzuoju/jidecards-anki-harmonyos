// SPDX-License-Identifier: AGPL-3.0-or-later
import { 应用尺寸 } from './应用尺寸';

/**
 * 统一页面、设置与弹窗中的原生下拉框外观。
 * Invariants: 只设置视觉属性；选项、当前值、禁用状态与回调由调用方持有。
 * Extension Points: 通用尺寸和配色集中在此调整，宽度及菜单对齐由使用场景决定。
 */
export class SelectStyle implements AttributeModifier<SelectAttribute> {
  // Select 刷新会重置字体与圆角；调用方直接声明这两项，避开 modifier 的未变值跳过。
  static readonly controlFont: Font = { size: 应用尺寸.字号_正文, weight: FontWeight.Medium };
  static readonly controlRadius: number = 应用尺寸.圆角_指标卡;

  private surfaceColor: ResourceColor;

  /** 页面独立控件传入卡片底色，卡片内部沿用默认的内嵌底色。 */
  constructor(surfaceColor: ResourceColor = $r('app.color.surface_sidebar')) {
    this.surfaceColor = surfaceColor;
  }

  applyNormalAttribute(instance: SelectAttribute): void {
    // 保留显式高度，不调用会同时重置字体和圆角的 controlSize。
    instance
      .height(40)
      .fontColor($r('app.color.text_primary'))
      .backgroundColor(this.surfaceColor)
      .clip(true)
      .padding({ left: 12, right: 12 })
      .space(8)
      .optionFont({ size: 应用尺寸.字号_正文, weight: FontWeight.Normal })
      .optionFontColor($r('app.color.text_primary'))
      .optionBgColor($r('app.color.surface_card'))
      .selectedOptionFont({ size: 应用尺寸.字号_正文, weight: FontWeight.Medium })
      .selectedOptionFontColor($r('app.color.text_primary'))
      .selectedOptionBgColor($r('app.color.surface_selected'));
  }
}
