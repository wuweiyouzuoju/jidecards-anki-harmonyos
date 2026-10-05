// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { picker } from '@kit.CoreFileKit';
import { NoteFieldEditor } from './NoteFieldEditor';
import { 按下态按钮 } from './按下态按钮';
import { SettingsActionRow } from './SettingsActionRow';
import { IconActionButton } from './IconActionButton';
import { NoteFieldAudio, NoteAudioPart, NoteAudioStatus, NoteAudioAttachmentStatus, noteAudioParts, replaceNoteAudioPart, localNoteAudioPath } from '../../model/NoteAudioDraft';
import { NoteAudioPreview } from '../../utils/NoteAudioPreview';
import { stageNoteAudio } from '../../backend/NoteAudioImport';
import { NoteAudioRecorder, discardNoteRecordings } from '../../utils/NoteAudioRecorder';
import { localizedResourceText, resourceText } from '../../utils/UiFeedback';
import { 颜色键 } from '../../model/颜色主题';
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { APP_FOREGROUND_KEY } from '../../model/AppLifecycleState';

/** 共用音频字段：原有 sound 引用按位置展示；附件仍由表单和写入边界持有。 */
@Component
export struct NoteAudioField {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop @Watch('publishStatus') value: string = '';
  @Prop fieldName: string = '';
  @Prop @Watch('publishStatus') disabled: boolean = false;
  @Prop clozeEnabled: boolean = false;
  @Prop allFields: string[] = [];
  @Prop @Watch('publishStatus') audios: NoteFieldAudio[] = [];
  @Prop mediaOnly: boolean = false;
  @Prop controlsVisible: boolean = true;
  @Prop @Watch('publishStatus') removalsVisible: boolean = true;
  @Prop @Watch('publishStatus') replacementsVisible: boolean = false;
  onReplace: (partIndex: number, id: number, uri: string, label: string, temporary: boolean) => void =
    (_partIndex: number, _id: number, _uri: string, _label: string, _temporary: boolean): void => {};
  preview: NoteAudioPreview = new NoteAudioPreview();
  onChange: (value: string) => void = (_value: string): void => {};
  onAdd: (uri: string, label: string, temporary: boolean) => void =
    (_uri: string, _label: string, _temporary: boolean): void => {};
  onRemove: (id: number) => void = (_id: number): void => {};
  onBusy: (busy: boolean) => void = (_busy: boolean): void => {};
  onStatus: (status: NoteAudioStatus) => void = (_status: NoteAudioStatus): void => {};
  @StorageProp(颜色键.主色按钮背景) private buttonColor: string = '#2F5FD0';
  @State @Watch('publishStatus') private working: boolean = false;
  @State @Watch('publishStatus') private recording: boolean = false;
  @State @Watch('publishStatus') private paused: boolean = false;
  @State @Watch('publishStatus') private playingKey: string = '';
  @State @Watch('publishStatus') private errorMessage: string = '';
  @State @Watch('publishStatus') private seconds: number = 0;
  @StorageProp(APP_FOREGROUND_KEY) @Watch('backgroundChanged') private foreground: boolean = true;
  private recorder: NoteAudioRecorder = new NoteAudioRecorder();
  private disposed: boolean = false;
  private capturePending: boolean = false;
  private cancelling: Promise<void> | null = null;
  private timer: number = -1;

  aboutToAppear(): void { this.publishStatus(); }

  private publishStatus(): void {
    if (this.disposed || !this.controlsVisible) return;
    const attachments: NoteAudioAttachmentStatus[] = [];
    noteAudioParts(this.value).forEach((part: NoteAudioPart, index: number): void => {
      if (part.filename !== '') attachments.push(this.attachmentStatus(`existing-${index}`));
    });
    this.audios.forEach((item: NoteFieldAudio): void => {
      if (item.reference === undefined) attachments.push(this.attachmentStatus(`pending-${item.id}`));
    });
    this.onStatus({ recording: this.recording, paused: this.paused, working: this.working,
      disabled: this.disabled, seconds: this.seconds, hasError: this.errorMessage !== '', attachments: attachments });
  }

