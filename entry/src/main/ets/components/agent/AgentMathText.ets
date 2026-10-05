// SPDX-License-Identifier: AGPL-3.0-or-later
import { webview } from '@kit.ArkWeb';
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { ColorMetrics } from '@kit.ArkUI';
import { AGENT_MATH_BASE, AgentMathAppearance, AgentMathLayout, parseAgentMathLayout } from '../../model/agent/AgentMath';
import { agentMathDocumentHtml, agentMathDocumentUpdateScript } from '../../model/agent/AgentMathDocument';
import { MATH_ASSET_BASE } from '../../model/MathRendering';
import { interceptCardAsset } from '../../utils/CardAssetResponse';
import { 应用尺寸 } from '../../utils/应用尺寸';

/** 含公式的整段正文使用一个离线文档；尺寸回执不授予任何应用动作能力。 */
@Component
export struct AgentMathText {
  @Prop @Watch('contentChanged') text: string = '';
  @Prop @Watch('contentChanged') textColor: ResourceColor = $r('app.color.text_primary');
  @Prop @Watch('contentChanged') fontSize: number = 应用尺寸.字号_正文;
  @Prop @Watch('contentChanged') alignment: string = 'left';
  @Prop @Watch('contentChanged') bold: boolean = false;
  @StorageProp('themeMode') @Watch('contentChanged') themeMode: string = 'system';
  @StorageProp('systemDarkMode') @Watch('contentChanged') systemDarkMode: boolean = false;
  @State private failed: boolean = false;
  @State private contentHeight: number = 24;
  private controller: webview.WebviewController = new webview.WebviewController();
  private ready: boolean = false;
  private disposed: boolean = false;
  private timer: number = -1;
  private revision: number = 0;
  private contentWidth: number = 0;

  aboutToDisappear(): void {
    this.disposed = true;
    this.ready = false;
    if (this.timer >= 0) clearTimeout(this.timer);
    this.timer = -1;
  }

  /** @throws {Error} 资源颜色或字体换算失败由挂载/更新入口回退到原文。 */
  private appearance(): AgentMathAppearance {
    const context = this.getUIContext();
    return { color: ColorMetrics.resourceColor(this.textColor).color,
      fontSize: context.px2vp(context.fp2px(this.fontSize)), alignment: this.alignment, bold: this.bold,
      tableColor: ColorMetrics.resourceColor($r('app.color.surface_card')).color,
      headerColor: ColorMetrics.resourceColor($r('app.color.surface_page')).color,
      borderColor: ColorMetrics.resourceColor(SurfaceBorder.color()).color };
  }

  private attached(): void {
    if (this.disposed) return;
    try {
      this.controller.loadData(agentMathDocumentHtml(this.text, this.appearance()), 'text/html', 'UTF-8', AGENT_MATH_BASE, ' ');
    } catch (error) { this.failed = true; }
  }

  private contentChanged(): void {
    if (!this.ready || this.disposed || this.failed || this.timer >= 0) return;
    // 合并短时间流式增量，保持同一文档和横向阅读位置，避免重复加载 MathJax。
    this.timer = setTimeout((): void => { this.timer = -1; this.updateContent(); }, 80);
  }

  private updateContent(): void {
    if (!this.ready || this.disposed || this.failed) return;
    const revision: number = ++this.revision;
    try {
      this.controller.runJavaScript(agentMathDocumentUpdateScript(this.text, this.appearance(), revision))
        .catch((): void => { if (!this.disposed && revision === this.revision) this.failed = true; });
    } catch (error) { this.failed = true; }
  }

  private receivedLayout(message: string): boolean {
    const layout: AgentMathLayout | null = parseAgentMathLayout(message);
    if (layout === null) return false;
    if (this.disposed || this.failed || layout.revision !== this.revision ||
      (this.contentWidth > 0 && Math.abs(layout.width - this.contentWidth) > 2)) return true;
    if (layout.failed) { this.failed = true; return true; }
    // CSS viewport 固定 initial-scale=1，CSS px 对应 vp；不使用包含 viewport 最小高度的 scrollHeight。
    if (Math.abs(layout.height - this.contentHeight) >= 1) this.contentHeight = layout.height;
    return true;
  }

  private widthChanged(width: number): void {
    if (!Number.isFinite(width) || width <= 0 || Math.abs(width - this.contentWidth) <= 1) return;
    this.contentWidth = width;
    this.contentChanged();
  }

  private intercept(url: string): WebResourceResponse {
    if (url === `${MATH_ASSET_BASE}tex-svg-full.js`) {
      const asset: WebResourceResponse | null = interceptCardAsset(url);
      if (asset !== null) return asset;
    }
    const blocked: WebResourceResponse = new WebResourceResponse();
    blocked.setResponseData('');
    blocked.setResponseCode(403);
    blocked.setReasonMessage('Forbidden');
    return blocked;
  }

  build() {
    if (this.failed) {
      Text(this.text).fontSize(this.fontSize).fontColor(this.textColor).width('100%')
        .copyOption(CopyOptions.LocalDevice)
    } else {
      Web({ src: '', controller: this.controller, renderMode: RenderMode.SYNC_RENDER })
        .width('100%').height(this.contentHeight).layoutMode(WebLayoutMode.NONE)
        .backgroundColor(Color.Transparent).javaScriptAccess(true)
        .fileAccess(false).domStorageAccess(false).zoomAccess(false)
        .overScrollMode(OverScrollMode.NEVER)
        .nestedScroll({ scrollForward: NestedScrollMode.PARENT_FIRST, scrollBackward: NestedScrollMode.PARENT_FIRST })
        .onControllerAttached((): void => { this.attached(); })
        .onPageEnd((): void => { if (!this.disposed) { this.ready = true; this.contentChanged(); } })
        .onAreaChange((_old: Area, area: Area): void => { this.widthChanged(Number(area.width)); })
        .onConsole((event: OnConsoleEvent): boolean => { return this.receivedLayout(event.message.getMessage()); })
        .onInterceptRequest((event: OnInterceptRequestEvent): WebResourceResponse => {
          return this.intercept(event.request.getRequestUrl());
        })
        .onLoadIntercept((event: OnLoadInterceptEvent): boolean => event.data.getRequestUrl() !== 'about:blank' &&
          event.data.getRequestUrl() !== AGENT_MATH_BASE)
        .onErrorReceive((event: OnErrorReceiveEvent): void => {
          if (!this.disposed && (event.request.getRequestUrl() === `${MATH_ASSET_BASE}tex-svg-full.js` ||
            (event.request.isMainFrame() && event.request.getRequestUrl() !== 'about:blank'))) this.failed = true;
        })
        .onRenderExited((): void => { if (!this.disposed) this.failed = true; })
    }
  }
}
