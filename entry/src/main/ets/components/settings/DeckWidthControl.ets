// SPDX-License-Identifier: AGPL-3.0-or-later
import { settingsItemText } from '../../utils/SettingsStructureText';
import { DECK_LIST_NARROW_KEY } from '../../model/DeckListAppearance';
import { saveDeckListNarrow } from '../../utils/DeckListAppearanceStore';
import { SelectStyle } from '../../utils/SelectStyle';
import { resourceText } from '../../utils/UiFeedback';

@Component
export struct DeckWidthControl {
  @StorageProp(DECK_LIST_NARROW_KEY) private narrow: boolean = false;
  @State private saving: boolean = false;
  @State private saveFailed: boolean = false;

  private options(): SelectOption[] {
    return [
      { value: resourceText(this.getUIContext(), $r('app.string.deck_width_wide')) },
      { value: resourceText(this.getUIContext(), $r('app.string.deck_width_narrow')) }
    ];
  }

  private async selectWidth(index: number): Promise<void> {
    if (this.saving || index < 0 || index > 1 || (index === 1) === this.narrow) return;
    this.saving = true;
    this.saveFailed = false;
    try {
      await saveDeckListNarrow(index === 1);
    } catch (error) {
      this.saveFailed = true;
    } finally {
      this.saving = false;
    }
  }

  build() {
    Column({ space: 4 }) {
      Row() {
        Text(settingsItemText(this.getUIContext(), 'deck_list_narrow'))
          .fontSize(15)
          .fontColor($r('app.color.text_primary'))
          .layoutWeight(1)
        Select(this.options())
          .selected(this.narrow ? 1 : 0)
          .value(resourceText(this.getUIContext(), this.narrow
            ? $r('app.string.deck_width_narrow') : $r('app.string.deck_width_wide')))
          .attributeModifier(new SelectStyle())
          .height(SelectStyle.controlHeight)
          .padding(SelectStyle.controlPadding)
          .space(SelectStyle.controlSpace)
          .width(SelectStyle.fieldWidth)
          .constraintSize(SelectStyle.fieldConstraint).flexShrink(0)
          .font(SelectStyle.controlFont)
          .optionFont(SelectStyle.optionFont)
          .selectedOptionFont(SelectStyle.selectedOptionFont)
          .textModifier(SelectStyle.labelText())
          .borderRadius(SelectStyle.controlRadius)
          .enabled(!this.saving)
          .onSelect((index: number): void => { this.selectWidth(index); })
      }
      .width('100%')
      .height(48)
      if (this.saveFailed) {
        Text($r('app.string.deck_width_save_failed'))
          .fontSize(12)
          .fontColor($r('app.color.error_text'))
          .width('100%')
      }
    }
    .width('100%')
  }
}
