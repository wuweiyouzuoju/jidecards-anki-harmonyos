// SPDX-License-Identifier: AGPL-3.0-or-later
import { FormSelectRow } from '../common/FormSelectRow';
interface ImportSelectOption { value: string; }

@Component
export struct ImportSelect {
  @Prop label: string = '';
  @Prop labels: string[] = [];
  @Prop selectedIndex: number = 0;
  @Prop isInteractive: boolean = true;
  onSelect: (index: number) => void = (_index: number): void => {};
  build() {
    FormSelectRow({ label: this.label,
      options: this.labels.map((value: string): ImportSelectOption => { return { value }; }),
      selectedIndex: this.selectedIndex, value: this.labels[this.selectedIndex] ?? '',
      isInteractive: this.isInteractive, onSelect: this.onSelect })
  }
}
