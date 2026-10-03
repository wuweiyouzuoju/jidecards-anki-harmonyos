// SPDX-License-Identifier: AGPL-3.0-or-later
import { PressFeedback } from '../../utils/PressFeedback';
import { 按下态按钮 } from '../common/按下态按钮';
import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';
import { SettingsToggleRow } from '../common/SettingsToggleRow';
import { resourceText } from '../../utils/UiFeedback';
import { common } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { 设置面板色板_取 } from '../../utils/设置面板配色';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 颜色键 } from '../../model/颜色主题';
import { backupCoordinator } from '../../model/BackupCoordinator';
import { LocalBackups, loadAutomaticBackup, saveAutomaticBackup } from '../../backend/LocalBackups.ets';
import { DataActionRow } from './DataActionRow';

@Component
export struct 备份管理面板 {
  @Prop @Watch('handleBackRequest') backRequest: number = 0;

  private handleBackRequest(): void {
    if (!this.busy) this.onClose();
  }

  @Prop isDark: boolean = false;
  onClose: () => void = (): void => {};
  onExportCollection: () => void = (): void => {};
  onImportCollection: () => void = (): void => {};
  @StorageProp(颜色键.动作主色) private actionColor: string = '#2F5FD0';
  @State private automaticEnabled: boolean = true;
  @State private backups: string[] = [];
  @State private selectedBackup: string = '';
  @State private busy: boolean = false;
  @State private errorMessage: string = '';
  @State private statusMessage: string = '';
  private backend: LocalBackups | null = null;

  aboutToAppear(): void {
    const context: common.UIAbilityContext | undefined = AppStorage.get<common.UIAbilityContext>('abilityContext');
    if (context === undefined) { this.errorMessage = this.text($r('app.string.ability_context_unavailable')); return; }
    this.backend = new LocalBackups(context.filesDir);
    this.loadState(context);
  }

  private async loadState(context: common.UIAbilityContext): Promise<void> {
    try {
      this.automaticEnabled = await loadAutomaticBackup(context);
      if (this.backend !== null) this.backups = await this.backend.list();
      if (this.backups.length > 0) this.selectedBackup = this.backups[0];
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : `${error}`;
    }
  }

  private async toggleAutomatic(value: boolean): Promise<void> {
    const context: common.UIAbilityContext | undefined = AppStorage.get<common.UIAbilityContext>('abilityContext');
    if (context === undefined) return;
    this.automaticEnabled = value;
    try { await saveAutomaticBackup(context, value); }
    catch (error) { this.automaticEnabled = !value; this.showError(error as Object); }
  }

  private async createBackup(): Promise<void> {
    if (this.busy || this.backend === null) return;
    this.busy = true; this.errorMessage = ''; this.statusMessage = '';
    try {
      const created: boolean = await backupCoordinator.create(this.backend);
      this.statusMessage = this.text(created ? $r('app.string.backup_management_created') :
        $r('app.string.backup_management_not_needed'));
      this.backups = await this.backend.list();
      if (this.backups.length > 0) this.selectedBackup = this.backups[0];
    } catch (error) { this.showError(error as Object); }
    finally { this.busy = false; }
  }

  private restoreBackup(): void {
    if (this.busy || this.backend === null || this.selectedBackup === '') return;
    this.getUIContext().showAlertDialog({
      title: $r('app.string.backup_management_restore_confirm_title'),
      message: $r('app.string.backup_management_restore_confirm'),
      autoCancel: false,
      primaryButton: { value: $r('app.string.cancel'), action: (): void => {} },
      secondaryButton: {
        value: $r('app.string.backup_management_restore'),
        action: (): void => { this.executeRestore(this.selectedBackup); }
      }
    });
  }

