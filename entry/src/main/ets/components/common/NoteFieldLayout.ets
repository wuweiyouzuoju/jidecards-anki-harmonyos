// SPDX-License-Identifier: AGPL-3.0-or-later
import { 应用尺寸 } from '../../utils/应用尺寸';

/** 按真实测量约束直接排布首帧；子节点依次为两个模式按钮、输入栏、可选源码说明。 */
@Component
export struct NoteFieldLayout {
  @Prop wideMinWidth: number;
  @Prop railWidth: number;
  @BuilderParam content: () => void = this.emptyContent;

  @Builder
  private emptyContent(): void {}

  onMeasureSize(self: GeometryInfo, children: Measurable[], constraint: ConstraintSizeOptions): SizeResult {
    const maximumWidth: number = Number(constraint.maxWidth);
    const fieldWidth: number = Number.isFinite(maximumWidth) ? Math.max(0, maximumWidth) : self.width;
    if (children.length < 3) return { width: fieldWidth, height: 0 };
    const wide: boolean = fieldWidth >= this.wideMinWidth;
    const buttonWidth: number = wide ? this.railWidth :
      Math.max(0, (fieldWidth - 应用尺寸.间距_8) / 2);
    const inputWidth: number = wide ? Math.max(0, fieldWidth - buttonWidth - 应用尺寸.间距_8) : fieldWidth;
    const maximumHeight: number = Number(constraint.maxHeight);
    const childMaxHeight: number = Number.isFinite(maximumHeight) ? Math.max(0, maximumHeight) : Number.MAX_SAFE_INTEGER;
    const visual: MeasureResult = children[0].measure({ minWidth: buttonWidth, maxWidth: buttonWidth,
      minHeight: 应用尺寸.按钮高度, maxHeight: childMaxHeight });
    const source: MeasureResult = children[1].measure({ minWidth: buttonWidth, maxWidth: buttonWidth,
      minHeight: 应用尺寸.按钮高度, maxHeight: childMaxHeight });
    const input: MeasureResult = children[2].measure({ minWidth: inputWidth, maxWidth: inputWidth,
      minHeight: 0, maxHeight: childMaxHeight });
    let resultHeight: number = input.height + (wide ? 0 : Math.max(visual.height, source.height) + 应用尺寸.间距_5);
    if (children.length > 3) {
      const hint: MeasureResult = children[3].measure({ minWidth: inputWidth, maxWidth: inputWidth,
        minHeight: 0, maxHeight: childMaxHeight });
      resultHeight += 应用尺寸.间距_5 + hint.height;
    }
    return { width: fieldWidth, height: resultHeight };
  }

  onPlaceChildren(self: GeometryInfo, children: Layoutable[], _constraint: ConstraintSizeOptions): void {
    if (children.length < 3) return;
    const wide: boolean = self.width >= this.wideMinWidth;
    const input: MeasureResult = children[2].measureResult;
    const inputTop: number = wide ? 0 :
      Math.max(children[0].measureResult.height, children[1].measureResult.height) + 应用尺寸.间距_5;
    const railLeft: number = input.width + 应用尺寸.间距_8;
    children[0].layout({ x: wide ? railLeft : 0, y: 0 });
    children[1].layout({ x: wide ? railLeft : children[0].measureResult.width + 应用尺寸.间距_8,
      y: wide ? input.height - children[1].measureResult.height : 0 });
    children[2].layout({ x: 0, y: inputTop });
    if (children.length > 3) children[3].layout({ x: 0, y: inputTop + input.height + 应用尺寸.间距_5 });
  }

  build() {
    this.content()
  }
}
