// SPDX-License-Identifier: AGPL-3.0-or-later

/** 当前卡片所属牌组的学习展示选项；调度算法仍完全由 Core 执行。 */
export class StudyOptions {
  autoplay: boolean = true;
  skipQuestionWhenReplayingAnswer: boolean = false;
  waitForAudio: boolean = true;
  showTimer: boolean = false;
  stopTimerOnAnswer: boolean = false;
  capAnswerTimeToSecs: number = 60;
  secondsToShowQuestion: number = 0;
  secondsToShowAnswer: number = 0;
  questionAction: number = 0;
  answerAction: number = 0;
}

export enum StudyAdvanceAction { None, ShowAnswer, Reminder, Bury, Again, Good, Hard }

/**
 * 屏幕计时与自动前进的时钟，可在无 ArkUI/原生定时器的测试中验证。
 * Invariants: 每面只发出一次动作；暂停不累计时间；屏幕停表不改统计用时。
 */
export class StudyTiming {
  private elapsed: number = 0;
  private sideElapsed: number = 0;
  private activeSince: number = 0;
  private running: boolean = false;
  private answer: boolean = false;
  private answerElapsed: number = 0;
  private fired: boolean = false;

  showQuestion(now: number): void {
    this.elapsed = 0;
    this.sideElapsed = 0;
    this.answer = false;
    this.answerElapsed = 0;
    this.fired = false;
    this.activeSince = now;
    this.running = true;
  }

  showAnswer(now: number): void {
    this.pause(now);
    this.answerElapsed = this.elapsed;
    this.answer = true;
    this.sideElapsed = 0;
    this.fired = false;
    this.resume(now);
  }

  pause(now: number): void {
    if (!this.running) return;
    const delta: number = Math.max(0, now - this.activeSince);
    this.elapsed += delta;
    this.sideElapsed += delta;
    this.running = false;
  }

  resume(now: number): void {
    if (this.running) return;
    this.activeSince = now;
    this.running = true;
  }

  restartAdvance(now: number): void {
    this.pause(now);
    this.sideElapsed = 0;
    this.fired = false;
    this.resume(now);
  }

  displaySeconds(now: number, options: StudyOptions): number {
    const elapsed: number = this.answer && options.stopTimerOnAnswer ? this.answerElapsed :
      this.elapsed + this.delta(now);
    return Math.floor(Math.min(elapsed / 1000, options.capAnswerTimeToSecs));
  }

  takeAction(now: number, options: StudyOptions, audioPlaying: boolean): StudyAdvanceAction {
    const seconds: number = this.answer ? options.secondsToShowAnswer : options.secondsToShowQuestion;
    if (!this.running || this.fired || seconds <= 0 ||
      this.sideElapsed + this.delta(now) < seconds * 1000 || (options.waitForAudio && audioPlaying)) {
      return StudyAdvanceAction.None;
    }
    this.fired = true;
    if (!this.answer) return options.questionAction === 1 ? StudyAdvanceAction.Reminder : StudyAdvanceAction.ShowAnswer;
    switch (options.answerAction) {
      case 1: return StudyAdvanceAction.Again;
      case 2: return StudyAdvanceAction.Good;
      case 3: return StudyAdvanceAction.Hard;
      case 4: return StudyAdvanceAction.Reminder;
      default: return StudyAdvanceAction.Bury;
    }
  }

  private delta(now: number): number { return this.running ? Math.max(0, now - this.activeSince) : 0; }
}
