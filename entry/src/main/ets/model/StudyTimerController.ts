// SPDX-License-Identifier: AGPL-3.0-or-later
import { StudyTiming, StudyOptions, StudyAdvanceAction } from './StudyTiming';

export interface StudyTimerState {
  version: number;
  active: boolean;
  advance: boolean;
  blocked: boolean;
  audioPlaying: boolean;
  options: StudyOptions;
}

export interface StudyTimerHost {
  state(): StudyTimerState;
  display(text: string): void;
  act(action: StudyAdvanceAction): void;
}

export interface StudyTimerClock {
  now(): number;
  repeat(work: () => void): number;
  cancel(id: number): void;
}

/** 持有计时资源与卡面时钟；页面只映射当前交互是否允许计时/自动前进。 */
export class StudyTimerController {
  private timing: StudyTiming = new StudyTiming();
  private timer: number = -1;
  private generation: number = 0;
  private disposed: boolean = false;
  private host: StudyTimerHost;
  private clock: StudyTimerClock;

  constructor(host: StudyTimerHost, clock: StudyTimerClock) {
    this.host = host;
    this.clock = clock;
  }

  showQuestion(now: number): void { this.timing.showQuestion(now); }
  showAnswer(now: number): void { this.timing.showAnswer(now); }
  restartAdvance(): void { this.timing.restartAdvance(this.clock.now()); }

  start(): void {
    if (this.disposed) return;
    const state: StudyTimerState = this.host.state();
    if (!state.active) return;
    this.timing.resume(this.clock.now());
    this.display(state.options);
    if (this.timer >= 0 || (!state.options.showTimer && !state.advance)) return;
    const generation: number = this.generation;
    this.timer = this.clock.repeat((): void => {
      if (this.disposed || generation !== this.generation) return;
      if (state.version !== this.host.state().version) { this.stop(); return; }
      this.tick();
    });
  }

  stop(): void {
    this.generation++;
    if (this.timer >= 0) this.clock.cancel(this.timer);
    this.timer = -1;
    this.timing.pause(this.clock.now());
  }

  tick(): void {
    if (this.disposed) return;
    const state: StudyTimerState = this.host.state();
    if (!state.active) { this.stop(); return; }
    this.display(state.options);
    if (!state.advance || state.blocked) return;
    const action: StudyAdvanceAction = this.timing.takeAction(this.clock.now(), state.options, state.audioPlaying);
    if (action !== StudyAdvanceAction.None) this.host.act(action);
  }

  dispose(): void { this.disposed = true; this.stop(); }

  private display(options: StudyOptions): void {
    const seconds: number = this.timing.displaySeconds(this.clock.now(), options);
    this.host.display(`${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`);
  }
}
