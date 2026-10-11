// SPDX-License-Identifier: AGPL-3.0-or-later
import { FormRowLayout } from '../../utils/FormRowLayout';
import { settingsItemText } from '../../utils/SettingsStructureText';
import { PrimaryActionButton } from '../common/PrimaryActionButton';
import { FormInputStyle } from '../../utils/FormInputStyle';
import { FormSelectRow } from '../common/FormSelectRow';

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
import { AgentHistorySettingsSection } from './AgentHistorySettingsSection';
import { AgentHistoryInfo } from '../../model/agent/AgentHistoryRepository';
import { SettingsToggleRow } from '../common/SettingsToggleRow';
import { SettingsActionRow } from '../common/SettingsActionRow';
import { interfaceItemText } from '../../utils/AppInterfaceText';
import { appInterface } from '../../backend/AppInterfaceService';
import { agentSettingsControls, AgentWebSettingsState, AppInterfaceValue } from '../../model/AppInterface';
import { PAGE_COMPACT_LAYOUT_KEY } from '../../model/AppLayoutState';

interface SelectItem { value: string; }

@Component
export struct AIAgent设置分组 {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @StorageProp(PAGE_COMPACT_LAYOUT_KEY) private narrowDeckLayout: boolean = false;
  @Prop 是否深色: boolean = false;
  @Prop @Watch('publishState') showMemoryEntry: boolean = false;
  @Prop @Watch('publishState') isCovered: boolean = false;
  @Prop @Watch('requestClose') closeRequest: number = 0;
  onMemory: () => void = (): void => {};
  onHistoryRemoved: (id: string) => void = (): void => {};
  onClose: () => void = (): void => {};
  onSaved: () => Promise<void> = async (): Promise<void> => {};
  onBusyChange: (busy: boolean) => void = (_busy: boolean): void => {};

  @State @Watch('publishState') private provider: ProviderId = 'deepseek';
  @State @Watch('publishState') private deepseekModel: string = DEEPSEEK_PROVIDER.defaultModel;
  @State @Watch('publishState') private openaiModel: string = OPENAI_PROVIDER.defaultModel;
  @State @Watch('publishState') private customBaseUrl: string = '';
  @State @Watch('publishState') private customModel: string = '';
  @State @Watch('publishState') private customVisionEnabled: boolean = false;
  @State @Watch('publishState') private batchLimit: number = 100;
  @State @Watch('publishState') private secret: string = '';
  @State @Watch('publishState') private saving: boolean = false;
  @State @Watch('publishState') private loading: boolean = true;
  @State @Watch('publishState') private ready: boolean = false;
  @State @Watch('publishState') private webState: AgentWebSettingsState =
    { ready: false, busy: true, dirty: false, webEnabled: false, searchProvider: 'doubao' };
  @State private message: string = '';
  private disposed: boolean = false;
  private generation: number = 0;
  private baseline: string = '';
  private confirmingClose: boolean = false;
  @State private historyBusy: boolean = false;
  private historyInfo: AgentHistoryInfo | null = null;

  // 与 同步分组 登录按钮同款机制：@StorageLink 主色随颜色主题即时刷新，
  // @StorageProp('themeMode') 兜底 aurora 等深浅同色主题的切换重渲染。
  @StorageLink(颜色键.主色按钮背景) private 主色按钮背景链接: string = '';
  @StorageProp('themeMode') private 主题模式监听: string = 'system';

  /** 按钮背景专用主色（配 #FFFFFF 文字 ≥ 4.5:1）。与 同步分组.解析主色按钮背景 同款。 */
  private 解析主色按钮背景(): string {
    return this.主色按钮背景链接 !== '' ? this.主色按钮背景链接 : 设置面板色板_取(this.是否深色).主色按钮背景;
  }

  async aboutToAppear(): Promise<void> {
    this.disposed = false;
    const generation: number = ++this.generation;
    this.publishState();
    try {
      const settings: AgentSettings = await loadAgentSettings(true);
      const secret: string = await loadAgentSecret(settings.selectedProvider);
      if (this.disposed || generation !== this.generation) return;
      this.provider = settings.selectedProvider;
      this.deepseekModel = settings.deepseekModel;
      this.openaiModel = settings.openaiModel;
      this.customBaseUrl = settings.customBaseUrl;
      this.customModel = settings.customModel;
      this.customVisionEnabled = settings.customVisionEnabled === true;
      this.batchLimit = settings.batchLimit;
      this.secret = secret;
      this.baseline = this.formSnapshot();
      this.ready = true;
    } catch (error) {
      if (!this.disposed && generation === this.generation) this.message = this.getString($r('app.string.ai_agent_settings_load_failed'));
    } finally {
      if (!this.disposed && generation === this.generation) { this.loading = false; this.publishState(); }
    }
  }

