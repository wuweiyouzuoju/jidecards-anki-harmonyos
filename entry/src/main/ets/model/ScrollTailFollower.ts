// SPDX-License-Identifier: AGPL-3.0-or-later
export interface ScrollTailClock {
  schedule(work: () => void, delay: number): number;
  cancel(timer: number): void;
}

export type ScrollTailChange = 'none' | 'paused' | 'resumed';

/** 自动跟随的公共状态与任务所有者；宿主仅提供滚动、可见性和原生手势事实。 */
export class ScrollTailFollower {
  private following: boolean = true;
  private disposed: boolean = false;
  private timer: number = -1;
  private generation: number = 0;
  private scrollToEnd: () => void;
  private canScroll: () => boolean;
  private delay: number;
  private clock: ScrollTailClock;

  constructor(scrollToEnd: () => void, canScroll: () => boolean, delay: number = 32,
    clock: ScrollTailClock = {
      schedule: (work: () => void, wait: number): number => setTimeout(work, wait),
      cancel: (timer: number): void => { clearTimeout(timer); }
    }) {
    this.scrollToEnd = scrollToEnd;
    this.canScroll = canScroll;
    this.delay = delay;
    this.clock = clock;
  }

  isFollowing(): boolean { return !this.disposed && this.following; }

  queue(): void {
    if (!this.isFollowing() || !this.canScroll() || this.timer >= 0) return;
    const generation: number = this.generation;
    this.timer = this.clock.schedule((): void => {
      if (generation !== this.generation) return;
      this.timer = -1;
      if (!this.isFollowing() || !this.canScroll()) return;
      try { this.scrollToEnd(); } catch (error) { /* 等下一次内容或布局更新重试。 */ }
    }, this.delay);
  }

  cancelPending(): void {
    this.generation++;
    if (this.timer >= 0) this.clock.cancel(this.timer);
    this.timer = -1;
  }

  pause(): void {
    this.following = false;
    this.cancelPending();
  }

  resume(): boolean {
    if (this.disposed) return false;
    const changed: boolean = !this.following;
    this.following = true;
    this.queue();
    return changed;
  }

  didScroll(yOffset: number, userDriven: boolean, atEnd: boolean): ScrollTailChange {
    if (this.disposed || !userDriven) return 'none';
    if (yOffset < 0) { this.pause(); return 'paused'; }
    if (yOffset > 0 && atEnd && this.resume()) return 'resumed';
    return 'none';
  }

  dispose(): void {
    this.disposed = true;
    this.pause();
  }
}
