// SPDX-License-Identifier: AGPL-3.0-or-later
import { ImageSurfaceStyle } from '../utils/ImageSurfaceStyle';
import { LengthMetrics } from '@kit.ArkUI';
import { GesturePointer, gesturePointer } from '../model/GesturePointer';
import { FormTextAreaStyle } from '../utils/FormTextAreaStyle';
import { 按下态按钮 } from './common/按下态按钮';
import { confirmNoteDiscard } from '../utils/ConfirmNoteDiscard';
import { copyMask, maskNumber, maskProperty, maskPoints, setMaskProperty,
  occlusionOrdinals, polygonImagePoints, setPolygonImagePoints, occlusionPolygonArea,
  OcclusionPoint, OcclusionHistory } from '../model/图片遮罩模型';
import { OcclusionEditorSize, OcclusionTextExtent, OcclusionTextLayout, occlusionStageSize,
  occlusionTextLayout, clampOcclusionOrigin } from '../model/ImageOcclusionEditorGeometry';

import { DialogHeader } from './common/DialogHeader';
// ========================================================
// @块ID COMP-IMAGEOCCLUSION-EDITOR-001
// @名称 图片遮罩编辑器
//
// @作用
// Image Occlusion 笔记类型的建卡遮罩编辑器。在源图上叠加 Canvas，
// 用户创建矩形/椭圆/多边形/文字，选中后移动、调整大小、分组或删除，
// 完成后通过 onConfirm 把 遮罩列表（归一化坐标 0-1）回传给父级，
// 父级再调 生成Occlusions字符串 与后端服务落库。
//
// @输入
// 源图Uri: PhotoViewPicker 返回的图片 URI（与 Image 组件直接兼容）
// 是否深色: 控制画布底色（无图区域）与提示对比度
//
// @输出
// onConfirm(遮罩列表): 用户点"确定"时回调，传入最终遮罩列表
// onCancel(): 用户点"取消"时回调
//
// @业务规则
// 坐标以原图归一化，序列化由纯模型负责，导入属性不会在编辑时重建。
// 默认直接提供七色组；导入的更大编号保留，同编号一起考查，c0 文字仅作标注。
// 图片完整居中显示；绘制和触摸均以 Contain 后的图像区域换算，排除留白。
// 图片位于工具与遮盖模式下方，文字和撤销/清空在图片下方。
//
// @副作用
// 仅通过 onConfirm / onCancel 回调上抛结果；不直接落盘、不调后端。
// ========================================================

import { 应用尺寸 } from '../utils/应用尺寸';
import { 遮罩描述, 编号颜色 } from '../model/图片遮罩模型';

/** 图片在画布中的实际显示区域，单位为 vp。 */
interface ImageContentRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

@Component
export struct 图片遮罩编辑器 {
  @Prop 源图Uri: string = '';
  @Prop initialMasks: 遮罩描述[] = [];

  aboutToAppear(): void {
    this.disposed = false;
    this.遮罩列表 = this.initialMasks.map(copyMask);
    this.当前选中编号 = occlusionOrdinals(this.遮罩列表, 0)[0] ?? 1;
    const masks: 遮罩描述[] = this.遮罩列表.filter((mask: 遮罩描述): boolean => mask.形状 !== 'text');
    this.newInactiveMode = masks.length > 0 && masks.every((mask: 遮罩描述): boolean => maskNumber(mask, 'oi') === 1) ? 1 : 0;
  }
  aboutToDisappear(): void { this.disposed = true; }
  @Prop @Watch('requestClose') backRequest: number = 0;
  @Prop 是否深色: boolean = false;
  onConfirm: (遮罩列表: 遮罩描述[]) => void = (_l: 遮罩描述[]): void => {};
  onCancel: () => void = (): void => {};

  // 已落定的遮罩列表（每次变更重新赋值整个数组以触发 @State）
  @State 遮罩列表: 遮罩描述[] = [];
  // 当前分组编号决定新图形的 ordinal，文字固定使用 c0。
  @State 当前选中编号: number = 1;
  @State private selectedMask: number = -1;
  @State private shapeKind: string = 'rect';
  @State private polygonPoints: OcclusionPoint[] = [];
  @State private annotationText: string = '';
  @State private canUndo: boolean = false;
  @State private canRedo: boolean = false;
  @State private imageFailed: boolean = false;
  @State private newInactiveMode: number = 0;
  @State private viewportWidth: number = 320;
  @State private viewportHeight: number = 480;
  private history: OcclusionHistory = new OcclusionHistory();
  private dragSnapshot: 遮罩描述[] | null = null;
  private confirmingClose: boolean = false;
  private disposed: boolean = false;
  // 图片加载前不允许绘制，避免用占位比例保存错误坐标。
  @State 图片宽高比: number = 0;
  @State private sourceHeight: number = 1000;
  // onReady 读取实际画布尺寸，初始化和尺寸变化均同步重绘。
  @State 画布宽: number = 0;
  @State 画布高: number = 0;
  @State 画布就绪: boolean = false;

  // 拖动状态：0=空闲 1=创建中 2=移动中 3=多边形顶点移动
  @State 拖动模式: number = 0;
  private dragPointerId: number = -1;
  private polygonVertexIndex: number = -1;
  @State 创建起点归一化X: number = 0;
  @State 创建起点归一化Y: number = 0;
  @State 创建中矩形: 遮罩描述 | null = null;
  @State 移动中索引: number = -1;
  @State 移动偏移归一化X: number = 0;
  @State 移动偏移归一化Y: number = 0;

  private 上下文: CanvasRenderingContext2D = new CanvasRenderingContext2D(new RenderingContextSettings(true));
  // 矩形最小有效尺寸（归一化），小于此值视为误触不落定
  private readonly 最小拖动距离: number = 0.005;

  /** 与居中 ImageFit.Contain 共用同一缩放和留白，不改变已保存的归一化坐标。 */
  private imageContentRect(): ImageContentRect {
    if (this.画布宽 <= 0 || this.画布高 <= 0 || this.图片宽高比 <= 0) {
      return { left: 0, top: 0, width: 0, height: 0 };
    }
    const width: number = Math.min(this.画布宽, this.画布高 * this.图片宽高比);
    const height: number = width / this.图片宽高比;
    return {
      left: (this.画布宽 - width) / 2,
      top: (this.画布高 - height) / 2,
      width: width,
      height: height
    };
  }

