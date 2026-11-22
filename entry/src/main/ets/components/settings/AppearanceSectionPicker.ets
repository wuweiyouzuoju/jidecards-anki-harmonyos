// SPDX-License-Identifier: AGPL-3.0-or-later
import { appearanceElementColor } from '../../utils/AppearanceElements';
import { APPEARANCE_EDITOR_SECTIONS } from '../../model/AppearanceElements';
import { FormSelectRow } from '../common/FormSelectRow';
import { localizedNamedResourceText } from '../../utils/UiFeedback';

@Component
export struct AppearanceSectionPicker {
  @StorageProp('appearance_elements_active') private appearanceElements: string = '';
  @Prop memoryFailed: boolean = false;
  @StorageProp('系统语言') private language: string = 'zh-Hans';
  @Prop selectedId: string = 'color';
  @Prop isInteractive: boolean = true;
  onSelect: (id: string) => void = (_id: string): void => {};
  private options(): SelectOption[] {
    return APPEARANCE_EDITOR_SECTIONS.map((item): SelectOption => ({
      value: localizedNamedResourceText(this.getUIContext(), this.language, item.titleKey) }));
  }
  private value(): string {
    const item = APPEARANCE_EDITOR_SECTIONS.find((item): boolean => item.id === this.selectedId);
    return localizedNamedResourceText(this.getUIContext(), this.language, item?.titleKey ?? 'appearance_custom_color');
  }
  build() {
    Column({ space: 4 }) {
    FormSelectRow({ label: $r('app.string.appearance_section'), options: this.options(),
      selectedIndex: APPEARANCE_EDITOR_SECTIONS.findIndex((item): boolean => item.id === this.selectedId),
      value: this.value(), isInteractive: this.isInteractive,
      onSelect: (index: number): void => {
        if (index >= 0 && index < APPEARANCE_EDITOR_SECTIONS.length) this.onSelect(APPEARANCE_EDITOR_SECTIONS[index].id);
      } })
    if (this.memoryFailed) Text($r('app.string.appearance_section_memory_failed')).fontSize(12).fontColor($r('app.color.error_text'))
    }.width('100%')
  }
}
