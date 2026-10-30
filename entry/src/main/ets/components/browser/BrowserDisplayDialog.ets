// SPDX-License-Identifier: AGPL-3.0-or-later
import { SurfaceSelect } from '../common/SurfaceSelect';
import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';
import { BrowserColumn } from '../../proto/messages/SearchMessages';
import { resourceText, namedResourceText } from '../../utils/UiFeedback';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { SelectStyle } from '../../utils/SelectStyle';
import { FormInputStyle } from '../../utils/FormInputStyle';
import { PrimaryActionButton } from '../common/PrimaryActionButton';
import { 按下态按钮 } from '../common/按下态按钮';
import { IconActionButton } from '../common/IconActionButton';
import { 颜色键 } from '../../model/颜色主题';
import { appInterface } from '../../backend/AppInterfaceService';
import { visibleInterfaceItems, AppInterfaceControl } from '../../model/AppInterface';
@Component
export struct BrowserDisplayDialog {
  @StorageProp('surface_material') private surfaceMaterial: string = 'flat';
  @StorageProp(颜色键.动作主色) private actionColor: string = '#2F5FD0';
  @Prop kind: string = 'search';
  @Prop notes: boolean = false;
  @Prop @Watch('publishInterface') busy: boolean = false;
  @Prop error: string = '';
  @Prop @Watch('handleBack') backRequest: number = 0;
  @Prop columns: BrowserColumn[] = [];
  @Prop minimumColumns: number = 0;
  @Prop replacementColumn: string = '';
  onReplaceColumn: (key: string) => void = (_key: string): void => {};
  @Prop selectedColumns: string[] = [];
  @Prop recentSearches: string[] = [];
  @Prop @Watch('publishInterface') ignoreAccents: boolean = false;
  @State @Watch('publishInterface') private draftColumns: string[] = [];
  @State private term: string = '';
  @State private field: string = '';
  @State private searchKind: number = 0;
  @State private joinIndex: number = 0;
  @State private negated: boolean = false;
  onClose: () => void = (): void => {};
  onColumns: (keys: string[]) => void = (_keys: string[]): void => {};
  onRecent: (text: string) => void = (_text: string): void => {};
  onIgnoreAccents: (value: boolean) => void = (_value: boolean): void => {};
  onBuildSearch: (kind: number, term: string, field: string, join: number, negated: boolean) => void =
    (_kind: number, _term: string, _field: string, _join: number, _negated: boolean): void => {};
  private mounted: boolean = false;
  aboutToAppear(): void { this.mounted = true; this.draftColumns = this.selectedColumns.slice(); this.publishInterface(); }
  aboutToDisappear(): void { this.mounted = false; appInterface.leave(this.surfaceId()); }
  private surfaceId(): string {
    return this.kind === 'replace' ? 'browser_column_replace' : this.kind === 'columns' ? 'browser_display' :
      this.kind === 'recent' ? 'browser_recent_searches' : 'browser_search_options';
  }
  private columnLimit(): number { return this.minimumColumns > 0 ? Math.min(64, this.columns.length) : 16; }
  private columnCandidates(): BrowserColumn[] {
    return this.kind === 'replace' ? this.columns.filter((column: BrowserColumn): boolean => !this.selectedColumns.includes(column.key)) : this.columns;
  }
  private publishInterface(): void {
    if (!this.mounted) return;
    const surface: string = this.surfaceId();
    const controls: AppInterfaceControl[] = visibleInterfaceItems(surface, { simple: false, agent: false, cloudDeck: false, themeHasTextures: false })
      .map((item): AppInterfaceControl => ({ id: item.id, titleKey: item.titleKey, title: namedResourceText(this.getUIContext(), item.titleKey),
        enabled: !this.busy && (item.id !== 'save' || this.draftColumns.length >= this.minimumColumns), selected: item.id === 'ignore_accents' && this.ignoreAccents }));
    appInterface.observe({ surface: surface, sectionId: '', selectedId: '', busy: this.busy,
      optionIds: (this.kind === 'columns' || this.kind === 'replace') ? this.columnCandidates().map((column: BrowserColumn): string => column.key) :
        this.kind === 'recent' ? this.recentSearches.map((_text: string, index: number): string => String(index)) : [],
      optionLabels: (this.kind === 'columns' || this.kind === 'replace') ? this.columnCandidates().map((column: BrowserColumn): string => this.columnLabel(column.key)) :
        this.kind === 'recent' ? this.recentSearches.slice() : [],
      items: controls, controlsComplete: false, values: [{ id: 'mode', value: this.notes ? 'notes' : 'cards' },
        { id: 'selected_columns', value: this.draftColumns.join(',') }, { id: 'replacement_column', value: this.replacementColumn }, { id: 'ignore_accents', value: String(this.ignoreAccents) }] });
  }
  private handleBack(): void { if (!this.busy) this.onClose(); }
  private columnLabel(key: string): string {
    const column: BrowserColumn | undefined = this.columns.find((item: BrowserColumn): boolean => item.key === key);
    return column === undefined ? key : this.notes ? column.notesModeLabel : column.cardsModeLabel;
  }
  private searchKinds(): SelectOption[] {
    return ['browser_search_literal', 'browser_search_deck', 'browser_search_tag', 'browser_search_notetype', 'browser_find_field']
      .map((key: string): SelectOption => ({ value: namedResourceText(this.getUIContext(), key) }));
  }
  private joinOptions(): SelectOption[] {
    return ['browser_search_and', 'browser_search_or'].map((key: string): SelectOption => ({ value: namedResourceText(this.getUIContext(), key) }));
  }
  private moveColumn(key: string, direction: number): void {
    if (this.busy) return;
    const draft: string[] = this.draftColumns.slice();
    const index: number = draft.indexOf(key); const target: number = index + direction;
    if (index < 0 || target < 0 || target >= draft.length) return;
    draft.splice(index, 1); draft.splice(target, 0, key); this.draftColumns = draft;
  }
  @Builder
  private headerContent() {
    DialogHeader({ title: this.kind === 'replace' ? $r('app.string.browser_replace_column') : this.kind === 'columns' ? $r('app.string.browser_display_columns') :
      this.kind === 'recent' ?
        $r('app.string.browser_recent_searches') : $r('app.string.browser_search_options'),
      closeLabel: $r('app.string.browser_detail_cancel'), closeEnabled: !this.busy,
      onClose: (): void => { this.onClose(); },
      showAction: this.kind === 'columns',
      actionLabel: this.kind === 'columns' ? $r('app.string.browser_detail_confirm') : '',
      actionEnabled: !this.busy && this.draftColumns.length >= this.minimumColumns, onAction: (): void => { if (!this.busy && this.draftColumns.length >= this.minimumColumns) this.onColumns(this.draftColumns.slice()); } })
  }
  @Builder
  private columnsContent() {
    Text(this.minimumColumns > 0 ? $r('app.string.browser_traditional_columns_hint') : $r('app.string.browser_columns_hint')).fontColor($r('app.color.text_secondary')).width('100%')
    ForEach(this.draftColumns, (key: string, index: number) => {
      Row({ space: 8 }) {
        Text(this.columnLabel(key)).layoutWeight(1)
        IconActionButton({ source: $r('app.media.ic_common_arrow_up'), label: $r('app.string.browser_column_up'),
          glyphColor: this.actionColor, isInteractive: !this.busy && index > 0,
          onAction: (): void => { this.moveColumn(key, -1); } })
        IconActionButton({ source: $r('app.media.ic_common_arrow_down'), label: $r('app.string.browser_column_down'),
          glyphColor: this.actionColor, isInteractive: !this.busy && index + 1 < this.draftColumns.length,
          onAction: (): void => { this.moveColumn(key, 1); } })
      }.width('100%')
    }, (key: string): string => key)
    ForEach(this.columns, (column: BrowserColumn) => {
      Row({ space: 8 }) {
        Checkbox().selectedColor(this.actionColor).select(this.draftColumns.includes(column.key)).enabled(!this.busy && (this.draftColumns.includes(column.key) ? this.draftColumns.length > this.minimumColumns : this.draftColumns.length < this.columnLimit()))
          .onChange((selected: boolean): void => {
            if (this.busy || (!selected && this.draftColumns.length <= this.minimumColumns) || (selected && this.draftColumns.length >= this.columnLimit())) return;
            this.draftColumns = selected ? this.draftColumns.concat([column.key]) : this.draftColumns.filter((key: string): boolean => key !== column.key);
          })
        Text(this.columnLabel(column.key)).layoutWeight(1)
      }.width('100%')
    }, (column: BrowserColumn): string => column.key)
  }
  @Builder
  private searchContent() {
    Row() {
      Text($r('app.string.browser_ignore_accents')).layoutWeight(1)
      Toggle({ type: ToggleType.Switch, isOn: this.ignoreAccents }).selectedColor(this.actionColor).enabled(!this.busy)
        .onChange((value: boolean): void => { this.onIgnoreAccents(value); })
    }.width('100%')
    Text($r('app.string.browser_search_builder')).fontColor($r('app.color.text_secondary')).width('100%')
    SurfaceSelect({ options: this.searchKinds(),
      selectedIndex: this.searchKind,
      value: this.searchKinds()[this.searchKind].value,
      isInteractive: !this.busy,
      onSelect: (index: number): void => { this.searchKind = index; } }).width('100%')
    if (this.searchKind === 4) {
      TextInput({ text: this.field, placeholder: $r('app.string.browser_find_field') }).attributeModifier(new FormInputStyle())
        .enabled(!this.busy).onChange((value: string): void => { this.field = value; })
    }
    TextInput({ text: this.term, placeholder: $r('app.string.browser_search_term') }).attributeModifier(new FormInputStyle())
      .enabled(!this.busy).onChange((value: string): void => { this.term = value; })
    SurfaceSelect({ options: this.joinOptions(),
      selectedIndex: this.joinIndex,
      value: this.joinOptions()[this.joinIndex].value,
      isInteractive: !this.busy,
      onSelect: (index: number): void => { this.joinIndex = index; } }).width('100%')
    Row() {
      Text($r('app.string.browser_search_negate')).layoutWeight(1)
      Checkbox().selectedColor(this.actionColor).select(this.negated).enabled(!this.busy).onChange((value: boolean): void => { this.negated = value; })
    }.width('100%')
    PrimaryActionButton({ label: $r('app.string.browser_search_apply'),
      isInteractive: !this.busy && this.term.trim() !== '' && (this.searchKind !== 4 || this.field.trim() !== ''),
      onAction: (): void => { this.onBuildSearch(this.searchKind, this.term, this.field, this.joinIndex, this.negated); } })
  }
  @Builder
  private recentContent() {
    if (this.recentSearches.length === 0) {
      Text($r('app.string.browser_recent_searches_empty')).fontColor($r('app.color.text_secondary')).width('100%')
    }
    ForEach(this.recentSearches, (text: string) => {
      按下态按钮({ 文案: text, fillWidth: true, 是否启用: !this.busy,
        点击回调: (): void => { this.onRecent(text); } })
    }, (text: string): string => text)
  }
  @Builder
  private bodyContent() {
    if (this.kind === 'replace') {
      Text($r('app.string.browser_replace_column_hint')).fontColor($r('app.color.text_secondary')).width('100%')
      ForEach(this.columnCandidates(), (column: BrowserColumn) => {
        按下态按钮({ 文案: this.columnLabel(column.key), fillWidth: true,
          是否启用: !this.busy && column.key !== this.replacementColumn,
          点击回调: (): void => { if (!this.busy) this.onReplaceColumn(column.key); } })
      }, (column: BrowserColumn): string => column.key)
    }
    else if (this.kind === 'columns') { this.columnsContent() }
    else if (this.kind === 'search') { this.searchContent() }
    else if (this.kind === 'recent') { this.recentContent() }
    if (this.error !== '') { Text(this.error).fontColor($r('app.color.error_text')).width('100%') }
  }
  build() {
    DialogFrame({ canDismiss: !this.busy, header: () => { this.headerContent(); }, content: () => { this.bodyContent(); },
      onDismiss: (): void => { this.onClose(); } })
  }
}
