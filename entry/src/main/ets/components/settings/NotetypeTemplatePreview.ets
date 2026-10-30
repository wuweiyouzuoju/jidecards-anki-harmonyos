import { GlassSource } from '../common/GlassSource';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { webview } from '@kit.ArkWeb';
import { common } from '@kit.AbilityKit';
import { CardWebView, CardWebAttributes, cardScriptDiagnosticLabels } from '../../utils/CardWebView';
import { interceptCardAsset } from '../../utils/CardAssetResponse';
import { interceptMediaRequest } from '../../utils/媒体响应助手';
import { RenderedCard } from '../../proto/messages/CardRenderingMessages';
import { 构建卡片HTML, 剥除拼写标记, 媒体基地址, 原始侧HTML, appendCardScript } from '../../model/学习卡片HTML构建器';
import { buildPreviewInteractionScript } from '../../model/PreviewInteraction';
import { reviewPreferences } from '../../backend/ReviewPreferencesService';
import { resourceText } from '../../utils/UiFeedback';


import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';
import { NoteEditorHeader } from '../common/NoteEditorHeader';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { DraftPreviewMedia, DraftPreviewOption } from '../../model/NoteDraftPreview';
import { FormSelectRow } from '../common/FormSelectRow';
import { IconActionButton } from '../common/IconActionButton';
import { CardAudioSession } from '../../model/CardAudioSession';
import { 声音播放器 } from '../../utils/声音播放器';
import { TTS播放器 } from '../../utils/TTS播放器';
import { 卡片渲染服务 } from '../../backend/卡片渲染服务';
import { APP_FOREGROUND_KEY } from '../../model/AppLifecycleState';
import { PAGE_COMPACT_LAYOUT_KEY } from '../../model/AppLayoutState';
import { DelayedLoadingIndicator } from '../common/DelayedLoadingIndicator';
import { noteLinkBridgeScript } from '../../model/NoteLinkBridge';
import { NoteLinksProxy } from '../../model/NoteLinksProxy';
import { noteLinksService } from '../../backend/NoteLinksService';
import { 卡片预览页 } from '../browser/卡片预览页';
import { 颜色键 } from '../../model/颜色主题';

class TemplateAudioProxy {
  dispatch: (action: string, version: number) => void = (_action: string, _version: number): void => {};
  onAction(action: string, version: number): void { this.dispatch(action, version); }
}

/** 草稿卡片只读预览；离线资源、翻面和 Web 生命周期复用学习渲染链。 */
@Component
export struct NotetypeTemplatePreview {
  @Prop rendered: RenderedCard;
  @Prop @Watch('contentChanged') contentRevision: number = 1;
  @Prop @Watch('loadingChanged') loading: boolean = false;
  @Prop loadError: string = '';
  @Prop options: DraftPreviewOption[] = [];
  @Prop selected: number = 0;
  @Prop sample: boolean = true;
  @Prop fullScreen: boolean = false;
  @Prop @Watch('stopHiddenAudio') isVisible: boolean = true;
  @StorageProp(PAGE_COMPACT_LAYOUT_KEY) private narrow: boolean = false;
  @StorageProp('导航条高度') private navigationBarHeight: number = 0;
  @Prop media: DraftPreviewMedia = { fields: [], directory: '', filenames: [] };
  onSelect: (index: number) => void = (_index: number): void => {};
  @Prop @Watch('cardThemeChanged') isDark: boolean = false;
  @StorageProp(颜色键.主色容器) @Watch('referenceThemeChanged') private referenceSurface: string = '#E8EEFC';
  @StorageProp(颜色键.主色文字) @Watch('referenceThemeChanged') private referenceText: string = '#183B8F';
  private referenceThemeChanged(): void {
    if (this.alive && this.attached) this.controller.runJavaScript(noteLinkBridgeScript(this.previewVersion,
      undefined, { surface: this.referenceSurface, text: this.referenceText })).catch((error: Object): void => { console.info(`Note reference theme: ${error}`); });
  }
  @State private answerSide: boolean = false;
  @State private failed: boolean = false;
  @State private audioFailed: boolean = false;
  @State private renderPending: boolean = false;
  @State private hasRendered: boolean = false;
  @State private visibleWebSlot: number = 0;
  @State private cardSurfaceBackground: string = '';
  @StorageProp(APP_FOREGROUND_KEY) @Watch('stopBackgroundAudio') private foreground: boolean = true;
  onClose: () => void = (): void => {};
  onBackHandlerChange: (handler: (() => boolean) | null) => void = (_handler: (() => boolean) | null): void => {};
  @State private linkedIds: number[] = [];
  @State private referenceError: string = '';
  private linkedBack: (() => boolean) | null = null;
  onReleaseAvailable: (release: () => Promise<void>) => void = (_release: () => Promise<void>): void => {};
  private controller: webview.WebviewController = new webview.WebviewController();
  private spareController: webview.WebviewController = new webview.WebviewController();
  private readonly webSlots: number[] = [0, 1];
  private attachedWebSlots: boolean[] = [false, false];
  private cardWeb: CardWebView = new CardWebView(this.controller, (background: string, appearanceOnly: boolean): void => {
    if (!this.attached) return;
    if (background !== '') this.cardSurfaceBackground = background;
    if (appearanceOnly) return;
    this.hasRendered = true; this.renderPending = false;
    this.playAudio();
  }, (_message: string): void => { this.failed = true; this.renderPending = false; },
    this.spareController, (slot: number): void => {
      this.visibleWebSlot = slot;
      this.controller = this.cardWeb.controllerAt(slot);
    });
  private attached: boolean = false;
  private previewVersion: number = 0;
  private alive: boolean = false;
  private hideAudioButtons: boolean = false;
  private renderer: 卡片渲染服务 = new 卡片渲染服务();
  private audio: CardAudioSession = new CardAudioSession(new 声音播放器(), new TTS播放器(),
    (html: string, question: boolean) => this.renderer.extractAudioTags(html, question),
    (directory: string, filename: string): string => this.media.filenames.indexOf(filename) >= 0 ?
      this.media.directory + '/' + filename : directory + '/' + filename);

