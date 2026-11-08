// SPDX-License-Identifier: AGPL-3.0-or-later
import { hilog } from '@kit.PerformanceAnalysisKit';
import { PathShape } from '@kit.ArkUI';
import { SharedMenuTheme, sharedMenuTheme } from './MenuTypes';
import { SharedGlassFusion, SharedGlassBackdrop, SharedGlassRegion } from './GlassBackdrop';
import { GlassFusionRect, GlassFusionGeometry, GLASS_POPUP_ENTER_MS } from '../../core/GlassFusion';
import { dialogPanelFill } from '../../core/PopupAppearance';
import { SharedPopupSurface } from './Surface';

/** 准备、玻璃和原生文字共用一个展开容器；等待真实纹理就绪，不按耗时切换材质。 */
@Component
export struct SharedGlassPanel {
  @Prop theme: SharedMenuTheme = sharedMenuTheme();
  @Prop backgroundSource: string = '';
  @Prop trigger: GlassFusionRect | undefined = undefined;
  @Prop enterScale: number = 1;
  @Prop enterOffset: number = 0;
  @Prop enterAnimation: AnimateParam = { duration: GLASS_POPUP_ENTER_MS, curve: Curve.EaseOut };
  @Prop exitTransition: TransitionEffect = TransitionEffect.IDENTITY;
  @Prop flatTransition: TransitionEffect = TransitionEffect.IDENTITY;
  @Prop immediateContent: boolean = false;
  captureAllowed: (initialFrame?: boolean) => boolean = (): boolean => false;

