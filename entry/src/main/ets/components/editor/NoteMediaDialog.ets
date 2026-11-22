// SPDX-License-Identifier: AGPL-3.0-or-later
import { appearanceElementColor } from '../../utils/AppearanceElements';
import { common } from '@kit.AbilityKit';
import { photoAccessHelper } from '@kit.MediaLibraryKit';
import { noteVisualKind } from '../../backend/NoteVisualImport';
import { appInterface } from '../../backend/AppInterfaceService';
import { noteVisualInterfaceObservation, noteSpeechInterfaceObservation } from '../../model/AppInterface';
import { NoteFieldImage } from '../../model/NoteImageDraft';
import { NOTE_AUDIO_GENERATE_TITLE, NOTE_AUDIO_SPEECH_APPLY_TITLE, NOTE_AUDIO_PLAY_ICON, NoteFieldAudio, NoteAudioStatus } from '../../model/NoteAudioDraft';
import { NoteMediaSession } from '../../model/NoteMediaSession';
import { NoteMediaPart, noteMediaParts, noteImagePreviewSource } from '../../model/NoteMediaParts';
import { discardNoteRecordings } from '../../utils/NoteAudioRecorder';
import { NoteAudioPreview } from '../../utils/NoteAudioPreview';
import { resourceText } from '../../utils/UiFeedback';
import { 颜色键 } from '../../model/颜色主题';
import { PressFeedback } from '../../utils/PressFeedback';
import { LabeledActionRow } from '../common/LabeledActionRow';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';
import { NoteVisualPreview } from './NoteVisualPreview';
import { NoteSpeech, noteSpeechText } from '../../backend/NoteSpeech';
import { 文本中的填空编号 } from '../../model/填空解析器';
import { APP_FOREGROUND_KEY } from '../../model/AppLifecycleState';
import { 按下态按钮 } from '../common/按下态按钮';
import { NoteAudioField } from '../common/NoteAudioField';
import { NoteDrawingEditor } from './NoteDrawingEditor';
import { IconActionButton } from '../common/IconActionButton';
import { discardNoteDrawingImages } from '../../backend/NoteDrawingStore';

/** 独立媒体草稿与操作；IO 复用音频字段，确认才一次移交宿主。 */
@CustomDialog
export struct NoteMediaDialog {
  @StorageProp('appearance_elements_active') private appearanceElements: string = '';
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  controller?: CustomDialogController;
  kind: string = 'image';
  startDrawing: boolean = false;
  directPick: boolean = false;
  fieldIndex: number = 0;
  initialValue: string = '';
  initialImages: NoteFieldImage[] = [];
  initialAudios: NoteFieldAudio[] = [];
  preview: NoteAudioPreview = new NoteAudioPreview();
  onApply: (value: string, images: NoteFieldImage[], audios: NoteFieldAudio[]) => void =
    (_value: string, _images: NoteFieldImage[], _audios: NoteFieldAudio[]): void => {};
  onClosed: () => void = (): void => {};
  onRequestClose: () => void = (): void => {};
  onAudioStatus: (status: NoteAudioStatus | null) => void = (_status: NoteAudioStatus | null): void => {};
  onReady: (dismiss: () => void) => void = (_dismiss: () => void): void => {};
  @State private value: string = '';
  @State private images: NoteFieldImage[] = [];
  @State private audios: NoteFieldAudio[] = [];
  @StorageProp(颜色键.主色按钮背景) private buttonColor: string = '#2F5FD0';
  @State @Watch('publishVisualStatus') private working: boolean = false;
  @State @Watch('publishVisualStatus') private errorMessage: string = '';
  private session: NoteMediaSession = new NoteMediaSession('', 0, [], [], '');
  private speech: NoteSpeech = new NoteSpeech();
  @StorageProp(APP_FOREGROUND_KEY) @Watch('speechForegroundChanged') private foreground: boolean = true;
  @State @Watch('publishSpeechStatus') private speechActive: boolean = false;
  @State @Watch('publishSpeechStatus') private speechText: string = '';
  @State @Watch('publishSpeechStatus') private speechPath: string = '';
  @State @Watch('publishSpeechStatus') private speechWorking: boolean = false;
  @State @Watch('publishSpeechStatus') private speechPlaying: boolean = false;
  @State @Watch('publishSpeechStatus') private speechError: string = '';
  private generatedText: string = '';
  private speechVersion: number = 0;
  private speechObservationVersion: number = 0;
  private disposed: boolean = false;
  private committed: boolean = false;
  private closing: boolean = false;
  private observationVersion: number = 0;
  @State private drawingActive: boolean = false;
  private drawingSource: string = '';
  private drawingPart: number = -1;
  private drawingId: number = -1;
  private drawingVersion: number = 0;
  private dismissDrawing: () => void = (): void => {};

