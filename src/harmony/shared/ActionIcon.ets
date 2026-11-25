// SPDX-License-Identifier: AGPL-3.0-or-later
import { ColorMetrics } from '@kit.ArkUI';
import { iconStrokeMatrix, iconOutlineColor } from '../../core/IconColor';

/** 提炼自当前 jidecards ActionIcon；颜色/资源的状态由调用产品发布。 */
@Component
export struct SharedActionIcon {
  @Prop source: ResourceStr = '';
  @Prop tint: ResourceColor = Color.Transparent;
  @Prop glyphSize: number = 18;
  @Prop strokeColor: string = '';
  /** 玻璃菜单仅描边；资源必须提供描边几何，状态徽标按产品语义显式保留填色。 */
  @Prop outlineOnly: boolean = false;
  @Prop semanticStrokeColor: ResourceColor | undefined = undefined;
  // 空间训练直接提供资源解析后的矩阵；菜单/导航保留原始描边规则。
  @Prop colorMatrix: number[] | undefined = undefined;

  private resolvedStrokeColor(): string {
    if (!this.outlineOnly || /^#[0-9a-fA-F]{6}$/.test(this.strokeColor)) return this.strokeColor;
    if (this.semanticStrokeColor !== undefined) {
      try {
        const color: ColorMetrics = ColorMetrics.resourceColor(this.semanticStrokeColor);
        if (color.alpha > 0) return '#' + [color.red, color.green, color.blue]
          .map((value: number): string => Math.round(value).toString(16).padStart(2, '0')).join('');
      } catch { /* 无效可选语义色退回原资源描边。 */ }
    }
    return iconOutlineColor(typeof this.tint === 'string' ? this.tint : '', this.strokeColor);
  }
  private resolvedFill(): ResourceColor { return this.outlineOnly ? Color.Transparent : this.tint; }

  build() {
    Image(this.source).width(this.glyphSize).height(this.glyphSize).flexShrink(0)
      .objectFit(ImageFit.Contain).fillColor(this.resolvedFill())
      .colorFilter(new ColorFilter(this.colorMatrix ?? iconStrokeMatrix(this.resolvedStrokeColor())))
      .hitTestBehavior(HitTestMode.None).accessibilityLevel('no')
  }
}
