// SPDX-License-Identifier: AGPL-3.0-or-later
import { DialogHeader } from './DialogHeader';
import { LiveSearchField } from './LiveSearchField';
import { 应用尺寸 } from '../../utils/应用尺寸';

/** 标题分隔线与搜索框外缘的间距只在此处贡献。 */
@Component
export struct DialogSearchHeader {
  @Prop title: ResourceStr = '';
  @Prop closeLabel: ResourceStr = $r('app.string.cancel');
  @Prop showAction: boolean = false;
  @Prop actionLabel: ResourceStr = $r('app.string.done');
  @Prop actionEnabled: boolean = true;
  @Prop query: string = '';
  @Prop placeholder: ResourceStr = '';
  @Prop showSearch: boolean = true;
  @Prop searchEnabled: boolean = true;
  @Prop focusSearch: boolean = false;
  @Prop debounceMs: number = 200;
  onClose: () => void = (): void => {};
  onAction: () => void = (): void => {};
  onChange: (value: string) => void = (_value: string): void => {};
  onSearch: (value: string) => void = (_value: string): void => {};
  build() {
    Column({ space: 应用尺寸.间距_12 }) {
      DialogHeader({ title: this.title, closeLabel: this.closeLabel, showAction: this.showAction,
        actionLabel: this.actionLabel, actionEnabled: this.actionEnabled, onClose: this.onClose, onAction: this.onAction })
      if (this.showSearch) {
        LiveSearchField({ value: this.query, placeholder: this.placeholder, isEnabled: this.searchEnabled,
          focusOnOpen: this.focusSearch, debounceMs: this.debounceMs, onChange: this.onChange, onSearch: this.onSearch })
      }
    }.width('100%')
  }
}
