// SPDX-License-Identifier: AGPL-3.0-or-later
import { settingsItemText } from '../../utils/SettingsStructureText';
import { 颜色键 } from '../../model/颜色主题';
import { THEME_MOTION_KEY } from '../../model/ThemeCatalog';
import { saveThemeMotion } from '../../utils/RedemptionStore';
import { SettingsToggleRow } from '../common/SettingsToggleRow';

/** 关闭动画后继续保留静态幻彩，持久化失败可见。 */
@Component
export struct ThemeMotionControl {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop isDark: boolean = false;
  @StorageProp(THEME_MOTION_KEY) private motionEnabled: boolean = true;
  @StorageProp(颜色键.主色按钮背景) private actionColor: string = '#2F5FD0';
  @State private saving: boolean = false;
  @State private failed: boolean = false;

  private async save(value: boolean): Promise<void> {
    if (this.saving || value === this.motionEnabled) return;
    this.saving = true;
    this.failed = false;
    try { await saveThemeMotion(value); }
    catch (error) { this.failed = true; }
    finally { this.saving = false; }
  }

  build() {
    Column({ space: 6 }) {
      SettingsToggleRow({ title: settingsItemText(this.getUIContext(), 'theme_motion', this.uiLanguage), hint: $r('app.string.iridescent_motion_hint'), isOn: this.motionEnabled,
        isInteractive: !this.saving, tint: this.actionColor, isDark: this.isDark,
        onChange: (value: boolean): void => { this.save(value); } })
      if (this.failed) {
        Text($r('app.string.redemption_storage_failed')).fontSize(12).fontColor($r('app.color.error_text'))
      }
    }.width('100%')
  }
}