  aboutToDisappear(): void {
    this.disposed = true; this.generation++;
    if (this.showMemoryEntry) appInterface.leave('agent_settings');
  }

  private formSnapshot(): string {
    return JSON.stringify([this.provider, this.deepseekModel, this.openaiModel, this.customBaseUrl,
      this.customModel, this.customVisionEnabled, this.batchLimit, this.secret]);
  }
  private isBusy(): boolean { return this.loading || this.saving || this.webState.busy || this.confirmingClose || this.historyBusy; }
  private canEdit(): boolean { return this.ready && !this.isBusy() && !this.disposed; }
  private publishState(): void {
    if (this.disposed) return;
    this.onBusyChange(this.isBusy());
    if (!this.showMemoryEntry) return;
    if (this.isCovered) { appInterface.leave('agent_settings'); return; }
    const values: AppInterfaceValue[] = [{ id: 'settings_ready', value: String(this.ready) }];
    if (this.historyInfo !== null) values.push({ id: 'history_limit', value: String(this.historyInfo.limit) },
      { id: 'history_count', value: String(this.historyInfo.count) }, { id: 'history_stored_bytes', value: String(this.historyInfo.storedBytes) });
    if (this.ready) {
      values.push({ id: 'provider', value: this.provider },
        { id: 'model', value: this.provider === 'custom' ? this.customModel : this.provider === 'openai' ? this.openaiModel : this.deepseekModel },
        { id: 'batch_limit', value: String(this.batchLimit) }, { id: 'custom_vision', value: String(this.customVisionEnabled) });
    }
    if (this.webState.ready) {
      values.push({ id: 'web_enabled', value: String(this.webState.webEnabled) },
        { id: 'search_provider', value: this.webState.searchProvider });
    }
    appInterface.observe({ surface: 'agent_settings', sectionId: 'ai', selectedId: '', optionIds: [], optionLabels: [],
      optionsTotal: 0, busy: this.isBusy(), controlsComplete: true,
      items: agentSettingsControls({ provider: this.provider, ready: this.ready, busy: this.loading || this.saving || this.confirmingClose || this.historyBusy,
        web: this.webState, historyReady: this.historyInfo !== null }),
      values: values });
  }
  private updateWebState(state: AgentWebSettingsState): void { this.webState = state; this.publishState(); }
  private async requestClose(): Promise<void> {
    if (this.disposed || this.isBusy()) return;
    if ((this.ready && this.formSnapshot() !== this.baseline) || this.webState.dirty) {
      this.confirmingClose = true; this.publishState();
      const generation: number = this.generation;
      let discard: boolean = false;
      try {
        const result = await this.getUIContext().getPromptAction().showDialog({
          title: this.getString($r('app.string.note_editor_discard_title')),
          message: this.getString($r('app.string.ai_agent_settings_discard_message')),
          buttons: [{ text: this.getString($r('app.string.create_deck_cancel')), color: '#666666' },
            { text: this.getString($r('app.string.note_editor_discard')), color: '#D34D4D' }] });
        discard = result.index === 1;
      } catch (error) { discard = false; }
      finally { this.confirmingClose = false; this.publishState(); }
      if (!discard || this.disposed || generation !== this.generation) return;
    }
    this.onClose();
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
    if (!this.canEdit()) return;
    const provider: ProviderId = index === 0 ? 'deepseek' : 'custom';
    if (provider === this.provider) return;
    const generation: number = ++this.generation;
    this.loading = true; this.publishState();
    try {
      const secret: string = await loadAgentSecret(provider);
      if (this.disposed || generation !== this.generation) return;
      this.provider = provider;
      this.secret = secret;
      this.message = '';
    } catch (error) {
      if (!this.disposed && generation === this.generation) this.message = this.getString($r('app.string.ai_agent_settings_load_failed'));
    } finally {
      if (!this.disposed && generation === this.generation) { this.loading = false; this.publishState(); }
    }
  }
  private async save(): Promise<void> {
    if (!this.canEdit()) { return; }
    if (this.provider === 'custom' && (!this.customBaseUrl.trim().startsWith('https://') || this.customModel.trim() === '')) {
      this.message = this.getString($r('app.string.ai_agent_custom_invalid'));
      return;
    }
    const snapshot: string = this.formSnapshot();
    const provider: ProviderId = this.provider;
    const secret: string = this.secret;
    const generation: number = this.generation;
    this.saving = true; this.publishState();
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
      await saveAgentSecret(provider, secret);
      if (this.disposed || generation !== this.generation) return;
      this.baseline = snapshot;
      await this.onSaved();
      if (!this.disposed && generation === this.generation) this.message = this.getString($r('app.string.ai_agent_saved_securely'));
    } catch (error) {
      if (!this.disposed && generation === this.generation) this.message = this.getString($r('app.string.ai_card_save_failed'));
    } finally {
      if (!this.disposed && generation === this.generation) { this.saving = false; this.publishState(); }
    }
  }

  @Builder
  private providerSettings() {
    设置分组卡片({
      groupId: 'ai',
      是否深色: this.是否深色
    }) {
      Column({ space: FormRowLayout.rowGap }) {
          FormSelectRow({ label: settingsItemText(this.getUIContext(), 'ai_provider', this.uiLanguage), options: [{ value: 'DeepSeek' }, { value: this.getString($r('app.string.ai_agent_provider_custom')) }],
            selectedIndex: this.providerIndex(), value: this.provider === 'custom' ?
              this.getString($r('app.string.ai_agent_provider_custom')) : 'DeepSeek',
            isInteractive: this.canEdit(), onSelect: (index: number): void => { this.switchProvider(index); } })
          if (this.provider !== 'custom') {
            FormSelectRow({ label: settingsItemText(this.getUIContext(), 'ai_model', this.uiLanguage), options: this.modelOptions(), selectedIndex: this.modelIndex(), value: this.deepseekModel,
              isInteractive: this.canEdit(), onSelect: (index: number): void => { this.deepseekModel = DEEPSEEK_PROVIDER.models[index]; } })
          } else {
            TextInput({ placeholder: settingsItemText(this.getUIContext(), 'ai_custom_url', this.uiLanguage), text: this.customBaseUrl })
              .attributeModifier(new FormInputStyle())
              .enabled(this.canEdit())
              .onChange((value: string): void => { this.customBaseUrl = value; })
            TextInput({ placeholder: settingsItemText(this.getUIContext(), 'ai_custom_model', this.uiLanguage), text: this.customModel })
              .attributeModifier(new FormInputStyle())
              .enabled(this.canEdit())
              .onChange((value: string): void => { this.customModel = value; })
            SettingsToggleRow({ title: settingsItemText(this.getUIContext(), 'ai_vision', this.uiLanguage), hint: $r('app.string.ai_agent_custom_vision_hint'), isOn: this.customVisionEnabled,
              isInteractive: this.canEdit(), isDark: this.是否深色, tint: this.解析主色按钮背景(),
              onChange: (value: boolean): void => { this.customVisionEnabled = value; } })
          }
          TextInput({ placeholder: settingsItemText(this.getUIContext(), 'ai_key', this.uiLanguage), text: this.secret })
            .type(InputType.Password)
            .attributeModifier(new FormInputStyle())
            .enabled(this.canEdit())
            .onChange((value: string): void => { this.secret = value; })
          FormSelectRow({ label: settingsItemText(this.getUIContext(), 'ai_batch_limit', this.uiLanguage), options: [{ value: '100' }, { value: '250' }, { value: '500' }, { value: '1000' }],
            selectedIndex: this.batchLimit === 100 ? 0 : (this.batchLimit === 250 ? 1 : (this.batchLimit === 500 ? 2 : 3)),
            value: this.batchLimit.toString(),
            isInteractive: this.canEdit(),
            onSelect: (index: number): void => { this.batchLimit = [100, 250, 500, 1000][index]; } })
          PrimaryActionButton({ label: this.saving ? $r('app.string.ai_card_generating') : settingsItemText(this.getUIContext(), 'ai_save', this.uiLanguage),
            tint: this.解析主色按钮背景(), isInteractive: this.canEdit(),
            onAction: (): void => { this.save(); } })
          if (this.message !== '') { Text(this.message).fontSize(12).fontColor($r('app.color.text_secondary')) }
          AgentWebSettingsSection({ isDark: this.是否深色, tint: this.解析主色按钮背景(),
            isLocked: this.loading || this.saving || this.confirmingClose,
            onStateChange: (state: AgentWebSettingsState): void => { this.updateWebState(state); },
            onSaved: (): Promise<void> => this.onSaved() })
      }
      .padding({ bottom: 应用尺寸.间距_12 }).width('100%')
    }
  }

  build() {
    Column({ space: 应用尺寸.页面分组间距(this.narrowDeckLayout) }) {
      if (this.showMemoryEntry) {
        设置分组卡片({ 是否深色: this.是否深色, showHeader: false }) {
          SettingsActionRow({ title: interfaceItemText(this.getUIContext(), 'agent_settings', 'memory', this.uiLanguage),
            icon: $r('app.media.ic_agent_memory'), isInteractive: !this.isBusy(),
            onAction: (): void => { if (!this.isBusy()) this.onMemory(); } })
        }
      }
      this.providerSettings()
      AgentHistorySettingsSection({ isDark: this.是否深色,
        isLocked: this.loading || this.saving || this.webState.busy || this.confirmingClose,
        onStateChange: (info: AgentHistoryInfo | null, busy: boolean): void => {
          this.historyInfo = info; this.historyBusy = busy; this.publishState();
        }, onRemoved: (id: string): void => { this.onHistoryRemoved(id); } })
    }.width('100%')
  }
}