  aboutToAppear(): void {
    this.session = new NoteMediaSession(this.initialValue, this.fieldIndex, this.initialImages, this.initialAudios,
      `${Date.now()}-${Math.floor(Math.random() * 1000000)}`);
    this.onReady((): void => { this.close(false); });
    if (this.startDrawing) this.editDrawing();
    else {
      this.sync();
      if (this.directPick) void this.pickAndApply();
    }
  }

  aboutToDisappear(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.speechVersion++;
    this.speech.cancel();
    if (this.speechObservationVersion > 0) appInterface.leave('note_audio_speech', this.speechObservationVersion);
    this.discardSpeechFile(this.speechPath);
    if (this.kind === 'image') appInterface.leave('note_visual_manage', this.observationVersion);
    this.drawingVersion++;
    const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
    discardNoteDrawingImages(this.session.imageCleanup(this.committed), context.cacheDir).catch((): void => {});
    discardNoteRecordings(this.session.audioCleanup(this.committed)).catch((): void => {});
    this.preview.stop().catch((): void => {});
    this.onClosed();
  }

  private speechCurrent(version: number): boolean {
    return version === this.speechVersion && this.speechActive && !this.disposed && !this.closing;
  }

  private async openSpeech(): Promise<void> {
    if (this.working || !this.foreground || this.disposed || this.closing || this.speechActive) return;
    const version = ++this.speechVersion;
    this.onAudioStatus(null);
    this.speechText = '';
    this.speechError = '';
    this.speechActive = true;
    if (this.value.trim() === '' || 文本中的填空编号(this.value).length > 0) return;
    try {
      const text = await noteSpeechText(this.value);
      if (this.speechCurrent(version)) this.speechText = text.slice(0, 10000);
    } catch (error) { /* 仍可手动输入。 */ }
  }

  private changeSpeechText(text: string): void {
    if (text === this.speechText || this.speechWorking) return;
    this.speechVersion++;
    this.speechText = text;
    this.speechError = '';
    if (this.speechPlaying) {
      this.speechPlaying = false;
      this.preview.stop().catch((): void => {});
    }
  }

  private discardSpeechFile(path: string): void {
    if (path === '') return;
    discardNoteRecordings([{ id: 0, fieldIndex: this.fieldIndex, uri: path,
      label: '', filename: '', temporary: true }]).catch((): void => {});
  }

  private speechReady(): boolean {
    return this.speechPath !== '' && this.generatedText === this.speechText.trim();
  }

  private canGenerateSpeech(): boolean {
    const length = this.speechText.trim().length;
    return this.foreground && !this.speechWorking && length > 0 && length <= 10000 && !this.speechReady();
  }

