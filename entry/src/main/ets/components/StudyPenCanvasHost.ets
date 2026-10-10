// SPDX-License-Identifier: AGPL-3.0-or-later
import { FrameNode, NodeContent, UIContext } from '@kit.ArkUI';
import { image } from '@kit.ImageKit';
import { deviceInfo } from '@kit.BasicServicesKit';
import { StudyPenCanvasParameters } from './StudyPenCanvasParameters';
import { StudyPenCanvasFactory, StudyPenCanvasMount } from './StudyPenCanvasMount';
import { isStudyPenKitAvailable } from '../backend/StudyPenKitAvailability';
import { setStudyPenKitContext } from '../backend/StudyPenKitContext';

export type StudyPenCanvasLoader = () => Promise<StudyPenCanvasFactory>;

async function loadStudyPenCanvas(): Promise<StudyPenCanvasFactory> {
  if (!isStudyPenKitAvailable()) throw new Error('Huawei handwriting module is unavailable');
  // 此模块只能由已通过能力检查的白板加载；静态导入会在首页启动时解析系统 HSP。
  const canvasModule: ESObject = await import('./StudyPenCanvas');
  return canvasModule.createStudyPenCanvas as StudyPenCanvasFactory;
}

/** 一个宿主拥有一次画布加载与节点生命周期，隐藏不会释放，换题或退出才释放。 */
export class StudyPenCanvasHost {
  private content: NodeContent = new NodeContent();
  private frame: FrameNode | null = null;
  private mount: StudyPenCanvasMount | null = null;
  private viewportWidth: number = 0;
  private viewportHeight: number = 0;
  private isLoading: boolean = false;
  private isDisposed: boolean = false;
  private parameters: StudyPenCanvasParameters;
  private onFailure: (generation: number, reason: string) => void;
  private loader: StudyPenCanvasLoader;

  constructor(parameters: StudyPenCanvasParameters, onFailure: (generation: number, reason: string) => void,
    loader: StudyPenCanvasLoader = loadStudyPenCanvas) {
    this.parameters = parameters;
    this.onFailure = onFailure;
    this.loader = loader;
  }

  getContent(): NodeContent {
    return this.content;
  }

  /** 只读公开节点的控件热区，不猜套件内部ID，也不修改其按钮或识别器。 */
  isControlTouch(context: UIContext, event: TouchEvent, scale: number): boolean {
    if (this.isDisposed || this.frame === null || event.changedTouches.length === 0) return false;
    return event.changedTouches.every((touch: TouchObject): boolean =>
      Number.isFinite(touch.windowX) && Number.isFinite(touch.windowY) &&
      this.isControlPoint(this.frame!, context, touch.windowX, touch.windowY, scale));
  }

  private isControlPoint(node: FrameNode, context: UIContext, x: number, y: number, scale: number): boolean {
    if (node.getUniqueId() <= 0 || !node.isAttached() || !node.isVisible()) return false;
    const type: string = node.getNodeType();
    // 原生绘制面和长画布不是工具控件；禁止手指从这些节点落墨或触发套件滚动。
    if (type === 'Canvas' || type === 'XComponent') return false;
    for (let index: number = node.getChildrenCount() - 1; index >= 0; index--) {
      const child: FrameNode | null = node.getChild(index);
      if (child !== null && this.isControlPoint(child, context, x, y, scale)) return true;
    }
    const click = node.getInteractionEventBindingInfo(EventQueryType.ON_CLICK);
    const clickable: boolean = click !== undefined && (click.baseEventRegistered || click.nodeEventRegistered ||
      click.nativeEventRegistered || click.builtInEventRegistered);
    if (type !== 'Slider' && !clickable) return false;
    if (type !== 'Button' && this.containsDrawingSurface(node)) return false;
    const size = node.getMeasuredSize();
    const width: number = context.px2vp(size.width);
    const height: number = context.px2vp(size.height);
    if (deviceInfo.sdkApiVersion >= 23) {
      try {
        const position = node.convertPositionFromWindow({ x: x, y: y });
        return position.x >= 0 && position.y >= 0 && position.x < width && position.y < height;
      } catch (error) {
        console.warn(`Study Pen Kit tool position is unavailable: ${error}`);
        return false;
      }
    }
    const origin = node.getPositionToWindowWithTransform();
    return x >= origin.x && y >= origin.y && x < origin.x + width * scale && y < origin.y + height * scale;
  }

