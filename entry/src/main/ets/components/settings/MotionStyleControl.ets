// SPDX-License-Identifier: AGPL-3.0-or-later
import { FormRowLayout } from '../../utils/FormRowLayout';
import { settingsItemText } from '../../utils/SettingsStructureText';
import { MOTION_STYLE_KEY, MOTION_STYLES, motionStyleTitleKey } from '../../model/MotionStyle';
import { saveMotionStyle } from '../../utils/MotionStyleStore';
import { FormSelectRow } from '../common/FormSelectRow';
import { localizedNamedResourceText } from '../../utils/UiFeedback';

@Component
export struct MotionStyleControl {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @StorageProp(MOTION_STYLE_KEY) private style: string = 'restrained';
  @State private saving: boolean = false;
  @State private saveFailed: boolean = false;
  @State private selectionRevision: number = 0;

  private options(): SelectOption[] {
    return MOTION_STYLES.map((style: string): SelectOption => {
      return { value: localizedNamedResourceText(this.getUIContext(), this.uiLanguage, motionStyleTitleKey(style)) };
    });
  }

  private async selectStyle(index: number): Promise<void> {
    if (this.saving || index < 0 || index >= MOTION_STYLES.length || MOTION_STYLES[index] === this.style) return;
    this.saving = true;
    this.saveFailed = false;
    try { await saveMotionStyle(MOTION_STYLES[index]); }
    catch (error) { this.saveFailed = true; }
    finally { this.saving = false; this.selectionRevision++; }
  }

  build() {
    Column({ space: FormRowLayout.hintGap }) {
      ForEach([this.selectionRevision], (_revision: number) => {
        FormSelectRow({ label: settingsItemText(this.getUIContext(), 'motion_style', this.uiLanguage),
          options: this.options(), selectedIndex: MOTION_STYLES.indexOf(this.style),
          value: localizedNamedResourceText(this.getUIContext(), this.uiLanguage, motionStyleTitleKey(this.style)),
          isInteractive: !this.saving, onSelect: (index: number): void => { this.selectStyle(index); } })
      }, (revision: number): string => revision.toString())
      if (this.saveFailed) {
        Text($r('app.string.motion_style_save_failed')).fontSize(12).fontColor($r('app.color.error_text')).width('100%')
      }
    }.width('100%')
  }
}
