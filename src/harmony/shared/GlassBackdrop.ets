// SPDX-License-Identifier: AGPL-3.0-or-later
import { UIContext, FrameNode, NodeController, RenderNode, DrawContext, LengthMetricsUnit, FrameCallback, componentSnapshot } from '@kit.ArkUI';
import { drawing, common2D, effectKit } from '@kit.ArkGraphics2D';
import { image } from '@kit.ImageKit';
import { deviceInfo } from '@kit.BasicServicesKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { GlassFusionGpuController } from './GlassFusionGpu';
import { BackdropFrame, BackdropConsumer } from './GlassBackdropTypes';
import { GLASS_MENU_ENTER_MS, GlassFusionGeometry, GlassFusionRect, GlassFusionMesh, GlassFusionTessellator, validGlassFusion, glassFusionTiming } from '../../core/GlassFusion';
import { glassCaptureScale, GlassCaptureGeometry, sameGlassCaptureGeometry } from '../../core/GlassCapture';
import { GlassMesh, glassMesh, glassContour } from '../../core/GlassOptics';


let productGlassBlur: number = 1;
export function sharedGlassBlurRadius(): number { return 5.5 * productGlassBlur; }
/** 产品显式配置磨砂强度；默认保持原光学参数，不读取消费者存储。 */
export function configureSharedGlassBlur(strength: number): void {
  if (!Number.isFinite(strength) || strength < 0 || strength > 2) throw new Error('invalid_glass_blur');
  if (productGlassBlur === strength) return;
  productGlassBlur = strength;
  refreshCachedGlassBlur();
}

interface GlassCaptureCanvas {
  width: number;
  height: number;
  context: OffscreenCanvasRenderingContext2D;
}

/** 每个UIContext独占采集会话：同一背景一帧只采集一次，不截取玻璃自身。 */
class BackdropSession {
  private listeners: Set<BackdropConsumer> = new Set<BackdropConsumer>();
  private waiting: Set<BackdropConsumer> = new Set<BackdropConsumer>();
  private timer: number = -1;
  private warm: boolean = false;
  private retained: boolean = false;
  private paused: boolean = false;
  private sourceDirty: boolean = true;
  private revision: number = 0;
  private canCapture: (initialFrame?: boolean) => boolean = (): boolean => true;
  private busy: boolean = false;
  private canvases: Map<string, GlassCaptureCanvas> = new Map<string, GlassCaptureCanvas>();
  private generation: number = 0;
  private frame: BackdropFrame | undefined = undefined;
  private warned: boolean = false;
  private captured: boolean = false;
  private frameBlur: number = -1;
  private ui: UIContext;
  private source: string;
  private backgroundSource: string;
  private windowId: number;
  constructor(ui: UIContext, source: string, backgroundSource: string = '') { this.ui = ui; this.source = source; this.backgroundSource = backgroundSource; this.windowId = -1; if (deviceInfo.apiAvailable(23)) this.windowId = ui.getWindowId() ?? -1; }
  private blurStrength(): number {
    if (this.warm) return productGlassBlur;
    for (const node of this.listeners) {
      if (node.plain !== true) return productGlassBlur;
    }
    return 0;
  }
  private captureScale(width: number, height: number): number {
    // 预热与即将打开的玻璃使用同一清晰度，低模糊度不再在点击后补截高分辨率帧。
    if (this.warm) return glassCaptureScale(width, height, this.blurStrength());
    // 只有完整折射面板需要清晰底图；常驻按钮和预热仍沿用原512px预算。
    for (const node of this.listeners) {
      if (node.cached !== true && node.plain !== true) return glassCaptureScale(width, height, this.blurStrength());
    }
    return glassCaptureScale(width, height);
  }
  private captureGeometry(source: GlassCaptureGeometry): GlassCaptureGeometry {
    let left: number = source.left + source.width, top: number = source.top + source.height;
    let right: number = source.left, bottom: number = source.top;
    let bounded: boolean = false;
    const pad: number = this.ui.vp2px(36);
    for (const node of this.listeners) {
      if (node.cached === true || node.plain === true) continue;
      const region: GlassCaptureGeometry | undefined = node.captureRegion;
      if (region === undefined || region.width <= 0 || region.height <= 0) return source;
      bounded = true;
      left = Math.min(left, region.left - pad); top = Math.min(top, region.top - pad);
      right = Math.max(right, region.left + region.width + pad);
      bottom = Math.max(bottom, region.top + region.height + pad);
    }
    if (!bounded) return source;
    left = Math.max(source.left, Math.floor(left)); top = Math.max(source.top, Math.floor(top));
    right = Math.min(source.left + source.width, Math.ceil(right));
    bottom = Math.min(source.top + source.height, Math.ceil(bottom));
    return right > left && bottom > top ? { left, top, width: right-left, height: bottom-top } : source;
  }
  private releaseFrame(frame: BackdropFrame): void {
    if (frame.frosted !== frame.pixels) frame.frosted.release();
    frame.pixels.release();
  }
  private needsLiveCapture(): boolean {
    if (this.warm) return true;
    for (const node of this.listeners) {
      if (node.cached !== true) return true;
    }
    return false;
  }

