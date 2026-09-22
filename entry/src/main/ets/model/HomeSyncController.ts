// SPDX-License-Identifier: AGPL-3.0-or-later

import { decideHomeSync } from './HomeSyncPolicy';
import type { HomeActivityState } from './HomeActivityPolicy';
import { AutoSyncScheduler } from './AutoSyncScheduler';
import { SyncActivity } from './SyncSettings';
import type { SyncAuth } from '../proto/messages/SyncMessages';

export interface HomeSyncHost {
  activity: () => HomeActivityState;
  syncCollectionBusy: () => boolean;
  isDisposed: () => boolean;
  isForeground: () => boolean;
  isPanelOpen: () => boolean;
  pageDepth: () => number;
  pathNames: () => string[];
  loadState: () => string;
  startupReady: () => boolean;
  externalImportPending: () => boolean;
  autoSyncEnabled: () => boolean;
  auth: () => SyncAuth | null;
  username: () => string;
  setStatus: (resourceKey: string | null) => void;
  notifyWait: () => void;
  popPage: () => void;
  requestPanelDetails: () => void;
  openPanel: (auth: SyncAuth, automatic: boolean, username: string) => void;
  closePanel: () => void;
  setCollectionBusy: (busy: boolean) => void;
  setPanelModal: (modal: boolean) => void;
  refreshAfterCollection: () => Promise<void>;
  presentFsrsWarning: () => Promise<void>;
  activityChanged: () => void;
}

export interface HomeSyncClock {
  now: () => number;
  setTimeout: (callback: () => void, delay: number) => number;
  clearTimeout: (timer: number) => void;
}

/**
 * 首页同步的唯一运行时控制器。
 * 页面只提供当前占用事实和 UI 回调；定时器、等待动作及同步后的异步收尾都在这里拥有。
 */
export class HomeSyncController {
  private readonly scheduler: AutoSyncScheduler;
  private readonly activity: SyncActivity;
  private readonly hostFactory: () => HomeSyncHost;
  private readonly clock: HomeSyncClock;
  private timer: number = -1;
  private pendingAction: (() => void) | null = null;
  private pendingFsrsWarning: boolean = false;
  private refreshing: boolean = false;
  private disposed: boolean = false;
  private timerGeneration: number = 0;

  constructor(scheduler: AutoSyncScheduler, activity: SyncActivity,
    hostFactory: () => HomeSyncHost,
    clock: HomeSyncClock = { now: (): number => Date.now(),
      setTimeout: (callback: () => void, delay: number): number => setTimeout(callback, delay),
      clearTimeout: (timer: number): void => clearTimeout(timer) }) {
    this.scheduler = scheduler;
    this.activity = activity;
    this.hostFactory = hostFactory;
    this.clock = clock;
  }

  hasDeferredNavigation(): boolean {
    return this.pendingAction !== null;
  }

  isRefreshing(): boolean {
    return this.refreshing;
  }

  hasPendingFsrsWarning(): boolean {
    return this.pendingFsrsWarning;
  }

  request(): void {
    if (this.disposed) return;
    const host: HomeSyncHost = this.hostFactory();
    if (host.isDisposed() || host.isPanelOpen()) return;
    this.scheduler.request();
  }

  foregroundChanged(): void {
    if (this.disposed) return;
    const host: HomeSyncHost = this.hostFactory();
    if (host.isForeground()) {
      host.activityChanged();
      this.request();
    } else {
      this.pendingAction = null;
      this.stopTimer();
    }
  }

  schedule(): void {
    const host: HomeSyncHost = this.hostFactory();
    if (this.disposed || host.isDisposed() || this.timer >= 0 || !host.isForeground() || host.isPanelOpen() ||
      !this.scheduler.hasPending() ||
      (!this.scheduler.isManualPending() && !this.isLocationSafe(host))) return;
    const delay: number = this.scheduler.isManualPending() ? 1000 : 3000;
    const generation: number = this.timerGeneration;
    this.timer = this.clock.setTimeout((): void => {
      if (generation !== this.timerGeneration) return;
      this.timer = -1;
      if (this.disposed) return;
      this.tryStart();
      this.schedule();
    }, delay);
  }

  stopTimer(): void {
    this.timerGeneration++;
    if (this.timer >= 0) this.clock.clearTimeout(this.timer);
    this.timer = -1;
  }

  isLocationSafe(host: HomeSyncHost = this.hostFactory()): boolean {
    if (!this.scheduler.canSync()) return false;
    if (host.pageDepth() === 0) return true;
    return this.scheduler.isStudyComplete() && host.pageDepth() === 1 &&
      host.pathNames()[0] === 'StudyPage';
  }

