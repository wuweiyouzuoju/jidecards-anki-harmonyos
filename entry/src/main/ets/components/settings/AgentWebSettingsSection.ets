// SPDX-License-Identifier: AGPL-3.0-or-later
import { settingsItemText } from '../../utils/SettingsStructureText';
import { PrimaryActionButton } from '../common/PrimaryActionButton';
import { SettingsToggleRow } from '../common/SettingsToggleRow';
import { FormInputStyle } from '../../utils/FormInputStyle';
import { FormSelectRow } from '../common/FormSelectRow';
import { LabeledActionRow } from '../common/LabeledActionRow';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { loadAgentWebEnabled, saveAgentWebEnabled, loadAgentSearchProvider, saveAgentSearchProvider } from '../../backend/agent/AgentSettingsStore';
import { loadAgentSearchSecret, saveAgentSearchSecret } from '../../backend/agent/AgentSecretStore';
import { localizedResourceText, resourceText } from '../../utils/UiFeedback';
import { agentSearchPurchaseUrl } from '../../model/agent/AgentSearchProvider';
import type { AgentSearchProvider } from '../../model/agent/AgentSearchProvider';
import { common } from '@kit.AbilityKit';
import { pasteboard } from '@kit.BasicServicesKit';

@Component
export struct AgentWebSettingsSection {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop isDark: boolean = false;
  @Prop tint: ResourceColor = $r('app.color.text_primary');
  @State private webEnabled: boolean = false;
  @State private secret: string = '';
  @State private searchProvider: AgentSearchProvider = 'doubao';
  @State private providerLoading: boolean = false;
  @State private ready: boolean = false;
  @State private saving: boolean = false;
  @State private message: string = '';
  private disposed: boolean = false;
  private generation: number = 0;

  async aboutToAppear(): Promise<void> {
    this.disposed = false;
    const generation: number = ++this.generation;
    try {
      const webEnabled: boolean = await loadAgentWebEnabled();
      const provider: AgentSearchProvider = await loadAgentSearchProvider();
      const secret: string = await loadAgentSearchSecret(provider);
      if (this.disposed || generation !== this.generation) { return; }
      this.webEnabled = webEnabled;
      this.secret = secret;
      this.searchProvider = provider;
      this.ready = true;
    } catch (error) {
      if (!this.disposed && generation === this.generation) {
        this.message = resourceText(this.getUIContext(), $r('app.string.ai_web_load_failed'));
      }
    }
  }
  aboutToDisappear(): void { this.disposed = true; this.generation++; }

  private changeEnabled(value: boolean): void {
    if (!this.ready || this.saving || this.providerLoading || this.disposed) { return; }
    this.webEnabled = value;
    this.message = '';
  }

  private providerLabel(_locale: string = this.uiLanguage): string {
    return this.searchProvider === 'doubao' ?
      resourceText(this.getUIContext(), $r('app.string.ai_web_provider_doubao')) : 'Brave Search';
  }

  private async switchProvider(index: number, _locale: string = this.uiLanguage): Promise<void> {
    if (!this.ready || this.saving || this.providerLoading || this.disposed) { return; }
    const provider: AgentSearchProvider = index === 1 ? 'brave' : 'doubao';
    if (provider === this.searchProvider) { return; }
    const generation: number = ++this.generation;
    this.searchProvider = provider;
    this.secret = '';
    this.message = '';
    this.providerLoading = true;
    try {
      const secret: string = await loadAgentSearchSecret(provider);
      if (!this.disposed && generation === this.generation) { this.secret = secret; }
    } catch (error) {
      if (!this.disposed && generation === this.generation) {
        this.message = resourceText(this.getUIContext(), $r('app.string.ai_web_load_failed'));
        this.ready = false;
      }
    } finally {
      if (!this.disposed && generation === this.generation) { this.providerLoading = false; }
    }
  }

  private async openPurchase(_locale: string = this.uiLanguage): Promise<void> {
    if (!this.ready || this.saving || this.providerLoading || this.disposed) { return; }
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
        this.message = resourceText(this.getUIContext(), message, url);
      }
    }
  }

  private async save(_locale: string = this.uiLanguage): Promise<void> {
    if (!this.ready || this.saving || this.providerLoading || this.disposed) { return; }
    if (this.webEnabled && this.secret.trim().length === 0) {
      this.message = resourceText(this.getUIContext(), $r('app.string.ai_web_key_required'));
      return;
    }
    const enabled: boolean = this.webEnabled;
    const secret: string = this.secret;
    const provider: AgentSearchProvider = this.searchProvider;
    const generation: number = this.generation;
    const success: string = resourceText(this.getUIContext(), $r('app.string.ai_agent_saved_securely'));
    const failure: string = resourceText(this.getUIContext(), $r('app.string.ai_card_save_failed'));
    this.saving = true;
    try {
      await saveAgentSearchSecret(secret, provider);
      await saveAgentSearchProvider(provider);
      await saveAgentWebEnabled(enabled);
      if (!this.disposed && generation === this.generation) { this.message = success; }
    } catch (error) {
      if (!this.disposed && generation === this.generation) { this.message = failure; }
    } finally {
      if (!this.disposed && generation === this.generation) { this.saving = false; }
    }
  }

  build() {
    Column({ space: 应用尺寸.间距_10 }) {
      SettingsToggleRow({ title: settingsItemText(this.getUIContext(), 'ai_web_enabled', this.uiLanguage), hint: $r('app.string.ai_web_hint'),
        isOn: this.webEnabled, isInteractive: this.ready && !this.saving && !this.providerLoading, isDark: this.isDark, tint: this.tint,
        onChange: (value: boolean): void => { this.changeEnabled(value); } })
      if (this.webEnabled) {
        FormSelectRow({ label: settingsItemText(this.getUIContext(), 'ai_web_provider', this.uiLanguage), options: [{ value: localizedResourceText(this.getUIContext(), this.uiLanguage, $r('app.string.ai_web_provider_doubao')) }, { value: 'Brave Search' }],
          selectedIndex: this.searchProvider === 'doubao' ? 0 : 1, value: this.providerLabel(),
          isInteractive: this.ready && !this.saving && !this.providerLoading,
          onSelect: (index: number): void => { this.switchProvider(index); } })
        LabeledActionRow({ label: this.searchProvider === 'doubao' ? $r('app.string.ai_web_doubao_hint') :
          $r('app.string.ai_web_purchase_hint'), actionLabel: settingsItemText(this.getUIContext(), 'ai_web_purchase', this.uiLanguage),
          tint: this.tint, textColor: $r('app.color.text_secondary'),
          isInteractive: this.ready && !this.saving && !this.providerLoading,
          onAction: (): void => { this.openPurchase(); } })
        TextInput({ placeholder: settingsItemText(this.getUIContext(), 'ai_web_key', this.uiLanguage), text: this.secret })
          .type(InputType.Password)
          .attributeModifier(new FormInputStyle())
          .enabled(this.ready && !this.saving && !this.providerLoading)
          .onChange((value: string): void => { this.secret = value; })
      }
      PrimaryActionButton({ label: this.saving ? $r('app.string.ai_card_generating') : settingsItemText(this.getUIContext(), 'ai_web_save', this.uiLanguage),
        tint: this.tint, isInteractive: this.ready && !this.saving && !this.providerLoading,
        onAction: (): void => { this.save(); } })
      if (this.message !== '') {
        Text(this.message).fontSize(12).fontColor($r('app.color.text_secondary')).width('100%')
      }
    }.width('100%').alignItems(HorizontalAlign.Start)
  }
}
