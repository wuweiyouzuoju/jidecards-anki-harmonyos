// SPDX-License-Identifier: AGPL-3.0-or-later
import { MenuSurface } from './MenuSurface';
import { MenuBubbleSurface } from './MenuBubbleSurface';
import { ActionMenuPointerSide } from './ActionMenuLayout';
import { 应用尺寸 } from '../../utils/应用尺寸';

/** 左侧面板的圆角和指向尖角同属一个轮廓；阴影模糊轮廓本身，不投影 Path 的矩形边界。 */
@Component
export struct MenuBubble {
  @Prop panelWidth: number = 应用尺寸.compactMenuWidth;
  @Prop pointerCenter: number = 66;
  @Prop pointerSide: ActionMenuPointerSide = ActionMenuPointerSide.Right;
  @State private panelHeight: number = 44;
  @BuilderParam content: () => void = this.emptyContent;

  @Builder
  private emptyContent(): void {}

  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      MenuBubbleSurface({ panelWidth: this.panelWidth, panelHeight: this.panelHeight, pointerCenter: this.pointerCenter,
        pointerSide: this.pointerSide })
        .position({ x: 0, y: 0 })
      Column() { this.content() }.width(this.panelWidth).borderRadius(应用尺寸.radiusLg).clip(true)
        .margin({ left: this.pointerSide === ActionMenuPointerSide.Left ? MenuSurface.pointerDepth : 0 })
        .onAreaChange((_old: Area, area: Area): void => {
          const height: number = Number(area.height);
          if (height > 0 && Math.abs(this.panelHeight - height) >= 0.5) this.panelHeight = height;
        })
    }.width(this.panelWidth + MenuSurface.pointerDepth)
  }
}
