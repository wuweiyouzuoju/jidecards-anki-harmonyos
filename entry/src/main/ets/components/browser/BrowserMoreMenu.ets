// SPDX-License-Identifier: AGPL-3.0-or-later
import { AnchoredMenu } from '../common/AnchoredMenu';
import { AnchoredMenuItem } from '../common/MenuItem';
import { 应用尺寸 } from '../../utils/应用尺寸';

/** 沿用设置模式菜单的居中条目、主题色标记和透明承接层。 */
@Component
export struct BrowserMoreMenu {
  @Prop filterActive: boolean = false;
  @Prop available: boolean = true;
  @Prop subtitleIndex: number = 1;
  @Prop topOffset: number = 68;
  onClose: () => void = (): void => {};
  onFilter: () => void = (): void => {};
  onFindReplace: () => void = (): void => {};
  onSaveSearch: () => void = (): void => {};
  onSubtitle: (index: number) => void = (_index: number): void => {};

  build() {
    AnchoredMenu({ menuWidth: 应用尺寸.extendedMenuWidth, topOffset: this.topOffset,
      onClose: (): void => { this.onClose(); } }) {
        AnchoredMenuItem({ label: this.filterActive ? $r('app.string.browser_filter_active') :
          $r('app.string.browser_action_sidebar'), available: this.available,
          onSelect: (): void => { this.onFilter(); } })
        AnchoredMenuItem({ label: $r('app.string.browser_action_find_replace'), divider: true, available: this.available,
          onSelect: (): void => { this.onFindReplace(); } })
        AnchoredMenuItem({ label: $r('app.string.browser_saved_search_save'), divider: true,
          available: this.available && this.filterActive,
          onSelect: (): void => { this.onSaveSearch(); } })
        AnchoredMenuItem({ label: $r('app.string.browser_subtitle_deck'), selected: this.subtitleIndex === 1,
          divider: true,
          onSelect: (): void => { this.onSubtitle(1); } })
        AnchoredMenuItem({ label: $r('app.string.browser_subtitle_answer'), divider: true, selected: this.subtitleIndex === 4,
          onSelect: (): void => { this.onSubtitle(4); } })
        AnchoredMenuItem({ label: $r('app.string.browser_subtitle_due'), divider: true, selected: this.subtitleIndex === 2,
          onSelect: (): void => { this.onSubtitle(2); } })
    }
  }
}
