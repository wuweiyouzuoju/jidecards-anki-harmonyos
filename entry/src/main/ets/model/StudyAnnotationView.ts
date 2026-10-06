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
  private gestureIds: number[] = [];
  private startPose: AnnotationPose = { scale: 1, x: 0, y: 0 };
  private startCenter: AnnotationPosition = { x: 0, y: 0 };
  private startDistance: number = 0;

  snapshot(): AnnotationPose { return { scale: this.pose.scale, x: this.pose.x, y: this.pose.y }; }

  setViewport(width: number, height: number): void {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 ||
      (width === this.width && height === this.height)) return;
    if (this.width > 0) this.pose.x *= width / this.width;
    if (this.height > 0) this.pose.y *= height / this.height;
    this.width = width;
    this.height = height;
    this.endGesture();
    this.limit();
  }

  toContent(x: number, y: number): AnnotationPosition {
    return { x: (x - this.pose.x) / this.pose.scale, y: (y - this.pose.y) / this.pose.scale };
  }

  toScreen(x: number, y: number): AnnotationPosition {
    return { x: x * this.pose.scale + this.pose.x, y: y * this.pose.scale + this.pose.y };
  }

  private limit(): void {
    const visible: number = Math.min(48, this.width / 2, this.height / 2);
    this.pose.x = Math.max(visible - this.width * this.pose.scale, Math.min(this.width - visible, this.pose.x));
    this.pose.y = Math.max(visible - this.height * this.pose.scale, Math.min(this.height - visible, this.pose.y));
  }

  navigate(points: AnnotationPoint[]): boolean {
    const valid: AnnotationPoint[] = [];
    for (const point of points) {
      if (Number.isFinite(point.id) && point.id >= 0 && Number.isFinite(point.x) && Number.isFinite(point.y) &&
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
    this.pose.scale = Math.max(0.5, Math.min(4, scale));
    // 初始双指中心下的内容始终跟随当前双指中心，距离变化和连续平移同时生效。
    this.pose.x = center.x - (this.startCenter.x - this.startPose.x) * this.pose.scale / this.startPose.scale;
    this.pose.y = center.y - (this.startCenter.y - this.startPose.y) * this.pose.scale / this.startPose.scale;
    this.limit();
    return old.scale !== this.pose.scale || old.x !== this.pose.x || old.y !== this.pose.y;
  }

  endGesture(): void { this.gestureIds = []; }

  reset(): void {
    this.pose = { scale: 1, x: 0, y: 0 };
    this.endGesture();
  }
}
