// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { picker } from '@kit.CoreFileKit';
import { LengthMetrics } from '@kit.ArkUI';
import { NoteFieldEditor } from './NoteFieldEditor';
import { NoteFieldAudio, NoteAudioPart, noteAudioParts, replaceNoteAudioPart, localNoteAudioPath } from '../../model/NoteAudioDraft';
import { NoteAudioPreview } from '../../utils/NoteAudioPreview';
import { stageNoteAudio } from '../../backend/NoteAudioImport';
import { NoteAudioRecorder, discardNoteRecordings } from '../../utils/NoteAudioRecorder';
import { resourceText } from '../../utils/UiFeedback';
import { 颜色键 } from '../../model/颜色主题';
import { PressFeedback } from '../../utils/PressFeedback';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { APP_FOREGROUND_KEY } from '../../model/Redemption';

/** 共用音频字段：原有 sound 引用按位置展示；附件仍由表单和写入边界持有。 */
@Component
export struct NoteAudioField {
  @Prop value: string = '';
  @Prop fieldName: string = '';
  @Prop disabled: boolean = false;
  @Prop clozeEnabled: boolean = false;
  @Prop allFields: string[] = [];
  @Prop audios: NoteFieldAudio[] = [];
  @Prop mediaOnly: boolean = false;
  @Prop controlsVisible: boolean = true;
  @Prop removalsVisible: boolean = true;
  @Prop replacementsVisible: boolean = false;
  onReplace: (partIndex: number, id: number, uri: string, label: string, temporary: boolean) => void =
    (_partIndex: number, _id: number, _uri: string, _label: string, _temporary: boolean): void => {};
  preview: NoteAudioPreview = new NoteAudioPreview();
  onChange: (value: string) => void = (_value: string): void => {};
  onAdd: (uri: string, label: string, temporary: boolean) => void =
    (_uri: string, _label: string, _temporary: boolean): void => {};
  onRemove: (id: number) => void = (_id: number): void => {};
  onBusy: (busy: boolean) => void = (_busy: boolean): void => {};
  @StorageProp(颜色键.主色按钮背景) private buttonColor: string = '#2F5FD0';
  @State private working: boolean = false;
  @State private recording: boolean = false;
  @State private playingKey: string = '';
  @State private errorMessage: string = '';
  @State private seconds: number = 0;
  @StorageProp(APP_FOREGROUND_KEY) @Watch('backgroundChanged') private foreground: boolean = true;
  private recorder: NoteAudioRecorder = new NoteAudioRecorder();
  private disposed: boolean = false;
  private capturePending: boolean = false;
  private timer: number = -1;

  aboutToDisappear(): void {
    this.disposed = true;
    this.clearTimer();
    this.preview.stop().catch((): void => {});
    this.recorder.cancel().catch((): void => {});
    this.onBusy(false);
  }