  private async generateSpeech(): Promise<void> {
    if (!this.speechActive || !this.canGenerateSpeech() || this.disposed || this.closing) return;
    const version = ++this.speechVersion;
    const text = this.speechText.trim();
    this.speechWorking = true;
    this.speechError = '';
    try {
      await this.preview.stop();
      if (!this.speechCurrent(version)) return;
      const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
      const path = await this.speech.generate(text, context.cacheDir);
      if (!this.speechCurrent(version)) { this.discardSpeechFile(path); return; }
      this.discardSpeechFile(this.speechPath);
      this.generatedText = text;
      this.speechPath = path;
    } catch (error) {
      if (this.speechCurrent(version)) {
        const reason = error instanceof Error ? error.message : '';
        const message = reason === 'speech_voice_unavailable' ? $r('app.string.note_audio_speech_voice_unavailable') :
          reason === 'speech_cache_failed' ? $r('app.string.note_audio_speech_cache_failed') :
            $r('app.string.note_audio_speech_failed');
        this.speechError = resourceText(this.getUIContext(), message);
      }
    } finally {
      if (this.speechCurrent(version)) this.speechWorking = false;
    }
  }

  private async previewSpeech(): Promise<void> {
    if (this.speechWorking || !this.speechReady() || !this.foreground) return;
    const version = this.speechVersion;
    this.speechError = '';
    try {
      if (this.speechPlaying) await this.preview.stop();
      else await this.preview.play(this.speechPath, (playing: boolean): void => {
        if (this.speechCurrent(version)) this.speechPlaying = playing;
      });
    } catch (error) {
      if (this.speechCurrent(version)) this.speechError = resourceText(this.getUIContext(), $r('app.string.note_audio_play_failed'));
    }
  }

  private endSpeech(apply: boolean): void {
    if (this.disposed || !this.speechActive || (apply && (!this.foreground || this.speechWorking || !this.speechReady()))) return;
    this.speechVersion++;
    this.speech.cancel();
    const path = this.speechPath;
    this.speechActive = false;
    this.speechWorking = false;
    this.speechPlaying = false;
    this.speechPath = '';
    this.generatedText = '';
    this.preview.stop().catch((): void => {});
    if (this.speechObservationVersion > 0) appInterface.leave('note_audio_speech', this.speechObservationVersion);
    this.speechObservationVersion = 0;
    if (apply) {
      this.session.addAudio(path, resourceText(this.getUIContext(), $r('app.string.' + NOTE_AUDIO_GENERATE_TITLE)), true);
      this.sync();
      this.close(true);
    } else this.discardSpeechFile(path);
  }

  private speechForegroundChanged(): void {
    if (!this.speechActive) return;
    if (!this.foreground) {
      this.speechVersion++;
      this.speech.cancel();
      this.speechWorking = false;
      this.speechPlaying = false;
      this.preview.stop().catch((): void => {});
    }
    this.publishSpeechStatus();
  }

  private publishSpeechStatus(): void {
    if (!this.speechActive || this.disposed || this.closing) return;
    this.speechObservationVersion = appInterface.observe(noteSpeechInterfaceObservation(this.speechWorking,
      this.canGenerateSpeech(), this.speechReady(), this.speechPlaying, this.foreground));
  }

  private sync(): void {
    if (this.disposed || this.closing) return;
    this.value = this.session.value; this.images = this.session.images.slice(); this.audios = this.session.audios.slice();
    this.publishVisualStatus();
  }

  private publishVisualStatus(): void {
    if (this.kind !== 'image' || this.disposed || this.closing || this.drawingActive || this.startDrawing) return;
    const parts: NoteMediaPart[] = noteMediaParts(this.value).filter((part: NoteMediaPart): boolean =>
      part.kind === 'image' || part.kind === 'video');
    const pending: NoteFieldImage[] = this.images.filter((item: NoteFieldImage): boolean => item.reference === undefined);
    this.observationVersion = appInterface.observe(noteVisualInterfaceObservation({ working: this.working, hasError: this.errorMessage !== '',
      kinds: parts.map((part: NoteMediaPart): string => part.kind)
        .concat(pending.map((item: NoteFieldImage): string => item.kind ?? 'image')) }));
  }

