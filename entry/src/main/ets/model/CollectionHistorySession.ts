// SPDX-License-Identifier: AGPL-3.0-or-later
import type { UndoStatus } from '../proto/messages/CollectionMessages';
import { autoSyncScheduler } from './AutoSyncScheduler';
import { syncActivity } from './SyncSettings';

export interface CollectionHistoryBackend {
  status(): Promise<UndoStatus>;
  apply(redo: boolean, expected: UndoStatus): Promise<void>;
}
export class CollectionHistoryState {
  status: UndoStatus | null = null;
  busy: boolean = false;
  error: string = '';
  errorDetail: string = '';
}

/** Reads expire on disposal. Accepted writes complete and notify even after navigation. */
export class CollectionHistorySession {
  private backend: CollectionHistoryBackend;
  private publish: (state: CollectionHistoryState) => void;
  private refresh: () => Promise<void>;
  private changed: () => void;
  private state: CollectionHistoryState = new CollectionHistoryState();
  private disposed: boolean = false;
  constructor(backend: CollectionHistoryBackend, publish: (state: CollectionHistoryState) => void,
    refresh: () => Promise<void>, changed: () => void) {
    this.backend = backend; this.publish = publish; this.refresh = refresh; this.changed = changed;
  }
  dispose(): void { this.disposed = true; }
  private emit(): void {
    if (!this.disposed) this.publish({ status: this.state.status, busy: this.state.busy,
      error: this.state.error, errorDetail: this.state.errorDetail });
  }
  async load(): Promise<void> { await this.run(null); }
  async apply(redo: boolean): Promise<void> {
    const status: UndoStatus | null = this.state.status;
    if (status === null || (redo ? status.redo : status.undo) === '') return;
    await this.run(redo);
  }
  private async run(redo: boolean | null): Promise<void> {
    if (this.disposed || this.state.busy) return;
    this.state.busy = true; this.state.error = ''; this.state.errorDetail = '';
    autoSyncScheduler.beginOperation(this); this.emit();
    let committed: boolean = false;
    try {
      await syncActivity.waitForCollection();
      if (this.disposed) return;
      if (redo !== null && this.state.status !== null) {
        await this.backend.apply(redo, this.state.status);
        committed = true;
        this.state.status = null;
        this.changed(); autoSyncScheduler.request();
        if (!this.disposed) {
          try { await this.refresh(); }
          catch (error) {
            this.state.error = 'collection_history_refresh_error';
            this.state.errorDetail = error instanceof Error ? error.message : '';
          }
        }
      }
      if (!this.disposed) this.state.status = await this.backend.status();
    } catch (error) {
      this.state.status = null;
      const detail: string = error instanceof Error ? error.message : '';
      this.state.error = committed ? 'collection_history_refresh_error' : redo === null ? 'collection_history_load_error' :
        detail === 'collection_history_changed' ? 'collection_history_changed_error' : 'collection_history_apply_error';
      this.state.errorDetail = detail === 'collection_history_changed' ? '' : detail;
    } finally {
      this.state.busy = false; this.emit(); autoSyncScheduler.endOperation(this);
    }
  }
}
