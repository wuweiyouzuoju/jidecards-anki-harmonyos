// SPDX-License-Identifier: AGPL-3.0-or-later
import { FrameNode, NodeContent, UIContext } from '@kit.ArkUI';
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
