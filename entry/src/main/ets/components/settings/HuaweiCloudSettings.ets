// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { recordSyncSetup } from '../../model/同步凭证存储';
import { HUAWEI_CLOUD_UNIT_KEY, HUAWEI_CLOUD_DONE_KEY, HUAWEI_CLOUD_TOTAL_KEY, huaweiCloudSync } from '../../backend/cloud-sync/HuaweiCloudSync';
import { CloudGeneration, cloudSyncFailureKey } from '../../model/cloud-sync/CloudCollectionSync';
import { appInterface } from '../../backend/AppInterfaceService';
import { AppInterfaceControl } from '../../model/AppInterface';
import { settingsIcon } from '../../utils/SettingsIcons';
import { settingsItemText } from '../../utils/SettingsStructureText';
import { cloudSyncProgressText } from '../../utils/CloudSyncProgressText';
import { ActionStatus } from '../common/ActionStatus';
import { cloudGenerationDisplayText } from '../../utils/CloudGenerationDisplayText';
import { namedResourceText } from '../../utils/UiFeedback';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { SettingsActionRow } from '../common/SettingsActionRow';
import { 设置分组卡片 } from './设置分组卡片';

@Component
export struct HuaweiCloudSettings {
  @Prop startOnOpen: boolean = false;
  @Prop 是否深色: boolean = false;
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @StorageProp(HUAWEI_CLOUD_UNIT_KEY) @Watch('publish') private progressUnit: string = 'files';
  @StorageProp(HUAWEI_CLOUD_DONE_KEY) @Watch('publish') private completedFiles: number = 0;
  @StorageProp(HUAWEI_CLOUD_TOTAL_KEY) @Watch('publish') private totalFiles: number = 0;
  @State private busy: boolean = false;
  @State private uploadProgress: number = -1;
  @State private status: string = '';
  @State private stage: string = 'huawei_cloud_working';
  @State private peers: CloudGeneration[] = [];
  private epoch: number = 0;
  private disposed: boolean = true;
  private confirming: boolean = false;
  @State private openingSettings: boolean = false;
  private ownTask: boolean = false;
  private startedOnOpen: boolean = false;
  private watcher: number = -1;

