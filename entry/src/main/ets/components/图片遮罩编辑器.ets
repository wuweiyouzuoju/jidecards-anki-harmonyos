// SPDX-License-Identifier: AGPL-3.0-or-later

import { DialogHeader } from './common/DialogHeader';
// ========================================================
// @块ID COMP-IMAGEOCCLUSION-EDITOR-001
// @名称 图片遮罩编辑器
//
// @作用
// Image Occlusion 笔记类型的建卡遮罩编辑器。在源图上叠加 Canvas，
// 用户拖拽创建矩形遮罩、拖拽移动已有遮罩，
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
// 仅支持 rect 形状（spec §3.4 明确不在本次范围：ellipse/polygon/text）。
// 坐标全部归一化 0-1（与 Anki 后端协议一致），调用 生成Occlusions字符串 时
// 由该函数负责格式化为 {{cN::image-occlusion:rect:left=..:top=..:width=..:height=..}}。
// 编号 c1-c5 由顶部按钮组切换，越界值由调用方保证（编辑器不强校验）。
// 图片完整居中显示；绘制和触摸均以 Contain 后的图像区域换算，排除留白。
// 删除遮罩走顶部"撤销/清空"按钮，不在遮罩右上角画 × 删除按钮（2026-07-28 改）。
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
  @Prop 是否深色: boolean = false;
  onConfirm: (遮罩列表: 遮罩描述[]) => void = (_l: 遮罩描述[]): void => {};
  onCancel: () => void = (): void => {};

  // 已落定的遮罩列表（每次变更重新赋值整个数组以触发 @State）
  @State 遮罩列表: 遮罩描述[] = [];
  // 当前选中编号 1-5，决定新画矩形的 ordinal
  @State 当前选中编号: number = 1;
  // 图片加载前不允许绘制，避免用占位比例保存错误坐标。
  @State 图片宽高比: number = 0;
  // onReady 读取实际画布尺寸，初始化和尺寸变化均同步重绘。
  @State 画布宽: number = 0;
  @State 画布高: number = 0;
  @State 画布就绪: boolean = false;

  // 拖动状态：0=空闲 1=创建中 2=移动中
  @State 拖动模式: number = 0;
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
    this.拖动模式 = 0;
    this.创建中矩形 = null;
    this.移动中索引 = -1;
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
  // 顶部按钮组 ForEach 数据源：c1-c5 固定 5 个 ordinal。
  //
  // @输入
  // 无。
  //
  // @输出
  // number[] [1,2,3,4,5]
  //
  // @副作用
  // 无。
  // ========================================================
  private 编号候选列表(): number[] {
    return [1, 2, 3, 4, 5];
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
      if (归一化X >= m.左 && 归一化X <= m.左 + m.宽
        && 归一化Y >= m.顶 && 归一化Y <= m.顶 + m.高) {
        return i;
      }
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
  // GestureEvent（含 fingerList[0].localX/localY，vp 单位）
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
    if (!this.画布就绪 || this.画布宽 <= 0 || this.画布高 <= 0
      || this.图片宽高比 <= 0 || event.fingerList.length === 0) {
      return;
    }
    const x: number = this.归一化X(event.fingerList[0].localX);
    const y: number = this.归一化Y(event.fingerList[0].localY);
    if (x < 0 || x > 1 || y < 0 || y > 1) {
      return;
    }

    // 1. 命中已有遮罩 → 移动
    const 命中索引: number = this.命中遮罩(x, y);
    if (命中索引 >= 0) {
      this.拖动模式 = 2;
      this.移动中索引 = 命中索引;
      const m: 遮罩描述 = this.遮罩列表[命中索引];
      this.移动偏移归一化X = x - m.左;
      this.移动偏移归一化Y = y - m.顶;
      // 切换当前选中编号到被拖动矩形的编号，便于用户继续画同色矩形
      this.当前选中编号 = m.编号;
      return;
    }

    // 2. 空白区 → 创建
    this.拖动模式 = 1;
    this.创建起点归一化X = x;
    this.创建起点归一化Y = y;
    this.创建中矩形 = {
      形状: 'rect',
      左: x,
      顶: y,
      宽: 0,
      高: 0,
      编号: this.当前选中编号
    };
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
    if (this.拖动模式 === 0 || event.fingerList.length === 0) {
      return;
    }
    const x: number = Math.max(0, Math.min(1, this.归一化X(event.fingerList[0].localX)));
    const y: number = Math.max(0, Math.min(1, this.归一化Y(event.fingerList[0].localY)));

    if (this.拖动模式 === 1 && this.创建中矩形 !== null) {
      this.创建中矩形 = {
        形状: 'rect',
        左: Math.min(this.创建起点归一化X, x),
        顶: Math.min(this.创建起点归一化Y, y),
        宽: Math.abs(x - this.创建起点归一化X),
        高: Math.abs(y - this.创建起点归一化Y),
        编号: this.当前选中编号
      };
      this.重绘();
      return;
    }

    if (this.拖动模式 === 2 && this.移动中索引 >= 0) {
      const m: 遮罩描述 = this.遮罩列表[this.移动中索引];
      const 新左: number = Math.max(0, Math.min(1 - m.宽, x - this.移动偏移归一化X));
      const 新顶: number = Math.max(0, Math.min(1 - m.高, y - this.移动偏移归一化Y));
      const 新列表: 遮罩描述[] = [];
      for (let i: number = 0; i < this.遮罩列表.length; i++) {
        if (i === this.移动中索引) {
          新列表.push({
            形状: 'rect',
            左: 新左,
            顶: 新顶,
            宽: m.宽,
            高: m.高,
            编号: m.编号
          });
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
    if (this.拖动模式 === 1 && this.创建中矩形 !== null) {
      if (this.创建中矩形.宽 >= this.最小拖动距离 && this.创建中矩形.高 >= this.最小拖动距离) {
        const 新列表: 遮罩描述[] = [];
        for (let i: number = 0; i < this.遮罩列表.length; i++) {
          新列表.push(this.遮罩列表[i]);
        }
        新列表.push(this.创建中矩形);
        this.遮罩列表 = 新列表;
      }
      this.创建中矩形 = null;
    }
    this.拖动模式 = 0;
    this.移动中索引 = -1;
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
      this.绘制遮罩(this.遮罩列表[i], false);
    }
    if (this.创建中矩形 !== null) {
      this.绘制遮罩(this.创建中矩形, true);
    }
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
  // alpha 通过 hex 拼接 #RRGGBBAA 实现（已落定 '55' / 创建中 '88'）。
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
    const 像素宽: number = 遮罩.宽 * rect.width;
    const 像素高: number = 遮罩.高 * rect.height;
    const 颜色: string = 编号颜色(遮罩.编号);

    // 半透明填充：创建中态更淡
    ctx.fillStyle = 颜色 + (创建中 ? '88' : '55');
    ctx.fillRect(像素左, 像素顶, 像素宽, 像素高);

    // 实线边框
    ctx.strokeStyle = 颜色;
    ctx.lineWidth = 2;
    ctx.strokeRect(像素左, 像素顶, 像素宽, 像素高);
  }

  // ========================================================
  // @块ID COMP-IMAGEOCCLUSION-EDITOR-011
  // @名称 撤销最后一个
  //
  // @作用
  // 移除 遮罩列表 中最后一个遮罩（最近画的）。
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
    if (this.遮罩列表.length === 0) {
      return;
    }
    const 新列表: 遮罩描述[] = [];
    for (let i: number = 0; i < this.遮罩列表.length - 1; i++) {
      新列表.push(this.遮罩列表[i]);
    }
    this.遮罩列表 = 新列表;
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
    this.遮罩列表 = [];
    this.创建中矩形 = null;
    this.拖动模式 = 0;
    this.移动中索引 = -1;
    this.重绘();
  }

  build() {
    Column({ space: 应用尺寸.间距_12 }) {
      DialogHeader({
        title: $r('app.string.add_note_image_occlusion_edit_masks'),
        actionLabel: $r('app.string.image_occlusion_confirm'),
        actionEnabled: this.遮罩列表.length > 0,
        closeLabel: $r('app.string.image_occlusion_cancel'),
        onClose: (): void => { this.onCancel(); },
        onAction: (): void => { this.onConfirm(this.遮罩列表); }
      })
      // 编号与操作分行，避免窄屏及英文按钮的固有宽度挤出清空按钮。
      Row({ space: 应用尺寸.间距_8 }) {
        ForEach(this.编号候选列表(), (编号: number) => {
          Button(`c${编号}`)
            .type(ButtonType.Normal)
            .layoutWeight(1)
            .padding({ left: 0, right: 0 })
            .height(应用尺寸.按钮高度)
            .fontSize(应用尺寸.字号_按钮)
            .fontColor('#FFFFFF')
            .backgroundColor(编号颜色(编号))
            .border({
              width: this.当前选中编号 === 编号 ? 3 : 0,
              color: '#FFFFFF'
            })
            .borderRadius(应用尺寸.圆角_胶囊)
            .onClick((): void => {
              this.当前选中编号 = 编号;
            })
        }, (编号: number): string => `ordinal-btn-${编号}`)
      }
      .width('100%')

      Row({ space: 应用尺寸.间距_8 }) {
        Button($r('app.string.image_occlusion_undo'))
          .type(ButtonType.Normal)
          .layoutWeight(1)
          .height(应用尺寸.按钮高度)
          .fontSize(应用尺寸.字号_按钮)
          .fontColor($r('app.color.text_primary'))
          .backgroundColor($r('app.color.surface_card'))
          .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
          .borderRadius(应用尺寸.圆角_胶囊)
          .enabled(this.遮罩列表.length > 0)
          .onClick((): void => { this.撤销最后一个(); })

        Button($r('app.string.image_occlusion_clear'))
          .type(ButtonType.Normal)
          .layoutWeight(1)
          .height(应用尺寸.按钮高度)
          .fontSize(应用尺寸.字号_按钮)
          .fontColor($r('app.color.error_text'))
          .backgroundColor($r('app.color.surface_card'))
          .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
          .borderRadius(应用尺寸.圆角_胶囊)
          .enabled(this.遮罩列表.length > 0)
          .onClick((): void => { this.清空全部(); })
      }
      .width('100%')

      // ---- 提示文本 ----
      Text($r('app.string.image_occlusion_hint'))
        .fontSize(应用尺寸.字号_正文_小)
        .fontColor($r('app.color.text_secondary'))
        .width('100%')

      // ---- 图片底图 + Canvas 覆盖层 ----
      // 宽高同时受剩余可视区域约束，横图、长图均完整显示。
      Stack() {
        Image(this.源图Uri)
          .width('100%')
          .height('100%')
          .objectFit(ImageFit.Contain)
          .onComplete((e: ImageLoadResult) => {
            if (e.width > 0 && e.height > 0) {
              this.图片宽高比 = e.width / e.height;
              this.重绘();
            }
          })

        Canvas(this.上下文)
          .width('100%')
          .height('100%')
          .onReady((): void => {
            this.refreshCanvas();
          })
          .gesture(
            PanGesture()
              .onActionStart((event: GestureEvent): void => { this.拖动开始(event); })
              .onActionUpdate((event: GestureEvent): void => { this.拖动更新(event); })
              .onActionEnd((event: GestureEvent): void => {
                this.拖动更新(event);
                this.拖动结束();
              })
              .onActionCancel((): void => { this.cancelDrag(); })
          )
      }
      .layoutWeight(1)
      .width('100%')
      .backgroundColor(this.是否深色 ? '#000000' : '#F5F5F5')
      .borderRadius(应用尺寸.圆角_面板)
      .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })

    }
    .width('100%')
    .height('100%')
    .padding(应用尺寸.卡片内边距)
  }
}
