// SPDX-License-Identifier: AGPL-3.0-or-later

import type { ProviderId } from '../../model/agent/AgentTypes';
import { common } from '@kit.AbilityKit';
import { DEEPSEEK_PROVIDER, OPENAI_PROVIDER } from '../../model/agent/ProviderCatalog';
import {
  AgentSettings,
  defaultAgentSettings,
  loadAgentSettings,
  saveAgentSettings
} from '../../backend/agent/AgentSettingsStore';
import { loadAgentSecret, saveAgentSecret } from '../../backend/agent/AgentSecretStore';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 设置面板色板_取 } from '../../utils/设置面板配色';
import { 颜色键 } from '../../model/颜色主题';
import { 设置分组卡片 } from './设置分组卡片';

interface SelectItem { value: string; }

@Component
export struct AIAgent设置分组 {
  @Prop 是否深色: boolean = false;

  @State private provider: ProviderId = 'deepseek';
  @State private deepseekModel: string = DEEPSEEK_PROVIDER.defaultModel;
  @State private openaiModel: string = OPENAI_PROVIDER.defaultModel;
  @State private customBaseUrl: string = '';
  @State private customModel: string = '';
  @State private batchLimit: number = 100;
  @State private secret: string = '';
  @State private saving: boolean = false;
  @State private message: string = '';

  // 与 同步分组 登录按钮同款机制：@StorageLink 主色随颜色主题即时刷新，
  // @StorageProp('themeMode') 兜底 aurora 等深浅同色主题的切换重渲染。
  @StorageLink(颜色键.主色按钮背景) private 主色按钮背景链接: string = '';
  @StorageProp('themeMode') private 主题模式监听: string = 'system';

  /** 按钮背景专用主色（配 #FFFFFF 文字 ≥ 4.5:1）。与 同步分组.解析主色按钮背景 同款。 */
  private 解析主色按钮背景(): string {
    return this.主色按钮背景链接 !== '' ? this.主色按钮背景链接 : 设置面板色板_取(this.是否深色).主色按钮背景;
  }

  async aboutToAppear(): Promise<void> {
    const settings: AgentSettings = await loadAgentSettings();
    this.provider = settings.selectedProvider;
    this.deepseekModel = settings.deepseekModel;
    this.openaiModel = settings.openaiModel;
    this.customBaseUrl = settings.customBaseUrl;
    this.customModel = settings.customModel;
    this.batchLimit = settings.batchLimit;
    this.secret = await loadAgentSecret(this.provider);
  }

  private getString(resource: Resource): string {
    const context: common.UIAbilityContext | undefined =
      AppStorage.get<common.UIAbilityContext>('abilityContext');
    if (context === undefined) { return ''; }
    try { return context.resourceManager.getStringSync(resource.id); } catch (error) { return ''; }
  }

  // UI 隐藏 OpenAI 选项：下拉仅展示 DeepSeek / 自定义两档；历史存档为 openai 时按 DeepSeek 档显示。
  private providerIndex(): number { return this.provider === 'custom' ? 1 : 0; }
  private modelIndex(): number {
    const models: string[] = DEEPSEEK_PROVIDER.models;
    const index: number = models.indexOf(this.deepseekModel);
    return index < 0 ? 0 : index;
  }
  private modelOptions(): SelectItem[] {
    return DEEPSEEK_PROVIDER.models.map((value: string): SelectItem => ({ value: value }));
  }
  private async switchProvider(index: number): Promise<void> {
    this.provider = index === 0 ? 'deepseek' : 'custom';
    this.secret = await loadAgentSecret(this.provider);
    this.message = '';
  }
  private async save(): Promise<void> {
    if (this.saving) { return; }
    if (this.provider === 'custom' && (!this.customBaseUrl.trim().startsWith('https://') || this.customModel.trim() === '')) {
      this.message = this.getString($r('app.string.ai_agent_custom_invalid'));
      return;
    }
    this.saving = true;
    try {
      const settings: AgentSettings = defaultAgentSettings();
      settings.selectedProvider = this.provider;
      settings.deepseekModel = this.deepseekModel;
      settings.openaiModel = this.openaiModel;
      settings.customBaseUrl = this.customBaseUrl;
      settings.customModel = this.customModel;
      settings.batchLimit = this.batchLimit;
      await saveAgentSettings(settings);
      await saveAgentSecret(this.provider, this.secret);
      this.message = this.getString($r('app.string.ai_agent_saved_securely'));
    } catch (error) {
      this.message = this.getString($r('app.string.ai_card_save_failed'));
    }
    this.saving = false;
  }

