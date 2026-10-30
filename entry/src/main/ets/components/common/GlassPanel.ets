// SPDX-License-Identifier: AGPL-3.0-or-later
import { hilog } from '@kit.PerformanceAnalysisKit';
import { PathShape } from '@kit.ArkUI';
import { GlassBackdrop, GlassRegion, currentGlassSource, supportsGlassBackdrop, retainGlassPanel, releaseGlassPanel } from '../../utils/GlassBackdrop';
import { APP_FOREGROUND_KEY } from '../../model/AppLifecycleState';
import { currentMotionProfile, materialPopupAnimation } from '../../utils/AppMotion';
import { SurfaceTransition } from '../../utils/SurfaceTransition';
import { PopupSurface } from './PopupSurface';

/** 准备、玻璃和原生文字共用一个展开容器；等待真实纹理就绪，不按耗时切换材质。 */
@Component
export struct GlassPanel {
  @Prop source: string = '';
  @Prop materialOverride: string = '';
  @Prop opaque: boolean = false;
  @Prop panelWidth: Length | undefined = undefined;
  /** 有界侧面板可显式填满宿主高度；普通弹窗继续按正文固有尺寸。 */
  @Prop panelHeight: Length | undefined = undefined;
  @Prop maximumWidth: number | undefined = undefined;
  @Prop maximumHeight: Length | undefined = undefined;
  @Prop menuMotion: boolean = false;
  @Prop centerX: string = '50%';
  @Prop centerY: string = '50%';
  @Prop radius: number = 16;
  @Prop contourPath: string = '';
  @Prop role: string = 'dialog';
  @Prop surfaceVisible: boolean = true;
  @Prop geometryReady: boolean = true;
  @StorageProp('theme_color_action_primary') private glassAccent: string = '';
  @StorageProp('surface_material') private material: string = 'flat';
  @StorageProp('themeMode') private mode: string = 'system';
  @StorageProp('systemDarkMode') private systemDark: boolean = false;
  @StorageProp(APP_FOREGROUND_KEY) private foreground: boolean = false;
  @State private sourceId: string = '';
  @State private region: GlassRegion = { left: 0, top: 0, width: 0, height: 0 };
  @State private panelOpacity: number = 0.01;
  @State private panelScale: number = 1;
  private prepared: boolean = false;
  private mounted: boolean = false;
  private preparationStarted: number = 0;
  onPrepared: () => void = (): void => {};
  @BuilderParam content: () => void = this.empty;
  @Builder
  private empty(): void {}
  private usesGlass(): boolean { return !this.opaque && this.surfaceVisible && this.sourceId !== '' && (this.materialOverride || this.material) === 'glass' && supportsGlassBackdrop(); }
  aboutToAppear(): void {
    this.mounted = true; this.preparationStarted = Date.now();
    this.sourceId = this.source || currentGlassSource(this.getUIContext());
    hilog.info(0x4342, 'GlassPanel', 'Open source=%{public}s material=%{public}s dark=%{public}s foreground=%{public}s', this.sourceId, this.materialOverride || this.material, String(this.mode === 'dark' || (this.mode !== 'light' && this.systemDark)), String(this.foreground));
    if (this.surfaceVisible && !this.opaque) retainGlassPanel(this.sourceId, this.materialOverride === 'glass');
    if (this.usesGlass()) {
      this.panelScale = this.menuMotion || this.role === 'menu' ? currentMotionProfile().menuScale : currentMotionProfile().dialogScale;
    } else { this.prepared = true; this.panelOpacity = 1; this.onPrepared(); }
  }
  aboutToDisappear(): void { this.mounted = false; if (this.surfaceVisible && !this.opaque) releaseGlassPanel(this.sourceId, this.materialOverride === 'glass'); }
  private finish(): void {
    if (!this.mounted || this.prepared) return;
    this.prepared = true; this.onPrepared();
    hilog.info(0x4342, 'GlassPanel', 'Prepared role=%{public}s elapsed=%{public}dms', this.role, Date.now() - this.preparationStarted);
    this.getUIContext().animateTo(this.menuMotion || this.role === 'menu' ?
      materialPopupAnimation(currentMotionProfile().menuEnterMs) : SurfaceTransition.dialogEnterAnimation(), (): void => {
      this.panelOpacity = 1; this.panelScale = 1;
    });
  }
  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      if (this.usesGlass() && this.foreground && this.surfaceVisible && this.geometryReady && this.region.width > 0 && this.region.height > 0) {
        // 绝对纹理不能参与固有尺寸计算，否则边框会形成逐次撑大的反馈。
        Stack({ alignContent: Alignment.TopStart }) {
        GlassBackdrop({ source: this.sourceId, materialOverride: this.materialOverride, region: this.region, radius: this.contourPath === '' ? this.radius : 0, contourPath: this.contourPath, role: this.role,
          onReady: (): void => { this.finish(); } })
          .width(this.region.width).height(this.region.height)
        }.width(0).height(0).position({ x: 0, y: 0 }).hitTestBehavior(HitTestMode.None)
      }
      Column() { this.content() }.width(LayoutPolicy.wrapContent).height(this.panelHeight === undefined ? LayoutPolicy.wrapContent : '100%')
    }
    .width(this.panelWidth ?? LayoutPolicy.wrapContent).height(this.panelHeight ?? LayoutPolicy.wrapContent)
    .constraintSize({ maxWidth: this.maximumWidth, maxHeight: this.maximumHeight })
    .onAreaChange((_old: Area, area: Area): void => {
      this.region = { left: Number(area.globalPosition.x), top: Number(area.globalPosition.y),
        width: Number(area.width), height: Number(area.height) };
    })
    .attributeModifier(new PopupSurface(this.materialOverride || this.material, this.mode === 'dark' ||
      (this.mode !== 'light' && this.systemDark), this.radius, this.role, this.surfaceVisible, this.glassAccent, this.opaque))
    .borderRadius(this.radius).clip(this.surfaceVisible)
    .attributeModifier(new GlassOutline(this.contourPath))
    .hitTestBehavior(this.prepared ? HitTestMode.Default : HitTestMode.None)
    .accessibilityLevel(this.prepared ? 'auto' : 'no-hide-descendants')
    .opacity(this.usesGlass() ? this.panelOpacity : 1)
    .scale({ x: this.usesGlass() ? this.panelScale : 1, y: this.usesGlass() ? this.panelScale : 1, centerX: this.centerX, centerY: this.centerY })
    .transition(!this.surfaceVisible ? TransitionEffect.IDENTITY : this.usesGlass() ? TransitionEffect.asymmetric(TransitionEffect.IDENTITY, SurfaceTransition.backdrop()) : SurfaceTransition.dialog())
  }
}

class GlassOutline implements AttributeModifier<CommonAttribute> {
  private path: string;
  constructor(path: string) { this.path = path; }
  applyNormalAttribute(instance: CommonAttribute): void {
    if (this.path !== '') instance.border({ width: 0 }).clipShape(new PathShape({ commands: this.path }));
  }
}