  private attachmentStatus(id: string): NoteAudioAttachmentStatus {
    return { id: id, playing: this.playingKey === id, replace: this.replacementsVisible, remove: this.removalsVisible };
  }

  aboutToDisappear(): void {
    this.disposed = true;
    this.clearTimer();
    this.preview.stop().catch((): void => {});
    this.recorder.cancel().catch((): void => {});
    this.onBusy(false);
  }

  private context(): common.UIAbilityContext { return this.getUIContext().getHostContext() as common.UIAbilityContext; }
  private error(key: Resource, _locale: string = this.uiLanguage): void { if (!this.disposed) this.errorMessage = resourceText(this.getUIContext(), key); }
  private busy(value: boolean): void {
    if (!this.disposed) { this.working = value || this.cancelling !== null; this.onBusy(this.working || this.recording); }
  }
  private clearTimer(): void { if (this.timer >= 0) clearInterval(this.timer); this.timer = -1; }

  private startTimer(): void {
    this.clearTimer();
    this.timer = setInterval((): void => {
      if (!this.recording || this.paused || this.working) return;
      this.seconds++;
      if (this.seconds >= 300) this.finishRecording();
    }, 1000);
  }

  private recordingFailure(_locale: string = this.uiLanguage): void {
    if (this.disposed) return;
    const code: number = this.recorder.failureCode();
    this.errorMessage = code === 201 ? resourceText(this.getUIContext(), $r('app.string.note_audio_permission_denied')) :
      code === 5400107 ? resourceText(this.getUIContext(), $r('app.string.note_audio_interrupted')) :
      code > 0 ? resourceText(this.getUIContext(), $r('app.string.note_audio_record_failed_code'), code) :
      resourceText(this.getUIContext(), $r('app.string.note_audio_record_failed'));
  }

  private async pick(partIndex: number = -1, id: number = -1): Promise<void> {
    if (this.disabled || this.working || this.recording || this.disposed) return;
    this.busy(true); this.errorMessage = '';
    try {
      await this.preview.stop();
      const options: picker.AudioSelectOptions = new picker.AudioSelectOptions();
      options.maxSelectNumber = 1;
      const uris: string[] = await new picker.AudioViewPicker(this.context()).select(options);
      if (this.disposed || uris.length === 0) return;
      const uri: string = uris[0];
      const path: string = await stageNoteAudio(uri, this.context().cacheDir);
      let label: string = uri.slice(uri.lastIndexOf('/') + 1);
      try { label = decodeURIComponent(label); } catch (error) { /* 非标准 provider 名称仍可显示。 */ }
      if (this.disposed) {
        await discardNoteRecordings([{ id: 0, fieldIndex: 0, uri: path, label: '', filename: '', temporary: true }]);
        return;
      }
      if (partIndex >= 0 || id >= 0) this.onReplace(partIndex, id, path, label, true);
      else this.onAdd(path, label, true);
    } catch (error) { this.error($r('app.string.note_audio_import_failed')); }
    finally { this.busy(false); }
  }

  private async record(): Promise<void> {
    if (this.disabled || this.working || this.recording || this.disposed || !this.foreground) return;
    this.capturePending = true; this.busy(true); this.errorMessage = '';
    try {
      await this.preview.stop();
      const started: boolean = await this.recorder.start(this.context(), (): void => {
        this.recordingFailure();
        this.cancelRecording();
      });
      if (!started) return;
      if (this.disposed || !this.foreground) { await this.recorder.cancel(); return; }
      this.recording = true; this.paused = false; this.seconds = 0;
      this.startTimer();
    } catch (error) { this.recordingFailure(); }
    finally { this.capturePending = false; this.busy(false); }
  }

  private async finishRecording(_locale: string = this.uiLanguage): Promise<void> {
    if (!this.recording || this.working || this.disposed) return;
    this.clearTimer(); this.busy(true);
    try {
      const path: string = await this.recorder.finish();
      if (this.disposed) {
        await discardNoteRecordings([{ id: 0, fieldIndex: 0, uri: path, label: '', filename: '', temporary: true }]);
        return;
      }
      this.onAdd(path, resourceText(this.getUIContext(), $r('app.string.note_audio_recorded'), this.seconds), true);
    } catch (error) { this.recordingFailure(); }
    finally { if (!this.disposed) { this.recording = false; this.paused = false; } this.busy(false); }
  }

