// SPDX-License-Identifier: AGPL-3.0-or-later
import { OliveOil } from './OliveOil';

export interface OliveScheduler {
  schedule(delayMs: number, work: () => void): number;
  cancel(handle: number): void;
}
export interface OliveState {
  targetExpanded: boolean;
  contentExpanded: boolean;
  contentVisible: boolean;
  surfaceActive: boolean;
  isTransitioning: boolean;
  progress: number;
  phase: string;
  durationMs: number;
}
/** 每个宿主一个实例；导航锁重入，局部切换允许重定向；时钟可注入验证。 */
export class OliveOilSession {
  private scheduler: OliveScheduler;
  private changed: (state: OliveState) => void;
  private generation: number = 0;
  private handles: number[] = [];
  private started: boolean = false;
  private reduced: boolean = false;
  private state: OliveState = { targetExpanded: false, contentExpanded: false, contentVisible: true,
    surfaceActive: false, isTransitioning: false, progress: 0, phase: 'idle', durationMs: 0 };

  constructor(scheduler: OliveScheduler, changed: (state: OliveState) => void) {
    this.scheduler = scheduler;
    this.changed = changed;
  }
  snapshot(): OliveState {
    return { targetExpanded: this.state.targetExpanded, contentExpanded: this.state.contentExpanded,
      contentVisible: this.state.contentVisible, surfaceActive: this.state.surfaceActive,
      isTransitioning: this.state.isTransitioning, progress: this.state.progress,
      phase: this.state.phase, durationMs: this.state.durationMs };
  }
  private publish(phase: string, durationMs: number = 0): void {
    this.state.phase = phase; this.state.durationMs = durationMs; this.changed(this.snapshot());
  }
  private clear(): void {
    this.generation++;
    for (const id of this.handles) { this.scheduler.cancel(id); }
    this.handles = [];
  }
  private later(delay: number, action: () => void): void {
    const token: number = this.generation;
    this.handles.push(this.scheduler.schedule(delay, (): void => { if (token === this.generation) { action(); } }));
  }
  /** navigation=true时先等待测量；宿主捕获锚点后调用startSurface。 */
  transition(expanded: boolean, reduceMotion: boolean = false, navigation: boolean = true): boolean {
    if (navigation && this.state.isTransitioning) { return false; }
    if (!this.state.isTransitioning && this.state.contentExpanded === expanded) { return false; }
    this.clear(); this.reduced = reduceMotion; this.started = false;
    this.state.targetExpanded = expanded; this.state.isTransitioning = true; this.state.contentVisible = false;
    this.publish('hide', OliveOil.hideMs);
    this.later(OliveOil.hideMs, (): void => {
      if (this.reduced) {
        this.state.contentExpanded = expanded; this.state.progress = expanded ? 1 : 0;
        this.state.surfaceActive = false; this.state.contentVisible = true;
        this.publish('reduced', OliveOil.reducedMotionMs);
        this.later(OliveOil.reducedMotionMs, (): void => { this.finish(); });
      } else {
        this.state.surfaceActive = true;
        this.publish('measure');
        if (!navigation) { this.startSurface(); }
        else { this.later(OliveOil.geometryTimeoutMs, (): void => { if (!this.started) { this.finish(); } }); }
      }
    });
    return true;
  }
  startSurface(): void {
    if (!this.state.isTransitioning || !this.state.surfaceActive || this.started) { return; }
    this.started = true;
    this.state.contentExpanded = this.state.targetExpanded;
    this.state.progress = this.state.targetExpanded ? 1 : 0;
    this.publish('shape', OliveOil.morphMs);
    this.later(OliveOil.revealDelayMs, (): void => {
      this.state.contentVisible = true; this.publish('reveal', OliveOil.revealMs);
    });
    this.later(OliveOil.morphMs, (): void => { this.finish(); });
  }
  private finish(): void {
    this.clear(); this.started = false;
    this.state.contentExpanded = this.state.targetExpanded;
    this.state.progress = this.state.targetExpanded ? 1 : 0;
    this.state.contentVisible = true; this.state.surfaceActive = false; this.state.isTransitioning = false;
    this.publish('idle');
  }
  /** 离开、后台或无障碍偏好改变时落定目标；迟到的旧回调不能复活宿主。 */
  settle(): void { this.finish(); }
  dispose(): void { this.clear(); this.changed = (_state: OliveState): void => {}; }
}