  build() {
    设置分组卡片({
      标题: $r('app.string.ai_agent_settings_title'),
      是否深色: this.是否深色
    }) {
      Column({ space: 应用尺寸.间距_10 }) {
          Row() {
            Text($r('app.string.ai_agent_provider')).layoutWeight(1)
            Select([{ value: 'DeepSeek' },
              { value: this.getString($r('app.string.ai_agent_provider_custom')) }])
              .selected(this.providerIndex())
              .value(this.provider === 'custom' ?
                this.getString($r('app.string.ai_agent_provider_custom')) : 'DeepSeek')
              .controlSize(ControlSize.SMALL)
              .onSelect((index: number): void => { this.switchProvider(index); })
          }.width('100%')
          if (this.provider !== 'custom') {
            Row() {
              Text($r('app.string.ai_card_model')).layoutWeight(1)
              Select(this.modelOptions()).selected(this.modelIndex())
                .value(this.deepseekModel)
                .controlSize(ControlSize.SMALL)
                .onSelect((index: number): void => {
                  this.deepseekModel = DEEPSEEK_PROVIDER.models[index];
                })
            }.width('100%')
          } else {
            TextInput({ placeholder: $r('app.string.ai_agent_custom_url_hint'), text: this.customBaseUrl })
              .width('100%').height(应用尺寸.按钮高度)
              .fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_primary'))
              .placeholderColor($r('app.color.text_tertiary'))
              .backgroundColor($r('app.color.surface_card'))
              .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
              .borderRadius(应用尺寸.圆角_面板)
              .padding({ left: 应用尺寸.间距_10, right: 应用尺寸.间距_10 })
              .onChange((value: string): void => { this.customBaseUrl = value; })
            TextInput({ placeholder: $r('app.string.ai_card_model_hint'), text: this.customModel })
              .width('100%').height(应用尺寸.按钮高度)
              .fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_primary'))
              .placeholderColor($r('app.color.text_tertiary'))
              .backgroundColor($r('app.color.surface_card'))
              .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
              .borderRadius(应用尺寸.圆角_面板)
              .padding({ left: 应用尺寸.间距_10, right: 应用尺寸.间距_10 })
              .onChange((value: string): void => { this.customModel = value; })
          }
          TextInput({ placeholder: $r('app.string.ai_card_api_key'), text: this.secret })
            .type(InputType.Password)
            .width('100%').height(应用尺寸.按钮高度)
            .fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_primary'))
            .placeholderColor($r('app.color.text_tertiary'))
            .backgroundColor($r('app.color.surface_card'))
            .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
            .borderRadius(应用尺寸.圆角_面板)
            .padding({ left: 应用尺寸.间距_10, right: 应用尺寸.间距_10 })
            .onChange((value: string): void => { this.secret = value; })
          Row() {
            Text($r('app.string.ai_agent_batch_limit')).layoutWeight(1)
            Select([{ value: '100' }, { value: '250' }, { value: '500' }, { value: '1000' }])
              .selected(this.batchLimit === 100 ? 0 : (this.batchLimit === 250 ? 1 : (this.batchLimit === 500 ? 2 : 3)))
              .controlSize(ControlSize.SMALL)
              .onSelect((index: number): void => { this.batchLimit = [100, 250, 500, 1000][index]; })
          }.width('100%')
          // 按钮规格与 同步分组 AnkiWeb 登录按钮统一（44 高 / 15 号字 / 白字 / 圆角 22 / 忙态 0.6 透明度）。
          Button(this.saving ? $r('app.string.ai_card_generating') : $r('app.string.ai_card_save_config'))
            .width('100%')
            .height(44)
            .fontSize(15)
            .fontColor('#FFFFFF')
            .backgroundColor(this.解析主色按钮背景())
            .borderRadius(22)
            .enabled(!this.saving)
            .opacity(this.saving ? 0.6 : 1)
            .onClick((): void => { this.save(); })
          if (this.message !== '') { Text(this.message).fontSize(12).fontColor($r('app.color.text_secondary')) }
      }
      .padding({ bottom: 应用尺寸.间距_12 }).width('100%')
    }
  }
}
