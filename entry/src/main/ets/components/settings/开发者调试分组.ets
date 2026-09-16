// SPDX-License-Identifier: AGPL-3.0-or-later
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
  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  @Prop 是否深色: boolean = false;
  @Prop 已展开: boolean = false;
  切换展开回调: () => void = (): void => {};
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
      标题: $r('app.string.settings_developer_debug_title'),
      是否深色: this.是否深色,
      是否展开: this.已展开,
      切换展开回调: this.切换展开回调
    }) {
      Column({ space: 应用尺寸.间距_10 }) {
        if (this.Agent入口已启用) {
          Text() { ThemeTextSpans($r('app.string.settings_developer_debug_enabled'), this.themeAccentColors, this.getUIContext()) }
            .width('100%')
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor(设置面板色板_取(this.是否深色).主色)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        } else {
          Text($r('app.string.settings_developer_debug_description'))
            .width('100%')
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor(设置面板色板_取(this.是否深色).次文字)
          Text() { ThemeTextSpans($r('app.string.settings_developer_debug_qq_hint'), this.themeAccentColors, this.getUIContext()) }
            .width('100%')
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor(设置面板色板_取(this.是否深色).主色)
          TextInput({
            placeholder: $r('app.string.settings_developer_debug_key_placeholder'),
            text: this.开发者密钥
          })
            .type(InputType.Password)
            .width('100%')
            .height(应用尺寸.按钮高度)
            .fontSize(应用尺寸.字号_正文)
            .fontColor($r('app.color.text_primary'))
            .placeholderColor($r('app.color.text_tertiary'))
            .backgroundColor($r('app.color.surface_card'))
            .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
            .borderRadius(应用尺寸.圆角_面板)
            .padding({ left: 应用尺寸.间距_10, right: 应用尺寸.间距_10 })
            .onChange((value: string): void => {
              this.开发者密钥 = value;
              this.显示错误 = false;
            })
          Button(this.正在启用 ? $r('app.string.settings_developer_debug_enabling') :
            $r('app.string.settings_developer_debug_enable'))
            .width('100%')
            .height(44)
            .fontSize(15)
            .fontColor('#FFFFFF')
            .backgroundColor(this.解析主色按钮背景())
            .borderRadius(22)
            .enabled(!this.正在启用 && this.开发者密钥.trim() !== '')
            .opacity(this.正在启用 || this.开发者密钥.trim() === '' ? 0.6 : 1)
            .onClick((): void => { this.启用开发者功能(); })
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