  aboutToAppear(): void {
    this.alive = true;
    this.onBackHandlerChange((): boolean => this.referenceBack());
    this.cardThemeChanged();
    this.onReleaseAvailable((): Promise<void> => this.releaseCard());
    reviewPreferences.read().then((value): void => {
      if (!this.alive) return;
      this.hideAudioButtons = value.hideAudioPlayButtons;
      this.showSide();
    }).catch((error: Error): void => { console.info(`Preview preferences: ${error.message}`); });
  }
  aboutToDisappear(): void { this.onBackHandlerChange(null); this.releaseCard().catch((error: Error): void => { console.info(error.message); }); }
  private referenceBack(): boolean {
    if (this.linkedIds.length === 0) return false;
    if (!this.linkedBack?.()) this.linkedIds = [];
    return true;
  }
  private requestClose(): void { if (!this.referenceBack()) this.onClose(); }
  private async openReference(guid: string, version: number): Promise<void> {
    if (!this.alive || !this.foreground || !this.isVisible || this.linkedIds.length > 0 || version !== this.previewVersion) return;
    try {
      const ids: number[] = await noteLinksService.preview(guid);
      if (!this.alive || !this.foreground || !this.isVisible || version !== this.previewVersion) return;
      if (ids.length === 0) { this.referenceError = resourceText(this.getUIContext(), $r('app.string.note_links_missing')); return; }
      this.audio.stop(); this.cardWeb.setAudioEnabled(false); this.linkedIds = ids;
    } catch (_error) { if (this.alive && version === this.previewVersion) this.referenceError = resourceText(this.getUIContext(), $r('app.string.note_links_error')); }
  }
  private releaseCard(): Promise<void> {
    this.cardWeb.setAudioEnabled(false);
    this.alive = false; this.previewVersion++;
    this.attached = false; this.cardWeb.reset();
    return this.audio.release();
  }

  private stopBackgroundAudio(): void {
    this.cardWeb.setActive(this.foreground && this.isVisible);
    this.cardWeb.setAudioEnabled(this.foreground && this.isVisible && !this.loading);
    if (!this.foreground) this.audio.stop();
  }
  private stopHiddenAudio(): void {
    this.cardWeb.setActive(this.foreground && this.isVisible);
    this.cardWeb.setAudioEnabled(this.foreground && this.isVisible && !this.loading);
    if (!this.isVisible) this.audio.stop();
  }
  private async playAudio(audioTarget: string = ''): Promise<void> {
    if (!this.attached || !this.foreground || !this.isVisible || this.linkedIds.length > 0 || this.loading || this.renderPending || this.loadError !== '') return;
    this.audioFailed = false;
    const target: RegExpExecArray | null = /^([qa]):(\d+)$/.exec(audioTarget);
    const question: boolean = target === null ? !this.answerSide : target[1] === 'q';
    try {
      await this.audio.play(原始侧HTML(this.rendered, question ? 'question' : 'answer'),
        question, this.mediaDirectory(), true, '', (): void => {}, { itemIndex: target === null ? undefined : Number(target[2]) });
    } catch (error) { if (this.attached) this.audioFailed = true; }
  }

