// SPDX-License-Identifier: AGPL-3.0-or-later
import { FormRowLayout } from '../../utils/FormRowLayout';
import { settingsItemText } from '../../utils/SettingsStructureText';
import { SettingsToggleRow } from '../common/SettingsToggleRow';
import { showToastSafely, resourceText } from '../../utils/UiFeedback';
import { FormSelectRow } from '../common/FormSelectRow';
import { 当前语言模式, 语言模式, 设置语言模式 } from '../../model/语言存储';
import { APP_LOCALES, AppLocaleOption, appLocaleName, resolveAppLocale } from '../../model/AppLocales';
import { 保存显示今日进度卡, 主页今日进度卡AppStorage键 } from '../../model/主页偏好';
import { 颜色键 } from '../../model/颜色主题';
import { 设置分组卡片 } from './设置分组卡片';

/** 常规设置沿用原语言与首页偏好的保存协议。 */
@Component
export struct GeneralSettings {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop 是否深色: boolean = false;
  @StorageLink(主页今日进度卡AppStorage键) private 显示今日进度卡: boolean = true;
  @StorageProp(颜色键.主色按钮背景) private actionColor: string = '#2F5FD0';
  打开说明回调: (标题: Resource, 正文: Resource) => void = (_标题: Resource, _正文: Resource): void => {};

  private 取本地化文本(资源: Resource, _locale: string = this.uiLanguage): string {
    return resourceText(this.getUIContext(), 资源);
  }
  private 切换今日进度卡(开启: boolean): void {
    保存显示今日进度卡(开启).catch((): void => {
      showToastSafely(this.getUIContext(), { message: $r('app.string.settings_local_save_failed') });
    });
  }
  private 选择语言(模式: 语言模式): void {
    try {
      // 存储入口统一去重；读取与写入系统偏好失败都由此处提示。
      设置语言模式(模式);
    } catch (error) {
      showToastSafely(this.getUIContext(), { message: $r('app.string.settings_language_save_failed') });
    }
  }

  // ---- 语言 Select 选项 / 索引 ----
  private 语言选项(): SelectOption[] {
    return APP_LOCALES.map((option: AppLocaleOption): SelectOption => ({ value: option.nativeName }));
  }

  private 语言索引(): number {
    const locale: 语言模式 = this.显示语言();
    return APP_LOCALES.findIndex((option: AppLocaleOption): boolean => option.locale === locale);
  }

  private 显示语言(): 语言模式 {
    // 缓存键只通知重绘；重新打开时，索引和文字都以系统已保存的偏好为准。
    const fallback: 语言模式 = resolveAppLocale(this.uiLanguage);
    try { return 当前语言模式(); } catch (_) { return fallback; }
  }

  private 语言显示名(): string { return appLocaleName(this.显示语言()); }


  build() {
    设置分组卡片({ groupId: 'general_display', 是否深色: this.是否深色 }) {
      Column({ space: FormRowLayout.rowGap }) {
          FormSelectRow({ label: settingsItemText(this.getUIContext(), 'language', this.uiLanguage), options: this.语言选项(), selectedIndex: this.语言索引(),
            value: this.语言显示名(),
            onSelect: (索引: number): void => {
              if (索引 >= 0 && 索引 < APP_LOCALES.length) this.选择语言(APP_LOCALES[索引].locale);
            } })
          SettingsToggleRow({ title: settingsItemText(this.getUIContext(), 'home_today_summary', this.uiLanguage), isOn: this.显示今日进度卡, tint: this.actionColor, isDark: this.是否深色, showHelp: true,
              onHelp: (): void => {
                this.打开说明回调($r('app.string.settings_home_today_summary'), $r('app.string.settings_home_today_summary_hint'));
              },
              onChange: (值: boolean): void => {
                this.切换今日进度卡(值);
              }
          })
      }.width('100%')
    }
  }
}