  private context(): common.UIAbilityContext { return this.getUIContext().getHostContext() as common.UIAbilityContext; }
  private error(key: Resource): void { if (!this.disposed) this.errorMessage = resourceText(this.getUIContext(), key); }
  private busy(value: boolean): void { if (!this.disposed) { this.working = value; this.onBusy(value || this.recording); } }
  private clearTimer(): void { if (this.timer >= 0) clearInterval(this.timer); this.timer = -1; }

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
    if (this.disabled || this.working || this.recording || this.disposed) return;
    this.capturePending = true; this.busy(true); this.errorMessage = '';
    try {
      await this.preview.stop();
      await this.recorder.start(this.context(), (): void => {
        this.error($r('app.string.note_audio_record_failed'));
        this.cancelRecording();
      });
      if (this.disposed || !this.foreground) { await this.recorder.cancel(); return; }
      this.recording = true; this.seconds = 0;
      this.timer = setInterval((): void => {
        this.seconds++;
        // 移动制卡的短录音上限，防止忘记停止后无限占用麦克风和缓存。
        if (this.seconds >= 300) this.finishRecording();
      }, 1000);
    } catch (error) { this.error($r('app.string.note_audio_record_failed')); }
    finally { this.capturePending = false; this.busy(false); }
  }

  private async finishRecording(): Promise<void> {
    if (!this.recording || this.working || this.disposed) return;
    this.clearTimer(); this.busy(true);
    try {
      const path: string = await this.recorder.finish();
      if (this.disposed) {
        await discardNoteRecordings([{ id: 0, fieldIndex: 0, uri: path, label: '', filename: '', temporary: true }]);
        return;
      }
      this.onAdd(path, resourceText(this.getUIContext(), $r('app.string.note_audio_recorded'), this.seconds), true);
    } catch (error) { this.error($r('app.string.note_audio_record_failed')); }
    finally { if (!this.disposed) this.recording = false; this.busy(false); }
  }

  private async cancelRecording(): Promise<void> {
    this.clearTimer();
    try { await this.recorder.cancel(); }
    catch (error) { this.error($r('app.string.note_audio_record_failed')); }
    finally { if (!this.disposed) this.recording = false; this.busy(false); }
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
    Row({ space: 8 }) {
      Button(this.playingKey === key ? $r('app.string.note_audio_stop') : $r('app.string.note_audio_play'))
        .height(应用尺寸.紧凑控件高度).fontSize(应用尺寸.字号_正文_小)
        .fontColor(Color.White).backgroundColor(this.buttonColor)
        .attributeModifier(new PressFeedback()).stateEffect(false).enabled(!this.disabled && !this.working)
        .onClick((): void => { this.play(key, partIndex >= 0 ? this.partFilename(partIndex) : filename,
          partIndex >= 0 ? this.partUri(partIndex) : uri); })
      Text(partIndex >= 0 ? this.partLabel(partIndex) : label)
        .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary'))
        .layoutWeight(1).maxLines(2).wordBreak(WordBreak.BREAK_ALL)
      if (this.replacementsVisible) {
        Button($r('app.string.note_media_replace')).height(应用尺寸.紧凑控件高度)
          .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary')).backgroundColor(Color.Transparent)
          .attributeModifier(new PressFeedback()).stateEffect(false).enabled(!this.disabled && !this.working && !this.recording)
          .onClick((): void => { this.pick(partIndex, id); })
      }
      if (this.removalsVisible) {
      Button($r('app.string.note_audio_remove')).height(应用尺寸.紧凑控件高度)
        .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary')).backgroundColor(Color.Transparent)
        .attributeModifier(new PressFeedback()).stateEffect(false).enabled(!this.disabled && !this.working && !this.recording)
        .onClick(remove)
      }
    }.width('100%')
  }

  build() {
    Column({ space: 应用尺寸.间距_8 }) {
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
      if (this.controlsVisible) {
      Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
        if (this.recording) {
          Text(resourceText(this.getUIContext(), $r('app.string.note_audio_recording'), this.seconds))
            .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.error_text')).width('100%')
          Button($r('app.string.note_audio_record_done')).enabled(!this.working)
            .height(应用尺寸.紧凑控件高度).fontSize(应用尺寸.字号_正文_小)
            .fontColor(Color.White).backgroundColor(this.buttonColor)
            .attributeModifier(new PressFeedback()).stateEffect(false)
            .onClick((): void => { this.finishRecording(); })
          Button($r('app.string.note_audio_record_cancel')).enabled(!this.working)
            .height(应用尺寸.紧凑控件高度).fontSize(应用尺寸.字号_正文_小)
            .fontColor(Color.White).backgroundColor(this.buttonColor)
            .attributeModifier(new PressFeedback()).stateEffect(false)
            .onClick((): void => { this.cancelRecording(); })
        } else {
          Button($r('app.string.note_audio_add')).enabled(!this.disabled && !this.working)
            .height(应用尺寸.紧凑控件高度).fontSize(应用尺寸.字号_正文_小)
            .fontColor(Color.White).backgroundColor(this.buttonColor)
            .attributeModifier(new PressFeedback()).stateEffect(false)
            .onClick((): void => { this.pick(); })
          Button($r('app.string.note_audio_record')).enabled(!this.disabled && !this.working)
            .height(应用尺寸.紧凑控件高度).fontSize(应用尺寸.字号_正文_小)
            .fontColor(Color.White).backgroundColor(this.buttonColor)
            .attributeModifier(new PressFeedback()).stateEffect(false)
            .onClick((): void => { this.record(); })
        }
      }.width('100%')
      }
      if (this.errorMessage !== '') {
        Text(this.errorMessage).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.error_text')).width('100%')
      }
    }.width('100%')
  }
}
