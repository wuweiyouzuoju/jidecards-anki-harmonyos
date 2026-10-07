// SPDX-License-Identifier: AGPL-3.0-or-later
import { appInterface } from '../../backend/AppInterfaceService';
import { noteEditorFormatObservation } from '../../model/AppInterface';
import { noteEditorTool, noteEditorFormatOptions, NoteEditorFormatOption } from '../../model/NoteFieldEditing';
import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';
import { ActionMenuList, ActionMenuListItem } from '../common/ActionMenuList';
import { namedResourceText } from '../../utils/UiFeedback';
import { 应用尺寸 } from '../../utils/应用尺寸';

/** 只发布当前选项并回调原字段编辑器，不直接写集合。 */
@CustomDialog
export struct NoteEditorFormatDialog {
  controller?: CustomDialogController;
  toolId: string = 'math';
  fieldName: string = '';
  source: boolean = false;
  onClose: () => void = (): void => {};
  onSelect: (id: string) => void = (_id: string): void => {};
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  private observationVersion: number = 0;

  aboutToAppear(): void {
    this.observationVersion = appInterface.observe(noteEditorFormatObservation(this.toolId, this.fieldName, this.source));
  }
  aboutToDisappear(): void { appInterface.leave('note_editor_format_options', this.observationVersion); }

  private options(_locale: string = this.uiLanguage): ActionMenuListItem[] {
    return noteEditorFormatOptions(this.toolId).map((option: NoteEditorFormatOption): ActionMenuListItem =>
      ({ id: option.id, label: namedResourceText(this.getUIContext(), option.titleKey) }));
  }
  private select(id: string): void {
    if (noteEditorFormatOptions(this.toolId).some((option: NoteEditorFormatOption): boolean => option.id === id)) {
      this.onSelect(id);
    }
  }
  @Builder
  private header() {
    DialogHeader({ title: $r('app.string.' + noteEditorTool(this.toolId).titleKey), showAction: false,
      onClose: (): void => { this.onClose(); } })
  }
  @Builder
  private content() {
    ActionMenuList({ items: this.options(), onSelect: (id: string): void => { this.select(id); } })
  }
  build() {
    DialogFrame({ maximumWidth: 应用尺寸.dialogCompactMaxWidth,
      header: () => { this.header(); }, content: () => { this.content(); },
      onDismiss: (): void => { this.onClose(); } })
  }
}
