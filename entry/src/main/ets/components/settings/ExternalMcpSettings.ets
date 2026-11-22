// SPDX-License-Identifier: AGPL-3.0-or-later
import { pasteboard } from '@kit.BasicServicesKit';
import { externalMcpService, EXTERNAL_MCP_STATE_KEY } from '../../backend/external-agent/ExternalMcpService';
import { appInterface } from '../../backend/AppInterfaceService';
import { SettingsActionRow } from '../common/SettingsActionRow';
import { SettingsToggleRow } from '../common/SettingsToggleRow';
import { 颜色键 } from '../../model/颜色主题';
import { showToastSafely } from '../../utils/UiFeedback';
import { 设置分组卡片 } from './设置分组卡片';

@Component
export struct ExternalMcpSettings {
  @Prop isDark: boolean = false;
  onHelp: (title: Resource, body: Resource) => void = (_title: Resource, _body: Resource): void => {};
  @StorageProp(颜色键.主色按钮背景) private tint: string = '#2F5FD0';
  @StorageProp(EXTERNAL_MCP_STATE_KEY) @Watch('publish') private state: string = 'off';
  aboutToAppear(): void { this.publish(); }
  aboutToDisappear(): void { appInterface.leave('external_mcp_settings'); }
  private requestedOn(): boolean { return this.state === 'on' || this.state === 'disable_error'; }
  private publish(): void {
    appInterface.observe({ surface: 'external_mcp_settings', sectionId: '', selectedId: '',
      optionIds: [], optionLabels: [], busy: this.state === 'busy', controlsComplete: true,
      values: [{ id: 'state', value: this.state }], items: [
        { id: 'enable', title: '', titleKey: 'ai_agent_external_mcp', enabled: this.state !== 'busy', selected: this.requestedOn() },
        { id: 'copy', title: '', titleKey: 'ai_agent_external_copy', enabled: true, selected: false }
      ] });
  }
  private async copyConfig(): Promise<void> {
    if (this.state === 'busy') {
      showToastSafely(this.getUIContext(), { message: $r('app.string.common_loading') });
      return;
    }
    if (this.state === 'error' || this.state === 'disable_error') {
      showToastSafely(this.getUIContext(), { message: $r('app.string.ai_agent_external_failed') });
      return;
    }
    const config: string = externalMcpService.configuration();
    if (config === '') {
      showToastSafely(this.getUIContext(), { message: $r('app.string.ai_agent_external_copy_enable_first') });
      return;
    }
    try {
      await pasteboard.getSystemPasteboard().setData(pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, config));
      showToastSafely(this.getUIContext(), { message: $r('app.string.ai_agent_suggestion_copied') });
    } catch (_error) {
      showToastSafely(this.getUIContext(), { message: $r('app.string.redemption_copy_failed') });
    }
  }
  build() {
    设置分组卡片({ groupId: 'external_mcp', 是否深色: this.isDark }) {
      SettingsToggleRow({ title: $r('app.string.ai_agent_external_mcp'), isOn: this.requestedOn(), hint: $r('app.string.ai_agent_external_foreground_hint'),
        tint: this.tint, isDark: this.isDark, isInteractive: this.state !== 'busy', showHelp: true,
        onChange: (enabled: boolean): void => { externalMcpService.setEnabled(enabled); },
        onHelp: (): void => {
          this.onHelp($r('app.string.ai_agent_external_mcp'), $r('app.string.ai_agent_external_description'));
        } })
      SettingsActionRow({ title: $r('app.string.ai_agent_external_copy'), icon: $r('app.media.ic_study_link'),
        showDisclosure: false, onAction: (): void => { this.copyConfig(); } })
      if (this.state === 'error' || this.state === 'disable_error') { Text($r('app.string.ai_agent_external_failed')) }
    }
  }
}
