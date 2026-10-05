// SPDX-License-Identifier: AGPL-3.0-or-later
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { noteFieldText } from '../../utils/NoteTypeText';
import { PressFeedback } from '../../utils/PressFeedback';
import { NoteAudioField } from './NoteAudioField';
import { NoteFieldEditor, NoteFieldEditingOptions } from './NoteFieldEditor';
import { NoteImagePreview } from './NoteImagePreview';
import { NoteMediaDialog } from './NoteMediaDialog';
import { common } from '@kit.AbilityKit';
import { NoteMediaPart, noteMediaParts, replaceNoteMediaPart, noteImagePreviewSource } from '../../model/NoteMediaParts';
import { NoteFieldAudio, NoteAudioStatus } from '../../model/NoteAudioDraft';
import { NoteAudioPreview } from '../../utils/NoteAudioPreview';
import { SettingsToggleRow } from './SettingsToggleRow';
import { NoteFieldImage } from '../../model/NoteImageDraft';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { DisclosureChevron } from './DisclosureChevron';

/** 字段标题、图片入口、输入区和附件的唯一布局；草稿与 IO 仍由宿主持有。 */
@Component
export struct NoteFieldCard {
  @Prop fieldName: string = '';
  @Prop @Watch('loadFieldConfig') fieldConfig: NoteFieldEditingOptions | null = null;
  @State private collapsed: boolean = false;
  @Prop originalStockKind: number = 0;
  @Prop value: string = '';
  @Prop disabled: boolean = false;
  @Prop mediaEditable: boolean = true;
  @Prop clozeEnabled: boolean = false;
  @Prop allFields: string[] = [];
  @Prop images: NoteFieldImage[] = [];
  @Prop fieldIndex: number = 0;
  @Prop audios: NoteFieldAudio[] = [];
  audioPreview: NoteAudioPreview = new NoteAudioPreview();
  onRemoveAudio: (id: number) => void = (_id: number): void => {};
  onAudioBusy: (busy: boolean) => void = (_busy: boolean): void => {};
  onAudioStatus: (status: NoteAudioStatus | null) => void = (_status: NoteAudioStatus | null): void => {};
  onMediaApply: (value: string, images: NoteFieldImage[], audios: NoteFieldAudio[]) => void =
    (_value: string, _images: NoteFieldImage[], _audios: NoteFieldAudio[]): void => {};
  @Prop reverseToggle: boolean = false;
  @Prop editing: boolean = false;
  @Prop stickyEditable: boolean = false;
  @Prop stickyInteractive: boolean = true;
  @Prop sticky: boolean = false;
  onStickyChange: (sticky: boolean) => void = (_sticky: boolean): void => {};
  @Prop isDark: boolean = false;
  @Prop accent: string = '#2F5FD0';
  onChange: (value: string) => void = (_value: string): void => {};
  onRemoveImage: (id: number) => void = (_id: number): void => {};
  private mediaDialog: CustomDialogController | null = null;
  private dismissManager: () => void = (): void => {};
  private disposed: boolean = false;

  aboutToAppear(): void { this.loadFieldConfig(); }
  private loadFieldConfig(): void { this.collapsed = this.fieldConfig?.collapsed === true; }

  aboutToDisappear(): void {
    this.disposed = true; this.mediaDialog?.close();
    if (this.mediaDialog !== null) this.onAudioStatus(null);
  }

  private changeValue(value: string): void {
    if (!this.disposed && !this.disabled) this.onChange(value);
  }

  private removeAudio(id: number): void {
    if (!this.disposed && !this.disabled) this.onRemoveAudio(id);
  }

  private hasMedia(kind: string): boolean {
    return noteMediaParts(this.value).some((part: NoteMediaPart): boolean => part.kind === kind) ||
      (kind === 'image' ? this.images.length > 0 : this.audios.length > 0);
  }

  private openManager(kind: string): void {
    if (this.disabled || this.disposed || this.mediaDialog !== null) return;
    this.audioPreview.stop().catch((): void => {});
    this.mediaDialog = new CustomDialogController({
      builder: NoteMediaDialog({ kind: kind, fieldIndex: this.fieldIndex, initialValue: this.value,
        initialImages: this.images, initialAudios: this.audios, preview: this.audioPreview,
        onAudioStatus: (status: NoteAudioStatus): void => { if (!this.disposed) this.onAudioStatus(status); },
        onReady: (dismiss: () => void): void => { this.dismissManager = dismiss; },
        onApply: (value: string, images: NoteFieldImage[], audios: NoteFieldAudio[]): void => {
          if (!this.disposed) this.onMediaApply(value, images, audios);
        },
        onClosed: (): void => {
          this.mediaDialog = null; this.dismissManager = (): void => {};
          if (kind === 'audio') this.onAudioStatus(null);
          if (!this.disposed) this.onAudioBusy(false);
        } }),
      customStyle: true, autoCancel: false, alignment: DialogAlignment.Center,
      width: '100%', height: '100%', maskColor: Color.Transparent,
      onWillDismiss: (_action: DismissDialogAction): void => { this.dismissManager(); }
    });
    this.onAudioBusy(true); this.mediaDialog.open();
  }

  private part(index: number): NoteMediaPart | undefined { return noteMediaParts(this.value)[index]; }
  private imageSource(index: number): string {
    const part: NoteMediaPart | undefined = this.part(index);
    if (part === undefined) return '';
    const draft: NoteFieldImage | undefined = this.images.find((item: NoteFieldImage): boolean => item.reference === part.text);
    const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
    return draft?.uri ?? noteImagePreviewSource(context.filesDir, part.filename);
  }