  private close(commit: boolean): void {
    if (this.speechActive) { if (!commit) this.endSpeech(false); return; }
    if (this.drawingActive) { if (!commit) this.dismissDrawing(); return; }
    if (this.working || this.disposed || this.closing) return;
    if (commit) { this.onApply(this.value, this.images, this.audios); this.committed = true; }
    this.closing = true;
    this.onRequestClose();
  }

  private editDrawing(index: number = -1, id: number = -1): void {
    if (this.working || this.disposed || this.closing || this.drawingActive) return;
    const item: NoteFieldImage | undefined = this.images.find((entry: NoteFieldImage): boolean => entry.id === id);
    if (index >= 0 && this.part(index)?.kind !== 'image') return;
    if (id >= 0 && (item === undefined || item.kind === 'video')) return;
    this.drawingSource = index >= 0 ? this.imageSource(index) : item?.uri ?? '';
    this.drawingPart = index; this.drawingId = id; this.drawingVersion++;
    appInterface.leave('note_visual_manage', this.observationVersion);
    this.drawingActive = true;
  }

  private finishDrawing(uri: string, version: number): void {
    if (this.disposed || this.closing || !this.drawingActive || version !== this.drawingVersion) {
      const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
      discardNoteDrawingImages([{ id: 0, fieldIndex: this.fieldIndex, uri: uri, filename: '' }], context.cacheDir).catch((): void => {});
      return;
    }
    this.session.addImage(uri, this.drawingPart, this.drawingId); this.drawingActive = false;
    this.dismissDrawing = (): void => {}; this.sync();
    if (this.startDrawing) this.close(true);
  }

  /** 原字段按钮直达系统选择器；成功回填，取消回到原草稿，失败保留错误与重试。 */
  private async pickAndApply(): Promise<void> {
    const before: number = this.images.length;
    await this.pickImage();
    if (this.disposed || this.closing || this.errorMessage !== '') return;
    this.close(this.images.length > before);
  }

  private async pickImage(partIndex: number = -1, pendingId: number = -1, _locale: string = this.uiLanguage): Promise<void> {
    if (this.working || this.disposed || this.closing) return;
    this.working = true; this.errorMessage = '';
    try {
      const options: photoAccessHelper.PhotoSelectOptions = new photoAccessHelper.PhotoSelectOptions();
      options.MIMEType = photoAccessHelper.PhotoViewMIMETypes.IMAGE_VIDEO_TYPE; options.maxSelectNumber = 1;
      const result: photoAccessHelper.PhotoSelectResult = await new photoAccessHelper.PhotoViewPicker().select(options);
      if (this.disposed || result.photoUris.length === 0) return;
      const kind: string = await noteVisualKind(result.photoUris[0]);
      if (this.disposed) return;
      this.session.addVisual(result.photoUris[0], kind, partIndex, pendingId); this.sync();
    } catch (error) {
      if (!this.disposed) {
        this.errorMessage = resourceText(this.getUIContext(), error instanceof Error && error.message === 'note_video_too_large' ?
          $r('app.string.note_video_too_large') : $r('app.string.note_visual_import_failed'));
      }
    } finally { if (!this.disposed) this.working = false; }
  }

  private part(index: number): NoteMediaPart | undefined { return noteMediaParts(this.value)[index]; }
  private imageSource(index: number): string {
    const part: NoteMediaPart | undefined = this.part(index);
    if (part === undefined) return '';
    const draft: NoteFieldImage | undefined = this.images.find((item: NoteFieldImage): boolean => item.reference === part.text);
    const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
    return draft?.uri ?? noteImagePreviewSource(context.filesDir, part.filename);
  }

  @Builder
  private headerContent() {
    DialogHeader({ title: this.kind === 'image' ? $r('app.string.note_visual_manage') : $r('app.string.note_audio_manage'),
      closeEnabled: !this.working, actionEnabled: !this.working,
      onClose: (): void => { this.close(false); }, onAction: (): void => { this.close(true); } })
  }

