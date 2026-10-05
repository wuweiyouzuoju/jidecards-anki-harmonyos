// SPDX-License-Identifier: AGPL-3.0-or-later
export interface WhiteboardPoint { x: number; y: number; }
export interface WhiteboardBrush { color: string; width: number; eraser: boolean; }
export interface WhiteboardStroke extends WhiteboardBrush { points: WhiteboardPoint[]; }
export interface WhiteboardSegment extends WhiteboardBrush { from: WhiteboardPoint; to: WhiteboardPoint; }
interface WhiteboardEdit { added: WhiteboardStroke | null; cleared: WhiteboardStroke[]; points: number; }

export const WHITEBOARD_COLORS: string[] = ['auto', '#D83B46', '#2768D8', '#16805D'];
export const WHITEBOARD_WIDTHS: number[] = [2, 3, 6];
export const WHITEBOARD_ERASER_WIDTHS: number[] = [12, 24, 40];
export function whiteboardColor(color: string, dark: boolean): string {
  if (color === 'auto') return dark ? '#F3F4F6' : '#202632';
  if (!dark) return color;
  if (color === '#D83B46') return '#FF858D';
  if (color === '#2768D8') return '#82B2FF';
  if (color === '#16805D') return '#6EDDB3';
  return color;
}

/** 学习页持有当前卡草稿，收起不丢失；笔迹不进入 ArkUI 的高频观察链。 */
export class StudyWhiteboard {
  private strokes: WhiteboardStroke[] = [];
  private active: WhiteboardStroke | null = null;
  private history: WhiteboardEdit[] = [];
  private future: WhiteboardEdit[] = [];
  private historyPoints: number = 0;
  // 工具选择在本次学习内保留，换卡只重置笔迹。
  color: string = 'auto';
  penWidth: number = 3;
  eraserWidth: number = 24;
  eraser: boolean = false;
  stylusOnly: boolean = false;
  private pointerId: number = -1;
  private pointCount: number = 0;
  private width: number = 0;
  private height: number = 0;
  private disposed: boolean = false;
  private maxPoints: number;
  private maxStrokes: number;

  constructor(maxPoints: number = 65536, maxStrokes: number = 2048) {
    this.maxPoints = Math.max(1, Math.floor(maxPoints));
    this.maxStrokes = Math.max(1, Math.floor(maxStrokes));
  }

  setViewport(width: number, height: number): boolean {
    if (this.disposed || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return false;
    if (width === this.width && height === this.height) return false;
    this.cancel();
    this.width = width;
    this.height = height;
    return true;
  }

  currentPointer(): number { return this.pointerId; }
  hasInk(): boolean { return this.pointCount > 0; }
  canUndo(): boolean { return this.active !== null || this.history.length > 0; }
  canRedo(): boolean { return this.active === null && this.future.length > 0; }
  isFull(): boolean { return this.pointCount >= this.maxPoints || this.strokes.length >= this.maxStrokes; }

  private point(x: number, y: number): WhiteboardPoint | null {
    if (!Number.isFinite(x) || !Number.isFinite(y) || this.width <= 0 || this.height <= 0) return null;
    return { x: Math.max(0, Math.min(1, x / this.width)), y: Math.max(0, Math.min(1, y / this.height)) };
  }

  begin(id: number, x: number, y: number, color: string, width: number = 3,
    eraser: boolean = false): WhiteboardSegment | null {
    if (this.disposed || this.active !== null || this.isFull() || !Number.isFinite(id) || id < 0 ||
      x < 0 || y < 0 || x > this.width || y > this.height) return null;
    const point: WhiteboardPoint | null = this.point(x, y);
    if (point === null || !Number.isFinite(width) || width <= 0 || (eraser && !this.hasInk())) return null;
    this.active = { points: [point], color: color, width: Math.min(width, 48), eraser: eraser };
    this.pointerId = id;
    this.pointCount++;
    return this.segment(point, point, this.active);
  }

  append(id: number, x: number, y: number, force: boolean = false): WhiteboardSegment | null {
    if (this.disposed || this.active === null || this.pointerId !== id || this.pointCount >= this.maxPoints) return null;
    const next: WhiteboardPoint | null = this.point(x, y);
    if (next === null) return null;
    const last: WhiteboardPoint = this.active.points[this.active.points.length - 1];
    const dx: number = (next.x - last.x) * this.width;
    const dy: number = (next.y - last.y) * this.height;
    const distance: number = dx * dx + dy * dy;
    // 过滤静止噪声；抬笔仍保留不足阈值的最后一段。
    if (distance === 0 || (!force && distance < 0.16)) return null;
    this.active.points.push(next);
    this.pointCount++;
    return this.segment(last, next, this.active);
  }

  private segment(from: WhiteboardPoint, to: WhiteboardPoint, brush: WhiteboardBrush): WhiteboardSegment {
    return { from: from, to: to, color: brush.color, width: brush.width, eraser: brush.eraser };
  }

  private record(edit: WhiteboardEdit): void {
    for (const undone of this.future) this.historyPoints -= undone.points;
    this.future = [];
    this.history.push(edit);
    this.historyPoints += edit.points;
    // 引用快照而非复制点；同时限制操作数量与历史点数，反复清空也不会无限增长。
    while (this.history.length > 128 || this.historyPoints > this.maxPoints * 2) {
      const oldest: WhiteboardEdit | undefined = this.history.shift();
      if (oldest === undefined) break;
      this.historyPoints -= oldest.points;
    }
  }

  finish(id: number): boolean {
    if (this.disposed || this.active === null || this.pointerId !== id) return false;
    this.strokes.push(this.active);
    this.record({ added: this.active, cleared: [], points: this.active.points.length });
    this.active = null;
    this.pointerId = -1;
    return true;
  }

  cancel(): boolean {
    if (this.active === null) return false;
    this.pointCount -= this.active.points.length;
    this.active = null;
    this.pointerId = -1;
    return true;
  }

  undo(): boolean {
    if (this.disposed) return false;
    if (this.cancel()) return true;
    const edit: WhiteboardEdit | undefined = this.history.pop();
    if (edit === undefined) return false;
    this.future.push(edit);
    if (edit.added !== null) {
      this.strokes.pop();
      this.pointCount -= edit.added.points.length;
    } else {
      this.strokes = edit.cleared.slice();
      this.pointCount = edit.points;
    }
    return true;
  }

  redo(): boolean {
    if (this.disposed || this.active !== null) return false;
    const edit: WhiteboardEdit | undefined = this.future.pop();
    if (edit === undefined) return false;
    this.history.push(edit);
    if (edit.added !== null) {
      this.strokes.push(edit.added);
      this.pointCount += edit.added.points.length;
    } else {
      this.strokes = [];
      this.pointCount = 0;
    }
    return true;
  }

  clear(): void {
    if (this.disposed) return;
    this.cancel();
    if (this.strokes.length === 0) return;
    this.record({ added: null, cleared: this.strokes, points: this.pointCount });
    this.strokes = [];
    this.pointCount = 0;
  }

  reset(): void {
    this.strokes = [];
    this.active = null;
    this.pointerId = -1;
    this.pointCount = 0;
    this.history = [];
    this.future = [];
    this.historyPoints = 0;
  }

  visitStrokes(draw: (stroke: WhiteboardStroke) => void): void {
    for (const stroke of this.strokes) draw(stroke);
    if (this.active !== null) draw(this.active);
  }

  dispose(): void {
    this.disposed = true;
    this.reset();
    this.width = 0;
    this.height = 0;
  }
}
