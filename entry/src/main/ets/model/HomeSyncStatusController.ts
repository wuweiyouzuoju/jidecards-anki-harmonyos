// SPDX-License-Identifier: AGPL-3.0-or-later
import { SYNC_STATUS_REQUIRED } from '../proto/messages/SyncMessages';
import type { SyncAuth, SyncStatusResponse } from '../proto/messages/SyncMessages';

export interface HomeSyncStatusHost {
  auth: () => SyncAuth | null;
  canRead: () => boolean;
  read: (auth: SyncAuth) => Promise<SyncStatusResponse>;
  saveEndpoint: (endpoint: string) => void;
  changed: (state: string) => void;
  failed: () => void;
}

/** AnkiDroid 的空闲同步标记；实际任务仍由 HomeSyncController / SyncSession 拥有。 */
export class HomeSyncStatusController {
  private readonly host: HomeSyncStatusHost;
  private generation: number = 0;
  private dirty: boolean = true;
  private reading: boolean = false;
  private disposed: boolean = false;
  private lastAuth: SyncAuth | null = null;

  constructor(host: HomeSyncStatusHost) { this.host = host; }

  invalidate(): void {
    this.generation++;
    this.dirty = true;
  }

  async refresh(): Promise<void> {
    if (this.disposed) return;
    let generation: number = this.generation;
    let auth: SyncAuth | null = null;
    let ownsRead: boolean = false;
    try {
      auth = copyAuth(this.host.auth());
      if (!sameAuth(auth, this.lastAuth)) {
        this.lastAuth = auth;
        this.invalidate();
        if (auth !== null) this.host.changed('normal');
      }
      if (auth === null) {
        this.host.changed('not_logged_in');
        return;
      }
      if (!this.dirty || this.reading || !this.host.canRead()) return;
      generation = this.generation;
      this.dirty = false;
      this.reading = true;
      ownsRead = true;
      const result: SyncStatusResponse = await this.host.read(auth);
      if (!this.isCurrent(generation, auth)) {
        this.dirty = true;
        return;
      }
      if (result.newEndpoint !== '') this.host.saveEndpoint(result.newEndpoint);
      this.lastAuth = copyAuth(this.host.auth());
      this.host.changed(result.required === SYNC_STATUS_REQUIRED.FULL_SYNC ? 'one_way' :
        result.required === SYNC_STATUS_REQUIRED.NORMAL_SYNC ? 'pending_changes' : 'normal');
    } catch (_error) {
      // 与 AnkiDroid 一致：状态探测失败不等同于实际同步失败，不制造错误感叹号。
      this.host.failed();
      if (!this.disposed && generation === this.generation &&
        (auth === null || this.isCurrent(generation, auth))) this.host.changed('normal');
    } finally {
      if (ownsRead) {
        this.reading = false;
        if (this.dirty && !this.disposed) await this.refresh();
      }
    }
  }

  dispose(): void { this.disposed = true; this.invalidate(); }

  private isCurrent(generation: number, auth: SyncAuth): boolean {
    return !this.disposed && generation === this.generation && this.host.canRead() &&
      sameAuth(auth, this.host.auth());
  }
}

function sameAuth(left: SyncAuth | null, right: SyncAuth | null): boolean {
  if (left === null || right === null) return left === right;
  return left.hkey === right.hkey && left.endpoint === right.endpoint;
}

function copyAuth(auth: SyncAuth | null): SyncAuth | null {
  return auth === null ? null : { hkey: auth.hkey, endpoint: auth.endpoint, ioTimeoutSecs: auth.ioTimeoutSecs };
}

/** 任务进度、冲突和排队提示优先于空闲状态。 */
export function homeSyncIndicator(accountState: string, taskIndicator: string): string {
  if (taskIndicator !== 'hidden') return taskIndicator;
  if (accountState === 'not_logged_in' || accountState === 'one_way') return 'attention';
  return accountState === 'pending_changes' ? 'pending' : 'hidden';
}

export function homeSyncLabelKey(accountState: string, taskIndicator: string): string {
  if (taskIndicator !== 'hidden') return 'home_sync';
  if (accountState === 'not_logged_in') return 'home_sync_not_logged_in';
  if (accountState === 'one_way') return 'home_sync_one_way';
  return accountState === 'pending_changes' ? 'home_sync_pending_changes' : 'home_sync';
}
