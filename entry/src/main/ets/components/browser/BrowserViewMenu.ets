// SPDX-License-Identifier: AGPL-3.0-or-later
import { AnchoredMenuItem } from '../common/MenuItem';
import { AppInterfaceControl } from '../../model/AppInterface';
import { appInterface } from '../../backend/AppInterfaceService';
import { resourceText, namedResourceText } from '../../utils/UiFeedback';
import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';
import { 按下态按钮 } from '../common/按下态按钮';
import { 应用尺寸 } from '../../utils/应用尺寸';

/** 三个入口共用公共选择弹窗；草稿确认后交还页面，关闭不写入。 */
@Component
export struct BrowserViewMenu {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop @Watch('syncSelection') group: string = 'mode';
  @Prop @Watch('syncSelection') notes: boolean = false;
  @Prop @Watch('syncSelection') filterIndex: number = 0;
  @Prop @Watch('syncSelection') sortIndex: number = 0;
  @Prop @Watch('syncSelection') sortDescending: boolean = false;
  @State private draftSortIndex: number = 0;
  @State private draftModeIndex: number = 0;
  @State private draftFilterIndex: number = 0;
  @State private draftDescending: boolean = false;
  @Prop @Watch('publishInterface') filterOptions: SelectOption[] = [];
  @Prop @Watch('publishInterface') sortOptions: SelectOption[] = [];
  @Prop @Watch('publishInterface') available: boolean = true;
  onClose: () => void = (): void => {};
  onModeChange: (notes: boolean) => void = (_notes: boolean): void => {};
  onFilterChange: (index: number) => void = (_index: number): void => {};
  onSortChange: (index: number, descending: boolean) => void = (_index: number, _descending: boolean): void => {};
  private interfaceMounted: boolean = false;

  aboutToAppear(): void { this.interfaceMounted = true; this.syncSelection(); }
  aboutToDisappear(): void { this.interfaceMounted = false; appInterface.leave('browser_view'); }

  private syncSelection(): void {
    this.draftModeIndex = this.notes ? 1 : 0;
    this.draftFilterIndex = this.filterIndex;
    this.draftSortIndex = this.sortIndex;
    this.draftDescending = this.sortDescending;
    this.publishInterface();
  }

  private selectOption(index: number): void {
    if (!this.available || !Number.isInteger(index) || index < 0) return;
    if (this.group === 'mode' && index < 2) this.draftModeIndex = index;
    else if (this.group === 'filter' && index < this.filterOptions.length) this.draftFilterIndex = index;
    else if (this.group === 'sort' && index < this.sortOptions.length) {
      this.draftSortIndex = index;
      this.publishInterface();
    }
    if (this.group !== 'sort') this.publishInterface();
  }

  private selectDirection(descending: boolean): void {
    if (!this.available || this.draftSortIndex === 0) return;
    this.draftDescending = descending;
    this.publishInterface();
  }

  private applySort(): void {
    if (this.available && this.draftSortIndex >= 0 && this.draftSortIndex < this.sortOptions.length) {
      this.onSortChange(this.draftSortIndex, this.draftSortIndex === 0 ? false : this.draftDescending);
    }
  }

  private selectedIndex(): number {
    return this.group === 'mode' ? this.draftModeIndex : this.group === 'filter' ? this.draftFilterIndex : this.draftSortIndex;
  }

  private options(): SelectOption[] {
    return this.group === 'mode' ? [{ value: $r('app.string.browser_mode_cards') }, { value: $r('app.string.browser_mode_notes') }] :
      this.group === 'filter' ? this.filterOptions : this.sortOptions;
  }

  private applySelection(): void {
    const index: number = this.selectedIndex();
    if (!this.available || index < 0 || index >= this.options().length) return;
    if (this.group === 'mode') this.onModeChange(index === 1);
    else if (this.group === 'filter') this.onFilterChange(index);
    else this.applySort();
  }

