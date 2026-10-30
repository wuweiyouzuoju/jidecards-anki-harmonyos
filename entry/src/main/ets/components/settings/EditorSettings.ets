// SPDX-License-Identifier: AGPL-3.0-or-later
import { 设置分组卡片 } from './设置分组卡片';
import { SettingsToggleRow } from '../common/SettingsToggleRow';
import { WHEEL_ON_ENTRY_KEY, WHEEL_ON_KEYBOARD_KEY } from '../../model/EditorWheelPreferences';
import { saveEditorWheelPreference } from '../../utils/EditorWheelPreferencesStore';
import { showToastSafely } from '../../utils/UiFeedback';
@Component
export struct EditorSettings {
  @Prop isDark: boolean = false;
  @StorageProp(WHEEL_ON_ENTRY_KEY) private onEntry: boolean = true;
  @StorageProp(WHEEL_ON_KEYBOARD_KEY) private onKeyboard: boolean = true;
  @State private saving: boolean = false;
  @State private revision: number = 0;
  private async change(key: string, value: boolean): Promise<void> {
    if (this.saving) return;
    this.saving = true;
    try { await saveEditorWheelPreference(key, value); }
    catch (_error) { showToastSafely(this.getUIContext(), { message: $r('app.string.editor_wheel_save_failed') }); }
    finally { this.saving = false; this.revision++; }
  }
  @Builder
  private rows() {
      ForEach([this.revision], (_revision: number) => {
        Column() {
          SettingsToggleRow({ title: $r('app.string.editor_wheel_on_entry'), hint: $r('app.string.editor_wheel_on_entry_hint'),
            isOn: this.onEntry, isDark: this.isDark, isInteractive: !this.saving,
            onChange: (value: boolean): void => { this.change(WHEEL_ON_ENTRY_KEY, value); } })
          SettingsToggleRow({ title: $r('app.string.editor_wheel_on_keyboard'), hint: $r('app.string.editor_wheel_on_keyboard_hint'),
            isOn: this.onKeyboard, isDark: this.isDark, isInteractive: !this.saving,
            onChange: (value: boolean): void => { this.change(WHEEL_ON_KEYBOARD_KEY, value); } })
        }.width('100%')
      }, (revision: number): string => String(revision))
  }
  build() {
    设置分组卡片({ groupId: 'editor_wheel', 是否深色: this.isDark, 内容: (): void => { this.rows(); } })
  }
}