  /** 手势取消或窗口改变时丢弃未完成的矩形，保留已落定遮罩。 */
  private cancelDrag(): void {
    this.dragPointerId = -1;
    if (this.dragSnapshot !== null && this.拖动模式 >= 2) this.遮罩列表 = this.dragSnapshot.map(copyMask);
    this.dragSnapshot = null;
    this.拖动模式 = 0;
    this.创建中矩形 = null;
    this.移动中索引 = -1;
    this.polygonVertexIndex = -1;
    this.重绘();
  }

  /** Canvas 在初始化和大小变化后清空；使用同一时刻的实际尺寸恢复遮罩。 */
  private refreshCanvas(): void {
    this.画布宽 = this.上下文.width;
    this.画布高 = this.上下文.height;
    this.画布就绪 = true;
    this.cancelDrag();
  }

  // ========================================================
  // @块ID COMP-IMAGEOCCLUSION-EDITOR-002
  // @名称 编号候选列表
  //
  // @作用
  // 顶部直接提供七组，同时保留已存在的更大编号。
  //
  // @输入
  // 无。
  //
  // @输出
  // 实际卡片组的 number[]。
  //
  // @副作用
  // 无。
  // ========================================================
  private 编号候选列表(): number[] {
    return occlusionOrdinals(this.遮罩列表, this.当前选中编号, 7);
  }

  // ========================================================
  // @块ID COMP-IMAGEOCCLUSION-EDITOR-003
  // @名称 坐标归一化
  //
  // @作用
  // 把 PanGesture 的 localX/localY（vp）转为归一化坐标 0-1。
  // 画布未就绪时返回 0，避免除零。
  //
  // @输入
  // vp 坐标
  //
  // @输出
  // 归一化坐标 0-1
  //
  // @副作用
  // 无。
  // ========================================================
  private 归一化X(vp: number): number {
    const rect: ImageContentRect = this.imageContentRect();
    if (rect.width <= 0) {
      return 0;
    }
    return (vp - rect.left) / rect.width;
  }

  private 归一化Y(vp: number): number {
    const rect: ImageContentRect = this.imageContentRect();
    if (rect.height <= 0) {
      return 0;
    }
    return (vp - rect.top) / rect.height;
  }

  // ========================================================
  // @块ID COMP-IMAGEOCCLUSION-EDITOR-004
  // @名称 命中遮罩
  //
  // @作用
  // 检查归一化坐标 (x, y) 是否落在某个已落定遮罩内部。
  // 倒序遍历（后画的在上），命中即返回索引；都不命中返回 -1。
  //
  // @输入
  // 归一化坐标 x, y
  //
  // @输出
  // 遮罩索引（0-based），未命中返回 -1
  //
  // @副作用
  // 无。
  // ========================================================
  private 命中遮罩(归一化X: number, 归一化Y: number): number {
    for (let i: number = this.遮罩列表.length - 1; i >= 0; i--) {
      const m: 遮罩描述 = this.遮罩列表[i];
      if (!['rect', 'ellipse', 'polygon', 'text'].includes(m.形状)) continue;
      const angle: number = m.形状 === 'polygon' ? 0 : maskNumber(m, 'angle') * Math.PI * 2 / 10000;
      const dx: number = 归一化X - m.左, dy: number = 归一化Y - m.顶;
      const rect: ImageContentRect = this.imageContentRect();
      const bounds: ImageContentRect = this.maskBounds(m);
      const width: number = bounds.width / rect.width, height: number = bounds.height / rect.height;
      const offsetX: number = (bounds.left - rect.left) / rect.width - m.左;
      const offsetY: number = (bounds.top - rect.top) / rect.height - m.顶;
      // Rotate in displayed pixels: normalized X/Y have different scales on non-square images.
      const x: number = (dx * rect.width * Math.cos(angle) + dy * rect.height * Math.sin(angle)) / rect.width;
      const y: number = (-dx * rect.width * Math.sin(angle) + dy * rect.height * Math.cos(angle)) / rect.height;
      if (x < offsetX || y < offsetY || x > offsetX + width || y > offsetY + height) continue;
      if (m.形状 === 'ellipse') {
        if (m.宽 <= 0 || m.高 <= 0) continue;
        if (Math.pow((x - m.宽 / 2) / (m.宽 / 2), 2) + Math.pow((y - m.高 / 2) / (m.高 / 2), 2) > 1) continue;
      } else if (m.形状 === 'polygon') {
        const points: OcclusionPoint[] = maskPoints(m);
        const minX: number = Math.min(...points.map((p: OcclusionPoint): number => p.x));
        const minY: number = Math.min(...points.map((p: OcclusionPoint): number => p.y));
        let inside: boolean = false;
        for (let p: number = 0, previous: number = points.length - 1; p < points.length; previous = p++) {
          const a: OcclusionPoint = points[p], b: OcclusionPoint = points[previous];
          if ((a.y - minY > y) !== (b.y - minY > y) &&
            x < (b.x - a.x) * (y - a.y + minY) / (b.y - a.y) + a.x - minX) inside = !inside;
        }
        if (!inside) continue;
      }
      return i;
    }
    return -1;
  }

