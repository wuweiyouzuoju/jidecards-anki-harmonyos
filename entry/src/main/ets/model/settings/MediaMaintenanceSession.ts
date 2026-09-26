// SPDX-License-Identifier: AGPL-3.0-or-later
import { autoSyncScheduler } from '../AutoSyncScheduler';
import type { MediaSnapshotPage } from '../../proto/messages/MediaSnapshotMessages';

export interface MediaMaintenanceBackend {
  createSnapshot(): Promise<MediaSnapshotPage>;
  reportPage(token: number, offset: number): Promise<MediaSnapshotPage>;
  trashSnapshot(token: number): Promise<void>;
  releaseSnapshot(token: number): Promise<void>;
  emptyTrash(): Promise<void>;
  restoreTrash(): Promise<void>;
  isSyncing(): Promise<boolean>;
}
export class MediaMaintenanceState {
  revision: number = 0;
  busy: boolean = false;
  checked: boolean = false;
  unusedCount: number = 0;
  missingCount: number = 0;
  reports: string[] = [];
  haveTrash: boolean = false;
  next: boolean = false;
  error: string = '';
}

/** 面板只展示快照。操作独占状态；离页停止发布，已接受写入完成后释放原生快照。 */
export class MediaMaintenanceSession {
  private backend: MediaMaintenanceBackend;
  private publish: (state: MediaMaintenanceState) => void;
  private state: MediaMaintenanceState = new MediaMaintenanceState();
  private token: number = 0;
  private nextOffset: number = 0;
  private disposed: boolean = false;

  constructor(backend: MediaMaintenanceBackend, publish: (state: MediaMaintenanceState) => void) {
    this.backend = backend;
    this.publish = publish;
  }
  dispose(): void {
    this.disposed = true;
    if (!this.state.busy) this.release();
  }
  private emit(): void {
    if (this.disposed) return;
    const state = new MediaMaintenanceState();
    state.revision = this.token;
    state.busy = this.state.busy; state.checked = this.state.checked;
    state.unusedCount = this.state.unusedCount; state.missingCount = this.state.missingCount;
    state.reports = this.state.reports.slice(); state.haveTrash = this.state.haveTrash;
    state.next = this.nextOffset !== 0;
    state.error = this.state.error;
    this.publish(state);
  }
  private async release(): Promise<void> {
    const token: number = this.token;
    this.token = 0;
    if (token === 0) return;
    try { await this.backend.releaseSnapshot(token); }
    catch { /* Recheck/backend close may already have released this exact token. */ }
  }
  private apply(page: MediaSnapshotPage): void {
    this.token = page.token;
    this.nextOffset = page.nextOffset;
    this.state.checked = true;
    this.state.unusedCount = page.unusedCount;
    this.state.missingCount = page.missingCount;
    this.state.haveTrash = page.haveTrash;
  }
  async check(): Promise<void> { await this.run('check'); }
  async trash(): Promise<void> { if (this.token !== 0) await this.run('trash'); }
  async empty(): Promise<void> { await this.run('empty'); }
  async restore(): Promise<void> { await this.run('restore'); }
  async loadMore(): Promise<void> {
    if (this.nextOffset !== 0) await this.run('next');
  }
  private async run(action: string): Promise<void> {
    if (this.disposed || this.state.busy) return;
    this.state.busy = true; this.state.error = '';
    autoSyncScheduler.beginOperation(this);
    this.emit();
    try {
      if (action === 'next') {
        const page = await this.backend.reportPage(this.token, this.nextOffset);
        this.apply(page);
        this.state.reports.push(page.report);
      } else {
        if (await this.backend.isSyncing()) throw new Error('Media sync active');
        // Disposal while checking preconditions must not start a new write.
        if (this.disposed) return;
        if (action === 'trash') await this.backend.trashSnapshot(this.token);
        if (action === 'empty') await this.backend.emptyTrash();
        if (action === 'restore') await this.backend.restoreTrash();
        if (!this.disposed) {
          const page = await this.backend.createSnapshot();
          this.apply(page); this.state.reports = [page.report];
        }
      }
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : `${error}`;
      this.state.checked = false;
      await this.release();
    } finally {
      this.state.busy = false;
      autoSyncScheduler.endOperation(this);
      if (this.disposed) await this.release(); else this.emit();
    }
  }
}
