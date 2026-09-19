// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID UI-BROWSER-PREVIEW-001
// @名称 卡片预览页
//
// @作用
// 浏览页 T5 全屏卡片预览弹层：纯展示层，用 Web 组件复用 学习页 的渲染链路
// （卡片渲染服务.渲染既有卡片 + 学习卡片HTML构建器）渲染卡片正反面。
// 与 Anki 浏览器预览一致：先显示题目，点击卡片看答案，之后才切下一张；一次只加载一面，
// 背面模板自身含 {{FrontSide}}，所以答案面天然带正面内容，不拼接、不重复。
// 上下张切换遍历父级下发的卡片ID列表，顶部编辑入口经 onEditField 回调上抛。
//
// @输入
// isDark: 是否深色主题
// 卡片ID列表: 当前搜索结果对应的卡片ID数组（左右滑遍历此数组）
// 打开时聚焦的卡片在 列表 中的位置（预览始终从题目面开始，与 Anki 预览一致）
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
// - 卡面交互脚本统一维护点击排除规则、左右滑与键盘动作，不接入评分。
//
// @副作用
// 通过 卡片渲染服务 间接调用 NAPI 桥读 Anki collection（只读渲染）。
// ========================================================

import { webview } from '@kit.ArkWeb';
import { interceptCardAsset } from '../../utils/CardAssetResponse';
import { 卡片渲染服务 } from '../../backend/卡片渲染服务';
import type { RenderedCard, AvTagsResult } from '../../proto/messages/CardRenderingMessages';
import {
  构建卡片HTML,
  媒体基地址,
  剥除拼写标记,
  原始侧HTML
} from '../../model/学习卡片HTML构建器';
import { 解码文件名, 取MIME类型, 读取媒体文件 } from '../../utils/媒体响应助手';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 取全屏转场曲线, 取全屏转场时长 } from '../../utils/转场时长';
import { 颜色键 } from '../../model/颜色主题';
import { 按下态按钮 } from '../common/按下态按钮';
import { 声音播放器 } from '../../utils/声音播放器';
import { TTS播放器 } from '../../utils/TTS播放器';
import { CardAudioSession } from '../../model/CardAudioSession';
import { APP_FOREGROUND_KEY } from '../../model/Redemption';
import { AI_AGENT_CHANNELS_APP_STORAGE_KEY } from '../../model/ReleaseFeatures';
import { buildPreviewInteractionScript } from '../../model/PreviewInteraction';

/** 仅向预览转发显示操作，文档版本由组件校验。 */
class PreviewActionProxy {
  dispatch: (action: string, version: number) => void = (): void => {};
  onAction(action: string, version: number): void {
    this.dispatch(action, version);
  }
}

/** 预览面：题目 / 答案（与 Anki Previewer._state 同义）。 */
type 预览面 = 'question' | 'answer';

@Component
export struct 卡片预览页 {
  @StorageProp('cardTextSizePercent') private cardTextSizePercent: number = 100;
  @Prop isDark: boolean = false;
  @Prop 卡片ID列表: number[] = [];
  @Prop 初始索引: number = 0;
  @Prop 媒体目录: string = '';
  @Prop @Watch('预览刷新版本变化') 刷新版本: number = 0;
  @Prop @Watch('updateActivity') interactionEnabled: boolean = true;
  @StorageProp(APP_FOREGROUND_KEY) @Watch('updateActivity') private foreground: boolean = true;
  @StorageProp(AI_AGENT_CHANNELS_APP_STORAGE_KEY) private agentEnabled: boolean = false;
  onPositionChanged: (index: number) => void = (_index: number): void => {};
  onClose: () => void = (): void => {};
  onEditField: (卡片ID: number) => void = (_卡片ID: number): void => {};
  onCreateWithAgent: () => void = (): void => {};

