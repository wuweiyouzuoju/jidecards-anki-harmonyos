// SPDX-License-Identifier: AGPL-3.0-or-later
import { DialogFrame } from '../common/DialogFrame';
import { DialogSearchHeader } from '../common/DialogSearchHeader';
import { SettingsActionRow } from '../common/SettingsActionRow';
import { 按下态按钮 } from '../common/按下态按钮';
import { NoteFieldEditor } from '../common/NoteFieldEditor';
import { NoteEditorWheelSession, NOTE_EDITOR_WHEEL_SESSION_KEY } from '../../model/NoteEditorWheel';
import { NoteLinkRow, NoteLinkTarget } from '../../model/NoteLinks';
import { noteLinksService, NoteLinksSnapshot } from '../../backend/NoteLinksService';
import { resourceText } from '../../utils/UiFeedback';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { appInterface } from '../../backend/AppInterfaceService';
import { AppInterfaceControl } from '../../model/AppInterface';

/** Inline overlay owns display generations. Shared service owns accepted writes. */
@Component
export struct NoteLinksPanel {
  @Prop noteId: number = 0;
  @Prop readOnly: boolean = false;
  @Prop @Watch('backChanged') backRequest: number = 0;
  @Provide(NOTE_EDITOR_WHEEL_SESSION_KEY) private editor: NoteEditorWheelSession = new NoteEditorWheelSession();
  onClose: () => void = (): void => {};
  onPreview: (ids: number[]) => void = (_ids: number[]): void => {};
  onChanged: () => void = (): void => {};
  onLoaded: (snapshot: NoteLinksSnapshot) => void = (_snapshot: NoteLinksSnapshot): void => {};
  @State @Watch('publishInterface') private snapshot: NoteLinksSnapshot | null = null;
  @State private results: NoteLinkTarget[] = [];
  @State private query: string = '';
  @State private searching: boolean = false;
  private searchGeneration: number = 0;
  @State @Watch('publishInterface') private busy: boolean = false;
  @State private error: string = '';
  @State @Watch('publishInterface') private aliasGuid: string = '';
  @State private aliasDraft: string = '';
  private generation: number = 0;
  private mounted: boolean = false;

