// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { picker } from '@kit.CoreFileKit';
import { NoteAudioField } from './common/NoteAudioField';
import { DialogFrame } from './common/DialogFrame';
import { DialogHeader } from './common/DialogHeader';
import { SettingsActionRow } from './common/SettingsActionRow';
import { NoteFieldAudio, NoteAudioStatus } from '../model/NoteAudioDraft';
import { StudyKeyboardSession } from '../model/StudyKeyboard';
import { studyEventChord } from '../utils/StudyKeyAdapter';
import { NoteAudioPreview } from '../utils/NoteAudioPreview';
import { 按描述符复制文件 } from '../backend/DataTransferFiles';
import { appInterface } from '../backend/AppInterfaceService';
import { resourceText } from '../utils/UiFeedback';

/** 复用录音组件和播放器；录音归学习会话持有，保存由系统文件选择器完成。 */
@Component
export struct StudyVoiceDialog {
  @Prop audios: NoteFieldAudio[] = [];
  @Prop initialAction: string = '';
  @Prop initialKeyCode: number = -1;
  @Prop @Watch('close') backRequest: number = 0;
  onAdd: (uri: string, label: string) => void = (_uri: string, _label: string): void => {};
  onRemove: () => void = (): void => {};
  onClose: () => void = (): void => {};
  @State private recordRequest: number = 0;
  @State private busy: boolean = false;
  @State private saving: boolean = false;
  @State private message: string = '';
  private readonly keys: StudyKeyboardSession = new StudyKeyboardSession();
  private readonly preview: NoteAudioPreview = new NoteAudioPreview();
  private disposed: boolean = false;
  private initialized: boolean = false;
  aboutToAppear(): void { if (this.initialKeyCode >= 0) this.keys.update(this.initialKeyCode, true); }
  aboutToDisappear(): void { this.disposed = true; this.preview.dispose().catch((): void => {}); appInterface.leave('study_voice'); }
  private start(): void {
    if (this.initialized) return;
    this.initialized = true;
    if (this.initialAction === 'voice_record') this.recordRequest++;
    else if (this.initialAction === 'voice_replay') this.replay();
    else if (this.initialAction === 'voice_save') this.save();
    this.publish();
  }
  private publish(): void {
    if (this.disposed) return;
    appInterface.observe({ surface: 'study_voice', sectionId: '', selectedId: '', optionIds: [], optionLabels: [],
      busy: this.busy || this.saving, controlsComplete: true,
      items: [{ id: 'record', titleKey: 'note_audio_record', title: '', enabled: !this.saving, selected: this.busy },
        { id: 'replay', titleKey: 'note_audio_play', title: '', enabled: !this.busy && !this.saving && this.audios.length > 0, selected: false },
        { id: 'save', titleKey: 'keyboard_voice_save', title: '', enabled: !this.busy && !this.saving && this.audios.length > 0, selected: false },
        { id: 'close', titleKey: 'done', title: '', enabled: !this.busy && !this.saving, selected: false }],
      values: [{ id: 'has_recording', value: String(this.audios.length > 0) }] });
  }
  private async replay(): Promise<void> {
    if (this.busy || this.saving || this.disposed || this.audios.length === 0) return;
    try { await this.preview.play(this.audios[0].uri, (): void => {}); }
    catch (error) { if (!this.disposed) this.message = resourceText(this.getUIContext(), $r('app.string.browser_preview_audio_error')); }
  }
  private async save(): Promise<void> {
    if (this.busy || this.saving || this.disposed || this.audios.length === 0) return;
    const uri: string = this.audios[0].uri;
    this.saving = true; this.message = ''; this.publish();
    try {
      await this.preview.stop();
      const options: picker.DocumentSaveOptions = new picker.DocumentSaveOptions();
      options.newFileNames = ['recording-' + Date.now() + '.m4a']; options.fileSuffixChoices = ['.m4a'];
      const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
      const targets: string[] = await new picker.DocumentViewPicker(context).save(options);
      if (this.disposed || targets.length === 0) return;
      await 按描述符复制文件(uri, targets[0]);
      if (!this.disposed) this.message = resourceText(this.getUIContext(), $r('app.string.keyboard_voice_saved'));
    } catch (error) { if (!this.disposed) this.message = resourceText(this.getUIContext(), $r('app.string.keyboard_voice_save_failed')); }
    finally { if (!this.disposed) { this.saving = false; this.publish(); } }
  }
  private close(): void { if (!this.busy && !this.saving) this.onClose(); }
  @Builder
  private header() {
    DialogHeader({ title: $r('app.string.keyboard_voice_title'), showAction: false,
      closeEnabled: !this.busy && !this.saving, onClose: (): void => { this.close(); } })
  }
  @Builder
  private body() {
    Column() {
      Text($r('app.string.keyboard_voice_hint')).fontColor($r('app.color.text_secondary')).width('100%')
      NoteAudioField({ audios: this.audios, mediaOnly: true, captureOnly: true, recordRequest: this.recordRequest,
        disabled: this.saving, preview: this.preview,
        onBusy: (value: boolean): void => { this.busy = value; this.publish(); },
        onStatus: (_status: NoteAudioStatus): void => { this.publish(); },
        onAdd: (uri: string, label: string, _temporary: boolean): void => { this.onAdd(uri, label); },
        onRemove: (_id: number): void => { this.onRemove(); } })
      SettingsActionRow({ title: $r('app.string.keyboard_voice_save'), isInteractive: !this.busy && !this.saving && this.audios.length > 0,
        onAction: (): void => { this.save(); } })
      if (this.message !== '') { Text(this.message).fontColor($r('app.color.text_secondary')).width('100%') }
    }.width('100%').onAreaChange((): void => { this.start(); })
  }
  build() {
    DialogFrame({ header: (): void => { this.header(); }, content: (): void => { this.body(); },
      canDismiss: !this.busy && !this.saving, onDismiss: (): void => { this.close(); } })
      .onKeyPreIme((event: KeyEvent): boolean => {
        const fresh: boolean = this.keys.update(event.keyCode, event.type === KeyType.Down);
        if (event.type !== KeyType.Down) return false;
        const chord: string = studyEventChord(event);
        if (!fresh) return ['shift+v', 'shift+s', 'v', 'escape'].includes(chord);
        if (chord === 'shift+v' && !this.saving) this.recordRequest++;
        else if (chord === 'shift+s') this.save();
        else if (chord === 'v') this.replay();
        else if (chord === 'escape') this.close();
        else return false;
        return true;
      })
  }
}
