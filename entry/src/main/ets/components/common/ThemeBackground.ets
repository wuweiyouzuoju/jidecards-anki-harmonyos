// SPDX-License-Identifier: AGPL-3.0-or-later
import { GLASS_BACKGROUND_SOURCE, currentGlassSource, observeGlassPanelActivity } from '../../utils/GlassBackdrop';
import { invalidateSharedGlassSource, setSharedGlassSourceRetention } from 'jide_foundation';
import { WALLPAPER_KEY, WALLPAPER_OPACITY_KEY, WALLPAPER_LIGHT_KEY, WALLPAPER_DARK_KEY } from '../../model/AppearanceCustomization';
import { ThemeDefinition, themeDefinition, THEME_VISUALS_KEY } from '../../model/ThemeCatalog';
import {
  ThemeBackgroundPose, initialThemeBackgroundPoses, nextThemeBackgroundPoses, sampleThemeBackgroundPoses, DEFAULT_BACKGROUND_CYCLE_MS
} from '../../model/ThemeBackgroundMotion';
import { APP_FOREGROUND_KEY } from '../../model/AppLifecycleState';
import { THEME_MOTION_KEY } from '../../model/ThemeCatalog';
import { 颜色键 } from '../../model/颜色主题';
import { SharedPageBackground, VisualPalette } from 'jide_foundation';
import { SeriesVisual } from '../../utils/SeriesVisual';
import { AppLog } from '../../model/AppLog';

/**
 * 透明彩雾纹理由系统合成平移、缩放和淡化，ArkTS 每轮只提交一次目标。
 * Invariants: 不使用逐帧状态回调、实时渐变或色相滤镜；固定底色不参与运动。
 * 生命周期失效使旧 onFinish 无效，暂停采样只发生一次。
 */
@Component
export struct ThemeBackground {
  @StorageProp('surface_material') @Watch('updateMaterial') private material: string = 'flat';
  @StorageProp(WALLPAPER_KEY) @Watch('updateBackground') private wallpaper: string = '';
  @StorageProp(WALLPAPER_OPACITY_KEY) @Watch('refreshGlassBackground') private wallpaperOpacity: number = 100;
  @StorageProp(WALLPAPER_LIGHT_KEY) @Watch('refreshGlassBackground') private lightMask: number = 0.2;
  @StorageProp(WALLPAPER_DARK_KEY) @Watch('refreshGlassBackground') private darkMask: number = 0.45;
  @Prop @Watch('updatePlayback') transitionActive: boolean = false;
  @StorageProp(THEME_VISUALS_KEY) @Watch('updateBackground') private visual: ThemeDefinition = themeDefinition('aurora');
  @StorageProp(THEME_MOTION_KEY) @Watch('updatePlayback') private motion: boolean = true;
  @StorageProp(APP_FOREGROUND_KEY) @Watch('updatePlayback') private foreground: boolean = false;
  @StorageProp(颜色键.页面底色微染) @Watch('refreshGlassBackground') private baseColor: string = '#e9eef7';
  @StorageProp(颜色键.动作主色) @Watch('refreshGlassBackground') private actionColor: string = '#2F5FD0';
  @StorageProp('themeMode') @Watch('refreshGlassBackground') private themeMode: string = 'system';
  @StorageProp('systemDarkMode') @Watch('refreshGlassBackground') private systemDark: boolean = false;
  @State private poses: ThemeBackgroundPose[] = initialThemeBackgroundPoses();
  private fromPoses: ThemeBackgroundPose[] = initialThemeBackgroundPoses();
  private toPoses: ThemeBackgroundPose[] = initialThemeBackgroundPoses();
  private visible: boolean = false;
  private running: boolean = false;
  private mounted: boolean = false;
  private generation: number = 0;
  private startedAt: number = 0;
  private cycleDuration: number = DEFAULT_BACKGROUND_CYCLE_MS;
  private panelsActive: boolean = false;
  private stopObservingPanels: () => void = (): void => {};

  private mountBackground(): void {
    this.mounted = true;
    this.stopObservingPanels = observeGlassPanelActivity((active: boolean, source: string): void => {
      if (active === this.panelsActive) return;
      const wasRunning: boolean = this.running;
      this.panelsActive = active;
      this.updatePlayback();
      if (active && wasRunning) {
        // 冻结后的真实姿态替换运动中的旧缓存，只采一次，不持续追拍背景。
        this.refreshGlassBackground();
        if (source !== '') invalidateSharedGlassSource(this.getUIContext(), source);
        const page: string = currentGlassSource(this.getUIContext());
        if (page !== '' && page !== source) invalidateSharedGlassSource(this.getUIContext(), page);
      }
    });
    this.updatePlayback();
  }

  private refreshGlassBackground(): void {
    if (this.mounted) invalidateSharedGlassSource(this.getUIContext(), GLASS_BACKGROUND_SOURCE);
  }

  private updateMaterial(): void {
    this.updatePlayback();
    this.refreshGlassBackground();
  }

  private updateBackground(): void {
    this.refreshGlassBackground();
    this.updatePlayback();
  }

