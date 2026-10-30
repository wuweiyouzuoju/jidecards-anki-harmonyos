// SPDX-License-Identifier: AGPL-3.0-or-later
import { PathShape } from '@kit.ArkUI';
import { GlassBackdrop, GlassRegion, currentGlassSource, supportsGlassBackdrop, retainGlassPanel, releaseGlassPanel } from '../../utils/GlassBackdrop';
import { APP_FOREGROUND_KEY } from '../../model/AppLifecycleState';
import { currentMotionProfile, materialPopupAnimation } from '../../utils/AppMotion';
import { SurfaceTransition } from '../../utils/SurfaceTransition';
import { PopupSurface } from './PopupSurface';

/** 准备、玻璃和原生文字共用一个展开容器；250ms后锁定降级，不迟到换图。 */
@Component
export struct GlassPanel {
  @Prop source: string = '';
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
  @State private failed: boolean = false;
  private prepared: boolean = false;
  private mounted: boolean = false;
  private timer: number = -1;
  private preparationStarted: number = 0;
  onPrepared: () => void = (): void => {};
  @BuilderParam content: () => void = this.empty;
  @Builder
  private empty(): void {}
  private usesGlass(): boolean { return this.surfaceVisible && this.sourceId !== '' && this.material === 'glass' && supportsGlassBackdrop(); }
  aboutToAppear(): void {
    this.mounted = true; this.preparationStarted = Date.now();
    this.sourceId = this.source || currentGlassSource(this.getUIContext());
    if (this.surfaceVisible) retainGlassPanel(this.sourceId);
    if (this.usesGlass()) {
      this.panelScale = this.menuMotion || this.role === 'menu' ? currentMotionProfile().menuScale : currentMotionProfile().dialogScale;
      this.timer = setTimeout((): void => { this.failed = true; this.finish(); }, 250);
    } else { this.prepared = true; this.panelOpacity = 1; this.onPrepared(); }
  }
  aboutToDisappear(): void { this.mounted = false; clearTimeout(this.timer); if (this.surfaceVisible) releaseGlassPanel(this.sourceId); }
  private finish(): void {
    if (!this.mounted || this.prepared) return;
    this.prepared = true; clearTimeout(this.timer); this.onPrepared();
    console.info(`GlassPanel prepared role=${this.role} elapsed=${Date.now() - this.preparationStarted}ms fallback=${this.failed}`);
    this.getUIContext().animateTo(this.menuMotion || this.role === 'menu' ?
      materialPopupAnimation(currentMotionProfile().menuEnterMs) : SurfaceTransition.dialogEnterAnimation(), (): void => {
      this.panelOpacity = 1; this.panelScale = 1;
    });
  }
  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      if (this.usesGlass() && !this.failed && this.foreground && this.surfaceVisible && this.geometryReady && this.region.width > 0 && this.region.height > 0) {
        // 绝对纹理不能参与固有尺寸计算，否则边框会形成逐次撑大的反馈。
        Stack({ alignContent: Alignment.TopStart }) {
        GlassBackdrop({ source: this.sourceId, region: this.region, radius: this.contourPath === '' ? this.radius : 0, contourPath: this.contourPath, role: this.role,
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
    .attributeModifier(new PopupSurface(this.material, this.mode === 'dark' ||
      (this.mode !== 'light' && this.systemDark), this.radius, this.role, this.surfaceVisible, this.glassAccent))
    .borderRadius(this.radius).clip(this.surfaceVisible)
    .attributeModifier(new GlassOutline(this.contourPath))
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