  private readonly 网页控制器: webview.WebviewController = new webview.WebviewController();
  private readonly 卡片渲染服务实例: 卡片渲染服务 = new 卡片渲染服务();
  private 已渲染: RenderedCard | null = null;
  /** 控制器未 attach 时缓存的待加载 HTML（规避 aboutToAppear 异步链白屏时序坑）。 */
  private 待加载HTML: string = '';
  private readonly soundPlayer: 声音播放器 = new 声音播放器();
  private readonly ttsPlayer: TTS播放器 = new TTS播放器();
  private mounted: boolean = false;
  private loadVersion: number = 0;
  private documentVersion: number = 0;
  private bridgeReady: boolean = false;
  private readonly audioSession: CardAudioSession = new CardAudioSession(this.soundPlayer, this.ttsPlayer,
    (html: string, question: boolean): Promise<AvTagsResult> => this.卡片渲染服务实例.extractAudioTags(html, question));
  private audioRefreshPending: boolean = false;
  @State private previewIds: number[] = [];
  @State private hasAudio: boolean = false;
  @State private audioError: string = '';

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

  aboutToAppear(): void {
    this.mounted = true;
    // 固定本次预览的 ID 顺序；字段编辑后的搜索重排不能把当前卡换成另一张。
    this.previewIds = this.卡片ID列表.slice();
    this.当前索引值 = Math.max(0, Math.min(this.初始索引, this.previewIds.length - 1));
    this.加载当前卡();
  }

  aboutToDisappear(): void {
    this.mounted = false;
    this.loadVersion += 1;
    this.documentVersion += 1;
    this.audioSession.release();
    this.控制器已挂载 = false;
    this.待加载HTML = '';
  }

  /** 编辑或后台期间停止所有声音；返回后由用户重播，不自动打断其他音频。 */
  private updateActivity(): void {
    if (!this.interactionEnabled || !this.foreground) {
      this.audioRefreshPending = this.已渲染 !== null;
      this.stopAudio();
      if (this.控制器已挂载) {
        this.网页控制器.runJavaScript('document.querySelectorAll("audio,video").forEach(function(m){m.pause();});')
          .catch((error: Object): void => { console.info(`Preview media pause: ${error}`); });
      }
    } else if (this.audioRefreshPending) {
      this.playCurrentAudio(false);
    }
  }

  /** 学习与预览共用取消及原生初始化清理规则。 */
  private stopAudio(): void {
    this.audioSession.stop();
  }

  /** 音频失败只影响重播入口，卡片仍可浏览。 */
  private async playCurrentAudio(autoplay: boolean = true): Promise<void> {
    const rendered: RenderedCard | null = this.已渲染;
    if (rendered === null || !this.mounted || this.错误详情 !== '') return;
    if (!this.interactionEnabled || !this.foreground) {
      this.audioRefreshPending = true;
      return;
    }
    this.audioRefreshPending = false;
    const version: number = this.documentVersion;
    this.hasAudio = false;
    this.audioError = '';
    try {
      const hasAudio: boolean | null = await this.audioSession.play(
        原始侧HTML(rendered, this.当前面), this.当前面 === 'question', this.媒体目录, autoplay, '',
        (available: boolean): void => {
          if (this.mounted && version === this.documentVersion) this.hasAudio = available;
        });
      if (hasAudio !== null && this.mounted && version === this.documentVersion) {
        this.hasAudio = hasAudio;
      }
    } catch (error) {
      if (!this.mounted || version !== this.documentVersion) return;
      this.audioError = this.取本地化文案($r('app.string.browser_preview_audio_error'));
      console.info(`Preview audio: ${error}`);
    }
  }

  /** 字段保存后父级递增刷新版本，重新渲染当前仍在预览中的卡片。 */
  private 预览刷新版本变化(): void {
    this.加载当前卡();
  }

  /** 取当前预览的卡片ID（基于 当前索引值 从 卡片ID列表 取）。 */
  private 取当前卡片ID(): number {
    if (this.previewIds.length === 0) {
      return 0;
    }
    const 索引: number = this.当前索引值;
    if (索引 < 0 || 索引 >= this.previewIds.length) {
      return 0;
    }
    return this.previewIds[索引];
  }