  private syncTimer(): void {
    const needed = !this.paused && (this.listeners.size > 0 || this.warm) &&
      (this.needsLiveCapture() || this.sourceDirty || this.frame === undefined || this.frameBlur !== this.blurStrength());
    if (needed && this.timer < 0) this.timer = setInterval((): void => { this.capture(); }, this.warm ? 100 : 50);
    else if (!needed && this.timer >= 0) { clearInterval(this.timer); this.timer = -1; }
  }

  setRetention(retained: boolean, paused: boolean): void {
    this.retained = retained;
    if (paused && !this.paused) this.generation++;
    this.paused = paused;
    this.releaseIfUnused();
  }

  private releaseIfUnused(): void {
    if (!this.retained && !this.warm && this.listeners.size === 0) this.stop();
    else this.syncTimer();
  }

  refreshCachedBlur(): void {
    if (!this.needsLiveCapture() && this.listeners.size > 0) this.syncTimer();
  }

  invalidateSource(): void {
    this.sourceDirty = true;
    this.revision++;
    if (this.listeners.size > 0 || this.warm) this.syncTimer();
  }

  attach(node: BackdropConsumer, canCapture: (initialFrame?: boolean) => boolean): void {
    this.canCapture = canCapture;
    this.listeners.add(node);
    const sourceNode = this.ui.getFrameNodeById(this.source);
    if (sourceNode !== null) this.discardResizedFrame(this.sourceGeometry(sourceNode));
    if (this.sourceDirty && node.cached !== true) this.discardFrame();
    if (this.frame !== undefined && (node.plain === true || this.frameBlur === this.blurStrength())) {
      node.updateFrame(this.frame);
    } else this.waiting.add(node);
    this.syncTimer();
    if (this.frame === undefined || this.frameBlur !== this.blurStrength()) this.capture();
  }
  setWarm(warm: boolean, canCapture: (initialFrame?: boolean) => boolean): void {
    this.canCapture = canCapture;
    this.warm = warm;
    this.releaseIfUnused();
    if (warm && this.frame === undefined) this.capture();
  }
  detach(node: BackdropConsumer): void {
    this.listeners.delete(node);
    this.waiting.delete(node);
    node.updateFrame(undefined);
    this.releaseIfUnused();
  }
  private stop(): void {
    clearInterval(this.timer); this.timer = -1; this.generation++;
    this.canvases.forEach((canvas: GlassCaptureCanvas): void => { canvas.context.reset(); });
    this.canvases.clear();
    const old = this.frame; this.frame = undefined;
    if (old !== undefined) this.releaseFrame(old);
    const sources = sessions.get(this.windowId);
    sources?.delete(this.source);
    if (sources?.size === 0) sessions.delete(this.windowId);
  }
  private captureCanvas(slot: string, width: number, height: number): OffscreenCanvasRenderingContext2D {
    let canvas: GlassCaptureCanvas | undefined = this.canvases.get(slot);
    if (canvas === undefined || canvas.width !== width || canvas.height !== height) {
      canvas?.context.reset();
      canvas = { width, height, context: new OffscreenCanvasRenderingContext2D(width, height,
        new RenderingContextSettings(true), LengthMetricsUnit.PX) };
      this.canvases.set(slot, canvas);
    }
    canvas.context.reset();
    return canvas.context;
  }
  /**
   * 原生截图固定取完整节点；局部区域由实际像素比例裁切，避免低模糊度下 region/scale 组合引起背景错位。
   * @throws {Error} 截图或几何失败交由会话捕获，绝不发布错误像素。
   */
  private async captureNodePixels(id: string, full: GlassCaptureGeometry, crop: GlassCaptureGeometry, scale: number): Promise<image.PixelMap> {
    const pixels = await this.ui.getComponentSnapshot().get(id, { scale: scale, waitUntilRenderFinished: true });
    const measured = pixels.getImageInfoSync();
    if (Math.abs(measured.size.width * full.height - measured.size.height * full.width) > Math.max(full.width, full.height) * 2) {
      pixels.release(); throw new Error('glass_capture_geometry_changed');
    }
    if (sameGlassCaptureGeometry(full, crop)) return pixels;
    try {
      const info = pixels.getImageInfoSync();
      const sx: number = info.size.width / full.width, sy: number = info.size.height / full.height;
      const width: number = Math.max(1, Math.round(crop.width * sx));
      const height: number = Math.max(1, Math.round(crop.height * sy));
      const canvas = this.captureCanvas('crop', width, height);
      canvas.drawImage(pixels, (crop.left - full.left) * sx, (crop.top - full.top) * sy,
        crop.width * sx, crop.height * sy, 0, 0, width, height);
      return canvas.getPixelMap(0, 0, width, height);
    } finally { pixels.release(); }
  }
  /**
   * 透明正文合成唯一真实背景，返回帧由会话拥有。
   * @throws {Error} 采样或合成失败交由会话捕获并保留上一帧。
   */
  private async capturePixels(source: FrameNode, sample?: GlassCaptureGeometry, requestedScale?: number, ancestors: string[] = []): Promise<image.PixelMap> {
    if (ancestors.includes(this.source)) throw new Error('glass_background_source_cycle');
    const chain: string[] = ancestors.concat(this.source);
    const measured = source.getMeasuredSize();
    const scale: number = requestedScale ?? this.captureScale(measured.width, measured.height);
    const full: GlassCaptureGeometry = this.sourceGeometry(source);
    const crop: GlassCaptureGeometry = sample ?? full;
    const cached: BackdropFrame | undefined = this.frame;
    // 父场景已冻结且清晰度/覆盖范围足够时，复用其完整合成帧，避免子菜单再截根背景。
    if (ancestors.length > 0 && cached !== undefined && !this.sourceDirty && !this.canCapture(false) &&
      cached.scaleX + 0.001 >= scale && cached.scaleY + 0.001 >= scale &&
      cached.left <= crop.left && cached.top <= crop.top &&
      cached.left + cached.width >= crop.left + crop.width && cached.top + cached.height >= crop.top + crop.height) {
      const width: number = Math.max(1, Math.round(crop.width * scale));
      const height: number = Math.max(1, Math.round(crop.height * scale));
      const copy = this.captureCanvas('copy', width, height);
      copy.drawImage(cached.pixels, (crop.left-cached.left)*cached.scaleX, (crop.top-cached.top)*cached.scaleY,
        crop.width*cached.scaleX, crop.height*cached.scaleY, 0, 0, width, height);
      return copy.getPixelMap(0, 0, width, height);
    }
    if (this.backgroundSource === '') {
      return this.captureNodePixels(this.source, full, crop, scale);
    }
    const node = this.ui.getFrameNodeById(this.backgroundSource);
    if (node === null) throw new Error('glass_background_source_unavailable');
    // 页面切换会销毁节点，异步快照返回后只使用请求发出时记录的几何。
    const backgroundSize = node.getMeasuredSize();
    const backgroundPosition = node.getPositionToWindow();
    const backgroundLeft: number = this.ui.vp2px(backgroundPosition.x);
    const backgroundTop: number = this.ui.vp2px(backgroundPosition.y);
    const backgroundRegion: componentSnapshot.SnapshotRegion = { left: Math.max(0, crop.left-backgroundLeft), top: Math.max(0, crop.top-backgroundTop),
      right: Math.min(backgroundSize.width,crop.left-backgroundLeft+crop.width),
      bottom: Math.min(backgroundSize.height,crop.top-backgroundTop+crop.height) };
    const backgroundSession: BackdropSession | undefined = sessions.get(this.windowId)?.get(this.backgroundSource);
    const backgroundCrop: GlassCaptureGeometry = { left: backgroundLeft + backgroundRegion.left, top: backgroundTop + backgroundRegion.top,
      width: backgroundRegion.right - backgroundRegion.left, height: backgroundRegion.bottom - backgroundRegion.top };
    // 二级菜单的父正文仍可能透明，沿已登记的背景链合成到根底色，不能漏掉根背景后再透出遮罩。
    const backgroundPixels: Promise<image.PixelMap> = backgroundSession === undefined ?
      this.captureNodePixels(this.backgroundSource, this.sourceGeometry(node), backgroundCrop, scale) :
      backgroundSession.capturePixels(node, backgroundCrop, scale, chain);
    const frames = await Promise.allSettled([
      this.captureNodePixels(this.source, full, crop, scale),
      backgroundPixels
    ]);
    const foreground = frames[0];
    const background = frames[1];
    try {
      if (foreground.status === 'rejected') throw foreground.reason as Error;
      if (background.status === 'rejected') throw background.reason as Error;
      const info = foreground.value.getImageInfoSync();
      const backgroundInfo = background.value.getImageInfoSync();
      if (Math.abs(info.size.width * crop.height - info.size.height * crop.width) > Math.max(crop.width, crop.height) * 2 ||
        Math.abs(backgroundInfo.size.width * (backgroundRegion.bottom-backgroundRegion.top) - backgroundInfo.size.height * (backgroundRegion.right-backgroundRegion.left)) >
          Math.max(backgroundRegion.right-backgroundRegion.left, backgroundRegion.bottom-backgroundRegion.top) * 2) throw new Error('glass_capture_geometry_changed');
      const scaleX = info.size.width / crop.width;
      const scaleY = info.size.height / crop.height;
      const canvas = this.captureCanvas('composite', info.size.width, info.size.height);
      canvas.drawImage(background.value, (backgroundLeft + backgroundRegion.left - crop.left) * scaleX,
        (backgroundTop + backgroundRegion.top - crop.top) * scaleY,
        (backgroundRegion.right-backgroundRegion.left) * scaleX, (backgroundRegion.bottom-backgroundRegion.top) * scaleY);
      canvas.drawImage(foreground.value, 0, 0, info.size.width, info.size.height);
      return canvas.getPixelMap(0, 0, info.size.width, info.size.height);
    } finally {
      if (foreground.status === 'fulfilled') foreground.value.release();
      if (background.status === 'fulfilled') background.value.release();
    }
  }

