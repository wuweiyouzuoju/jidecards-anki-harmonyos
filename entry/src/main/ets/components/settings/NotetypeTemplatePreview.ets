// SPDX-License-Identifier: AGPL-3.0-or-later
import { webview } from '@kit.ArkWeb';
import { common } from '@kit.AbilityKit';
import { CardWebView } from '../../utils/CardWebView';
import { interceptCardAsset } from '../../utils/CardAssetResponse';
import { interceptMediaRequest } from '../../utils/媒体响应助手';
import { RenderedCard } from '../../proto/messages/CardRenderingMessages';
import { 构建卡片HTML, 剥除拼写标记, 媒体基地址 } from '../../model/学习卡片HTML构建器';
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
import { APP_FOREGROUND_KEY } from '../../model/Redemption';
import { DECK_LIST_NARROW_KEY } from '../../model/DeckListAppearance';

/** 草稿卡片只读预览；离线资源、翻面和 Web 生命周期复用学习渲染链。 */
@Component
export struct NotetypeTemplatePreview {
  @Prop rendered: RenderedCard;
  @Prop options: DraftPreviewOption[] = [];
  @Prop selected: number = 0;
  @Prop sample: boolean = true;
  @Prop fullScreen: boolean = false;
  @Prop @Watch('stopHiddenAudio') isVisible: boolean = true;
  @StorageProp(DECK_LIST_NARROW_KEY) private narrow: boolean = false;
  @StorageProp('导航条高度') private navigationBarHeight: number = 0;
  @Prop media: DraftPreviewMedia = { fields: [], directory: '', filenames: [] };
  onSelect: (index: number) => void = (_index: number): void => {};
  @Prop @Watch('showSide') isDark: boolean = false;
  @State private answerSide: boolean = false;
  @State private failed: boolean = false;
  @State private audioFailed: boolean = false;
  @StorageProp(APP_FOREGROUND_KEY) @Watch('stopBackgroundAudio') private foreground: boolean = true;
  onClose: () => void = (): void => {};
  onReleaseAvailable: (release: () => Promise<void>) => void = (_release: () => Promise<void>): void => {};
  private controller: webview.WebviewController = new webview.WebviewController();
  private cardWeb: CardWebView = new CardWebView(this.controller, (): void => { this.playAudio(); },
    (_message: string): void => { this.failed = true; });
  private attached: boolean = false;
  private renderer: 卡片渲染服务 = new 卡片渲染服务();
  private audio: CardAudioSession = new CardAudioSession(new 声音播放器(), new TTS播放器(),
    (html: string, question: boolean) => this.renderer.extractAudioTags(html, question),
    (directory: string, filename: string): string => this.media.filenames.indexOf(filename) >= 0 ?
      this.media.directory + '/' + filename : directory + '/' + filename);

  aboutToAppear(): void { this.onReleaseAvailable((): Promise<void> => this.releaseCard()); }
  aboutToDisappear(): void { this.releaseCard().catch((error: Error): void => { console.info(error.message); }); }
  private releaseCard(): Promise<void> {
    this.attached = false; this.cardWeb.reset();
    return this.audio.release();
  }

  private stopBackgroundAudio(): void { if (!this.foreground) this.audio.stop(); }
  private stopHiddenAudio(): void { if (!this.isVisible) this.audio.stop(); }
  private async playAudio(): Promise<void> {
    if (!this.attached || !this.foreground || !this.isVisible) return;
    this.audioFailed = false;
    try {
      await this.audio.play(构建卡片HTML(this.rendered, this.answerSide ? 'answer' : 'question', this.isDark),
        !this.answerSide, this.mediaDirectory());
    } catch (error) { if (this.attached) this.audioFailed = true; }
  }

  private showSide(): void {
    if (!this.attached) return;
    try {
      this.failed = false;
      this.audio.stop();
      const side: string = this.answerSide ? 'answer' : 'question';
      this.cardWeb.show(剥除拼写标记(构建卡片HTML(this.rendered, this.answerSide ? 'answer' : 'question', this.isDark)), 1, side);
    } catch (error) { this.failed = true; }
  }

  private attach(): void {
    try { this.cardWeb.attach(); this.attached = true; this.showSide(); }
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
      actionLabel: this.answerSide ? $r('app.string.notetype_preview_question') : $r('app.string.notetype_preview_answer'),
      onClose: this.onClose, onAction: (): void => { this.answerSide = !this.answerSide; this.showSide(); } })
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
              surfaceColor: $r('app.color.surface_card'), onSelect: this.onSelect })
          }
          LabeledActionRow({ label: this.sample ? $r('app.string.notetype_preview_hint') : $r('app.string.note_preview_hint'),
            actionLabel: $r('app.string.study_replay_sound'), textColor: $r('app.color.text_secondary'),
            onAction: (): void => { this.playAudio(); } })
          if (this.failed) {
            Text($r('app.string.browser_preview_load_error')).fontColor($r('app.color.error_text'))
          }
          if (this.rendered.isEmpty) { Text($r('app.string.note_preview_empty')).fontColor($r('app.color.text_secondary')) }
          if (this.audioFailed) { Text($r('app.string.browser_preview_audio_error')).fontColor($r('app.color.error_text')) }
        }.width('100%')
      }.width('100%').constraintSize({ maxHeight: '40%' }).flexShrink(0).scrollBar(BarState.Auto)
      Web({ src: '', controller: this.controller })
        .javaScriptAccess(true).fileAccess(true).domStorageAccess(true).zoomAccess(true)
        .backgroundColor($r('app.color.surface_card'))
        .onControllerAttached((): void => { this.attach(); })
        .onInterceptRequest((event: OnInterceptRequestEvent): WebResourceResponse | null =>
          interceptCardAsset(event.request.getRequestUrl()) ??
          interceptMediaRequest(event.request, this.requestMediaDirectory(event.request.getRequestUrl()), 媒体基地址))
        .onErrorReceive((event: OnErrorReceiveEvent): void => {
          if (event.request.isMainFrame() && event.request.getRequestUrl() !== 'about:blank') this.failed = true;
        })
        .onRenderExited((): void => { this.renderExited(); })
        .width('100%').layoutWeight(1)
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
          onBack: this.onClose, onSave: (): void => { this.answerSide = !this.answerSide; this.showSide(); } })
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
