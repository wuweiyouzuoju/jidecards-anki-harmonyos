import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { takePopupTrigger } from '../../utils/PopupTrigger';
import { SurfaceTransition } from '../../utils/SurfaceTransition';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { prefersReducedMotion } from '../../utils/ReducedMotion';
import { SharedGlassFusion, GlassFusionGeometry, GlassFusionRect } from 'jide_foundation';
import { GlassRegion, currentGlassSource, supportsGlassBackdrop, sourceCaptureAllowed, GLASS_BACKGROUND_SOURCE } from '../../utils/GlassBackdrop';
import { APP_FOREGROUND_KEY } from '../../model/AppLifecycleState';
import { GlassPanel } from './GlassPanel';
import { GlassBubblePanel } from './GlassBubblePanel';
import { WINDOW_KEYBOARD_TOP_KEY, keyboardViewportHeight } from '../../model/WindowSafeLayout';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { PAGE_COMPACT_LAYOUT_KEY } from '../../model/AppLayoutState';
import { MenuSurface } from './MenuSurface';
import { ActionMenuBubble, ActionMenuPointerSide } from './ActionMenuLayout';
import { MenuSlideScope, menuSlideSession } from '../../model/MenuSlideSession';
import { safeMenuGeometry, SafeMenuGeometry, WINDOW_SAFE_TOP_KEY, WINDOW_SAFE_BOTTOM_KEY,
  WINDOW_SAFE_LEFT_KEY, WINDOW_SAFE_RIGHT_KEY } from '../../model/WindowSafeLayout';

