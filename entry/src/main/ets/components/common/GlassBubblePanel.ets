import { SurfaceBorder } from '../../utils/SurfaceBorder';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { GlassPanel } from './GlassPanel';
import { ActionMenuPointerSide, actionMenuBubbleOutline } from './ActionMenuLayout';
import { MenuSurface } from './MenuSurface';
import { 应用尺寸 } from '../../utils/应用尺寸';
@Component
export struct GlassBubblePanel {
  @StorageProp('surface_material') private material: string = 'flat';
  @StorageProp('themeMode') private themeMode: string = 'system';
  @StorageProp('systemDarkMode') private systemDark: boolean = false;
  @Prop source: string = '';
  @Prop panelWidth: number = 应用尺寸.compactMenuWidth;
  @Prop pointerCenter: number = 66;
  @Prop pointerSide: ActionMenuPointerSide = ActionMenuPointerSide.Right;
  @State private panelHeight: number = 0;
  onPrepared: () => void = (): void => {};
  @BuilderParam content: () => void = this.empty;
  @Builder
  private empty(): void {}
  private vertical(): boolean { return this.pointerSide === ActionMenuPointerSide.Top || this.pointerSide === ActionMenuPointerSide.Bottom; }
  private motionCenterX(): string {
    if (!this.vertical()) return this.pointerSide === ActionMenuPointerSide.Left ? '0%' : '100%';
    return `${Math.max(0, Math.min(100, this.pointerCenter / this.panelWidth * 100))}%`;
  }
  private motionCenterY(): string {
    if (this.vertical()) return this.pointerSide === ActionMenuPointerSide.Top ? '0%' : '100%';
    return `${Math.max(0, Math.min(100, this.pointerCenter / Math.max(1, this.panelHeight) * 100))}%`;
  }
  private contourCommands(): string {
    return actionMenuBubbleOutline(this.panelWidth, this.panelHeight, this.pointerCenter,
      this.getUIContext().vp2px(1), 应用尺寸.卡片边框, 应用尺寸.radiusLg,
      MenuSurface.pointerDepth, MenuSurface.pointerSpan, this.pointerSide);
  }
  @Builder
  private body() {
    Stack({ alignContent: Alignment.TopStart }) {
      Column() { this.content() }.width(this.panelWidth)
        .margin({ left: this.pointerSide === ActionMenuPointerSide.Left ? MenuSurface.pointerDepth : 0,
          top: this.pointerSide === ActionMenuPointerSide.Top ? MenuSurface.pointerDepth : 0 })
        .onAreaChange((_old: Area, area: Area): void => { const height: number = Number(area.height);
          if (height > 0 && Math.abs(height - this.panelHeight) > 0.1) this.panelHeight = height; })
      Stack({ alignContent: Alignment.TopStart }) {
      Path().commands(this.contourCommands()).fill(Color.Transparent)
        .stroke(this.material === 'glass' ?
          SurfaceBorder.glassOutlineColor(this.themeMode === 'dark' || (this.themeMode !== 'light' &&
          this.systemDark === true)) : $r('app.color.surface_border'))
        .strokeWidth(this.material === 'glass' ? SurfaceBorder.glassOutlineWidth(
          this.themeMode === 'dark' || (this.themeMode !== 'light' && this.systemDark === true)) : 应用尺寸.卡片边框).width(this.panelWidth + (this.vertical() ? 0 : MenuSurface.pointerDepth))
        .height(this.panelHeight + (this.vertical() ? MenuSurface.pointerDepth : 0)).hitTestBehavior(HitTestMode.None)
      }.width(0).height(0).position({ x: 0, y: 0 }).hitTestBehavior(HitTestMode.None)
    }.width(this.panelWidth + (this.vertical() ? 0 : MenuSurface.pointerDepth))
      .height(LayoutPolicy.wrapContent)
      .padding({ bottom: this.pointerSide === ActionMenuPointerSide.Bottom ? MenuSurface.pointerDepth : 0 })
  }
  build() {
    GlassPanel({ source: this.source, role: 'menu', radius: 0,
      centerX: this.motionCenterX(), centerY: this.motionCenterY(),
      geometryReady: this.panelHeight > 0,
      panelWidth: this.panelWidth + (this.vertical() ? 0 : MenuSurface.pointerDepth), contourPath: this.contourCommands(), onPrepared: this.onPrepared,
      content: (): void => { this.body(); } })
  }
}
