// SPDX-License-Identifier: AGPL-3.0-or-later
import { SharedSurface, SharedSurfaceBackground } from 'jide_foundation';
import { compactLandscapeScale } from '../../model/AppLayoutState';
import { WINDOW_SIZE_KEY, WindowSizeVp } from '../../model/WindowSafeLayout';
import { PAGE_TOOLBAR_SCOPE, PageToolbarActionScope, nextPageToolbarActionId } from '../../model/PageToolbarActions';
import { BUTTON_OPACITY_KEY, MaterialOpacity, buttonOpacityPercent } from '../../model/SurfaceMaterial';
import { rememberPopupTrigger } from '../../utils/PopupTrigger';
import { SeriesVisual } from '../../utils/SeriesVisual';
import { translucentGlassFill } from '../../utils/GlassMaterial';
import { ActionIcon } from './ActionIcon';
import { PressFeedback } from '../../utils/PressFeedback';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { localizedResourceText } from '../../utils/UiFeedback';
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { 颜色键 } from '../../model/颜色主题';
import { MenuHoldController } from '../../model/MenuHoldController';
import { menuHoldTouch } from './MenuHoldGesture';
import { ActionStatus } from './ActionStatus';
import { hasActionStatus, MENU_SLIDE_HOLD_MS } from '../../model/InteractionFeedback';

/** 仅图标动作默认44vp点击区；可按布局调整几何，宿主提供完整本地化无障碍名称。 */
@Component
export struct IconActionButton {
  @StorageProp(WINDOW_SIZE_KEY) private densityWindow: WindowSizeVp = { width: 0, height: 0 };
  private densityScale(): number {
    return compactLandscapeScale(this.densityWindow.width, this.densityWindow.height);
  }

  @StorageProp('appearance_elements_active') private appearanceElements: string = '';
  @StorageProp(BUTTON_OPACITY_KEY) private buttonOpacity: MaterialOpacity | undefined = undefined;
  @StorageProp('surface_material') private surfaceMaterial: string = 'flat';
  @StorageProp('themeMode') private materialThemeMode: string = 'system';
  @StorageProp('systemDarkMode') private materialSystemDark: boolean = false;
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @StorageProp(颜色键.动作主色) private actionColor: string = '#2F5FD0';
  @Consume(PAGE_TOOLBAR_SCOPE) private pageActions: PageToolbarActionScope = new PageToolbarActionScope();
  @Prop pageWheelEligible: boolean = true;
  @Prop @Watch('pageActionChanged') pageWheelSelected: boolean = false;
  private pageActionId: string = nextPageToolbarActionId();
  @Prop @Watch('pageActionChanged') source: ResourceStr = '';
  @Prop @Watch('pageActionChanged') label: ResourceStr = '';
  @Prop @Watch('pageActionChanged') isInteractive: boolean = true;
  @Prop glyphColor: string = '';
  @Prop preserveIconFill: boolean = false;
  @Prop iconFill: ResourceColor = Color.Transparent;
  @Prop surface: ResourceColor = Color.Transparent;
  @Prop cornerAligned: boolean = false;
  @Prop controlSize: number = 应用尺寸.按钮高度;
  @Prop controlWidth: number = 0;
  @Prop controlGlyphSize: number = 18;
  @Prop squareSurface: boolean = false;
  @Prop outlinedCircle: boolean = false;
  /** 发送等主操作保留实心主题色，不受玻璃材质或透明度影响。 */
  @Prop solidSurface: boolean = false;
  /** 直接展示的导航用简笔描边；菜单的明暗灰色填充不进入顶栏。 */
  @Prop toolbarStyle: boolean = false;
  /** 可隐藏表面/文字，同时保留原布局与点击守卫。 */
  @Prop @Watch('pageActionChanged') surfaceVisible: boolean = true;
  @Prop @Watch('pageActionChanged') contentVisible: boolean = true;
  @Prop slideMenu: boolean = false;
  onMenuAnchor: (right: number, bottom: number) => void = (_right: number, _bottom: number): void => {};
  @Prop keepMenuOnHoldRelease: boolean = false;
  @Prop @Watch('pageActionChanged') feedback: string = 'idle';
  onAction: () => void = (): void => {};
  onHoldOpen: () => void = (): void => {};
  onHoldCancel: () => void = (): void => {};
  private readonly hold: MenuHoldController = new MenuHoldController(
    (): boolean => this.isInteractive, (): void => { if (this.triggerArea !== undefined) this.rememberTrigger(); this.onHoldOpen(); }, (): void => { this.onHoldCancel(); });

