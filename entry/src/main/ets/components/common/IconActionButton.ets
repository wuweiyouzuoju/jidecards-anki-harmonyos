import { BUTTON_OPACITY_KEY, MaterialOpacity, buttonOpacityPercent } from '../../model/SurfaceMaterial';
import { rememberPopupTrigger } from '../../utils/PopupTrigger';
import { SeriesVisual } from '../../utils/SeriesVisual';
// SPDX-License-Identifier: AGPL-3.0-or-later
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
  @StorageProp(BUTTON_OPACITY_KEY) private buttonOpacity: MaterialOpacity | undefined = undefined;
  @StorageProp('surface_material') private surfaceMaterial: string = 'flat';
  @StorageProp('themeMode') private materialThemeMode: string = 'system';
  @StorageProp('systemDarkMode') private materialSystemDark: boolean = false;
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @StorageProp(颜色键.动作主色) private actionColor: string = '#2F5FD0';
  @Prop source: ResourceStr = '';
  @Prop label: ResourceStr = '';
  @Prop isInteractive: boolean = true;
  @Prop glyphColor: string = '';
  @Prop iconFill: ResourceColor = Color.Transparent;
  @Prop surface: ResourceColor = Color.Transparent;
  @Prop cornerAligned: boolean = false;
  @Prop controlSize: number = 应用尺寸.按钮高度;
  @Prop controlWidth: number = 0;
  @Prop controlGlyphSize: number = 18;
  @Prop squareSurface: boolean = false;
  /** 直接展示的导航用简笔描边；菜单的明暗灰色填充不进入顶栏。 */
  @Prop toolbarStyle: boolean = false;
  /** 可隐藏表面/文字，同时保留原布局与点击守卫。 */
  @Prop surfaceVisible: boolean = true;
  @Prop contentVisible: boolean = true;
  @Prop slideMenu: boolean = false;
  onMenuAnchor: (right: number, bottom: number) => void = (_right: number, _bottom: number): void => {};
  @Prop keepMenuOnHoldRelease: boolean = false;
  @Prop feedback: string = 'idle';
  onAction: () => void = (): void => {};
  onHoldOpen: () => void = (): void => {};
  onHoldCancel: () => void = (): void => {};
  private readonly hold: MenuHoldController = new MenuHoldController(
    (): boolean => this.isInteractive, (): void => { if (this.triggerArea !== undefined) this.rememberTrigger(); this.onHoldOpen(); }, (): void => { this.onHoldCancel(); });

  aboutToDisappear(): void { this.stopSlide(); }
  private stopSlide(): void {
    this.hold.cancel();
  }
  private holdOpen(): void {
    if (this.slideMenu) this.hold.hold();
  }
  private slideTouch(event: TouchEvent): void {
    if (this.slideMenu) menuHoldTouch(this.hold, event, this.keepMenuOnHoldRelease);
  }

  private triggerArea: Area | undefined = undefined;

  private rememberTrigger(): void {
    if (this.triggerArea === undefined) return;
    rememberPopupTrigger(this.triggerArea, this.usesSquareSurface() ? 应用尺寸.圆角_卡片 : this.controlSize / 2);
  }

  private activate(): void {
    if (this.hold.consumeClick()) {
      if (this.triggerArea !== undefined) this.rememberTrigger();
      this.onAction();
    }
  }

  private usesSquareSurface(): boolean { return this.toolbarStyle || this.squareSurface; }
  private resolvedSurface(): ResourceColor {
    if (!this.surfaceVisible) return Color.Transparent;
    return this.toolbarStyle ? translucentGlassFill($r('app.color.surface_card')) : this.surface;
  }
  private resolvedGlyphColor(): string { return this.toolbarStyle ? this.actionColor : this.glyphColor; }
  private resolvedIconFill(): ResourceColor { return this.toolbarStyle ? Color.Transparent : this.iconFill; }

  build() {
    Button() {
      Stack({ alignContent: this.cornerAligned ? Alignment.TopEnd : Alignment.Center }) {
        if (!hasActionStatus(this.feedback)) {
          ActionIcon({ source: this.source, tint: this.resolvedIconFill(), strokeColor: this.resolvedGlyphColor(), glyphSize: this.controlGlyphSize })
        } else { ActionStatus({ phase: this.feedback, tint: this.resolvedGlyphColor() || this.actionColor }) }
      }.width('100%').height('100%').padding(this.cornerAligned ? 应用尺寸.间距_4 : 0)
      .opacity(this.contentVisible ? 1 : 0)
    }
    .type(this.usesSquareSurface() ? ButtonType.Normal : ButtonType.Circle)
    .width(this.controlWidth > 0 ? this.controlWidth : this.controlSize).height(this.controlSize).padding(0).flexShrink(0)
    .border(SurfaceBorder.options(this.usesSquareSurface() && this.surfaceVisible ? 应用尺寸.卡片边框 : 0))
    .borderRadius(this.usesSquareSurface() ? 应用尺寸.圆角_卡片 : this.controlSize / 2)
    .backgroundColor(SeriesVisual.buttonFill(this.resolvedSurface(), buttonOpacityPercent(this.buttonOpacity, this.surfaceMaterial)))
    .attributeModifier(SeriesVisual.control(this.surfaceMaterial,
      SeriesVisual.isDark(this.materialThemeMode, this.materialSystemDark), this.actionColor,
      this.usesSquareSurface() ? 应用尺寸.圆角_卡片 : this.controlSize / 2, this.toolbarStyle && this.surfaceVisible, undefined, buttonOpacityPercent(this.buttonOpacity, this.surfaceMaterial)))
    .opacity(this.isInteractive ? 1 : 0.4)
    .hitTestBehavior(this.surfaceVisible && this.contentVisible ? HitTestMode.Default : HitTestMode.None)
    .accessibilityText(typeof this.label === 'string' ? this.label :
      localizedResourceText(this.getUIContext(), this.uiLanguage, this.label))
    .accessibilityLevel(this.contentVisible ? 'auto' : 'no')
    .focusOnTouch(!this.slideMenu)
    .enabled(this.isInteractive)
    .attributeModifier(new PressFeedback(1, 0.4, true)).stateEffect(false)
    .onAreaChange((_old: Area, area: Area): void => {
      this.triggerArea = area;
      if (this.slideMenu) this.onMenuAnchor(Number(area.globalPosition.x) + Number(area.width),
        Number(area.globalPosition.y) + Number(area.height));
    })
    .onClick((): void => { this.activate(); })
    .onTouch((event: TouchEvent): void => { this.slideTouch(event); })
    .gesture(LongPressGesture({ duration: MENU_SLIDE_HOLD_MS }).onAction((): void => { this.holdOpen(); }))
  }
}
