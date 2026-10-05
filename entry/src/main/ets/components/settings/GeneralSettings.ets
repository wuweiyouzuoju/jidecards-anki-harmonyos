// SPDX-License-Identifier: AGPL-3.0-or-later
import { settingsItemText } from '../../utils/SettingsStructureText';
import { SettingsToggleRow } from '../common/SettingsToggleRow';
import { showToastSafely, resourceText } from '../../utils/UiFeedback';
import { FormSelectRow } from '../common/FormSelectRow';
import { 当前语言模式, 语言模式, 设置语言模式 } from '../../model/语言存储';
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
  private 切换今日进度卡(开启: boolean): void { 保存显示今日进度卡(开启); }
  private 语言模式标签(模式: 语言模式): Resource {
    if (模式 === 'en') return $r('app.string.language_english');
    return $r('app.string.language_chinese');
  }

  private 选择语言(模式: 语言模式): void {
    // BUG-009 修复：onConfigurationUpdate 触发 UI 重建时，Select 重建会重新触发 onSelect，
    // 导致 选择语言 被循环调用（日志确认近 2 秒内被调用 30+ 次，每 ~60ms 一次）。
    // 去重检查：已是目标语言则直接 return，打断循环。
    const 切换前: 语言模式 = 当前语言模式();
    if (切换前 === 模式) {
      return;
    }
    try {
      设置语言模式(模式);
    } catch (error) {
      showToastSafely(this.getUIContext(), { message: $r('app.string.settings_language_save_failed') });
    }
  }

  // ---- 语言 Select 选项 / 索引 ----
  private 语言选项(): SelectOption[] {
    return [
      { value: this.取本地化文本($r('app.string.language_chinese')) },
      { value: this.取本地化文本($r('app.string.language_english')) }
    ];
  }

  private 语言索引(): number {
    return 当前语言模式() === 'en' ? 1 : 0;
  }


  build() {
    设置分组卡片({ groupId: 'general_display', 是否深色: this.是否深色 }) {
      Column({ space: 4 }) {
          FormSelectRow({ label: settingsItemText(this.getUIContext(), 'language', this.uiLanguage), options: this.语言选项(), selectedIndex: this.语言索引(),
            value: this.取本地化文本(this.语言模式标签(当前语言模式())),
            onSelect: (索引: number): void => {
              const 模式列表: 语言模式[] = ['zh-Hans', 'en'];
              this.选择语言(模式列表[索引]);
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
