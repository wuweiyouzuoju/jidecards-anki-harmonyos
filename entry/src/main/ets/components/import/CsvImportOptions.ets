// SPDX-License-Identifier: AGPL-3.0-or-later
import { CsvMetadata, emptyCsvMetadata } from '../../proto/messages/CsvImportMessages';
import { CsvImportPreview, CsvNotetype, copyCsvMetadata } from '../../model/CsvImport';
import { 导出牌组选项 } from '../../model/DataTransferIntent';
import { ImportSelect } from './ImportSelect';
import { SettingsToggleRow } from '../common/SettingsToggleRow';
import { resourceText } from '../../utils/UiFeedback';
import { 应用尺寸 } from '../../utils/应用尺寸';

@Component
export struct CsvImportOptions {
  @Prop @Watch('loadPreview') preview: CsvImportPreview = { metadata: emptyCsvMetadata(), notetypes: [] };
  @Prop decks: 导出牌组选项[] = [];
  @Prop isInteractive: boolean = true;
  @Prop isDark: boolean = false;
  @State private draft: CsvMetadata = emptyCsvMetadata();
  onChange: (metadata: CsvMetadata) => void = (_metadata: CsvMetadata): void => {};
  onReparse: (delimiter: number, notetypeId: number) => void = (_delimiter: number, _notetypeId: number): void => {};
  aboutToAppear(): void { this.loadPreview(); }
  private loadPreview(): void { this.draft = copyCsvMetadata(this.preview.metadata); this.changed(); }
  private changed(): void { this.draft = copyCsvMetadata(this.draft); this.onChange(copyCsvMetadata(this.draft)); }
  private text(value: Resource): string { return resourceText(this.getUIContext(), value); }
  private columns(): string[] {
    const labels: string[] = [this.text($r('app.string.transfer_csv_unmapped'))];
    for (let i: number = 0; i < this.draft.columnLabels.length; i++) {
      labels.push(`${i + 1}: ${this.draft.columnLabels[i] || this.draft.preview[0]?.[i] || ''}`);
    }
    return labels;
  }
  private fields(): string[] {
    return this.preview.notetypes.find((n: CsvNotetype): boolean => n.id === this.draft.notetypeId)?.fields ?? [];
  }
  private deckLabels(): string[] {
    return [this.text($r('app.string.transfer_csv_file_deck'))].concat(this.decks.map((d: 导出牌组选项): string => d.name));
  }
  private typeLabels(): string[] {
    return [this.text($r('app.string.transfer_csv_file_notetype'))].concat(this.preview.notetypes.map((n: CsvNotetype): string => n.name));
  }
  build() {
    Column({ space: 应用尺寸.间距_12 }) {
      ImportSelect({ label: this.text($r('app.string.transfer_csv_delimiter')),
        labels: [this.text($r('app.string.transfer_csv_tab')), '|', ';', ':', ',', this.text($r('app.string.transfer_csv_space'))],
        selectedIndex: this.draft.delimiter, isInteractive: this.isInteractive,
        onSelect: (index: number): void => { this.onReparse(index, this.draft.notetypeId); } })
      Text($r('app.string.transfer_csv_preview')).fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_primary'))
      ForEach(this.draft.preview.slice(0, 5), (row: string[], index: number) => {
        Text(`${index + 1}. ${row.join('  |  ')}`).width('100%').maxLines(4)
          .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary'))
      })
      Text($r('app.string.transfer_csv_utf8_hint')).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary'))
      ImportSelect({ label: this.text($r('app.string.transfer_label_deck')), labels: this.deckLabels(),
        selectedIndex: this.decks.findIndex((d: 导出牌组选项): boolean => d.id === this.draft.deckId) + 1,
        isInteractive: this.isInteractive, onSelect: (index: number): void => {
          if (index === 0) {
            this.draft.deckId = this.preview.metadata.deckId; this.draft.deckColumn = this.preview.metadata.deckColumn;
            this.draft.deckName = this.preview.metadata.deckName;
          } else { this.draft.deckId = this.decks[index - 1].id; this.draft.deckColumn = 0; this.draft.deckName = ''; }
          this.changed();
        } })
      ImportSelect({ label: this.text($r('app.string.transfer_csv_notetype')), labels: this.typeLabels(),
        selectedIndex: this.preview.notetypes.findIndex((n: CsvNotetype): boolean => n.id === this.draft.notetypeId) + 1,
        isInteractive: this.isInteractive, onSelect: (index: number): void => {
          this.onReparse(this.draft.delimiter, index === 0 ? 0 : this.preview.notetypes[index - 1].id);
        } })
      if (this.draft.notetypeColumn > 0) {
        Text($r('app.string.transfer_csv_row_notetype')).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary'))
      } else {
        ForEach(this.fields(), (field: string, index: number) => {
          ImportSelect({ label: field, labels: this.columns(), selectedIndex: this.draft.fieldColumns[index] ?? 0,
            isInteractive: this.isInteractive, onSelect: (column: number): void => {
              this.draft.fieldColumns[index] = column; this.changed();
            } })
        })
      }
      ImportSelect({ label: this.text($r('app.string.transfer_csv_tags')), labels: this.columns(),
        selectedIndex: this.draft.tagsColumn, isInteractive: this.isInteractive,
        onSelect: (column: number): void => { this.draft.tagsColumn = column; this.changed(); } })
      ImportSelect({ label: this.text($r('app.string.transfer_csv_guid')), labels: this.columns(),
        selectedIndex: this.draft.guidColumn, isInteractive: this.isInteractive,
        onSelect: (column: number): void => { this.draft.guidColumn = column; this.changed(); } })
      ImportSelect({ label: this.text($r('app.string.transfer_csv_duplicates')),
        labels: [this.text($r('app.string.transfer_csv_update')), this.text($r('app.string.transfer_csv_preserve')),
          this.text($r('app.string.transfer_csv_duplicate'))], selectedIndex: this.draft.dupeResolution,
        isInteractive: this.isInteractive, onSelect: (index: number): void => { this.draft.dupeResolution = index; this.changed(); } })
      ImportSelect({ label: this.text($r('app.string.transfer_csv_match_scope')),
        labels: [this.text($r('app.string.transfer_csv_match_type')), this.text($r('app.string.transfer_csv_match_deck'))],
        selectedIndex: this.draft.matchScope, isInteractive: this.isInteractive,
        onSelect: (index: number): void => { this.draft.matchScope = index; this.changed(); } })
      SettingsToggleRow({ title: $r('app.string.transfer_csv_html'), hint: $r('app.string.transfer_csv_html_hint'),
        isOn: this.draft.isHtml, isInteractive: this.isInteractive, isDark: this.isDark,
        onChange: (value: boolean): void => { this.draft.isHtml = value; this.draft.forceIsHtml = true; this.changed(); } })
    }.width('100%')
  }
}