  // ========================================================
  // @名称 加载当前卡
  //
  // @作用
  // 调 卡片渲染服务.渲染既有卡片 渲染当前卡片，缓存正反面 HTML 并加载题目面到 Web。
  // 与 Anki 预览一致：选中新卡后状态回到题目面，答案面按需加载（不预拼两面）。
  //
  // @输入
  // 无（使用 当前索引值 + 卡片ID列表）
  //
  // @输出
  // 成功 → 设 正面HTML / 背面HTML，当前面='question'，加载正面到 Web
  // 失败 → 设 错误详情，显示错误覆盖层
  //
  // @业务规则
  // - 正反面都剥除拼写标记（预览不渲染输入框占位，与学习页 type 预览过滤同语义）
  // - 背面模板自身含 {{FrontSide}}，答案面因此带正面内容，不额外拼接
  // - 控制器未 attach 时缓存 HTML，onControllerAttached 回调消费
  //
  // @副作用
  // 调后端 渲染既有卡片；调 Web 控制器 loadData
  // ========================================================
  private async 加载当前卡(): Promise<void> {
    if (!this.mounted) return;
    const version: number = ++this.loadVersion;
    this.documentVersion += 1;
    this.stopAudio();
    this.hasAudio = false;
    this.audioError = '';
    const 卡片ID: number = this.取当前卡片ID();
    if (卡片ID === 0) {
      this.忙碌 = false;
      this.错误详情 = this.取本地化文案($r('app.string.browser_preview_load_error'));
      return;
    }
    this.忙碌 = true;
    this.错误详情 = '';
    this.当前面 = 'question';
    this.onPositionChanged(this.当前索引值);
    this.正面HTML = '';
    this.背面HTML = '';
    this.已渲染 = null;
    this.待加载HTML = '';
    try {
      const rendered: RenderedCard = await this.卡片渲染服务实例.渲染既有卡片(卡片ID);
      if (!this.mounted || version !== this.loadVersion) return;
      this.已渲染 = rendered;
      // 预览正反面都剥除拼写标记（不收集输入，不渲染输入框占位）
      this.正面HTML = 剥除拼写标记(构建卡片HTML(this.已渲染, 'question', this.isDark));
      this.背面HTML = 剥除拼写标记(构建卡片HTML(this.已渲染, 'answer', this.isDark));
      this.应用HTML(this.当前面 === 'question' ? this.正面HTML : this.背面HTML);
    } catch (错误) {
      if (!this.mounted || version !== this.loadVersion) return;
      this.错误详情 = this.取本地化文案($r('app.string.browser_preview_load_error'));
      console.info(`卡片预览页: 加载卡片失败 cid=${卡片ID} 错误=${错误}`);
    } finally {
      if (this.mounted && version === this.loadVersion) this.忙碌 = false;
    }
  }

  /**
   * 应用 HTML 到 Web 组件：控制器已 attach 时直接 loadData，否则缓存到 待加载HTML
   * 由 onControllerAttached 回调消费。规避 aboutToAppear 异步链调 loadData 时
   * Web 未 attach 的白屏时序坑（PROJECT_CONTEXT.md「Web 组件 attach 时序」）。
   */
  private 应用HTML(html: string): void {
    const version: number = ++this.documentVersion;
    const document: string = html.replace('</body>',
      `<script>${buildPreviewInteractionScript(version)}</script></body>`);
    if (this.控制器已挂载) {
      try {
        this.installActionBridge();
        this.网页控制器.loadData(document, 'text/html', 'UTF-8', 媒体基地址, ' ');
        this.playCurrentAudio();
      } catch (错误) {
        this.错误详情 = this.取本地化文案($r('app.string.browser_preview_load_error'));
        this.stopAudio();
        console.info(`卡片预览页: loadData 失败 错误=${错误}`);
      }
    } else {
      this.待加载HTML = document;
    }
  }

  /** 仅主文档/渲染进程失败进入可恢复错误态；缺失的单个媒体不遮挡整张卡。 */
  private webFailed(): void {
    if (!this.mounted) return;
    this.loadVersion += 1;
    this.documentVersion += 1;
    this.忙碌 = false;
    this.错误详情 = this.取本地化文案($r('app.string.browser_preview_load_error'));
    this.stopAudio();
  }

  /** 控制器可用后安装只读交互桥；失败时下一次重试会再次安装。 */
  private installActionBridge(): void {
    if (this.bridgeReady) return;
    const proxy: PreviewActionProxy = new PreviewActionProxy();
    proxy.dispatch = (action: string, version: number): void => {
      if (version !== this.documentVersion || !this.mounted || !this.interactionEnabled || !this.foreground) return;
      if (action === 'flip') this.翻面();
      if (action === 'previous') this.上一张();
      if (action === 'next') this.下一张();
      if (action === 'replay') this.playCurrentAudio();
    };
    this.网页控制器.registerJavaScriptProxy(proxy, 'jidePreview', ['onAction']);
    this.bridgeReady = true;
  }

