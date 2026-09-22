// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { 设置面板色板_取 } from '../../utils/设置面板配色';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 颜色键 } from '../../model/颜色主题';
import { backupCoordinator } from '../../model/BackupCoordinator';
import { LocalBackups, loadAutomaticBackup, saveAutomaticBackup } from '../../backend/LocalBackups.ets';

@Component
export struct 备份管理面板 {
  @Prop isDark: boolean = false;
  onClose: () => void = (): void => {};
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
    return this.getUIContext().getHostContext()!.resourceManager.getStringSync(resource.id);
  }

  build() {
    Stack() {
      Column({ space: 应用尺寸.间距_8 }) {
        Row() {
          Text($r('app.string.backup_management_title')).fontSize(18).fontWeight(FontWeight.Bold)
            .fontColor(设置面板色板_取(this.isDark).主文字);
          Blank();
          Button($r('app.string.close')).type(ButtonType.Normal).backgroundColor(Color.Transparent)
            .fontColor(this.actionColor).onClick((): void => this.onClose());
        }.width('100%');
        Text($r('app.string.backup_management_subtitle')).fontSize(13)
          .fontColor(设置面板色板_取(this.isDark).次文字).width('100%');
        Row() {
          Column({ space: 2 }) {
            Text($r('app.string.backup_management_auto')).fontSize(15)
              .fontColor(设置面板色板_取(this.isDark).主文字);
            Text($r('app.string.backup_management_auto_hint')).fontSize(12).maxLines(3)
              .fontColor(设置面板色板_取(this.isDark).弱化文字);
          }.layoutWeight(1);
          Toggle({ type: ToggleType.Switch, isOn: this.automaticEnabled }).enabled(!this.busy)
            .onChange((value: boolean): void => { this.toggleAutomatic(value); });
        }.width('100%');
        Row({ space: 应用尺寸.间距_8 }) {
          Button($r('app.string.backup_management_create')).enabled(!this.busy)
            .onClick((): void => { this.createBackup(); });
          Button($r('app.string.backup_management_restore')).enabled(!this.busy && this.selectedBackup !== '')
            .onClick((): void => { this.restoreBackup(); });
        }.width('100%');
        if (this.backups.length === 0) {
          Text($r('app.string.backup_management_empty')).fontSize(13)
            .fontColor(设置面板色板_取(this.isDark).次文字).width('100%');
        } else {
          List() {
            ForEach(this.backups, (name: string) => {
              ListItem() {
                Row() {
                  Text(name).fontSize(14).layoutWeight(1)
                    .fontColor(设置面板色板_取(this.isDark).主文字);
                  if (this.selectedBackup === name) Text('✓').fontColor(this.actionColor);
                }.width('100%').padding(10)
                .backgroundColor(this.selectedBackup === name ? 设置面板色板_取(this.isDark).标签背景 : Color.Transparent)
                .onClick((): void => { this.selectedBackup = name; });
              }
            }, (name: string): string => name);
          }.layoutWeight(1).width('100%');
        }
        if (this.statusMessage !== '') Text(this.statusMessage).fontSize(13)
          .fontColor(this.actionColor).width('100%');
        if (this.errorMessage !== '') Text(this.errorMessage).fontSize(13)
          .fontColor(设置面板色板_取(this.isDark).错误色).width('100%');
      }.width('92%').height('88%').padding(应用尺寸.卡片内边距)
        .backgroundColor(设置面板色板_取(this.isDark).背景).borderRadius(18)
        .shadow({ radius: 20, color: '#33000000', offsetX: 0, offsetY: 8 });
    }.width('100%').height('100%').backgroundColor('#66000000')
      .alignContent(Alignment.Center);
  }
}
