// SPDX-License-Identifier: AGPL-3.0-or-later
import { BuilderNode, FrameNode, NodeController, UIContext } from '@kit.ArkUI';
import { StudyPenCanvasParameters } from './StudyPenCanvasParameters';
import { isStudyPenKitAvailable } from '../backend/StudyPenKitAvailability';

export type StudyPenCanvasLoader = () => Promise<WrappedBuilder<[StudyPenCanvasParameters]>>;

async function loadStudyPenCanvas(): Promise<WrappedBuilder<[StudyPenCanvasParameters]>> {
  if (!isStudyPenKitAvailable()) throw new Error('Huawei handwriting module is unavailable');
  // 此模块只能由已通过能力检查的白板加载；静态导入会在首页启动时解析系统 HSP。
  const canvasModule: ESObject = await import('./StudyPenCanvas');
  return canvasModule.studyPenCanvasBuilder as WrappedBuilder<[StudyPenCanvasParameters]>;
}

/** 一个宿主拥有一次画布加载与节点生命周期，隐藏不会释放，换题或退出才释放。 */
export class StudyPenCanvasHost extends NodeController {
  private node: BuilderNode<[StudyPenCanvasParameters]> | null = null;
  private isLoading: boolean = false;
  private isDisposed: boolean = false;
  private parameters: StudyPenCanvasParameters;
  private onFailure: (generation: number) => void;
  private loader: StudyPenCanvasLoader;

  constructor(parameters: StudyPenCanvasParameters, onFailure: (generation: number) => void,
    loader: StudyPenCanvasLoader = loadStudyPenCanvas) {
    super();
    this.parameters = parameters;
    this.onFailure = onFailure;
    this.loader = loader;
  }

  makeNode(context: UIContext): FrameNode | null {
    if (this.isDisposed) return null;
    if (!this.isLoading) {
      this.isLoading = true;
      this.load(context);
    }
    return this.node?.getFrameNode() ?? null;
  }

  private async load(context: UIContext): Promise<void> {
    try {
      const builder: WrappedBuilder<[StudyPenCanvasParameters]> = await this.loader();
      if (this.isDisposed) return;
      this.node = new BuilderNode<[StudyPenCanvasParameters]>(context);
      this.node.build(builder, this.parameters);
      this.rebuild();
    } catch (error) {
      if (this.isDisposed) return;
      this.dispose();
      this.onFailure(this.parameters.generation);
    }
  }

  aboutToDisappear(): void {
    this.dispose();
  }

  dispose(): void {
    this.isDisposed = true;
    this.node?.dispose();
    this.node = null;
  }
}
