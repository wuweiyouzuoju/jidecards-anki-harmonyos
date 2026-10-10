// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { photoAccessHelper } from '@kit.MediaLibraryKit';
import { noteVisualKind } from '../../backend/NoteVisualImport';
import { appInterface } from '../../backend/AppInterfaceService';
import { noteVisualInterfaceObservation } from '../../model/AppInterface';
import { NoteFieldImage } from '../../model/NoteImageDraft';
import { NoteFieldAudio, NoteAudioStatus } from '../../model/NoteAudioDraft';
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
import { NoteAudioField } from '../common/NoteAudioField';
import { NoteDrawingEditor } from './NoteDrawingEditor';
import { IconActionButton } from '../common/IconActionButton';
import { discardNoteDrawingImages } from '../../backend/NoteDrawingStore';

/** 独立媒体草稿与操作；IO 复用音频字段，确认才一次移交宿主。 */
@CustomDialog
export struct NoteMediaDialog {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  controller?: CustomDialogController;
  kind: string = 'image';
  fieldIndex: number = 0;
  initialValue: string = '';
  initialImages: NoteFieldImage[] = [];
  initialAudios: NoteFieldAudio[] = [];
  preview: NoteAudioPreview = new NoteAudioPreview();
  onApply: (value: string, images: NoteFieldImage[], audios: NoteFieldAudio[]) => void =
    (_value: string, _images: NoteFieldImage[], _audios: NoteFieldAudio[]): void => {};
  onClosed: () => void = (): void => {};
  onRequestClose: () => void = (): void => {};
  onAudioStatus: (status: NoteAudioStatus) => void = (_status: NoteAudioStatus): void => {};
  onReady: (dismiss: () => void) => void = (_dismiss: () => void): void => {};
  @State private value: string = '';
  @State private images: NoteFieldImage[] = [];
  @State private audios: NoteFieldAudio[] = [];
  @StorageProp(颜色键.主色按钮背景) private buttonColor: string = '#2F5FD0';
  @State @Watch('publishVisualStatus') private working: boolean = false;
  @State @Watch('publishVisualStatus') private errorMessage: string = '';
  private session: NoteMediaSession = new NoteMediaSession('', 0, [], [], '');
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
    this.sync();
    this.onReady((): void => { this.close(false); });
  }

  aboutToDisappear(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.kind === 'image') appInterface.leave('note_visual_manage', this.observationVersion);
    this.drawingVersion++;
    const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
    discardNoteDrawingImages(this.session.imageCleanup(this.committed), context.cacheDir).catch((): void => {});
    discardNoteRecordings(this.session.audioCleanup(this.committed)).catch((): void => {});
    this.preview.stop().catch((): void => {});
    this.onClosed();
  }

  private sync(): void {
    if (this.disposed || this.closing) return;
    this.value = this.session.value; this.images = this.session.images.slice(); this.audios = this.session.audios.slice();
    this.publishVisualStatus();
  }

  private publishVisualStatus(): void {
    if (this.kind !== 'image' || this.disposed || this.closing || this.drawingActive) return;
    const parts: NoteMediaPart[] = noteMediaParts(this.value).filter((part: NoteMediaPart): boolean =>
      part.kind === 'image' || part.kind === 'video');
    const pending: NoteFieldImage[] = this.images.filter((item: NoteFieldImage): boolean => item.reference === undefined);
    this.observationVersion = appInterface.observe(noteVisualInterfaceObservation({ working: this.working, hasError: this.errorMessage !== '',
      kinds: parts.map((part: NoteMediaPart): string => part.kind)
        .concat(pending.map((item: NoteFieldImage): string => item.kind ?? 'image')) }));
  }

  private close(commit: boolean): void {
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
        .fontColor($r('app.color.text_secondary')).backgroundColor(Color.Transparent)
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
        compactLabel: true, textColor: $r('app.color.text_secondary'), isInteractive: !this.working,
        onAction: (): void => { this.pickImage(); } })
      LabeledActionRow({ label: $r('app.string.note_drawing_draft_hint'), actionLabel: $r('app.string.note_drawing_new'),
        actionIcon: $r('app.media.ic_study_edit'), compactLabel: true,
        textColor: $r('app.color.text_secondary'), isInteractive: !this.working,
        onAction: (): void => { this.editDrawing(); } })
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
      NoteAudioField({ value: this.value, audios: this.audios, preview: this.preview, mediaOnly: true,
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
        .fontColor($r('app.color.text_secondary')).width('100%').textAlign(TextAlign.Start)
    }
  }

  build() {
    Stack() {
      if (this.drawingActive) {
        this.drawingContent(this.drawingVersion)
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
        this.drawingActive = false; this.dismissDrawing = (): void => {}; this.publishVisualStatus();
      }, onApply: (uri: string): void => { this.finishDrawing(uri, version); } })
  }
}