  private fusionHolding(): boolean {
    if (this.frame === undefined) return false;
    for (const node of this.listeners) {
      if (node.freezeBackdrop && !this.waiting.has(node)) return true;
    }
    return false;
  }
  /** 冻结菜单只重做缓存帧磨砂，不重新截图采入弹层自身。 */
  private async refreshBlur(): Promise<void> {
    const frame: BackdropFrame | undefined = this.frame;
    if (frame === undefined || this.busy || this.frameBlur === this.blurStrength() || this.fusionHolding()) return;
    this.busy = true;
    const strength: number = this.blurStrength();
    const generation: number = this.generation;
    try {
      const frosted = strength === 0 ? frame.pixels : await effectKit.createEffect(frame.pixels)
        .blur(this.ui.vp2px(5.5) * frame.scaleX * strength, effectKit.TileMode.CLAMP).getEffectPixelMap(true);
      if (generation !== this.generation || this.frame !== frame || strength !== this.blurStrength()) {
        if (frosted !== frame.pixels) frosted.release();
        return;
      }
      const previous = frame.frosted;
      frame.frosted = frosted; this.frameBlur = strength;
      this.waiting.clear();
      this.listeners.forEach((node: BackdropConsumer): void => { node.updateFrame(frame); });
      if (previous !== frame.pixels) setTimeout((): void => { previous.release(); }, 100);
    } catch (error) {
      hilog.warn(0x4342, 'GlassBackdrop', 'Backdrop blur refresh failed: %{public}s', String(error));
    } finally {
      this.busy = false;
      if (!this.needsLiveCapture()) this.syncTimer();
    }
  }
  private sourceGeometry(source: FrameNode): GlassCaptureGeometry {
    const size = source.getMeasuredSize();
    const position = source.getPositionToWindow();
    return { left: this.ui.vp2px(position.x), top: this.ui.vp2px(position.y),
      width: size.width, height: size.height };
  }
  private discardResizedFrame(geometry: GlassCaptureGeometry): void {
    if (geometry.width <= 0 || geometry.height <= 0) return;
    const old: BackdropFrame | undefined = this.frame;
    if (old === undefined) return;
    const requiredScale: number = this.captureScale(geometry.width, geometry.height);
    const sample: GlassCaptureGeometry = this.captureGeometry(geometry);
    if (sameGlassCaptureGeometry(old.sourceGeometry ?? old, geometry) && old.scaleX + 0.001 >= requiredScale &&
      old.left <= sample.left && old.top <= sample.top && old.left + old.width >= sample.left + sample.width &&
      old.top + old.height >= sample.top + sample.height) return;
    this.discardFrame();
  }
  private discardFrame(): void {
    const old: BackdropFrame | undefined = this.frame;
    if (old === undefined) return;
    this.frame = undefined;
    this.generation++;
    this.sourceDirty = true;
    this.listeners.forEach((node: BackdropConsumer): void => { node.updateFrame(undefined); });
    setTimeout((): void => { this.releaseFrame(old); }, 100);
  }
  private async capture(): Promise<void> {
    if (this.paused) return;
    const source = this.ui.getFrameNodeById(this.source);
    if (source === null) return;
    const geometry: GlassCaptureGeometry = this.sourceGeometry(source);
    if (geometry.width <= 0 || geometry.height <= 0) return;
    // 冻结只针对同一几何，旋转后先失效旧帧，再按首次采样许可取新帧。
    this.discardResizedFrame(geometry);
    if (this.frame !== undefined && this.frameBlur !== this.blurStrength()) { await this.refreshBlur(); return; }
    if (this.frame !== undefined && !this.sourceDirty && !this.needsLiveCapture()) { this.syncTimer(); return; }
    if (this.fusionHolding() || !this.canCapture(this.frame === undefined) || this.busy || (this.listeners.size === 0 && !this.warm)) return;
    this.busy = true;
    const generation = this.generation;
    const revision = this.revision;
    try {
      const sample: GlassCaptureGeometry = this.captureGeometry(geometry);
      const size: image.Size = { width: sample.width, height: sample.height };
      const captureStarted: number = Date.now();
      const pixels = await this.capturePixels(source, sample);
      if (generation !== this.generation || revision !== this.revision || !sameGlassCaptureGeometry(geometry, this.sourceGeometry(source)) || this.fusionHolding() || !this.canCapture(this.frame === undefined) || (this.listeners.size === 0 && !this.warm)) { await pixels.release(); return; }
      const info = pixels.getImageInfoSync();
      if (Math.abs(info.size.width * size.height - info.size.height * size.width) > Math.max(size.width, size.height) * 2) {
        await pixels.release();
        return;
      }
      const snapshotMs: number = Date.now() - captureStarted;
      const strength: number = this.blurStrength();
      const frosted = strength === 0 ? pixels : await effectKit.createEffect(pixels)
        .blur(this.ui.vp2px(5.5) * info.size.width / size.width * strength, effectKit.TileMode.CLAMP).getEffectPixelMap(true);
      if (generation !== this.generation || revision !== this.revision || !sameGlassCaptureGeometry(geometry, this.sourceGeometry(source)) ||
        this.fusionHolding() || !this.canCapture(this.frame === undefined) ||
        (this.listeners.size === 0 && !this.warm) || strength !== this.blurStrength()) {
        if (frosted !== pixels) await frosted.release();
        await pixels.release();
        return;
      }
      if (!this.captured || this.retained || this.frame === undefined || this.frame.scaleX !== info.size.width / size.width) {
        this.captured = true;
        hilog.info(0x4342, 'GlassBackdrop', 'Backdrop ready %{public}s %{public}dx%{public}d snapshot=%{public}dms blur=%{public}dms',
          this.source, info.size.width, info.size.height, snapshotMs, Date.now() - captureStarted - snapshotMs);
      }
      const old = this.frame;
      this.frameBlur = strength;
      this.frame = { pixels, frosted, left: sample.left, top: sample.top, width: size.width, height: size.height, sourceGeometry: geometry,
        scaleX: info.size.width / size.width, scaleY: info.size.height / size.height };
      this.sourceDirty = revision !== this.revision;
      this.waiting.clear();
      this.listeners.forEach((node: BackdropConsumer): void => { node.updateFrame(this.frame); });
      // 绘制命令可能仍引用上一帧纹理，延后一帧释放。
      if (old !== undefined) setTimeout((): void => { this.releaseFrame(old); }, 100);
    } catch (error) {
      if (!this.warned) {
        this.warned = true;
        hilog.warn(0x4342, 'GlassBackdrop', 'Backdrop capture unavailable: %{public}s', String(error));
      }
    } finally {
      this.busy = false;
      if (!this.needsLiveCapture()) this.syncTimer();
    }
  }
}