  // ========================================================
  // @块ID COMP-IMAGEOCCLUSION-EDITOR-006
  // @名称 拖动开始
  //
  // @作用
  // PanGesture onActionStart 处理：按命中优先级决定本次拖动的模式：
  //   1. 命中已有遮罩 → 进入移动模式，记录移动偏移
  //   2. 命中空白区 → 进入创建模式，初始化零尺寸矩形
  //
  // @输入
  // GestureEvent（按触点 ID 读取 localX/localY，vp 单位）
  //
  // @输出
  // 修改 拖动模式 / 创建中矩形 / 移动中索引
  //
  // @副作用
  // 无。
  //
  // @注意
  // 2026-07-28 起遮罩右上方不再画 × 删除按钮，删除走顶部"撤销/清空"按钮。
  // ========================================================
  private 拖动开始(event: GestureEvent): void {
    const point: GesturePointer | null = gesturePointer(event.fingerInfos, event.fingerList);
    if (!this.画布就绪 || this.画布宽 <= 0 || this.画布高 <= 0
      || this.图片宽高比 <= 0 || point === null) {
      return;
    }
    // Pan 达到识别距离才回调，减去累计位移以还原按下点，避免起点及命中目标偏移。
    const x: number = this.归一化X(point.localX - event.offsetX);
    const y: number = this.归一化Y(point.localY - event.offsetY);
    if (x < 0 || x > 1 || y < 0 || y > 1) {
      return;
    }
    this.dragPointerId = point.id;

    const vertex: number = this.hitPolygonVertex(x, y);
    if (vertex >= 0) {
      this.dragSnapshot = this.遮罩列表.map(copyMask);
      this.移动中索引 = this.selectedMask;
      this.polygonVertexIndex = vertex;
      this.拖动模式 = 3;
      this.拖动更新(event);
      return;
    }

    // 1. 命中已有遮罩 → 移动
    const 命中索引: number = this.命中遮罩(x, y);
    if (命中索引 >= 0) {
      this.dragSnapshot = this.遮罩列表.map(copyMask);
      this.selectedMask = 命中索引;
      this.拖动模式 = 2;
      this.移动中索引 = 命中索引;
      const m: 遮罩描述 = this.遮罩列表[命中索引];
      this.移动偏移归一化X = x - m.左;
      this.移动偏移归一化Y = y - m.顶;
      // 切换当前选中编号到被拖动矩形的编号，便于用户继续画同色矩形
      if (m.编号 > 0) this.当前选中编号 = m.编号;
      this.拖动更新(event);
      return;
    }

    // 2. 空白区 → 创建
    if (this.shapeKind === 'polygon' || this.shapeKind === 'text') return;
    this.拖动模式 = 1;
    this.selectedMask = -1;
    this.dragSnapshot = this.遮罩列表.map(copyMask);
    this.创建起点归一化X = x;
    this.创建起点归一化Y = y;
    this.创建中矩形 = {
      形状: this.shapeKind,
      左: x,
      顶: y,
      宽: 0,
      高: 0,
      编号: this.当前选中编号
    };
    this.拖动更新(event);
  }

  // ========================================================
  // @块ID COMP-IMAGEOCCLUSION-EDITOR-007
  // @名称 拖动更新
  //
  // @作用
  // PanGesture onActionUpdate 处理：
  // - 创建模式：以起点和当前点为对角，更新 创建中矩形 的 左/顶/宽/高
  // - 移动模式：按当前点 - 移动偏移 更新被拖遮罩的 左/顶（保持宽高）
  // 当前点会被夹紧到 [0, 1]，避免遮罩溢出画布。
  //
  // @输入
  // GestureEvent
  //
  // @输出
  // 修改 创建中矩形 或 遮罩列表，并触发 Canvas 重绘
  //
  // @副作用
  // 无。
  // ========================================================
  private 拖动更新(event: GestureEvent): void {
    const point: GesturePointer | null = gesturePointer(event.fingerInfos, event.fingerList, this.dragPointerId);
    if (this.拖动模式 === 0 || point === null) {
      return;
    }
    const x: number = Math.max(0, Math.min(1, this.归一化X(point.localX)));
    const y: number = Math.max(0, Math.min(1, this.归一化Y(point.localY)));

    if (this.拖动模式 === 3 && this.移动中索引 >= 0 && this.dragSnapshot !== null) {
      const original: 遮罩描述 = this.dragSnapshot[this.移动中索引];
      const points: OcclusionPoint[] = polygonImagePoints(original);
      points[this.polygonVertexIndex] = { x: x, y: y };
      if (occlusionPolygonArea(points) < 0.00001) return;
      const masks: 遮罩描述[] = this.遮罩列表.map(copyMask);
      setPolygonImagePoints(masks[this.移动中索引], points);
      this.遮罩列表 = masks; this.重绘(); return;
    }

    if (this.拖动模式 === 1 && this.创建中矩形 !== null) {
      this.创建中矩形 = {
        形状: this.创建中矩形.形状,
        左: Math.min(this.创建起点归一化X, x),
        顶: Math.min(this.创建起点归一化Y, y),
        宽: Math.abs(x - this.创建起点归一化X),
        高: Math.abs(y - this.创建起点归一化Y),
        编号: this.创建中矩形.编号
      };
      this.重绘();
      return;
    }

    if (this.拖动模式 === 2 && this.移动中索引 >= 0) {
      const m: 遮罩描述 = this.遮罩列表[this.移动中索引];
      const position: OcclusionPoint = this.positionInsideImage(m, x - this.移动偏移归一化X, y - this.移动偏移归一化Y);
      const 新左: number = position.x;
      const 新顶: number = position.y;
      const 新列表: 遮罩描述[] = [];
      for (let i: number = 0; i < this.遮罩列表.length; i++) {
        if (i === this.移动中索引) {
          const moved: 遮罩描述 = copyMask(m);
          moved.左 = 新左; moved.顶 = 新顶;
          新列表.push(moved);
        } else {
          新列表.push(this.遮罩列表[i]);
        }
      }
      this.遮罩列表 = 新列表;
      this.重绘();
    }
  }

