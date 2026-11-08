// SPDX-License-Identifier: AGPL-3.0-or-later
import { UIContext, FrameNode, NodeController, RenderNode, DrawContext, LengthMetricsUnit, FrameCallback } from '@kit.ArkUI';
import { drawing, common2D, effectKit } from '@kit.ArkGraphics2D';
import { image } from '@kit.ImageKit';
import { deviceInfo } from '@kit.BasicServicesKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { GlassFusionGpuController } from './GlassFusionGpu';
import { BackdropFrame, BackdropConsumer } from './GlassBackdropTypes';
import { GLASS_MENU_ENTER_MS, GlassFusionGeometry, GlassFusionRect, GlassFusionMesh, GlassFusionTessellator, validGlassFusion, glassFusionTiming } from '../../core/GlassFusion';
import { glassCaptureScale } from '../../core/GlassCapture';
import { GlassMesh, glassMesh, glassTexturePoint, glassContour } from '../../core/GlassOptics';


/** 每个UIContext独占采集会话：同一背景一帧只采集一次，不截取玻璃自身。 */
class BackdropSession {
  private listeners: Set<BackdropConsumer> = new Set<BackdropConsumer>();
  private timer: number = -1;
  private warm: boolean = false;
  private canCapture: (initialFrame?: boolean) => boolean = (): boolean => true;
  private busy: boolean = false;
  private generation: number = 0;
  private frame: BackdropFrame | undefined = undefined;
  private warned: boolean = false;
  private captured: boolean = false;
  private ui: UIContext;
  private source: string;
  private backgroundSource: string;
  private windowId: number;
  constructor(ui: UIContext, source: string, backgroundSource: string = '') { this.ui = ui; this.source = source; this.backgroundSource = backgroundSource; this.windowId = -1; if (deviceInfo.apiAvailable(23)) this.windowId = ui.getWindowId() ?? -1; }
  attach(node: BackdropConsumer, canCapture: (initialFrame?: boolean) => boolean): void {
    this.canCapture = canCapture;
    this.listeners.add(node);
    if (this.frame !== undefined) node.updateFrame(this.frame);
    if (this.timer < 0) {
      this.timer = setInterval((): void => { this.capture(); }, 50);
    }
    if (this.frame === undefined) this.capture();
  }
  setWarm(warm: boolean, canCapture: (initialFrame?: boolean) => boolean): void {
    this.canCapture = canCapture;
    this.warm = warm;
    if (warm && this.timer < 0) {
      this.timer = setInterval((): void => { this.capture(); }, 100);
      this.capture();
    }
    if (!warm && this.listeners.size === 0) this.stop();
  }
  detach(node: BackdropConsumer): void {
    this.listeners.delete(node);
    node.updateFrame(undefined);
    if (this.listeners.size !== 0 || this.warm) return;
    this.stop();
  }
  private stop(): void {
    clearInterval(this.timer); this.timer = -1; this.generation++;
    const old = this.frame; this.frame = undefined;
    if (old !== undefined) { old.pixels.release(); old.frosted.release(); }
    const sources = sessions.get(this.windowId);
    sources?.delete(this.source);
    if (sources?.size === 0) sessions.delete(this.windowId);
  }
  /** 透明正文合成导航背后的唯一真实背景；不重建背景、动画或采入弹层。返回帧由会话拥有。 */
  private async capturePixels(source: FrameNode): Promise<image.PixelMap> {
    const measured = source.getMeasuredSize();
    const scale: number = glassCaptureScale(measured.width, measured.height);
    const snapshot = this.ui.getComponentSnapshot();
    if (this.backgroundSource === '') {
      return snapshot.get(this.source, { scale: scale, waitUntilRenderFinished: true });
    }
    const node = this.ui.getFrameNodeById(this.backgroundSource);
    if (node === null) throw new Error('glass_background_source_unavailable');
    const frames = await Promise.allSettled([
      snapshot.get(this.source, { scale: scale, waitUntilRenderFinished: true }),
      snapshot.get(this.backgroundSource, { scale: scale, waitUntilRenderFinished: true })
    ]);
    const foreground = frames[0];
    const background = frames[1];
    try {
      if (foreground.status !== 'fulfilled' || background.status !== 'fulfilled') {
        throw new Error('glass_snapshot_unavailable');
      }
      const info = foreground.value.getImageInfoSync();
      const size = source.getMeasuredSize();
      const backgroundSize = node.getMeasuredSize();
      const position = source.getPositionToWindow();
      const backgroundPosition = node.getPositionToWindow();
      const scaleX = info.size.width / size.width;
      const scaleY = info.size.height / size.height;
      const canvas = new OffscreenCanvasRenderingContext2D(info.size.width, info.size.height,
        new RenderingContextSettings(true), LengthMetricsUnit.PX);
      canvas.drawImage(background.value, this.ui.vp2px(backgroundPosition.x - position.x) * scaleX,
        this.ui.vp2px(backgroundPosition.y - position.y) * scaleY,
        backgroundSize.width * scaleX, backgroundSize.height * scaleY);
      canvas.drawImage(foreground.value, 0, 0, info.size.width, info.size.height);
      return canvas.getPixelMap(0, 0, info.size.width, info.size.height);
    } finally {
      if (foreground.status === 'fulfilled') foreground.value.release();
      if (background.status === 'fulfilled') background.value.release();
    }
  }

