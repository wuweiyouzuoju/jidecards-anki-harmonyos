// SPDX-License-Identifier: AGPL-3.0-or-later
import { MenuSurface } from './MenuSurface';
import { actionMenuBubbleOutline } from './ActionMenuLayout';
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { 应用尺寸 } from '../../utils/应用尺寸';

/** 左侧面板的圆角和指向尖角同属一个轮廓；阴影模糊轮廓本身，不投影 Path 的矩形边界。 */
@Component
export struct MenuBubble {
  @Prop panelWidth: number = 应用尺寸.compactMenuWidth;
  @Prop pointerCenter: number = 66;
  @State private panelHeight: number = 44;
  @BuilderParam content: () => void = this.emptyContent;

  @Builder
  private emptyContent(): void {}

  private outlineCommands(): string {
    return actionMenuBubbleOutline(this.panelWidth, this.panelHeight, this.pointerCenter,
      this.getUIContext().vp2px(1), 应用尺寸.卡片边框, 应用尺寸.radiusLg, MenuSurface.pointerDepth, MenuSurface.pointerSpan);
  }

  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      Path().commands(this.outlineCommands())
        .width(this.panelWidth + MenuSurface.pointerDepth).height(this.panelHeight)
        .fill($r('app.color.menu_shadow')).strokeWidth(0).blur(6).translate({ y: 4 })
        .hitTestBehavior(HitTestMode.None).accessibilityLevel('no').position({ x: 0, y: 0 })
      Path().commands(this.outlineCommands())
        .width(this.panelWidth + MenuSurface.pointerDepth).height(this.panelHeight)
        .fill($r('app.color.menu_surface')).stroke(SurfaceBorder.color())
        .strokeWidth(应用尺寸.卡片边框).antiAlias(true)
        .hitTestBehavior(HitTestMode.None).accessibilityLevel('no').position({ x: 0, y: 0 })
      Column() { this.content() }.width(this.panelWidth).borderRadius(应用尺寸.radiusLg).clip(true)
        .onAreaChange((_old: Area, area: Area): void => {
          const height: number = Number(area.height);
          if (height > 0 && Math.abs(this.panelHeight - height) >= 0.5) this.panelHeight = height;
        })
    }.width(this.panelWidth + MenuSurface.pointerDepth)
  }
}