const sessions: Map<number, Map<string, BackdropSession>> = new Map<number, Map<string, BackdropSession>>();
function refreshCachedGlassBlur(): void {
  for (const sources of sessions.values()) {
    for (const source of sources.values()) source.refreshCachedBlur();
  }
}
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
  tint: string = '';
  private tintColor: string = '';
  private tintFilter: drawing.ColorFilter | null = null;
  private materialInterior: drawing.Path | undefined = undefined;
  private materialInteriorKey: string = '';
  private clipMaterialInterior(canvas: drawing.Canvas): void {
    const width: number = this.frame.width, height: number = this.frame.height;
    // 常驻按钮只重放1vp外沿，避免44vp按钮内形成可见的第二圈。
    const inset: number = Math.min(this.density, width / 4, height / 4);
    const key: string = width + ',' + height + ',' + this.radius + ',' + this.density + ',' + this.meshOutline;
    if (this.materialInterior === undefined || key !== this.materialInteriorKey) {
      this.materialInteriorKey = key;
      this.materialInterior = new drawing.Path();
      if (this.meshOutline !== '') {
        // 当前常驻异形为贴边半圆，中心在屏幕一侧的直径上。
        const right: boolean = this.meshOutline.startsWith('M ' + width + ' ');
        this.materialInterior.addCircle(right ? width : 0, height / 2, height / 2 - inset);
      } else {
        const radius: number = Math.max(0, this.radius - inset);
        this.materialInterior.addRoundRect(new drawing.RoundRect({
          left: inset, top: inset, right: width - inset, bottom: height - inset }, radius, radius));
      }
    }
    canvas.clipPath(this.materialInterior, drawing.ClipOp.DIFFERENCE, true);
  }
  private mesh: GlassMesh = { positions: [], texture: [], indices: [] };
  private texs: common2D.Point[] = [];
  private geometryRevision: number = 0;
  private textureRevision: number = -1;
  private textureLeft: number = Number.NaN;
  private textureTop: number = Number.NaN;
  private textureScaleX: number = Number.NaN;
  private textureScaleY: number = Number.NaN;
  private failed: boolean = false;
  private drawn: boolean = false;
  private missedSample: boolean = false;
  private terminalClip: GlassFusionRect | undefined = undefined;
  private fusionEdge: common2D.Point[] = [];
  private fusionWidth: number = -1;
  private fusionHeight: number = -1;
  private contourStrokeWidth: number = 0;
  private contourStrokeColor: string = '#00000000';
  private outlinePen: drawing.Pen | undefined = undefined;
  private specular: boolean = false;
  private specularPath: drawing.Path | undefined = undefined;
  private specularDirty: boolean = true;
  private specularPen: drawing.Pen | undefined = undefined;
  private specularWidth: number = -1;
  private specularHeight: number = -1;
  private specularDensity: number = -1;
  private foregroundButton: GlassFusionRect | undefined = undefined;
  private buttonDensity: number = 1;
  private drawTotalMs: number = 0;
  private drawPeakMs: number = 0;
  private drawFrames: number = 0;
  private verticesDrawMs: number = 0;
  drawMetrics(): string {
    return (this.drawTotalMs/Math.max(1,this.drawFrames)).toFixed(2)+','+this.drawPeakMs;
  }
  vertexDrawMean(): string {
    return (this.verticesDrawMs / Math.max(1, this.drawFrames)).toFixed(2);
  }
  private imageBrush: drawing.Brush | undefined = undefined;
  private brushPixels: image.PixelMap | undefined = undefined;
  configureFusion(width: number, height: number, left: number, top: number, mesh: GlassFusionMesh, _dark: boolean, density: number = 1, foregroundButton: GlassFusionRect | undefined = undefined, contourStrokeWidth: number = 0, contourStrokeColor: string = '#00000000', specular: boolean = false): void {
    this.lengthMetricsUnit=LengthMetricsUnit.PX;
    this.specular = specular; this.specularDirty = true; this.geometryRevision++;
    this.foregroundButton = foregroundButton; this.buttonDensity = density; this.terminalClip = mesh.clipRect;
    this.contourStrokeWidth = contourStrokeWidth;
    this.contourStrokeColor = contourStrokeColor;
    this.density=density;this.originX=left;this.originY=top;this.mesh=mesh;this.fusionEdge=mesh.edge;
    if(width!==this.fusionWidth||height!==this.fusionHeight) {
      this.fusionWidth=width;this.fusionHeight=height;this.frame={x:0,y:0,width,height};
    }
    this.invalidate();
  }
  get captureRegion(): GlassCaptureGeometry {
    return { left: this.originX, top: this.originY, width: this.frame.width, height: this.frame.height };
  }
  ready: () => void = (): void => {};
  plain: boolean = false;
  cached: boolean = false;
  freezeBackdrop: boolean = false;
  private radius: number = 0;
  private density: number = 1;
  private meshWidth: number = -1;
  private meshHeight: number = -1;
  private meshRadius: number = -1;
  private meshDensity: number = -1;
  private meshOutline: string = '';
  private meshPlain: boolean = false;
  private originX: number = 0;
  private originY: number = 0;
  configure(width: number, height: number, left: number, top: number, radius: number, density: number, outline: string, specular: boolean = false): void {
    // 原生胶囊按实际短边限制圆角，反光与裁切必须使用同一物理半径。
    const boundedRadius: number = Math.max(0, Math.min(radius, width / 2, height / 2));
    this.specular = specular;
    this.lengthMetricsUnit = LengthMetricsUnit.PX;
    this.foregroundButton = undefined;
    this.density = density;
    this.radius = boundedRadius;
    // 位移和重复布局不改变光学网格；只有轮廓/尺寸变化才重算。
    if (width !== this.meshWidth || height !== this.meshHeight || boundedRadius !== this.meshRadius ||
      density !== this.meshDensity || outline !== this.meshOutline || this.plain !== this.meshPlain) {
      this.geometryRevision++;
      this.meshWidth = width; this.meshHeight = height; this.meshRadius = boundedRadius;
      this.meshDensity = density; this.meshOutline = outline; this.meshPlain = this.plain;
      this.specularDirty = true;
      if (width <= 0 || height <= 0) this.mesh = { positions: [], texture: [], indices: [] };
      else if (this.plain) {
        const points: common2D.Point[] = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: 0, y: height }, { x: width, y: height }];
        this.mesh = { positions: points, texture: points, indices: [0, 1, 2, 1, 3, 2] };
      } else this.mesh = glassMesh(width, height, boundedRadius, density, glassContour(outline));
    }
    if (this.originX !== left || this.originY !== top) this.geometryRevision++;
    this.originX = left; this.originY = top;
    this.frame = { x: 0, y: 0, width, height };
    this.invalidate();
  }
  private drawSpecular(context: DrawContext): void {
    if (!this.specular || this.plain || this.frame.width <= 0 || this.frame.height <= 0) return;
    const width: number = this.frame.width, height: number = this.frame.height;
    if (this.specularPen === undefined || width !== this.specularWidth ||
      height !== this.specularHeight || this.density !== this.specularDensity) {
      this.specularWidth = width; this.specularHeight = height; this.specularDensity = this.density;
      this.specularPen = new drawing.Pen();
      this.specularPen.setAntiAlias(true);
      this.specularPen.setStrokeWidth(0.85 * this.density);
      // 斜向光照只落在真实轮廓上，亮部与弱反光之间保持透射。
      this.specularPen.setShaderEffect(drawing.ShaderEffect.createLinearGradient(
        { x: 0, y: 0 }, { x: width, y: height },
        [0xB8FFFFFF, 0x12FFFFFF, 0x04FFFFFF, 0x70FFFFFF], drawing.TileMode.CLAMP, [0, 0.35, 0.65, 1]));
    }
    if (this.specularPath === undefined || this.specularDirty) {
      if (this.specularPath === undefined) this.specularPath = new drawing.Path();
      else this.specularPath.reset();
      this.specularDirty = false;
      const clip: GlassFusionRect | undefined = this.terminalClip;
      if (clip !== undefined) {
        const inset: number = 0.425 * this.density;
        const radius: number = Math.max(0, clip.radius - inset);
        this.specularPath.addRoundRect(new drawing.RoundRect({
          left: clip.x + inset, top: clip.y + inset,
          right: clip.x + clip.width - inset, bottom: clip.y + clip.height - inset }, radius, radius));
      } else if (this.fusionEdge.length > 0) {
        for (let i: number = 0; i + 1 < this.fusionEdge.length; i += 2) {
          this.specularPath.moveTo(this.fusionEdge[i].x, this.fusionEdge[i].y);
          this.specularPath.lineTo(this.fusionEdge[i + 1].x, this.fusionEdge[i + 1].y);
        }
      } else if (this.meshOutline !== '') this.specularPath.buildFromSvgString(this.meshOutline);
      else {
        const inset: number = 0.425 * this.density;
        const radius: number = Math.max(0, this.radius - inset);
        this.specularPath.addRoundRect(new drawing.RoundRect({
          left: inset, top: inset, right: width - inset, bottom: height - inset }, radius, radius));
      }
    }
    context.canvas.attachPen(this.specularPen);
    context.canvas.drawPath(this.specularPath);
    context.canvas.detachPen();
  }

  updateFrame(frame: BackdropFrame | undefined): void {
    this.backdrop = frame;
    if (frame === undefined) { this.imageBrush=undefined;this.brushPixels=undefined; }
    this.invalidate();
  }
  draw(context: DrawContext): void {
    const frame = this.backdrop;
    if (this.cached && frame === undefined) { this.drawSpecular(context); return; }
    if (frame === undefined || this.mesh.positions.length === 0 || this.failed || !deviceInfo.apiAvailable(23)) return;
    const sample: common2D.Rect = { left: frame.left - this.originX, top: frame.top - this.originY,
      right: frame.left + frame.width - this.originX, bottom: frame.top + frame.height - this.originY };
    if (sample.left >= this.frame.width || sample.top >= this.frame.height || sample.right <= 0 || sample.bottom <= 0) {
      if (!this.missedSample) {
        this.missedSample = true;
        hilog.warn(0x4342, 'GlassBackdrop', 'Glass draw skipped: panel and sampled frame do not overlap');
      }
      return;
    }
    const drawStarted: number = Date.now();
    if (this.cached) {
      context.canvas.save();
      this.clipMaterialInterior(context.canvas);
    }
    const clipToSample: boolean = sample.left > 0 || sample.top > 0 ||
      sample.right + 1 < this.frame.width || sample.bottom + 1 < this.frame.height;
    // 融合画布带有边距，部分越界时只裁掉没有真实像素的区域。
    if (clipToSample) {
      context.canvas.save();
      context.canvas.clipRect(sample, drawing.ClipOp.INTERSECT);
    }
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
    if (this.textureRevision !== this.geometryRevision || frame.left !== this.textureLeft ||
      frame.top !== this.textureTop || frame.scaleX !== this.textureScaleX || frame.scaleY !== this.textureScaleY) {
      const texture: common2D.Point[] = this.plain ? this.mesh.positions : this.mesh.texture;
      for (let i: number = 0; i < texture.length; i++) {
        let point: common2D.Point = this.texs[i];
        if (point === undefined) { point = { x: 0, y: 0 }; this.texs.push(point); }
        point.x = (this.originX - frame.left + texture[i].x) * frame.scaleX;
        point.y = (this.originY - frame.top + texture[i].y) * frame.scaleY;
      }
      this.texs.length = texture.length;
      this.textureRevision = this.geometryRevision;
      this.textureLeft = frame.left; this.textureTop = frame.top;
      this.textureScaleX = frame.scaleX; this.textureScaleY = frame.scaleY;
    }
    try {
    // 弹出面板绘制完整纹理；常驻表面只在已裁切的窄边缘叠加缓存折射。
    const pixels: image.PixelMap=this.plain ? frame.pixels : frame.frosted;
    if (this.imageBrush === undefined || this.brushPixels !== pixels) {
      this.imageBrush=new drawing.Brush();this.imageBrush.setAntiAlias(true);
      this.imageBrush.setAlpha(this.cached ? 40 : 255);
      this.imageBrush.setShaderEffect(drawing.ShaderEffect.createImageShader(pixels, drawing.TileMode.CLAMP,
        drawing.TileMode.CLAMP, new drawing.SamplingOptions(drawing.FilterMode.FILTER_MODE_LINEAR)));
      this.brushPixels=pixels;
      if (!this.cached && this.tintFilter !== null) this.imageBrush.setColorFilter(this.tintFilter);
    }
    // 底色合并到同一次纹理绘制；只在偏好变化时创建滤色器，不增加绘制或采样。
    if (!this.cached && this.tintColor !== this.tint) {
      this.tintColor = this.tint;
      this.tintFilter = this.tint === '' || Number.parseInt(this.tint.slice(1, 3), 16) === 0 ? null :
        drawing.ColorFilter.createBlendModeColorFilter(Number.parseInt(this.tint.slice(1), 16), drawing.BlendMode.SRC_OVER);
      this.imageBrush.setColorFilter(this.tintFilter);
    }
    const brush: drawing.Brush=this.imageBrush;
    context.canvas.attachBrush(brush);
    const verticesStarted: number = Date.now();
    context.canvas.drawVertices(drawing.VertexMode.TRIANGLES_VERTEXMODE, this.mesh.positions.length,
      this.mesh.positions, this.texs, null, this.mesh.indices.length, this.mesh.indices, this.cached ? drawing.BlendMode.SRC_OVER : drawing.BlendMode.SRC);
    this.verticesDrawMs += Date.now() - verticesStarted;
    context.canvas.detachBrush();
    if (this.contourStrokeWidth > 0 && this.fusionEdge.length >= 2) {
      if (this.outlinePen === undefined) this.outlinePen = new drawing.Pen();
      this.outlinePen.setAntiAlias(true);
      this.outlinePen.setStrokeWidth(this.contourStrokeWidth);
      this.outlinePen.setColor(Number.parseInt(this.contourStrokeColor.slice(1), 16));
      context.canvas.attachPen(this.outlinePen);
      if (clip !== undefined) {
        const inset: number = this.contourStrokeWidth / 2, radius: number = Math.max(0, clip.radius - inset);
        context.canvas.drawRoundRect(new drawing.RoundRect({left:clip.x+inset,top:clip.y+inset,
          right:clip.x+clip.width-inset,bottom:clip.y+clip.height-inset},radius,radius));
      } else {
        const outline: drawing.Path = new drawing.Path();
        // edge 是成对的真实边界线段。
        for (let index: number = 0; index + 1 < this.fusionEdge.length; index += 2) {
          outline.moveTo(this.fusionEdge[index].x, this.fusionEdge[index].y);
          outline.lineTo(this.fusionEdge[index + 1].x, this.fusionEdge[index + 1].y);
        }
        context.canvas.drawPath(outline);
      }
      context.canvas.detachPen();
    }
    this.drawSpecular(context);
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
    if (clipToSample) context.canvas.restore();
    if (this.cached) context.canvas.restore();
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
  @Prop @Watch('updateGeometry') tint: string = '';
  @Prop source: string = '';
  @Prop backgroundSource: string = '';
  private measuredRegion: SharedGlassRegion = { left: 0, top: 0, width: 0, height: 0 };
  private controller: GlassController = new GlassController();
  private owner: BackdropSession | undefined = undefined;
  private visible: boolean = false;
  private mounted: boolean = false;
  onReady: () => void = (): void => {};
  private syncPlayback(): void {
    if (deviceInfo.apiAvailable(23) && this.visible && this.active && this.source !== '') {
      if (this.owner === undefined) {
        this.owner = session(this.getUIContext(), this.source, this.backgroundSource);
        this.owner.attach(this.controller.glass, this.captureAllowed);
      }
    } else {
      this.owner?.detach(this.controller.glass); this.owner = undefined;
    }
  }
  private measureBackground(area: Area): void {
    if (this.role !== 'material') { this.updateGeometry(); return; }
    // 布局回调直接更新绘制节点，避免 region 经两层状态传递后才挂载缓存纹理。
    this.measuredRegion = { width: Number(area.width), height: Number(area.height),
      left: Number(area.globalPosition.x), top: Number(area.globalPosition.y) };
    this.updateGeometry();
  }
  private updateGeometry(): void {
    const region = this.role === 'material' ? this.measuredRegion : this.region;
    const ui = this.getUIContext();
    this.controller.glass.plain = this.role === 'background';
    this.controller.glass.cached = this.role === 'material';
    this.controller.glass.tint = this.tint;
    // 常驻控件的原生外框拥有高光；不在背景层重复描边，避免宽度变化后留下拉伸光圈。
    this.controller.glass.configure(ui.vp2px(region.width), ui.vp2px(region.height),
      ui.vp2px(region.left), ui.vp2px(region.top), ui.vp2px(this.radius), ui.vp2px(1), this.contourPath, this.role !== 'material');
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
      .onAreaChange((_old: Area, area: Area): void => { this.measureBackground(area); })
    }.width(this.role === 'material' ? '100%' : this.region.width).height(this.role === 'material' ? '100%' : this.region.height).borderRadius(this.radius).clip(true)
      .hitTestBehavior(HitTestMode.None).accessibilityLevel('no')
  }
}

