// SPDX-License-Identifier: AGPL-3.0-or-later
import { settingsItemText } from '../../utils/SettingsStructureText';
import { PrimaryActionButton } from '../common/PrimaryActionButton';
import { FormInputStyle } from '../../utils/FormInputStyle';
import { SelectStyle } from '../../utils/SelectStyle';

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
import { AgentWebSettingsSection } from './AgentWebSettingsSection';
import { SettingsToggleRow } from '../common/SettingsToggleRow';

interface SelectItem { value: string; }

@Component
export struct AIAgent设置分组 {
  @Prop 是否深色: boolean = false;

  @State private provider: ProviderId = 'deepseek';
  @State private deepseekModel: string = DEEPSEEK_PROVIDER.defaultModel;
  @State private openaiModel: string = OPENAI_PROVIDER.defaultModel;
  @State private customBaseUrl: string = '';
  @State private customModel: string = '';
  @State private customVisionEnabled: boolean = false;
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
    this.customVisionEnabled = settings.customVisionEnabled === true;
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
      settings.customVisionEnabled = this.customVisionEnabled;
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
      groupId: 'ai',
      是否深色: this.是否深色
    }) {
      Column({ space: 应用尺寸.间距_10 }) {
          Row() {
            Text(settingsItemText(this.getUIContext(), 'ai_provider')).layoutWeight(1)
            Select([{ value: 'DeepSeek' },
              { value: this.getString($r('app.string.ai_agent_provider_custom')) }])
              .selected(this.providerIndex())
              .value(this.provider === 'custom' ?
                this.getString($r('app.string.ai_agent_provider_custom')) : 'DeepSeek')
              .attributeModifier(new SelectStyle())
              .height(SelectStyle.controlHeight)
              .padding(SelectStyle.controlPadding)
              .space(SelectStyle.controlSpace)
              .width(SelectStyle.fieldWidth)
              .constraintSize(SelectStyle.fieldConstraint).flexShrink(0)
              .font(SelectStyle.controlFont)
              .optionFont(SelectStyle.optionFont)
              .selectedOptionFont(SelectStyle.selectedOptionFont)
              .textModifier(SelectStyle.labelText())
              .borderRadius(SelectStyle.controlRadius)
              .onSelect((index: number): void => { this.switchProvider(index); })
          }.width('100%')
          if (this.provider !== 'custom') {
            Row() {
              Text(settingsItemText(this.getUIContext(), 'ai_model')).layoutWeight(1)
              Select(this.modelOptions()).selected(this.modelIndex())
                .value(this.deepseekModel)
                .attributeModifier(new SelectStyle())
                .height(SelectStyle.controlHeight)
                .padding(SelectStyle.controlPadding)
                .space(SelectStyle.controlSpace)
                .width(SelectStyle.fieldWidth)
                .constraintSize(SelectStyle.fieldConstraint).flexShrink(0)
                .font(SelectStyle.controlFont)
                .optionFont(SelectStyle.optionFont)
                .selectedOptionFont(SelectStyle.selectedOptionFont)
                .textModifier(SelectStyle.labelText())
                .borderRadius(SelectStyle.controlRadius)
                .onSelect((index: number): void => {
                  this.deepseekModel = DEEPSEEK_PROVIDER.models[index];
                })
            }.width('100%')
          } else {
            TextInput({ placeholder: settingsItemText(this.getUIContext(), 'ai_custom_url'), text: this.customBaseUrl })
              .attributeModifier(new FormInputStyle())
              .onChange((value: string): void => { this.customBaseUrl = value; })
            TextInput({ placeholder: settingsItemText(this.getUIContext(), 'ai_custom_model'), text: this.customModel })
              .attributeModifier(new FormInputStyle())
              .onChange((value: string): void => { this.customModel = value; })
            SettingsToggleRow({ title: settingsItemText(this.getUIContext(), 'ai_vision'),
              hint: $r('app.string.ai_agent_custom_vision_hint'), isOn: this.customVisionEnabled,
              isInteractive: !this.saving, isDark: this.是否深色, tint: this.解析主色按钮背景(),
              onChange: (value: boolean): void => { this.customVisionEnabled = value; } })
          }
          TextInput({ placeholder: settingsItemText(this.getUIContext(), 'ai_key'), text: this.secret })
            .type(InputType.Password)
            .attributeModifier(new FormInputStyle())
            .onChange((value: string): void => { this.secret = value; })
          Row() {
            Text(settingsItemText(this.getUIContext(), 'ai_batch_limit')).layoutWeight(1)
            Select([{ value: '100' }, { value: '250' }, { value: '500' }, { value: '1000' }])
              .selected(this.batchLimit === 100 ? 0 : (this.batchLimit === 250 ? 1 : (this.batchLimit === 500 ? 2 : 3)))
              .value(this.batchLimit.toString())
              .attributeModifier(new SelectStyle())
              .height(SelectStyle.controlHeight)
              .padding(SelectStyle.controlPadding)
              .space(SelectStyle.controlSpace)
              .width(SelectStyle.fieldWidth)
              .constraintSize(SelectStyle.fieldConstraint).flexShrink(0)
              .font(SelectStyle.controlFont)
              .optionFont(SelectStyle.optionFont)
              .selectedOptionFont(SelectStyle.selectedOptionFont)
              .textModifier(SelectStyle.labelText())
              .borderRadius(SelectStyle.controlRadius)
              .onSelect((index: number): void => { this.batchLimit = [100, 250, 500, 1000][index]; })
          }.width('100%')
          PrimaryActionButton({ label: this.saving ? $r('app.string.ai_card_generating') : settingsItemText(this.getUIContext(), 'ai_save'),
            tint: this.解析主色按钮背景(), isInteractive: !this.saving,
            onAction: (): void => { this.save(); } })
          if (this.message !== '') { Text(this.message).fontSize(12).fontColor($r('app.color.text_secondary')) }
          AgentWebSettingsSection({ isDark: this.是否深色, tint: this.解析主色按钮背景() })
      }
      .padding({ bottom: 应用尺寸.间距_12 }).width('100%')
    }
  }
}