  // ========================================================
  // @块ID COMP-IMAGEOCCLUSION-EDITOR-008
  // @名称 拖动结束
  //
  // @作用
  // PanGesture onActionEnd 处理：
  // - 创建模式：若 创建中矩形 尺寸 ≥ 最小拖动距离 则落定到 遮罩列表
  // - 清理临时状态（创建中矩形、移动索引、拖动模式）
  //
  // @输入
  // 无。
  //
  // @输出
  // 修改 遮罩列表 / 创建中矩形 / 拖动模式 / 移动中索引，并触发重绘
  //
  // @副作用
  // 无。
  // ========================================================
  private 拖动结束(): void {
    this.dragPointerId = -1;
    if (this.拖动模式 === 1 && this.创建中矩形 !== null) {
      if (this.创建中矩形.宽 >= this.最小拖动距离 && this.创建中矩形.高 >= this.最小拖动距离) {
        if (this.newInactiveMode === 1) setMaskProperty(this.创建中矩形, 'oi', '1');
        const 新列表: 遮罩描述[] = [];
        for (let i: number = 0; i < this.遮罩列表.length; i++) {
          新列表.push(this.遮罩列表[i]);
        }
        新列表.push(this.创建中矩形);
        this.遮罩列表 = 新列表;
      }
      this.创建中矩形 = null;
    }
    if (this.dragSnapshot !== null && JSON.stringify(this.dragSnapshot) !== JSON.stringify(this.遮罩列表)) {
      this.history.remember(this.dragSnapshot); this.updateHistory();
    }
    this.dragSnapshot = null;
    this.拖动模式 = 0;
    this.移动中索引 = -1;
    this.polygonVertexIndex = -1;
    this.重绘();
  }

  // ========================================================
  // @块ID COMP-IMAGEOCCLUSION-EDITOR-009
  // @名称 重绘Canvas
  //
  // @作用
  // 清空画布并按顺序绘制：所有已落定遮罩 → 创建中矩形（半透明）。
  // 由 onReady / 图片加载 / 拖动三阶段 / 撤销 / 清空 显式调用。
  // Canvas 不会随 @State 变更自动重绘，必须手动调本方法。
  //
  // @输入
  // 无。
  //
  // @输出
  // 画布像素被重写。
  //
  // @业务规则
  // 画布未就绪时直接返回，避免对未初始化的 context 调绘制 API。
  //
  // @副作用
  // 修改 Canvas 像素。
  // ========================================================
  private 重绘(): void {
    if (!this.画布就绪) {
      return;
    }
    const ctx: CanvasRenderingContext2D = this.上下文;
    ctx.clearRect(0, 0, this.画布宽, this.画布高);
    for (let i: number = 0; i < this.遮罩列表.length; i++) {
      if (this.遮罩列表[i].形状 !== 'text') this.绘制遮罩(this.遮罩列表[i], false);
    }
    for (let i: number = 0; i < this.遮罩列表.length; i++) {
      if (this.遮罩列表[i].形状 === 'text') this.绘制遮罩(this.遮罩列表[i], false);
    }
    if (this.创建中矩形 !== null) {
      this.绘制遮罩(this.创建中矩形, true);
    }
    if (this.polygonPoints.length > 0) {
      const rect: ImageContentRect = this.imageContentRect();
      ctx.save(); ctx.strokeStyle = 编号颜色(this.当前选中编号); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(rect.left + this.polygonPoints[0].x * rect.width, rect.top + this.polygonPoints[0].y * rect.height);
      for (let i: number = 1; i < this.polygonPoints.length; i++) {
        ctx.lineTo(rect.left + this.polygonPoints[i].x * rect.width, rect.top + this.polygonPoints[i].y * rect.height);
      }
      ctx.stroke(); ctx.restore();
      this.drawPolygonVertices(this.polygonPoints);
    } else if (this.selectedMask >= 0 && this.遮罩列表[this.selectedMask].形状 === 'polygon') {
      this.drawPolygonVertices(polygonImagePoints(this.遮罩列表[this.selectedMask]));
    }
  }

