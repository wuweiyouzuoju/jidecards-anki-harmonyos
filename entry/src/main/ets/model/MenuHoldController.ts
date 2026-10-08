// SPDX-License-Identifier: AGPL-3.0-or-later
import { MenuSlideSession, menuSlideSession } from './MenuSlideSession';

export interface MenuHoldClock {
  now(): number;
  repeat(callback: () => void): number;
  stop(timer: number): void;
}

/** 菜单入口共享同一指针生命周期；长按后产生的点击只消费一次。 */
export class MenuHoldController {
  private pointer: number = -1;
  private x: number = 0;
  private y: number = 0;
  private timer: number = -1;
  private suppressed: boolean = false;
  constructor(private readonly enabled: () => boolean, private readonly open: () => void,
    private readonly close: () => void, private readonly session: MenuSlideSession = menuSlideSession,
    private readonly clock: MenuHoldClock = {
      now: (): number => Date.now(), repeat: (callback: () => void): number => setInterval(callback, 40),
      stop: (timer: number): void => clearInterval(timer)
    }) {}
  down(id: number, x: number, y: number): void {
    this.cancel();
    this.suppressed = false; this.pointer = id; this.x = x; this.y = y;
  }
  hold(): void {
    if (!this.enabled() || this.pointer < 0 || this.timer >= 0) return;
    this.suppressed = true; this.session.begin(this.close); this.open();
    this.timer = this.clock.repeat((): void => {
      if (!this.enabled()) this.cancel(); else this.session.move(this.x, this.y, this.clock.now());
    });
  }
  move(id: number, x: number, y: number): void {
    if (id !== this.pointer) return;
    this.x = x; this.y = y;
    if (this.timer >= 0) this.session.move(x, y, this.clock.now());
  }
  up(id: number, x: number, y: number): void {
    if (id !== this.pointer) return;
    this.move(id, x, y);
    if (this.timer >= 0) {
      this.clock.stop(this.timer); this.timer = -1;
      if (this.enabled()) this.session.finish(); else this.session.cancel();
    }
    this.pointer = -1;
  }
  cancel(): void {
    if (this.pointer >= 0) this.suppressed = true;
    if (this.timer >= 0) { this.clock.stop(this.timer); this.timer = -1; this.session.cancel(); }
    this.pointer = -1;
  }
  consumeClick(): boolean {
    const suppressed: boolean = this.suppressed; this.suppressed = false;
    return !suppressed && this.enabled();
  }
}
