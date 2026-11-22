// SPDX-License-Identifier: AGPL-3.0-or-later
import { appearanceElementColor, appearanceTextColor } from '../../utils/AppearanceElements';
import { FormRowLayout } from '../../utils/FormRowLayout';
import { settingsItemText } from '../../utils/SettingsStructureText';
import { SettingsToggleRow } from '../common/SettingsToggleRow';
import { FormInputStyle } from '../../utils/FormInputStyle';
import { FormSelectRow } from '../common/FormSelectRow';
import { LabeledActionRow } from '../common/LabeledActionRow';
import { localizedResourceText, resourceText } from '../../utils/UiFeedback';
import { AGENT_SEARCH_PROVIDERS } from '../../model/agent/AgentSearchProvider';
import type { AgentSearchProvider, AgentSearchProviderInfo } from '../../model/agent/AgentSearchProvider';

@Component
export struct AgentWebSettingsSection {
  @StorageProp('appearance_elements_active') private appearanceElements: string = '';
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop isDark: boolean = false;
  @Prop tint: ResourceColor = $r('app.color.text_primary');
  @Prop interactive: boolean = false;
  @Prop webEnabled: boolean = false;
  @Prop searchProvider: AgentSearchProvider = 'deepseek';
  @Prop secret: string = '';
  @Prop message: string = '';
  onEnabledChange: (value: boolean) => void = (_value: boolean): void => {};
  onProviderChange: (index: number) => void = (_index: number): void => {};
  onSecretChange: (value: string) => void = (_value: string): void => {};
  onPurchase: () => void = (): void => {};

  private providerLabel(_locale: string = this.uiLanguage): string {
    if (this.searchProvider === 'deepseek') return 'DeepSeek Search';
    return this.searchProvider === 'doubao' ?
      resourceText(this.getUIContext(), $r('app.string.ai_web_provider_doubao')) : 'Brave Search';
  }

  build() {
    Column({ space: FormRowLayout.rowGap }) {
      SettingsToggleRow({ title: settingsItemText(this.getUIContext(), 'ai_web_enabled', this.uiLanguage), hint: $r('app.string.ai_web_hint'),
        isOn: this.webEnabled, isInteractive: this.interactive, isDark: this.isDark, tint: appearanceTextColor(this.appearanceElements, this.tint),
        onChange: (value: boolean): void => { this.onEnabledChange(value); } })
      if (this.webEnabled) {
        FormSelectRow({ label: settingsItemText(this.getUIContext(), 'ai_web_provider', this.uiLanguage), options: AGENT_SEARCH_PROVIDERS.map((provider: AgentSearchProviderInfo): SelectOption =>
          ({ value: provider.id === 'doubao' ? localizedResourceText(this.getUIContext(), this.uiLanguage, $r('app.string.ai_web_provider_doubao')) : provider.name })),
          selectedIndex: AGENT_SEARCH_PROVIDERS.findIndex((provider: AgentSearchProviderInfo): boolean => provider.id === this.searchProvider), value: this.providerLabel(),
          isInteractive: this.interactive,
          onSelect: (index: number): void => { this.onProviderChange(index); } })
        LabeledActionRow({ label: this.searchProvider === 'deepseek' ? $r('app.string.ai_web_deepseek_hint') : this.searchProvider === 'doubao' ? $r('app.string.ai_web_doubao_hint') :
          $r('app.string.ai_web_purchase_hint'), actionLabel: settingsItemText(this.getUIContext(), 'ai_web_purchase', this.uiLanguage),
          tint: appearanceTextColor(this.appearanceElements, this.tint), textColor: appearanceElementColor(this.appearanceElements, 'text_secondary', $r('app.color.text_secondary')),
          isInteractive: this.interactive,
          onAction: (): void => { this.onPurchase(); } })
        if (this.searchProvider !== 'deepseek') {
          TextInput({ placeholder: settingsItemText(this.getUIContext(), 'ai_web_key', this.uiLanguage), text: this.secret })
          .type(InputType.Password)
          .attributeModifier(new FormInputStyle( undefined, this.appearanceElements))
          .enabled(this.interactive)
          .onChange((value: string): void => { this.onSecretChange(value); })
        }
      }
      if (this.message !== '') {
        Text(this.message).fontSize(12).fontColor(appearanceElementColor(this.appearanceElements, 'text_secondary', $r('app.color.text_secondary'))).width('100%')
      }
    }.width('100%').alignItems(HorizontalAlign.Start)
  }
}
