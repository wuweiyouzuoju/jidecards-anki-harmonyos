// SPDX-License-Identifier: AGPL-3.0-or-later
import type { 官方公告展示项 } from './官方公告模型';

/** 公告请求、待展示结果与进程内确认；页面负责何时可展示，不把网络结果直接等同弹窗。 */
export class HomeAnnouncementController {
  private pending: 官方公告展示项 | null = null;
  private confirmed: Set<string> = new Set<string>();
  private generation: number = 0;
  private disposed: boolean = false;
  private checking: boolean = false;

  async check(load: () => Promise<官方公告展示项 | null>,
    isConfirmed: (id: string) => Promise<boolean>): Promise<boolean> {
    if (this.disposed || this.checking) return false;
    const generation: number = this.generation;
    this.checking = true;
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
    this.disposed = true;
    this.generation++;
    this.pending = null;
  }
}
