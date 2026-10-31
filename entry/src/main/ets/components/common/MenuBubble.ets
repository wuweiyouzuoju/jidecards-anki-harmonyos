// SPDX-License-Identifier: AGPL-3.0-or-later
import { GlassBubblePanel } from './GlassBubblePanel';
import { ActionMenuPointerSide } from './ActionMenuLayout';
import { 应用尺寸 } from '../../utils/应用尺寸';

/** 侧面板的圆角和指向尖角同属一个扁平轮廓，底色与描边由公共表面拥有。 */
@Component
export struct MenuBubble {
  @Prop source: string = '';
  @Prop panelWidth: number = 应用尺寸.compactMenuWidth;
  @Prop pointerCenter: number = 66;
  @Prop pointerSide: ActionMenuPointerSide = ActionMenuPointerSide.Right;
  @BuilderParam content: () => void = this.emptyContent;

  @Builder
  private emptyContent(): void {}

  build() {
    GlassBubblePanel({ source: this.source, panelWidth: this.panelWidth, pointerCenter: this.pointerCenter, pointerSide: this.pointerSide,
      content: (): void => { this.content(); } })
  }
}