  @Builder
  private imageActions(index: number, id: number) {
    Row({ space: 应用尺寸.间距_8 }) {
      Button($r('app.string.note_media_replace')).height(应用尺寸.紧凑控件高度).fontSize(应用尺寸.字号_正文_小)
        .fontColor(Color.White).backgroundColor(this.buttonColor)
        .enabled(!this.working).attributeModifier(new PressFeedback()).stateEffect(false)
        .onClick((): void => { this.pickImage(index, id); })
      Button($r('app.string.note_visual_remove')).height(应用尺寸.紧凑控件高度).fontSize(应用尺寸.字号_正文_小)
        .fontColor(appearanceElementColor(this.appearanceElements, 'text_secondary', $r('app.color.text_secondary'))).backgroundColor(Color.Transparent)
        .enabled(!this.working).attributeModifier(new PressFeedback()).stateEffect(false)
        .onClick((): void => { this.session.removeImage(index, id); this.sync(); })
    }.width('100%')
  }

  @Builder
  private editablePreview(source: string, kind: string, index: number, id: number) {
    Stack({ alignContent: Alignment.TopEnd }) {
      NoteVisualPreview({ source: source, kind: kind, disabled: this.working })
      if (kind === 'image') {
        IconActionButton({ source: $r('app.media.ic_study_edit'), label: $r('app.string.note_drawing_edit'),
          toolbarStyle: true, squareSurface: true, surface: $r('app.color.surface_card'), isInteractive: !this.working,
          onAction: (): void => { this.editDrawing(index, id); } }).margin(应用尺寸.间距_4)
      }
    }.width('100%')
  }

  @Builder
  private bodyContent() {
    if (this.kind === 'image') {
      LabeledActionRow({ label: $r('app.string.note_visual_draft_hint'), actionLabel: $r('app.string.note_visual_add'),
        compactLabel: true, textColor: appearanceElementColor(this.appearanceElements, 'text_secondary', $r('app.color.text_secondary')), isInteractive: !this.working,
        onAction: (): void => { this.pickImage(); } })

    }
    if (this.kind === 'image') {
      ForEach(noteMediaParts(this.value), (_part: NoteMediaPart, index: number) => {
        if (this.part(index)?.kind === 'image' || this.part(index)?.kind === 'video') {
          Column({ space: 应用尺寸.间距_8 }) {
            this.editablePreview(this.imageSource(index), this.part(index)?.kind ?? 'image', index, -1)
            this.imageActions(index, -1)
          }.width('100%')
        }
      }, (part: NoteMediaPart, index: number): string => `${index}-${part.kind}-${part.filename}`)
      ForEach(this.images.filter((item: NoteFieldImage): boolean => item.reference === undefined), (item: NoteFieldImage) => {
        Column({ space: 应用尺寸.间距_8 }) {
          this.editablePreview(item.uri, item.kind ?? 'image', -1, item.id)
          this.imageActions(-1, item.id)
        }.width('100%')
      }, (item: NoteFieldImage): string => `${item.id}-${item.uri}`)
    } else {
      NoteAudioField({ value: this.value, audios: this.audios, preview: this.preview, mediaOnly: true, speechVisible: true,
        onOpenSpeech: (): void => { void this.openSpeech(); },
        disabled: this.working, replacementsVisible: true,
        onStatus: (status: NoteAudioStatus): void => { if (!this.disposed) this.onAudioStatus(status); },
        onBusy: (busy: boolean): void => { this.working = busy; },
        onChange: (value: string): void => { this.session.changeValue(value); this.sync(); },
        onAdd: (uri: string, label: string, temporary: boolean): void => { this.session.addAudio(uri, label, temporary); this.sync(); },
        onRemove: (id: number): void => { this.session.removeAudio(id); this.sync(); },
        onReplace: (index: number, id: number, uri: string, label: string, temporary: boolean): void => {
          this.session.addAudio(uri, label, temporary, index, id); this.sync();
        } })
    }
    if (this.errorMessage !== '') {
      Text(this.errorMessage).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.error_text'))
    }
    if (this.kind === 'audio') {
      Text($r('app.string.note_media_draft_hint')).fontSize(应用尺寸.字号_正文_小)
        .fontColor(appearanceElementColor(this.appearanceElements, 'text_secondary', $r('app.color.text_secondary'))).width('100%').textAlign(TextAlign.Start)
    }
  }

