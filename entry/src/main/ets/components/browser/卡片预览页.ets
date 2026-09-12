// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID UI-BROWSER-PREVIEW-001
// @名称 卡片预览页
//
// @作用
// 浏览页 T5 全屏卡片预览弹层：纯展示层，用 Web 组件复用 学习页 的渲染链路
// （卡片渲染服务.渲染既有卡片 + 学习卡片HTML构建器）渲染卡片正反面。
// 支持点击翻面、左右滑切换上下张卡（基于父级下发的卡片ID列表），
// 底部「编辑字段」按钮经 onEditField 回调上抛，由父级打开 浏览编辑区。
//
// @输入
// isDark: 是否深色主题
// 卡片ID列表: 当前搜索结果对应的卡片ID数组（左右滑遍历此数组）
// 初始索引: 打开时聚焦的卡片在 列表 中的位置
// 媒体目录: 沙箱 collection.media 绝对路径（onInterceptRequest 映射用）
//
// @输出
// onClose: 关闭预览回调
// onEditField: 编辑字段回调（参数为当前预览的卡片ID，父级据此加载笔记并打开编辑区）
//
// @Invariants
// - 本组件不直接调后端写入，渲染只读；编辑经 onEditField 回调上抛
// - Web 组件 src 必须为空字符串（BUG-008 修复：避免与 loadData 竞争白屏）
// - 控制器未 attach 时缓存 HTML，onControllerAttached 回调消费（规避 aboutToAppear
//   异步链调 loadData 时 Web 未 attach 的白屏时序坑）
// - 媒体经 媒体基地址 自建域名 + onInterceptRequest 映射到沙箱 collection.media/
//
// @Extension Points
// - 后续可扩展键盘快捷键（左右方向键切卡、空格翻面）
// - 后续可扩展双指缩放卡片内容
//
// @副作用
// 通过 卡片渲染服务 间接调用 NAPI 桥读 Anki collection（只读渲染）。
// ========================================================

import { webview } from '@kit.ArkWeb';
import { interceptMathAsset } from '../../utils/MathAssetResponse';
import { 卡片渲染服务 } from '../../backend/卡片渲染服务';
import type { RenderedCard } from '../../proto/messages/CardRenderingMessages';
import {
  构建卡片HTML,
  媒体基地址,
  剥除拼写标记,
  type 卡片正反面
} from '../../model/学习卡片HTML构建器';
import { 解码文件名, 取MIME类型, 读取媒体文件 } from '../../utils/媒体响应助手';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 取全屏转场曲线, 取全屏转场时长 } from '../../utils/转场时长';
import { 颜色键 } from '../../model/颜色主题';
import { 按下态按钮 } from '../common/按下态按钮';

/** 预览阶段：正面 / 背面 */
type 预览面 = 'question' | 'answer';

@Component
export struct 卡片预览页 {
  @Prop isDark: boolean = false;
  @Prop 卡片ID列表: number[] = [];
  @Prop 初始索引: number = 0;
  @Prop 媒体目录: string = '';
  @Prop @Watch('预览刷新版本变化') 刷新版本: number = 0;
  onClose: () => void = (): void => {};
  onEditField: (卡片ID: number) => void = (_卡片ID: number): void => {};

  private readonly 网页控制器: webview.WebviewController = new webview.WebviewController();
  private readonly 卡片渲染服务实例: 卡片渲染服务 = new 卡片渲染服务();
  private 已渲染: RenderedCard | null = null;
  /** 控制器未 attach 时缓存的待加载 HTML（规避 aboutToAppear 异步链白屏时序坑）。 */
  private 待加载HTML: string = '';

  @State private 当前索引值: number = 0;
  @State private 当前面: 预览面 = 'question';
  @State private 正面HTML: string = '';
  @State private 背面HTML: string = '';
  @State private 错误详情: string = '';
  @State private 忙碌: boolean = false;
  @State private 控制器已挂载: boolean = false;

  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景: string = '#2F5FD0';
  @StorageProp(颜色键.主色容器) private 主色容器色: string = '#E8EEFC';
  // 状态栏高度（沉浸式全屏下，预览层全屏铺开，顶部条需让出状态栏区域，与主页顶栏同一水平面）
  @StorageProp('状态栏高度') private 状态栏高度: number = 0;
  // 手势导航条高度（底部固定操作区需整体抬高，避免按钮落入系统手势区域）
  @StorageProp('导航条高度') private 导航条高度: number = 0;
  @State private 已按下编辑: boolean = false;