  /** 页面导航只暂停播放和采样，保留已完成的根背景纹理。 */
  private updatePlayback(): void {
    if (!this.mounted) return;
    setSharedGlassSourceRetention(this.getUIContext(), GLASS_BACKGROUND_SOURCE, this.material === 'glass',
      this.transitionActive || !this.foreground || !this.visible);
    if (this.material !== 'glass' || this.wallpaper !== '' || this.visual.backgroundTextures.length === 0 || !this.motion || !this.foreground || !this.visible || this.transitionActive || this.panelsActive) {
      this.pauseMotion();
      return;
    }
    if (this.running) return;
    this.running = true;
    this.advanceMotion();
  }

  /** 彩雾由系统独立合成，常驻玻璃沿用缓存，避免每轮结束时同时跳色。 */
  private advanceMotion(): void {
    if (!this.mounted || !this.running) return;
    const generation: number = ++this.generation;
    this.fromPoses = this.poses;
    this.toPoses = nextThemeBackgroundPoses();
    this.startedAt = Date.now();
    this.cycleDuration = this.visual.backgroundCycleMs;
    this.getUIContext().animateTo({
      duration: this.cycleDuration, curve: Curve.EaseInOut,
      // 慢速彩雾降低持续绘制预算；导航转场独立请求高帧率并暂停背景。
      expectedFrameRateRange: { min: 15, max: 30, expected: 30 },
      onFinish: (): void => {
        if (this.mounted && this.running && generation === this.generation) {
          this.advanceMotion();
        }
      }
    }, (): void => { this.poses = this.toPoses; });
  }

  private pauseMotion(): void {
    if (!this.running) return;
    this.running = false;
    this.generation++;
    const frozen: ThemeBackgroundPose[] = sampleThemeBackgroundPoses(this.fromPoses, this.toPoses, (Date.now() - this.startedAt) * DEFAULT_BACKGROUND_CYCLE_MS / this.cycleDuration);
    this.getUIContext().animateTo({ duration: 0 }, (): void => { this.poses = frozen; });
  }

  aboutToDisappear(): void {
    this.stopObservingPanels();
    setSharedGlassSourceRetention(this.getUIContext(), GLASS_BACKGROUND_SOURCE, false, true);
    this.mounted = false;
    this.visible = false;
    this.running = false;
    this.generation++;
  }

  private isFlat(): boolean { return this.material !== 'glass'; }

  private textures(): string[] { return !this.isFlat() && this.wallpaper === '' ? this.visual.backgroundTextures : []; }

  private seriesPalette(): VisualPalette {
    const palette: VisualPalette = SeriesVisual.palette(SeriesVisual.isDark(this.themeMode, this.systemDark), this.actionColor, this.baseColor);
    // 根背景和扁平页面壳使用同一纯色；背景不读取当前页面或页面局部尺寸。
    palette.page = this.baseColor;
    return palette;
  }

  build() {
    Stack() {
      SharedPageBackground({ reduceTransparency: this.isFlat(), isDark: SeriesVisual.isDark(this.themeMode, this.systemDark), palette: this.seriesPalette() })
        .width('100%').height('100%')
      ForEach(this.textures(), (texture: string, index: number) => {
        Image($rawfile(texture))
          .width('130%').height('130%').objectFit(ImageFit.Fill).draggable(false)
          .translate({ x: `${this.poses[index].x * 100}%`, y: `${this.poses[index].y * 100}%` })
          .scale({ x: this.poses[index].scale, y: this.poses[index].scale })
          .opacity(this.poses[index].opacity)
      }, (texture: string): string => texture)
      if (this.wallpaper !== '') {
        Stack() {
          Image('file://' + this.wallpaper).width('100%').height('100%').objectFit(ImageFit.Cover)
            .onComplete((): void => { this.refreshGlassBackground(); })
            .onError((): void => { AppLog.warn('Appearance', '[appearance] Wallpaper unavailable'); })
          Column().width('100%').height('100%')
            .backgroundColor(SeriesVisual.isDark(this.themeMode, this.systemDark) ? '#000000' : '#FFFFFF')
            .opacity(SeriesVisual.isDark(this.themeMode, this.systemDark) ? this.darkMask : this.lightMask)
            .hitTestBehavior(HitTestMode.None)
        }.width('100%').height('100%').opacity(this.wallpaperOpacity / 100)
      }
    }
    .width('100%').height('100%').backgroundColor(this.baseColor).clip(true)
    .hitTestBehavior(HitTestMode.None).accessibilityLevel('no')
    .onAppear((): void => { this.mountBackground(); })
    .onAreaChange((old: Area, area: Area): void => {
      if (old.width !== area.width || old.height !== area.height ||
        old.globalPosition.x !== area.globalPosition.x || old.globalPosition.y !== area.globalPosition.y) {
        this.refreshGlassBackground();
      }
    })
    .onVisibleAreaChange([0, 1], (visible: boolean, ratio: number): void => {
      this.visible = visible && ratio > 0;
      this.updatePlayback();
    })
  }
}