  private drawPolygonVertices(points: OcclusionPoint[]): void {
    const rect: ImageContentRect = this.imageContentRect();
    const ctx: CanvasRenderingContext2D = this.上下文;
    ctx.save(); ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = 编号颜色(this.当前选中编号); ctx.lineWidth = 2;
    for (const point of points) {
      ctx.beginPath(); ctx.arc(rect.left + point.x * rect.width, rect.top + point.y * rect.height, 5, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  private hitPolygonVertex(x: number, y: number): number {
    if (this.selectedMask < 0 || this.polygonPoints.length > 0 || this.遮罩列表[this.selectedMask].形状 !== 'polygon') return -1;
    const points: OcclusionPoint[] = polygonImagePoints(this.遮罩列表[this.selectedMask]);
    const rect: ImageContentRect = this.imageContentRect();
    for (let i: number = 0; i < points.length; i++) {
      if (Math.hypot((points[i].x - x) * rect.width, (points[i].y - y) * rect.height) <= 14) return i;
    }
    return -1;
  }

  // ========================================================
  // @块ID COMP-IMAGEOCCLUSION-EDITOR-010
  // @名称 绘制单个遮罩
  //
  // @作用
  // 在画布上绘制一个矩形遮罩：
  // - 半透明填充（创建中态透明度更低）
  // - 实线边框
  //
  // @输入
  // 遮罩: 归一化坐标描述
  // 创建中: true 表示当前正在拖拽创建（透明度更低）
  //
  // @输出
  // 画布像素被绘制。
  //
  // @业务规则
  // 颜色由 编号颜色(编号) 决定，c1-c5 固定红橙黄绿蓝。
  // 原生 Canvas 使用六位 RGB 与独立 globalAlpha，避免八位颜色字符串解析差异。
  // 不再画 × 删除按钮（2026-07-28 改），删除走顶部"撤销/清空"按钮。
  //
  // @副作用
  // 修改 Canvas 像素。
  // ========================================================
  private 绘制遮罩(遮罩: 遮罩描述, 创建中: boolean): void {
    const ctx: CanvasRenderingContext2D = this.上下文;
    const rect: ImageContentRect = this.imageContentRect();
    const 像素左: number = rect.left + 遮罩.左 * rect.width;
    const 像素顶: number = rect.top + 遮罩.顶 * rect.height;
    const bounds: ImageContentRect = this.maskBounds(遮罩);
    const 像素宽: number = bounds.width;
    const 像素高: number = bounds.height;
    const 颜色: string = 编号颜色(遮罩.编号);

    // 半透明填充：创建中态更淡
    ctx.save();
    const angle: number = maskNumber(遮罩, 'angle') * Math.PI * 2 / 10000;
    if (angle !== 0 && 遮罩.形状 !== 'polygon') {
      ctx.translate(像素左, 像素顶); ctx.rotate(angle); ctx.translate(-像素左, -像素顶);
    }
    ctx.fillStyle = 颜色;
    ctx.globalAlpha = 创建中 ? 0.25 : 0.4;
    ctx.strokeStyle = 颜色;
    ctx.lineWidth = 2;
    if (遮罩.形状 === 'rect') {
      ctx.fillRect(像素左, 像素顶, 像素宽, 像素高);
      ctx.globalAlpha = 1; ctx.strokeRect(像素左, 像素顶, 像素宽, 像素高);
    } else if (遮罩.形状 === 'ellipse') {
      ctx.beginPath(); ctx.ellipse(像素左 + 像素宽 / 2, 像素顶 + 像素高 / 2,
        像素宽 / 2, 像素高 / 2, 0, 0, Math.PI * 2); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1; ctx.stroke();
    } else if (遮罩.形状 === 'polygon') {
      const points: OcclusionPoint[] = maskPoints(遮罩);
      if (points.length >= 3) {
        const minX: number = Math.min(...points.map((p: OcclusionPoint): number => p.x));
        const minY: number = Math.min(...points.map((p: OcclusionPoint): number => p.y));
        ctx.beginPath(); ctx.moveTo(像素左 + (points[0].x - minX) * rect.width, 像素顶 + (points[0].y - minY) * rect.height);
        for (let i: number = 1; i < points.length; i++) ctx.lineTo(像素左 + (points[i].x - minX) * rect.width, 像素顶 + (points[i].y - minY) * rect.height);
        ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
      }
    } else if (遮罩.形状 === 'text') {
      ctx.globalAlpha = 1; ctx.fillStyle = maskProperty(遮罩, 'fill', '#000000');
      const size: number = maskNumber(遮罩, 'fs', 40 / this.sourceHeight) * rect.height * maskNumber(遮罩, 'scale', 1);
      ctx.font = String(size) + 'px Arial'; ctx.textBaseline = 'top';
      const lines: string[] = maskProperty(遮罩, 'text').split('\n');
      const layout: OcclusionTextLayout = this.textLayout(遮罩);
      for (let i: number = 0; i < lines.length; i++) ctx.fillText(lines[i], 像素左, 像素顶 + i * layout.lineHeight);
    }
    if (this.selectedMask >= 0 && this.遮罩列表[this.selectedMask] === 遮罩) {
      ctx.globalAlpha = 1; ctx.setLineDash([4, 3]); ctx.strokeRect(bounds.left, bounds.top, bounds.width, bounds.height);
    }
    ctx.restore();
  }

  private maskBounds(mask: 遮罩描述): ImageContentRect {
    const rect: ImageContentRect = this.imageContentRect();
    let width: number = mask.宽 * rect.width, height: number = mask.高 * rect.height;
    if (mask.形状 === 'text') {
      const layout: OcclusionTextLayout = this.textLayout(mask);
      return { left: rect.left + mask.左 * rect.width + layout.left, top: rect.top + mask.顶 * rect.height + layout.top,
        width: layout.width, height: layout.height };
    }
    return { left: rect.left + mask.左 * rect.width, top: rect.top + mask.顶 * rect.height, width: width, height: height };
  }

  private textLayout(mask: 遮罩描述): OcclusionTextLayout {
    const rect: ImageContentRect = this.imageContentRect();
    const size: number = maskNumber(mask, 'fs', 40 / this.sourceHeight) * rect.height * maskNumber(mask, 'scale', 1);
    const ctx: CanvasRenderingContext2D = this.上下文;
    ctx.save(); ctx.font = String(size) + 'px Arial'; ctx.textBaseline = 'top';
    const reference: TextMetrics = ctx.measureText('M');
    const extents: OcclusionTextExtent[] = maskProperty(mask, 'text').split('\n').map((line: string): OcclusionTextExtent => {
      const metrics: TextMetrics = ctx.measureText(line);
      return { width: metrics.width, ascent: metrics.actualBoundingBoxAscent, descent: metrics.actualBoundingBoxDescent };
    });
    ctx.restore();
    return occlusionTextLayout(extents, size, reference.actualBoundingBoxAscent + reference.actualBoundingBoxDescent);
  }

  private positionInsideImage(mask: 遮罩描述, left: number, top: number): OcclusionPoint {
    const rect: ImageContentRect = this.imageContentRect();
    const bounds: ImageContentRect = this.maskBounds(mask);
    return clampOcclusionOrigin(left, top,
      { left: bounds.left - rect.left - mask.左 * rect.width, top: bounds.top - rect.top - mask.顶 * rect.height,
        width: bounds.width, height: bounds.height }, rect,
      mask.形状 === 'polygon' ? 0 : maskNumber(mask, 'angle') * Math.PI * 2 / 10000);
  }

  // ========================================================
  // @块ID COMP-IMAGEOCCLUSION-EDITOR-011
  // @名称 撤销最后一个
  //
  // @作用
  // 恢复上一次已完成的图形操作，支持移动、编号、大小、删除及模式切换。
  //
  // @输入
  // 无。
  //
  // @输出
  // 修改 遮罩列表，并触发重绘
  //
  // @副作用
  // 列表为空时不操作。
  // ========================================================
  private 撤销最后一个(): void {
    if (this.polygonPoints.length > 0) { this.polygonPoints = this.polygonPoints.slice(0, -1); this.重绘(); return; }
    this.cancelDrag(); this.遮罩列表 = this.history.undo(this.遮罩列表);
    this.selectedMask = -1; this.annotationText = ''; this.updateHistory();
    this.重绘();
  }

  // ========================================================
  // @块ID COMP-IMAGEOCCLUSION-EDITOR-012
  // @名称 清空全部
  //
  // @作用
  // 清空 遮罩列表 与 创建中矩形，触发重绘。
  //
  // @输入
  // 无。
  //
  // @输出
  // 遮罩列表 = []，创建中矩形 = null
  //
  // @副作用
  // 触发 Canvas 重绘。
  // ========================================================
  private 清空全部(): void {
    this.cancelDrag();
    if (this.遮罩列表.length > 0) this.history.remember(this.遮罩列表);
    this.遮罩列表 = [];
    this.创建中矩形 = null;
    this.拖动模式 = 0;
    this.移动中索引 = -1;
    this.polygonPoints = []; this.annotationText = '';
    this.selectedMask = -1; this.updateHistory();
    this.重绘();
  }

  private updateHistory(): void {
    this.canUndo = this.history.canUndo(); this.canRedo = this.history.canRedo();
    const masks: 遮罩描述[] = this.遮罩列表.filter((mask: 遮罩描述): boolean => mask.形状 !== 'text');
    if (masks.length > 0) this.newInactiveMode = masks.every((mask: 遮罩描述): boolean => maskNumber(mask, 'oi') === 1) ? 1 : 0;
  }
  private redo(): void {
    this.cancelDrag(); this.遮罩列表 = this.history.redo(this.遮罩列表);
    this.selectedMask = -1; this.annotationText = ''; this.updateHistory(); this.重绘();
  }
  private selectOrdinal(ordinal: number): void {
    this.当前选中编号 = ordinal;
    if (this.selectedMask < 0 || this.遮罩列表[this.selectedMask].形状 === 'text') return;
    if (this.遮罩列表[this.selectedMask].编号 === ordinal) return;
    this.history.remember(this.遮罩列表);
    const list: 遮罩描述[] = this.遮罩列表.map(copyMask);
    list[this.selectedMask].编号 = ordinal; list[this.selectedMask].ordinalText = undefined; this.遮罩列表 = list;
    this.updateHistory(); this.重绘();
  }
  private deleteSelected(): void {
    if (this.selectedMask < 0) return;
    this.history.remember(this.遮罩列表);
    this.遮罩列表 = this.遮罩列表.filter((_mask: 遮罩描述, index: number): boolean => index !== this.selectedMask);
    this.selectedMask = -1; this.annotationText = ''; this.updateHistory(); this.重绘();
  }
  private changeTool(kind: string): void {
    this.cancelDrag(); this.shapeKind = kind; this.polygonPoints = []; this.selectedMask = -1; this.annotationText = ''; this.重绘();
  }
  private tapImage(event: GestureEvent): void {
    const point: GesturePointer | null = gesturePointer(event.fingerInfos, event.fingerList);
    if (this.imageFailed || this.图片宽高比 <= 0 || point === null) return;
    const x: number = this.归一化X(point.localX), y: number = this.归一化Y(point.localY);
    if (x < 0 || y < 0 || x > 1 || y > 1) return;
    const hit: number = this.命中遮罩(x, y);
    if (this.shapeKind === 'polygon' && (this.polygonPoints.length > 0 || hit < 0)) {
      this.selectedMask = -1;
      this.polygonPoints = this.polygonPoints.concat([{ x: x, y: y }]); this.重绘(); return;
    }
    this.selectedMask = hit;
    if (this.selectedMask >= 0) {
      const mask: 遮罩描述 = this.遮罩列表[this.selectedMask];
      if (mask.编号 > 0) this.当前选中编号 = mask.编号;
      if (mask.形状 === 'text') { this.shapeKind = 'text'; this.annotationText = maskProperty(mask, 'text'); }
    }
    this.重绘();
  }
  private finishPolygon(): void {
    if (this.polygonPoints.length < 3 || occlusionPolygonArea(this.polygonPoints) < 0.00001) return;
    const points: OcclusionPoint[] = this.polygonPoints;
    const left: number = Math.min(...points.map((p: OcclusionPoint): number => p.x));
    const top: number = Math.min(...points.map((p: OcclusionPoint): number => p.y));
    const mask: 遮罩描述 = { 形状: 'polygon', 左: left, 顶: top,
      宽: Math.max(...points.map((p: OcclusionPoint): number => p.x)) - left,
      高: Math.max(...points.map((p: OcclusionPoint): number => p.y)) - top, 编号: this.当前选中编号 };
    if (mask.宽 < this.最小拖动距离 || mask.高 < this.最小拖动距离) return;
    setMaskProperty(mask, 'oi', String(this.newInactiveMode));
    setMaskProperty(mask, 'points', points.map((p: OcclusionPoint): string => String(p.x) + ',' + String(p.y)).join(' '));
    this.history.remember(this.遮罩列表); this.遮罩列表 = this.遮罩列表.concat([mask]);
    this.polygonPoints = []; this.selectedMask = this.遮罩列表.length - 1; this.updateHistory(); this.重绘();
  }
  private addText(): void {
    if (this.annotationText.trim() === '') return;
    if (this.selectedMask >= 0 && this.遮罩列表[this.selectedMask].形状 === 'text') {
      this.history.remember(this.遮罩列表);
      const masks: 遮罩描述[] = this.遮罩列表.map(copyMask);
      setMaskProperty(masks[this.selectedMask], 'text', this.annotationText);
      this.遮罩列表 = masks; this.annotationText = ''; this.selectedMask = -1; this.updateHistory(); this.重绘(); return;
    }
    const mask: 遮罩描述 = { 形状: 'text', 左: 0.1, 顶: 0.1, 宽: 0.3, 高: 0.06, 编号: 0 };
    setMaskProperty(mask, 'text', this.annotationText); setMaskProperty(mask, 'fs', '0.04');
    setMaskProperty(mask, 'oi', '1');
    this.history.remember(this.遮罩列表); this.遮罩列表 = this.遮罩列表.concat([mask]);
    this.annotationText = ''; this.updateHistory(); this.重绘();
  }

  private setInactiveMode(hideOthers: boolean): void {
    if (this.confirmingClose || this.disposed) return;
    this.cancelDrag();
    this.newInactiveMode = hideOthers ? 1 : 0;
    const masks: 遮罩描述[] = this.遮罩列表.map(copyMask);
    const changed: boolean = masks.some((mask: 遮罩描述): boolean =>
      mask.形状 !== 'text' && maskNumber(mask, 'oi') !== this.newInactiveMode);
    if (!changed) return;
    this.history.remember(this.遮罩列表);
    for (const mask of masks) if (mask.形状 !== 'text') setMaskProperty(mask, 'oi', String(this.newInactiveMode));
    this.遮罩列表 = masks; this.updateHistory(); this.重绘();
  }

  private inactiveMode(hideOthers: boolean): boolean {
    const masks: 遮罩描述[] = this.遮罩列表.filter((mask: 遮罩描述): boolean => mask.形状 !== 'text');
    return masks.length === 0 ? this.newInactiveMode === (hideOthers ? 1 : 0) :
      masks.every((mask: 遮罩描述): boolean => maskNumber(mask, 'oi') === (hideOthers ? 1 : 0));
  }

  @Builder
  private choice(key: string, label: Resource, action: () => void) {
    按下态按钮({ 文案: label, selectable: true, selected: this.toolSelected(key),
      是否启用: !this.confirmingClose, 点击回调: action })
  }

  private toolSelected(key: string): boolean {
    if (key === 'hide_one') return this.inactiveMode(false);
    if (key === 'hide_all') return this.inactiveMode(true);
    return key === this.shapeKind;
  }

  private modeHint(): Resource {
    if (this.inactiveMode(false)) return $r('app.string.io_mode_one_hint');
    if (this.inactiveMode(true)) return $r('app.string.io_mode_all_hint');
    return $r('app.string.io_mode_mixed_hint');
  }
  private resizeSelected(factor: number): void {
    if (this.selectedMask < 0) return;
    const original: 遮罩描述 = this.遮罩列表[this.selectedMask];
    if (!['rect', 'ellipse', 'polygon', 'text'].includes(original.形状)) return;
    const rect: ImageContentRect = this.imageContentRect();
    const bounds: ImageContentRect = this.maskBounds(original);
    if (bounds.width * factor > rect.width || bounds.height * factor > rect.height) return;
    this.history.remember(this.遮罩列表);
    const masks: 遮罩描述[] = this.遮罩列表.map(copyMask), mask: 遮罩描述 = masks[this.selectedMask];
    mask.宽 *= factor; mask.高 *= factor;
    if (mask.形状 === 'polygon') {
      setMaskProperty(mask, 'points', maskPoints(mask).map((p: OcclusionPoint): string => String(p.x * factor) + ',' + String(p.y * factor)).join(' '));
    } else if (mask.形状 === 'text') setMaskProperty(mask, 'scale', String(maskNumber(mask, 'scale', 1) * factor));
    const position: OcclusionPoint = this.positionInsideImage(mask, mask.左, mask.顶);
    mask.左 = position.x; mask.顶 = position.y;
    this.遮罩列表 = masks; this.updateHistory(); this.重绘();
  }

  private rotateSelected(): void {
    if (this.selectedMask < 0 || this.遮罩列表[this.selectedMask].形状 === 'polygon') return;
    this.history.remember(this.遮罩列表);
    const masks: 遮罩描述[] = this.遮罩列表.map(copyMask);
    setMaskProperty(masks[this.selectedMask], 'angle', String((maskNumber(masks[this.selectedMask], 'angle') + 416.666667) % 10000));
    this.遮罩列表 = masks; this.updateHistory(); this.重绘();
  }

  private async requestClose(): Promise<void> {
    if (this.confirmingClose || this.disposed) return;
    this.cancelDrag();
    if (JSON.stringify(this.遮罩列表) === JSON.stringify(this.initialMasks.map(copyMask)) &&
      this.polygonPoints.length === 0 && !this.hasPendingText()) { this.onCancel(); return; }
    this.confirmingClose = true;
    const discard: boolean = await confirmNoteDiscard(this.getUIContext());
    this.confirmingClose = false;
    if (discard && !this.disposed) this.onCancel();
  }

  private hasPendingText(): boolean {
    if (this.annotationText.trim() === '') return false;
    return this.selectedMask < 0 || this.annotationText !== maskProperty(this.遮罩列表[this.selectedMask], 'text');
  }

  private stageSize(): OcclusionEditorSize {
    return occlusionStageSize(this.viewportWidth, this.viewportHeight, this.图片宽高比);
  }

  private cancelPolygon(): void {
    this.polygonPoints = []; this.重绘();
  }

  @Builder
  private groupControls() {
    Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(应用尺寸.间距_8), cross: LengthMetrics.vp(应用尺寸.间距_8) } }) {
      ForEach(this.编号候选列表(), (ordinal: number) => {
        按下态按钮({ 文案: `c${ordinal}`, selectable: true, selected: this.当前选中编号 === ordinal,
          // 色点标识分组，标签与选中描边沿用主题色，避免黄色文字在浅色底上难以辨认。
          markerColor: 编号颜色(ordinal),
          是否启用: !this.confirmingClose, 点击回调: (): void => { this.selectOrdinal(ordinal); } })
      }, (ordinal: number): string => `ordinal-btn-${ordinal}`)
    }.width('100%')
  }

