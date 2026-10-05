// SPDX-License-Identifier: AGPL-3.0-or-later
import { HandwriteComponent, HandwriteController, PenType } from '@kit.Penkit';
import { StudyPenCanvasParameters } from './StudyPenCanvasParameters';

/** 每个挂载实例独占官方 Controller，旧画布的初始化回调携带原代次。 */
@Component
export struct StudyPenCanvas {
  @Prop generation: number = 0;
  onReady: (generation: number) => void = (): void => {};
  onScale: (generation: number, scale: number) => void = (): void => {};
  private controller: HandwriteController = new HandwriteController();

  build() {
    HandwriteComponent({ handwriteController: this.controller, defaultPenType: PenType.PEN,
      widthRatio: 1, heightRatio: 1,
      onInit: (): void => { this.onReady(this.generation); },
      onScale: (scale: number): void => { this.onScale(this.generation, scale); } })
      .width('100%').height('100%')
  }
}

@Builder
function studyPenCanvas(parameters: StudyPenCanvasParameters) {
  StudyPenCanvas({ generation: parameters.generation, onReady: parameters.onReady, onScale: parameters.onScale })
    .width('100%').height('100%')
}

export const studyPenCanvasBuilder: WrappedBuilder<[StudyPenCanvasParameters]> = wrapBuilder(studyPenCanvas);
