// SPDX-License-Identifier: AGPL-3.0-or-later
import { HandwriteComponent, HandwriteController, PenType } from '@kit.Penkit';
import { BuilderNode, FrameNode, UIContext } from '@kit.ArkUI';
import { deviceInfo } from '@kit.BasicServicesKit';
import { StudyPenCanvasParameters } from './StudyPenCanvasParameters';
import { StudyPenCanvasMount } from './StudyPenCanvasMount';

interface StudyPenCanvasArguments extends StudyPenCanvasParameters {
  controller: HandwriteController;
  viewportWidth: number;
  viewportHeight: number;
}

@Builder
function studyPenCanvas(parameters: StudyPenCanvasArguments) {
  // 动态树的布局根由原生容器拥有，套件沿用其内部画布与工具栏布局。
  Stack({ alignContent: Alignment.TopStart }) {
    HandwriteComponent({ handwriteController: parameters.controller, defaultPenType: PenType.PEN,
      widthRatio: 1, heightRatio: 1,
      // 全局视图同时变换卡面与笔迹，关闭 SDK 缩放避免两份缩放叠加。
      scaleDisabled: deviceInfo.sdkApiVersion >= 23 ? true : undefined,
      maxCanvasHeight: deviceInfo.sdkApiVersion >= 23 ? parameters.viewportHeight : undefined,
      onInit: (): void => { parameters.onReady(parameters.generation); },
      onScale: (scale: number): void => { parameters.onScale(parameters.generation, scale); } })
  }.width(parameters.viewportWidth).height(parameters.viewportHeight).clip(true)
  .onAreaChange((_oldArea: Area, area: Area): void => {
    parameters.onLayout(parameters.generation, Number(area.width), Number(area.height));
  })
}

const studyPenCanvasBuilder: WrappedBuilder<[StudyPenCanvasArguments]> = wrapBuilder(studyPenCanvas);

class OfficialStudyPenCanvasMount implements StudyPenCanvasMount {
  private node: BuilderNode<[StudyPenCanvasArguments]>;
  private args: StudyPenCanvasArguments;
  private isDisposed: boolean = false;

  constructor(node: BuilderNode<[StudyPenCanvasArguments]>, args: StudyPenCanvasArguments) {
    this.node = node;
    this.args = args;
  }

  getFrameNode(): FrameNode | null {
    return this.isDisposed ? null : this.node.getFrameNode();
  }

  resize(width: number, height: number): void {
    if (this.isDisposed || (this.args.viewportWidth === width && this.args.viewportHeight === height)) return;
    this.args.viewportWidth = width;
    this.args.viewportHeight = height;
    this.node.update(this.args);
  }

  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.node.dispose();
  }
}

/** 必须在宿主的 UI scope 与 try/catch 内调用；构造失败不能进入 ArkUI 渲染回调。 */
export function createStudyPenCanvas(context: UIContext, parameters: StudyPenCanvasParameters,
  width: number, height: number): StudyPenCanvasMount {
  const controller: HandwriteController = new HandwriteController();
  const args: StudyPenCanvasArguments = { generation: parameters.generation,
    onReady: parameters.onReady, onLayout: parameters.onLayout,
    onScale: parameters.onScale, controller: controller, viewportWidth: width, viewportHeight: height };
  const node: BuilderNode<[StudyPenCanvasArguments]> = new BuilderNode<[StudyPenCanvasArguments]>(context);
  try {
    node.build(studyPenCanvasBuilder, args, { nestingBuilderSupported: true });
  } catch (error) {
    node.dispose();
    throw new Error(`Study Pen Kit canvas build failed: ${error}`);
  }
  return new OfficialStudyPenCanvasMount(node, args);
}