  @Builder
  private imageStage() {
    Row() {
      Stack() {
        Image(this.源图Uri)
          .width('100%').height('100%').objectFit(ImageFit.Contain)
          .onError((): void => { this.imageFailed = true; this.图片宽高比 = 0; })
          .onComplete((e: ImageLoadResult) => {
            if (e.width > 0 && e.height > 0) {
              this.imageFailed = false; this.sourceHeight = e.height;
              this.图片宽高比 = e.width / e.height; this.重绘();
            }
          })
        Canvas(this.上下文)
          .width('100%').height('100%')
          .onReady((): void => { this.refreshCanvas(); })
          .onAreaChange((): void => { this.refreshCanvas(); })
          // 绘图优先于正文滚动；用户可在图片外滚动到下方的文字和操作区。
          .priorityGesture(
            GestureGroup(GestureMode.Exclusive,
              PanGesture({ fingers: 1, distance: 5 })
                .onActionStart((event: GestureEvent): void => { this.拖动开始(event); })
                .onActionUpdate((event: GestureEvent): void => { this.拖动更新(event); })
                .onActionEnd((event: GestureEvent): void => { this.拖动更新(event); this.拖动结束(); })
                .onActionCancel((): void => { this.cancelDrag(); }),
              TapGesture().onAction((event: GestureEvent): void => { this.tapImage(event); })
            )
          )
      }
      .width(this.stageSize().width).height(this.stageSize().height)
      .attributeModifier(new ImageSurfaceStyle())
    }.width('100%').justifyContent(FlexAlign.Center)
  }