  private async cancelRecording(): Promise<void> {
    if (this.cancelling !== null) {
      try { await this.cancelling; } catch (error) { /* 首次取消拥有错误提示。 */ }
      return;
    }
    this.clearTimer(); this.busy(true);
    try {
      this.cancelling = this.recorder.cancel();
      await this.cancelling;
    }
    catch (error) { this.recordingFailure(); }
    finally {
      this.cancelling = null;
      if (!this.disposed) { this.recording = false; this.paused = false; }
      this.busy(false);
    }
  }

  private async togglePause(): Promise<void> {
    if (!this.recording || this.working || this.disposed) return;
    this.busy(true);
    try {
      if (this.paused) await this.recorder.resume(); else await this.recorder.pause();
      if (this.disposed || this.cancelling !== null || !this.recording) return;
      this.paused = !this.paused;
      if (this.paused) this.clearTimer(); else this.startTimer();
    } catch (error) { this.recordingFailure(); await this.cancelRecording(); }
    finally { this.busy(false); }
  }

  private backgroundChanged(): void {
    if (!this.foreground) {
      this.preview.stop().catch((): void => {});
      if (this.recording || this.capturePending) this.cancelRecording();
    }
  }

  private async play(key: string, filename: string, uri: string = ''): Promise<void> {
    if (this.disabled || this.working || this.disposed) return;
    this.errorMessage = '';
    try {
      if (this.playingKey === key) { await this.preview.stop(); return; }
      const path: string = uri === '' ? localNoteAudioPath(this.context().filesDir, filename) : uri;
      await this.preview.play(path, (playing: boolean): void => {
        if (!this.disposed) this.playingKey = playing ? key : '';
      });
    } catch (error) { this.error($r('app.string.note_audio_play_failed')); }
  }

  private removePart(index: number): void {
    if (this.disabled || this.working) return;
    this.preview.stop().catch((): void => {});
    const draft: NoteFieldAudio | undefined = this.partAttachment(index);
    this.onChange(replaceNoteAudioPart(this.value, index, ''));
    if (draft !== undefined) this.onRemove(draft.id);
  }

  // ForEach 的位置 key 保持输入组件身份；内容从最新字段值读取，不能捕获旧 part 对象。
  private partText(index: number): string { return noteAudioParts(this.value)[index]?.text ?? ''; }
  private partFilename(index: number): string { return noteAudioParts(this.value)[index]?.filename ?? ''; }
  private partAttachment(index: number): NoteFieldAudio | undefined {
    return this.audios.find((item: NoteFieldAudio): boolean => item.reference === this.partText(index));
  }
  private partLabel(index: number): string { return this.partAttachment(index)?.label ?? this.partFilename(index); }
  private partUri(index: number): string { return this.partAttachment(index)?.uri ?? ''; }

  @Builder
  private audioRow(key: string, label: string, filename: string, uri: string, remove: () => void, partIndex: number = -1, id: number = -1) {
    Stack({ alignContent: Alignment.TopEnd }) {
      Row({ space: 应用尺寸.间距_8 }) {
        Text(partIndex >= 0 ? this.partLabel(partIndex) : label)
          .fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_primary'))
          .maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
          .layoutWeight(1).constraintSize({ minWidth: 0 })
        按下态按钮({ 文案: this.playingKey === key ? $r('app.string.note_audio_stop') : $r('app.string.note_audio_play'),
          字色: this.buttonColor, singleLine: true, 是否启用: !this.disabled && !this.working,
          点击回调: (): void => { this.play(key, partIndex >= 0 ? this.partFilename(partIndex) : filename,
            partIndex >= 0 ? this.partUri(partIndex) : uri); } }).flexShrink(0)
        if (this.replacementsVisible) {
          按下态按钮({ 文案: $r('app.string.note_media_replace'), singleLine: true,
            是否启用: !this.disabled && !this.working && !this.recording,
            点击回调: (): void => { this.pick(partIndex, id); } }).flexShrink(0)
        }
      }.width('100%')
        .padding({ left: 应用尺寸.间距_12, right: 应用尺寸.间距_12 + (this.removalsVisible ? 应用尺寸.按钮高度 : 0),
          top: 应用尺寸.间距_8,
          bottom: 应用尺寸.间距_8 })
      if (this.removalsVisible) {
        IconActionButton({ source: $r('app.media.ic_common_close'), label: $r('app.string.note_audio_remove'),
          cornerAligned: true,
          isInteractive: !this.disabled && !this.working && !this.recording, onAction: remove })
          .margin({ right: 应用尺寸.间距_4, top: 应用尺寸.间距_4 })
      }
    }.width('100%')
      .backgroundColor($r('app.color.surface_sidebar'))
      .borderRadius(应用尺寸.圆角_面板).border(SurfaceBorder.options())
  }