  aboutToAppear(): void {
    this.当前索引值 = this.初始索引;
    this.加载当前卡();
  }

  /** 字段保存后父级递增刷新版本，重新渲染当前仍在预览中的卡片。 */
  private 预览刷新版本变化(): void {
    this.加载当前卡();
  }

  /** 取当前预览的卡片ID（基于 当前索引值 从 卡片ID列表 取）。 */
  private 取当前卡片ID(): number {
    if (this.卡片ID列表.length === 0) {
      return 0;
    }
    const 索引: number = this.当前索引值;
    if (索引 < 0 || 索引 >= this.卡片ID列表.length) {
      return 0;
    }
    return this.卡片ID列表[索引];
  }

  // ========================================================
  // @名称 加载当前卡
  //
  // @作用
  // 调 卡片渲染服务.渲染既有卡片 渲染当前卡片，组装正反面 HTML 并加载到 Web。
  // 切换卡片或首次打开时调用；加载期间显示 loading 覆盖层。
  //
  // @输入
  // 无（使用 当前索引值 + 卡片ID列表）
  //
  // @输出
  // 成功 → 设 正面HTML / 背面HTML / 当前面='question'，加载正面到 Web
  // 失败 → 设 错误详情，显示错误覆盖层
  //
  // @业务规则
  // - 正面始终剥除拼写标记（预览不渲染输入框占位，与学习页同语义）
  // - 背面也剥除拼写标记（预览不收集用户输入，无需比对结果）
  // - 控制器未 attach 时缓存 HTML，onControllerAttached 回调消费
  //
  // @副作用
  // 调后端 渲染既有卡片；调 Web 控制器 loadData
  // ========================================================
  private async 加载当前卡(): Promise<void> {
    const 卡片ID: number = this.取当前卡片ID();
    if (卡片ID === 0) {
      this.错误详情 = this.取本地化文案($r('app.string.browser_preview_load_error'));
      return;
    }
    this.忙碌 = true;
    this.错误详情 = '';
    this.当前面 = 'question';
    this.正面HTML = '';
    this.背面HTML = '';
    this.已渲染 = null;
    this.待加载HTML = '';
    try {
      this.已渲染 = await this.卡片渲染服务实例.渲染既有卡片(卡片ID);
      // 预览正反面都剥除拼写标记（不收集输入，不渲染输入框占位）
      this.正面HTML = 剥除拼写标记(构建卡片HTML(this.已渲染, 'question', this.isDark));
      this.背面HTML = 剥除拼写标记(构建卡片HTML(this.已渲染, 'answer', this.isDark));
      this.应用HTML(this.正面HTML);
    } catch (错误) {
      this.错误详情 = this.取本地化文案($r('app.string.browser_preview_load_error'));
      console.info(`卡片预览页: 加载卡片失败 cid=${卡片ID} 错误=${错误}`);
    } finally {
      this.忙碌 = false;
    }
  }

  /**
   * 应用 HTML 到 Web 组件：控制器已 attach 时直接 loadData，否则缓存到 待加载HTML
   * 由 onControllerAttached 回调消费。规避 aboutToAppear 异步链调 loadData 时
   * Web 未 attach 的白屏时序坑（PROJECT_CONTEXT.md「Web 组件 attach 时序」）。
   */
  private 应用HTML(html: string): void {
    if (this.控制器已挂载) {
      try {
        this.网页控制器.loadData(html, 'text/html', 'UTF-8', 媒体基地址, ' ');
      } catch (错误) {
        console.info(`卡片预览页: loadData 失败 错误=${错误}`);
      }
    } else {
      this.待加载HTML = html;
    }
  }

