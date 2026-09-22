// SPDX-License-Identifier: AGPL-3.0-or-later
import { AutoSyncScheduler, autoSyncScheduler } from './AutoSyncScheduler';

export interface BackupBackend {
  create(force: boolean): Promise<boolean>;
  list(): Promise<string[]>;
  restore(name: string): Promise<void>;
}

export function isBackupName(name: string): boolean {
  return new RegExp('^backup-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{2}\\.[0-9]{2}\\.[0-9]{2}\\.colpkg$').test(name);
}

/** 自动创建、手动创建和恢复共用互斥；Core 独占决定时间间隔和归档保留。 */
export class BackupCoordinator {
  private busy: boolean = false;
  private lastAttempt: number = -1;
  private scheduler: AutoSyncScheduler;
  constructor(scheduler: AutoSyncScheduler = autoSyncScheduler) { this.scheduler = scheduler; }
  isBusy(): boolean { return this.busy; }

  async automatic(backend: BackupBackend, now: number, allowed: () => boolean): Promise<boolean> {
    if (this.busy || !allowed() || !this.scheduler.canSync() ||
      (this.lastAttempt >= 0 && now >= this.lastAttempt && now - this.lastAttempt < 60000)) return false;
    this.lastAttempt = now;
    return this.run((): Promise<boolean> => backend.create(false));
  }

  create(backend: BackupBackend): Promise<boolean> {
    return this.run((): Promise<boolean> => backend.create(true));
  }

  async restore(backend: BackupBackend, name: string, confirmed: boolean): Promise<void> {
    if (!confirmed || !isBackupName(name)) throw new Error('Invalid or unconfirmed backup restore');
    await this.run(async (): Promise<boolean> => { await backend.restore(name); return true; });
  }

  private async run(action: () => Promise<boolean>): Promise<boolean> {
    if (this.busy) throw new Error('Backup operation already running');
    this.busy = true;
    this.scheduler.beginOperation(this);
    try { return await action(); }
    finally { this.busy = false; this.scheduler.endOperation(this); }
  }
}

export const backupCoordinator: BackupCoordinator = new BackupCoordinator();