  private showSide(): void {
    if (!this.attached || this.loading || this.loadError !== '') return;
    this.cardWeb.setActive(this.foreground && this.isVisible);
    try {
      this.cardWeb.setAudioEnabled(this.foreground && this.isVisible);
      this.failed = false;
      this.audio.stop();
      this.renderPending = true;
      const side: string = this.answerSide ? 'answer' : 'question';
      const version: number = ++this.previewVersion;
      const html: string = 剥除拼写标记(构建卡片HTML(this.rendered, this.answerSide ? 'answer' : 'question', this.isDark,
        undefined, this.hideAudioButtons, resourceText(this.getUIContext(), $r('app.string.study_replay_sound')), resourceText(this.getUIContext(), $r('app.string.card_script_load_error')), cardScriptDiagnosticLabels(this.getUIContext())));
      this.cardWeb.show(appendCardScript(appendCardScript(html, buildPreviewInteractionScript(version)),
        noteLinkBridgeScript(version, undefined, { surface: this.referenceSurface, text: this.referenceText })), this.contentRevision, side);
    } catch (error) { this.failed = true; this.renderPending = false; }
  }

  private contentChanged(): void {
    this.answerSide = false;
    this.cardWeb.reset();
    this.showSide();
  }

  private cardThemeChanged(): void {
    if (this.alive) this.cardWeb.setTheme(this.isDark);
  }

  private loadingChanged(): void {
    if (this.loading) { this.audio.stop(); this.cardWeb.setAudioEnabled(false); }
    else this.showSide();
  }

  private toggleSide(): void {
    if (!this.attached || this.linkedIds.length > 0 || this.loading || this.renderPending || this.failed || this.loadError !== '') return;
    this.answerSide = !this.answerSide;
    this.showSide();
  }

  private attach(slot: number = 0): void {
    this.attachedWebSlots[slot] = true;
    if (!this.attachedWebSlots[0] || !this.attachedWebSlots[1]) return;
    try {
      const proxy: TemplateAudioProxy = new TemplateAudioProxy();
      proxy.dispatch = (action: string, version: number): void => {
        if (version === this.previewVersion && /^audio:[qa]:\d+$/.test(action)) this.playAudio(action.slice(6));
      };
      const references: NoteLinksProxy = new NoteLinksProxy();
      references.dispatch = (guid: string, _action: string, version: number): void => { this.openReference(guid, version); };
      for (const index of this.webSlots) {
        this.cardWeb.controllerAt(index).registerJavaScriptProxy(proxy, 'jidePreview', ['onAction']);
        this.cardWeb.controllerAt(index).registerJavaScriptProxy(references, 'jideNoteLinks', ['onLink']);
      }
      this.cardWeb.attach(0); this.cardWeb.attach(1); this.attached = true; this.showSide();
    }
    catch (error) { this.failed = true; }
  }

  private renderExited(): void {
    this.failed = true; this.attached = false;
    this.audio.stop(); this.cardWeb.reset(true);
  }

  private mediaDirectory(): string {
    const context = AppStorage.get<common.UIAbilityContext>('abilityContext');
    return context === undefined ? '' : context.filesDir + '/collection.media';
  }

  @Builder
  private header() {
    DialogHeader({ title: this.sample ? $r('app.string.notetype_template_preview') : $r('app.string.note_draft_preview'), closeLabel: $r('app.string.close'),
      actionIcon: $r('app.media.ic_card_flip'), actionLabel: this.answerSide ? $r('app.string.notetype_preview_question') : $r('app.string.notetype_preview_answer'),
      onClose: (): void => { this.requestClose(); }, onAction: (): void => { this.toggleSide(); } })
  }

