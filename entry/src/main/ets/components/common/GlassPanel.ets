// SPDX-License-Identifier: AGPL-3.0-or-later
import { SharedGlassPanel, GlassFusionRect } from 'jide_foundation';
import { currentGlassSource, retainGlassPanel, releaseGlassPanel, sourceCaptureAllowed, GLASS_BACKGROUND_SOURCE } from '../../utils/GlassBackdrop';
import { takePopupTrigger } from '../../utils/PopupTrigger';
import { productMenuTheme } from '../../utils/MenuTheme';
import { SurfaceTransition } from '../../utils/SurfaceTransition';
import { APP_FOREGROUND_KEY } from '../../model/AppLifecycleState';
import { DIALOG_OPACITY_KEY, MaterialOpacity } from '../../model/SurfaceMaterial';

/** 产品只连接真实采样源、偏好及生命周期；完整呈现统一由公共基础拥有。 */
@Component
export struct GlassPanel {
  @Prop source: string = '';
  @Prop materialOverride: string = '';
  @Prop opaque: boolean = false;
  @Prop panelWidth: Length | undefined = undefined;
  @Prop panelHeight: Length | undefined = undefined;
  @Prop maximumWidth: number | undefined = undefined;
  @Prop maximumHeight: Length | undefined = undefined;
  @Prop menuMotion: boolean = false;
  @Prop drawerMotion: boolean = false;
  @Prop centerX: string = '50%';
  @Prop centerY: string = '50%';
  @Prop radius: number = 16;
  @Prop contourPath: string = '';
  @Prop role: string = 'dialog';
  @Prop surfaceVisible: boolean = true;
  @Prop geometryReady: boolean = true;
  @Prop fusionContentRevealMs: number = 110;
  @Prop animateExit: boolean = true;
  @StorageProp('surface_material') private material: string = 'flat';
  @StorageProp('themeMode') private mode: string = 'system';
  @StorageProp('systemDarkMode') private systemDark: boolean = false;
  @StorageProp(APP_FOREGROUND_KEY) private foreground: boolean = false;
  @StorageProp(DIALOG_OPACITY_KEY) private dialogOpacity: MaterialOpacity | undefined = undefined;
  @StorageProp('theme_color_action_primary') private accent: string = '#2F5FD0';
  @State private sourceId: string = '';
  private trigger: GlassFusionRect | undefined = undefined;
  private retained: boolean = false;
  onPrepared: () => void = (): void => {};
  @BuilderParam content: () => void = this.empty;
  @Builder
  private empty(): void {}
  aboutToAppear(): void {
    this.sourceId = this.source || currentGlassSource(this.getUIContext());
    if (this.surfaceVisible) this.trigger = takePopupTrigger();
    if (this.surfaceVisible && !this.opaque) { retainGlassPanel(this.sourceId, this.materialOverride === 'glass'); this.retained = true; }
  }
  aboutToDisappear(): void {
    if (this.retained) { releaseGlassPanel(this.sourceId, this.materialOverride === 'glass'); this.retained = false; }
  }
  build() {
    SharedGlassPanel({
      materialOverride: this.materialOverride,
      opaque: this.opaque,
      panelWidth: this.panelWidth,
      panelHeight: this.panelHeight,
      maximumWidth: this.maximumWidth,
      maximumHeight: this.maximumHeight,
      menuMotion: this.menuMotion,
      drawerMotion: this.drawerMotion,
      centerX: this.centerX,
      centerY: this.centerY,
      radius: this.radius,
      contourPath: this.contourPath,
      role: this.role,
      surfaceVisible: this.surfaceVisible,
      geometryReady: this.geometryReady,
      fusionContentRevealMs: this.fusionContentRevealMs,
      animateExit: this.animateExit,
      source: this.sourceId, backgroundSource: GLASS_BACKGROUND_SOURCE, trigger: this.trigger,
      theme: productMenuTheme(this.materialOverride || this.material, this.mode, this.systemDark, this.foreground,
        this.dialogOpacity, this.accent, this.getUIContext()),
      captureAllowed: (initialFrame: boolean = false): boolean => sourceCaptureAllowed(this.sourceId, initialFrame),
      enterScale: SurfaceTransition.glassScale(this.menuMotion || this.role === 'menu', this.drawerMotion),
      enterOffset: SurfaceTransition.glassOffset(this.drawerMotion),
      enterAnimation: SurfaceTransition.glassEnterAnimation(this.menuMotion || this.role === 'menu', this.drawerMotion),
      exitTransition: SurfaceTransition.glassExit(this.menuMotion || this.role === 'menu', this.drawerMotion, this.centerX, this.centerY),
      flatTransition: SurfaceTransition.dialog(),
      onPrepared: this.onPrepared, content: (): void => { this.content(); } })
  }
}
