// SPDX-License-Identifier: AGPL-3.0-or-later
import { HOME_LAYOUT_KEY, HOME_LAYOUT_MODES, DEFAULT_HOME_LAYOUT, homeLayoutTitleKey } from '../../model/HomeLayout';
import { saveHomeLayout } from '../../utils/HomeLayoutStore';
import { FormSelectRow } from '../common/FormSelectRow';
import { FormRowLayout } from '../../utils/FormRowLayout';
import { settingsItemText } from '../../utils/SettingsStructureText';
import { localizedNamedResourceText } from '../../utils/UiFeedback';
@Component
export struct HomeLayoutControl {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @StorageProp(HOME_LAYOUT_KEY) private mode: string = DEFAULT_HOME_LAYOUT;
  @State private saving: boolean = false;
  @State private failed: boolean = false;
  private options(): SelectOption[] {
    return HOME_LAYOUT_MODES.map((mode: string): SelectOption => ({ value:
      localizedNamedResourceText(this.getUIContext(), this.uiLanguage, homeLayoutTitleKey(mode)) }));
  }
  private async selectMode(index: number): Promise<void> {
    if (this.saving || index < 0 || index >= HOME_LAYOUT_MODES.length || HOME_LAYOUT_MODES[index] === this.mode) return;
    this.saving = true; this.failed = false;
    try { await saveHomeLayout(HOME_LAYOUT_MODES[index]); }
    catch (_error) { this.failed = true; }
    finally { this.saving = false; }
  }
  build() {
    Column({ space: FormRowLayout.hintGap }) {
      FormSelectRow({ label: settingsItemText(this.getUIContext(), 'home_layout', this.uiLanguage),
        options: this.options(), selectedIndex: HOME_LAYOUT_MODES.indexOf(this.mode),
        value: localizedNamedResourceText(this.getUIContext(), this.uiLanguage, homeLayoutTitleKey(this.mode)),
        isInteractive: !this.saving, onSelect: (index: number): void => { this.selectMode(index); } })
      if (this.failed) { Text($r('app.string.settings_local_save_failed')).fontSize(12).fontColor($r('app.color.error_text')).width('100%') }
    }.width('100%')
  }
}
