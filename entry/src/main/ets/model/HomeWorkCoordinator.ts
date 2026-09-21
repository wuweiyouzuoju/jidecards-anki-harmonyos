// SPDX-License-Identifier: AGPL-3.0-or-later
import { ExternalDeckOpenQueue } from './ExternalDeckOpen';
import { canPresentHomePrompt } from './HomeActivityPolicy';
import type { HomeActivityState } from './HomeActivityPolicy';

export interface HomeWorkClock {
  schedule: (work: () => void) => number;
  cancel: (id: number) => void;
}

/** 页面提供当前事实与 UI 效果；控制器不保存页面可变状态。 */
export interface HomeWorkHost {
  activity: () => HomeActivityState;
  hasDeferredNavigation: () => boolean;
  importDeck: (uri: string) => Promise<void>;
  importFailed: (error: Error) => void;
  flushNavigation: () => void;
  manualSyncPending: () => boolean;
  startManualSync: () => void;
  presentAnnouncement: () => boolean;
  continueStartup: () => void;
  scheduleSync: () => void;
}

/**
 * 合并首页唤醒并按用户任务、手动同步、启动提示的顺序分配空闲时间。
 * Invariants: 每轮副作用后重新读取占用；已接受导入继续完成，销毁后不再调用页面。
 * Extension Points: 新增首页任务在此明确优先级，页面只实现效果与占用映射。
 */
export class HomeWorkCoordinator {
  private queue: ExternalDeckOpenQueue;
  private clock: HomeWorkClock;
  private timer: number = -1;
  private disposed: boolean = false;

  constructor(queue: ExternalDeckOpenQueue, clock: HomeWorkClock) {
    this.queue = queue;
    this.clock = clock;
  }

  wake(host: HomeWorkHost): void {
    if (this.disposed || this.timer >= 0) return;
    this.timer = this.clock.schedule((): void => {
      this.timer = -1;
      if (!this.disposed) this.run(host);
    });
  }

  private run(host: HomeWorkHost): void {
    const activity: HomeActivityState = host.activity();
    if (this.queue.hasPending()) {
      if (!activity.collectionReady || !canPresentHomePrompt(activity) || host.hasDeferredNavigation()) return;
      const uri: string | null = this.queue.begin();
      if (uri !== null) this.importDeck(host, uri);
      return;
    }
    if (!canPresentHomePrompt(activity)) return;
    host.flushNavigation();
    if (this.disposed) return;
    if (this.queue.hasPending()) {
      this.wake(host);
      return;
    }
    if (!canPresentHomePrompt(host.activity())) return;
    if (host.manualSyncPending()) {
      host.startManualSync();
      if (!this.disposed) host.scheduleSync();
      return;
    }
    if (host.presentAnnouncement() || this.disposed) return;
    host.continueStartup();
    if (!this.disposed) host.scheduleSync();
  }

  private async importDeck(host: HomeWorkHost, uri: string): Promise<void> {
    try {
      await host.importDeck(uri);
    } catch (error) {
      if (!this.disposed) host.importFailed(error as Error);
    } finally {
      this.queue.finish();
      this.wake(host);
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer >= 0) this.clock.cancel(this.timer);
    this.timer = -1;
  }
}