  @Builder
  private controlRows() {
    Column() {
      if (this.recording) {
        SettingsActionRow({ title: $r('app.string.note_audio_record_done'),
          trailingIcon: this.paused ? $r('app.media.ic_audio_record_off') : $r('app.media.ic_audio_recording'),
          hint: localizedResourceText(this.getUIContext(), this.uiLanguage,
            this.paused ? $r('app.string.note_audio_paused') : $r('app.string.note_audio_recording'), this.seconds),
          isInteractive: !this.working, onAction: (): void => { this.finishRecording(); } })
        Divider().strokeWidth(1).color(SurfaceBorder.color())
        SettingsActionRow({ title: this.paused ? $r('app.string.note_audio_resume') : $r('app.string.note_audio_pause'),
          trailingIcon: this.paused ? $r('app.media.ic_audio_resume') : $r('app.media.ic_audio_pause'),
          isInteractive: !this.working, onAction: (): void => { this.togglePause(); } })
        Divider().strokeWidth(1).color(SurfaceBorder.color())
        SettingsActionRow({ title: $r('app.string.note_audio_record_cancel'),
          trailingIcon: $r('app.media.ic_common_close'),
          isInteractive: !this.working, onAction: (): void => { this.cancelRecording(); } })
      } else {
        SettingsActionRow({ title: $r('app.string.note_audio_add'),
          isInteractive: !this.disabled && !this.working, onAction: (): void => { this.pick(); } })
        Divider().strokeWidth(1).color(SurfaceBorder.color())
        SettingsActionRow({ title: $r('app.string.note_audio_record'),
          trailingIcon: $r('app.media.ic_audio_record_on'),
          isInteractive: !this.disabled && !this.working, onAction: (): void => { this.record(); } })
      }
    }.width('100%')
  }

  build() {
    Column({ space: 应用尺寸.间距_8 }) {
      if (this.controlsVisible) { this.controlRows() }
      ForEach(noteAudioParts(this.value), (part: NoteAudioPart, index: number) => {
        if (this.partFilename(index) !== '') {
          this.audioRow(`existing-${index}`, '', '', '', (): void => { this.removePart(index); }, index)
        } else if (!this.mediaOnly && (this.partText(index) !== '' || index === 0 || index === noteAudioParts(this.value).length - 1)) {
          NoteFieldEditor({ value: this.partText(index), fieldName: this.fieldName, disabled: this.disabled || this.working,
            clozeEnabled: this.clozeEnabled, allFields: this.allFields,
            onChange: (text: string): void => { this.onChange(replaceNoteAudioPart(this.value, index, text)); } })
        }
      }, (_part: NoteAudioPart, index: number): string => `${index}`)
      ForEach(this.audios.filter((item: NoteFieldAudio): boolean => item.reference === undefined), (item: NoteFieldAudio) => {
        this.audioRow(`pending-${item.id}`, item.label, item.filename, item.uri, (): void => {
          this.preview.stop().catch((): void => {}); this.onRemove(item.id);
        }, -1, item.id)
      }, (item: NoteFieldAudio): string => `${item.id}`)
      if (this.errorMessage !== '') {
        Text(this.errorMessage).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.error_text')).width('100%')
      }
    }.width('100%')
  }
}
