// SPDX-License-Identifier: AGPL-3.0-or-later
import { ThemeTextSpans } from './common/ThemeText';
import { THEME_TEXT_COLORS_KEY } from '../model/ThemeCatalog';

// 学习页手写白板层：实验性功能。
// 用户在「更多」菜单点「手写」进入；按下后在学习页卡片区 Stack 顶层叠加本层。
// 用 Canvas + PanGesture 接收触摸，记录笔迹数组，提供关闭 / 撤销 / 清空。
// 不实现保存截图（需要 componentSnapshot + 临时文件 + 权限，超出本轮范围）。
// 退出时笔迹丢失，与"草稿纸"语义一致。

import { 应用尺寸 } from '../utils/应用尺寸';
import { 颜色键 } from '../model/颜色主题';

interface 坐标点 {
  x: number;
  y: number;
}

@Component
export struct 学习手写白板层 {
  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  @Prop 是否深色: boolean = false;
  onClose: () => void = (): void => {};
  @StorageProp(颜色键.动作主色) private 动作主色: string = '#2F5FD0';
  // 状态栏高度：学习页沉浸式全屏，白板层铺满根 Stack，工具栏需下移避让状态栏
  @StorageProp('状态栏高度') private 状态栏高度: number = 0;
  private 上下文: CanvasRenderingContext2D = new CanvasRenderingContext2D(new RenderingContextSettings(true));
  private 画布宽: number = 0;
  private 画布高: number = 0;
  @State private 笔迹数组: Array<Array<坐标点>> = [];
  @State private 当前笔迹: Array<坐标点> = [];

  private 重绘(): void {
    const ctx: CanvasRenderingContext2D = this.上下文;
    ctx.clearRect(0, 0, this.画布宽, this.画布高);
    ctx.strokeStyle = this.动作主色;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i: number = 0; i < this.笔迹数组.length; i++) {
      const 笔迹: Array<坐标点> = this.笔迹数组[i];
      if (笔迹.length < 2) {
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(笔迹[0].x, 笔迹[0].y);
      for (let j: number = 1; j < 笔迹.length; j++) {
        ctx.lineTo(笔迹[j].x, 笔迹[j].y);
      }
      ctx.stroke();
    }
    // 当前正在画的笔迹也要画（拖动中尚未提交到 笔迹数组）
    if (this.当前笔迹.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(this.当前笔迹[0].x, this.当前笔迹[0].y);
      for (let j: number = 1; j < this.当前笔迹.length; j++) {
        ctx.lineTo(this.当前笔迹[j].x, this.当前笔迹[j].y);
      }
      ctx.stroke();
    }
  }

