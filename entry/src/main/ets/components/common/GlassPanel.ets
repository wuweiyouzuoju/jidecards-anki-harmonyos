import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { takePopupTrigger } from '../../utils/PopupTrigger';
import { prefersReducedMotion } from '../../utils/ReducedMotion';
import { SharedGlassFusion, GlassFusionGeometry, GlassFusionRect } from 'jide_foundation';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { hilog } from '@kit.PerformanceAnalysisKit';
import { PathShape } from '@kit.ArkUI';
import { GlassBackdrop, GlassRegion, currentGlassSource, supportsGlassBackdrop, retainGlassPanel, releaseGlassPanel, sourceCaptureAllowed, GLASS_BACKGROUND_SOURCE } from '../../utils/GlassBackdrop';
import { APP_FOREGROUND_KEY } from '../../model/AppLifecycleState';
import { SurfaceTransition } from '../../utils/SurfaceTransition';
import { PopupSurface } from './PopupSurface';

/** 准备、玻璃和原生文字共用一个展开容器；等待真实纹理就绪，不按耗时切换材质。 */
@Component
export struct GlassPanel {
  @Prop source: string = '';
  /** 居中选择框保留标准布局与动效，只替换玻璃材质。 */
  @Prop buttonFusion: boolean = true;
  @Prop fusionAnchor: GlassFusionRect | undefined = undefined;
  @Prop materialOverride: string = '';
  @Prop opaque: boolean = false;
  @Prop panelWidth: Length | undefined = undefined;
  /** 有界侧面板可显式填满宿主高度；普通弹窗继续按正文固有尺寸。 */
  @Prop panelHeight: Length | undefined = undefined;
  @Prop maximumWidth: number | undefined = undefined;
  @Prop maximumHeight: Length | undefined = undefined;
  @Prop menuMotion: boolean = false;
  @Prop drawerMotion: boolean = false;
  /** 外部共享融合层拥有形态过渡时，不再叠第二次缩放。 */
  @Prop externalEntrance: boolean = false;
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
  @State private panelOffset: number = 0;
  @State private origin: GlassFusionRect | undefined = undefined;
  @State private fusionFailed: boolean = false;
  private ownsFusion(): boolean {
    return this.usesGlass() && (this.origin !== undefined || this.role === 'menu' || !this.buttonFusion) && !this.externalEntrance && !this.drawerMotion &&
      this.contourPath === '' && !this.fusionFailed;
  }
  private fusionGeometry(): GlassFusionGeometry {
    return { source: this.origin ?? { x: this.region.left, y: this.region.top, width: this.region.width, height: this.region.height, radius: this.radius },
      target: { x: this.region.left, y: this.region.top, width: this.region.width, height: this.region.height, radius: this.radius } };
  }
  private fusionRegion(): GlassRegion {
    if (this.origin === undefined) return this.region;
    const a: GlassFusionRect = this.fusionGeometry().source;
    const b: GlassRegion = this.region;
    const pad: number = 10;
    const left: number = Math.min(a.x, b.left) - pad, top: number = Math.min(a.y, b.top) - pad;
    return { left, top, width: Math.max(a.x + a.width, b.left + b.width) + pad - left,
      height: Math.max(a.y + a.height, b.top + b.height) + pad - top };
  }
  private fusionCompleted(reason: string): void {
    if (!this.mounted) return;
    if (reason === 'finished' || reason === 'reduced_motion') this.finish();
    else this.fusionFailed = true;
  }
  private retained: boolean = false;
  private prepared: boolean = false;
  private mounted: boolean = false;
  private instanceId: number = -1;
  private preparationStarted: number = 0;
  onPrepared: () => void = (): void => {};
  @BuilderParam content: () => void = this.empty;
  @Builder
  private empty(): void {}
  private usesGlass(): boolean { return !this.opaque && this.surfaceVisible && this.sourceId !== '' && (this.materialOverride || this.material) === 'glass' && supportsGlassBackdrop(); }
  aboutToAppear(): void {
    this.instanceId = this.getUniqueId();
    this.mounted = true; this.preparationStarted = Date.now();
    if (!this.externalEntrance) {
      const trigger: GlassFusionRect | undefined = takePopupTrigger();
      this.origin = this.buttonFusion ? this.fusionAnchor ?? trigger : undefined;
    }
    this.sourceId = this.source || currentGlassSource(this.getUIContext());
    hilog.info(0x4342, 'GlassPanel', 'Open instance=%{public}d source=%{public}s material=%{public}s dark=%{public}s foreground=%{public}s', this.instanceId, this.sourceId, this.materialOverride || this.material, String(this.mode === 'dark' || (this.mode !== 'light' && this.systemDark)), String(this.foreground));
    if (this.surfaceVisible && !this.opaque) {
      retainGlassPanel(this.sourceId, this.materialOverride === 'glass');this.retained=true;
    }
    if (this.usesGlass()) {
      this.panelScale = this.externalEntrance || (this.ownsFusion() && this.origin !== undefined) ? 1 : SurfaceTransition.glassScale(this.menuMotion || this.role === 'menu', this.drawerMotion);
      this.panelOffset = SurfaceTransition.glassOffset(this.drawerMotion);
    } else { this.prepared = true; this.panelOpacity = 1; this.onPrepared(); }
  }
  aboutToDisappear(): void { hilog.info(0x4342, 'GlassPanel', 'Close instance=%{public}d source=%{public}s', this.instanceId, this.sourceId); this.mounted = false; if (this.retained) {releaseGlassPanel(this.sourceId, this.materialOverride === 'glass');this.retained=false;} }
  private finish(): void {
    if (!this.mounted || this.prepared) return;
    this.prepared = true; this.onPrepared();
    hilog.info(0x4342, 'GlassPanel', 'Prepared instance=%{public}d role=%{public}s elapsed=%{public}dms', this.instanceId, this.role, Date.now() - this.preparationStarted);
    if (this.externalEntrance || (this.ownsFusion() && this.origin !== undefined)) { this.panelOpacity = 1; return; }
    this.getUIContext().animateTo(SurfaceTransition.glassEnterAnimation(this.menuMotion || this.role === 'menu', this.drawerMotion), (): void => {
      this.panelOpacity = 1; this.panelScale = 1; this.panelOffset = 0;
    });
  }
  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      if (this.usesGlass() && this.foreground && this.surfaceVisible && this.geometryReady && this.region.width > 0 && this.region.height > 0) {
        // 绝对纹理不能参与固有尺寸计算，否则边框会形成逐次撑大的反馈。
        Stack({ alignContent: Alignment.TopStart }) {
        if (this.ownsFusion()) {
          // 位移由原生 Stack 持有，避免 NodeContainer 的渲染帧覆盖组件 position。
          Stack({ alignContent: Alignment.TopStart }) {
          SharedGlassFusion({ source: this.sourceId, backgroundSource: GLASS_BACKGROUND_SOURCE,
            region: this.fusionRegion(), geometry: this.fusionGeometry(),
            contourStrokeWidth: (this.mode === 'dark' || (this.mode !== 'light' && this.systemDark)) ? SurfaceBorder.glassOutlineWidth(true) : 0,
            contourStrokeColor: SurfaceBorder.glassOutlineColor(true),
            dark: this.mode === 'dark' || (this.mode !== 'light' && this.systemDark),
            reducedMotion: prefersReducedMotion(this.getUIContext()), active: this.foreground, animateEntrance: this.origin !== undefined,
            durationMs: SurfaceTransition.popupEnterMs, captureAllowed: (): boolean => sourceCaptureAllowed(this.sourceId),
            onComplete: (reason: string): void => { this.fusionCompleted(reason); } })
          }.width(this.fusionRegion().width).height(this.fusionRegion().height)
              .position({ x: this.fusionRegion().left - this.region.left, y: this.fusionRegion().top - this.region.top })
        } else {
          GlassBackdrop({ source: this.sourceId, materialOverride: this.materialOverride, region: this.region,
            radius: this.contourPath === '' ? this.radius : 0, contourPath: this.contourPath, role: this.role,
            onReady: (): void => { this.finish(); } }).width(this.region.width).height(this.region.height)
        }
        }.width(0).height(0).position({ x: 0, y: 0 }).hitTestBehavior(HitTestMode.None)
      }
      Column() { this.content() }.opacity(this.ownsFusion() && this.origin !== undefined ? this.panelOpacity : 1).width(LayoutPolicy.wrapContent).height(this.panelHeight === undefined ? LayoutPolicy.wrapContent : '100%')
    }
    .width(this.panelWidth ?? LayoutPolicy.wrapContent).height(this.panelHeight ?? LayoutPolicy.wrapContent)
    .constraintSize({ maxWidth: this.maximumWidth, maxHeight: this.maximumHeight })
    .onAreaChange((_old: Area, area: Area): void => {
      this.region = { left: Number(area.globalPosition.x), top: Number(area.globalPosition.y),
        width: Number(area.width), height: Number(area.height) };
    })
    .attributeModifier(new PopupSurface(this.materialOverride || this.material, this.mode === 'dark' ||
      (this.mode !== 'light' && this.systemDark), this.radius, this.role, this.surfaceVisible && !this.ownsFusion(), this.glassAccent, this.opaque))
    .borderRadius(this.radius).clip(this.surfaceVisible && !this.ownsFusion())
    .attributeModifier(new GlassOutline(this.contourPath))
    .onClick((event: ClickEvent): void => { })
    .hitTestBehavior(this.prepared ? HitTestMode.Default : HitTestMode.None)
    .accessibilityLevel(this.prepared ? 'auto' : 'no-hide-descendants')
    .opacity(this.usesGlass() && (!this.ownsFusion() || this.origin === undefined) ? this.panelOpacity : 1)
    .scale({ x: this.usesGlass() ? this.panelScale : 1, y: this.usesGlass() ? this.panelScale : 1, centerX: this.centerX, centerY: this.centerY })
    .translate({ x: this.usesGlass() ? this.panelOffset : 0 })
    .transition(!this.surfaceVisible ? TransitionEffect.IDENTITY : this.usesGlass() ? TransitionEffect.asymmetric(TransitionEffect.IDENTITY,
      SurfaceTransition.glassExit(this.menuMotion || this.role === 'menu', this.drawerMotion, this.centerX, this.centerY)) : SurfaceTransition.dialog())
  }
}

class GlassOutline implements AttributeModifier<CommonAttribute> {
  private path: string;
  constructor(path: string) { this.path = path; }
  applyNormalAttribute(instance: CommonAttribute): void {
    if (this.path !== '') instance.border({ width: 0 }).clipShape(new PathShape({ commands: this.path }));
  }
}