  aboutToDisappear(): void { this.stopSlide(); this.pageActions.remove(this.pageActionId); }
  private pageActionChanged(): void {
    if (!this.pageActions.mounted || !this.toolbarStyle || !this.pageWheelEligible) return;
    if (!this.contentVisible || !this.surfaceVisible) { this.pageActions.remove(this.pageActionId); return; }
    if (this.toolbarArea === undefined) return;
    this.pageActions.upsert({ id: this.pageActionId, source: this.source, label: this.label,
      enabled: this.isInteractive, selected: this.pageWheelSelected, feedback: this.feedback, area: this.toolbarArea,
      activate: (area?: Area): void => {
        if (area !== undefined) {
          this.triggerArea = area;
          if (this.slideMenu) this.onMenuAnchor(Number(area.globalPosition.x) + Number(area.width), Number(area.globalPosition.y) + Number(area.height));
        }
        this.activate();
      } });
  }
  private inPageWheel(): boolean {
    return this.pageActions.revision >= 0 && this.toolbarStyle && this.pageWheelEligible &&
      this.pageActions.enabled && this.pageActions.contains(this.pageActionId);
  }
  private stopSlide(): void {
    this.hold.cancel();
  }
  private holdOpen(): void {
    if (this.slideMenu) this.hold.hold();
  }
  private slideTouch(event: TouchEvent): void {
    if (this.slideMenu) menuHoldTouch(this.hold, event, this.keepMenuOnHoldRelease);
  }

  private toolbarArea: Area | undefined = undefined;
  private triggerArea: Area | undefined = undefined;

  private rememberTrigger(): void {
    if (this.triggerArea === undefined) return;
    rememberPopupTrigger(this.triggerArea, this.usesSquareSurface() ? 应用尺寸.圆角_卡片 : this.controlSize / 2);
  }

  private activate(): void {
    if (!this.inPageWheel() && this.toolbarArea !== undefined) this.triggerArea = this.toolbarArea;
    if (this.hold.consumeClick()) {
      if (this.triggerArea !== undefined) this.rememberTrigger();
      this.onAction();
    }
  }

  private renderedControlSize(): number {
    const scale: number = this.densityScale();
    return scale === 1 ? this.controlSize : Math.min(this.controlSize, 应用尺寸.按钮高度 * scale);
  }
  private renderedControlWidth(): number {
    if (this.controlWidth <= 0) return this.renderedControlSize();
    const scale: number = this.densityScale();
    return scale === 1 ? this.controlWidth : Math.min(this.controlWidth, 应用尺寸.按钮高度 * scale);
  }

  private usesSquareSurface(): boolean { return this.toolbarStyle || this.squareSurface; }
  private controlRadius(): number {
    return this.usesSquareSurface() ? 应用尺寸.圆角_卡片 : this.renderedControlSize() / 2;
  }
  private controlMaterialVisible(): boolean {
    return this.surfaceVisible && (this.toolbarStyle || this.outlinedCircle);
  }
  private resolvedSurface(): ResourceColor {
    if (!this.surfaceVisible) return Color.Transparent;
    return this.toolbarStyle ? translucentGlassFill($r('app.color.surface_card')) : this.surface;
  }
  private resolvedGlyphColor(): string { return this.toolbarStyle ? this.actionColor : this.glyphColor; }
  private resolvedIconFill(): ResourceColor { return this.toolbarStyle ? Color.Transparent : this.iconFill; }

