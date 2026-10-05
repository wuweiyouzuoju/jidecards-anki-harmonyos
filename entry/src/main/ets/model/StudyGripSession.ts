// SPDX-License-Identifier: AGPL-3.0-or-later
import type { StudyGripAvailability, StudyToolbarSide } from './StudyLayout';

export interface StudyGripSource {
  start(listener: (status: number) => void): StudyGripAvailability;
  stop(): boolean;
}

export interface StudyGripHost {
  schedule(callback: () => void, delayMs: number): number;
  cancel(timer: number): void;
  move(side: StudyToolbarSide): void;
  report(availability: StudyGripAvailability): void;
}

/** 单一监听拥有者；所有事件只产生布局效果，不拥有卡片操作或评分权限。 */
export class StudyGripSession {
  private source: StudyGripSource;
  private host: StudyGripHost;
  private active: boolean = false;
  private touching: boolean = false;
  private generation: number = 0;
  private timer: number = -1;
  private timerGeneration: number = 0;
  private side: StudyToolbarSide = 'right';
  private pending: StudyToolbarSide | null = null;

  constructor(source: StudyGripSource, host: StudyGripHost) {
    this.source = source;
    this.host = host;
  }

  restoreSide(side: StudyToolbarSide): void { this.side = side; }

  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    this.generation++;
    this.clearPending();
    if (!active) {
      if (!this.source.stop()) this.host.report('failed');
      return;
    }
    const generation: number = this.generation;
    // 若上次取消失败，先释放旧 callback；禁止叠加第二个监听。
    if (!this.source.stop()) { this.host.report('failed'); return; }
    const availability: StudyGripAvailability = this.source.start((status: number): void => {
      if (this.active && generation === this.generation) this.receive(status);
    });
    if (availability !== 'available') this.clearPending();
    this.host.report(availability);
  }

  setTouching(touching: boolean): void {
    this.touching = touching;
    this.cancelTimer();
    if (!touching) this.scheduleMove();
  }

  dispose(): void {
    this.active = false;
    this.generation++;
    this.touching = false;
    this.clearPending();
    if (!this.source.stop()) this.host.report('failed');
  }

  private receive(status: number): void {
    const side: StudyToolbarSide | null = status === 1 ? 'left' : status === 2 ? 'right' : null;
    if (side === null || side === this.side) { this.clearPending(); return; }
    if (side === this.pending) return;
    this.pending = side;
    this.cancelTimer();
    this.scheduleMove();
  }

  private scheduleMove(): void {
    if (!this.active || this.touching || this.pending === null || this.timer >= 0) return;
    const generation: number = this.generation;
    const timerGeneration: number = ++this.timerGeneration;
    this.timer = this.host.schedule((): void => {
      if (timerGeneration !== this.timerGeneration || generation !== this.generation) return;
      this.timer = -1;
      if (!this.active || generation !== this.generation || this.touching || this.pending === null) return;
      const side: StudyToolbarSide = this.pending;
      this.pending = null;
      this.side = side;
      this.host.move(side);
    }, 250);
  }

  private cancelTimer(): void {
    this.timerGeneration++;
    if (this.timer >= 0) { this.host.cancel(this.timer); this.timer = -1; }
  }

  private clearPending(): void { this.cancelTimer(); this.pending = null; }
}
