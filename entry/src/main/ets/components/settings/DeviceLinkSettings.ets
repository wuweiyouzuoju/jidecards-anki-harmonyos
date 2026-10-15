// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { scanBarcode, scanCore } from '@kit.ScanKit';
import { DeviceLinkService, DeviceLinkSnapshot, DevicePeerView, DeviceProgressView } from '../../backend/device-link/DeviceLinkService';
import { DeviceProgressStore } from '../../backend/device-link/DeviceProgressStore';
import { ProgressStore } from '../../model/device-link/ProgressSync';
import { appInterface } from '../../backend/AppInterfaceService';
import { AppInterfaceControl, visibleInterfaceItems } from '../../model/AppInterface';
import { settingsItemText } from '../../utils/SettingsStructureText';
import { settingsIcon } from '../../utils/SettingsIcons';
import { namedResourceText } from '../../utils/UiFeedback';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { SettingsActionRow } from '../common/SettingsActionRow';
import { SettingsToggleRow } from '../common/SettingsToggleRow';
import { 设置分组卡片 } from './设置分组卡片';
import { NativeDialogHost, NativeDialogFactory, NativeDialogDismiss, NativeDialogPresentation } from '../common/NativeDialogHost';
import { ExpansionReveal } from '../../utils/ExpansionReveal';
import { DevicePairingDialog } from './DevicePairingDialog';

@Component
export struct DeviceLinkSettings {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop 是否深色: boolean = false;
  scroller: Scroller = new Scroller();
  @State private snapshot: DeviceLinkSnapshot = { ready: false, peers: [], invitation: '', connectedId: '', progressBusy: false, progress: [] };
  @State private busy: boolean = false;
  @State private error: string = '';
  @State private confirmingForget: boolean = false;
  @State private expanded: boolean = false;
  @State private codeVisible: boolean = false;
  private reveal: ExpansionReveal | null = null;
  private readonly codeDialog: NativeDialogHost = new NativeDialogHost();
  private readonly createCodeDialog: NativeDialogFactory = (dismiss: NativeDialogDismiss): CustomDialogController => {
    const presentation: NativeDialogPresentation = this.codeDialog.presentation();
    return new CustomDialogController({
      onWillDismiss: dismiss,
      builder: DevicePairingDialog({ invitation: this.snapshot.invitation,
        onClose: this.codeDialog.guard((): void => { this.closeCode(); }) }),
      width: presentation.width, height: presentation.height, maskColor: presentation.maskColor,
      autoCancel: presentation.autoCancel, alignment: presentation.alignment,
      openAnimation: presentation.openAnimation, closeAnimation: presentation.closeAnimation, customStyle: presentation.customStyle
    });
  };
  private service: DeviceLinkService | null = null;
  private unsubscribe: (() => void) | null = null;
  private disposed: boolean = false;
  private invitationTimer: number = -1;

  aboutToAppear(): void {
    this.disposed = false;
    this.codeDialog.activate(); this.reveal = new ExpansionReveal(this.scroller);
    const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
    this.service = new DeviceLinkService(context, (): ProgressStore => new DeviceProgressStore(context));
    this.unsubscribe = this.service.subscribe((snapshot: DeviceLinkSnapshot): void => {
      this.updateSnapshot(snapshot);
    });
    this.run(async (): Promise<void> => { await this.service!.start(); });
  }

  aboutToDisappear(): void {
    this.disposed = true; this.unsubscribe?.(); this.unsubscribe = null;
    this.codeDialog.dispose(); this.reveal?.cancel();
    if (this.invitationTimer >= 0) clearTimeout(this.invitationTimer);
    this.service?.stop().catch((): void => {}); this.service = null;
    appInterface.leave('device_link');
    appInterface.leave('device_pairing_code');
  }

  private updateSnapshot(snapshot: DeviceLinkSnapshot): void {
    if (this.disposed) return;
    this.snapshot = snapshot;
    if (snapshot.invitation === '' && this.codeVisible) this.closeCode();
    this.publishInterface();
  }

  private toggleExpanded(): void {
    if (this.disposed || this.confirmingForget || this.codeVisible) return;
    this.expanded = !this.expanded; this.reveal?.request(this.expanded); this.publishInterface();
  }