  @Prop source: string = '';
  /** 居中选择框保留标准布局与动效，只替换玻璃材质。 */
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
  @Prop centerX: string = '50%';
  @Prop centerY: string = '50%';
  @Prop radius: number = 16;
  @Prop contourPath: string = '';
  @Prop role: string = 'dialog';
  @Prop surfaceVisible: boolean = true;
  @Prop geometryReady: boolean = true;
  @Prop fusionContentRevealMs: number = 110;
  @Prop animateExit: boolean = true;
  @State private sourceId: string = '';
  @State private region: SharedGlassRegion = { left: 0, top: 0, width: 0, height: 0 };
  @State private panelOpacity: number = 0.01;
  @State private panelScale: number = 1;
  @State private panelOffset: number = 0;
  @State private origin: GlassFusionRect | undefined = undefined;
  @State private fusionHost: SharedGlassRegion | undefined = undefined;
  @State private fusionFailed: boolean = false;
  private ownsFusion(): boolean {
    return this.usesGlass() && this.origin !== undefined && !this.drawerMotion &&
      this.contourPath === '' && !this.fusionFailed;
  }
  private fusionGeometry(): GlassFusionGeometry {
    return { source: this.origin ?? { x: this.region.left, y: this.region.top, width: this.region.width, height: this.region.height, radius: this.radius },
      target: { x: this.region.left, y: this.region.top, width: this.region.width, height: this.region.height, radius: this.radius } };
  }
  private fusionRegion(): SharedGlassRegion {
    if (this.origin === undefined) return this.region;
    const a: GlassFusionRect = this.fusionGeometry().source;
    const b: SharedGlassRegion = this.region;
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
  private prepared: boolean = false;
  private mounted: boolean = false;
  private instanceId: number = -1;
  private preparationStarted: number = 0;
  onPrepared: () => void = (): void => {};
  @BuilderParam content: () => void = this.empty;
  @Builder
  private empty(): void {}
  private usesGlass(): boolean { return !this.opaque && this.surfaceVisible && this.sourceId !== '' && (this.materialOverride || this.theme.material) === 'glass' && this.theme.supported; }
  aboutToAppear(): void {
    this.instanceId = this.getUniqueId();
    this.mounted = true; this.preparationStarted = Date.now();
    if (this.surfaceVisible) {
      const trigger: GlassFusionRect | undefined = this.trigger;
      if (trigger !== undefined && !this.theme.reducedMotion) this.origin = trigger;
    }
    this.sourceId = this.source;
    hilog.info(0x4342, 'GlassPanel', 'Open instance=%{public}d source=%{public}s material=%{public}s dark=%{public}s foreground=%{public}s', this.instanceId, this.sourceId, this.materialOverride || this.theme.material, String(this.theme.dark), String(this.theme.foreground));
    if (this.usesGlass()) {
      this.panelScale = this.ownsFusion() ? 1 : this.enterScale;
      this.panelOffset = this.enterOffset;
    } else { this.prepared = true; this.panelOpacity = 1; this.onPrepared(); }
  }

  private finish(): void {
    if (!this.mounted || this.prepared) return;
    this.prepared = true; this.onPrepared();
    hilog.info(0x4342, 'GlassPanel', 'Prepared instance=%{public}d role=%{public}s elapsed=%{public}dms', this.instanceId, this.role, Date.now() - this.preparationStarted);
    if (this.ownsFusion()) {
      this.getUIContext().animateTo({ duration: this.fusionContentRevealMs, curve: Curve.EaseOut },
        (): void => { this.panelOpacity = 1; });
      return;
    }
    this.getUIContext().animateTo(this.enterAnimation, (): void => {
      this.panelOpacity = 1; this.panelScale = 1; this.panelOffset = 0;
    });
  }
  aboutToDisappear(): void { this.mounted = false; }
  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      if (this.usesGlass() && this.theme.foreground && this.surfaceVisible && this.geometryReady && this.region.width > 0 && this.region.height > 0) {
        // 绝对纹理不能参与固有尺寸计算，否则边框会形成逐次撑大的反馈。
        Stack({ alignContent: Alignment.TopStart }) {
        if (this.ownsFusion()) {
          // 位移由原生 Stack 持有，避免 NodeContainer 的渲染帧覆盖组件 position。
          Stack({ alignContent: Alignment.TopStart }) {
          if (this.fusionHost !== undefined) {
          SharedGlassFusion({ source: this.sourceId, backgroundSource: this.backgroundSource,
            region: this.fusionRegion(), geometry: this.fusionGeometry(),
            contourStrokeWidth: 0, replayTrigger: false,
            contourStrokeColor: '#22FFFFFF',
            dark: this.theme.dark,
            reducedMotion: this.theme.reducedMotion, active: this.theme.foreground, animateEntrance: this.origin !== undefined,
            durationMs: GLASS_POPUP_ENTER_MS, captureAllowed: (initialFrame: boolean = false): boolean => this.captureAllowed(initialFrame),
            onComplete: (reason: string): void => { this.fusionCompleted(reason); } })
            .translate({ x: this.fusionRegion().left - this.fusionHost.left,
              y: this.fusionRegion().top - this.fusionHost.top })
          }
          }.width(this.fusionRegion().width).height(this.fusionRegion().height)
              .position({ x: this.fusionRegion().left - this.region.left, y: this.fusionRegion().top - this.region.top })
              .onAreaChange((_old: Area, area: Area): void => {
                this.fusionHost = { left: Number(area.globalPosition.x), top: Number(area.globalPosition.y),
                  width: Number(area.width), height: Number(area.height) };
                hilog.info(0x4342, 'GlassPanel', 'Fusion host correction x=%{public}d y=%{public}d',
                  Math.round(this.fusionRegion().left - this.fusionHost.left),
                  Math.round(this.fusionRegion().top - this.fusionHost.top));
              })
        } else {
          SharedGlassBackdrop({ source: this.sourceId, backgroundSource: this.backgroundSource, active: this.theme.foreground, dark: this.theme.dark, captureAllowed: this.captureAllowed, region: this.region,
            radius: this.contourPath === '' ? this.radius : 0, contourPath: this.contourPath, role: this.role,
            onReady: (): void => { this.finish(); } }).width(this.region.width).height(this.region.height)
        }
        }.width(0).height(0).position({ x: 0, y: 0 }).hitTestBehavior(HitTestMode.None)
      }
      if ((this.role === 'dialog' || this.role === 'menu') && this.surfaceVisible && !this.opaque && (this.materialOverride || this.theme.material) === 'glass' &&
        this.prepared && this.theme.panelOpacity > 0) {
        // 填色放在采样纹理上方、正文下方，绝对定位保持面板固有尺寸。
        Column().width(this.region.width).height(this.region.height).position({ x: 0, y: 0 })
          .borderRadius(this.radius)
          .backgroundColor(dialogPanelFill(this.theme.dark,
            this.theme.panelOpacity))
          .attributeModifier(new GlassOutline(this.contourPath))
          .hitTestBehavior(HitTestMode.None).accessibilityLevel('no')
      }
      Column() { this.content() }.opacity(this.immediateContent ? 1 : this.ownsFusion() && this.origin !== undefined ? this.panelOpacity : 1).width(LayoutPolicy.wrapContent).height(this.panelHeight === undefined ? LayoutPolicy.wrapContent : '100%')
    }
    .width(this.panelWidth ?? LayoutPolicy.wrapContent).height(this.panelHeight ?? LayoutPolicy.wrapContent)
    .constraintSize({ maxWidth: this.maximumWidth, maxHeight: this.maximumHeight })
    .onAreaChange((_old: Area, area: Area): void => {
      this.region = { left: Number(area.globalPosition.x), top: Number(area.globalPosition.y),
        width: Number(area.width), height: Number(area.height) };
    })
    .attributeModifier(new SharedPopupSurface(this.materialOverride || this.theme.material, this.theme.dark, this.radius, this.role, this.surfaceVisible && !this.ownsFusion(), this.opaque, this.theme.panelOpacity, this.theme.lineColor))
    .borderRadius(this.radius).clip(this.surfaceVisible && !this.ownsFusion())
    .attributeModifier(new GlassOutline(this.contourPath))
    .onClick((event: ClickEvent): void => { })
    .hitTestBehavior(this.prepared || this.immediateContent ? HitTestMode.Default : HitTestMode.None)
    .accessibilityLevel(this.prepared || this.immediateContent ? 'auto' : 'no-hide-descendants')
    .opacity(this.usesGlass() && !this.immediateContent && (!this.ownsFusion() || this.origin === undefined) ? this.panelOpacity : 1)
    .scale({ x: this.usesGlass() && !this.immediateContent ? this.panelScale : 1, y: this.usesGlass() && !this.immediateContent ? this.panelScale : 1, centerX: this.centerX, centerY: this.centerY })
    .translate({ x: this.usesGlass() && !this.immediateContent ? this.panelOffset : 0 })
    .transition(!this.surfaceVisible || (!this.animateExit && this.usesGlass()) ? TransitionEffect.IDENTITY : this.usesGlass() ? TransitionEffect.asymmetric(TransitionEffect.IDENTITY, this.exitTransition) : this.flatTransition)
  }
}

class GlassOutline implements AttributeModifier<CommonAttribute> {
  private path: string;
  constructor(path: string) { this.path = path; }
  applyNormalAttribute(instance: CommonAttribute): void {
    if (this.path !== '') instance.border({ width: 0 }).clipShape(new PathShape({ commands: this.path }));
  }
}
