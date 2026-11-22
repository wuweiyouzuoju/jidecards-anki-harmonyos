// SPDX-License-Identifier: AGPL-3.0-or-later
import { FormRowLayout } from '../../utils/FormRowLayout';
import { settingsItemText } from '../../utils/SettingsStructureText';
import { DECK_LIST_STYLE_KEY, DESKTOP_HOME_LAYOUT_KEY, availableDeckListStyles, deckListStyleTitleKey } from '../../model/DeckListAppearance';
import { saveDeckListStyle } from '../../utils/DeckListAppearanceStore';
import { FormSelectRow } from '../common/FormSelectRow';
import { localizedNamedResourceText } from '../../utils/UiFeedback';

@Component
export struct DeckWidthControl {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @StorageProp(DECK_LIST_STYLE_KEY) private style: string = 'single_wide';
  @StorageProp(DESKTOP_HOME_LAYOUT_KEY) private desktop: boolean = false;
  @State private saving: boolean = false;
  @State private saveFailed: boolean = false;

  private options(_locale: string = this.uiLanguage): SelectOption[] {
    return availableDeckListStyles(this.desktop).map((style: string): SelectOption => {
      return { value: localizedNamedResourceText(this.getUIContext(), _locale, deckListStyleTitleKey(style)) };
    });
  }

  private async selectWidth(index: number): Promise<void> {
    const style: string | undefined = availableDeckListStyles(this.desktop)[index];
    if (this.saving || style === undefined || style === this.style) return;
    this.saving = true;
    this.saveFailed = false;
    try {
      await saveDeckListStyle(style);
    } catch (error) {
      this.saveFailed = true;
    } finally {
      this.saving = false;
    }
  }

  build() {
    Column({ space: FormRowLayout.hintGap }) {
      FormSelectRow({ label: settingsItemText(this.getUIContext(), 'deck_list_style', this.uiLanguage),
        options: this.options(), selectedIndex: availableDeckListStyles(this.desktop).indexOf(this.style),
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
