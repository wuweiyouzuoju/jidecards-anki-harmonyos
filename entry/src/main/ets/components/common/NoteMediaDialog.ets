// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { photoAccessHelper } from '@kit.MediaLibraryKit';
import { NoteFieldImage } from '../../model/NoteImageDraft';
import { NoteFieldAudio } from '../../model/NoteAudioDraft';
import { NoteMediaSession } from '../../model/NoteMediaSession';
import { NoteMediaPart, noteMediaParts, noteImagePreviewSource } from '../../model/NoteMediaParts';
import { discardNoteRecordings } from '../../utils/NoteAudioRecorder';
import { NoteAudioPreview } from '../../utils/NoteAudioPreview';
import { resourceText } from '../../utils/UiFeedback';
import { 颜色键 } from '../../model/颜色主题';
import { PressFeedback } from '../../utils/PressFeedback';
import { LabeledActionRow } from './LabeledActionRow';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { DialogFrame } from './DialogFrame';
import { DialogHeader } from './DialogHeader';
import { NoteImagePreview } from './NoteImagePreview';
import { NoteAudioField } from './NoteAudioField';

/** 独立媒体草稿与操作；IO 复用音频字段，确认才一次移交宿主。 */
@CustomDialog
export struct NoteMediaDialog {
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
  onReady: (dismiss: () => void) => void = (_dismiss: () => void): void => {};
  @State private value: string = '';
  @State private images: NoteFieldImage[] = [];
  @State private audios: NoteFieldAudio[] = [];
  @StorageProp(颜色键.主色按钮背景) private buttonColor: string = '#2F5FD0';
  @State private working: boolean = false;
  @State private errorMessage: string = '';
  private session: NoteMediaSession = new NoteMediaSession('', 0, [], [], '');
  private disposed: boolean = false;
  private committed: boolean = false;

  aboutToAppear(): void {
    this.session = new NoteMediaSession(this.initialValue, this.fieldIndex, this.initialImages, this.initialAudios,
      `${Date.now()}-${Math.floor(Math.random() * 1000000)}`);
    this.sync();
    this.onReady((): void => { this.close(false); });
  }

  aboutToDisappear(): void {
    this.disposed = true;
    discardNoteRecordings(this.session.audioCleanup(this.committed)).catch((): void => {});
    this.preview.stop().catch((): void => {});
    this.onClosed();
  }

  private sync(): void {
    this.value = this.session.value; this.images = this.session.images.slice(); this.audios = this.session.audios.slice();
  }

  private close(commit: boolean): void {
    if (this.working || this.disposed) return;
    if (commit) { this.onApply(this.value, this.images, this.audios); this.committed = true; }
    this.controller?.close();
  }

  private async pickImage(partIndex: number = -1, pendingId: number = -1): Promise<void> {
    if (this.working || this.disposed) return;
    this.working = true; this.errorMessage = '';
    try {
      const options: photoAccessHelper.PhotoSelectOptions = new photoAccessHelper.PhotoSelectOptions();
      options.MIMEType = photoAccessHelper.PhotoViewMIMETypes.IMAGE_TYPE; options.maxSelectNumber = 1;
      const result: photoAccessHelper.PhotoSelectResult = await new photoAccessHelper.PhotoViewPicker().select(options);
      if (this.disposed || result.photoUris.length === 0) return;
      this.session.addImage(result.photoUris[0], partIndex, pendingId); this.sync();
    } catch (error) {
      if (!this.disposed) this.errorMessage = resourceText(this.getUIContext(), $r('app.string.add_note_image_import_failed'));
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
    DialogHeader({ title: this.kind === 'image' ? $r('app.string.note_image_manage') : $r('app.string.note_audio_manage'),
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
      Button($r('app.string.add_note_image_remove')).height(应用尺寸.紧凑控件高度).fontSize(应用尺寸.字号_正文_小)
        .fontColor($r('app.color.text_secondary')).backgroundColor(Color.Transparent)
        .enabled(!this.working).attributeModifier(new PressFeedback()).stateEffect(false)
        .onClick((): void => { this.session.removeImage(index, id); this.sync(); })
    }.width('100%')
  }

  @Builder
  private bodyContent() {
    if (this.kind === 'image') {
      LabeledActionRow({ label: $r('app.string.note_media_draft_hint'), actionLabel: $r('app.string.add_note_image_add'),
        tint: this.buttonColor, textColor: $r('app.color.text_secondary'), isInteractive: !this.working,
        onAction: (): void => { this.pickImage(); } })
    } else {
      Text($r('app.string.note_media_draft_hint')).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary'))
    }
    if (this.kind === 'image') {
      ForEach(noteMediaParts(this.value), (_part: NoteMediaPart, index: number) => {
        if (this.part(index)?.kind === 'image') {
          Column({ space: 应用尺寸.间距_8 }) {
            NoteImagePreview({ source: this.imageSource(index) })
            this.imageActions(index, -1)
          }.width('100%')
        }
      }, (_part: NoteMediaPart, index: number): string => `${index}`)
      ForEach(this.images.filter((item: NoteFieldImage): boolean => item.reference === undefined), (item: NoteFieldImage) => {
        Column({ space: 应用尺寸.间距_8 }) {
          NoteImagePreview({ source: item.uri })
          this.imageActions(-1, item.id)
        }.width('100%')
      }, (item: NoteFieldImage): string => `${item.id}-${item.uri}`)
    } else {
      NoteAudioField({ value: this.value, audios: this.audios, preview: this.preview, mediaOnly: true,
        disabled: this.working, replacementsVisible: true,
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
  }

  build() {
    DialogFrame({ canDismiss: !this.working, onDismiss: (): void => { this.close(false); },
      header: () => { this.headerContent(); }, content: () => { this.bodyContent(); } })
  }
}
