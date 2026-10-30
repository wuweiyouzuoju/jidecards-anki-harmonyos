// SPDX-License-Identifier: AGPL-3.0-or-later
import { DialogFrame } from '../common/DialogFrame';
import { DialogSearchHeader } from '../common/DialogSearchHeader';
import { SettingsActionRow } from '../common/SettingsActionRow';
import { 按下态按钮 } from '../common/按下态按钮';
import { FormInputStyle } from '../../utils/FormInputStyle';
import { resourceText } from '../../utils/UiFeedback';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { NoteLinkTarget, NoteLinkRow } from '../../model/NoteLinks';
import { noteReferences, noteReferenceData, changeNoteReferences, stageNoteReferenceFields, noteReferenceUrl } from '../../model/NoteReferences';
import { encodeNoteText } from '../../model/NoteRichText';
import { noteLinksService } from '../../backend/NoteLinksService';
import { appInterface } from '../../backend/AppInterfaceService';

interface DraftReferenceRow { target: NoteLinkTarget; label: string; occurrence: number; key: string; }

/** 编辑表单草稿的管理视图；不调用关联写入服务。 */
@Component
export struct NoteLinksDraftPanel {
  @Prop fields: string[] = [];
  @Prop sourceGuid: string = '';
  @Prop noteId: number = 0;
  @Prop @Watch('back') backRequest: number = 0;
  onClose: () => void = (): void => {};
  onChange: (fields: string[]) => void = (_fields: string[]): void => {};
  onPreview: (ids: number[]) => void = (_ids: number[]): void => {};
  @State private rows: NoteLinkTarget[] = [];
  @State private incoming: NoteLinkRow[] = [];
  @State private results: NoteLinkTarget[] = [];
  @State private query: string = '';
  @State private busy: boolean = false;
  @State private searching: boolean = false;
  private searchGeneration: number = 0;
  @State private error: string = '';
  @State private editingGuid: string = '';
  private editingOccurrence: number = -1;
  @State private label: string = '';
  private mounted: boolean = false;
  private generation: number = 0;
  aboutToAppear(): void { this.mounted = true; this.load(); }
  aboutToDisappear(): void { this.mounted = false; this.generation++; this.searchGeneration++; appInterface.leave('note_links_draft'); }
  private back(): void { if (this.editingGuid !== '') this.editingGuid = ''; else this.onClose(); }
  private targets(): string[] {
    const explicit: string[] = this.sourceGuid === '' ? [] : noteReferenceData(this.fields, this.sourceGuid).targets;
    return Array.from(new Set<string>(explicit.concat(noteReferences(this.fields).map((ref): string => ref.guid))));
  }
  private async load(): Promise<void> {
    const generation: number = ++this.generation; this.busy = true; this.error = '';
    try {
      const targets: string[] = this.targets();
      const rows: NoteLinkTarget[] = targets.length > 0 ? await noteLinksService.resolve(targets) : [];
      const incoming: NoteLinkRow[] = this.noteId > 0 ? (await noteLinksService.load(this.noteId)).view.incoming : [];
      if (!this.mounted || generation !== this.generation) return;
      this.rows = targets.map((guid: string): NoteLinkTarget => rows.find((row): boolean => row.guid === guid) ??
        { guid: guid, title: guid, noteId: 0, cardIds: [] });
      this.incoming = incoming;
    } catch (_error) { if (this.mounted && generation === this.generation) this.error = resourceText(this.getUIContext(), $r('app.string.note_links_error')); }
    finally { if (this.mounted && generation === this.generation) { this.busy = false; this.observe(); } }
  }
  private observe(): void {
    if (!this.mounted) return;
    appInterface.observe({ surface: 'note_links_draft', sectionId: 'draft', selectedId: '', optionIds: [], optionLabels: [],
      busy: this.busy, controlsComplete: true, items: [
        { id: 'close', titleKey: 'done', title: '', enabled: true, selected: false },
        { id: 'search', titleKey: 'note_reference_search', title: '', enabled: !this.busy, selected: false }],
      values: [{ id: 'outgoing_count', value: String(this.rows.length) }, { id: 'incoming_count', value: String(this.incoming.length) },
        { id: 'persistence', value: 'note_draft' }] });
  }
  private changed(fields: string[]): void {
    if (!this.mounted || this.busy) return;
    this.fields = fields; this.onChange(fields); this.editingGuid = ''; this.results = []; this.searchGeneration++; this.searching = false; this.load();
  }
  private remove(guid: string, occurrence: number = -1): void {
    let fields: string[] = changeNoteReferences(this.fields, guid, undefined, occurrence);
    if (this.sourceGuid !== '') fields = stageNoteReferenceFields(fields, this.sourceGuid, this.targets().filter((target): boolean => target !== guid));
    this.changed(fields);
  }
  private add(target: NoteLinkTarget): void {
    if (target.guid === this.sourceGuid || this.fields.length === 0 || this.targets().includes(target.guid)) return;
    const fields: string[] = this.fields.slice();
    // 管理入口没有正文光标，附在末字段；精确选区插入由轮盘拥有。
    fields[fields.length - 1] += '<a href="' + noteReferenceUrl(target.guid) + '">' + encodeNoteText(target.title || target.guid) + '</a>';
    this.changed(fields);
  }
  private displayLabel(target: NoteLinkTarget): string {
    return noteReferences(this.fields).find((ref): boolean => ref.guid === target.guid)?.label || target.title || target.guid;
  }
  private displayRows(): DraftReferenceRow[] {
    const rows: DraftReferenceRow[] = [];
    for (const target of this.rows) {
      const inline = noteReferences(this.fields).filter((ref): boolean => ref.guid === target.guid);
      if (inline.length === 0) rows.push({ target: target, label: target.title || target.guid, occurrence: -1, key: target.guid });
      else inline.forEach((ref, index: number): void => {
        rows.push({ target: target, label: ref.label, occurrence: index, key: target.guid + ':' + index + ':' + ref.label });
      });
    }
    return rows;
  }
  private queryChanged(value: string): void {
    this.query = value; this.searchGeneration++; this.searching = false; this.results = []; this.error = ''; this.observe();
  }
  private async search(): Promise<void> {
    if (this.busy || !this.mounted || this.query.trim() === '') return;
    const generation: number = ++this.searchGeneration; this.searching = true;
    try {
      const results: NoteLinkTarget[] = await noteLinksService.search(this.query, this.sourceGuid);
      if (this.mounted && generation === this.searchGeneration) this.results = results;
    } catch (_error) { if (this.mounted && generation === this.searchGeneration) this.error = resourceText(this.getUIContext(), $r('app.string.note_links_error')); }
    finally { if (this.mounted && generation === this.searchGeneration) { this.searching = false; this.observe(); } }
  }
  @Builder
  private header() {
    DialogSearchHeader({ title: $r('app.string.note_links_title'), onClose: (): void => { this.back(); },
      query: this.query, placeholder: $r('app.string.note_links_search_hint'), searchEnabled: !this.busy, showSearch: this.editingGuid === '',
      onChange: (value: string): void => { this.queryChanged(value); }, onSearch: (): void => { this.search(); } })
  }
  @Builder
  private content() {
    Column({ space: 应用尺寸.间距_8 }) {
      Text($r('app.string.note_reference_hint')).fontColor($r('app.color.text_secondary')).width('100%')
      if (this.busy || this.searching) { LoadingProgress().width(32).height(32) }
      if (this.error !== '') {
        Text(this.error).fontColor($r('app.color.error_text')).width('100%')
        按下态按钮({ 文案: $r('app.string.note_links_reload'), 是否启用: !this.busy, 点击回调: (): void => { this.error = ''; this.load(); } })
      }
      if (this.editingGuid !== '') {
        TextInput({ text: this.label }).attributeModifier(new FormInputStyle()).onChange((value: string): void => { this.label = value; })
        按下态按钮({ 文案: $r('app.string.done'), 是否启用: !this.busy && this.label.trim() !== '',
          点击回调: (): void => { this.changed(changeNoteReferences(this.fields, this.editingGuid, this.label, this.editingOccurrence)); } })
      } else {
        Text($r('app.string.note_links_outgoing')).fontColor($r('app.color.text_secondary')).width('100%')
        ForEach(this.displayRows(), (row: DraftReferenceRow) => {
          SettingsActionRow({ title: row.label, isInteractive: !this.busy && row.target.cardIds.length > 0,
            onAction: (): void => { this.onPreview(row.target.cardIds); } })
          Row({ space: 应用尺寸.间距_8 }) {
            按下态按钮({ 文案: $r('app.string.note_links_alias'), 是否启用: !this.busy && row.occurrence >= 0,
              点击回调: (): void => { this.editingGuid = row.target.guid; this.editingOccurrence = row.occurrence; this.label = row.label; } })
            按下态按钮({ 文案: $r('app.string.note_links_remove'), 是否启用: !this.busy, 点击回调: (): void => { this.remove(row.target.guid, row.occurrence); } })
          }
        }, (row: DraftReferenceRow): string => row.key)
        Text($r('app.string.note_links_incoming')).fontColor($r('app.color.text_secondary')).width('100%')
        ForEach(this.incoming, (row: NoteLinkRow) => {
          SettingsActionRow({ title: row.label, isInteractive: !this.busy && row.cardIds.length > 0, onAction: (): void => { this.onPreview(row.cardIds); } })
        }, (row: NoteLinkRow): string => row.guid)
        ForEach(this.results, (target: NoteLinkTarget) => {
          SettingsActionRow({ title: target.title, isInteractive: !this.busy, onAction: (): void => { this.add(target); } })
        }, (target: NoteLinkTarget): string => target.guid)
      }
    }.width('100%')
  }
  build() {
    DialogFrame({ header: () => { this.header(); }, content: () => { this.content(); }, onDismiss: (): void => { this.back(); } })
  }
}
