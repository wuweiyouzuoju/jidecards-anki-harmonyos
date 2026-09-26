// SPDX-License-Identifier: AGPL-3.0-or-later
import { AnchoredMenu } from '../common/AnchoredMenu';
import { AnchoredMenuItem } from '../common/MenuItem';

/** 合并选择框一次只展示被点击的选值区；选项不再套分类或折叠层。 */
@Component
export struct BrowserViewMenu {
  @Prop group: string = 'mode';
  @Prop menuWidth: number = 240;
  @Prop notes: boolean = false;
  @Prop filterIndex: number = 0;
  @Prop sortIndex: number = 0;
  @Prop filterOptions: SelectOption[] = [];
  @Prop sortOptions: SelectOption[] = [];
  @Prop topOffset: number = 0;
  @Prop available: boolean = true;
  onClose: () => void = (): void => {};
  onModeChange: (notes: boolean) => void = (_notes: boolean): void => {};
  onFilterChange: (index: number) => void = (_index: number): void => {};
  onSortChange: (index: number) => void = (_index: number): void => {};

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
