// SPDX-License-Identifier: AGPL-3.0-or-later
import type { 官方公告展示项 } from './官方公告模型';
import { 官方公告检查延迟毫秒 } from './官方公告模型';

export interface AnnouncementTimer {
  schedule(work: () => void, delay: number): number;
  cancel(id: number): void;
}

/** 公告请求、待展示结果与进程内确认；页面负责何时可展示，不把网络结果直接等同弹窗。 */
export class HomeAnnouncementController {
  private pending: 官方公告展示项 | null = null;
  private confirmed: Set<string> = new Set<string>();
  private generation: number = 0;
  private disposed: boolean = false;
  private checking: boolean = false;
  private lastCheck: number = 0;
  private timerId: number = -1;
  private timerGeneration: number = 0;
  private timer: AnnouncementTimer;

  constructor(timer: AnnouncementTimer = {
    schedule: (work: () => void, delay: number): number => setTimeout(work, delay),
    cancel: (id: number): void => clearTimeout(id)
  }) { this.timer = timer; }

  isChecking(): boolean { return this.checking; }

  request(allowed: () => boolean, check: () => Promise<boolean>, now: number): void {
    if (this.disposed || this.checking || this.pending !== null || this.timerId >= 0 || !allowed()) return;
    const delay: number = 官方公告检查延迟毫秒(this.lastCheck, now);
    if (delay === 0) { check().catch((): void => {}); return; }
    const generation: number = this.timerGeneration;
    this.timerId = this.timer.schedule((): void => {
      if (generation !== this.timerGeneration || this.disposed) return;
      this.timerId = -1;
      if (allowed()) check().catch((): void => {});
    }, delay);
  }

  pause(): void {
    this.timerGeneration++;
    if (this.timerId >= 0) this.timer.cancel(this.timerId);
    this.timerId = -1;
  }

  async check(load: () => Promise<官方公告展示项 | null>,
    isConfirmed: (id: string) => Promise<boolean>): Promise<boolean> {
    if (this.disposed || this.checking) return false;
    const generation: number = this.generation;
    this.checking = true;
    this.lastCheck = Date.now();
    try {
      const item: 官方公告展示项 | null = await load();
      if (item === null || this.confirmed.has(item.id) || await isConfirmed(item.id)) return false;
      if (this.disposed || generation !== this.generation || this.confirmed.has(item.id)) return false;
      this.pending = item;
      return true;
    } finally {
      this.checking = false;
    }
  }

  takePending(allowed: boolean): 官方公告展示项 | null {
    if (!allowed || this.disposed) return null;
    const item: 官方公告展示项 | null = this.pending;
    this.pending = null;
    return item !== null && !this.confirmed.has(item.id) ? item : null;
  }

  hasPending(): boolean { return this.pending !== null; }

  confirm(id: string): void {
    this.confirmed.add(id);
    if (this.pending !== null && this.pending.id === id) this.pending = null;
  }

  dispose(): void {
    this.pause();
    this.disposed = true;
    this.generation++;
    this.pending = null;
  }
}