  @Builder
  private content() {
    Column({ space: 应用尺寸.间距_8 }) {
      // 操作区限高滚动，Web 自己滚动卡面，避免卡片被嵌套在正文 Scroll 中。
      Scroll() {
        Column({ space: 应用尺寸.间距_8 }) {
          if (this.options.length > 1) {
            FormSelectRow({ label: $r('app.string.note_preview_card_label'),
              options: this.options.map((option: DraftPreviewOption): SelectOption => ({ value: option.name })),
              selectedIndex: this.selected, value: this.options[this.selected].name,
              surfaceColor: $r('app.color.surface_card'), isInteractive: !this.loading && !this.renderPending,
              onSelect: this.onSelect })
          }
          Row({ space: 应用尺寸.间距_8 }) {
            Text(this.sample ? $r('app.string.notetype_preview_hint') : $r('app.string.note_preview_hint'))
              .fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_secondary')).layoutWeight(1)
            IconActionButton({ source: $r('app.media.ic_audio_replay'), label: $r('app.string.study_replay_sound'),
              onAction: (): void => { this.playAudio(); } })
          }.width('100%').alignItems(VerticalAlign.Center)
          if (this.failed || this.loadError !== '') {
            Text(this.loadError === '' ? $r('app.string.browser_preview_load_error') : this.loadError).fontColor($r('app.color.error_text'))
          }
          if (this.referenceError !== '') { Text(this.referenceError).fontColor($r('app.color.error_text')) }
          if (this.rendered.isEmpty) { Text($r('app.string.note_preview_empty')).fontColor($r('app.color.text_secondary')) }
          if (this.audioFailed) { Text($r('app.string.browser_preview_audio_error')).fontColor($r('app.color.error_text')) }
        }.width('100%')
      }.width('100%').constraintSize({ maxHeight: '40%' }).flexShrink(0).scrollBar(BarState.Auto)
      Stack() {
      ForEach(this.webSlots, (slot: number) => {
      Web({ src: '', controller: this.cardWeb.controllerAt(slot) })
        .javaScriptAccess(true).fileAccess(true).domStorageAccess(true).zoomAccess(true)
        .attributeModifier(new CardWebAttributes())
        .backgroundColor(this.cardSurfaceBackground || $r('app.color.surface_card'))
        .onControllerAttached((): void => { this.attach(slot); })
        .onInterceptRequest((event: OnInterceptRequestEvent): WebResourceResponse | null =>
          interceptCardAsset(event.request.getRequestUrl()) ??
          interceptMediaRequest(event.request, this.requestMediaDirectory(event.request.getRequestUrl()), 媒体基地址))
        .onErrorReceive((event: OnErrorReceiveEvent): void => {
          if (this.cardWeb.isRelevant(slot) && event.request.isMainFrame() && event.request.getRequestUrl() !== 'about:blank') {
            this.failed = true; this.renderPending = false;
          }
        })
        .onRenderExited((): void => { if (this.cardWeb.isRelevant(slot)) this.renderExited(); })
        .opacity(this.visibleWebSlot === slot ? 1 : 0)
        .hitTestBehavior(this.visibleWebSlot === slot ? HitTestMode.Default : HitTestMode.None)
        .width('100%').height('100%')
      }, (slot: number): string => String(slot))
      if (this.loading || this.renderPending) {
        Column() { DelayedLoadingIndicator() }
          .width('100%').height('100%').justifyContent(FlexAlign.Center)
          .backgroundColor(this.hasRendered ? Color.Transparent : (this.cardSurfaceBackground || $r('app.color.surface_card')))
          .hitTestBehavior(HitTestMode.Block)
      }
      }.width('100%').layoutWeight(1)
    }.width('100%').height('100%')
  }

  private requestMediaDirectory(url: string): string {
    let filename: string = '';
    try { filename = decodeURIComponent(url.substring(媒体基地址.length).split(new RegExp('[?#]'))[0]); }
    catch (error) { return this.mediaDirectory(); }
    return url.startsWith(媒体基地址) && this.media.filenames.indexOf(filename) >= 0 ? this.media.directory : this.mediaDirectory();
  }

  build() {
    Stack() {
    if (this.fullScreen) {
      // 选择器原生Popup挂在正文内，展开期间复用打开前的真实帧，避免递归采样。
      GlassSource({ sourceEnabled: this.isVisible && this.linkedIds.length === 0, freezeDuringPanels: true }) {
      Column() {
        NoteEditorHeader({ title: this.sample ? $r('app.string.notetype_template_preview') : $r('app.string.note_draft_preview'),
          actionIcon: $r('app.media.ic_card_flip'), actionLabel: this.answerSide ? $r('app.string.notetype_preview_question') : $r('app.string.notetype_preview_answer'),
          onBack: (): void => { this.requestClose(); }, onSave: (): void => { this.toggleSide(); } })
        Column() { this.content() }.width('100%').layoutWeight(1)
          .padding({ left: 应用尺寸.页面内边距_水平, right: 应用尺寸.页面内边距_水平,
            top: 应用尺寸.页面内容顶部间距(this.narrow), bottom: 应用尺寸.间距_8 + this.navigationBarHeight })
      }.width('100%').height('100%')
      }
    } else {
      DialogFrame({ maximumWidth: 应用尺寸.dialogWideMaxWidth, fillBody: true,
        header: () => { this.header(); }, content: () => { this.content(); }, onDismiss: (): void => { this.requestClose(); } })
    }
    if (this.linkedIds.length > 0) {
      卡片预览页({ 卡片ID列表: this.linkedIds, 媒体目录: this.mediaDirectory(), isDark: this.isDark, linksReadOnly: true,
        onClose: (): void => { this.linkedIds = []; this.linkedBack = null; this.cardWeb.setAudioEnabled(this.foreground && this.isVisible); },
        onBackHandlerChange: (handler: (() => boolean) | null): void => { this.linkedBack = handler; } })
    }
    }.width('100%').height('100%')
  }
}