  private fusionHolding(): boolean {
    return this.frame !== undefined && Array.from(this.listeners).some((node: BackdropConsumer): boolean => node.freezeBackdrop);
  }
  private async capture(): Promise<void> {
    if (this.fusionHolding() || !this.canCapture(this.frame === undefined) || this.busy || (this.listeners.size === 0 && !this.warm)) return;
    const source = this.ui.getFrameNodeById(this.source);
    if (source === null) return;
    const size = source.getMeasuredSize();
    const position = source.getPositionToWindow();
    if (size.width <= 0 || size.height <= 0) return;
    this.busy = true;
    const generation = this.generation;
    try {
      const pixels = await this.capturePixels(source);
      if (generation !== this.generation || this.fusionHolding() || !this.canCapture(this.frame === undefined) || (this.listeners.size === 0 && !this.warm)) { await pixels.release(); return; }
      const info = pixels.getImageInfoSync();
      const frosted = await effectKit.createEffect(pixels).blur(this.ui.vp2px(5.5) * info.size.width / size.width, effectKit.TileMode.CLAMP).getEffectPixelMap(true);
      if (generation !== this.generation || this.fusionHolding() || !this.canCapture(this.frame === undefined) || (this.listeners.size === 0 && !this.warm)) { await pixels.release(); await frosted.release(); return; }
      if (!this.captured) {
        this.captured = true;
        hilog.info(0x4342, 'GlassBackdrop', 'Backdrop ready %{public}s %{public}dx%{public}d', this.source, info.size.width, info.size.height);
      }
      const old = this.frame;
      this.frame = { pixels, frosted, left: this.ui.vp2px(position.x), top: this.ui.vp2px(position.y), width: size.width, height: size.height,
        scaleX: info.size.width / size.width, scaleY: info.size.height / size.height };
      this.listeners.forEach((node: BackdropConsumer): void => { node.updateFrame(this.frame); });
      // 绘制命令可能仍引用上一帧纹理，延后一帧释放。
      if (old !== undefined) setTimeout((): void => { old.pixels.release(); old.frosted.release(); }, 100);
    } catch (error) {
      if (!this.warned) {
        this.warned = true;
        hilog.warn(0x4342, 'GlassBackdrop', 'Backdrop capture unavailable: %{public}s', String(error));
      }
    } finally { this.busy = false; }
  }
}

const sessions: Map<number, Map<string, BackdropSession>> = new Map<number, Map<string, BackdropSession>>();
function session(ui: UIContext, source: string, backgroundSource: string = ''): BackdropSession {
  let windowId: number = -1;
  if (deviceInfo.apiAvailable(23)) windowId = ui.getWindowId() ?? -1;
  let sources = sessions.get(windowId);
  if (sources === undefined) { sources = new Map<string, BackdropSession>(); sessions.set(windowId, sources); }
  let result = sources.get(source);
  if (result === undefined) { result = new BackdropSession(ui, source, backgroundSource); sources.set(source, result); }
  return result;
}

