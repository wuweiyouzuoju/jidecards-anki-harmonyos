// SPDX-License-Identifier: AGPL-3.0-or-later
import { appearanceElementColor } from '../../utils/AppearanceElements';
import { FormRowLayout } from '../../utils/FormRowLayout';
import { settingsItemText } from '../../utils/SettingsStructureText';
import { PrimaryActionButton } from '../common/PrimaryActionButton';
import { FormInputStyle } from '../../utils/FormInputStyle';
import { FormSelectRow } from '../common/FormSelectRow';

import type { ProviderId } from '../../model/agent/AgentTypes';
import { pasteboard } from '@kit.BasicServicesKit';
import { resourceText } from '../../utils/UiFeedback';
import { agentSearchPurchaseUrl, AGENT_SEARCH_PROVIDERS } from '../../model/agent/AgentSearchProvider';
import type { AgentSearchProvider } from '../../model/agent/AgentSearchProvider';
import { loadAgentWebEnabled, loadAgentSearchProvider, saveAgentWebSettings } from '../../backend/agent/AgentSettingsStore';
import { common } from '@kit.AbilityKit';
import { DEEPSEEK_PROVIDER, OPENAI_PROVIDER } from '../../model/agent/ProviderCatalog';
import {
  AgentSettings,
  defaultAgentSettings,
  loadAgentSettings,
  saveAgentSettings
} from '../../backend/agent/AgentSettingsStore';
import { loadAgentSecret, saveAgentSecret, loadAgentSearchSecret, saveAgentSearchSecret } from '../../backend/agent/AgentSecretStore';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 设置面板色板_取 } from '../../utils/设置面板配色';
import { 颜色键 } from '../../model/颜色主题';
import { 设置分组卡片 } from './设置分组卡片';
import { AgentWebSettingsSection } from './AgentWebSettingsSection';
import { OfficialAISettings } from './OfficialAISettings';
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
  @StorageProp('appearance_elements_active') private appearanceElements: string = '';
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

  @State @Watch('publishState') private provider: ProviderId = 'official';
  @State @Watch('publishState') private deepseekModel: string = DEEPSEEK_PROVIDER.defaultModel;
  @State @Watch('publishState') private openaiModel: string = OPENAI_PROVIDER.defaultModel;
  @State @Watch('publishState') private customBaseUrl: string = '';
  @State @Watch('publishState') private customModel: string = '';
  @State @Watch('publishState') private customVisionEnabled: boolean = false;
  @State @Watch('publishState') private secret: string = '';
  @State @Watch('publishState') private saving: boolean = false;
  @State @Watch('publishState') private loading: boolean = true;
  @State @Watch('publishState') private ready: boolean = false;
  @State @Watch('publishState') private webEnabled: boolean = false;
  @State @Watch('publishState') private searchProvider: AgentSearchProvider = 'deepseek';
  @State @Watch('publishState') private searchSecret: string = '';
  @State private webMessage: string = '';
  private webBaseline: string = '';
  @State private message: string = '';
  @State private saveSucceeded: boolean = false;
  private disposed: boolean = false;
  private generation: number = 0;
  private baseline: string = '';
  private confirmingClose: boolean = false;
  @State private officialBusy: boolean = false;
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
      const webEnabled: boolean = await loadAgentWebEnabled();
      const searchProvider: AgentSearchProvider = await loadAgentSearchProvider();
      const searchSecret: string = searchProvider === 'deepseek' ? '' : await loadAgentSearchSecret(searchProvider);
      if (this.disposed || generation !== this.generation) return;
      this.webEnabled = webEnabled;
      this.searchProvider = searchProvider;
      this.searchSecret = searchSecret;
      this.webBaseline = this.webSnapshot();
      this.provider = settings.selectedProvider;
      this.deepseekModel = settings.deepseekModel;
      this.openaiModel = settings.openaiModel;
      this.customBaseUrl = settings.customBaseUrl;
      this.customModel = settings.customModel;
      this.customVisionEnabled = settings.customVisionEnabled === true;
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

  private async reloadOfficialSession(): Promise<void> {
    try {
      const secret: string = await loadAgentSecret('official');
      if (this.disposed || this.provider !== 'official') return;
      this.secret = secret;
      await this.onSaved();
    } catch (error) {
      if (!this.disposed) this.message = this.getString($r('app.string.official_ai_unavailable'));
    }
  }

  private formSnapshot(): string {
    return JSON.stringify([this.provider, this.deepseekModel, this.openaiModel, this.customBaseUrl.trim(),
      this.customModel.trim(), this.customVisionEnabled, this.provider === 'official' ? '' : this.secret.trim()]);
  }
  private webSnapshot(): string {
    return JSON.stringify([this.webEnabled, this.searchProvider, this.searchSecret.trim()]);
  }
  private webState(): AgentWebSettingsState {
    return { ready: this.ready, busy: this.loading || this.saving, dirty: this.ready && this.webSnapshot() !== this.webBaseline,
      webEnabled: this.webEnabled, searchProvider: this.searchProvider };
  }
  private hasChanges(): boolean {
    return this.ready && (this.formSnapshot() !== this.baseline ||
      (this.provider !== 'official' && this.webSnapshot() !== this.webBaseline));
  }
  private isBusy(): boolean { return this.loading || this.saving || this.confirmingClose || this.historyBusy || this.officialBusy; }
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
        { id: 'model', value: this.provider === 'official' ? DEEPSEEK_PROVIDER.defaultModel : this.provider === 'custom' ? this.customModel : this.provider === 'openai' ? this.openaiModel : this.deepseekModel },
        { id: 'custom_vision', value: String(this.customVisionEnabled) });
    }
    const web = this.webState();
    if (web.ready) {
      values.push({ id: 'web_enabled', value: String(web.webEnabled) },
        { id: 'search_provider', value: web.searchProvider });
    }
    appInterface.observe({ surface: 'agent_settings', sectionId: 'ai', selectedId: '', optionIds: [], optionLabels: [],
      optionsTotal: 0, busy: this.isBusy(), controlsComplete: true,
      items: agentSettingsControls({ provider: this.provider, ready: this.ready, busy: this.loading || this.saving || this.confirmingClose || this.historyBusy || this.officialBusy,
        web: web, historyReady: this.historyInfo !== null }),
      values: values });
  }
  private async requestClose(): Promise<void> {
    if (this.disposed || this.isBusy()) return;
    if (this.hasChanges()) {
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

  // 历史 OpenAI 配置保留；选择官方服务即时持久化，自带Key仍通过表单保存。
  private providerIndex(): number { return this.provider === 'official' ? 2 : this.provider === 'custom' ? 1 : 0; }
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
    const provider: ProviderId = index === 2 ? 'official' : index === 0 ? 'deepseek' : 'custom';
    if (provider === this.provider) return;
    const generation: number = ++this.generation;
    this.loading = true; this.publishState();
    try {
      const secret: string = await loadAgentSecret(provider);
      if (this.disposed || generation !== this.generation) return;
      if (provider === 'official') {
        const settings: AgentSettings = await loadAgentSettings(true);
        if (this.disposed || generation !== this.generation) return;
        settings.selectedProvider = 'official';
        await saveAgentSettings(settings);
      }
      if (this.disposed || generation !== this.generation) return;
      this.provider = provider;
      this.secret = secret;
      this.message = '';
      this.saveSucceeded = false;
      if (provider === 'official') {
        this.baseline = this.formSnapshot();
        await this.onSaved();
      }
    } catch (error) {
      if (!this.disposed && generation === this.generation) this.message = this.getString($r('app.string.ai_agent_settings_load_failed'));
    } finally {
      if (!this.disposed && generation === this.generation) { this.loading = false; this.publishState(); }
    }
  }
  private async switchSearchProvider(index: number): Promise<void> {
    if (!this.canEdit()) return;
    const provider: AgentSearchProvider | undefined = AGENT_SEARCH_PROVIDERS[index]?.id;
    if (provider === undefined || provider === this.searchProvider) return;
    const generation: number = ++this.generation;
    this.loading = true;
    this.webMessage = '';
    this.publishState();
    try {
      const secret: string = provider === 'deepseek' ? '' : await loadAgentSearchSecret(provider);
      if (this.disposed || generation !== this.generation) return;
      this.searchProvider = provider;
      this.searchSecret = secret;
    } catch (error) {
      if (!this.disposed && generation === this.generation) this.webMessage = this.getString($r('app.string.ai_web_load_failed'));
    } finally {
      if (!this.disposed && generation === this.generation) { this.loading = false; this.publishState(); }
    }
  }

  private async openPurchase(): Promise<void> {
    if (!this.canEdit()) { return; }
    const url: string = agentSearchPurchaseUrl(this.searchProvider);
    const generation: number = this.generation;
    try {
      const context: common.UIAbilityContext = this.getUIContext().getHostContext() as common.UIAbilityContext;
      await context.startAbility({ action: 'ohos.want.action.viewData', uri: url });
    } catch (error) {
      let message: Resource = $r('app.string.ai_web_open_failed');
      try {
        await pasteboard.getSystemPasteboard().setData(pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, url));
        message = $r('app.string.ai_web_link_copied');
      } catch (copyError) { /* The URL remains available in the error text. */ }
      if (!this.disposed && generation === this.generation) {
        this.webMessage = resourceText(this.getUIContext(), message, url);
      }
    }
  }

  private async save(): Promise<void> {
    if (!this.canEdit()) { return; }
    this.saveSucceeded = false;
    if (this.provider === 'custom' && (!this.customBaseUrl.trim().startsWith('https://') || this.customModel.trim() === '')) {
      this.message = this.getString($r('app.string.ai_agent_custom_invalid'));
      return;
    }
    const snapshot: string = this.formSnapshot();
    const webSnapshot: string = this.webSnapshot();
    const modelChanged: boolean = snapshot !== this.baseline;
    const webChanged: boolean = webSnapshot !== this.webBaseline;
    const provider: ProviderId = this.provider;
    const secret: string = this.secret;
    const webEnabled: boolean = this.webEnabled;
    const searchProvider: AgentSearchProvider = this.searchProvider;
    const searchSecret: string = this.searchSecret;
    const generation: number = this.generation;
    this.message = '';
    this.webMessage = '';
    this.saving = true; this.publishState();
    try {
      if (webEnabled && (webChanged || (modelChanged && provider === 'deepseek' && searchProvider === 'deepseek'))) {
        const key: string = searchProvider !== 'deepseek' ? searchSecret : provider === 'deepseek' ? secret :
          await loadAgentSearchSecret(searchProvider);
        if (this.disposed || generation !== this.generation) return;
        if (key.trim() === '') {
          this.message = this.getString($r('app.string.ai_web_key_required'));
          return;
        }
      }
      const settings: AgentSettings = defaultAgentSettings();
      settings.selectedProvider = this.provider;
      settings.deepseekModel = this.deepseekModel;
      settings.openaiModel = this.openaiModel;
      settings.customBaseUrl = this.customBaseUrl;
      settings.customModel = this.customModel;
      settings.customVisionEnabled = this.customVisionEnabled;
      if (modelChanged) {
        await saveAgentSettings(settings);
        if (provider !== 'official') await saveAgentSecret(provider, secret);
        if (!this.disposed && generation === this.generation) this.baseline = snapshot;
      }
      if (webChanged) {
        if (searchProvider !== 'deepseek') await saveAgentSearchSecret(searchSecret, searchProvider);
        await saveAgentWebSettings(searchProvider, webEnabled);
        if (!this.disposed && generation === this.generation) this.webBaseline = webSnapshot;
      }
      if (this.disposed || generation !== this.generation) return;
      await this.onSaved();
      if (!this.disposed && generation === this.generation) {
        this.message = this.getString($r('app.string.ai_agent_saved_securely'));
        this.saveSucceeded = true;
      }
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
          FormSelectRow({ label: settingsItemText(this.getUIContext(), 'ai_provider', this.uiLanguage), options: [{ value: this.getString($r('app.string.official_ai_self_key')) }, { value: this.getString($r('app.string.ai_agent_provider_custom')) }, { value: this.getString($r('app.string.official_ai_title')) }],
            selectedIndex: this.providerIndex(), value: this.provider === 'custom' ?
              this.getString($r('app.string.ai_agent_provider_custom')) : this.provider === 'official' ? this.getString($r('app.string.official_ai_title')) : this.getString($r('app.string.official_ai_self_key')),
            isInteractive: this.canEdit(), onSelect: (index: number): void => { this.switchProvider(index); } })
          if (this.provider !== 'official') {
          if (this.provider !== 'custom') {
            FormSelectRow({ label: settingsItemText(this.getUIContext(), 'ai_model', this.uiLanguage), options: this.modelOptions(), selectedIndex: this.modelIndex(), value: this.deepseekModel,
              isInteractive: this.canEdit(), onSelect: (index: number): void => { this.deepseekModel = DEEPSEEK_PROVIDER.models[index]; } })
          } else {
            TextInput({ placeholder: settingsItemText(this.getUIContext(), 'ai_custom_url', this.uiLanguage), text: this.customBaseUrl })
              .attributeModifier(new FormInputStyle( undefined, this.appearanceElements))
              .enabled(this.canEdit())
              .onChange((value: string): void => { this.customBaseUrl = value; })
            TextInput({ placeholder: settingsItemText(this.getUIContext(), 'ai_custom_model', this.uiLanguage), text: this.customModel })
              .attributeModifier(new FormInputStyle( undefined, this.appearanceElements))
              .enabled(this.canEdit())
              .onChange((value: string): void => { this.customModel = value; })
            SettingsToggleRow({ title: settingsItemText(this.getUIContext(), 'ai_vision', this.uiLanguage), hint: $r('app.string.ai_agent_custom_vision_hint'), isOn: this.customVisionEnabled,
              isInteractive: this.canEdit(), isDark: this.是否深色, tint: this.解析主色按钮背景(),
              onChange: (value: boolean): void => { this.customVisionEnabled = value; } })
          }
          TextInput({ placeholder: settingsItemText(this.getUIContext(), 'ai_key', this.uiLanguage), text: this.secret })
            .type(InputType.Password)
            .attributeModifier(new FormInputStyle( undefined, this.appearanceElements))
            .enabled(this.canEdit())
            .onChange((value: string): void => { this.secret = value; })
          }
          if (this.provider !== 'official') {
          AgentWebSettingsSection({ isDark: this.是否深色, tint: this.解析主色按钮背景(),
            interactive: this.canEdit(), webEnabled: this.webEnabled, searchProvider: this.searchProvider,
            secret: this.searchSecret, message: this.webMessage,
            onEnabledChange: (value: boolean): void => {
              if (this.canEdit()) { this.webEnabled = value; this.webMessage = ''; }
            },
            onProviderChange: (index: number): void => { this.switchSearchProvider(index); },
            onSecretChange: (value: string): void => { if (this.canEdit()) this.searchSecret = value; },
            onPurchase: (): void => { this.openPurchase(); } })
          }
          if (this.provider !== 'official') {
          PrimaryActionButton({ label: this.saving ? $r('app.string.ai_card_generating') : settingsItemText(this.getUIContext(), 'ai_save', this.uiLanguage),
            tint: this.解析主色按钮背景(), isInteractive: this.canEdit(),
            onAction: (): void => { this.save(); } })
          }
          if (this.message !== '' && (!this.saveSucceeded || !this.hasChanges())) { Text(this.message).fontSize(12).fontColor(appearanceElementColor(this.appearanceElements, 'text_secondary', $r('app.color.text_secondary'))) }
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
      if (this.provider === 'official') {
        OfficialAISettings({ isDark: this.是否深色, tint: this.解析主色按钮背景(), isCovered: this.isCovered,
          onSessionChanged: (): void => { this.reloadOfficialSession(); },
          onBusyChange: (busy: boolean): void => { this.officialBusy = busy; this.publishState(); } })
      }
      AgentHistorySettingsSection({ isDark: this.是否深色,
        isLocked: this.loading || this.saving || this.confirmingClose,
        onStateChange: (info: AgentHistoryInfo | null, busy: boolean): void => {
          this.historyInfo = info; this.historyBusy = busy; this.publishState();
        }, onRemoved: (id: string): void => { this.onHistoryRemoved(id); } })
    }.width('100%')
  }
}