  @Builder
  private renderGlassBackground(surface: SharedSurface) {
    SharedSurfaceBackground({ surface: surface })
  }

  build() {
    Button() {
      Stack({ alignContent: this.cornerAligned ? Alignment.TopEnd : Alignment.Center }) {
        if (!hasActionStatus(this.feedback)) {
          ActionIcon({ source: this.source, tint: this.resolvedIconFill(), strokeColor: this.resolvedGlyphColor(), glyphSize: this.densityScale() === 1 ? this.controlGlyphSize : Math.min(this.controlGlyphSize, 18 * this.densityScale()), preserveFill: this.preserveIconFill })
        } else { ActionStatus({ phase: this.feedback, tint: this.resolvedGlyphColor() || this.actionColor }) }
      }.width('100%').height('100%').padding(this.cornerAligned ? 应用尺寸.间距_4 : 0)
      .opacity(this.contentVisible ? 1 : 0)
    }
    .type(this.usesSquareSurface() ? ButtonType.Normal : ButtonType.Circle)
    .width(this.renderedControlWidth()).height(this.renderedControlSize()).padding(0).flexShrink(0)
    .border(SurfaceBorder.options(this.usesSquareSurface() && this.surfaceVisible ? 应用尺寸.卡片边框 : 0, undefined, this.appearanceElements))
    .borderRadius(this.controlRadius())
    .backgroundColor(SeriesVisual.buttonFill(this.resolvedSurface(), this.solidSurface ? 100 : buttonOpacityPercent(this.buttonOpacity, this.surfaceMaterial)))
    .attributeModifier(SeriesVisual.control(this.solidSurface ? 'flat' : this.surfaceMaterial,
      SeriesVisual.isDark(this.materialThemeMode, this.materialSystemDark), this.actionColor,
      this.controlRadius(), this.controlMaterialVisible(), this.outlinedCircle ? this.resolvedSurface() : undefined,
      this.solidSurface ? 100 : buttonOpacityPercent(this.buttonOpacity, this.surfaceMaterial), this.appearanceElements, '', false, this.outlinedCircle))
    .background(this.renderGlassBackground(SeriesVisual.control(this.solidSurface ? 'flat' : this.surfaceMaterial,
      SeriesVisual.isDark(this.materialThemeMode, this.materialSystemDark), this.actionColor,
      this.controlRadius(), this.controlMaterialVisible(), this.outlinedCircle ? this.resolvedSurface() : undefined,
      this.solidSurface ? 100 : buttonOpacityPercent(this.buttonOpacity, this.surfaceMaterial), this.appearanceElements, '', false, this.outlinedCircle)))
    .visibility(this.inPageWheel() ? Visibility.Hidden : Visibility.Visible)
    .opacity(this.isInteractive ? 1 : 0.4)
    .hitTestBehavior(this.surfaceVisible && this.contentVisible ? HitTestMode.Default : HitTestMode.None)
    .accessibilityText(typeof this.label === 'string' ? this.label :
      localizedResourceText(this.getUIContext(), this.uiLanguage, this.label))
    .accessibilityLevel(this.contentVisible ? 'auto' : 'no')
    .focusOnTouch(!this.slideMenu)
    .enabled(this.isInteractive)
    .attributeModifier(new PressFeedback(1, 0.4, true)).stateEffect(false)
    .onAreaChange((_old: Area, area: Area): void => {
      this.triggerArea = area; this.toolbarArea = area;
      this.pageActionChanged();
      if (this.slideMenu) this.onMenuAnchor(Number(area.globalPosition.x) + Number(area.width),
        Number(area.globalPosition.y) + Number(area.height));
    })
    .onClick((): void => { this.activate(); })
    .onTouch((event: TouchEvent): void => { this.slideTouch(event); })
    .gesture(LongPressGesture({ duration: MENU_SLIDE_HOLD_MS }).onAction((): void => { this.holdOpen(); }))
  }
}
