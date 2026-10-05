// SPDX-License-Identifier: AGPL-3.0-or-later
import type { AppInterfaceControl } from '../../model/AppInterface';
import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';
import { SettingsToggleRow } from '../common/SettingsToggleRow';
import { DataActionRow } from '../settings/DataActionRow';
import { 调度器服务 } from '../../backend/调度器服务';
import { ScheduleCardsAsNewOptions } from '../../proto/messages/SchedulerMessages';
import { appInterface } from '../../backend/AppInterfaceService';
import { 应用尺寸 } from '../../utils/应用尺寸';

@Component
export struct BrowserResetDialog {
  @Prop @Watch('handleBack') backRequest: number = 0;
  @Prop @Watch('publish') busy: boolean = false;
  @Prop notes: boolean = false;
  @State private loading: boolean = true;
  @State private failed: boolean = false;
  @State private restorePosition: boolean = false;
  @State private resetCounts: boolean = false;
  private disposed: boolean = false;
  onClose: () => void = (): void => {};
  onSubmit: (options: ScheduleCardsAsNewOptions) => void = (_options: ScheduleCardsAsNewOptions): void => {};
  aboutToAppear(): void { this.load(); }
  aboutToDisappear(): void { this.disposed = true; appInterface.leave('browser_reset'); }
  private handleBack(): void { if (!this.busy) this.onClose(); }
  private async load(): Promise<void> {
    if (this.disposed || this.busy) return;
    this.loading = true; this.failed = false; this.publish();
    try {
      const options: ScheduleCardsAsNewOptions = await new 调度器服务().scheduleCardsAsNewDefaults();
      if (this.disposed) return;
      this.restorePosition = options.restorePosition; this.resetCounts = options.resetCounts;
    } catch { if (!this.disposed) this.failed = true; }
    finally { if (!this.disposed) { this.loading = false; this.publish(); } }
  }
  private publish(): void {
    if (this.disposed) return;
    appInterface.observe({ surface: 'browser_reset', sectionId: '', selectedId: '', busy: this.busy || this.loading,
      optionIds: [], optionLabels: [], controlsComplete: true,
      items: ['restore_position', 'reset_counts', 'confirm', 'close'].concat(this.failed ? ['retry'] : [])
        .map((id: string): AppInterfaceControl => ({ id: id, title: '',
        titleKey: id === 'confirm' ? 'browser_detail_confirm' : id === 'close' ? 'browser_detail_cancel' :
          id === 'retry' ? 'common_retry' : 'browser_reset_' + id,
        enabled: id === 'close' || id === 'retry' ? !this.busy && (id !== 'retry' || !this.loading) : !this.busy && !this.loading && !this.failed,
        selected: id === 'restore_position' ? this.restorePosition : id === 'reset_counts' && this.resetCounts })),
      values: [{ id: 'notes_mode', value: String(this.notes) }, { id: 'has_error', value: String(this.failed) }] });
  }
  private submit(): void {
    if (!this.busy && !this.loading && !this.failed) this.onSubmit({ restorePosition: this.restorePosition, resetCounts: this.resetCounts });
  }
  @Builder
  private header() {
    DialogHeader({ title: $r('app.string.browser_reset_title'), closeLabel: $r('app.string.browser_detail_cancel'),
      closeEnabled: !this.busy, onClose: (): void => { this.handleBack(); },
      actionLabel: $r('app.string.browser_detail_confirm'), actionEnabled: !this.busy && !this.loading && !this.failed,
      onAction: (): void => { this.submit(); } })
  }
  @Builder
  private content() {
    Text(this.notes ? $r('app.string.browser_reset_notes_hint') : $r('app.string.browser_reset_hint'))
      .fontColor($r('app.color.text_secondary')).fontSize(应用尺寸.字号_正文)
    SettingsToggleRow({ title: $r('app.string.browser_reset_restore_position'), isOn: this.restorePosition,
      isInteractive: !this.busy && !this.loading && !this.failed,
      onChange: (value: boolean): void => { this.restorePosition = value; this.publish(); } })
    SettingsToggleRow({ title: $r('app.string.browser_reset_reset_counts'), isOn: this.resetCounts,
      isInteractive: !this.busy && !this.loading && !this.failed,
      onChange: (value: boolean): void => { this.resetCounts = value; this.publish(); } })
    if (this.failed) {
      DataActionRow({ title: $r('app.string.common_retry'), hint: $r('app.string.browser_reset_defaults_error'),
        isInteractive: !this.busy && !this.loading, onAction: (): void => { this.load(); } })
    }
  }
  build() {
    DialogFrame({ maximumWidth: 应用尺寸.dialogCompactMaxWidth, canDismiss: !this.busy,
      header: () => { this.header(); }, content: () => { this.content(); }, onDismiss: (): void => { this.handleBack(); } })
  }
}
