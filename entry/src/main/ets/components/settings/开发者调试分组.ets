// SPDX-License-Identifier: AGPL-3.0-or-later
import { settingsItemText } from '../../utils/SettingsStructureText';
import { PrimaryActionButton } from '../common/PrimaryActionButton';
import { FormInputStyle } from '../../utils/FormInputStyle';
import { ThemeTextSpans } from '../common/ThemeText';
import { THEME_TEXT_COLORS_KEY } from '../../model/ThemeCatalog';

import { 颜色键 } from '../../model/颜色主题';
import {
  AI_AGENT_CHANNELS_APP_STORAGE_KEY,
  enableAiAgentChannels
} from '../../model/ReleaseFeatures';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 设置面板色板_取 } from '../../utils/设置面板配色';
import { 设置分组卡片 } from './设置分组卡片';

@Component
export struct 开发者调试分组 {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  @Prop 是否深色: boolean = false;
  启用成功回调: () => void = (): void => {};

  @StorageLink(AI_AGENT_CHANNELS_APP_STORAGE_KEY) private Agent入口已启用: boolean = false;
  @StorageLink(颜色键.主色按钮背景) private 主色按钮背景链接: string = '';
  @State private 开发者密钥: string = '';
  @State private 正在启用: boolean = false;
  @State private 显示错误: boolean = false;
  @State private 错误文案: Resource = $r('app.string.settings_developer_debug_invalid');

  private 解析主色按钮背景(): string {
    return this.主色按钮背景链接 !== '' ? this.主色按钮背景链接 :
      设置面板色板_取(this.是否深色).主色按钮背景;
  }

  private async 启用开发者功能(): Promise<void> {
    if (this.正在启用 || this.Agent入口已启用) {
      return;
    }
    this.正在启用 = true;
    this.显示错误 = false;
    try {
      const enabled: boolean = await enableAiAgentChannels(this.开发者密钥);
      if (!enabled) {
        this.错误文案 = $r('app.string.settings_developer_debug_invalid');
        this.显示错误 = true;
        return;
      }
      this.开发者密钥 = '';
      this.启用成功回调();
    } catch (error) {
      this.错误文案 = $r('app.string.settings_developer_debug_failed');
      this.显示错误 = true;
    } finally {
      this.正在启用 = false;
    }
  }

  build() {
    设置分组卡片({
      groupId: 'advanced',
      是否深色: this.是否深色
    }) {
      Column({ space: 应用尺寸.间距_10 }) {
        if (this.Agent入口已启用) {
          Text() { ForEach([this.uiLanguage], (_locale: string) => { ThemeTextSpans(settingsItemText(this.getUIContext(), 'agent_enabled', this.uiLanguage), this.themeAccentColors, this.getUIContext()) }, (_locale: string): string => _locale) }
            .width('100%')
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor(设置面板色板_取(this.是否深色).主色)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        } else {
          Text(settingsItemText(this.getUIContext(), 'developer_description', this.uiLanguage))
            .width('100%')
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor(设置面板色板_取(this.是否深色).次文字)
          Text() { ForEach([this.uiLanguage], (_locale: string) => { ThemeTextSpans(settingsItemText(this.getUIContext(), 'developer_contact', this.uiLanguage), this.themeAccentColors, this.getUIContext()) }, (_locale: string): string => _locale) }
            .width('100%')
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor(设置面板色板_取(this.是否深色).主色)
          TextInput({
            placeholder: settingsItemText(this.getUIContext(), 'developer_key', this.uiLanguage),
            text: this.开发者密钥
          })
            .type(InputType.Password)
            .attributeModifier(new FormInputStyle())
            .onChange((value: string): void => {
              this.开发者密钥 = value;
              this.显示错误 = false;
            })
          PrimaryActionButton({ label: this.正在启用 ? $r('app.string.settings_developer_debug_enabling') :
            settingsItemText(this.getUIContext(), 'developer_enable', this.uiLanguage), tint: this.解析主色按钮背景(),
            isInteractive: !this.正在启用 && this.开发者密钥.trim() !== '',
            onAction: (): void => { this.启用开发者功能(); } })
        }
        if (this.显示错误) {
          Text(this.错误文案)
            .width('100%')
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor(设置面板色板_取(this.是否深色).错误色)
        }
      }
      .width('100%')
      .padding({ bottom: 应用尺寸.间距_12 })
    }
  }
}