  private containsDrawingSurface(node: FrameNode): boolean {
    const type: string = node.getNodeType();
    if (type === 'Canvas' || type === 'XComponent') return true;
    for (let index: number = 0; index < node.getChildrenCount(); index++) {
      const child: FrameNode | null = node.getChild(index);
      if (child !== null && child.getUniqueId() > 0 && this.containsDrawingSurface(child)) return true;
    }
    return false;
  }

  /** @throws {Error} 制卡编辑器在保存边界处理错误并保留草稿。 */
  async save(path: string): Promise<void> {
    if (this.isDisposed || this.mount === null) throw new Error('Handwriting canvas is not ready');
    await this.mount.save(path);
  }

  /** @throws {Error} 编辑器显示加载失败。 */
  async loadDocument(path: string): Promise<void> {
    if (this.isDisposed || this.mount === null) throw new Error('Handwriting canvas is not ready');
    await this.mount.load(path);
  }

  /** @throws {Error} 编辑器显示缩略图生成失败。 */
  async thumbnail(aspect: number): Promise<image.PixelMap> {
    if (this.isDisposed || this.mount === null) throw new Error('Handwriting canvas is not ready');
    return this.mount.thumbnail(aspect);
  }

  setViewport(context: UIContext, width: number, height: number): void {
    if (this.isDisposed) return;
    this.viewportWidth = Number.isFinite(width) && width > 0 ? width : 0;
    this.viewportHeight = Number.isFinite(height) && height > 0 ? height : 0;
    if (this.viewportWidth === 0 || this.viewportHeight === 0) {
      return;
    }
    if (this.mount !== null) {
      context.runScopedTask((): void => {
        try {
          this.mount?.resize(this.viewportWidth, this.viewportHeight);
        } catch (error) {
          console.error(`Study Pen Kit canvas resize failed: ${error}`);
          this.dispose();
          this.onFailure(this.parameters.generation, 'initialization_failed');
        }
      });
      return;
    }
    if (!this.isLoading) {
      this.isLoading = true;
      this.load(context);
    }
  }

  private async load(context: UIContext): Promise<void> {
    let failureReason: string = 'context_missing';
    try {
      const hostContext = context.getHostContext();
      if (hostContext === undefined || hostContext.resourceManager === undefined) {
        throw new Error('Study Pen Kit requires a host context with a resource manager');
      }
      setStudyPenKitContext(hostContext);
      failureReason = 'load_failed';
      const factory: StudyPenCanvasFactory = await this.loader();
      if (this.isDisposed) return;
      if (this.viewportWidth === 0 || this.viewportHeight === 0) {
        this.isLoading = false;
        return;
      }
      failureReason = 'initialization_failed';
      let initializationError: string = '';
      context.runScopedTask((): void => {
        // 在原生回调内部接住错误，不能依赖异常穿过 ArkUI 再交给外层 catch。
        try {
          setStudyPenKitContext(hostContext);
          const mount: StudyPenCanvasMount = factory(context, this.parameters, this.viewportWidth, this.viewportHeight);
          if (this.isDisposed) mount.dispose();
          else {
            this.mount = mount;
            const frame: FrameNode | null = mount.getFrameNode();
            if (frame === null) throw new Error('Study Pen Kit did not create a canvas node');
            // 直接把根节点交给已在页面中的 ContentSlot，不依赖容器重建回调。
            this.content.addFrameNode(frame);
            this.frame = frame;
          }
        } catch (error) {
          initializationError = `Study Pen Kit initialization failed: ${error}`;
        }
      });
      if (this.isDisposed) return;
      if (initializationError !== '') throw new Error(initializationError);
      if (this.mount === null || this.mount.getFrameNode() === null) {
        throw new Error('Study Pen Kit did not create a canvas node');
      }
    } catch (error) {
      if (this.isDisposed) return;
      console.error(`Study Pen Kit loading/build failed: ${error}`);
      this.dispose();
      this.onFailure(this.parameters.generation, failureReason);
    }
  }

  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    if (this.frame !== null) {
      try {
        this.content.removeFrameNode(this.frame);
      } catch (error) {
        console.error(`Study Pen Kit canvas detach failed: ${error}`);
      }
      this.frame = null;
    }
    this.mount?.dispose();
    this.mount = null;
  }
}
