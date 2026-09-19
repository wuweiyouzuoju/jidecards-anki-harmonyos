// SPDX-License-Identifier: AGPL-3.0-or-later

/** 合并同步意图；学习中的集合读取/写入优先于自动同步。实际数据仍由 Anki 持久化。 */
export class AutoSyncScheduler {
  private pending: boolean = false;
  private studies: Map<Object, boolean> = new Map<Object, boolean>();
  private operations: Set<Object> = new Set<Object>();
  private listener: (() => void) | null = null;

  setListener(listener: (() => void) | null): void {
    this.listener = listener;
    if (this.pending) this.wake();
  }

  request(): void {
    this.pending = true;
    this.wake();
  }

  hasPending(): boolean { return this.pending; }

  /** 仅在挂载同步任务时消费；之后的新写入自然进入下一轮。 */
  consume(): void { this.pending = false; }

  setStudyActive(owner: Object, active: boolean): void {
    this.studies.set(owner, active);
    if (!active) this.wake();
  }

  removeStudy(owner: Object): void {
    this.studies.delete(owner);
    this.wake();
  }

  canSync(): boolean {
    if (this.operations.size > 0) return false;
    for (const active of this.studies.values()) {
      if (active) return false;
    }
    return true;
  }

  /** 离页仍在执行的数据操作独立占用，不影响学习完成页的身份判断。 */
  beginOperation(owner: Object): void { this.operations.add(owner); }

  endOperation(owner: Object): void {
    this.operations.delete(owner);
    this.wake();
  }

  isStudyComplete(): boolean {
    return this.studies.size === 1 && this.canSync();
  }

  private wake(): void {
    if (this.pending && this.listener !== null) this.listener();
  }
}

export const autoSyncScheduler: AutoSyncScheduler = new AutoSyncScheduler();
