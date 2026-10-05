// SPDX-License-Identifier: AGPL-3.0-or-later
import { settingsIcon } from '../../utils/SettingsIcons';
import { PressFeedback } from '../../utils/PressFeedback';
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { 按下态按钮 } from '../common/按下态按钮';
import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';
import { SettingsToggleRow } from '../common/SettingsToggleRow';
import { resourceText, showToastSafely } from '../../utils/UiFeedback';
import { AppInterfaceControl, visibleInterfaceItems } from '../../model/AppInterface';
import { appInterface } from '../../backend/AppInterfaceService';
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
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
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
  private visible: boolean = false;

  aboutToAppear(): void {
    this.visible = true;
    const context: common.UIAbilityContext | undefined = AppStorage.get<common.UIAbilityContext>('abilityContext');
    if (context === undefined) { this.errorMessage = this.text($r('app.string.ability_context_unavailable')); return; }
    this.backend = new LocalBackups(context.filesDir);
    this.publishInterface();
    this.loadState(context);
  }

  aboutToDisappear(): void { this.visible = false; appInterface.leave('backup_management'); }

  private async loadState(context: common.UIAbilityContext): Promise<void> {
    try {
      this.automaticEnabled = await loadAutomaticBackup(context);
      if (this.backend !== null) this.backups = await this.backend.list();
      if (this.backups.length > 0) this.selectedBackup = this.backups[0];
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : `${error}`;
    } finally { this.publishInterface(); }
  }

  private async toggleAutomatic(value: boolean): Promise<void> {
    const context: common.UIAbilityContext | undefined = AppStorage.get<common.UIAbilityContext>('abilityContext');
    if (context === undefined) return;
    this.automaticEnabled = value;
    try { await saveAutomaticBackup(context, value); }
    catch (error) { this.automaticEnabled = !value; this.showError(error as Object); }
    finally { this.publishInterface(); }
  }

  private async createBackup(): Promise<void> {
    if (this.busy || this.backend === null) return;
    this.busy = true; this.errorMessage = ''; this.statusMessage = '';
    this.publishInterface();
    try {
      const created: boolean = await backupCoordinator.create(this.backend);
      this.statusMessage = this.text(created ? $r('app.string.backup_management_created') :
        $r('app.string.backup_management_not_needed'));
      this.backups = await this.backend.list();
      if (this.backups.length > 0) this.selectedBackup = this.backups[0];
    } catch (error) { this.showError(error as Object); }
    finally { this.busy = false; this.publishInterface(); }
  }

  private restoreBackup(): void {
    if (this.busy || this.backend === null || this.selectedBackup === '') return;
    const name: string = this.selectedBackup;
    this.getUIContext().showAlertDialog({
      title: $r('app.string.backup_management_restore_confirm_title'),
      message: resourceText(this.getUIContext(), $r('app.string.backup_management_restore_confirm'), name),
      autoCancel: false,
      primaryButton: { value: $r('app.string.cancel'), action: (): void => {} },
      secondaryButton: {
        value: $r('app.string.backup_management_restore'),
        action: (): void => { this.executeRestore(name); }
      }
    });
  }

  private async executeRestore(name: string): Promise<void> {
    if (this.busy || this.backend === null) return;
    this.busy = true; this.errorMessage = ''; this.statusMessage = '';
    this.publishInterface();
    try {
      await backupCoordinator.restore(this.backend, name, true);
      this.statusMessage = resourceText(this.getUIContext(), $r('app.string.backup_management_restored'), name);
      if (this.visible) showToastSafely(this.getUIContext(), { message: this.statusMessage, duration: 3000 });
      try { this.backups = await this.backend.list(); }
      catch (error) { this.showError(error as Object, true); }
    } catch (error) { this.showError(error as Object); }
    finally { this.busy = false; this.publishInterface(); }
  }

  private showError(error: Object, restored: boolean = false): void {
    const reason: string = error instanceof Error ? error.message : `${error}`;
    this.errorMessage = resourceText(this.getUIContext(),
      restored ? $r('app.string.backup_management_refresh_error') : $r('app.string.backup_management_error'), reason);
    hilog.error(0x4342, '备份管理', '%{public}s', reason);
    if (this.visible) showToastSafely(this.getUIContext(), { message: this.errorMessage, duration: 5000 });
  }

  private selectBackup(name: string): void {
    if (this.busy) return;
    this.selectedBackup = name; this.publishInterface();
  }

  private publishInterface(): void {
    if (!this.visible) return;
    const items: AppInterfaceControl[] = visibleInterfaceItems('backup_management',
      { simple: false, agent: false, cloudDeck: false, themeHasTextures: false }).map((item): AppInterfaceControl =>
      ({ id: item.id, title: '', titleKey: item.titleKey,
        enabled: !this.busy && (item.id !== 'restore' || this.selectedBackup !== ''),
        selected: item.id === 'automatic' && this.automaticEnabled }));
    this.backups.forEach((name: string): void => {
      items.push({ id: name, title: name, enabled: !this.busy, selected: name === this.selectedBackup });
    });
    appInterface.observe({ surface: 'backup_management', sectionId: 'data', selectedId: this.selectedBackup,
      busy: this.busy, optionIds: this.backups, optionLabels: this.backups, controlsComplete: items.length <= 100,
      items: items, values: [{ id: 'selected_backup', value: this.selectedBackup },
        { id: 'result', value: this.statusMessage }, { id: 'error_detail', value: this.errorMessage }] });
  }

  private text(resource: Resource, _locale: string = this.uiLanguage): string {
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
        if (this.statusMessage !== '') Text(this.statusMessage).fontSize(13)
          .fontColor(this.actionColor).width('100%');
        if (this.errorMessage !== '') Text(this.errorMessage).fontSize(13)
          .fontColor(设置面板色板_取(this.isDark).错误色).width('100%');
        Column() {
          DataActionRow({ title: $r('app.string.transfer_export_personal'), icon: settingsIcon('export_collection'), hint: $r('app.string.backup_full_export_hint'),
            isInteractive: !this.busy, onAction: this.onExportCollection })
          DataActionRow({ title: $r('app.string.transfer_import_personal'), icon: settingsIcon('restore_collection'), hint: $r('app.string.backup_full_restore_hint'),
            isInteractive: !this.busy, onAction: this.onImportCollection })
        }.width('100%')
        Divider().color(SurfaceBorder.color())
        Text($r('app.string.backup_management_title')).fontSize(15).fontWeight(FontWeight.Medium)
          .fontColor($r('app.color.text_primary')).width('100%')
        Text($r('app.string.backup_management_subtitle')).fontSize(13)
          .fontColor(设置面板色板_取(this.isDark).次文字).width('100%');
        SettingsToggleRow({ title: $r('app.string.backup_management_auto'), hint: $r('app.string.backup_management_auto_hint'), isOn: this.automaticEnabled,
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
                .onClick((): void => { this.selectBackup(name); });
              }
            }, (name: string): string => name);
          }.width('100%');
        }
  }

  build() {
    DialogFrame({ header: () => { this.dialogHeader(); }, content: () => { this.dialogContent(); }, canDismiss: !this.busy,
      onDismiss: (): void => this.handleBackRequest() })
  }
}
