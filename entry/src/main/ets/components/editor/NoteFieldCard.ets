import { NativeDialogHost, NativeDialogDismiss, NativeDialogPresentation } from '../common/NativeDialogHost';
import { SurfaceTransition } from '../../utils/SurfaceTransition';
import { IconActionButton } from '../common/IconActionButton';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { noteFieldText } from '../../utils/NoteTypeText';
import { PressFeedback } from '../../utils/PressFeedback';
import { NoteAudioField } from '../common/NoteAudioField';
import { NoteFieldEditor, NoteFieldEditingOptions, noteFieldMediaTool } from '../common/NoteFieldEditor';
import { NoteVisualPreview } from './NoteVisualPreview';
import { NoteMediaDialog } from './NoteMediaDialog';
import { common } from '@kit.AbilityKit';
import { NoteMediaPart, noteMediaParts, replaceNoteMediaPart, noteImagePreviewSource } from '../../model/NoteMediaParts';
import { NoteFieldAudio, NoteAudioStatus } from '../../model/NoteAudioDraft';
import { NoteAudioPreview } from '../../utils/NoteAudioPreview';
import { SettingsToggleRow } from '../common/SettingsToggleRow';
import { NoteFieldImage } from '../../model/NoteImageDraft';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { DisclosureChevron } from '../common/DisclosureChevron';
import { showToastSafely } from '../../utils/UiFeedback';