/** 顶部菜单共用表面、锚点留白、承接层、滚动边界和动效。 */
@Component
export struct AnchoredMenu {
  slideScope: MenuSlideScope = new MenuSlideScope();
  private readonly scroller: Scroller = new Scroller();
  aboutToAppear(): void {
    const trigger: GlassFusionRect | undefined = takePopupTrigger();
    this.buttonOrigin = this.fusionAnchor ?? trigger;
    this.fusionPending = this.buttonOrigin !== undefined && this.bubble === undefined && (this.surfaceVisible || this.separateFusionSurface) && this.foreground &&
      this.material === 'glass' && supportsGlassBackdrop();
    this.fusionAreaChanged();
    this.slideScope.scroll = (delta: number): void => { this.scroller.scrollBy(0, delta); };
    menuSlideSession.attach(this.slideScope);
  }
  aboutToDisappear(): void { menuSlideSession.detach(this.slideScope); }
  @Prop @Watch('closeRequested') closeRequest: number = 0;
  @State private fusionExpanded: boolean = true;
  private closeRequested(): void {this.requestClose();}
  private requestClose(toggle: boolean = false): void {
    if(this.fusionPlaying) {
      if(!toggle&&!this.fusionExpanded) return;
      this.fusionExpanded=toggle?!this.fusionExpanded:false;
      this.getUIContext().animateTo({duration:60,curve:Curve.EaseOut},(): void=>{this.fusionPending=true;});
    } else this.onClose();
  }
  private backgroundClicked(event: ClickEvent): void {
    const a: GlassFusionRect | undefined=this.buttonOrigin;
    const atTrigger: boolean=a!==undefined&&event.windowX>=a.x&&event.windowX<=a.x+a.width&&
      event.windowY>=a.y&&event.windowY<=a.y+a.height;
    this.requestClose(atTrigger);
  }
  /** 复合菜单由外层拥有主面板融合；子面板继续保留各自精确轮廓。 */
  onFusionUnavailable: () => void = (): void => {};
  @Prop separateFusionSurface: boolean = false;
  @Prop @Watch('fusionAreaChanged') fusionPanelArea: GlassFusionRect | undefined = undefined;
  private fusionAreaChanged(): void {
    if (!this.separateFusionSurface || this.fusionPanelArea === undefined) return;
    this.fusionTarget = this.fusionPanelArea;
    if (this.fusionPending && !this.fusionPlaying) this.panelPrepared();
  }
  @Prop fusionAnchor: GlassFusionRect | undefined = undefined;
  private buttonOrigin: GlassFusionRect | undefined = undefined;
  @State private fusionPending: boolean = false;
  @State private fusionPlaying: boolean = false;
  @State private fusionTarget: GlassFusionRect = {x:0,y:0,width:0,height:0,radius:0};
  @StorageProp('surface_material') private material: string = 'flat';
  @StorageProp(APP_FOREGROUND_KEY) @Watch('foregroundChanged') private foreground: boolean = false;
  private foregroundChanged(): void {
    if(!this.foreground) {this.fusionPending=false;this.fusionPlaying=false;}
  }
  @StorageProp('themeMode') private themeMode: string = 'system';
  @StorageProp('systemDarkMode') private systemDark: boolean = false;
  private fusionGeometry(): GlassFusionGeometry {
    const b: GlassFusionRect=this.fusionTarget,w: number=Math.min(44,b.width),h: number=Math.min(44,b.height);
    return {source:this.buttonOrigin ?? {x:this.alignEnd?b.x+b.width-w:b.x,y:b.y,width:w,height:h,radius:Math.min(w,h)/2},target:b};
  }
  private fusionRegion(): GlassRegion {
    const g: GlassFusionGeometry=this.fusionGeometry(),a: GlassFusionRect=g.source,b: GlassFusionRect=g.target;
    const pad: number=Math.min(a.width,a.height)*0.17+1;
    const left: number=Math.min(a.x,b.x)-pad,top: number=Math.min(a.y,b.y)-pad;
    return {left,top,width:Math.max(a.x+a.width,b.x+b.width)+pad-left,height:Math.max(a.y+a.height,b.y+b.height)+pad-top};
  }
  private panelPrepared(): void {
    // 内容壳会先于主面板实测就绪，保留按钮起点直至几何到达。
    if (this.fusionPending && this.fusionTarget.width <= 0) return;
    if(this.fusionPending && this.fusionTarget.width>0) this.fusionPlaying=true;
    else this.fusionPending=false;
    this.onPrepared();
  }
  private finishFusion(reason: string): void {
    if((reason==='finished'||reason==='reduced_motion')&&!this.fusionExpanded) {this.onClose();return;}
    if(reason==='finished' || reason==='reduced_motion') {
      // 保留同一材质，只让正文轻淡入，避免整块背景再次换色。
      this.fusionPending=false;
    } else {
      this.fusionPending=false;
      this.fusionPlaying=false; this.onFusionUnavailable();
    }
  }
  @Prop menuWidth: number = 应用尺寸.compactMenuWidth;
  /** 调用方传入菜单宿主内的最终坐标；窗口根宿主与窗口坐标相同。 */
  @Prop topOffset: number = 0;
  @Prop alignEnd: boolean = true;
  @Prop contentMaxWidth: Length = '100%';
  /** 实测内容区域在宿主内的左缘；已包含安全区和页面内边距，不能重复叠加。 */
  @Prop contentLeft: number | undefined = undefined;
  /** 触发按钮实测窗口右缘；存在时只转换一次宿主坐标，不再扣安全区。 */
  @Prop anchorRight: number | undefined = undefined;
  @State private viewportLeft: number = 0;
  @State private viewportWidth: number = 0;
  @Prop cornerRadius: number = 应用尺寸.radiusLg;
  @Prop surfaceVisible: boolean = true;
  @Prop refractionSource: string = '';
  @Prop materialRole: string = 'menu';
  onPanelArea: (area: Area) => void = (_area: Area): void => {};
  onPrepared: () => void = (): void => {};
  /** 行锚点菜单的主面板轮廓独立于 Scroll；保持尖角固定在所选行边框。 */
  @Prop bubble: ActionMenuBubble | undefined = undefined;
  @Prop maxHeight: number | undefined = undefined;
  @StorageProp(WINDOW_KEYBOARD_TOP_KEY) private keyboardTop: number = 0;
  @State private viewportHeight: number = 600;
  @State private viewportTop: number = 0;
  @State private renderedHeight: number = 0;
  @StorageProp(PAGE_COMPACT_LAYOUT_KEY) private narrowDeckLayout: boolean = false;
  @StorageProp(WINDOW_SAFE_TOP_KEY) private safeTop: number = 0;
  @StorageProp(WINDOW_SAFE_BOTTOM_KEY) private safeBottom: number = 0;
  @StorageProp(WINDOW_SAFE_LEFT_KEY) private safeLeft: number = 0;
  @StorageProp(WINDOW_SAFE_RIGHT_KEY) private safeRight: number = 0;
  onClose: () => void = (): void => {};
  @BuilderParam content: () => void = this.emptyContent;

  @Builder
  private emptyContent(): void {}

  private menuGeometry(): SafeMenuGeometry {
    return safeMenuGeometry(keyboardViewportHeight(this.viewportHeight, this.viewportTop, this.keyboardTop), this.topOffset, Math.max(0, this.safeTop - this.viewportTop), this.keyboardTop > 0 ? 0 : this.safeBottom,
      应用尺寸.页面底部间距(this.narrowDeckLayout));
  }

  private scrollMaxHeight(): number {
    return Math.min(this.menuGeometry().maxHeight, this.maxHeight ?? this.menuGeometry().maxHeight);
  }

  private panelLeft(): number | undefined {
    if (this.contentLeft !== undefined || this.anchorRight === undefined) return this.contentLeft;
    return Math.max(0, Math.min(this.viewportWidth - this.menuWidth, this.anchorRight - this.viewportLeft - this.menuWidth));
  }