  @Builder
  private editorActions() {
    Column({ space: 应用尺寸.间距_8 }) {
      if (this.shapeKind === 'polygon') {
        Text(this.polygonPoints.length > 0 ? $r('app.string.io_polygon_points', this.polygonPoints.length) :
          $r('app.string.io_polygon_hint')).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary'))
        Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(应用尺寸.间距_8), cross: LengthMetrics.vp(应用尺寸.间距_8) } }) {
          按下态按钮({ 文案: $r('app.string.io_finish_polygon'),
            是否启用: !this.confirmingClose && this.polygonPoints.length >= 3 && occlusionPolygonArea(this.polygonPoints) >= 0.00001,
            点击回调: (): void => { this.finishPolygon(); } })
          按下态按钮({ 文案: $r('app.string.io_cancel_polygon'),
            是否启用: !this.confirmingClose && this.polygonPoints.length > 0,
            点击回调: (): void => { this.cancelPolygon(); } })
        }.width('100%')
      }
      if (this.shapeKind === 'text') {
        Text($r('app.string.io_text_hint')).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary'))
        TextArea({ text: this.annotationText, placeholder: $r('app.string.io_text') })
          .attributeModifier(new FormTextAreaStyle()).height(应用尺寸.按钮高度 * 2).enabled(!this.confirmingClose)
          .onChange((text: string): void => { this.annotationText = text; })
        按下态按钮({ 文案: this.selectedMask >= 0 && this.遮罩列表[this.selectedMask].形状 === 'text' ?
          $r('app.string.io_update_text') : $r('app.string.io_add_text'),
          是否启用: !this.confirmingClose && this.annotationText.trim() !== '' && this.hasPendingText(),
          点击回调: (): void => { this.addText(); } })
      }
      if (this.selectedMask >= 0) {
        Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(应用尺寸.间距_8), cross: LengthMetrics.vp(应用尺寸.间距_8) } }) {
          按下态按钮({ 文案: $r('app.string.io_smaller'), 是否启用: !this.confirmingClose,
            点击回调: (): void => { this.resizeSelected(0.9); } })
          按下态按钮({ 文案: $r('app.string.io_larger'), 是否启用: !this.confirmingClose,
            点击回调: (): void => { this.resizeSelected(1.1); } })
          if (this.遮罩列表[this.selectedMask].形状 !== 'polygon') {
            按下态按钮({ 文案: $r('app.string.io_rotate'), 是否启用: !this.confirmingClose,
              点击回调: (): void => { this.rotateSelected(); } })
          }
          按下态按钮({ 文案: $r('app.string.io_delete_selected'), 字色: $r('app.color.error_text'),
            是否启用: !this.confirmingClose, 点击回调: (): void => { this.deleteSelected(); } })
        }.width('100%')
      }
      Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(应用尺寸.间距_8), cross: LengthMetrics.vp(应用尺寸.间距_8) } }) {
        按下态按钮({ 文案: $r('app.string.image_occlusion_undo'),
          是否启用: !this.confirmingClose && (this.canUndo || this.polygonPoints.length > 0),
          点击回调: (): void => { this.撤销最后一个(); } })
        按下态按钮({ 文案: $r('app.string.io_redo'), 是否启用: !this.confirmingClose && this.canRedo,
          点击回调: (): void => { this.redo(); } })
        按下态按钮({ 文案: $r('app.string.image_occlusion_clear'), 字色: $r('app.color.error_text'),
          是否启用: !this.confirmingClose && (this.遮罩列表.length > 0 || this.polygonPoints.length > 0 || this.annotationText !== ''),
          点击回调: (): void => { this.清空全部(); } })
      }.width('100%')
      Text($r('app.string.io_group_hint')).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary'))
      Text($r('app.string.image_occlusion_hint')).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary'))
      if (this.imageFailed) Text($r('app.string.note_image_preview_failed')).fontColor($r('app.color.error_text'))
    }.width('100%').alignItems(HorizontalAlign.Start)
  }

  build() {
    Column({ space: 应用尺寸.间距_12 }) {
      DialogHeader({
        title: $r('app.string.add_note_image_occlusion_edit_masks'),
        actionLabel: $r('app.string.image_occlusion_confirm'),
        actionEnabled: !this.confirmingClose && !this.imageFailed && this.图片宽高比 > 0 && this.拖动模式 === 0 && this.polygonPoints.length === 0 && !this.hasPendingText(),
        closeLabel: $r('app.string.image_occlusion_cancel'),
        onClose: (): void => { this.requestClose(); },
        onAction: (): void => { this.onConfirm(this.遮罩列表.map(copyMask)); }
      })
      Scroll() {
        Column({ space: 应用尺寸.间距_8 }) {
          this.groupControls()
          Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(应用尺寸.间距_8), cross: LengthMetrics.vp(应用尺寸.间距_8) } }) {
            this.choice('rect', $r('app.string.io_rect'), (): void => { this.changeTool('rect'); })
            this.choice('ellipse', $r('app.string.io_ellipse'), (): void => { this.changeTool('ellipse'); })
            this.choice('polygon', $r('app.string.io_polygon'), (): void => { this.changeTool('polygon'); })
            this.choice('text', $r('app.string.io_text'), (): void => { this.changeTool('text'); })
          }.width('100%')
          Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(应用尺寸.间距_8), cross: LengthMetrics.vp(应用尺寸.间距_8) } }) {
            this.choice('hide_one', $r('app.string.io_hide_one'), (): void => { this.setInactiveMode(false); })
            this.choice('hide_all', $r('app.string.io_hide_all'), (): void => { this.setInactiveMode(true); })
          }.width('100%')
          Text(this.modeHint()).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary'))
          this.imageStage()
          this.editorActions()
        }.width('100%').alignItems(HorizontalAlign.Start)
      }.layoutWeight(1).width('100%').scrollBar(BarState.Auto).align(Alignment.TopStart)
        .onAreaChange((_old: Area, area: Area): void => {
          this.viewportWidth = Number(area.width); this.viewportHeight = Number(area.height);
        })
    }
    .width('100%').height('100%').padding(应用尺寸.卡片内边距)
  }
}
