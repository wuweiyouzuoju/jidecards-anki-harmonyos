// SPDX-License-Identifier: AGPL-3.0-or-later
import { hilog } from '@kit.PerformanceAnalysisKit';
import { PathShape } from '@kit.ArkUI';
import { SharedMenuTheme, sharedMenuTheme, sharedGlassShadow } from './MenuTypes';
import { SharedGlassFusion, SharedGlassBackdrop, SharedGlassRegion } from './GlassBackdrop';
import { GlassFusionRect, GlassFusionGeometry, GLASS_MENU_ENTER_MS, GLASS_POPUP_ENTER_MS } from '../../core/GlassFusion';
import { dialogPanelFill } from '../../core/PopupAppearance';
import { SharedPopupSurface } from './Surface';

/** 准备、玻璃和原生文字共用一个展开容器；优先等待真实纹理，准备失败时恢复可操作的静态表面。 */
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
  @Prop shadowVisible: boolean = true;
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
    // 有真实点击位置的标准玻璃弹窗统一使用同一形变，宽屏尺寸不改变入场。
    return this.usesGlass() && this.origin !== undefined && !this.drawerMotion &&
      this.contourPath === '' && !this.fusionFailed;
  }
  private showContentImmediately(): boolean {
    // 非融合菜单的选项跟随宿主布局，纹理的绘制回调只控制玻璃效果。
    return this.immediateContent || (this.role === 'menu' && !this.ownsFusion());
  }
  private glassTransition(): TransitionEffect {
    // 菜单内容可立即操作；纹理就绪回调无需负责启动其入场。
    const enter: TransitionEffect = this.showContentImmediately() && !this.ownsFusion() && !this.theme.reducedMotion ?
      TransitionEffect.opacity(0).combine(TransitionEffect.scale({
        x: this.enterScale, y: this.enterScale, centerX: this.centerX, centerY: this.centerY
      })).animation(this.enterAnimation) : TransitionEffect.IDENTITY;
    return TransitionEffect.asymmetric(enter, this.animateExit ? this.exitTransition : TransitionEffect.IDENTITY);
  }
  private fusionGeometry(): GlassFusionGeometry {
    return { source: this.origin ?? { x: this.region.left, y: this.region.top, width: this.region.width, height: this.region.height, radius: this.effectiveRadius() },
      target: { x: this.region.left, y: this.region.top, width: this.region.width, height: this.region.height, radius: this.effectiveRadius() } };
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
    else this.recoverPreparation('fusion_' + reason);
  }
  @State private prepared: boolean = false;
  private mounted: boolean = false;
  private instanceId: number = -1;
  private preparationStarted: number = 0;
  private recoverPreparation(reason: string): void {
    if (!this.mounted || this.prepared) return;
    this.fusionFailed = true;
    hilog.warn(0x4342, 'GlassPanel', 'Fusion deferred instance=%{public}d source=%{public}s role=%{public}s reason=%{public}s elapsed=%{public}dms',
      this.instanceId, this.sourceId, this.role, reason, Date.now() - this.preparationStarted);
  }
  onPrepared: () => void = (): void => {};
  @BuilderParam content: () => void = this.empty;
  @Builder
  private empty(): void {}
  private effectiveRadius(): number { return this.contourPath !== '' ? 0 : this.theme.cornerRadius ?? this.radius; }
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
      this.panelScale = this.enterScale;
      this.panelOffset = this.enterOffset;
    } else { this.prepared = true; this.panelOpacity = 1; this.onPrepared(); }
  }

  private finish(): void {
    if (!this.mounted || this.prepared) return;
    this.prepared = true; this.onPrepared();
    hilog.info(0x4342, 'GlassPanel', 'Prepared instance=%{public}d role=%{public}s elapsed=%{public}dms', this.instanceId, this.role, Date.now() - this.preparationStarted);
    if (this.ownsFusion()) {
      if (this.panelOpacity === 1 || this.role === 'menu') { this.panelOpacity = 1; return; }
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
            contourStrokeWidth: this.theme.outlineColor === undefined ? 0 : this.theme.outlineWidth ?? 1, replayTrigger: false,
            contourStrokeColor: this.theme.outlineColor === undefined ? '#22FFFFFF' : '#FF' + this.theme.outlineColor.slice(1),
            dark: this.theme.dark, tint: this.role === 'dialog' ? dialogPanelFill(this.theme.dark, this.theme.panelOpacity) : '',
            reducedMotion: this.theme.reducedMotion, active: this.theme.foreground, animateEntrance: this.origin !== undefined,
            durationMs: this.role === 'menu' ? GLASS_MENU_ENTER_MS : GLASS_POPUP_ENTER_MS, captureAllowed: (initialFrame: boolean = false): boolean => this.captureAllowed(initialFrame),
            onProgress: (progress: number): void => {
              // 正文随展开轮廓淡入。
              const opacity: number = Math.max(0, Math.min(1, (progress - 0.87) / 0.09));
              if (this.panelOpacity !== opacity) this.panelOpacity = opacity;
            },
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
            tint: this.role === 'dialog' ? dialogPanelFill(this.theme.dark, this.theme.panelOpacity) : '',
            radius: this.contourPath === '' ? this.effectiveRadius() : 0, contourPath: this.contourPath, role: this.role,
            onReady: (): void => { this.finish(); } }).width(this.region.width).height(this.region.height)
        }
        }.width(0).height(0).position({ x: 0, y: 0 }).hitTestBehavior(HitTestMode.None)
      }
      Stack({ alignContent: Alignment.TopStart }) {
      if (this.contourPath !== '' && !this.ownsFusion() && this.surfaceVisible &&
        this.theme.outlineColor !== undefined) {
        Path().commands(this.contourPath).fill(Color.Transparent)
          .stroke(this.theme.outlineColor ?? this.theme.lineColor).strokeWidth(this.theme.outlineWidth ?? 1)
          .width(this.region.width).height(this.region.height).position({ x: 0, y: 0 })
          .hitTestBehavior(HitTestMode.None).accessibilityLevel('no')
      }
      }.width(0).height(0).position({ x: 0, y: 0 }).hitTestBehavior(HitTestMode.None)
      Column() { this.content() }.opacity(this.showContentImmediately() ? 1 : this.ownsFusion() && this.origin !== undefined ? this.panelOpacity : 1).width(LayoutPolicy.wrapContent).height(this.panelHeight === undefined ? LayoutPolicy.wrapContent : '100%')
    }
    .width(this.panelWidth ?? LayoutPolicy.wrapContent).height(this.panelHeight ?? LayoutPolicy.wrapContent)
    .constraintSize({ maxWidth: this.maximumWidth, maxHeight: this.maximumHeight })
    .onAreaChange((_old: Area, area: Area): void => {
      this.region = { left: Number(area.globalPosition.x), top: Number(area.globalPosition.y),
        width: Number(area.width), height: Number(area.height) };
    })
    .attributeModifier(new SharedPopupSurface(this.materialOverride || this.theme.material, this.theme.dark, this.effectiveRadius(), this.role, this.surfaceVisible && !this.ownsFusion(),
      this.opaque || (this.showContentImmediately() && !this.prepared), this.theme.panelOpacity, this.theme.lineColor, this.role === 'menu' && this.theme.outlineColor === undefined ? undefined : this.theme.outlineWidth, this.theme.outlineColor))
    .shadow(sharedGlassShadow(this.theme.dark, this.shadowVisible && this.usesGlass() && this.prepared))
    .borderRadius(this.effectiveRadius()).clip(this.surfaceVisible && !this.ownsFusion())
    .attributeModifier(new GlassOutline(this.contourPath))
    .onClick((event: ClickEvent): void => { })
    .hitTestBehavior(this.prepared || this.showContentImmediately() ? HitTestMode.Default : HitTestMode.None)
    .accessibilityLevel(this.prepared || this.showContentImmediately() ? 'auto' : 'no-hide-descendants')
    .opacity(this.usesGlass() && !this.showContentImmediately() && (!this.ownsFusion() || this.origin === undefined) ? this.panelOpacity : 1)
    .scale({ x: this.usesGlass() && !this.ownsFusion() && !this.showContentImmediately() && !this.theme.reducedMotion ? this.panelScale : 1, y: this.usesGlass() && !this.ownsFusion() && !this.showContentImmediately() && !this.theme.reducedMotion ? this.panelScale : 1, centerX: this.centerX, centerY: this.centerY })
    .translate({ x: this.usesGlass() && !this.showContentImmediately() ? this.panelOffset : 0 })
    .transition(!this.surfaceVisible ? TransitionEffect.IDENTITY : this.usesGlass() ? this.glassTransition() : this.flatTransition)
  }
}

class GlassOutline implements AttributeModifier<CommonAttribute> {
  private path: string;
  constructor(path: string) { this.path = path; }
  applyNormalAttribute(instance: CommonAttribute): void {
    if (this.path !== '') instance.border({ width: 0 }).clipShape(new PathShape({ commands: this.path }));
  }
}
