// SPDX-License-Identifier: AGPL-3.0-or-later

export class CollectionMaintenanceState {
  checking: boolean = false;
  checked: boolean = false;
  problems: string[] = [];
  error: string = '';
  clearingTags: boolean = false;
}

/** 操作拥有忙碌状态，UI 只订阅快照；离页不取消已接受的集合维护。 */
export class CollectionMaintenanceSession {
  private readonly state: CollectionMaintenanceState = new CollectionMaintenanceState();
  private listener: ((state: CollectionMaintenanceState) => void) | null = null;

  attach(listener: (state: CollectionMaintenanceState) => void): void {
    this.listener = listener;
    this.publish();
  }

  detach(): void {
    this.listener = null;
  }

  private publish(): void {
    const snapshot: CollectionMaintenanceState = new CollectionMaintenanceState();
    snapshot.checking = this.state.checking;
    snapshot.checked = this.state.checked;
    snapshot.problems = this.state.problems.slice();
    snapshot.error = this.state.error;
    snapshot.clearingTags = this.state.clearingTags;
    if (this.listener !== null) this.listener(snapshot);
  }

  async checkDatabase(check: () => Promise<string[]>): Promise<void> {
    if (this.listener === null || this.state.checking) return;
    this.state.checking = true;
    this.state.checked = false;
    this.state.problems = [];
    this.state.error = '';
    this.publish();
    try {
      this.state.problems = (await check()).slice();
      this.state.checked = true;
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : `${error}`;
    } finally {
      this.state.checking = false;
      this.publish();
    }
  }

  /** null 表示未接受重复/离页请求；失败向仍存活的 UI 报告。 */
  async clearUnusedTags(clear: () => Promise<number>): Promise<number | null> {
    if (this.listener === null || this.state.clearingTags) return null;
    this.state.clearingTags = true;
    this.publish();
    try {
      return await clear();
    } finally {
      this.state.clearingTags = false;
      this.publish();
    }
  }
}