  /** Web 控制器 attach 回调：消费缓存的待加载 HTML。 */
  private onControllerAttached回调(): void {
    this.控制器已挂载 = true;
    if (this.待加载HTML !== '') {
      const 缓存: string = this.待加载HTML;
      this.待加载HTML = '';
      try {
        this.网页控制器.loadData(缓存, 'text/html', 'UTF-8', 媒体基地址, ' ');
      } catch (错误) {
        console.info(`卡片预览页: onControllerAttached loadData 失败 错误=${错误}`);
      }
    }
  }

  /** 翻面：正面↔背面，加载对应 HTML 到 Web。 */
  private 翻面(): void {
    if (this.忙碌 || this.错误详情 !== '') {
      return;
    }
    this.当前面 = this.当前面 === 'question' ? 'answer' : 'question';
    const html: string = this.当前面 === 'question' ? this.正面HTML : this.背面HTML;
    this.应用HTML(html);
  }

  /** 上一张：索引 -1，边界处不回绕。 */
  private 上一张(): void {
    if (this.忙碌 || this.当前索引值 <= 0) {
      return;
    }
    this.当前索引值 -= 1;
    this.加载当前卡();
  }

  /** 下一张：索引 +1，边界处不回绕。 */
  private 下一张(): void {
    if (this.忙碌 || this.当前索引值 >= this.卡片ID列表.length - 1) {
      return;
    }
    this.当前索引值 += 1;
    this.加载当前卡();
  }

  /** 处理左右滑手势：基于角度判断方向，左滑=下一张，右滑=上一张。 */
  private 处理滑动手势(角度: number): void {
    // ArkUI GestureEvent.angle：屏幕坐标系（y 轴朝下），0°=右，90°=下，180°=左，270°=上。
    // 已通过 SwipeDirection.Horizontal 过滤，只需区分左右：
    // 规范到 [0, 360)，<90 或 >270 视为右滑 → 上一张；其余视为左滑 → 下一张。
    const 正向角: number = ((角度 % 360) + 360) % 360;
    if (正向角 < 90 || 正向角 > 270) {
      this.上一张();
    } else {
      this.下一张();
    }
  }

  /** 编辑字段：经 onEditField 回调上抛当前卡片ID，由父级打开 浏览编辑区。 */
  private 请求编辑字段(): void {
    const 卡片ID: number = this.取当前卡片ID();
    if (卡片ID === 0) {
      return;
    }
    this.onEditField(卡片ID);
  }

  /** 读取本地化文案，context 不可用时回退空串。 */
  private 取本地化文案(资源: Resource): string {
    try {
      return this.getUIContext().getHostContext()!.resourceManager.getStringSync(资源.id);
    } catch (_错误) {
      return '';
    }
  }

  /** 取位置计数文案（"3 / 45"）。 */
  private 取位置文案(): string {
    if (this.卡片ID列表.length === 0) {
      return '';
    }
    const 模板: string = this.取本地化文案($r('app.string.browser_preview_position'));
    return 模板
      .replace('%d', String(this.当前索引值 + 1))
      .replace('%d', String(this.卡片ID列表.length));
  }

  // ========================================================
  // @名称 拦截媒体
  //
  // @作用
  // 拦截自建域名请求 → 沙箱媒体文件；未命中返回 null 放行。
  // 与 学习页.拦截媒体 同实现（复用 媒体响应助手）。
  //
  // @输入
  // event: OnInterceptRequestEvent
  //
  // @输出
  // WebResourceResponse 或 null（放行）
  //
  // @副作用
  // 读沙箱文件
  // ========================================================
  private 拦截媒体(event: OnInterceptRequestEvent): WebResourceResponse | null {
    const url: string = event.request.getRequestUrl();
    if (!url.startsWith(媒体基地址)) {
      return null;
    }
    const fileName: string = decodeURIComponent(url.substring(媒体基地址.length));
    if (fileName.length === 0) {
      const blank: WebResourceResponse = new WebResourceResponse();
      blank.setResponseData('<!DOCTYPE html><html><body></body></html>');
      blank.setResponseMimeType('text/html');
      blank.setResponseEncoding('UTF-8');
      blank.setResponseCode(200);
      blank.setReasonMessage('OK');
      return blank;
    }
    const data: ArrayBuffer | null = 读取媒体文件(this.媒体目录, fileName);
    if (data === null) {
      const notFound: WebResourceResponse = new WebResourceResponse();
      notFound.setResponseCode(404);
      notFound.setReasonMessage('Not Found');
      notFound.setResponseData('');
      notFound.setResponseMimeType('text/plain');
      notFound.setResponseEncoding('UTF-8');
      return notFound;
    }
    const response: WebResourceResponse = new WebResourceResponse();
    response.setResponseData(data);
    response.setResponseMimeType(取MIME类型(fileName));
    response.setResponseCode(200);
    response.setReasonMessage('OK');
    return response;
  }

