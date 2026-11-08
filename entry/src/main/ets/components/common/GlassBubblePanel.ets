// SPDX-License-Identifier: AGPL-3.0-or-later
import { SharedGlassBubblePanel, GlassFusionRect } from 'jide_foundation';
import { currentGlassSource, retainGlassPanel, releaseGlassPanel, sourceCaptureAllowed, GLASS_BACKGROUND_SOURCE } from '../../utils/GlassBackdrop';
import { takePopupTrigger } from '../../utils/PopupTrigger';
import { productMenuTheme } from '../../utils/MenuTheme';
import { SurfaceTransition } from '../../utils/SurfaceTransition';
import { APP_FOREGROUND_KEY } from '../../model/AppLifecycleState';
import { DIALOG_OPACITY_KEY, MaterialOpacity } from '../../model/SurfaceMaterial';

import { ActionMenuPointerSide } from './ActionMenuLayout';
import { 应用尺寸 } from '../../utils/应用尺寸';

/** 产品只连接真实采样源、偏好及生命周期；完整呈现统一由公共基础拥有。 */
@Component
export struct GlassBubblePanel {
  @Prop source: string = '';
  @Prop showContourStroke: boolean = true;
  @Prop panelWidth: number = 应用尺寸.compactMenuWidth;
  @Prop pointerCenter: number = 66;
  @Prop pointerSide: ActionMenuPointerSide = ActionMenuPointerSide.Right;
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
    this.trigger = takePopupTrigger();
    if (this.sourceId !== '') { retainGlassPanel(this.sourceId); this.retained = true; }
  }
  aboutToDisappear(): void {
    if (this.retained) { releaseGlassPanel(this.sourceId); this.retained = false; }
  }
  build() {
    SharedGlassBubblePanel({ source: this.sourceId, backgroundSource: GLASS_BACKGROUND_SOURCE, trigger: this.trigger,
      showContourStroke: this.showContourStroke, panelWidth: this.panelWidth, pointerCenter: this.pointerCenter, pointerSide: this.pointerSide,
      theme: productMenuTheme(this.material, this.mode, this.systemDark, this.foreground,
        this.dialogOpacity, this.accent, this.getUIContext()),
      captureAllowed: (initialFrame: boolean = false): boolean => sourceCaptureAllowed(this.sourceId, initialFrame),
      enterScale: SurfaceTransition.glassScale(true, false), enterAnimation: SurfaceTransition.glassEnterAnimation(true, false),
      exitTransitionFor: (x: string, y: string): TransitionEffect => SurfaceTransition.glassExit(true, false, x, y), flatTransition: SurfaceTransition.dialog(),
      onPrepared: this.onPrepared, content: (): void => { this.content(); } })
  }
}
