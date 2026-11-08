// SPDX-License-Identifier: AGPL-3.0-or-later
import { SharedAnchoredMenu, SharedToolbarMenuBounds, GlassFusionRect } from 'jide_foundation';
import { currentGlassSource, retainGlassPanel, releaseGlassPanel, sourceCaptureAllowed, GLASS_BACKGROUND_SOURCE } from '../../utils/GlassBackdrop';
import { takePopupTrigger } from '../../utils/PopupTrigger';
import { productMenuTheme } from '../../utils/MenuTheme';
import { SurfaceTransition } from '../../utils/SurfaceTransition';
import { APP_FOREGROUND_KEY } from '../../model/AppLifecycleState';
import { PAGE_COMPACT_LAYOUT_KEY } from '../../model/AppLayoutState';
import { DIALOG_OPACITY_KEY, MaterialOpacity } from '../../model/SurfaceMaterial';
import { MenuSlideScope, menuSlideSession } from '../../model/MenuSlideSession';
import { ActionMenuBubble } from './ActionMenuLayout';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { WINDOW_KEYBOARD_TOP_KEY, WINDOW_SAFE_TOP_KEY, WINDOW_SAFE_BOTTOM_KEY, WINDOW_SAFE_LEFT_KEY, WINDOW_SAFE_RIGHT_KEY } from '../../model/WindowSafeLayout';

/** 薄适配只映射产品状态，工具栏定位、滚动、点击关闭和面板由公共基础统一拥有。 */
@Component
export struct AnchoredMenu {
  @Prop closeRequest: number = 0;
  @Prop toolbarBounds: SharedToolbarMenuBounds | undefined = undefined;
  @Prop menuWidth: number = 应用尺寸.compactMenuWidth;
  @Prop topOffset: number = 0;
  @Prop alignEnd: boolean = true;
  @Prop contentMaxWidth: Length = '100%';
  @Prop contentLeft: number | undefined = undefined;
  @Prop anchorRight: number | undefined = undefined;
  @Prop anchorBottom: number | undefined = undefined;
  @Prop cornerRadius: number = 应用尺寸.radiusLg;
  @Prop surfaceVisible: boolean = true;
  @Prop refractionSource: string = '';
  @Prop materialRole: string = 'menu';
  @Prop bubble: ActionMenuBubble | undefined = undefined;
  @Prop maxHeight: number | undefined = undefined;
  @StorageProp('surface_material') private material: string = 'flat';
  @StorageProp('themeMode') private mode: string = 'system';
  @StorageProp('systemDarkMode') private systemDark: boolean = false;
  @StorageProp(APP_FOREGROUND_KEY) private foreground: boolean = false;
  @StorageProp(DIALOG_OPACITY_KEY) private dialogOpacity: MaterialOpacity | undefined = undefined;
  @StorageProp('theme_color_action_primary') private accent: string = '#2F5FD0';
  @StorageProp(PAGE_COMPACT_LAYOUT_KEY) private narrow: boolean = false;
  @StorageProp(WINDOW_KEYBOARD_TOP_KEY) private keyboardTop: number = 0;
  @StorageProp(WINDOW_SAFE_TOP_KEY) private safeTop: number = 0;
  @StorageProp(WINDOW_SAFE_BOTTOM_KEY) private safeBottom: number = 0;
  @StorageProp(WINDOW_SAFE_LEFT_KEY) private safeLeft: number = 0;
  @StorageProp(WINDOW_SAFE_RIGHT_KEY) private safeRight: number = 0;
  @State private sourceId: string = '';
  private trigger: GlassFusionRect | undefined = undefined;
  private retained: boolean = false;
  slideScope: MenuSlideScope = new MenuSlideScope();
  onPanelArea: (area: Area) => void = (_area: Area): void => {};
  onPrepared: () => void = (): void => {};
  onClose: () => void = (): void => {};
  @BuilderParam content: () => void = this.empty;
  @Builder
  private empty(): void {}
  aboutToAppear(): void {
    this.sourceId = this.refractionSource || currentGlassSource(this.getUIContext());
    if (this.surfaceVisible) this.trigger = takePopupTrigger();
    if (this.surfaceVisible) { retainGlassPanel(this.sourceId); this.retained = true; }
  }
  aboutToDisappear(): void { if (this.retained) { releaseGlassPanel(this.sourceId); this.retained = false; } }
  build() {
    SharedAnchoredMenu({
      closeRequest: this.closeRequest,
      toolbarBounds: this.toolbarBounds,
      menuWidth: this.menuWidth,
      topOffset: this.topOffset,
      alignEnd: this.alignEnd,
      contentMaxWidth: this.contentMaxWidth,
      contentLeft: this.contentLeft,
      anchorRight: this.anchorRight,
      anchorBottom: this.anchorBottom,
      cornerRadius: this.cornerRadius,
      surfaceVisible: this.surfaceVisible,
      materialRole: this.materialRole,
      bubble: this.bubble,
      maxHeight: this.maxHeight,
      refractionSource: this.sourceId, backgroundSource: GLASS_BACKGROUND_SOURCE, trigger: this.trigger,
      theme: productMenuTheme(this.material, this.mode, this.systemDark, this.foreground, this.dialogOpacity, this.accent, this.getUIContext()),
      captureAllowed: (initialFrame: boolean = false): boolean => sourceCaptureAllowed(this.sourceId, initialFrame), menuRouter: menuSlideSession, slideScope: this.slideScope,
      safeTop: this.safeTop, safeBottom: this.safeBottom, safeLeft: this.safeLeft, safeRight: this.safeRight, keyboardTop: this.keyboardTop,
      bottomGap: 应用尺寸.页面底部间距(this.narrow), pageInset: 应用尺寸.页面内边距_水平,
      enterScale: SurfaceTransition.glassScale(true, false), enterAnimation: SurfaceTransition.glassEnterAnimation(true, false),
      exitTransition: SurfaceTransition.glassExit(true, false, this.alignEnd ? '100%' : '0%', '0%'), flatTransition: SurfaceTransition.dialog(),
      onPanelArea: this.onPanelArea, onPrepared: this.onPrepared, onClose: this.onClose,
      content: (): void => { this.content(); } })
  }
}
