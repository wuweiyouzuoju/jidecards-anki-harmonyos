// SPDX-License-Identifier: AGPL-3.0-or-later
import { SharedGlassPanel } from './PopupPanel';
import { GlassFusionRect, GLASS_MENU_ENTER_MS } from '../../core/GlassFusion';
import { ActionMenuPointerSide, actionMenuBubbleOutline } from '../../core/MenuLayout';
import { SharedMenuTokens, SharedMenuTheme, sharedMenuTheme } from './MenuTypes';
@Component
export struct SharedGlassBubblePanel {
  @Prop theme: SharedMenuTheme = sharedMenuTheme();
  @Prop backgroundSource: string = '';
  captureAllowed: (initialFrame?: boolean) => boolean = (): boolean => false;
  @Prop source: string = '';
  @Prop trigger: GlassFusionRect | undefined = undefined;
  @Prop enterScale: number = 1;
  @Prop enterAnimation: AnimateParam = { duration: GLASS_MENU_ENTER_MS, curve: Curve.EaseOut };
  @Prop exitTransition: TransitionEffect = TransitionEffect.IDENTITY;
  exitTransitionFor: ((x: string, y: string) => TransitionEffect) | undefined = undefined;
  @Prop flatTransition: TransitionEffect = TransitionEffect.IDENTITY;
  @Prop showContourStroke: boolean = true;
  @Prop panelWidth: number = 180;
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
      this.getUIContext().vp2px(1), 1, SharedMenuTokens.radius,
      SharedMenuTokens.pointerDepth, SharedMenuTokens.pointerSpan, this.pointerSide);
  }
  @Builder
  private body() {
    Stack({ alignContent: Alignment.TopStart }) {
      Column() { this.content() }.width(this.panelWidth)
        .margin({ left: this.pointerSide === ActionMenuPointerSide.Left ? SharedMenuTokens.pointerDepth : 0,
          top: this.pointerSide === ActionMenuPointerSide.Top ? SharedMenuTokens.pointerDepth : 0 })
        .onAreaChange((_old: Area, area: Area): void => { const height: number = Number(area.height);
          if (height > 0 && Math.abs(height - this.panelHeight) > 0.1) this.panelHeight = height; })
      if (this.showContourStroke) {
      Stack({ alignContent: Alignment.TopStart }) {
      Path().commands(this.contourCommands()).fill(Color.Transparent)
        .stroke(this.theme.material === 'glass' ?
          (this.theme.dark ? '#22FFFFFF' : '#506B7C96') : this.theme.lineColor)
        .strokeWidth(this.theme.material === 'glass' ? (this.theme.dark ? 0.8 : 1) : 1).width(this.panelWidth + (this.vertical() ? 0 : SharedMenuTokens.pointerDepth))
        .height(this.panelHeight + (this.vertical() ? SharedMenuTokens.pointerDepth : 0)).hitTestBehavior(HitTestMode.None)
      }.width(0).height(0).position({ x: 0, y: 0 }).hitTestBehavior(HitTestMode.None)
      }
    }.width(this.panelWidth + (this.vertical() ? 0 : SharedMenuTokens.pointerDepth))
      .height(LayoutPolicy.wrapContent)
      .padding({ bottom: this.pointerSide === ActionMenuPointerSide.Bottom ? SharedMenuTokens.pointerDepth : 0 })
  }
  build() {
    SharedGlassPanel({ trigger: this.trigger, enterScale: this.enterScale, enterAnimation: this.enterAnimation, exitTransition: this.exitTransitionFor === undefined ? this.exitTransition : this.exitTransitionFor(this.motionCenterX(), this.motionCenterY()), flatTransition: this.flatTransition, theme: this.theme, backgroundSource: this.backgroundSource, captureAllowed: this.captureAllowed, source: this.source, role: 'menu', radius: 0,
      centerX: this.motionCenterX(), centerY: this.motionCenterY(),
      geometryReady: this.panelHeight > 0,
      panelWidth: this.panelWidth + (this.vertical() ? 0 : SharedMenuTokens.pointerDepth), contourPath: this.contourCommands(), onPrepared: this.onPrepared,
      content: (): void => { this.body(); } })
  }
}