/** 字段标题、图像入口、输入区和附件的唯一布局；图片和视频共用原图标。 */
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
  @Prop @Watch('focusRequested') focusRequest: number = 0;
  private focusRequested(): void { if (this.focusRequest > 0 && !this.disabled) this.collapsed = false; }
  private firstTextPart(): number { return noteMediaParts(this.value).findIndex((part: NoteMediaPart): boolean => part.kind === 'text'); }
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
  private readonly mediaDialog: NativeDialogHost = new NativeDialogHost();
  private dismissManager: () => void = (): void => {};
  private disposed: boolean = false;
  private managerVersion: number = 0;
  private managerActive: boolean = false;

  aboutToAppear(): void { this.disposed = false; this.mediaDialog.activate(); this.loadFieldConfig(); this.focusRequested(); }
  private loadFieldConfig(): void { this.collapsed = this.fieldConfig?.collapsed === true; }

  aboutToDisappear(): void {
    if (this.managerActive) { this.onAudioStatus(null); this.onAudioBusy(false); }
    this.managerActive = false;
    this.managerVersion++;
    this.dismissManager = (): void => {};
    this.disposed = true; this.mediaDialog.dispose();
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

  private readonly createMediaDialog: (kind: string, dismiss: NativeDialogDismiss) => CustomDialogController =
    (kind: string, dismiss: NativeDialogDismiss): CustomDialogController => {
    const presentation: NativeDialogPresentation = this.mediaDialog.presentation();
    const version: number = this.managerVersion;
    return new CustomDialogController({
      builder: NoteMediaDialog({ kind: kind, fieldIndex: this.fieldIndex, initialValue: this.value,
        initialImages: this.images, initialAudios: this.audios, preview: this.audioPreview,
        onRequestClose: this.mediaDialog.guard((): void => { this.mediaDialog.close(); }),
        onAudioStatus: (status: NoteAudioStatus): void => { if (this.isCurrentManager(version)) this.onAudioStatus(status); },
        onReady: (dismiss: () => void): void => { if (this.isCurrentManager(version)) this.dismissManager = dismiss; },
        onApply: (value: string, images: NoteFieldImage[], audios: NoteFieldAudio[]): void => {
          if (this.isCurrentManager(version)) this.onMediaApply(value, images, audios);
        },
        onClosed: (): void => {
          if (!this.isCurrentManager(version)) return;
          this.managerActive = false;
          this.mediaDialog.release(); this.dismissManager = (): void => {};
          if (!this.disposed) {
            if (kind === 'audio') this.onAudioStatus(null);
            this.onAudioBusy(false);
          }
        } }),
      openAnimation: presentation.openAnimation, closeAnimation: presentation.closeAnimation, customStyle: presentation.customStyle, autoCancel: presentation.autoCancel, alignment: presentation.alignment,
      width: presentation.width, height: presentation.height, maskColor: presentation.maskColor,
      onWillDismiss: dismiss
    });
  };

  private openManager(kind: string): void {
    if (this.disabled || this.disposed || this.mediaDialog.current() !== null) return;
    this.managerVersion++;
    this.managerActive = true;
    this.audioPreview.stop().catch((): void => {});
    this.onAudioBusy(true);
    try {
      this.mediaDialog.open((dismiss: NativeDialogDismiss): CustomDialogController => this.createMediaDialog(kind, dismiss),
        (): boolean => { this.dismissManager(); return false; });
    } catch (error) {
      this.managerVersion++;
      this.managerActive = false;
      this.dismissManager = (): void => {};
      this.onAudioStatus(null);
      this.onAudioBusy(false);
      showToastSafely(this.getUIContext(), { message: $r('app.string.note_media_open_failed') });
    }
  }

  private isCurrentManager(version: number): boolean {
    return !this.disposed && this.managerActive && version === this.managerVersion;
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
    if (part?.kind === 'image' || part?.kind === 'video') {
      const draft = this.images.find((item: NoteFieldImage): boolean => item.reference === part.text);
      this.changeValue(replaceNoteMediaPart(this.value, index, ''));
      if (draft !== undefined) this.onRemoveImage(draft.id);
    } else if (id >= 0) this.onRemoveImage(id);
  }

  @Builder
  private imagePreview(index: number, id: number = -1) {
    Stack({ alignContent: Alignment.TopEnd }) {
      NoteVisualPreview({ source: index >= 0 ? this.imageSource(index) :
        (this.images.find((item: NoteFieldImage): boolean => item.id === id)?.uri ?? ''),
        kind: index >= 0 ? (this.part(index)?.kind ?? 'image') :
          (this.images.find((item: NoteFieldImage): boolean => item.id === id)?.kind ?? 'image'), disabled: this.disabled })
      Button($r('app.string.note_visual_remove')).height(应用尺寸.紧凑控件高度)
        .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary'))
        .backgroundColor($r('app.color.surface_card')).border(SurfaceBorder.options()).borderRadius(应用尺寸.圆角_面板)
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
            IconActionButton({ source: $r('app.media.' + noteFieldMediaTool('image').iconKey),
              label: $r('app.string.' + noteFieldMediaTool('image').titleKey),
              glyphColor: this.accent, controlGlyphSize: 24, isInteractive: !this.disabled,
              onAction: (): void => { this.openManager('image'); } })
            IconActionButton({ source: $r('app.media.' + noteFieldMediaTool('audio').iconKey),
              label: $r('app.string.' + noteFieldMediaTool('audio').titleKey),
              glyphColor: this.accent, controlGlyphSize: 24, isInteractive: !this.disabled,
              onAction: (): void => { this.openManager('audio'); } })
          }
        }.width('100%')
        if (!this.collapsed) {
          ForEach(noteMediaParts(this.value), (_part: NoteMediaPart, index: number) => {
            if (this.part(index)?.kind === 'image' || this.part(index)?.kind === 'video') {
              this.imagePreview(index)
            } else if (this.part(index)?.kind === 'text' &&
              (this.part(index)?.text !== '' || index === 0 || index === noteMediaParts(this.value).length - 1)) {
              NoteFieldEditor({ value: this.part(index)?.text ?? '',
                focusRequest: index === this.firstTextPart() ? this.focusRequest : 0,
                fieldName: noteFieldText(this.getUIContext(), this.fieldName, this.originalStockKind), disabled: this.disabled,
                fieldConfig: this.fieldConfig,
                clozeEnabled: this.clozeEnabled, allFields: this.allFields,
                onChange: (text: string): void => { this.changeValue(replaceNoteMediaPart(this.value, index, text)); } })
            }
          }, (part: NoteMediaPart, index: number): string => `${index}-${part.kind}-${part.filename}`)
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
      .backgroundColor($r('app.color.surface_card')).border(SurfaceBorder.options()).borderRadius(应用尺寸.圆角_卡片)
  }
}