export interface SharedGlassRegion { left: number; top: number; width: number; height: number; }

/** 根背景挂载期间保留最近一帧；页面转场暂停采样并拒绝在途结果。 */
export function setSharedGlassSourceRetention(ui: UIContext, source: string, retained: boolean, paused: boolean = false): void {
  if (deviceInfo.apiAvailable(23)) {
    const owner = retained ? session(ui, source) : sessions.get(ui.getWindowId() ?? -1)?.get(source);
    owner?.setRetention(retained, paused);
  }
}

export function invalidateSharedGlassSource(ui: UIContext, source: string): void {
  if (deviceInfo.apiAvailable(23)) sessions.get(ui.getWindowId() ?? -1)?.get(source)?.invalidateSource();
}

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
  @Prop @Watch('geometryChanged') tint: string = '';
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
  onProgress: (progress: number) => void = (_progress: number): void => {};
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
  private tessellatorWidth: number = 0;
  private tessellatorHeight: number = 0;
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
    if (this.gpu === undefined && (this.tessellator === undefined ||
      this.tessellatorWidth !== this.region.width || this.tessellatorHeight !== this.region.height)) {
      this.tessellatorWidth = this.region.width; this.tessellatorHeight = this.region.height;
      this.tessellator = new GlassFusionTessellator(this.region.width * d, this.region.height * d, d, this.meshBudget);
    }
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
    this.controller.glass.tint = this.tint;
    const start: number=Date.now();
    const mesh: GlassFusionMesh=this.tessellator.update(this.localGeometry,this.progress);
    const elapsed: number=Date.now()-start;
    this.cpuSamples.push(elapsed);
    this.frames++;this.totalMs+=elapsed;this.peakMs=Math.max(this.peakMs,elapsed);
    this.controller.glass.configureFusion(this.region.width*this.density,this.region.height*this.density,
      this.region.left*this.density,this.region.top*this.density,mesh,this.dark,this.density, this.replayTrigger && this.progress < 1 ? this.localGeometry.source : undefined, this.contourStrokeWidth * this.density, this.contourStrokeColor, true);
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
    if (this.gpu === undefined) {
      hilog.info(0x4342, 'GlassFusion', 'Native vertex draw mean=%{public}sms', this.controller.glass.vertexDrawMean());
    }
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
    const eased: number = glassFusionTiming(t, this.expanded);
    const target: number = this.expanded ? 1 : 0;
    const nextProgress: number = this.from + (target - this.from) * eased;
    // 起始几何已经在纹理就绪前提交，首个帧回调仅建立时间基准。
    if (nextProgress !== this.progress) {
      this.progress = nextProgress;
      this.render();
    }
    this.onProgress(this.progress);
    if(t>=1) { this.complete('finished');return; }
    this.queue();
  }
  private playbackChanged(): void {
    if(!this.mounted) return;
    this.started=-1;this.lastFrame=-1;this.from=this.progress;this.completed=false;
    this.phaseDurationMs=Math.max(60,Math.max(100,Math.min(500,this.durationMs))*(this.expanded ? 1 : 0.72)*Math.abs((this.expanded?1:0)-this.from));
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