  private removeImage(index: number, id: number = -1): void {
    if (this.disabled || this.disposed) return;
    const part: NoteMediaPart | undefined = this.part(index);
    if (part?.kind === 'image') {
      const draft = this.images.find((item: NoteFieldImage): boolean => item.reference === part.text);
      this.changeValue(replaceNoteMediaPart(this.value, index, ''));
      if (draft !== undefined) this.onRemoveImage(draft.id);
    } else if (id >= 0) this.onRemoveImage(id);
  }

  @Builder
  private imagePreview(index: number, id: number = -1) {
    Stack({ alignContent: Alignment.TopEnd }) {
      NoteImagePreview({ source: index >= 0 ? this.imageSource(index) :
        (this.images.find((item: NoteFieldImage): boolean => item.id === id)?.uri ?? '') })
      Button($r('app.string.add_note_image_remove')).height(应用尺寸.紧凑控件高度)
        .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary'))
        .backgroundColor($r('app.color.surface_card')).borderRadius(应用尺寸.圆角_面板).border(SurfaceBorder.options())
        .margin(应用尺寸.间距_5).enabled(!this.disabled)
        .attributeModifier(new PressFeedback()).stateEffect(false)
        .onClick((): void => { this.removeImage(index, id); })
    }.width('100%')
  }

  build() {
    Column({ space: 应用尺寸.间距_8 }) {
      if (this.reverseToggle) {
        SettingsToggleRow({ title: $r('app.string.note_reverse_toggle'),
          hint: this.editing ? $r('app.string.note_reverse_edit_hint') : $r('app.string.note_reverse_toggle_hint'),
          isOn: this.value !== '', isDark: this.isDark, tint: this.accent, isInteractive: !this.disabled,
          onChange: (isOn: boolean): void => { this.changeValue(isOn ? '1' : ''); } })
      } else {
        Row() {
          Text(noteFieldText(this.getUIContext(), this.fieldName, this.originalStockKind)).fontSize(应用尺寸.字号_按钮).fontWeight(FontWeight.Medium)
            .fontColor($r('app.color.text_primary')).layoutWeight(1)
          if (this.fieldConfig?.collapsed === true) {
            Button() {
              DisclosureChevron({ tint: this.accent }).rotate({ angle: this.collapsed ? 0 : 90 })
            }.height(应用尺寸.紧凑控件高度).backgroundColor(Color.Transparent)
              .accessibilityText(this.collapsed ? $r('app.string.note_editor_expand') : $r('app.string.note_editor_collapse'))
              .enabled(!this.disabled).attributeModifier(new PressFeedback()).stateEffect(false)
              .onClick((): void => { if (!this.disabled && !this.disposed) this.collapsed = !this.collapsed; })
          }
          if (this.mediaEditable) {
            Button($r('app.string.add_note_image_add')).height(应用尺寸.紧凑控件高度)
              .fontSize(应用尺寸.字号_正文_小).fontColor(this.accent).backgroundColor(Color.Transparent)
              .borderRadius(应用尺寸.圆角_面板).padding({ left: 10, right: 10 })
              .enabled(!this.disabled).attributeModifier(new PressFeedback())
              .stateEffect(false)
              .onClick((): void => { this.openManager('image'); })
            Button($r('app.string.note_audio_add'))
              .height(应用尺寸.紧凑控件高度).fontSize(应用尺寸.字号_正文_小).fontColor(this.accent)
              .backgroundColor(Color.Transparent).borderRadius(应用尺寸.圆角_面板).padding({ left: 10, right: 10 })
              .enabled(!this.disabled).attributeModifier(new PressFeedback()).stateEffect(false)
              .onClick((): void => { this.openManager('audio'); })
          }
        }.width('100%')
        if (!this.collapsed) {
          ForEach(noteMediaParts(this.value), (_part: NoteMediaPart, index: number) => {
            if (this.part(index)?.kind === 'image') {
              this.imagePreview(index)
            } else if (this.part(index)?.kind === 'text' &&
              (this.part(index)?.text !== '' || index === 0 || index === noteMediaParts(this.value).length - 1)) {
              NoteFieldEditor({ value: this.part(index)?.text ?? '',
                fieldName: noteFieldText(this.getUIContext(), this.fieldName, this.originalStockKind), disabled: this.disabled,
                fieldConfig: this.fieldConfig,
                clozeEnabled: this.clozeEnabled, allFields: this.allFields,
                onChange: (text: string): void => { this.changeValue(replaceNoteMediaPart(this.value, index, text)); } })
            }
          }, (_part: NoteMediaPart, index: number): string => `${index}`)
          ForEach(this.images.filter((item: NoteFieldImage): boolean => item.reference === undefined), (attachment: NoteFieldImage) => {
            this.imagePreview(-1, attachment.id)
          }, (attachment: NoteFieldImage): string => `${attachment.id}-${attachment.uri}`)
          if (this.hasMedia('audio')) {
            NoteAudioField({ value: this.value, disabled: this.disabled, audios: this.audios, preview: this.audioPreview,
              mediaOnly: true, controlsVisible: false,
              onChange: (value: string): void => { this.changeValue(value); }, onRemove: (id: number): void => { this.removeAudio(id); } })
          }
        }
      }
      if (this.stickyEditable) {
        SettingsToggleRow({ title: $r('app.string.note_field_sticky'), hint: $r('app.string.note_field_sticky_hint'),
          isOn: this.sticky, isDark: this.isDark, tint: this.accent, isInteractive: !this.disabled && this.stickyInteractive,
          onChange: (sticky: boolean): void => { if (!this.disabled && !this.disposed) this.onStickyChange(sticky); } })
      }
    }.width('100%').padding(应用尺寸.卡片内边距)
      .backgroundColor($r('app.color.surface_card')).borderRadius(应用尺寸.圆角_卡片).border(SurfaceBorder.options())
  }
}