  /** Web 控制器 attach 回调：消费缓存的待加载 HTML。 */
  private onControllerAttached回调(): void {
    if (!this.mounted) return;
    this.控制器已挂载 = true;
    if (this.待加载HTML !== '') {
      const 缓存: string = this.待加载HTML;
      this.待加载HTML = '';
      try {
        this.installActionBridge();
        this.网页控制器.loadData(缓存, 'text/html', 'UTF-8', 媒体基地址, ' ');
        this.playCurrentAudio();
      } catch (错误) {
        this.错误详情 = this.取本地化文案($r('app.string.browser_preview_load_error'));
        console.info(`卡片预览页: onControllerAttached loadData 失败 错误=${错误}`);
      }
    }
  }

  /**
   * 翻面：题目 → 答案（Anki 预览里点击卡片或按“下一步”在题目态做的事）。
   * 答案 → 题目只由 上一张 负责，与 Anki Previewer._on_prev/_on_next 的按键语义一致。
   */
  private 翻面(): void {
    if (!this.interactionEnabled || !this.foreground || this.忙碌
      || this.错误详情 !== '' || this.当前面 === 'answer') {
      return;
    }
    this.当前面 = 'answer';
    this.onPositionChanged(this.当前索引值);
    this.应用HTML(this.背面HTML);
  }

  /**
   * 上一张（Anki 预览的 "<" / 左方向键）：答案态先回题目；题目态切上一张卡，边界不回绕。
   * 加载中或错误态直接切卡，保留“坏卡/慢卡可跳过”的既有行为。
   */
  private 上一张(): void {
    if (!this.interactionEnabled) {
      return;
    }
    if (!this.忙碌 && this.错误详情 === '' && this.当前面 === 'answer') {
      this.当前面 = 'question';
      this.onPositionChanged(this.当前索引值);
      this.应用HTML(this.正面HTML);
      return;
    }
    if (this.当前索引值 <= 0) {
      return;
    }
    this.当前索引值 -= 1;
    this.加载当前卡();
  }

  /**
   * 下一张（Anki 预览的 ">" / 右方向键 / 回车）：题目态先显示答案；答案态才切下一张卡。
   * 加载中或错误态直接切卡，保留“坏卡/慢卡可跳过”的既有行为。
   */
  private 下一张(): void {
    if (!this.interactionEnabled) {
      return;
    }
    if (!this.忙碌 && this.错误详情 === '' && this.当前面 === 'question') {
      this.翻面();
      return;
    }
    if (this.当前索引值 >= this.previewIds.length - 1) {
      return;
    }
    this.当前索引值 += 1;
    this.加载当前卡();
  }