  private publishInterface(): void {
    if (this.disposed) return;
    const idle: boolean = this.canAct();
    const personal: DevicePeerView[] = this.snapshot.peers.filter((peer: DevicePeerView): boolean => peer.allowProgress);
    const items: AppInterfaceControl[] = visibleInterfaceItems('device_link',
      { simple: false, agent: false, cloudDeck: false, themeHasTextures: false })
      .filter((item): boolean => {
        if (item.id === 'device_link_toggle') return true;
        if (item.id === 'device_progress_cancel') return this.snapshot.progressBusy;
        if (!this.expanded) return false;
        if (item.id === 'device_link_connect') return personal.length > 0;
        if (item.id === 'device_progress_allow' || item.id === 'device_link_forget') return this.snapshot.peers.length > 0;
        return true;
      })
      .map((item): AppInterfaceControl => ({ id: item.id, title: '', titleKey: item.titleKey,
        enabled: item.id === 'device_link_toggle' ? !this.confirmingForget && !this.codeVisible : item.id === 'device_progress_cancel' || (idle && item.id !== 'device_link_devices' &&
          ((item.id !== 'device_link_connect' && item.id !== 'device_progress_all') || personal.some((peer: DevicePeerView): boolean => peer.online))),
        selected: item.id === 'device_link_toggle' ? this.expanded : item.id === 'device_progress_allow' && this.snapshot.peers.length > 0 && personal.length === this.snapshot.peers.length }));
    for (const peer of this.expanded ? this.snapshot.peers : []) {
      items.push({ id: peer.id + ':personal', title: peer.name, titleKey: 'device_progress_allow', enabled: idle, selected: peer.allowProgress });
      if (peer.allowProgress) items.push({ id: peer.id + ':merge', title: peer.name, titleKey: 'device_progress_start', enabled: idle && peer.online, selected: false });
      items.push({ id: peer.id + ':forget', title: peer.name, titleKey: 'device_link_forget', enabled: idle, selected: false });
    }
    appInterface.observe({ surface: 'device_link', sectionId: 'sync', selectedId: this.snapshot.connectedId,
      optionIds: this.snapshot.peers.map((peer: DevicePeerView): string => peer.id),
      optionLabels: this.snapshot.peers.map((peer: DevicePeerView): string => peer.name), busy: this.busy || this.snapshot.progressBusy || this.confirmingForget,
      items: items, controlsComplete: items.length <= 100,
      values: [{ id: 'ready', value: this.snapshot.ready ? 'true' : 'false' },
        { id: 'paired_count', value: String(this.snapshot.peers.length) },
        { id: 'online_ids', value: JSON.stringify(this.snapshot.peers.filter((peer: DevicePeerView): boolean => peer.online)
          .map((peer: DevicePeerView): string => peer.id)) },
        { id: 'personal_device_ids', value: JSON.stringify(this.snapshot.peers.filter((peer: DevicePeerView): boolean => peer.allowProgress)
          .map((peer: DevicePeerView): string => peer.id)) },
        { id: 'progress_results', value: JSON.stringify(this.snapshot.progress) },
        { id: 'expanded', value: String(this.expanded) }, { id: 'code_visible', value: String(this.codeVisible) },
        { id: 'confirming_unpair', value: String(this.confirmingForget) }, { id: 'error', value: this.error }] });
    if (this.codeVisible) {
      appInterface.observe({ surface: 'device_pairing_code', sectionId: 'sync', selectedId: '', optionIds: [], optionLabels: [],
        busy: false, controlsComplete: true, items: [{ id: 'close', title: '', titleKey: 'close', enabled: true, selected: false }] });
    } else { appInterface.leave('device_pairing_code'); }
  }

  private canAct(): boolean {
    return !this.busy && !this.snapshot.progressBusy && !this.confirmingForget && !this.codeVisible;
  }

