// SPDX-License-Identifier: AGPL-3.0-or-later
import { appearanceElementColor } from '../../utils/AppearanceElements';
import { NoteLinkGraphPanel } from './NoteLinkGraphPanel';
import { EditorSectionCard } from '../common/EditorSectionCard';
import { DialogFrame } from '../common/DialogFrame';
import { DialogSearchHeader } from '../common/DialogSearchHeader';
import { SettingsActionRow } from '../common/SettingsActionRow';
import { IconActionButton } from '../common/IconActionButton';
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
  @StorageProp('appearance_elements_active') private appearanceElements: string = '';
  @Prop noteId: number = 0;
  @Prop initialGraphCenter: number = 0;
  @State private graphCenter: number = 0;
  @Prop readOnly: boolean = false;
  @Prop initialQuery: string = '';
  @Prop @Watch('backChanged') backRequest: number = 0;
  @Provide(NOTE_EDITOR_WHEEL_SESSION_KEY) private editor: NoteEditorWheelSession = new NoteEditorWheelSession();
  onClose: () => void = (): void => {};
  onPreview: (ids: number[], query: string, graphCenter?: number) => void = (_ids: number[], _query: string): void => {};
  onChanged: () => void = (): void => {};
  onLoaded: (snapshot: NoteLinksSnapshot) => void = (_snapshot: NoteLinksSnapshot): void => {};
  @State @Watch('publishInterface') private snapshot: NoteLinksSnapshot | null = null;
  @State @Watch('publishInterface') private results: NoteLinkTarget[] = [];
  @State @Watch('publishInterface') private query: string = '';
  @State @Watch('publishInterface') private searching: boolean = false;
  private searchGeneration: number = 0;
  @State @Watch('publishInterface') private busy: boolean = false;
  @State private error: string = '';
  @State @Watch('publishInterface') private aliasGuid: string = '';
  @State private aliasDraft: string = '';
  private generation: number = 0;
  private mounted: boolean = false;

  aboutToAppear(): void { this.mounted = true; this.graphCenter = this.initialGraphCenter; this.query = this.initialQuery; this.load(); }
  aboutToDisappear(): void { this.mounted = false; this.generation += 1; this.searchGeneration++; this.editor.setVisible(false); appInterface.leave('note_links'); }
  private backChanged(): void { this.close(); }
  private publishInterface(): void {
    if (!this.mounted) return;
    const items: AppInterfaceControl[] = [
      { id: 'close', titleKey: 'cancel', title: '', enabled: !this.busy, selected: false }
    ];
    const isSearch: boolean = !this.readOnly && this.aliasGuid === '' && this.query.trim() !== '';
    if (!this.readOnly && this.snapshot !== null) {
      if (this.aliasGuid === '') {
        items.push({ id: 'search', titleKey: 'note_reference_search', title: '', enabled: true, selected: false });
      } else {
        items.push({ id: 'save', titleKey: 'note_links_save', title: '', enabled: !this.busy, selected: false });
      }
    }
    if (isSearch) {
      items.push({ id: 'open_result', titleKey: 'note_preview_card_label', title: '', enabled: !this.busy &&
        this.results.some((target: NoteLinkTarget): boolean => target.cardIds.length > 0), selected: false });
      items.push({ id: 'add_reference', titleKey: 'note_links_add', title: '', enabled: !this.busy &&
        this.results.some((target: NoteLinkTarget): boolean => this.canAdd(target)), selected: false });
    }
    if (this.snapshot !== null && this.aliasGuid === '' && !isSearch) {
      items.push({ id: 'graph', titleKey: 'note_link_graph_open', title: '', enabled: !this.busy, selected: false });
    }
    appInterface.observe({ surface: 'note_links', sectionId: this.aliasGuid !== '' ? 'alias' : (isSearch ? 'search' : 'links'), selectedId: '',
      optionIds: [], optionLabels: [], busy: this.busy || this.searching, controlsComplete: true, items: items,
      values: [{ id: 'outgoing_count', value: String(this.snapshot?.view.outgoing.length ?? 0) },
        { id: 'incoming_count', value: String(this.snapshot?.view.incoming.length ?? 0) },
        { id: 'result_count', value: String(this.results.length) }] });
  }
  private async load(): Promise<void> {
    const generation: number = ++this.generation; this.busy = true; this.error = '';
    try {
      const next = await noteLinksService.load(this.noteId);
      if (this.mounted && generation === this.generation) { this.snapshot = next; this.onLoaded(next); }
    }
    catch (error) { if (this.mounted && generation === this.generation) this.showError(error as Error); }
    finally { if (this.mounted && generation === this.generation) this.busy = false; }
    if (this.mounted && generation === this.generation && this.error === '') this.search();
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
    this.searchGeneration++; this.searching = value.trim() !== ''; this.results = []; this.error = ''; this.query = value;
  }
  private canAdd(target: NoteLinkTarget): boolean {
    return this.snapshot !== null && !this.snapshot.view.outgoing.some((row: NoteLinkRow): boolean => row.guid === target.guid);
  }
  private preview(cardIds: number[]): void {
    if (!this.busy && cardIds.length > 0) this.onPreview(cardIds, this.query);
  }
  private async change(guid: string, kind: string): Promise<void> {
    if (!this.mounted || this.readOnly || this.busy || this.snapshot === null) return;
    this.searchGeneration++; this.searching = false;
    this.busy = true; this.error = '';
    try {
      await noteLinksService.change(this.snapshot, guid, kind, this.aliasDraft);
      if (this.mounted) this.onChanged();
      if (this.mounted) { this.aliasGuid = ''; await this.load(); }
    } catch (error) { if (this.mounted) this.showError(error as Error); }
    finally { if (this.mounted) this.busy = false; }
  }
  private close(): void {
    if (!this.mounted) return;
    if (this.graphCenter > 0) { this.graphCenter = 0; return; }
    if (this.busy) return;
    if (this.aliasGuid !== '') this.aliasGuid = ''; else this.onClose();
  }
  @Builder
  private header() {
    DialogSearchHeader({ title: $r('app.string.note_links_title'), onClose: (): void => { this.close(); },
      query: this.query, placeholder: $r('app.string.note_links_search_hint'), showSearch: !this.readOnly && this.aliasGuid === '',
      onChange: (value: string): void => { this.queryChanged(value); }, onSearch: (): void => { this.search(); } })
  }
  @Builder
  private rows(title: Resource, rows: NoteLinkRow[], outgoing: boolean) {
    Text(title).fontSize(应用尺寸.字号_正文).fontWeight(FontWeight.Medium).fontColor(appearanceElementColor(this.appearanceElements, 'text_secondary', $r('app.color.text_secondary'))).width('100%')
    EditorSectionCard() {
      if (rows.length === 0) Text($r('app.string.note_links_empty')).fontColor(appearanceElementColor(this.appearanceElements, 'text_secondary', $r('app.color.text_secondary'))).width('100%')
      ForEach(rows, (row: NoteLinkRow) => {
        Column({ space: 应用尺寸.间距_8 }) {
          SettingsActionRow({ title: row.label, hint: row.cardIds.length > 0 ? '' : $r('app.string.note_links_missing'),
            isInteractive: !this.busy && row.cardIds.length > 0,
            onAction: (): void => { this.preview(row.cardIds); } })
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
  }
  @Builder
  private searchResults() {
    if (!this.busy && !this.searching && this.error === '' && this.results.length === 0) {
      Text($r('app.string.note_links_no_results'))
        .fontColor(appearanceElementColor(this.appearanceElements, 'text_secondary', $r('app.color.text_secondary'))).width('100%')
    }
    ForEach(this.results, (target: NoteLinkTarget) => {
      Row({ space: 应用尺寸.间距_8 }) {
        SettingsActionRow({ title: target.title || target.guid, isInteractive: !this.busy && target.cardIds.length > 0,
          showDisclosure: target.cardIds.length > 0, onAction: (): void => { this.preview(target.cardIds); } })
          .layoutWeight(1)
        if (this.canAdd(target)) {
          IconActionButton({ source: $r('app.media.ic_study_link'), label: $r('app.string.note_links_add'),
            toolbarStyle: true, pageWheelEligible: false, isInteractive: !this.busy,
            onAction: (): void => { this.change(target.guid, 'add'); } })
        }
      }.width('100%')
    }, (target: NoteLinkTarget): string => target.guid + target.title)
  }
  @Builder
  private content() {
    Column({ space: 应用尺寸.间距_12 }) {
      if (this.error !== '') {
        Text(this.error).fontColor(appearanceElementColor(this.appearanceElements, 'text_secondary', $r('app.color.text_secondary'))).width('100%')
        按下态按钮({ 文案: $r('app.string.note_links_reload'), 是否启用: !this.busy,
          点击回调: (): void => { this.load(); } })
      }
      if (this.aliasGuid !== '') {
        NoteFieldEditor({ value: this.aliasDraft, fieldName: resourceText(this.getUIContext(), $r('app.string.note_links_alias')),
          disabled: this.busy, onChange: (value: string): void => { this.aliasDraft = value; } })
        按下态按钮({ 文案: $r('app.string.note_links_save'), 是否启用: !this.busy,
          点击回调: (): void => { this.change(this.aliasGuid, 'alias'); } })
      } else if (this.snapshot !== null) {
        if (!this.readOnly && this.query.trim() !== '') {
          this.searchResults()
        } else {
          SettingsActionRow({ title: $r('app.string.note_link_graph_open'), isInteractive: !this.busy,
            onAction: (): void => { if (!this.busy) this.graphCenter = this.noteId; } })
          this.rows($r('app.string.note_links_outgoing'), this.snapshot.view.outgoing, true)
          this.rows($r('app.string.note_links_incoming'), this.snapshot.view.incoming, false)
        }
      }
    }.width('100%')
  }
  build() {
    if (this.graphCenter > 0) {
      NoteLinkGraphPanel({ initialCenter: this.graphCenter, onClose: (): void => { this.graphCenter = 0; },
        onPreview: (ids: number[], center: number): void => { this.onPreview(ids, this.query, center); } })
    } else {
      DialogFrame({ protectPanelGestures: true, fixedHeight: 应用尺寸.noteReferenceDialogHeight,
        bodyLoading: this.busy || this.searching, canDismiss: !this.busy, header: () => { this.header(); }, content: () => { this.content(); },
        onDismiss: (): void => { this.close(); } })
    }
  }
}