class GlassRenderNode extends RenderNode implements BackdropConsumer {
  private backdrop: BackdropFrame | undefined = undefined;
  private mesh: GlassMesh = { positions: [], texture: [], indices: [] };
  private texs: common2D.Point[] = [];
  private failed: boolean = false;
  private drawn: boolean = false;
  private terminalClip: GlassFusionRect | undefined = undefined;
  private fusionEdge: common2D.Point[] = [];
  private fusionDark: boolean = false;
  private fusionTint: drawing.Brush | undefined = undefined;
  private fusionWidth: number = -1;
  private fusionHeight: number = -1;
  private contourStrokeWidth: number = 0;
  private contourStrokeColor: string = '#00000000';
  private outlinePen: drawing.Pen | undefined = undefined;
  private foregroundButton: GlassFusionRect | undefined = undefined;
  private buttonDensity: number = 1;
  private drawTotalMs: number = 0;
  private drawPeakMs: number = 0;
  private drawFrames: number = 0;
  drawMetrics(): string {
    return (this.drawTotalMs/Math.max(1,this.drawFrames)).toFixed(2)+','+this.drawPeakMs;
  }
  private imageBrush: drawing.Brush | undefined = undefined;
  private brushPixels: image.PixelMap | undefined = undefined;
  configureFusion(width: number, height: number, left: number, top: number, mesh: GlassFusionMesh, dark: boolean, density: number = 1, foregroundButton: GlassFusionRect | undefined = undefined, contourStrokeWidth: number = 0, contourStrokeColor: string = '#00000000'): void {
    this.lengthMetricsUnit=LengthMetricsUnit.PX;
    this.foregroundButton = foregroundButton; this.buttonDensity = density; this.terminalClip = mesh.clipRect;
    this.contourStrokeWidth = contourStrokeWidth;
    this.contourStrokeColor = contourStrokeColor;
    if(this.fusionTint===undefined||dark!==this.fusionDark||density!==this.density) {
      this.fusionTint=new drawing.Brush();this.fusionTint.setAntiAlias(true);
      this.fusionTint.setColor(dark ? 0x28121820 : 0x20FFFFFF);
    }
    this.density=density;this.originX=left;this.originY=top;this.mesh=mesh;this.fusionEdge=mesh.edge;this.fusionDark=dark;
    if(width!==this.fusionWidth||height!==this.fusionHeight) {
      this.fusionWidth=width;this.fusionHeight=height;this.frame={x:0,y:0,width,height};
    }
    this.invalidate();
  }
  ready: () => void = (): void => {};
  plain: boolean = false;
  freezeBackdrop: boolean = false;
  private radius: number = 0;
  private density: number = 1;
  private meshWidth: number = -1;
  private meshHeight: number = -1;
  private meshRadius: number = -1;
  private meshDensity: number = -1;
  private meshOutline: string = '';
  private originX: number = 0;
  private originY: number = 0;
  configure(width: number, height: number, left: number, top: number, radius: number, density: number, outline: string): void {
    this.lengthMetricsUnit = LengthMetricsUnit.PX;
    this.foregroundButton = undefined;
    this.density = density;
    this.radius = radius;
    // 位移和重复布局不改变光学网格；只有轮廓/尺寸变化才重算。
    if (width !== this.meshWidth || height !== this.meshHeight || radius !== this.meshRadius ||
      density !== this.meshDensity || outline !== this.meshOutline) {
      this.meshWidth = width; this.meshHeight = height; this.meshRadius = radius;
      this.meshDensity = density; this.meshOutline = outline;
      this.mesh = width > 0 && height > 0 ? glassMesh(width, height, radius, density, glassContour(outline)) : { positions: [], texture: [], indices: [] };
    }
    this.originX = left; this.originY = top;
    this.frame = { x: 0, y: 0, width, height };
    this.invalidate();
  }
  updateFrame(frame: BackdropFrame | undefined): void {
    this.backdrop = frame;
    if (frame === undefined) { this.imageBrush=undefined;this.brushPixels=undefined; }
    this.invalidate();
  }
  draw(context: DrawContext): void {
    const frame = this.backdrop;
    if (frame === undefined || this.mesh.positions.length === 0 || this.failed || !deviceInfo.apiAvailable(23)) return;
    // 源画面以外保留原有透射底色，不能把边缘像素拉伸到不存在的背景。
    if (this.originX < frame.left || this.originY < frame.top ||
      this.originX + this.frame.width > frame.left + frame.width + 1 ||
      this.originY + this.frame.height > frame.top + frame.height + 1) return;
    const drawStarted: number=Date.now();
    const button: GlassFusionRect | undefined = this.foregroundButton;
    // 低分辨率背景纹理只重放按钮内部；边界由原生控件继续绘制。
    if (button !== undefined) {
      context.canvas.save();
      context.canvas.clipRoundRect(new drawing.RoundRect({left:button.x,top:button.y,
        right:button.x+button.width,bottom:button.y+button.height},button.radius,button.radius), drawing.ClipOp.DIFFERENCE, true);
    }
    const clip: GlassFusionRect | undefined = this.terminalClip;
    if (clip !== undefined) {
      context.canvas.save();
      context.canvas.clipRoundRect(new drawing.RoundRect({left:clip.x,top:clip.y,right:clip.x+clip.width,bottom:clip.y+clip.height},clip.radius,clip.radius), drawing.ClipOp.INTERSECT, true);
    }
    const texture: common2D.Point[]=this.plain?this.mesh.positions:this.mesh.texture;
    for(let i: number=0;i<texture.length;i++) {
      let point: common2D.Point=this.texs[i];
      if(point===undefined) {point={x:0,y:0};this.texs.push(point);}
      point.x=(this.originX-frame.left+texture[i].x)*frame.scaleX;
      point.y=(this.originY-frame.top+texture[i].y)*frame.scaleY;
    }
    this.texs.length=texture.length;
    try {
    // 全面板使用同一张轻度模糊纹理，边缘与中央没有清晰度分层。
    const pixels: image.PixelMap=this.plain ? frame.pixels : frame.frosted;
    if (this.imageBrush === undefined || this.brushPixels !== pixels) {
      this.imageBrush=new drawing.Brush();this.imageBrush.setAntiAlias(true);
      this.imageBrush.setShaderEffect(drawing.ShaderEffect.createImageShader(pixels, drawing.TileMode.CLAMP,
        drawing.TileMode.CLAMP, new drawing.SamplingOptions(drawing.FilterMode.FILTER_MODE_LINEAR)));
      this.brushPixels=pixels;
    }
    const brush: drawing.Brush=this.imageBrush;
    context.canvas.attachBrush(brush);
    context.canvas.drawVertices(drawing.VertexMode.TRIANGLES_VERTEXMODE, this.mesh.positions.length,
      this.mesh.positions, this.texs, null, this.mesh.indices.length, this.mesh.indices, drawing.BlendMode.SRC);
    context.canvas.detachBrush();
    if (this.fusionEdge.length > 0) {
      // 同一三角网格叠中性色层；轮廓由精确裁切与可选的连续描边拥有。
      context.canvas.attachBrush(this.fusionTint!);
      context.canvas.drawVertices(drawing.VertexMode.TRIANGLES_VERTEXMODE, this.mesh.positions.length,
        this.mesh.positions, null, null, this.mesh.indices.length, this.mesh.indices, drawing.BlendMode.SRC_OVER);
      context.canvas.detachBrush();
    }
    if (this.contourStrokeWidth > 0 && this.fusionEdge.length >= 2) {
      if (this.outlinePen === undefined) this.outlinePen = new drawing.Pen();
      this.outlinePen.setAntiAlias(true);
      this.outlinePen.setStrokeWidth(this.contourStrokeWidth);
      this.outlinePen.setColor(Number.parseInt(this.contourStrokeColor.slice(1), 16));
      const outline: drawing.Path = new drawing.Path();
      // edge 是成对的真实边界线段，不能将不相邻端点连接成穿过球体的线。
      for (let index: number = 0; index + 1 < this.fusionEdge.length; index += 2) {
        outline.moveTo(this.fusionEdge[index].x, this.fusionEdge[index].y);
        outline.lineTo(this.fusionEdge[index + 1].x, this.fusionEdge[index + 1].y);
      }
      context.canvas.attachPen(this.outlinePen);
      if (clip !== undefined) {
        const inset: number = this.contourStrokeWidth / 2, radius: number = Math.max(0, clip.radius - inset);
        context.canvas.drawRoundRect(new drawing.RoundRect({left:clip.x+inset,top:clip.y+inset,
          right:clip.x+clip.width-inset,bottom:clip.y+clip.height-inset},radius,radius));
      } else context.canvas.drawPath(outline);
      context.canvas.detachPen();
    }
    if (clip !== undefined) context.canvas.restore();
    if (button !== undefined) {
      context.canvas.restore();
      const inset: number = Math.min(2 * this.buttonDensity, button.width / 4, button.height / 4);
      const radius: number = Math.max(0, button.radius - inset);
      const dst: common2D.Rect = { left: button.x + inset, top: button.y + inset,
        right: button.x + button.width - inset, bottom: button.y + button.height - inset };
      const src: common2D.Rect = { left: (this.originX + dst.left - frame.left) * frame.scaleX,
        top: (this.originY + dst.top - frame.top) * frame.scaleY,
        right: (this.originX + dst.right - frame.left) * frame.scaleX,
        bottom: (this.originY + dst.bottom - frame.top) * frame.scaleY };
      // 同次快照只覆盖内部图标区域，保持原生外框及其抗锯齿清晰。
      context.canvas.save();
      context.canvas.clipRoundRect(new drawing.RoundRect(dst, radius, radius), drawing.ClipOp.INTERSECT, true);
      context.canvas.drawImageRectWithSrc(frame.pixels, src, dst,
        new drawing.SamplingOptions(drawing.FilterMode.FILTER_MODE_LINEAR));
      context.canvas.restore();
    }
    this.drawFrames++;const drawElapsed: number=Date.now()-drawStarted;
    this.drawTotalMs+=drawElapsed;this.drawPeakMs=Math.max(this.drawPeakMs,drawElapsed);
    if (!this.drawn) {
      this.drawn = true;
      setTimeout((): void => { this.ready(); }, 0);
      hilog.info(0x4342, 'GlassBackdrop', 'Glass mesh ready %{public}d triangles', this.mesh.indices.length / 3);
    }
    } catch (error) {
      this.failed = true;
      hilog.warn(0x4342, 'GlassBackdrop', 'Glass drawing unavailable: %{public}s', String(error));
    }
  }
}

