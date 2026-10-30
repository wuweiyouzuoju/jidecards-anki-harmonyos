// SPDX-License-Identifier: AGPL-3.0-or-later
import { HelpLayout } from '../../utils/HelpLayout';

/** 标题独占测量高度，图标只按标题中线放置，44vp热区不参与排版。 */
@Component
export struct HelpTitleLayout {
  @Prop showAction: boolean = false;
  @Prop showHelp: boolean = true;
  @BuilderParam content: () => void = this.emptyContent;
  @Builder
  private emptyContent(): void {}
  onMeasureSize(_self: GeometryInfo, children: Measurable[], constraint: ConstraintSizeOptions): SizeResult {
    if (children.length === 0) return { width: 0, height: 0 };
    const title: MeasureResult = children[0].measure({ minWidth: 0, maxWidth: constraint.maxWidth,
      minHeight: 0, maxHeight: constraint.maxHeight });
    let index: number = 1;
    if (this.showAction && children.length > index) children[index++].measure({
      minWidth: HelpLayout.touchSize, maxWidth: HelpLayout.touchSize,
      minHeight: HelpLayout.touchSize, maxHeight: HelpLayout.touchSize });
    if (this.showHelp && children.length > index) children[index].measure({
      minWidth: HelpLayout.iconSize, maxWidth: HelpLayout.iconSize,
      minHeight: HelpLayout.iconSize, maxHeight: HelpLayout.iconSize });
    return { width: title.width, height: title.height };
  }
  onPlaceChildren(_self: GeometryInfo, children: Layoutable[], _constraint: ConstraintSizeOptions): void {
    if (children.length === 0) return;
    const title: MeasureResult = children[0].measureResult;
    children[0].layout({ x: 0, y: 0 });
    let index: number = 1;
    if (this.showAction && children.length > index) {
      const action: Position = HelpLayout.titleActionPosition(title.width, title.height);
      children[index++].layout({ x: Number(action.x), y: Number(action.y) });
    }
    if (this.showHelp && children.length > index) {
      const help: Position = HelpLayout.titleHelpPosition(title.width, title.height, this.showAction);
      children[index].layout({ x: Number(help.x), y: Number(help.y) });
    }
  }
  build() {
    this.content()
  }
}