  @Builder
  private speechHeader() {
    DialogHeader({ title: $r('app.string.' + NOTE_AUDIO_GENERATE_TITLE),
      actionLabel: $r('app.string.' + NOTE_AUDIO_SPEECH_APPLY_TITLE),
      actionEnabled: this.foreground && !this.speechWorking && this.speechReady(),
      onClose: (): void => { this.endSpeech(false); }, onAction: (): void => { this.endSpeech(true); } })
  }

  @Builder
  private speechBody() {
    Column({ space: 应用尺寸.间距_8 }) {
      TextArea({ text: this.speechText, placeholder: resourceText(this.getUIContext(), $r('app.string.note_audio_speech_input')) })
        .id('note-audio-speech-input').width('100%').height(112).maxLength(10000)
        .enabled(!this.speechWorking)
        .onChange((text: string): void => { this.changeSpeechText(text); })
      按下态按钮({ 文案: this.speechWorking ? $r('app.string.ai_card_generating') : $r('app.string.' + NOTE_AUDIO_GENERATE_TITLE),
        fillWidth: true, 是否启用: this.canGenerateSpeech(), 点击回调: (): void => { void this.generateSpeech(); } })
      if (this.speechReady()) {
        Row() {
          if (this.speechPlaying) {
            按下态按钮({ 文案: $r('app.string.note_audio_stop'),
              是否启用: !this.speechWorking && this.foreground, 点击回调: (): void => { void this.previewSpeech(); } })
          } else {
            IconActionButton({ source: $r('app.media.' + NOTE_AUDIO_PLAY_ICON),
              label: $r('app.string.note_audio_play'), pageWheelEligible: false, toolbarStyle: true, squareSurface: true,
              isInteractive: !this.speechWorking && this.foreground, onAction: (): void => { void this.previewSpeech(); } })
          }
        }.width('100%').justifyContent(FlexAlign.Center)
      }
      if (this.speechError !== '') {
        Text(this.speechError).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.error_text')).width('100%')
      }
    }.width('100%')
  }

  build() {
    Stack() {
      if (this.drawingActive) {
        this.drawingContent(this.drawingVersion)
      } else if (this.speechActive) {
        DialogFrame({ nativeHost: true, onDismiss: (): void => { this.endSpeech(false); },
          header: () => { this.speechHeader(); }, content: () => { this.speechBody(); } })
      } else {
        DialogFrame({ nativeHost: true, canDismiss: !this.working, onDismiss: (): void => { this.close(false); },
          header: () => { this.headerContent(); }, content: () => { this.bodyContent(); } })
      }
    }.width('100%').height('100%')
  }

  @Builder
  private drawingContent(version: number) {
    NoteDrawingEditor({ source: this.drawingSource,
      onReady: (dismiss: () => void): void => {
        if (!this.disposed && version === this.drawingVersion) this.dismissDrawing = dismiss;
      },
      onCancel: (): void => {
        if (this.disposed || version !== this.drawingVersion) return;
        this.drawingActive = false; this.dismissDrawing = (): void => {};
        if (this.startDrawing) this.close(false);
        else this.publishVisualStatus();
      }, onApply: (uri: string): void => { this.finishDrawing(uri, version); } })
  }
}
