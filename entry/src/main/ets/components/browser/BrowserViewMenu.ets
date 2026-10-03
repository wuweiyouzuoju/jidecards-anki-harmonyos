// SPDX-License-Identifier: AGPL-3.0-or-later
import { AnchoredMenu } from '../common/AnchoredMenu';
import { AnchoredMenuItem } from '../common/MenuItem';
import { AppInterfaceControl } from '../../model/AppInterface';
import { appInterface } from '../../backend/AppInterfaceService';
import { namedResourceText, resourceText } from '../../utils/UiFeedback';

/** 合并选择框一次只展示被点击的选值区；选项不再套分类或折叠层。 */
@Component
export struct BrowserViewMenu {
  @Prop @Watch('publishInterface') group: string = 'mode';
  @Prop menuWidth: number = 240;
  @Prop @Watch('publishInterface') notes: boolean = false;
  @Prop @Watch('publishInterface') filterIndex: number = 0;
  @Prop @Watch('publishInterface') sortIndex: number = 0;
  @Prop @Watch('publishInterface') filterOptions: SelectOption[] = [];
  @Prop @Watch('publishInterface') sortOptions: SelectOption[] = [];
  @Prop topOffset: number = 0;
  @Prop @Watch('publishInterface') available: boolean = true;
  onClose: () => void = (): void => {};
  onModeChange: (notes: boolean) => void = (_notes: boolean): void => {};
  onFilterChange: (index: number) => void = (_index: number): void => {};
  onSortChange: (index: number) => void = (_index: number): void => {};
  private interfaceMounted: boolean = false;

  aboutToAppear(): void { this.interfaceMounted = true; this.publishInterface(); }
  aboutToDisappear(): void { this.interfaceMounted = false; appInterface.leave('browser_view'); }

  private publishInterface(): void {
    if (!this.interfaceMounted) return;
    const modeKeys: string[] = ['browser_mode_cards', 'browser_mode_notes'];
    const labels: string[] = this.group === 'mode' ?
      modeKeys.map((key: string): string => namedResourceText(this.getUIContext(), key)) :
      (this.group === 'filter' ? this.filterOptions : this.sortOptions).map((option: SelectOption): string =>
        typeof option.value === 'string' ? option.value : resourceText(this.getUIContext(), option.value));
    const selected: number = this.group === 'mode' ? (this.notes ? 1 : 0) : this.group === 'filter' ? this.filterIndex : this.sortIndex;
    const ids: string[] = labels.map((_label: string, index: number): string => this.group + '-' + index);
    appInterface.observe({ surface: 'browser_view', sectionId: this.group, selectedId: ids[selected] ?? '',
      optionIds: ids, optionLabels: labels, busy: !this.available,
      items: labels.map((label: string, index: number): AppInterfaceControl => ({ id: ids[index], title: label,
        titleKey: this.group === 'mode' ? modeKeys[index] : undefined,
        enabled: this.available, selected: index === selected })) });
  }

  build() {
    AnchoredMenu({ menuWidth: this.menuWidth, topOffset: this.topOffset, alignEnd: false,
      onClose: (): void => { this.onClose(); } }) {
      Scroll() {
        Column() {
          if (this.group === 'mode') {
            AnchoredMenuItem({ label: $r('app.string.browser_mode_cards'), selected: !this.notes, available: this.available,
              onSelect: (): void => { this.onModeChange(false); } })
            AnchoredMenuItem({ label: $r('app.string.browser_mode_notes'), selected: this.notes, available: this.available,
              divider: true, onSelect: (): void => { this.onModeChange(true); } })
          } else if (this.group === 'filter') {
            ForEach(this.filterOptions, (option: SelectOption, index: number) => {
              AnchoredMenuItem({ label: option.value, selected: this.filterIndex === index, available: this.available,
                divider: index > 0, onSelect: (): void => { this.onFilterChange(index); } })
            }, (option: SelectOption, index: number): string => index + '-' + option.value)
          } else if (this.group === 'sort') {
            ForEach(this.sortOptions, (option: SelectOption, index: number) => {
              AnchoredMenuItem({ label: option.value, selected: this.sortIndex === index, available: this.available,
                divider: index > 0, onSelect: (): void => { this.onSortChange(index); } })
            }, (option: SelectOption, index: number): string => index + '-' + option.value)
          }
        }.width('100%')
      }.width('100%').constraintSize({ maxHeight: '55%' }).scrollBar(BarState.Auto)
    }
  }
}