  /** 编辑字段：经 onEditField 回调上抛当前卡片ID，由父级打开 浏览编辑区。 */
  private 请求编辑字段(): void {
    const 卡片ID: number = this.取当前卡片ID();
    if (卡片ID === 0 || this.忙碌 || !this.interactionEnabled || this.错误详情 !== '') {
      return;
    }
    this.stopAudio();
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
    if (this.previewIds.length === 0) {
      return '';
    }
    const 模板: string = this.取本地化文案($r('app.string.browser_preview_position'));
    return 模板
      .replace('%d', String(this.当前索引值 + 1))
      .replace('%d', String(this.previewIds.length));
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
    const fileName: string = 解码文件名(url.substring(媒体基地址.length));
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

  /** 预览更多菜单：只保留编辑和 Agent 制卡，不做任何学习状态操作。 */
  private 预览更多菜单(): MenuElement[] {
    const items: MenuElement[] = [
      {
        value: this.取本地化文案($r('app.string.study_edit_note')),
        action: (): void => { this.请求编辑字段(); },
        enabled: !this.忙碌 && this.错误详情 === ''
      }
    ];
    if (this.agentEnabled) {
      items.push({
        value: this.取本地化文案($r('app.string.ai_card_title')),
        action: (): void => { this.onCreateWithAgent(); }
      });
    }
    return items;
  }

  @Builder
  private 预览顶部条() {
    Stack() {
      Text(this.取位置文案())
        .fontSize(应用尺寸.字号_标题)
        .fontWeight(FontWeight.Medium)
        .fontColor($r('app.color.text_primary'))
        .maxLines(1)
        .textAlign(TextAlign.Center)
        .hitTestBehavior(HitTestMode.None)
      Row() {
        按下态按钮({
          文案: $r('app.string.browser_preview_close'),
          字色: $r('app.color.text_primary'),
          点击回调: (): void => { this.onClose(); }
        })
        Blank()
        Button($r('app.string.study_more'))
          .height(应用尺寸.按钮高度)
          .padding({ left: 应用尺寸.卡片内边距, right: 应用尺寸.卡片内边距 })
          .constraintSize({ minWidth: 0 })
          .fontSize(应用尺寸.字号_按钮)
          .fontColor($r('app.color.text_primary'))
          .backgroundColor($r('app.color.surface_card'))
          .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
          .borderRadius(应用尺寸.圆角_胶囊)
          .bindMenu(this.预览更多菜单())
      }
      .width('100%')
      .height('100%')
      .alignItems(VerticalAlign.Center)
    }
    .width('100%')
    .height(应用尺寸.工具栏高度 + this.状态栏高度)
    .padding({
      left: 应用尺寸.页面内边距_水平,
      right: 应用尺寸.页面内边距_水平,
      top: this.状态栏高度 + 应用尺寸.toolbarVerticalInset,
      bottom: 应用尺寸.toolbarVerticalInset
    })
  }

  @Builder
  private 卡片区() {
    Stack() {
      // Web 组件：src 必须为空字符串（BUG-008 修复），baseUrl=媒体基地址 由 loadData 传入。
      Web({ src: '', controller: this.网页控制器 })
        .textZoomRatio(this.cardTextSizePercent)
        .javaScriptAccess(true)
        .fileAccess(true)
        .domStorageAccess(true)
        .zoomAccess(true)
        .focusable(true)
        .onControllerAttached((): void => { this.onControllerAttached回调(); })
        .onInterceptRequest((event: OnInterceptRequestEvent): WebResourceResponse | null => {
          return interceptCardAsset(event.request.getRequestUrl()) ?? this.拦截媒体(event);
        })
        .onErrorReceive((event: OnErrorReceiveEvent): void => {
          if (event.request.isMainFrame() && event.request.getRequestUrl() !== 'about:blank') this.webFailed();
        })
        .onRenderExited((): void => { this.webFailed(); })
        .onPageEnd((event: OnPageEndEvent) => {
          // ImageOcclusion 兜底（与 学习页 同款）：setup() 内部幂等，无 canvas 直接返回。
          try {
            this.网页控制器.runJavaScript('anki.imageOcclusion.setup()')
              .catch((error: Object): void => { console.info(`Preview occlusion: ${error}`); });
          } catch (_错误) {
            // 预览场景 setup 失败不影响主流程
          }
        })
        .width('100%')
        .height('100%')
        // 左右滑切卡在文档内监听判断，保留链接、媒体、遮罩和表单的原生交互。
        // 不在 Web 上挂 ArkUI 手势：ArkWeb 先消费触摸，SwipeGesture 收不到左右滑。

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
          Button($r('app.string.browser_preview_retry'))
            .onClick((): void => { this.加载当前卡(); })
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
      Text(this.当前面 === 'question' ? $r('app.string.browser_preview_front') : $r('app.string.browser_preview_back'))
        .fontSize(应用尺寸.字号_正文_小)
        .fontColor($r('app.color.text_secondary'))
      // 不放按钮：点击卡片看答案、左右滑上一步/下一步（Anki 预览 "<" ">" 的等价语义，见 PreviewInteraction 注入脚本）。
      if (this.hasAudio || this.audioError !== '') {
        Button($r('app.string.study_replay_sound'))
          .height(应用尺寸.按钮高度)
          .fontSize(应用尺寸.字号_按钮)
          .fontColor($r('app.color.text_primary'))
          .backgroundColor($r('app.color.surface_card'))
          .enabled(!this.忙碌 && this.错误详情 === '' && this.interactionEnabled)
          .onClick((): void => { this.playCurrentAudio(); })
      }
      if (this.audioError !== '') {
        Text(this.audioError)
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.error_text'))
      }
      Text($r('app.string.browser_preview_hint'))
        .fontSize(应用尺寸.字号_正文_小)
        .fontColor($r('app.color.text_secondary'))

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
        this.预览顶部条()
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
