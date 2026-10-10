// SPDX-License-Identifier: AGPL-3.0-or-later
export interface StudyPenCanvasParameters {
  generation: number;
  // 制卡导出固定画幅；学习白板继续由套件管理长画布。
  fixedCanvas?: boolean;
  onReady: (generation: number) => void;
  onLayout: (generation: number, width: number, height: number) => void;
  onScale: (generation: number, scale: number) => void;
}
