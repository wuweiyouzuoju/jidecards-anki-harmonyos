// SPDX-License-Identifier: AGPL-3.0-or-later
import { 应用尺寸 } from './应用尺寸';

/**
 * 统一页面、设置与弹窗中的原生下拉框外观。
 * Invariants: 只设置视觉属性；选项、当前值、禁用状态与回调由调用方持有。
 * Extension Points: 通用尺寸和配色集中在此调整，宽度及菜单对齐由使用场景决定。
 */
export class SelectStyle implements AttributeModifier<SelectAttribute> {
  // 几何属性由调用方直接声明，避免 Select 重建后 modifier 跳过未变值。
  static readonly controlFont: Font = { size: 应用尺寸.字号_正文, weight: FontWeight.Medium };
  static readonly controlRadius: number = 应用尺寸.圆角_指标卡;
  static readonly controlHeight: number = 40;
  static readonly controlPadding: Padding = { left: 12, right: 12, top: 0, bottom: 0 };
  static readonly controlSpace: number = 8;
  // Select 按当前选项内容测量，避免短标签占满行并留下大块空白。
  static readonly fieldWidth: string = 'auto';
  static readonly rangeWidth: number = 112;

  private surfaceColor: ResourceColor;

  /** 页面独立控件传入卡片底色，卡片内部沿用默认的内嵌底色。 */
  constructor(surfaceColor: ResourceColor = $r('app.color.surface_sidebar')) {
    this.surfaceColor = surfaceColor;
  }

  applyNormalAttribute(instance: SelectAttribute): void {
    // 不调用会同时重置字体和圆角的 controlSize；这里只保留配色。
    instance
      .fontColor($r('app.color.text_primary'))
      .backgroundColor(this.surfaceColor)
      .clip(true)
      .optionFont({ size: 应用尺寸.字号_正文, weight: FontWeight.Normal })
      .optionFontColor($r('app.color.text_primary'))
      .optionBgColor($r('app.color.surface_card'))
      .selectedOptionFont({ size: 应用尺寸.字号_正文, weight: FontWeight.Medium })
      .selectedOptionFontColor($r('app.color.text_primary'))
      .selectedOptionBgColor($r('app.color.surface_selected'));
  }
}
