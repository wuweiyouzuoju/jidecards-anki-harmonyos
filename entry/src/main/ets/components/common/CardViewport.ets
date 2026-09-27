// SPDX-License-Identifier: AGPL-3.0-or-later
import { cardViewportWidth } from '../../model/CardViewportLayout';

/** 在测量阶段确定两页的内容宽度，避免首帧窄版再通过状态回调扩宽。 */
@Component
export struct CardViewport {
  @BuilderParam content: () => void = this.emptyContent;

  @Builder
  private emptyContent(): void {}

  onMeasureSize(_self: GeometryInfo, children: Measurable[], constraint: ConstraintSizeOptions): SizeResult {
    const width = Number(constraint.maxWidth);
    const height = Number(constraint.maxHeight);
    const contentWidth = cardViewportWidth(width, height);
    for (const child of children) {
      child.measure({ minWidth: contentWidth, maxWidth: contentWidth, minHeight: height, maxHeight: height });
    }
    return { width: width, height: height };
  }

  onPlaceChildren(self: GeometryInfo, children: Layoutable[], _constraint: ConstraintSizeOptions): void {
    for (const child of children) {
      child.layout({ x: (self.width - child.measureResult.width) / 2, y: 0 });
    }
  }

  build() {
    this.content()
  }
}
