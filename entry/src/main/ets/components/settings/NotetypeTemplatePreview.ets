// SPDX-License-Identifier: AGPL-3.0-or-later
import { webview } from '@kit.ArkWeb';
import { common } from '@kit.AbilityKit';
import { CardWebView, CardWebAttributes } from '../../utils/CardWebView';
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
import { LabeledActionRow } from '../common/LabeledActionRow';
import { CardAudioSession } from '../../model/CardAudioSession';
import { 声音播放器 } from '../../utils/声音播放器';
import { TTS播放器 } from '../../utils/TTS播放器';
import { 卡片渲染服务 } from '../../backend/卡片渲染服务';
import { APP_FOREGROUND_KEY } from '../../model/AppLifecycleState';
import { PAGE_COMPACT_LAYOUT_KEY } from '../../model/AppLayoutState';
import { DelayedLoadingIndicator } from '../common/DelayedLoadingIndicator';

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
  @State private answerSide: boolean = false;
  @State private failed: boolean = false;
  @State private audioFailed: boolean = false;
  @State private renderPending: boolean = false;
  @State private hasRendered: boolean = false;
  @State private visibleWebSlot: number = 0;
  @State private cardSurfaceBackground: string = '';
  @StorageProp(APP_FOREGROUND_KEY) @Watch('stopBackgroundAudio') private foreground: boolean = true;
  onClose: () => void = (): void => {};
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
    this.cardThemeChanged();
    this.onReleaseAvailable((): Promise<void> => this.releaseCard());
    reviewPreferences.read().then((value): void => {
      if (!this.alive) return;
      this.hideAudioButtons = value.hideAudioPlayButtons;
      this.showSide();
    }).catch((error: Error): void => { console.info(`Preview preferences: ${error.message}`); });
  }
  aboutToDisappear(): void { this.releaseCard().catch((error: Error): void => { console.info(error.message); }); }
  private releaseCard(): Promise<void> {
    this.cardWeb.setAudioEnabled(false);
    this.alive = false; this.previewVersion++;
    this.attached = false; this.cardWeb.reset();
    return this.audio.release();
  }

  private stopBackgroundAudio(): void {
    this.cardWeb.setAudioEnabled(this.foreground && this.isVisible && !this.loading);
    if (!this.foreground) this.audio.stop();
  }
  private stopHiddenAudio(): void {
    this.cardWeb.setAudioEnabled(this.foreground && this.isVisible && !this.loading);
    if (!this.isVisible) this.audio.stop();
  }
  private async playAudio(audioTarget: string = ''): Promise<void> {
    if (!this.attached || !this.foreground || !this.isVisible || this.loading || this.renderPending || this.loadError !== '') return;
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
    try {
      this.cardWeb.setAudioEnabled(this.foreground && this.isVisible);
      this.failed = false;
      this.audio.stop();
      this.renderPending = true;
      const side: string = this.answerSide ? 'answer' : 'question';
      const version: number = ++this.previewVersion;
      const html: string = 剥除拼写标记(构建卡片HTML(this.rendered, this.answerSide ? 'answer' : 'question', this.isDark,
        undefined, this.hideAudioButtons, resourceText(this.getUIContext(), $r('app.string.study_replay_sound')), resourceText(this.getUIContext(), $r('app.string.card_script_load_error'))));
      this.cardWeb.show(appendCardScript(html, buildPreviewInteractionScript(version)), this.contentRevision, side);
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
    if (!this.attached || this.loading || this.renderPending || this.failed || this.loadError !== '') return;
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
      for (const index of this.webSlots) this.cardWeb.controllerAt(index).registerJavaScriptProxy(proxy, 'jidePreview', ['onAction']);
      this.cardWeb.attach(0); this.cardWeb.attach(1); this.attached = true; this.showSide();
    }
    catch (error) { this.failed = true; }
  }

  private renderExited(): void {
    this.failed = true; this.attached = false;
    this.audio.stop(); this.cardWeb.reset();
  }

  private mediaDirectory(): string {
    const context = AppStorage.get<common.UIAbilityContext>('abilityContext');
    return context === undefined ? '' : context.filesDir + '/collection.media';
  }

  @Builder
  private header() {
    DialogHeader({ title: this.sample ? $r('app.string.notetype_template_preview') : $r('app.string.note_draft_preview'), closeLabel: $r('app.string.close'),
      showActionLabel: true, actionLabel: this.answerSide ? $r('app.string.notetype_preview_question') : $r('app.string.notetype_preview_answer'),
      onClose: this.onClose, onAction: (): void => { this.toggleSide(); } })
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
          LabeledActionRow({ label: this.sample ? $r('app.string.notetype_preview_hint') : $r('app.string.note_preview_hint'),
            actionLabel: $r('app.string.study_replay_sound'), textColor: $r('app.color.text_secondary'),
            onAction: (): void => { this.playAudio(); } })
          if (this.failed || this.loadError !== '') {
            Text(this.loadError === '' ? $r('app.string.browser_preview_load_error') : this.loadError).fontColor($r('app.color.error_text'))
          }
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
    if (this.fullScreen) {
      Column() {
        NoteEditorHeader({ title: this.sample ? $r('app.string.notetype_template_preview') : $r('app.string.note_draft_preview'),
          actionLabel: this.answerSide ? $r('app.string.notetype_preview_question') : $r('app.string.notetype_preview_answer'),
          onBack: this.onClose, onSave: (): void => { this.toggleSide(); } })
        Column() { this.content() }.width('100%').layoutWeight(1)
          .padding({ left: 应用尺寸.页面内边距_水平, right: 应用尺寸.页面内边距_水平,
            top: 应用尺寸.页面内容顶部间距(this.narrow), bottom: 应用尺寸.间距_8 + this.navigationBarHeight })
      }.width('100%').height('100%')
    } else {
      DialogFrame({ maximumWidth: 应用尺寸.dialogWideMaxWidth, fillBody: true,
        header: () => { this.header(); }, content: () => { this.content(); }, onDismiss: this.onClose })
    }
  }
}