class GlassController extends NodeController {
  readonly glass: GlassRenderNode = new GlassRenderNode();
  private root: FrameNode | null = null;
  makeNode(ui: UIContext): FrameNode | null {
    try {
      this.root = new FrameNode(ui);
      this.root.getRenderNode()?.appendChild(this.glass);
      return this.root;
    } catch (error) {
      hilog.warn(0x4342, 'GlassBackdrop', 'Glass node unavailable: %{public}s', String(error));
      return null;
    }
  }
  dispose(): void { this.root?.dispose(); this.root = null; }
}

@Component
export struct SharedGlassBackdrop {
  @Prop @Watch('syncPlayback') active: boolean = true;
  @Prop @Watch('syncPlayback') dark: boolean = false;
  captureAllowed: (initialFrame?: boolean) => boolean = (): boolean => true;
  @Prop @Watch('updateGeometry') region: SharedGlassRegion = { left: 0, top: 0, width: 0, height: 0 };
  @Prop @Watch('updateGeometry') radius: number = 16;
  @Prop @Watch('updateGeometry') contourPath: string = '';
  @Prop role: string = 'menu';
  @Prop source: string = '';
  @Prop backgroundSource: string = '';
  private controller: GlassController = new GlassController();
  private owner: BackdropSession | undefined = undefined;
  private visible: boolean = false;
  private mounted: boolean = false;
  onReady: () => void = (): void => {};
  private syncPlayback(): void {
    if (this.visible && this.active && this.source !== '') {
      if (this.owner === undefined) {
        this.owner = session(this.getUIContext(), this.source, this.backgroundSource);
        this.owner.attach(this.controller.glass, this.captureAllowed);
      }
    } else {
      this.owner?.detach(this.controller.glass); this.owner = undefined;
    }
  }
  private updateGeometry(): void {
    const ui = this.getUIContext();
    this.controller.glass.plain = this.role === 'background';
    this.controller.glass.configure(ui.vp2px(this.region.width), ui.vp2px(this.region.height),
      ui.vp2px(this.region.left), ui.vp2px(this.region.top), ui.vp2px(this.radius), ui.vp2px(1), this.contourPath);
  }
  aboutToAppear(): void {
    this.mounted = true;
    this.controller.glass.ready = (): void => { if (this.mounted) this.onReady(); };
    this.visible = true; this.updateGeometry(); this.syncPlayback();
  }
  aboutToDisappear(): void {
    this.mounted = false; this.visible = false; this.syncPlayback(); this.controller.dispose();
  }
  build() {
    Stack() {
    NodeContainer(this.controller).width('100%').height('100%').backgroundColor(Color.Transparent)
      .borderRadius(this.radius).clip(true)
      .hitTestBehavior(HitTestMode.None).accessibilityLevel('no')
      .onAreaChange((): void => { this.updateGeometry(); })
    if (this.role !== 'background') {
    Column().width('100%').height('100%')
      .linearGradient({ angle: 90, colors: this.role === 'dialog' ? (this.dark ?
        [['#C0232730',0],['#D9232730',0.5],['#C0232730',1]] :
        [['#99E9ECF2',0],['#B3E9ECF2',0.5],['#99E9ECF2',1]]) : this.dark ?
        [['#0A121820',0],['#1F121820',0.22],['#1F121820',0.78],['#0A121820',1]] :
        [['#0AFFFFFF',0],['#1FFFFFFF',0.22],['#1FFFFFFF',0.78],['#0AFFFFFF',1]] })
    }
    }.width(this.region.width).height(this.region.height).borderRadius(this.radius).clip(true)
      .hitTestBehavior(HitTestMode.None).accessibilityLevel('no')
  }
}

