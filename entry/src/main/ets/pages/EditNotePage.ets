// SPDX-License-Identifier: AGPL-3.0-or-later
import { PressFeedback } from '../utils/PressFeedback';
import { 浏览编辑区 } from '../components/browser/浏览编辑区';
import { NoteEditorHeader } from '../components/common/NoteEditorHeader';
import { NoteEditorSession, NoteEditorState, initialNoteEditorState } from '../model/NoteEditorSession';
import { BrowserOperationController, BrowserOperationContext } from '../model/BrowserOperationController';
import { AnkiNoteEditor } from '../backend/AnkiNoteEditor';
import { AnkiNoteUpdate } from '../backend/AnkiNoteUpdate';
import { NoteFieldImage } from '../model/NoteImageDraft';
import { EditableNote } from '../proto/messages/NoteMessages';
import { PAGE_SURFACE_KEY } from '../model/ThemeCatalog';
import { 解析是否深色, 主题模式 } from '../model/主题设置';
import { 加载主题模式 } from '../model/主题存储';
import { resourceText } from '../utils/UiFeedback';
import { CustomTransition } from '../utils/自定义转场';

/** 导航只传 ID；此页持有读取会话和写入保护，来源页面仅刷新返回结果。 */
@Component
export struct EditNotePage {
  targetId: number = 0;
  isNote: boolean = false;
  pathStack: NavPathStack = new NavPathStack();
  @State private editor: NoteEditorState = initialNoteEditorState();
  @State private backRequest: number = 0;
  @State private opacityValue: number = 1;
  @State private theme: 主题模式 = 'system';
  @StorageLink('systemDarkMode') private systemDark: boolean = false;
  @StorageProp(PAGE_SURFACE_KEY) private surface: string = '#F5F7FA';
  private active: boolean = false;
  private readonly writer: AnkiNoteUpdate = new AnkiNoteUpdate();
  private readonly operations: BrowserOperationController = new BrowserOperationController();
  private readonly session: NoteEditorSession = new NoteEditorSession(new AnkiNoteEditor(),
    (state: NoteEditorState): void => { this.editor = state; });

  aboutToAppear(): void {
    this.active = true;
    CustomTransition.getInstance().注册NavParam('EditNotePage',
      (_push: boolean, exit: boolean): void => { this.opacityValue = exit ? 1 : 0; },
      (_push: boolean, exit: boolean): void => { this.opacityValue = exit ? 0 : 1; });
    this.load();
    加载主题模式().then((mode: 主题模式): void => { if (this.active) this.theme = mode; })
      .catch((): void => {});
  }
  aboutToDisappear(): void {
    this.active = false; this.session.dispose(); this.operations.dispose();
    CustomTransition.getInstance().注销NavParam('EditNotePage');
  }
  private async load(): Promise<void> {
    await this.session.open(this.targetId, this.isNote, (): boolean => this.active);
  }
  private requestBack(): void {
    if (this.editor.busy && this.editor.note !== null) return;
    if (this.editor.note !== null) this.backRequest++;
    else this.pathStack.pop();
  }
  private async save(fields: string[], tags: string[], images: NoteFieldImage[]): Promise<boolean> {
    const attachments: NoteFieldImage[] = images.slice();
    const saved: boolean = await this.session.save(fields, tags, async (note: EditableNote): Promise<boolean> => {
      const operation: BrowserOperationContext | null = this.operations.begin('notes', [note.id], 0, 0);
      if (operation === null) return false;
      return this.operations.execute(operation,
        (): Promise<void> => this.writer.save(note, attachments), {
          afterCommit: async (): Promise<void> => {}, changed: (): void => { this.writer.committed(); },
          failed: (_error: Error): void => {}, refreshFailed: (_error: Error): void => {}
        });
    }, true);
    if (saved && this.active) this.pathStack.pop();
    return saved;
  }
  build() {
    NavDestination() {
      if (this.editor.note !== null) {
        浏览编辑区({ isDark: 解析是否深色(this.theme, this.systemDark), busy: this.editor.busy,
          errorMessage: this.editor.error === '' ? '' : resourceText(this.getUIContext(), $r('app.string.browser_detail_save_error')),
          fieldNames: this.editor.fieldNames, clozeFieldOrds: this.editor.clozeFieldOrds,
          optionalReverseFieldOrd: this.editor.optionalReverseFieldOrd, backRequest: this.backRequest,
          initialFieldValues: this.editor.note.fields, initialTags: this.editor.note.tags.join(' '),
          onCancel: (): void => { if (this.active) this.pathStack.pop(); },
          onSave: (fields: string[], tags: string[], images: NoteFieldImage[]): Promise<boolean> => this.save(fields, tags, images) })
      } else {
        Column({ space: 14 }) {
          NoteEditorHeader({ title: $r('app.string.note_editor_edit_title'), actionLabel: $r('app.string.browser_detail_save'),
            actionEnabled: false, onBack: (): void => { this.requestBack(); } })
          if (this.editor.busy) { LoadingProgress().width(40).height(40) }
          else {
            Text($r('app.string.browser_detail_load_error')).fontColor($r('app.color.error_text'))
            Button($r('app.string.note_editor_retry')).attributeModifier(new PressFeedback())
            .stateEffect(false)
            .onClick((): void => { this.load(); })
          }
        }.width('100%').height('100%').backgroundColor(this.surface)
      }
    }.hideTitleBar(true).backgroundColor(Color.Transparent).opacity(this.opacityValue)
      .onBackPressed((): boolean => { this.requestBack(); return true; })
  }
}
