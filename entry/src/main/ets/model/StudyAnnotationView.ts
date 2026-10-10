// SPDX-License-Identifier: AGPL-3.0-or-later
export interface AnnotationPoint { id: number; x: number; y: number; }
export interface AnnotationPosition { x: number; y: number; }
export interface AnnotationPose { scale: number; x: number; y: number; }

/** 不同布局原点的图层使用同一个窗口变换，保持卡面与笔迹对齐。 */
export function annotationLayerTranslation(pose: AnnotationPose, originX: number, originY: number): AnnotationPosition {
  return { x: pose.x + (pose.scale - 1) * originX, y: pose.y + (pose.scale - 1) * originY };
}

/** 白板宿主持有全局视图，两种笔迹层与卡面共享它，不改写笔迹历史。 */
export class StudyAnnotationView {
  private pose: AnnotationPose = { scale: 1, x: 0, y: 0 };
  private width: number = 0;
  private height: number = 0;
  private contentLeft: number = 0;
  private contentTop: number = 0;
  private contentRight: number = 0;
  private contentBottom: number = 0;
  private gestureIds: number[] = [];
  private startPose: AnnotationPose = { scale: 1, x: 0, y: 0 };
  private startCenter: AnnotationPosition = { x: 0, y: 0 };
  private startDistance: number = 0;
  private panPointerId: number = -1;
  private panStart: AnnotationPoint = { id: -1, x: 0, y: 0 };
  private panPose: AnnotationPose = { scale: 1, x: 0, y: 0 };

  snapshot(): AnnotationPose { return { scale: this.pose.scale, x: this.pose.x, y: this.pose.y }; }

  setViewport(width: number, height: number): void {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 ||
      (width === this.width && height === this.height)) return;
    if (this.width > 0) {
      this.pose.x *= width / this.width;
      this.contentLeft *= width / this.width; this.contentRight *= width / this.width;
    } else this.contentRight = width;
    if (this.height > 0) {
      this.pose.y *= height / this.height;
      this.contentTop *= height / this.height; this.contentBottom *= height / this.height;
    } else this.contentBottom = height;
    this.width = width;
    this.height = height;
    this.endGesture();
    this.limit();
  }

  setContentBounds(x: number, y: number, width: number, height: number): void {
    if (![x, y, width, height].every((value: number): boolean => Number.isFinite(value)) ||
      width <= 0 || height <= 0 || this.width <= 0 || this.height <= 0) return;
    const left: number = Math.max(0, Math.min(this.width, x));
    const top: number = Math.max(0, Math.min(this.height, y));
    const right: number = Math.max(0, Math.min(this.width, x + width));
    const bottom: number = Math.max(0, Math.min(this.height, y + height));
    if (right <= left || bottom <= top || (left === this.contentLeft && top === this.contentTop &&
      right === this.contentRight && bottom === this.contentBottom)) return;
    this.contentLeft = left; this.contentTop = top; this.contentRight = right; this.contentBottom = bottom;
    this.endGesture(); this.limit();
  }

  toContent(x: number, y: number): AnnotationPosition {
    return { x: (x - this.pose.x) / this.pose.scale, y: (y - this.pose.y) / this.pose.scale };
  }

  toScreen(x: number, y: number): AnnotationPosition {
    return { x: x * this.pose.scale + this.pose.x, y: y * this.pose.scale + this.pose.y };
  }

  private limit(): void {
    // 只有按钮之间的画布参与变换，四边始终覆盖这块固定视口。
    const factor: number = 1 - this.pose.scale;
    this.pose.x = Math.max(this.contentRight * factor + 0, Math.min(this.contentLeft * factor + 0, this.pose.x));
    this.pose.y = Math.max(this.contentBottom * factor + 0, Math.min(this.contentTop * factor + 0, this.pose.y));
  }

  beginPan(point: AnnotationPoint): boolean {
    this.endGesture();
    if (this.pose.scale <= 1 || this.width <= 0 || this.height <= 0 || !this.validPoint(point)) return false;
    this.panPointerId = point.id;
    this.panStart = { id: point.id, x: point.x, y: point.y };
    this.panPose = this.snapshot();
    return true;
  }

  pan(point: AnnotationPoint): boolean {
    if (this.panPointerId < 0 || point.id !== this.panPointerId || !this.validPoint(point)) return false;
    const old: AnnotationPose = this.snapshot();
    this.pose.x = this.panPose.x + point.x - this.panStart.x;
    this.pose.y = this.panPose.y + point.y - this.panStart.y;
    this.limit();
    return old.x !== this.pose.x || old.y !== this.pose.y;
  }

  endPan(): void { this.panPointerId = -1; }

  private validPoint(point: AnnotationPoint): boolean {
    return Number.isFinite(point.id) && point.id >= 0 && Number.isFinite(point.x) && Number.isFinite(point.y);
  }

  navigate(points: AnnotationPoint[]): boolean {
    this.endPan();
    const valid: AnnotationPoint[] = [];
    for (const point of points) {
      if (this.validPoint(point) &&
        !valid.some((item: AnnotationPoint): boolean => item.id === point.id)) valid.push(point);
    }
    const selected: AnnotationPoint[] = valid.slice(0, 2);
    if (selected.length < 2 || this.width <= 0 || this.height <= 0) { this.endGesture(); return false; }
    // 按 ID 匹配，设备重排触点数组不会交换缩放端点。
    if (this.gestureIds.length === selected.length &&
      this.gestureIds.every((id: number): boolean => selected.some((point: AnnotationPoint): boolean => point.id === id))) {
      selected.sort((a: AnnotationPoint, b: AnnotationPoint): number =>
        this.gestureIds.indexOf(a.id) - this.gestureIds.indexOf(b.id));
    }
    const center: AnnotationPosition = {
      x: (selected[0].x + selected[1].x) / 2, y: (selected[0].y + selected[1].y) / 2 };
    const distance: number = Math.hypot(selected[1].x - selected[0].x, selected[1].y - selected[0].y);
    if (distance <= 0) { this.endGesture(); return false; }
    if (this.gestureIds.length !== selected.length ||
      this.gestureIds.some((id: number, index: number): boolean => id !== selected[index].id)) {
      this.gestureIds = selected.map((point: AnnotationPoint): number => point.id);
      this.startPose = this.snapshot();
      this.startCenter = center;
      this.startDistance = distance;
      return false;
    }
    const old: AnnotationPose = this.snapshot();
    const scale: number = this.startPose.scale * distance / this.startDistance;
    // 允许双向缩放，但不能小于原尺寸，避免露出有限画布外的空白。
    this.pose.scale = Math.max(1, Math.min(4, scale));
    // 初始双指中心下的内容始终跟随当前双指中心，距离变化和连续平移同时生效。
    this.pose.x = center.x - (this.startCenter.x - this.startPose.x) * this.pose.scale / this.startPose.scale;
    this.pose.y = center.y - (this.startCenter.y - this.startPose.y) * this.pose.scale / this.startPose.scale;
    this.limit();
    return old.scale !== this.pose.scale || old.x !== this.pose.x || old.y !== this.pose.y;
  }

  endGesture(): void { this.gestureIds = []; this.endPan(); }

  reset(): void {
    this.pose = { scale: 1, x: 0, y: 0 };
    this.endGesture();
  }
}