  @Builder
  private 顶部条() {
    Row() {
      Row() {
        Text(this.取位置文案())
          .fontSize(应用尺寸.字号_正文_中)
          .fontColor($r('app.color.text_primary'))
          .fontWeight(FontWeight.Medium)
          .maxLines(1)
      }
      .width('35%')
      .justifyContent(FlexAlign.Start)

      Row() {
        Text($r('app.string.browser_preview_title'))
          .fontSize(应用尺寸.字号_正文_中)
          .fontColor($r('app.color.text_secondary'))
          .textAlign(TextAlign.Center)
          .maxLines(1)
      }
      .width('30%')
      .justifyContent(FlexAlign.Center)

      Row() {
        // 与主页“更多”复用同一按下态按钮，保持尺寸、描边和反馈一致。
        按下态按钮({
          文案: $r('app.string.browser_preview_close'),
          选中态背景: this.主色容器色,
          字色: $r('app.color.text_primary'),
          点击回调: (): void => { this.onClose(); }
        })
      }
      .width('35%')
      .justifyContent(FlexAlign.End)
    }
    .width('100%')
    .height(应用尺寸.工具栏高度 + this.状态栏高度)
    .padding({ left: 应用尺寸.页面内边距_水平, right: 应用尺寸.页面内边距_水平,
      top: this.状态栏高度 + 应用尺寸.间距_8, bottom: 应用尺寸.间距_8 })
    .alignItems(VerticalAlign.Center)
  }

