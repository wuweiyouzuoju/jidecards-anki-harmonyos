// SPDX-License-Identifier: AGPL-3.0-or-later
import { agentHistoryRepository } from '../../backend/agent/AgentHistoryFiles';
import { AgentHistoryInfo, AGENT_HISTORY_DEFAULT_LIMIT, AGENT_HISTORY_LIMITS } from '../../model/agent/AgentHistoryRepository';
import { AgentConversationSummary } from '../../model/agent/AgentConversationTypes';
import { AgentHistoryList } from '../agent/AgentHistoryList';
import { FormSelectRow } from '../common/FormSelectRow';
import { SettingsActionRow } from '../common/SettingsActionRow';
import { 设置分组卡片 } from './设置分组卡片';
import { localizedResourceText } from '../../utils/UiFeedback';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { FormRowLayout } from '../../utils/FormRowLayout';
import { settingsItemText } from '../../utils/SettingsStructureText';

interface HistoryLimitOption { value: string; }

@Component
export struct AgentHistorySettingsSection {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop isDark: boolean = false;
  @Prop isLocked: boolean = false;
  onStateChange: (info: AgentHistoryInfo | null, busy: boolean) => void = (): void => {};
  onRemoved: (id: string) => void = (): void => {};
  @State private limit: number = AGENT_HISTORY_DEFAULT_LIMIT;
  @State private count: number = 0;
  @State private storedBytes: number = 0;
  @State private ready: boolean = false;
  @State private busy: boolean = false;
  @State private management: boolean = false;
  @State private conversations: AgentConversationSummary[] = [];
  @State private message: string = '';
  private alive: boolean = false;
  private generation: number = 0;
  private info: AgentHistoryInfo | null = null;
  aboutToAppear(): void { this.alive = true; this.reload(); }
  aboutToDisappear(): void { this.alive = false; this.generation++; }
  private text(resource: Resource, ...args: string[]): string {
    return localizedResourceText(this.getUIContext(), this.uiLanguage, resource, ...args);
  }
  private canEdit(): boolean { return this.alive && this.ready && !this.busy && !this.isLocked; }
  private publish(): void { if (this.alive) this.onStateChange(this.info, this.busy); }
  private async reload(): Promise<void> {
    const generation: number = ++this.generation;
    this.busy = true; this.publish();
    try {
      const repository = agentHistoryRepository();
      const info: AgentHistoryInfo = await repository.info();
      const list: AgentConversationSummary[] = this.management ? await repository.list() : [];
      if (!this.alive || generation !== this.generation) return;
      this.info = info; this.limit = info.limit; this.count = info.count; this.storedBytes = info.storedBytes;
      this.conversations = list; this.ready = true; this.message = '';
    } catch (error) {
      if (this.alive && generation === this.generation) this.message = this.text($r('app.string.ai_agent_history_load_failed'));
    } finally { if (this.alive && generation === this.generation) { this.busy = false; this.publish(); } }
  }
  private async confirm(message: string): Promise<boolean> {
    try {
      const result = await this.getUIContext().getPromptAction().showDialog({
        title: this.text($r('app.string.agent_history_manage')), message: message,
        buttons: [{ text: this.text($r('app.string.cancel')), color: '#666666' },
          { text: this.text($r('app.string.settings_confirm')), color: '#D34D4D' }] });
      return this.alive && result.index === 1;
    } catch (error) { return false; }
  }
  private async change(kind: string, value: number = 0, id: string = ''): Promise<void> {
    if (!this.canEdit() || (kind === 'limit' && value === this.limit)) return;
    this.busy = true; this.message = ''; this.publish();
    const generation: number = this.generation;
    try {
      const repository = agentHistoryRepository();
      const current: AgentHistoryInfo = await repository.info();
      const previous: AgentConversationSummary[] = kind === 'limit' && value < current.count ? await repository.list() : [];
      if (!this.alive || generation !== this.generation) return;
      const needsConfirmation: boolean = kind !== 'limit' || value < current.count;
      if (needsConfirmation && !await this.confirm(this.text(kind === 'clear' ? $r('app.string.agent_history_clear_confirm') :
        kind === 'delete' ? $r('app.string.ai_agent_history_delete_body') : $r('app.string.agent_history_reduce_confirm'), String(value)))) return;
      if (!this.alive || generation !== this.generation) return;
      // 确认后进入仓库队列的写入不随组件销毁取消。
      if (kind === 'limit') await repository.setLimit(value, needsConfirmation ? current.revision : '');
      else if (kind === 'clear') await repository.clear(current.revision);
      else await repository.remove(id, current.revision);
      if (!this.alive || generation !== this.generation) return;
      if (kind === 'limit' && previous.length > 0) {
        const retained: AgentConversationSummary[] = await repository.list();
        if (!this.alive || generation !== this.generation) return;
        for (const item of previous) {
          if (!retained.some((entry: AgentConversationSummary): boolean => entry.id === item.id)) this.onRemoved(item.id);
        }
      }
      if (kind === 'clear' || kind === 'delete') this.onRemoved(kind === 'clear' ? '' : id);
      await this.reload();
    } catch (error) {
      if (this.alive && generation === this.generation) this.message = this.text($r('app.string.ai_agent_history_delete_failed'));
    } finally { if (this.alive) { this.busy = false; this.publish(); } }
  }
  private manage(): void {
    if (!this.canEdit()) return;
    this.management = !this.management;
    this.reload();
  }
  build() {
    设置分组卡片({ 是否深色: this.isDark, showHeader: false }) {
      Column({ space: FormRowLayout.rowGap }) {
        Text($r('app.string.agent_history_manage')).fontSize(应用尺寸.字号_正文).fontWeight(FontWeight.Medium)
          .fontColor($r('app.color.text_primary')).width('100%')
        FormSelectRow({ label: settingsItemText(this.getUIContext(), 'history_limit', this.uiLanguage),
          options: AGENT_HISTORY_LIMITS.map((value: number): HistoryLimitOption => ({ value: String(value) })),
          selectedIndex: AGENT_HISTORY_LIMITS.indexOf(this.limit), value: String(this.limit), isInteractive: this.canEdit(),
          onSelect: (index: number): void => { if (index >= 0 && index < AGENT_HISTORY_LIMITS.length) this.change('limit', AGENT_HISTORY_LIMITS[index]); } })
        Text($r('app.string.agent_history_retention_hint')).fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_secondary')).width('100%')
        if (this.ready) {
          Text(this.text($r('app.string.agent_history_usage'), String(this.count), (this.storedBytes / 1024 / 1024).toFixed(2)))
            .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary')).width('100%')
        }
        SettingsActionRow({ title: settingsItemText(this.getUIContext(), 'history_manage', this.uiLanguage), icon: $r('app.media.ic_common_history'),
          isInteractive: this.canEdit(), onAction: (): void => { this.manage(); } })
        SettingsActionRow({ title: settingsItemText(this.getUIContext(), 'history_clear', this.uiLanguage), icon: $r('app.media.ic_study_delete'),
          isInteractive: this.canEdit() && this.count > 0, onAction: (): void => { this.change('clear'); } })
        if (this.message !== '') {
          Text(this.message).fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.error_text')).width('100%')
          SettingsActionRow({ title: $r('app.string.common_retry'), isInteractive: !this.busy && !this.isLocked,
            onAction: (): void => { this.reload(); } })
        }
        if (this.management) {
          AgentHistoryList({ conversations: this.conversations, canRestore: false, management: true,
            isInteractive: this.canEdit(), onDelete: (item: AgentConversationSummary): void => { this.change('delete', 0, item.id); } })
        }
      }.width('100%')
    }
  }
}