  private run(action: () => Promise<void>): void {
    if (this.disposed || !this.canAct()) return;
    this.busy = true; this.error = ''; this.publishInterface();
    action().catch((error: Error): void => {
      if (this.disposed) return;
      const keys: string[] = ['device_link_invalid_code', 'device_link_not_found', 'device_link_auth_failed',
        'device_link_storage_invalid', 'device_link_save_failed', 'device_link_connect_failed', 'device_link_start_failed',
        'device_progress_busy', 'device_progress_not_allowed', 'device_progress_mismatch', 'device_progress_filtered',
        'device_progress_record_conflict', 'device_progress_too_large', 'device_progress_invalid', 'device_progress_failed',
        'device_progress_cancelled', 'device_progress_some_failed', 'device_progress_not_converged'];
      this.error = namedResourceText(this.getUIContext(), keys.includes(error.message) ? error.message : 'device_link_error');
    }).finally((): void => {
      if (this.disposed) return;
      this.busy = false; this.publishInterface();
    });
  }

  private progressText(id: string): string {
    const result = this.snapshot.progress.find((item: DeviceProgressView): boolean => item.id === id);
    if (result === undefined) return '';
    if (result.phase === 'done') return namedResourceText(this.getUIContext(), 'device_progress_result', result.addedReviews, result.updatedCards);
    const key = result.phase === 'running' ? 'device_progress_working' : result.error;
    return namedResourceText(this.getUIContext(), key);
  }

  private cancelProgress(): void {
    this.service?.cancelProgress().catch((): void => {
      if (!this.disposed) this.error = namedResourceText(this.getUIContext(), 'device_progress_failed');
    });
  }

  private forgetDevice(peer: DevicePeerView): void {
    if (this.disposed || !this.canAct()) return;
    this.confirmingForget = true; this.publishInterface();
    let settled: boolean = false;
    const finish = (): boolean => {
      if (settled) return false;
      settled = true;
      if (!this.disposed) { this.confirmingForget = false; this.publishInterface(); }
      return true;
    };
    try {
      this.getUIContext().showAlertDialog({
        title: $r('app.string.device_link_forget'),
        message: namedResourceText(this.getUIContext(), 'device_link_forget_confirm', peer.name),
        autoCancel: false,
        cancel: (): void => { finish(); },
        primaryButton: { value: $r('app.string.cancel'), action: (): void => { finish(); } },
        secondaryButton: { value: $r('app.string.device_link_forget'), action: (): void => {
          if (finish()) this.run(async (): Promise<void> => { await this.service!.forget(peer.id); });
        } }
      });
    } catch (error) {
      finish();
      if (!this.disposed) this.error = namedResourceText(this.getUIContext(), 'device_link_error');
    }
  }

  private showCode(): void {
    const service = this.service;
    if (service === null) return;
    this.run(async (): Promise<void> => {
      await service.createInvitation();
      if (this.disposed || !this.expanded) return;
      if (this.invitationTimer >= 0) clearTimeout(this.invitationTimer);
      this.invitationTimer = setTimeout((): void => {
        if (!this.disposed && this.service !== null) this.updateSnapshot(this.service.snapshot());
      }, 5 * 60 * 1000 + 100);
      this.codeVisible = true;
      try {
        this.codeDialog.open(this.createCodeDialog, (): boolean => {
          this.codeVisible = false; this.publishInterface(); return true;
        });
      } catch (error) { this.codeVisible = false; throw error as Error; }
      this.publishInterface();
    });
  }

  private closeCode(): void {
    if (this.disposed) return;
    this.codeDialog.close(); this.codeVisible = false; this.publishInterface();
  }

  private scanCode(): void {
    const service = this.service;
    if (service === null) return;
    this.run(async (): Promise<void> => {
      if (canIUse('SystemCapability.Multimedia.Scan.ScanBarcode')) {
        const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
        const result = await scanBarcode.startScanForResult(context,
          { scanTypes: [scanCore.ScanType.QR_CODE], enableMultiMode: false, enableAlbum: false });
        if (this.disposed) return;
        await service.pair(result.originalValue);
      } else {
        throw new Error('device_link_error');
      }
    });
  }