  aboutToAppear(): void { this.mounted = true; this.load(); }
  aboutToDisappear(): void { this.mounted = false; this.generation += 1; this.searchGeneration++; this.editor.setVisible(false); appInterface.leave('note_links'); }
  private backChanged(): void { this.close(); }
  private publishInterface(): void {
    if (!this.mounted) return;
    const items: AppInterfaceControl[] = [
      { id: 'close', titleKey: 'done', title: resourceText(this.getUIContext(), $r('app.string.done')), enabled: !this.busy, selected: false },
      { id: this.aliasGuid === '' ? 'search' : 'save', titleKey: this.aliasGuid === '' ? 'note_links_search' : 'note_links_save',
        title: resourceText(this.getUIContext(), this.aliasGuid === '' ? $r('app.string.note_links_search') : $r('app.string.note_links_save')), enabled: !this.busy && !this.readOnly, selected: false }
    ];
    appInterface.observe({ surface: 'note_links', sectionId: this.aliasGuid === '' ? 'links' : 'alias', selectedId: '',
      optionIds: [], optionLabels: [], busy: this.busy, controlsComplete: true, items: items,
      values: [{ id: 'outgoing_count', value: String(this.snapshot?.view.outgoing.length ?? 0) },
        { id: 'incoming_count', value: String(this.snapshot?.view.incoming.length ?? 0) }] });
  }
  private async load(): Promise<void> {
    const generation: number = ++this.generation; this.busy = true; this.error = '';
    try {
      const next = await noteLinksService.load(this.noteId);
      if (this.mounted && generation === this.generation) { this.snapshot = next; this.onLoaded(next); }
    }
    catch (error) { if (this.mounted && generation === this.generation) this.showError(error as Error); }
    finally { if (this.mounted && generation === this.generation) this.busy = false; }
  }
  private showError(error: Error): void {
    const resource: Resource = error.message === 'note_links_migrate' ? $r('app.string.note_links_migrate') :
      error.message === 'note_links_setup' ? $r('app.string.note_links_setup') :
      error.message === 'note_links_conflict' ? $r('app.string.note_links_conflict') :
      error.message === 'note_links_missing' ? $r('app.string.note_links_missing') : $r('app.string.note_links_error');
    this.error = resourceText(this.getUIContext(), resource);
  }
  private async search(): Promise<void> {
    if (!this.mounted || this.readOnly || this.busy || this.snapshot === null || this.query.trim() === '') return;
    const generation: number = ++this.searchGeneration; this.searching = true; this.error = '';
    try { const rows = await noteLinksService.search(this.query, this.snapshot.guid); if (this.mounted && generation === this.searchGeneration) this.results = rows; }
    catch (error) { if (this.mounted && generation === this.searchGeneration) this.showError(error as Error); }
    finally { if (this.mounted && generation === this.searchGeneration) this.searching = false; }
  }
  private queryChanged(value: string): void {
    this.query = value; this.searchGeneration++; this.searching = false; this.results = []; this.error = '';
  }
  private async change(guid: string, kind: string): Promise<void> {
    if (!this.mounted || this.readOnly || this.busy || this.snapshot === null) return;
    this.searchGeneration++; this.searching = false;
    this.busy = true; this.error = '';
    try {
      await noteLinksService.change(this.snapshot, guid, kind, this.aliasDraft);
      if (this.mounted) this.onChanged();
      if (this.mounted) { this.aliasGuid = ''; this.results = []; await this.load(); }
    } catch (error) { if (this.mounted) this.showError(error as Error); }
    finally { if (this.mounted) this.busy = false; }
  }
  private close(): void {
    if (!this.mounted || this.busy) return;
    if (this.aliasGuid !== '') this.aliasGuid = ''; else this.onClose();
  }
  @Builder
  private header() {
    DialogSearchHeader({ title: $r('app.string.note_links_title'), onClose: (): void => { this.close(); },
      query: this.query, placeholder: $r('app.string.note_links_search_hint'), searchEnabled: !this.busy, showSearch: !this.readOnly && this.aliasGuid === '' && this.snapshot !== null,
      onChange: (value: string): void => { this.queryChanged(value); }, onSearch: (): void => { this.search(); } })
  }
  @Builder
  private rows(title: Resource, rows: NoteLinkRow[], outgoing: boolean) {
    Text(title).fontSize(应用尺寸.字号_正文).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_secondary')).width('100%')
    if (rows.length === 0) Text($r('app.string.note_links_empty')).fontColor($r('app.color.text_secondary')).width('100%')
    ForEach(rows, (row: NoteLinkRow) => {
      Column({ space: 应用尺寸.间距_8 }) {
        SettingsActionRow({ title: row.label, hint: row.cardIds.length > 0 ? '' : $r('app.string.note_links_missing'),
          isInteractive: !this.busy && row.cardIds.length > 0,
          onAction: (): void => { if (!this.busy && row.cardIds.length > 0) this.onPreview(row.cardIds); } })
        if (!this.readOnly) {
        Row({ space: 应用尺寸.间距_8 }) {
          按下态按钮({ 文案: $r('app.string.note_links_alias'), 是否启用: !this.busy && row.noteId > 0,
            点击回调: (): void => { this.aliasGuid = row.guid; this.aliasDraft = row.alias; } })
          if (outgoing) 按下态按钮({ 文案: $r('app.string.note_links_remove'), 是否启用: !this.busy,
            点击回调: (): void => { this.change(row.guid, 'remove'); } })
        }.width('100%')
        }
      }.width('100%')
    }, (row: NoteLinkRow): string => row.guid + row.label)
  }
  @Builder
  private content() {
    Column({ space: 应用尺寸.间距_12 }) {
      if (this.busy || this.searching) LoadingProgress().width(32).height(32)
      if (this.error !== '') {
        Text(this.error).fontColor($r('app.color.text_secondary')).width('100%')
        按下态按钮({ 文案: $r('app.string.note_links_reload'), 是否启用: !this.busy, 点击回调: (): void => { this.load(); } })
      }
      if (this.aliasGuid !== '') {
        NoteFieldEditor({ value: this.aliasDraft, fieldName: resourceText(this.getUIContext(), $r('app.string.note_links_alias')),
          disabled: this.busy, onChange: (value: string): void => { this.aliasDraft = value; } })
        按下态按钮({ 文案: $r('app.string.note_links_save'), 是否启用: !this.busy,
          点击回调: (): void => { this.change(this.aliasGuid, 'alias'); } })
      } else if (this.snapshot !== null) {
        this.rows($r('app.string.note_links_outgoing'), this.snapshot.view.outgoing, true)
        this.rows($r('app.string.note_links_incoming'), this.snapshot.view.incoming, false)
        if (!this.readOnly) {
        ForEach(this.results, (target: NoteLinkTarget) => {
          SettingsActionRow({ title: target.title, isInteractive: !this.busy,
            onAction: (): void => { this.change(target.guid, 'add'); } })
        }, (target: NoteLinkTarget): string => target.guid)
        }
      }
    }.width('100%')
  }
  build() {
    DialogFrame({ canDismiss: !this.busy, header: () => { this.header(); }, content: () => { this.content(); },
      onDismiss: (): void => { this.close(); } })
  }
}
