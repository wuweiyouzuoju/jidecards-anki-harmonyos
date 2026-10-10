// SPDX-License-Identifier: AGPL-3.0-or-later
import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';
import { BrowserColumn } from '../../proto/messages/SearchMessages';
import { BROWSER_SHORTCUTS, BrowserShortcut } from '../../model/BrowserKeyboard';
import { resourceText, namedResourceText } from '../../utils/UiFeedback';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { SelectStyle } from '../../utils/SelectStyle';
import { FormInputStyle } from '../../utils/FormInputStyle';
import { PrimaryActionButton } from '../common/PrimaryActionButton';
import { PressFeedback } from '../../utils/PressFeedback';
import { appInterface } from '../../backend/AppInterfaceService';
import { visibleInterfaceItems, AppInterfaceControl } from '../../model/AppInterface';
@Component
export struct BrowserDisplayDialog {
  @Prop kind: string = 'search';
  @Prop notes: boolean = false;
  @Prop @Watch('publishInterface') busy: boolean = false;
  @Prop error: string = '';
  @Prop @Watch('handleBack') backRequest: number = 0;
  @Prop columns: BrowserColumn[] = [];
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
    return this.kind === 'columns' ? 'browser_display' : this.kind === 'keyboard' ? 'browser_shortcuts' :
      this.kind === 'recent' ? 'browser_recent_searches' : 'browser_search_options';
  }
  private publishInterface(): void {
    if (!this.mounted) return;
    const surface: string = this.surfaceId();
    const controls: AppInterfaceControl[] = visibleInterfaceItems(surface, { simple: false, agent: false, cloudDeck: false, themeHasTextures: false })
      .map((item): AppInterfaceControl => ({ id: item.id, titleKey: item.titleKey, title: namedResourceText(this.getUIContext(), item.titleKey),
        enabled: !this.busy, selected: item.id === 'ignore_accents' && this.ignoreAccents }));
    appInterface.observe({ surface: surface, sectionId: '', selectedId: '', busy: this.busy,
      optionIds: this.kind === 'columns' ? this.columns.map((column: BrowserColumn): string => column.key) :
        this.kind === 'recent' ? this.recentSearches.map((_text: string, index: number): string => String(index)) : [],
      optionLabels: this.kind === 'columns' ? this.columns.map((column: BrowserColumn): string => this.columnLabel(column.key)) :
        this.kind === 'recent' ? this.recentSearches.slice() : [],
      items: controls, controlsComplete: false, values: [{ id: 'mode', value: this.notes ? 'notes' : 'cards' },
        { id: 'selected_columns', value: this.draftColumns.join(',') }, { id: 'ignore_accents', value: String(this.ignoreAccents) }] });
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
    const draft: string[] = this.draftColumns.slice();
    const index: number = draft.indexOf(key); const target: number = index + direction;
    if (index < 0 || target < 0 || target >= draft.length) return;
    draft.splice(index, 1); draft.splice(target, 0, key); this.draftColumns = draft;
  }
  @Builder
  private headerContent() {
    DialogHeader({ title: this.kind === 'columns' ? $r('app.string.browser_display_columns') :
      this.kind === 'keyboard' ? $r('app.string.browser_shortcuts') : this.kind === 'recent' ?
        $r('app.string.browser_recent_searches') : $r('app.string.browser_search_options'),
      closeLabel: $r('app.string.browser_detail_cancel'), closeEnabled: !this.busy,
      onClose: (): void => { this.onClose(); },
      showAction: this.kind === 'columns',
      actionLabel: this.kind === 'columns' ? $r('app.string.browser_detail_confirm') : '',
      actionEnabled: !this.busy, onAction: (): void => { this.onColumns(this.draftColumns.slice()); } })
  }
  @Builder
  private columnsContent() {
    Text($r('app.string.browser_columns_hint')).fontColor($r('app.color.text_secondary')).width('100%')
    ForEach(this.draftColumns, (key: string, index: number) => {
      Row({ space: 8 }) {
        Text(this.columnLabel(key)).layoutWeight(1)
        Button($r('app.string.browser_column_up')).attributeModifier(new PressFeedback()).stateEffect(false)
          .enabled(!this.busy && index > 0).onClick((): void => { this.moveColumn(key, -1); })
        Button($r('app.string.browser_column_down')).attributeModifier(new PressFeedback()).stateEffect(false)
          .enabled(!this.busy && index + 1 < this.draftColumns.length).onClick((): void => { this.moveColumn(key, 1); })
      }.width('100%')
    }, (key: string): string => key)
    ForEach(this.columns, (column: BrowserColumn) => {
      Row({ space: 8 }) {
        Checkbox().select(this.draftColumns.includes(column.key)).enabled(!this.busy && (this.draftColumns.includes(column.key) || this.draftColumns.length < 16))
          .onChange((selected: boolean): void => {
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
      Toggle({ type: ToggleType.Switch, isOn: this.ignoreAccents }).enabled(!this.busy)
        .onChange((value: boolean): void => { this.onIgnoreAccents(value); })
    }.width('100%')
    Text($r('app.string.browser_search_builder')).fontColor($r('app.color.text_secondary')).width('100%')
    Select(this.searchKinds()).selected(this.searchKind).value(this.searchKinds()[this.searchKind].value)
      .height(SelectStyle.controlHeight).padding(SelectStyle.controlPadding).space(SelectStyle.controlSpace)
      .font(SelectStyle.controlFont).border(SelectStyle.controlBorder).borderRadius(SelectStyle.controlRadius)
      .optionFont(SelectStyle.optionFont).selectedOptionFont(SelectStyle.selectedOptionFont)
      .textModifier(SelectStyle.labelText()).width('100%').attributeModifier(new SelectStyle()).enabled(!this.busy).onSelect((index: number): void => { this.searchKind = index; })
    if (this.searchKind === 4) {
      TextInput({ text: this.field, placeholder: $r('app.string.browser_find_field') }).attributeModifier(new FormInputStyle())
        .enabled(!this.busy).onChange((value: string): void => { this.field = value; })
    }
    TextInput({ text: this.term, placeholder: $r('app.string.browser_search_term') }).attributeModifier(new FormInputStyle())
      .enabled(!this.busy).onChange((value: string): void => { this.term = value; })
    Select(this.joinOptions()).selected(this.joinIndex).value(this.joinOptions()[this.joinIndex].value)
      .height(SelectStyle.controlHeight).padding(SelectStyle.controlPadding).space(SelectStyle.controlSpace)
      .font(SelectStyle.controlFont).border(SelectStyle.controlBorder).borderRadius(SelectStyle.controlRadius)
      .optionFont(SelectStyle.optionFont).selectedOptionFont(SelectStyle.selectedOptionFont)
      .textModifier(SelectStyle.labelText()).width('100%').attributeModifier(new SelectStyle()).enabled(!this.busy).onSelect((index: number): void => { this.joinIndex = index; })
    Row() {
      Text($r('app.string.browser_search_negate')).layoutWeight(1)
      Checkbox().select(this.negated).enabled(!this.busy).onChange((value: boolean): void => { this.negated = value; })
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
      Button(text).attributeModifier(new PressFeedback()).stateEffect(false)
        .enabled(!this.busy).onClick((): void => { this.onRecent(text); }).width('100%')
    }, (text: string): string => text)
  }
  @Builder
  private bodyContent() {
    if (this.kind === 'columns') { this.columnsContent() }
    else if (this.kind === 'search') { this.searchContent() }
    else if (this.kind === 'recent') { this.recentContent() }
    else {
      Text($r('app.string.browser_shortcuts_hint')).fontColor($r('app.color.text_secondary')).width('100%')
      ForEach(BROWSER_SHORTCUTS, (shortcut: BrowserShortcut) => {
        Row({ space: 12 }) {
          Text(namedResourceText(this.getUIContext(), shortcut.titleKey)).layoutWeight(1)
          Text(shortcut.keys)
        }.width('100%')
      }, (shortcut: BrowserShortcut): string => shortcut.command)
    }
    if (this.error !== '') { Text(this.error).fontColor($r('app.color.error_text')).width('100%') }
  }
  build() {
    DialogFrame({ canDismiss: !this.busy, header: () => { this.headerContent(); }, content: () => { this.bodyContent(); },
      onDismiss: (): void => { this.onClose(); } })
  }
}