  tryStart(): void {
    const host: HomeSyncHost = this.hostFactory();
    if (this.disposed || host.isDisposed()) return;
    const manual: boolean = this.scheduler.isManualPending();
    const decision: string = decideHomeSync({
      pending: this.scheduler.hasPending(),
      manual: manual,
      enabled: host.autoSyncEnabled(),
      authenticated: host.auth() !== null,
      foreground: host.isForeground(),
      locationSafe: this.isLocationSafe(host),
      externalImportPending: host.externalImportPending(),
      startupReady: host.startupReady(),
      panelOpen: host.isPanelOpen(),
      transferActive: this.activity.isActive(),
      automaticAllowed: this.activity.canAutoSync(this.clock.now()),
      activity: host.activity()
    });
    if (decision === 'drop') {
      this.scheduler.consume();
      if (manual) host.setStatus(null);
      this.stopTimer();
      return;
    }
    if (decision !== 'start') {
      if (manual) this.updateStatus(host);
      if (decision === 'pause') this.stopTimer();
      return;
    }
    const auth: SyncAuth | null = host.auth();
    if (auth === null) return;
    this.scheduler.consume();
    this.stopTimer();
    this.activity.reserveCollection();
    host.setCollectionBusy(true);
    host.openPanel(auth, !manual, host.username());
  }

  defer(action: () => void, study: boolean = false): boolean {
    const host: HomeSyncHost = this.hostFactory();
    if (this.disposed || host.isDisposed()) return true;
    const collectionBusy: boolean = host.syncCollectionBusy() || this.refreshing;
    if (!collectionBusy) return false;
    this.pendingAction = action;
    if (study && (this.activity.requestStudyPriority() || this.refreshing)) return true;
    host.notifyWait();
    return true;
  }

  requestManual(): void {
    if (this.disposed) return;
    const host: HomeSyncHost = this.hostFactory();
    this.stopTimer();
    host.popPage();
    if (host.isPanelOpen()) {
      host.requestPanelDetails();
      return;
    }
    host.setStatus('sync_pending');
    this.scheduler.requestManual();
  }

  updateStatus(host: HomeSyncHost = this.hostFactory()): void {
    if (this.disposed || host.isDisposed()) return;
    const activity: HomeActivityState = host.activity();
    let key: string = 'sync_pending';
    if (!this.scheduler.canSync()) key = 'sync_wait_study';
    else if (!this.isLocationSafe(host)) key = 'sync_wait_home';
    else if (host.externalImportPending()) key = 'sync_wait_import';
    else if (host.loadState() === 'error') key = 'sync_wait_load_failed';
    else if (!activity.collectionReady) key = 'sync_wait_load';
    else if (activity.dialogOpen) key = 'sync_wait_dialog';
    else if (activity.collectionBusy || activity.interactionBusy) key = 'sync_wait_operation';
    else if (this.activity.isActive()) key = 'sync_wait_transfer';
    host.setStatus(key);
  }

  yielded(automatic: boolean): void {
    if (this.disposed) return;
    if (automatic) this.scheduler.request();
    else this.scheduler.requestManual();
  }

  closePanel(): void {
    const host: HomeSyncHost = this.hostFactory();
    if (this.disposed) return;
    host.closePanel();
    host.setStatus(this.scheduler.isManualPending() ? 'sync_pending' : null);
    this.setPanelState(false, false);
    this.flush();
    this.schedule();
  }

  flush(): void {
    const host: HomeSyncHost = this.hostFactory();
    const activity: HomeActivityState = host.activity();
    if (this.disposed || host.syncCollectionBusy() || this.refreshing || activity.dialogOpen) return;
    const action: (() => void) | null = this.pendingAction;
    this.pendingAction = null;
    if (action !== null && host.isForeground() && host.pageDepth() === 0 && host.loadState() !== 'error') action();
  }

  async collectionFinished(fsrsDisabledBySync: boolean): Promise<void> {
    const host: HomeSyncHost = this.hostFactory();
    if (this.disposed || host.isDisposed()) return;
    this.pendingFsrsWarning = this.pendingFsrsWarning || fsrsDisabledBySync;
    this.refreshing = true;
    host.setCollectionBusy(false);
    try {
      await host.refreshAfterCollection();
    } finally {
      this.refreshing = false;
      this.flush();
      await this.presentPendingWarning();
      if (!this.disposed && !host.isDisposed()) host.activityChanged();
    }
  }

  async presentPendingWarning(): Promise<void> {
    const host: HomeSyncHost = this.hostFactory();
    const activity: HomeActivityState = host.activity();
    if (this.disposed || host.isDisposed() || !this.pendingFsrsWarning || !host.isForeground() ||
      host.pageDepth() !== 0 || this.pendingAction !== null || host.syncCollectionBusy() ||
      this.refreshing || activity.dialogOpen) return;
    this.pendingFsrsWarning = false;
    try {
      await host.presentFsrsWarning();
    } finally {
      if (!this.disposed && !host.isDisposed()) host.activityChanged();
    }
  }

  panelStateChanged(busy: boolean, modal: boolean): void {
    const host: HomeSyncHost = this.hostFactory();
    if (this.disposed || host.isDisposed()) return;
    host.setCollectionBusy(busy);
    host.setPanelModal(modal);
    this.flush();
  }

  cancel(): void {
    this.pendingAction = null;
  }

  dispose(): void {
    this.disposed = true;
    this.pendingAction = null;
    this.pendingFsrsWarning = false;
    this.stopTimer();
  }

  private setPanelState(busy: boolean, modal: boolean): void {
    const host: HomeSyncHost = this.hostFactory();
    host.setCollectionBusy(busy);
    host.setPanelModal(modal);
  }
}