  @Builder
  private menuContent() {
        Scroll(this.scroller) {
          Column() {
            this.content()
          }.width('100%')
        }
        .constraintSize({ maxHeight: this.scrollMaxHeight() })
        .scrollBar(BarState.Auto)
        .onClick((event: ClickEvent): void => { })
        .width(this.menuWidth)
        .onDidScroll((): void => { this.slideScope.offset = this.scroller.currentOffset().yOffset; })
        .onAreaChange((_old: Area, area: Area): void => {
          this.renderedHeight = Number(area.height); this.onPanelArea(area);
          if(!this.separateFusionSurface && (this.fusionPending || this.fusionPlaying)) this.fusionTarget={x:Number(area.globalPosition.x),y:Number(area.globalPosition.y),
            width:Number(area.width),height:Number(area.height),radius:this.cornerRadius};
          this.slideScope.clip = { left: Number(area.globalPosition.x), top: Number(area.globalPosition.y),
            width: Number(area.width), height: Number(area.height) };
        })

  }

  build() {
    Stack({ alignContent: this.panelLeft() === undefined ? Alignment.Top : Alignment.TopStart }) {
      Column()
        .width('100%').height('100%')
        .backgroundColor(Color.Transparent)
        .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
        .onClick((event: ClickEvent): void => { this.backgroundClicked(event); })
      // 定位容器与宿主工具栏同宽；外部点击承接层仍覆盖整个窗口。
      Stack({ alignContent: this.alignEnd ? Alignment.TopEnd : Alignment.TopStart }) {
        Stack({ alignContent: Alignment.TopStart }) {
          if (this.bubble !== undefined && this.surfaceVisible) {
            GlassBubblePanel({ source: this.refractionSource, panelWidth: this.bubble.width,
              pointerCenter: this.bubble.pointerCenter, pointerSide: this.bubble.pointerSide,
              onPrepared: this.onPrepared, content: (): void => { this.menuContent(); } })
          } else {
            GlassPanel({ source: this.refractionSource, role: this.materialRole, radius: this.cornerRadius,
              panelWidth: this.menuWidth, menuMotion: true, centerX: this.alignEnd ? '100%' : '0%', centerY: '0%',
              surfaceVisible: this.surfaceVisible && !this.fusionPlaying, externalEntrance: this.fusionPending, onPrepared: (): void=>{this.panelPrepared();},
              content: (): void => { this.menuContent(); } })
          }
        }
        .opacity(this.fusionPending ? 0.01 : 1)
        .hitTestBehavior(this.fusionPending ? HitTestMode.None : HitTestMode.Default)
        .accessibilityLevel(this.fusionPending ? 'no-hide-descendants' : 'auto')
        .margin({ top: this.menuGeometry().top - (this.bubble?.pointerSide === ActionMenuPointerSide.Top ? MenuSurface.pointerDepth : 0),
          left: this.panelLeft() !== undefined ? 0 : this.alignEnd ? this.safeLeft : this.safeLeft + 应用尺寸.页面内边距_水平,
          right: this.panelLeft() !== undefined ? 0 : this.alignEnd ? this.safeRight + 应用尺寸.页面内边距_水平 : this.safeRight })

      }
      .width(this.contentLeft !== undefined ? this.contentMaxWidth : this.panelLeft() !== undefined ? this.menuWidth : '100%')
      .constraintSize({ maxWidth: this.contentMaxWidth })
      .margin({ left: this.panelLeft() ?? 0 })
      .hitTestBehavior(HitTestMode.Transparent).zIndex(2)
      if(this.fusionPlaying && this.foreground) {
        Stack({ alignContent: Alignment.TopStart }) {
        SharedGlassFusion({source:this.refractionSource || currentGlassSource(this.getUIContext()),backgroundSource:GLASS_BACKGROUND_SOURCE,
          contourStrokeWidth:(this.themeMode==='dark'||(this.themeMode!=='light'&&this.systemDark))?SurfaceBorder.glassOutlineWidth(true):0,
          contourStrokeColor:SurfaceBorder.glassOutlineColor(true),geometry:this.fusionGeometry(),reducedMotion:prefersReducedMotion(this.getUIContext()),region:this.fusionRegion(),active:this.foreground,expanded:this.fusionExpanded,durationMs:SurfaceTransition.popupEnterMs,
          dark:this.themeMode==='dark'||(this.themeMode!=='light'&&this.systemDark),
          captureAllowed:(): boolean=>sourceCaptureAllowed(this.refractionSource || currentGlassSource(this.getUIContext())),
          onComplete:(reason: string): void=>{this.finishFusion(reason);}})
        }.width(this.fusionRegion().width).height(this.fusionRegion().height)
          .position({x:this.fusionRegion().left-this.viewportLeft,y:this.fusionRegion().top-this.viewportTop})
          .hitTestBehavior(HitTestMode.None).accessibilityLevel('no').zIndex(1)
      }
    }
    .width('100%').height('100%')
    .onClick((event: ClickEvent): void => { this.backgroundClicked(event); })
    .onAreaChange((_old: Area, area: Area): void => {
      this.viewportLeft = Number(area.globalPosition.x);
      this.viewportWidth = Number(area.width);
      this.viewportHeight = Number(area.height);
      this.viewportTop = Number(area.globalPosition.y);
    })
  }
}
