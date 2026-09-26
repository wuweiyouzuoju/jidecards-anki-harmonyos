// SPDX-License-Identifier: AGPL-3.0-or-later
import { StudyOptions, StudyAutoAdvanceSettings } from './StudyTiming';

export enum StudyAdvanceField { Main, QuestionTime, AnswerTime, QuestionAction, AnswerAction, FeedbackTime }

/** 弹窗草稿独立于学习会话；二级返回丢弃待选值，主界面确定才提交。 */
export class StudyAutoAdvanceDraft {
  readonly settings: StudyAutoAdvanceSettings = new StudyAutoAdvanceSettings();
  readonly base: StudyOptions;
  enabled: boolean;
  feedbackSeconds: number;
  field: StudyAdvanceField = StudyAdvanceField.Main;
  selected: number = 0;

  constructor(base: StudyOptions, enabled: boolean, feedbackSeconds: number) {
    this.base = base;
    this.enabled = enabled;
    this.feedbackSeconds = feedbackSeconds;
  }

  value(field: StudyAdvanceField): number {
    const options: StudyOptions = this.settings.resolve(this.base);
    switch (field) {
      case StudyAdvanceField.QuestionTime: return options.secondsToShowQuestion;
      case StudyAdvanceField.AnswerTime: return options.secondsToShowAnswer;
      case StudyAdvanceField.QuestionAction: return options.questionAction;
      case StudyAdvanceField.AnswerAction: return options.answerAction;
      default: return this.feedbackSeconds;
    }
  }

  choices(): number[] {
    if (this.field === StudyAdvanceField.QuestionAction) return [0, 1];
    if (this.field === StudyAdvanceField.AnswerAction) return [0, 1, 2, 3, 4];
    const values: number[] = [0, 3, 5, 10, 15, 30];
    const current: number = this.value(this.field);
    if (!values.includes(current)) values.push(current);
    return values.sort((left: number, right: number): number => left - right);
  }

  open(field: StudyAdvanceField): void {
    this.field = field;
    this.selected = this.value(field);
  }

  back(): boolean {
    if (this.field === StudyAdvanceField.Main) return true;
    this.field = StudyAdvanceField.Main;
    return false;
  }

  confirmField(): void {
    switch (this.field) {
      case StudyAdvanceField.QuestionTime: this.settings.questionSeconds = this.selected; break;
      case StudyAdvanceField.AnswerTime: this.settings.answerSeconds = this.selected; break;
      case StudyAdvanceField.QuestionAction: this.settings.questionAction = this.selected; break;
      case StudyAdvanceField.AnswerAction: this.settings.answerAction = this.selected; break;
      case StudyAdvanceField.FeedbackTime: this.feedbackSeconds = this.selected; break;
      default: return;
    }
    const options: StudyOptions = this.settings.resolve(this.base);
    if (options.secondsToShowQuestion <= 0 && options.secondsToShowAnswer <= 0) this.enabled = false;
    this.field = StudyAdvanceField.Main;
  }

  canEnable(): boolean {
    const options: StudyOptions = this.settings.resolve(this.base);
    return options.secondsToShowQuestion > 0 || options.secondsToShowAnswer > 0;
  }

  apply(target: StudyAutoAdvanceSettings): void {
    if (this.settings.questionSeconds >= 0) target.questionSeconds = this.settings.questionSeconds;
    if (this.settings.answerSeconds >= 0) target.answerSeconds = this.settings.answerSeconds;
    if (this.settings.questionAction >= 0) target.questionAction = this.settings.questionAction;
    if (this.settings.answerAction >= 0) target.answerAction = this.settings.answerAction;
  }
}