  @Builder
  private 卡片区() {
    Stack() {
      // Web 组件：src 必须为空字符串（BUG-008 修复），baseUrl=媒体基地址 由 loadData 传入。
      Web({ src: '', controller: this.网页控制器 })
        .javaScriptAccess(true)
        .fileAccess(true)
        .domStorageAccess(true)
        .focusable(false)
        .onControllerAttached((): void => { this.onControllerAttached回调(); })
        .onInterceptRequest((event: OnInterceptRequestEvent): WebResourceResponse | null => {
          return interceptMathAsset(event.request.getRequestUrl()) ?? this.拦截媒体(event);
        })
        .onPageEnd((event: OnPageEndEvent) => {
          // ImageOcclusion 兜底（与 学习页 同款）：setup() 内部幂等，无 canvas 直接返回。
          try {
            this.网页控制器.runJavaScript('anki.imageOcclusion.setup()');
          } catch (_错误) {
            // 预览场景 setup 失败不影响主流程
          }
        })
        .width('100%')
        .height('100%')
        // 点击翻面：onClick 在轻触时触发，垂直滚动不触发（滚动有 move 事件）
        .onClick((): void => { this.翻面(); })
        // 左右滑切换上下张卡： SwipeGesture 与 Web 内部垂直滚动不冲突
        .gesture(
          SwipeGesture({ direction: SwipeDirection.Horizontal })
            .onAction((event: GestureEvent): void => {
              this.处理滑动手势(event.angle);
            })
        )

      // Loading 覆盖层
      if (this.忙碌) {
        Column() {
          LoadingProgress()
            .width(应用尺寸.加载指示器尺寸)
            .height(应用尺寸.加载指示器尺寸)
            .color(this.主色按钮背景)
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
        .backgroundColor(this.isDark ? 'rgba(0,0,0,0.40)' : 'rgba(255,255,255,0.60)')
        .hitTestBehavior(HitTestMode.Block)
      }

      // 错误覆盖层
      if (this.错误详情 !== '') {
        Column({ space: 应用尺寸.间距_8 }) {
          Text(this.错误详情)
            .fontSize(应用尺寸.字号_正文)
            .fontColor($r('app.color.error_text'))
          Button($r('app.string.browser_preview_close'))
            .height(应用尺寸.按钮高度)
            .fontSize(应用尺寸.字号_按钮)
            .fontColor($r('app.color.text_primary'))
            .backgroundColor($r('app.color.surface_card'))
            .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
            .borderRadius(应用尺寸.圆角_胶囊)
            .margin({ top: 应用尺寸.间距_8 })
            .onClick((): void => { this.onClose(); })
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
        .padding(应用尺寸.卡片内边距)
        .backgroundColor(this.isDark ? 'rgba(0,0,0,0.40)' : 'rgba(255,255,255,0.60)')
        .hitTestBehavior(HitTestMode.Block)
      }
    }
    .width('100%')
    .layoutWeight(1)
  }

  @Builder
  private 底部条() {
    Column({ space: 应用尺寸.间距_8 }) {
      // 翻面提示 + 当前侧（正面/背面）
      Text($r('app.string.browser_preview_flip_hint'))
        .fontSize(应用尺寸.字号_正文_小)
        .fontColor($r('app.color.text_secondary'))

      Row({ space: 应用尺寸.间距_10 }) {
        // 编辑字段按钮：经 onEditField 回调上抛，父级打开 浏览编辑区
        Button($r('app.string.browser_preview_edit_fields'))
          .layoutWeight(1)
          .height(应用尺寸.按钮高度)
          .fontSize(应用尺寸.字号_按钮)
          .fontColor($r('app.color.action_on_primary'))
          .backgroundColor(this.已按下编辑 ? this.主色容器色 : this.主色按钮背景)
          .borderRadius(应用尺寸.圆角_胶囊)
          .animation({ duration: 80, curve: Curve.EaseOut })
          .enabled(!this.忙碌 && this.错误详情 === '')
          .onTouch((event: TouchEvent): void => {
            if (event.type === TouchType.Down) {
              this.已按下编辑 = true;
            } else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
              this.已按下编辑 = false;
            }
          })
          .onClick((): void => { this.请求编辑字段(); })

        // 关闭按钮
        Button($r('app.string.browser_preview_close'))
          .layoutWeight(1)
          .height(应用尺寸.按钮高度)
          .fontSize(应用尺寸.字号_按钮)
          .fontColor($r('app.color.text_primary'))
          .backgroundColor($r('app.color.surface_card'))
          .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
          .borderRadius(应用尺寸.圆角_胶囊)
          .onClick((): void => { this.onClose(); })
      }
      .width('100%')
    }
    .width('100%')
    .padding({
      left: 应用尺寸.页面内边距_水平,
      right: 应用尺寸.页面内边距_水平,
      top: 应用尺寸.间距_8,
      // 与其他固定底栏一致：保留原间距并叠加系统导航条高度。
      bottom: 应用尺寸.页面内边距_水平 + this.导航条高度
    })
  }

  build() {
    Stack() {
      // 遮罩层：点击关闭
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor(this.isDark ? 'rgba(0,0,0,0.40)' : 'rgba(0,0,0,0.15)')
        .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
        .onClick((): void => { this.onClose(); })
        .transition(TransitionEffect.OPACITY.animation({
          curve: 取全屏转场曲线(),
          duration: 取全屏转场时长()
        }))

      // 主面板：全屏卡片预览（OPACITY 转场，禁止左右平移）
      Column() {
        this.顶部条()
        this.卡片区()
        this.底部条()
      }
      .width('100%')
      .height('100%')
      .backgroundColor($r('app.color.surface_page'))
      .transition(TransitionEffect.OPACITY.animation({
        curve: 取全屏转场曲线(),
        duration: 取全屏转场时长()
      }))
    }
    .width('100%')
    .height('100%')
  }
}