  private async executeRestore(name: string): Promise<void> {
    if (this.backend === null) return;
    this.busy = true; this.errorMessage = ''; this.statusMessage = '';
    try {
      await backupCoordinator.restore(this.backend, name, true);
      this.statusMessage = this.text($r('app.string.backup_management_restored'));
      this.backups = await this.backend.list();
    } catch (error) { this.showError(error as Object); }
    finally { this.busy = false; }
  }

  private showError(error: Object): void {
    const reason: string = error instanceof Error ? error.message : `${error}`;
    this.errorMessage = this.text($r('app.string.backup_management_error')).replace('%s', reason);
    hilog.error(0x4342, '备份管理', reason);
  }

  private text(resource: Resource): string {
    return resourceText(this.getUIContext(), resource);
  }

  @Builder
  private dialogHeader() {
    DialogHeader({ title: $r('app.string.backup_hub_title'), showAction: false,
      closeLabel: $r('app.string.close'), closeEnabled: !this.busy,
      onClose: (): void => this.handleBackRequest() })
  }

  @Builder
  private dialogContent() {
        Column() {
          DataActionRow({ title: $r('app.string.transfer_export_personal'), hint: $r('app.string.backup_full_export_hint'),
            isInteractive: !this.busy, onAction: this.onExportCollection })
          DataActionRow({ title: $r('app.string.transfer_import_personal'), hint: $r('app.string.backup_full_restore_hint'),
            isInteractive: !this.busy, onAction: this.onImportCollection })
        }.width('100%')
        Divider().color($r('app.color.border_subtle'))
        Text($r('app.string.backup_management_title')).fontSize(15).fontWeight(FontWeight.Medium)
          .fontColor($r('app.color.text_primary')).width('100%')
        Text($r('app.string.backup_management_subtitle')).fontSize(13)
          .fontColor(设置面板色板_取(this.isDark).次文字).width('100%');
        SettingsToggleRow({ title: $r('app.string.backup_management_auto'),
          hint: $r('app.string.backup_management_auto_hint'), isOn: this.automaticEnabled,
          isInteractive: !this.busy, isDark: this.isDark, tint: this.actionColor, onChange: (value: boolean): void => { this.toggleAutomatic(value); } })
        Row({ space: 应用尺寸.间距_8 }) {
          按下态按钮({ 文案: $r('app.string.backup_management_create'), 字色: this.actionColor, themeText: true,
            是否启用: !this.busy, 点击回调: (): void => { this.createBackup(); } }).layoutWeight(1)
          按下态按钮({ 文案: $r('app.string.backup_management_restore'), 字色: this.actionColor, themeText: true,
            是否启用: !this.busy && this.selectedBackup !== '', 点击回调: (): void => { this.restoreBackup(); } }).layoutWeight(1)
        }.width('100%');
        if (this.backups.length === 0) {
          Text($r('app.string.backup_management_empty')).fontSize(13)
            .fontColor(设置面板色板_取(this.isDark).次文字).width('100%');
        } else {
          Column() {
            ForEach(this.backups, (name: string) => {
              Column() {
                Row() {
                  Text(name).fontSize(14).layoutWeight(1)
                    .fontColor(设置面板色板_取(this.isDark).主文字);
                }.width('100%').padding(10)
                .backgroundColor(this.selectedBackup === name ? 设置面板色板_取(this.isDark).标签背景 : Color.Transparent)
                .attributeModifier(new PressFeedback())
                .onClick((): void => { if (!this.busy) this.selectedBackup = name; });
              }
            }, (name: string): string => name);
          }.width('100%');
        }
        if (this.statusMessage !== '') Text(this.statusMessage).fontSize(13)
          .fontColor(this.actionColor).width('100%');
        if (this.errorMessage !== '') Text(this.errorMessage).fontSize(13)
          .fontColor(设置面板色板_取(this.isDark).错误色).width('100%');

  }

  build() {
    DialogFrame({ header: () => { this.dialogHeader(); }, content: () => { this.dialogContent(); }, canDismiss: !this.busy,
      onDismiss: (): void => this.handleBackRequest() })
  }
}
