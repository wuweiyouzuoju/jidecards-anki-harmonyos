// SPDX-License-Identifier: AGPL-3.0-or-later
import { AutoSyncScheduler, autoSyncScheduler } from './AutoSyncScheduler';
import { SyncActivity, syncActivity } from './SyncSettings';

export interface BrowserOperationEffects {
  afterCommit: () => Promise<void>;
  changed: () => void;
  failed: (error: Error) => void;
  refreshFailed: (error: Error) => void;
}

/** 单次操作的不可变输入；字段/映射等额外参数须在调用前复制。 */
export interface BrowserOperationContext {
  mode: string;
  ids: number[];
  viewVersion: number;
  selectionVersion: number;
}

/** 允许更换浏览上下文，但写入串行，完成只能清理原选择，离页不撤销已接受的写入。 */
export class BrowserOperationController {
  private active: BrowserOperationContext | null = null;
  private disposed: boolean = false;

  begin(mode: string, ids: number[], viewVersion: number, selectionVersion: number): BrowserOperationContext | null {
    if (this.disposed || this.active !== null) return null;
    const context: BrowserOperationContext = { mode, ids: ids.slice(), viewVersion, selectionVersion };
    this.active = context;
    return context;
  }

  isCurrent(context: BrowserOperationContext, mode: string, ids: number[],
    viewVersion: number, selectionVersion: number): boolean {
    return this.isAlive() && this.active === context && context.mode === mode &&
      context.viewVersion === viewVersion && context.selectionVersion === selectionVersion &&
      context.ids.length === ids.length && context.ids.every((id: number, index: number): boolean => id === ids[index]);
  }

  finish(context: BrowserOperationContext): void {
    if (this.active === context) this.active = null;
  }

  /** 写入结果和刷新结果分开；刷新失败不能诱导用户重复执行已经提交的写入。 */
  async execute(context: BrowserOperationContext, write: (selection: BrowserOperationContext) => Promise<void>,
    effects: BrowserOperationEffects, scheduler: AutoSyncScheduler = autoSyncScheduler,
    activity: SyncActivity = syncActivity): Promise<boolean> {
    if (this.active !== context) return false;
    scheduler.beginOperation(context);
    let committed: boolean = false;
    try {
      await activity.waitForCollection();
      try {
        await write(context);
        committed = true;
      } catch (error) {
        if (this.isAlive()) effects.failed(error instanceof Error ? error : new Error(`${error}`));
        return false;
      }
      if (this.isAlive()) {
        try { await effects.afterCommit(); }
        catch (error) {
          if (this.isAlive()) effects.refreshFailed(error instanceof Error ? error : new Error(`${error}`));
        }
      }
      return true;
    } finally {
      try {
        if (committed) { scheduler.request(); effects.changed(); }
      } finally {
        this.finish(context);
        scheduler.endOperation(context);
      }
    }
  }

  isAlive(): boolean { return !this.disposed; }
  isBusy(): boolean { return this.active !== null; }
  dispose(): void { this.disposed = true; }
}
