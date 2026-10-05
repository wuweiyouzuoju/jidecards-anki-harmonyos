// SPDX-License-Identifier: AGPL-3.0-or-later
export interface StudyPenCanvasParameters {
  generation: number;
  onReady: (generation: number) => void;
  onScale: (generation: number, scale: number) => void;
}
