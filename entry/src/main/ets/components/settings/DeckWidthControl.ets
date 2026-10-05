// SPDX-License-Identifier: AGPL-3.0-or-later
import { settingsItemText } from '../../utils/SettingsStructureText';
import { DECK_LIST_STYLE_KEY, DECK_LIST_STYLES, deckListStyleTitleKey } from '../../model/DeckListAppearance';
import { saveDeckListStyle } from '../../utils/DeckListAppearanceStore';
import { FormSelectRow } from '../common/FormSelectRow';
import { localizedNamedResourceText } from '../../utils/UiFeedback';

@Component
export struct DeckWidthControl {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @StorageProp(DECK_LIST_STYLE_KEY) private style: string = 'single_wide';
  @State private saving: boolean = false;
  @State private saveFailed: boolean = false;

  private options(_locale: string = this.uiLanguage): SelectOption[] {
    return DECK_LIST_STYLES.map((style: string): SelectOption => {
      return { value: localizedNamedResourceText(this.getUIContext(), _locale, deckListStyleTitleKey(style)) };
    });
  }

  private async selectWidth(index: number): Promise<void> {
    if (this.saving || index < 0 || index >= DECK_LIST_STYLES.length || DECK_LIST_STYLES[index] === this.style) return;
    this.saving = true;
    this.saveFailed = false;
    try {
      await saveDeckListStyle(DECK_LIST_STYLES[index]);
    } catch (error) {
      this.saveFailed = true;
    } finally {
      this.saving = false;
    }
  }

  build() {
    Column({ space: 4 }) {
      FormSelectRow({ label: settingsItemText(this.getUIContext(), 'deck_list_style', this.uiLanguage),
        options: this.options(), selectedIndex: DECK_LIST_STYLES.indexOf(this.style),
        value: localizedNamedResourceText(this.getUIContext(), this.uiLanguage, deckListStyleTitleKey(this.style)),
        isInteractive: !this.saving, onSelect: (index: number): void => { this.selectWidth(index); } })
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