  build() {
    // alignContent 必须显式设为 Top：Stack 默认 Center，会把工具栏摆到页面中间
    Stack({ alignContent: Alignment.Top }) {
      // 半透明背景：让用户能看到下层卡片，同时区分白板模式
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor(this.是否深色 ? 'rgba(16,21,29,0.4)' : 'rgba(245,247,250,0.6)')

      Canvas(this.上下文)
        .width('100%')
        .height('100%')
        .onReady((): void => {
          // Canvas 自身 width/height = 100%，画布尺寸由 onAreaChange 提供并触发重绘
        })
        .onAreaChange((_旧: Area, 新区域: Area) => {
          const 宽: number = typeof 新区域.width === 'number'
            ? 新区域.width : parseInt(新区域.width as string, 10);
          const 高: number = typeof 新区域.height === 'number'
            ? 新区域.height : parseInt(新区域.height as string, 10);
          if (!Number.isNaN(宽) && !Number.isNaN(高)) {
            this.画布宽 = 宽;
            this.画布高 = 高;
            this.重绘();
          }
        })
        .gesture(
          PanGesture()
            .onActionStart((event: GestureEvent): void => {
              if (event.fingerList.length === 0) {
                return;
              }
              this.当前笔迹 = [];
              const 点x: number = event.fingerList[0].localX;
              const 点y: number = event.fingerList[0].localY;
              this.当前笔迹.push({ x: 点x, y: 点y } as 坐标点);
            })
            .onActionUpdate((event: GestureEvent): void => {
              if (event.fingerList.length === 0) {
                return;
              }
              const 点x: number = event.fingerList[0].localX;
              const 点y: number = event.fingerList[0].localY;
              this.当前笔迹.push({ x: 点x, y: 点y } as 坐标点);
              // 增量画线段，避免每次完整重绘
              const ctx: CanvasRenderingContext2D = this.上下文;
              ctx.strokeStyle = this.动作主色;
              ctx.lineWidth = 3;
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              const 长度: number = this.当前笔迹.length;
              if (长度 >= 2) {
                ctx.beginPath();
                ctx.moveTo(this.当前笔迹[长度 - 2].x, this.当前笔迹[长度 - 2].y);
                ctx.lineTo(this.当前笔迹[长度 - 1].x, this.当前笔迹[长度 - 1].y);
                ctx.stroke();
              }
            })
            .onActionEnd((): void => {
              if (this.当前笔迹.length >= 2) {
                this.笔迹数组.push(this.当前笔迹);
              }
              this.当前笔迹 = [];
            })
        )

      // 顶部工具栏
      Row() {
        Button($r('app.string.study_whiteboard_close'))
          .height(应用尺寸.按钮高度)
          .padding({ left: 应用尺寸.卡片内边距, right: 应用尺寸.卡片内边距 })
          .fontSize(应用尺寸.字号_按钮)
          .fontColor($r('app.color.text_primary'))
          .backgroundColor($r('app.color.surface_card'))
          .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
          .borderRadius(应用尺寸.圆角_胶囊)
          .onClick((): void => {
            this.笔迹数组 = [];
            this.当前笔迹 = [];
            this.onClose();
          })

        Blank()

        Button() {
          Text() { ThemeTextSpans($r('app.string.image_occlusion_undo'), this.themeAccentColors, this.getUIContext()) }.fontSize(应用尺寸.字号_按钮).fontColor(this.动作主色)
        }
          .height(应用尺寸.按钮高度)
          .padding({ left: 应用尺寸.卡片内边距, right: 应用尺寸.卡片内边距 })
          .fontSize(应用尺寸.字号_按钮)
          .fontColor(this.动作主色)
          .backgroundColor($r('app.color.surface_card'))
          .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
          .borderRadius(应用尺寸.圆角_胶囊)
          .onClick((): void => {
            if (this.笔迹数组.length > 0) {
              this.笔迹数组.pop();
              this.重绘();
            }
          })
          .margin({ right: 应用尺寸.间距_8 })

        Button() {
          Text() { ThemeTextSpans($r('app.string.study_whiteboard_clear'), this.themeAccentColors, this.getUIContext()) }.fontSize(应用尺寸.字号_按钮).fontColor(this.动作主色)
        }
          .height(应用尺寸.按钮高度)
          .padding({ left: 应用尺寸.卡片内边距, right: 应用尺寸.卡片内边距 })
          .fontSize(应用尺寸.字号_按钮)
          .fontColor(this.动作主色)
          .backgroundColor($r('app.color.surface_card'))
          .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
          .borderRadius(应用尺寸.圆角_胶囊)
          .onClick((): void => {
            this.笔迹数组 = [];
            this.当前笔迹 = [];
            this.重绘();
          })
      }
      .width('100%')
      .height(应用尺寸.工具栏高度)
      .margin({ top: this.状态栏高度 })
      .padding({
        left: 应用尺寸.页面内边距_水平,
        right: 应用尺寸.页面内边距_水平,
        top: 应用尺寸.间距_8,
        bottom: 应用尺寸.间距_8
      })
      .alignItems(VerticalAlign.Center)
    }
    .width('100%')
    .height('100%')
  }
}