  aboutToAppear(): void {
    this.disposed = false; this.confirming = false; this.openingSettings = false;
    this.status = ''; this.busy = huaweiCloudSync.isBusy(); this.uploadProgress = huaweiCloudSync.progress(); this.publish();
    this.watcher = setInterval((): void => {
      if (!this.ownTask && this.busy !== huaweiCloudSync.isBusy()) { this.busy = huaweiCloudSync.isBusy(); this.publish(); }
      const progress = huaweiCloudSync.progress();
      const stage = huaweiCloudSync.stage();
      if (progress !== this.uploadProgress || stage !== this.stage) {
        this.uploadProgress = progress; this.stage = stage; this.publish();
      }
    }, 500);
    if (this.startOnOpen && !this.startedOnOpen) {
      this.startedOnOpen = true;
      this.confirmUpload();
    }
  }
  aboutToDisappear(): void { this.disposed = true; this.epoch++; this.ownTask = false;
    if (this.watcher !== -1) clearInterval(this.watcher); this.watcher = -1; appInterface.leave('huawei_cloud'); }
  private publish(): void {
    if (this.disposed) return;
    const items: AppInterfaceControl[] = ['huawei_cloud_sync', 'huawei_cloud_sources', 'huawei_cloud_settings'].map((id: string): AppInterfaceControl =>
      ({ id, title: settingsItemText(this.getUIContext(), id, this.uiLanguage), titleKey: id,
        enabled: id === 'huawei_cloud_settings' ? !this.openingSettings && !this.confirming : !this.busy && !this.confirming,
        selected: false }));
    for (const peer of this.peers) items.push({ id: `restore:${peer.device}`, title: cloudGenerationDisplayText(this.getUIContext(), peer, this.uiLanguage),
      titleKey: 'huawei_cloud_restore', enabled: !this.busy && !this.confirming, selected: false });
    appInterface.observe({ surface: 'huawei_cloud', sectionId: 'sync', selectedId: '', optionIds: this.peers.map((p: CloudGeneration): string => p.device),
      optionLabels: this.peers.map((p: CloudGeneration): string => cloudGenerationDisplayText(this.getUIContext(), p, this.uiLanguage)), busy: this.busy || this.confirming,
      controlsComplete: items.length <= 100, items, values: [{ id: 'status', value: this.displayStatus() },
        { id: 'progress', value: this.progressDetail() }] });
  }
  private run(action: () => Promise<void>): void {
    if (this.disposed || this.busy || this.confirming) return;
    const epoch = this.epoch;
    this.ownTask = true; this.busy = true; this.status = namedResourceText(this.getUIContext(), 'huawei_cloud_working'); this.publish();
    action().catch((error: Error): void => {
      if (this.disposed || this.epoch !== epoch) return;
      this.status = namedResourceText(this.getUIContext(), cloudSyncFailureKey(error.message));
    }).finally((): void => {
      if (!this.disposed && this.epoch === epoch) { this.ownTask = false; this.busy = false; this.publish(); }
    });
  }
  private sync(source: CloudGeneration | null = null): void {
    const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
    const epoch = this.epoch;
    this.run(async (): Promise<void> => {
      if (source === null) await huaweiCloudSync.upload(context);
      else await huaweiCloudSync.download(context, source);
      recordSyncSetup('huawei');
      if (!this.disposed && this.epoch === epoch) this.status = namedResourceText(this.getUIContext(), source === null ? 'huawei_cloud_uploaded' : 'huawei_cloud_downloaded');
    });
  }
  private sources(): void {
    const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
    const epoch = this.epoch;
    this.run(async (): Promise<void> => {
      const peers = await huaweiCloudSync.devices(context);
      if (!this.disposed && this.epoch === epoch) {
        this.peers = peers;
        this.status = namedResourceText(this.getUIContext(), peers.length === 0 ? 'huawei_cloud_empty' : 'huawei_cloud_choose_source');
      }
    });
  }
  private confirmUpload(): void {
    this.confirmTransfer(null);
  }
  private restore(peer: CloudGeneration): void {
    this.confirmTransfer(peer);
  }
  private confirmTransfer(peer: CloudGeneration | null): void {
    if (this.busy || this.confirming || this.disposed) return;
    this.confirming = true; this.publish();
    const epoch = this.epoch;
    const finish = (): boolean => {
      if (this.disposed || this.epoch !== epoch || !this.confirming) return false;
      this.confirming = false; this.publish(); return true;
    };
    try {
      const title: Resource = peer === null ? $r('app.string.huawei_cloud_sync') : $r('app.string.huawei_cloud_restore');
      this.getUIContext().showAlertDialog({ title,
        message: peer === null ? $r('app.string.huawei_cloud_hint') :
          namedResourceText(this.getUIContext(), 'huawei_cloud_restore_confirm', cloudGenerationDisplayText(this.getUIContext(), peer, this.uiLanguage)), autoCancel: false,
        cancel: (): void => { finish(); }, buttons: [
          { value: $r('app.string.cancel'), action: (): void => { finish(); } },
          { value: title, action: (): void => { if (finish()) this.sync(peer); } }
        ], buttonDirection: DialogButtonDirection.AUTO });
    } catch (error) { finish(); }
  }
  private async settings(): Promise<void> {
    if (this.disposed || this.openingSettings || this.confirming) return;
    const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
    const epoch = this.epoch;
    this.openingSettings = true; this.publish();
    try {
      try {
        await context.startAbility({ uri: 'hicloud://cloudDrive/getInfo?path=MainActivity' });
      } catch (error) {
        await context.startAbility({ bundleName: 'com.huawei.hmos.settings', abilityName: 'com.huawei.hmos.settings.MainAbility' });
      }
      if (!this.disposed && this.epoch === epoch && !this.busy) {
        this.status = namedResourceText(this.getUIContext(), 'huawei_cloud_enable_required');
      }
    } catch (error) {
      if (!this.disposed && this.epoch === epoch && !this.busy) {
        this.status = namedResourceText(this.getUIContext(), 'huawei_cloud_failed');
      }
    } finally {
      if (!this.disposed && this.epoch === epoch) { this.openingSettings = false; this.publish(); }
    }
  }
  private displayStatus(): string {
    return this.busy ? namedResourceText(this.getUIContext(), this.stage) : this.status;
  }
  private progressDetail(): string {
    return this.busy ? cloudSyncProgressText(this.completedFiles, this.totalFiles, this.uploadProgress, this.uiLanguage, this.progressUnit) : '';
  }
  @Builder
  private content() {
    Column({ space: 应用尺寸.间距_8 }) {
      Text($r('app.string.huawei_cloud_hint')).fontSize(应用尺寸.字号_正文_小).width('100%')
      SettingsActionRow({ title: settingsItemText(this.getUIContext(), 'huawei_cloud_sync', this.uiLanguage), icon: settingsIcon('huawei_cloud_sync'),
        isInteractive: !this.busy && !this.confirming, onAction: (): void => { this.confirmUpload(); } })
      SettingsActionRow({ title: settingsItemText(this.getUIContext(), 'huawei_cloud_sources', this.uiLanguage), icon: settingsIcon('huawei_cloud_sources'),
        isInteractive: !this.busy && !this.confirming, onAction: (): void => { this.sources(); } })
      SettingsActionRow({ title: settingsItemText(this.getUIContext(), 'huawei_cloud_settings', this.uiLanguage),
        isInteractive: !this.openingSettings && !this.confirming, onAction: (): void => { this.settings(); } })
      ForEach(this.peers, (peer: CloudGeneration) => {
        SettingsActionRow({ title: $r('app.string.huawei_cloud_restore'), icon: settingsIcon('huawei_cloud_restore'), hint: cloudGenerationDisplayText(this.getUIContext(), peer, this.uiLanguage),
          isInteractive: !this.busy && !this.confirming, onAction: (): void => { this.restore(peer); } })
      }, (peer: CloudGeneration): string => peer.device + peer.generation)
      if (this.displayStatus() !== '') {
        Row({ space: 应用尺寸.间距_8 }) {
          if (this.busy && this.uploadProgress < 0) { ActionStatus({ phase: 'busy' }) }
          Text(this.displayStatus()).fontSize(应用尺寸.字号_正文_小).layoutWeight(1)
        }.width('100%')
      }
      if (this.busy && this.progressDetail() !== '') {
        Text(this.progressDetail()).fontSize(应用尺寸.字号_正文_小).width('100%')
      }
      if (this.busy && this.uploadProgress >= 0) {
        Progress({ value: this.uploadProgress, total: 100, type: ProgressType.Linear }).width('100%')
      }
    }.width('100%').alignItems(HorizontalAlign.Start)
  }
  build() {
    设置分组卡片({ groupId: 'huawei_cloud', 是否深色: this.是否深色, 内容: (): void => { this.content(); } })
  }
}