  private publishInterface(_locale: string = this.uiLanguage): void {
    if (!this.interfaceMounted) return;
    const modeKeys: string[] = ['browser_mode_cards', 'browser_mode_notes'];
    const labels: string[] = this.group === 'mode' ?
      modeKeys.map((key: string): string => namedResourceText(this.getUIContext(), key)) :
      (this.group === 'filter' ? this.filterOptions : this.sortOptions).map((option: SelectOption): string =>
        typeof option.value === 'string' ? option.value : resourceText(this.getUIContext(), option.value));
    const selected: number = this.selectedIndex();
    const ids: string[] = labels.map((_label: string, index: number): string => this.group + '-' + index);
    const controls: AppInterfaceControl[] = labels.map((label: string, index: number): AppInterfaceControl => ({ id: ids[index], title: label,
      titleKey: this.group === 'mode' ? modeKeys[index] : undefined,
      enabled: this.available, selected: index === selected }));
    if (this.group === 'sort') {
      for (const descending of [false, true]) {
        controls.push({ id: descending ? 'descending' : 'ascending',
          titleKey: descending ? 'browser_sort_descending' : 'browser_sort_ascending', title: '',
          enabled: this.available && selected > 0, selected: selected > 0 && this.draftDescending === descending });
      }
    }
    controls.push({ id: 'apply', titleKey: 'browser_detail_confirm', title: '',
      enabled: this.available && selected >= 0 && selected < labels.length, selected: false });
    controls.push({ id: 'close', titleKey: 'browser_detail_cancel', title: '', enabled: true, selected: false });
    appInterface.observe({ surface: 'browser_view', sectionId: this.group, selectedId: ids[selected] ?? '',
      optionIds: ids, optionLabels: labels, busy: !this.available, controlsComplete: true, items: controls,
      values: this.group === 'sort' ? [{ id: 'applied_index', value: String(this.sortIndex) },
        { id: 'draft_descending', value: String(this.draftDescending) }] : [] });
  }

  @Builder
  private selectionHeader() {
    Column() {
      DialogHeader({ title: this.group === 'mode' ? $r('app.string.browser_mode_switch') :
        this.group === 'filter' ? $r('app.string.browser_status_title') : $r('app.string.browser_sort_title'),
        actionLabel: $r('app.string.browser_detail_confirm'),
        closeLabel: $r('app.string.browser_detail_cancel'),
        actionEnabled: this.available && this.selectedIndex() >= 0 && this.selectedIndex() < this.options().length,
        onClose: (): void => { this.onClose(); }, onAction: (): void => { this.applySelection(); } })
      if (this.group === 'sort') {
        Row({ space: 应用尺寸.间距_8 }) {
          按下态按钮({ 文案: $r('app.string.browser_sort_ascending'), selectable: true,
            selected: this.draftSortIndex > 0 && !this.draftDescending, fillWidth: true,
            是否启用: this.available && this.draftSortIndex > 0,
            点击回调: (): void => { this.selectDirection(false); } }).layoutWeight(1)
          按下态按钮({ 文案: $r('app.string.browser_sort_descending'), selectable: true,
            selected: this.draftSortIndex > 0 && this.draftDescending, fillWidth: true,
            是否启用: this.available && this.draftSortIndex > 0,
            点击回调: (): void => { this.selectDirection(true); } }).layoutWeight(1)
        }.width('100%')
      }
    }.width('100%')
  }

  @Builder
  private selectionContent() {
    Column() {
      ForEach(this.options(), (option: SelectOption, index: number) => {
        AnchoredMenuItem({ label: option.value, selected: this.selectedIndex() === index, available: this.available,
          divider: index > 0, labelAlignment: this.group === 'sort' ? TextAlign.Start : TextAlign.Center,
          onSelect: (): void => { this.selectOption(index); } })
      }, (option: SelectOption, index: number): string => index + '-' + option.value)
    }.width('100%')
  }

  build() {
    DialogFrame({ onDismiss: (): void => { this.onClose(); }, header: (): void => { this.selectionHeader(); },
      content: (): void => { this.selectionContent(); } })
  }
}