export interface SharedGlassRegion { left: number; top: number; width: number; height: number; }

export function warmSharedGlassSource(ui: UIContext, source: string, active: boolean, captureAllowed: (initialFrame?: boolean) => boolean, backgroundSource: string = ''): void {
  if (deviceInfo.apiAvailable(23)) session(ui, source, backgroundSource).setWarm(active, captureAllowed);
}


/** 显示帧回调只推进几何，快照与磨砂继续由原背景会话独占。 */
class GlassFusionFrame extends FrameCallback {
  private tick: (time: number) => void;
  constructor(tick: (time: number) => void) { super();this.tick=tick; }
  onFrame(time: number): void { this.tick(time); }
}

/** 过渡专用单一玻璃层。坐标均为窗口vp，sourceRect/targetRect来自实测；业务和内容仍由宿主持有。 */
@Component
export struct SharedGlassFusion {
  @Prop source: string = '';
  @Prop backgroundSource: string = '';
  @Prop @Watch('geometryChanged') contourStrokeWidth: number = 0;
  @Prop @Watch('geometryChanged') contourStrokeColor: string = '#00000000';
  @Prop @Watch('geometryChanged') region: SharedGlassRegion = {left:0,top:0,width:0,height:0};
  @Prop @Watch('geometryChanged') geometry: GlassFusionGeometry = {source:{x:0,y:0,width:0,height:0,radius:0},target:{x:0,y:0,width:0,height:0,radius:0}};
  @Prop @Watch('playbackChanged') active: boolean = true;
  @Prop @Watch('playbackChanged') expanded: boolean = true;
  @Prop @Watch('geometryChanged') dark: boolean = false;
  @Prop reducedMotion: boolean = false;
  @Prop durationMs: number = GLASS_MENU_ENTER_MS;
  /** 后台恢复或材质重建时直接恢复终态，不重播已完成的入场。 */
  @Prop animateEntrance: boolean = true;
  @Prop replayTrigger: boolean = true;
  /** 仅实验入口比较预算；正式调用保持默认，不能运行中跳档。 */
  @Prop meshBudget: number = 256;
  @Prop experiment: string = 'production';
  /** GPU仅显式实验启用，默认路径保持已有渲染行为。 */
  @Prop gpuExperiment: boolean = false;
  captureAllowed: (initialFrame?: boolean) => boolean = (): boolean => true;
  onComplete: (reason: string) => void = (_reason: string): void => {};
  private controller: GlassController = new GlassController();
  private gpu: GlassFusionGpuController | undefined = undefined;
  private owner: BackdropSession | undefined = undefined;
  private mounted: boolean = false;
  private ready: boolean = false;
  private queued: boolean = false;
  private completed: boolean = false;
  private preparationTimer: number = -1;
  private started: number = -1;
  private phaseDurationMs: number = 280;
  private progress: number = 0;
  private from: number = 0;
  private frames: number = 0;
  private peakMs: number = 0;
  private totalMs: number = 0;
  private cpuSamples: number[] = [];
  private frameSamples: number[] = [];
  private lastFrame: number = -1;
  private peakFrameMs: number = 0;
  private lateFrames: number = 0;
  private density: number = 1;
  private localGeometry: GlassFusionGeometry = {source:{x:0,y:0,width:0,height:0,radius:0},target:{x:0,y:0,width:0,height:0,radius:0}};
  private tessellator: GlassFusionTessellator | undefined = undefined;
  private callback: GlassFusionFrame = new GlassFusionFrame((time: number): void => { this.tick(time); });
  private consumer(): BackdropConsumer { return this.gpu ?? this.controller.glass; }
  private setCaptureHold(value: boolean): void {this.consumer().freezeBackdrop=value;}
  private drawMetrics(): string {return this.gpu?.drawMetrics() ?? this.controller.glass.drawMetrics();}
  private textureReady(): void {
    if(!this.mounted||this.ready||this.completed) return;
    this.ready=true;clearTimeout(this.preparationTimer);
    if(this.reducedMotion||!this.animateEntrance) {this.progress=this.expanded?1:0;this.render();this.complete(this.reducedMotion?'reduced_motion':'finished');}
    else this.queue();
  }
  /** 动态正文、键盘避让和宽屏重排只更新同一层几何，不重新播放或换材质。 */
  private geometryChanged(): void {
    if(!this.mounted||!validGlassFusion(this.geometry)||this.region.width<=0||this.region.height<=0) return;
    this.configureGeometry();this.render();
  }
  private configureGeometry(): void {
    const a=this.geometry.source,b=this.geometry.target,d=this.density;
    this.localGeometry={source:{x:(a.x-this.region.left)*d,y:(a.y-this.region.top)*d,width:a.width*d,height:a.height*d,radius:a.radius*d},
      target:{x:(b.x-this.region.left)*d,y:(b.y-this.region.top)*d,width:b.width*d,height:b.height*d,radius:b.radius*d}};
    if(this.gpu===undefined) this.tessellator=new GlassFusionTessellator(this.region.width*d,this.region.height*d,d,this.meshBudget);
  }
  private queue(): void {
    if(!this.mounted||!this.active||!this.ready||this.completed||this.queued) return;
    this.queued=true;
    try {this.getUIContext().postFrameCallback(this.callback);}
    catch {this.queued=false;this.complete('frame_unavailable');}
  }
  private render(): void {
    if(this.gpu!==undefined) {
      const start: number=Date.now();
      this.gpu.configure(this.region.width*this.density,this.region.height*this.density,this.region.left*this.density,
        this.region.top*this.density,this.localGeometry,this.progress,this.dark,this.density);
      const elapsed: number=Date.now()-start;this.cpuSamples.push(elapsed);this.frames++;this.totalMs+=elapsed;
      this.peakMs=Math.max(this.peakMs,elapsed);return;
    }
    if(this.tessellator===undefined) return;
    const start: number=Date.now();
    const mesh: GlassFusionMesh=this.tessellator.update(this.localGeometry,this.progress);
    const elapsed: number=Date.now()-start;
    this.cpuSamples.push(elapsed);
    this.frames++;this.totalMs+=elapsed;this.peakMs=Math.max(this.peakMs,elapsed);
    this.controller.glass.configureFusion(this.region.width*this.density,this.region.height*this.density,
      this.region.left*this.density,this.region.top*this.density,mesh,this.dark,this.density, this.replayTrigger && this.progress < 1 ? this.localGeometry.source : undefined, this.contourStrokeWidth * this.density, this.contourStrokeColor);
  }
  private complete(reason: string): void {
    if(this.completed||!this.mounted) return;
    this.completed=true;clearTimeout(this.preparationTimer);
    this.setCaptureHold(false);
    hilog.info(0x4342,'GlassFusion','Complete %{public}s frames=%{public}d cpuMean=%{public}s cpuPeak=%{public}dms framePeak=%{public}s late25=%{public}d',
      reason,this.frames,(this.totalMs/Math.max(1,this.frames)).toFixed(2)+'ms',this.peakMs,this.peakFrameMs.toFixed(2)+'ms',this.lateFrames);
    const cpu: number[]=this.cpuSamples.slice().sort((a: number,b: number): number=>a-b);
    const gaps: number[]=this.frameSamples.slice().sort((a: number,b: number): number=>a-b);
    hilog.info(0x4342,'GlassFusion','Experiment=%{public}s cells=%{public}d reason=%{public}s cpuP95=%{public}dms frameP95=%{public}s drawMeanPeak=%{public}s direction=%{public}s',
      this.experiment,this.meshBudget,reason,cpu[Math.min(cpu.length-1,Math.floor(cpu.length*0.95))]??0,
      (gaps[Math.min(gaps.length-1,Math.floor(gaps.length*0.95))]??0).toFixed(2)+'ms',this.drawMetrics(),this.expanded?'open':'close');
    this.onComplete(reason);
  }
  private tick(time: number): void {
    this.queued=false;
    if(!this.mounted||!this.active||!this.ready||this.completed) return;
    if(this.lastFrame>=0) {
      const gap: number=(time-this.lastFrame)/1000000;
      this.frameSamples.push(gap);
      this.peakFrameMs=Math.max(this.peakFrameMs,gap);if(gap>25) this.lateFrames++;
    }
    this.lastFrame=time;
    if(this.started<0) this.started=time;
    const t: number=Math.max(0,Math.min(1,(time-this.started)/1000000/this.phaseDurationMs));
    const eased: number=glassFusionTiming(t,this.expanded),target: number=this.expanded?1:0;
    this.progress=this.from+(target-this.from)*eased;this.render();
    if(t>=1) { this.complete('finished');return; }
    this.queue();
  }
  private playbackChanged(): void {
    if(!this.mounted) return;
    this.started=-1;this.lastFrame=-1;this.from=this.progress;this.completed=false;
    this.phaseDurationMs=Math.max(60,Math.max(100,Math.min(500,this.durationMs))*(this.expanded?1:0.72)*Math.abs((this.expanded?1:0)-this.from));
    this.frames=0;this.peakMs=0;this.totalMs=0;this.peakFrameMs=0;this.lateFrames=0;
    this.cpuSamples.length=0;this.frameSamples.length=0;
    this.setCaptureHold(this.active);
    if(!this.active) { this.owner?.detach(this.consumer());this.owner=undefined;this.complete('inactive');return; }
    if(this.owner===undefined) {
      this.owner=session(this.getUIContext(),this.source,this.backgroundSource);
      this.owner.attach(this.consumer(),this.captureAllowed);
    }
    this.queue();
  }
  aboutToAppear(): void {
    this.mounted=true;this.density=this.getUIContext().vp2px(1);
    if(this.gpuExperiment) {
      this.gpu=new GlassFusionGpuController();this.gpu.ready=(): void=>{this.textureReady();};
      this.gpu.failed=(reason: string): void=>{this.complete(reason);};
    }
    this.setCaptureHold(true);
    if(!deviceInfo.apiAvailable(23)||!this.active||!validGlassFusion(this.geometry)||this.region.width<=0||this.region.height<=0||this.source==='') {
      this.complete('unavailable');return;
    }
    this.configureGeometry();
    this.progress=this.expanded?(this.animateEntrance?0:1):1;this.from=this.progress;
    this.phaseDurationMs=Math.max(100,Math.min(500,this.durationMs));
    this.controller.glass.ready=(): void=>{this.textureReady();};
    this.preparationTimer=setTimeout((): void=>{this.complete('not_ready');},500);
    this.render();this.owner=session(this.getUIContext(),this.source,this.backgroundSource);
    this.owner.attach(this.consumer(),this.captureAllowed);
  }
  aboutToDisappear(): void {
    this.mounted=false;clearTimeout(this.preparationTimer);this.owner?.detach(this.consumer());this.owner=undefined;
    this.gpu?.dispose();this.gpu=undefined;this.controller.dispose();this.tessellator=undefined;
  }
  build() {
    if(this.gpuExperiment && this.gpu!==undefined) {
      XComponent({id:'jide-glass-fusion-gpu',type:XComponentType.TEXTURE,controller:this.gpu})
        .width(this.region.width).height(this.region.height).backgroundColor(Color.Transparent)
        .hitTestBehavior(HitTestMode.None).accessibilityLevel('no')
    } else {
      NodeContainer(this.controller).width(this.region.width).height(this.region.height)
        .hitTestBehavior(HitTestMode.None).accessibilityLevel('no')
    }
  }
}
