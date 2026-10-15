// SPDX-License-Identifier: AGPL-3.0-or-later
import { 浏览编辑区 } from './浏览编辑区';
import { NoteEditorHeader } from '../common/NoteEditorHeader';
import { NoteEditorSession, NoteEditorState, initialNoteEditorState } from '../../model/NoteEditorSession';
import { NoteEditorWheelSession, NOTE_EDITOR_WHEEL_SESSION_KEY } from '../../model/NoteEditorWheel';
import { BrowserOperationController, BrowserOperationContext } from '../../model/BrowserOperationController';
import { AnkiNoteEditor } from '../../backend/AnkiNoteEditor';
import { AnkiNoteUpdate } from '../../backend/AnkiNoteUpdate';
import { NoteFieldImage } from '../../model/NoteImageDraft';
import { NoteFieldAudio } from '../../model/NoteAudioDraft';
import { EditableNote } from '../../proto/messages/NoteMessages';
import { NoteDraftPreviewInput } from '../../model/NoteDraftPreview';
import { NoteDraftPreviewPageParams } from '../../model/navigation/PageParams';
import { resourceText } from '../../utils/UiFeedback';
import { appInterface } from '../../backend/AppInterfaceService';
import { PressFeedback } from '../../utils/PressFeedback';
@Component
export struct BrowserEditorPane {
  @Provide(NOTE_EDITOR_WHEEL_SESSION_KEY) private wheelSession: NoteEditorWheelSession = new NoteEditorWheelSession();
  @Prop targetId: number = 0;
  @Prop isNote: boolean = false;
  @Prop isDark: boolean = false;
  @Prop backRequest: number = 0;
  @Prop @Watch('setVisible') visible: boolean = true;
  pathStack: NavPathStack = new NavPathStack();
  @State private editor: NoteEditorState = initialNoteEditorState();
  @State private previewReturn: number = 0;
  onBusy: (busy: boolean) => void = (_busy: boolean): void => {};
  onClose: () => void = (): void => {};
  onCloseCancelled: () => void = (): void => {};
  onSaved: () => void = (): void => {};
  private active: boolean = false;
  private readonly writer: AnkiNoteUpdate = new AnkiNoteUpdate();
  private readonly operations: BrowserOperationController = new BrowserOperationController();
  private readonly session: NoteEditorSession = new NoteEditorSession(new AnkiNoteEditor(), (state: NoteEditorState): void => {
    this.editor = state; this.onBusy(state.busy); this.publishInterface();
  });
  aboutToAppear(): void { this.active = true; this.setVisible(); this.load(); }
  aboutToDisappear(): void {
    this.active = false; this.wheelSession.setVisible(false); this.session.dispose(); this.operations.dispose();
    appInterface.leave('browser_editor');
  }
  private setVisible(): void { this.wheelSession.setVisible(this.active && this.visible); }
  private publishInterface(): void {
    if (!this.active) return;
    appInterface.observe({ surface: 'browser_editor', sectionId: this.editor.note === null ? this.editor.error === '' ? 'loading' : 'error' : 'form',
      selectedId: String(this.targetId), optionIds: [], optionLabels: [], busy: this.editor.busy, controlsComplete: true,
      items: [{ id: 'close', titleKey: 'browser_editor_close', title: '', selected: false, enabled: !this.editor.busy },
        { id: 'form', titleKey: 'note_editor_edit_title', title: '', selected: false, enabled: this.editor.note !== null }],
      values: [{ id: 'target_kind', value: this.isNote ? 'note' : 'card' }, { id: 'visible', value: String(this.visible) }] });
  }
  private async load(): Promise<void> { await this.session.open(this.targetId, this.isNote, (): boolean => this.active); }
  private openPreview(input: NoteDraftPreviewInput, onReturn: () => void): boolean {
    if (!this.active || this.editor.busy) return false;
    const params: NoteDraftPreviewPageParams = { input: input };
    try {
      this.pathStack.pushPath({ name: 'NoteDraftPreviewPage', param: params, onPop: (): void => { this.previewReturn++; onReturn(); } }); return true;
    } catch (error) { return false; }
  }
  private async save(fields: string[], tags: string[], images: NoteFieldImage[], audios: NoteFieldAudio[]): Promise<boolean> {
    const attachments: NoteFieldImage[] = images.slice(); const audio: NoteFieldAudio[] = audios.slice();
    const before: EditableNote | null = this.editor.note;
    const saved: boolean = await this.session.save(fields, tags, async (note: EditableNote): Promise<boolean> => {
      const operation: BrowserOperationContext | null = this.operations.begin('notes', [note.id], 0, 0);
      if (operation === null) return false;
      return this.operations.execute(operation, (): Promise<void> => this.writer.save(note, attachments, audio, before ?? undefined), {
        afterCommit: async (): Promise<void> => {}, changed: (): void => { this.writer.committed(); },
        failed: (_error: Error): void => {}, refreshFailed: (_error: Error): void => {} });
    }, true);
    if (saved && this.active) this.onSaved();
    return saved;
  }
  build() {
    Column() {
      if (this.editor.note !== null) {
        浏览编辑区({ isDark: this.isDark, busy: this.editor.busy, originalStockKind: this.editor.originalStockKind,
          fieldNames: this.editor.fieldNames, fieldConfigs: this.editor.fieldConfigs, clozeFieldOrds: this.editor.clozeFieldOrds,
          optionalReverseFieldOrd: this.editor.optionalReverseFieldOrd, imageOcclusionFields: this.editor.imageOcclusionFields ?? [],
          note: this.editor.note, initialFieldValues: this.editor.note.fields, initialTags: this.editor.note.tags.join(' '),
          backRequest: this.backRequest, previewReturnRequest: this.previewReturn,
          errorMessage: this.editor.error === '' ? '' : resourceText(this.getUIContext(), $r('app.string.browser_detail_save_error')),
          onCancel: (): void => { this.onClose(); }, onCloseCancelled: (): void => { this.onCloseCancelled(); },
          onPreview: (input: NoteDraftPreviewInput, onReturn: () => void): boolean => this.openPreview(input, onReturn),
          onReload: (): Promise<NoteEditorState | null> => this.session.refresh((): boolean => this.active),
          onSave: (fields: string[], tags: string[], images: NoteFieldImage[], audios: NoteFieldAudio[]): Promise<boolean> => this.save(fields, tags, images, audios) })
      } else {
        NoteEditorHeader({ title: $r('app.string.note_editor_edit_title'), actionEnabled: false,
          onBack: (): void => { this.onClose(); } })
        if (this.editor.busy) { LoadingProgress().width(40).height(40) }
        else {
          Text($r('app.string.browser_detail_load_error')).fontColor($r('app.color.error_text'))
          Button($r('app.string.common_retry')).attributeModifier(new PressFeedback()).stateEffect(false)
            .onClick((): void => { this.load(); })
        }
      }
    }.width('100%').height('100%')
      .onKeyEvent((event: KeyEvent): void => { event.stopPropagation(); })
  }
}
