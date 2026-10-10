// SPDX-License-Identifier: AGPL-3.0-or-later
import { HandwriteComponent, HandwriteController, PenType } from '@kit.Penkit';
import { BuilderNode, FrameNode, UIContext } from '@kit.ArkUI';
import { deviceInfo } from '@kit.BasicServicesKit';
import { image } from '@kit.ImageKit';
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
      maxCanvasHeight: parameters.fixedCanvas && deviceInfo.sdkApiVersion >= 23 ? parameters.viewportHeight : undefined,
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
  private loadingReject: ((error: Error) => void) | null = null;
  private loadVersion: number = 0;

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

  /** @throws {Error} 调用编辑器显示 SDK 保存错误并保留草稿。 */
  async save(path: string): Promise<void> {
    if (this.isDisposed) throw new Error('Handwriting canvas was closed');
    await this.args.controller.save(path);
  }

  /** @throws {Error} 加载失败或销毁由编辑器处理。 */
  async load(path: string): Promise<void> {
    if (this.isDisposed || this.loadingReject !== null) throw new Error('Handwriting canvas is unavailable');
    const version: number = ++this.loadVersion;
    await new Promise<void>((resolve, reject): void => {
      const timer: number = setTimeout((): void => {
        if (version !== this.loadVersion) return;
        this.loadingReject = null; reject(new Error('Handwriting load timed out'));
      }, 10000);
      this.loadingReject = (error: Error): void => { clearTimeout(timer); this.loadingReject = null; reject(error); };
      this.args.controller.onLoad((error, _path): void => {
        if (version !== this.loadVersion || this.loadingReject === null) return;
        clearTimeout(timer); this.loadingReject = null;
        if (this.isDisposed || (error && error.code !== 0 && error.message !== 'load success')) reject(new Error('Handwriting load failed'));
        else resolve();
      });
      try { this.args.controller.load(path); }
      catch (error) { this.loadingReject?.(error as Error); }
    });
  }

  /** @throws {Error} 编辑器负责显示失败并保留原图片。 */
  async thumbnail(aspect: number): Promise<image.PixelMap> {
    if (this.isDisposed) throw new Error('Handwriting canvas was closed');
    return this.args.controller.getThumbnail({ left: 0, top: 0, right: 1000, bottom: 1000 * aspect });
  }

  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.loadingReject?.(new Error('Handwriting canvas was closed'));
    this.node.dispose();
  }
}

/** 必须在宿主的 UI scope 与 try/catch 内调用；构造失败不能进入 ArkUI 渲染回调。 */
export function createStudyPenCanvas(context: UIContext, parameters: StudyPenCanvasParameters,
  width: number, height: number): StudyPenCanvasMount {
  const controller: HandwriteController = new HandwriteController();
  const args: StudyPenCanvasArguments = { generation: parameters.generation,
    fixedCanvas: parameters.fixedCanvas,
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
