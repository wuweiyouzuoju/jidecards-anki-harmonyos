import { usesGlassMaterial, darkMaterial, translucentGlassFill, themedGlassFill } from './GlassMaterial';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { TextModifier, UIContext } from '@kit.ArkUI';
import { 应用尺寸 } from './应用尺寸';
import { SurfaceBorder } from './SurfaceBorder';
import { FormRowLayout } from './FormRowLayout';

/**
 * 统一页面、设置与弹窗中的原生下拉框外观。
 * Invariants: 只设置视觉属性；选项、当前值、禁用状态与回调由调用方持有。
 * Extension Points: 通用尺寸和配色集中在此调整，宽度及菜单对齐由使用场景决定。
 */
export class SelectStyle implements AttributeModifier<SelectAttribute> {
  // 三种字体和几何均直接声明；modifier 差分会漏掉重建的菜单项，导致选过的项才缩小。
  static readonly controlFont: Font = { size: 应用尺寸.字号_正文, weight: FontWeight.Medium };
  static readonly optionFont: Font = { size: 应用尺寸.字号_正文, weight: FontWeight.Normal };
  static readonly selectedOptionFont: Font = SelectStyle.controlFont;
  static readonly selectedOptionColor: ResourceColor = $r('app.color.text_primary');
  static readonly selectedOptionSurface: ResourceColor = $r('app.color.surface_selected');
  static readonly controlRadius: number = 应用尺寸.radiusLg;
  static readonly controlBorder: BorderOptions = SurfaceBorder.options();
  static readonly controlHeight: number = FormRowLayout.controlHeight;
  /** 保留原最小高度，跟随实际 fp 缩放留出上下内边距。 */
  static controlHeightFor(context: UIContext): number {
    return Math.max(SelectStyle.controlHeight, Math.ceil(context.px2vp(context.fp2px(应用尺寸.字号_正文))) + 16);
  }
  // 尾部外边距由表单/设置卡片拥有，避免选择箭头比动作行额外缩进。
  static readonly controlPadding: Padding = { left: 12, right: 0, top: 0, bottom: 0 };
  static readonly controlSpace: number = 8;
  // Select 按当前选项内容测量，避免短标签占满行并留下大块空白。
  static readonly fieldWidth: string = 'auto';
  // 给同一行的字段标签和帮助入口留出空间，不能由长选项挤占。
  static readonly fieldConstraint: ConstraintSizeOptions = FormRowLayout.trailingConstraint;
  static readonly directoryFieldConstraint: ConstraintSizeOptions = FormRowLayout.directoryConstraint;
  static readonly rangeWidth: number = 112;

  // 只负责截断；字体归 Select.font，避免两套字体设置在节点更新时互相覆盖。
  static labelText(): TextModifier {
    return new TextModifier()
      .maxLines(1)
      .textOverflow({ overflow: TextOverflow.Ellipsis });
  }

  private material: string;
  private surfaceColor: ResourceColor;

  /** 页面独立控件传入卡片底色，卡片内部沿用默认的内嵌底色。 */
  constructor(material: string, surfaceColor: ResourceColor = $r('app.color.surface_sidebar')) {
    this.material = material;
    this.surfaceColor = surfaceColor;
  }

  applyNormalAttribute(instance: SelectAttribute): void {
    // 不调用会同时重置字体和圆角的 controlSize；这里只保留配色。
    instance
      .fontColor($r('app.color.text_primary'))
      .backgroundColor(usesGlassMaterial(this.material) ? translucentGlassFill(this.surfaceColor) : (darkMaterial() ? '#000000' : '#FFFFFF'))
      .menuBackgroundColor(usesGlassMaterial(this.material) ? themedGlassFill(darkMaterial() ? '#D915171B' : '#CFFFFFFF', darkMaterial()) : (darkMaterial() ? '#000000' : '#FFFFFF'))
      .menuBackgroundBlurStyle(usesGlassMaterial(this.material) ? BlurStyle.COMPONENT_THIN : BlurStyle.NONE)
      .clip(true)
      .optionFontColor($r('app.color.text_primary'))
      .optionBgColor(usesGlassMaterial(this.material) ? Color.Transparent : (darkMaterial() ? '#000000' : '#FFFFFF'))
      .selectedOptionFontColor(SelectStyle.selectedOptionColor)
      .selectedOptionBgColor(SelectStyle.selectedOptionSurface);
  }
}
