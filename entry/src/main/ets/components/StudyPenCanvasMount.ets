// SPDX-License-Identifier: AGPL-3.0-or-later
import { FrameNode, UIContext } from '@kit.ArkUI';
import { StudyPenCanvasParameters } from './StudyPenCanvasParameters';

/** 启动侧只认识挂载生命周期，不静态引用官方 Controller 或系统 HSP。 */
export interface StudyPenCanvasMount {
  getFrameNode(): FrameNode | null;
  resize(width: number, height: number): void;
  dispose(): void;
}

export type StudyPenCanvasFactory = (context: UIContext, parameters: StudyPenCanvasParameters,
  width: number, height: number) => StudyPenCanvasMount;
