// SPDX-License-Identifier: AGPL-3.0-or-later
import { ActionMenuPointerSide, actionMenuBubbleOutline } from './ActionMenuLayout';
import { MenuSurface } from './MenuSurface';
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { 应用尺寸 } from '../../utils/应用尺寸';

/** 主菜单和子面板共用连续轮廓；尖角及阴影不随正文滚动，也不参与点击。 */
@Component
export struct MenuBubbleSurface {
  @Prop panelWidth: number = 应用尺寸.compactMenuWidth;
  @Prop panelHeight: number = 应用尺寸.menuItemHeight;
  @Prop pointerCenter: number = 66;
  @Prop pointerSide: ActionMenuPointerSide = ActionMenuPointerSide.Right;

  private surfaceWidth(): number {
    return this.panelWidth + (this.pointerSide === ActionMenuPointerSide.Right ||
      this.pointerSide === ActionMenuPointerSide.Left ? MenuSurface.pointerDepth : 0);
  }

  private surfaceHeight(): number {
    return this.panelHeight + (this.pointerSide === ActionMenuPointerSide.Top ||
      this.pointerSide === ActionMenuPointerSide.Bottom ? MenuSurface.pointerDepth : 0);
  }

  private outlineCommands(): string {
    return actionMenuBubbleOutline(this.panelWidth, this.panelHeight, this.pointerCenter,
      this.getUIContext().vp2px(1), 应用尺寸.卡片边框, 应用尺寸.radiusLg, MenuSurface.pointerDepth,
      MenuSurface.pointerSpan, this.pointerSide);
  }

  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      Path().commands(this.outlineCommands())
        .width(this.surfaceWidth()).height(this.surfaceHeight())
        .fill($r('app.color.menu_shadow')).strokeWidth(0).blur(6).translate({ y: 4 })
        .position({ x: 0, y: 0 })
      Path().commands(this.outlineCommands())
        .width(this.surfaceWidth()).height(this.surfaceHeight())
        .fill($r('app.color.menu_surface')).stroke(SurfaceBorder.color())
        .strokeWidth(应用尺寸.卡片边框).antiAlias(true).position({ x: 0, y: 0 })
    }.width(this.surfaceWidth()).height(this.surfaceHeight())
    .hitTestBehavior(HitTestMode.None).accessibilityLevel('no')
  }
}