  @Builder
  private content() {
    Column({ space: 应用尺寸.间距_8 }) {
      Text($r('app.string.device_link_hint')).fontSize(应用尺寸.字号_正文_小)
        .fontColor($r('app.color.text_secondary')).width('100%')
      SettingsActionRow({ title: settingsItemText(this.getUIContext(), 'device_link_show_code', this.uiLanguage),
        showDisclosure: false, isInteractive: this.canAct(), onAction: (): void => { this.showCode(); } })
      SettingsActionRow({ title: settingsItemText(this.getUIContext(), 'device_link_scan', this.uiLanguage),
        showDisclosure: false, isInteractive: this.canAct(), onAction: (): void => { this.scanCode(); } })
      Text(settingsItemText(this.getUIContext(), 'device_link_devices', this.uiLanguage))
        .fontSize(应用尺寸.字号_按钮).fontColor($r('app.color.text_primary')).width('100%')
      if (this.snapshot.peers.length === 0) {
        Text($r('app.string.device_link_empty')).fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_secondary')).width('100%')
      }
      ForEach(this.snapshot.peers, (peer: DevicePeerView) => {
        Column() {
          Column({ space: 应用尺寸.间距_4 }) {
            Text(peer.name).fontSize(应用尺寸.字号_按钮).fontColor($r('app.color.text_primary')).width('100%')
            Text(peer.online ? $r('app.string.device_link_online') : $r('app.string.device_link_offline'))
              .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary')).width('100%')
          }.width('100%').padding({ top: 应用尺寸.间距_12, bottom: 应用尺寸.间距_8 })
          SettingsToggleRow({ title: settingsItemText(this.getUIContext(), 'device_progress_allow', this.uiLanguage),
            hint: $r('app.string.device_progress_allow_hint'), isOn: peer.allowProgress, isDark: this.是否深色,
            isInteractive: this.canAct(),
            onChange: (value: boolean): void => { this.run(async (): Promise<void> => { await this.service!.allowProgress(peer.id, value); }); } })
          if (peer.allowProgress) {
            SettingsActionRow({ title: settingsItemText(this.getUIContext(), 'device_link_connect', this.uiLanguage),
              icon: settingsIcon('device_link'), showDisclosure: false,
              isInteractive: this.canAct() && peer.online,
              onAction: (): void => { this.run(async (): Promise<void> => { await this.service!.mergeProgress(peer.id); }); } })
          }
          if (this.progressText(peer.id) !== '') {
            Text(this.progressText(peer.id)).fontSize(应用尺寸.字号_正文_小)
              .fontColor($r('app.color.text_secondary')).width('100%')
          }
          SettingsActionRow({ title: settingsItemText(this.getUIContext(), 'device_link_forget', this.uiLanguage),
            showDisclosure: false, isInteractive: this.canAct(),
            onAction: (): void => { this.forgetDevice(peer); } })
        }.width('100%')
      }, (peer: DevicePeerView): string => peer.id)
      SettingsActionRow({ title: settingsItemText(this.getUIContext(), 'device_progress_all', this.uiLanguage),
        icon: settingsIcon('device_link'), showDisclosure: false,
        isInteractive: this.canAct() && this.snapshot.peers.some((peer: DevicePeerView): boolean => peer.allowProgress && peer.online),
        onAction: (): void => { this.run(async (): Promise<void> => { await this.service!.mergeAllProgress(); }); } })
    }.width('100%').alignItems(HorizontalAlign.Start)
  }

  @Builder
  private groupContent() {
    Column({ space: 应用尺寸.间距_8 }) {
      SettingsActionRow({ title: settingsItemText(this.getUIContext(), 'device_link_toggle', this.uiLanguage),
        expanded: this.expanded, isInteractive: !this.confirmingForget && !this.codeVisible,
        onAction: (): void => { this.toggleExpanded(); } })
      if (this.expanded) { this.content() }
      if (this.snapshot.progressBusy) {
        Text($r('app.string.device_progress_working')).fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_secondary')).width('100%')
        SettingsActionRow({ title: settingsItemText(this.getUIContext(), 'device_progress_cancel', this.uiLanguage),
          showDisclosure: false, onAction: (): void => { this.cancelProgress(); } })
      }
      if (this.busy && !this.snapshot.progressBusy) {
        Text($r('app.string.device_link_working')).fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_secondary')).width('100%')
      }
      if (this.error !== '') { Text(this.error).fontColor($r('app.color.text_secondary')).width('100%') }
    }.width('100%').alignItems(HorizontalAlign.Start)
      .onAreaChange((_oldArea: Area, newArea: Area): void => {
        this.reveal?.revealAfterLayout(this.expanded, Number(newArea.height));
      })
  }

  build() {
    设置分组卡片({ groupId: 'device_link', showHeader: false, 是否深色: this.是否深色, 内容: (): void => { this.groupContent(); } })
  }
}
