// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DeckConfigSettings } from '../../proto/messages/DeckConfigMessages';

/** 可读预设字段白名单；未知协议字节不发送给模型。 */
export interface AgentDeckSettings {
  learnSteps: number[];
  relearnSteps: number[];
  fsrsParams4: number[];
  easyDaysPercentages: number[];
  fsrsParams5: number[];
  fsrsParams6: number[];
  newPerDay: number;
  reviewsPerDay: number;
  initialEase: number;
  easyMultiplier: number;
  hardMultiplier: number;
  lapseMultiplier: number;
  intervalMultiplier: number;
  maximumReviewInterval: number;
  minimumLapseInterval: number;
  graduatingIntervalGood: number;
  graduatingIntervalEasy: number;
  newCardInsertOrder: number;
  leechAction: number;
  leechThreshold: number;
  disableAutoplay: boolean;
  capAnswerTimeToSecs: number;
  showTimer: boolean;
  skipQuestionWhenReplayingAnswer: boolean;
  buryNew: boolean;
  buryReviews: boolean;
  buryInterdayLearning: boolean;
  newMix: number;
  interdayLearningMix: number;
  newCardSortOrder: number;
  reviewOrder: number;
  newCardGatherPriority: number;
  newPerDayMinimum: number;
  questionAction: number;
  desiredRetention: number;
  stopTimerOnAnswer: boolean;
  historicalRetention: number;
  secondsToShowQuestion: number;
  secondsToShowAnswer: number;
  answerAction: number;
  waitForAudio: boolean;
  paramSearch: string;
  ignoreRevlogsBeforeDate: string;
}
export interface AgentDeckSettingsView { settings: AgentDeckSettings; truncatedFields: string[]; }

/** 显式标记被截断的数组/文字，不能把局部数据报告为完整配置。 */
export function buildAgentDeckSettings(config: DeckConfigSettings): AgentDeckSettingsView {
  const truncated: string[] = [];
  if (config.learnSteps.length > 64) { truncated.push('learnSteps'); }
  if (config.relearnSteps.length > 64) { truncated.push('relearnSteps'); }
  if (config.fsrsParams4.length > 64) { truncated.push('fsrsParams4'); }
  if (config.easyDaysPercentages.length > 64) { truncated.push('easyDaysPercentages'); }
  if (config.fsrsParams5.length > 64) { truncated.push('fsrsParams5'); }
  if (config.fsrsParams6.length > 64) { truncated.push('fsrsParams6'); }
  if (config.paramSearch.length > 2000) { truncated.push('paramSearch'); }
  if (config.ignoreRevlogsBeforeDate.length > 2000) { truncated.push('ignoreRevlogsBeforeDate'); }
  const settings: AgentDeckSettings = {
    learnSteps: config.learnSteps.slice(0, 64),
    relearnSteps: config.relearnSteps.slice(0, 64),
    fsrsParams4: config.fsrsParams4.slice(0, 64),
    easyDaysPercentages: config.easyDaysPercentages.slice(0, 64),
    fsrsParams5: config.fsrsParams5.slice(0, 64),
    fsrsParams6: config.fsrsParams6.slice(0, 64),
    newPerDay: config.newPerDay,
    reviewsPerDay: config.reviewsPerDay,
    initialEase: config.initialEase,
    easyMultiplier: config.easyMultiplier,
    hardMultiplier: config.hardMultiplier,
    lapseMultiplier: config.lapseMultiplier,
    intervalMultiplier: config.intervalMultiplier,
    maximumReviewInterval: config.maximumReviewInterval,
    minimumLapseInterval: config.minimumLapseInterval,
    graduatingIntervalGood: config.graduatingIntervalGood,
    graduatingIntervalEasy: config.graduatingIntervalEasy,
    newCardInsertOrder: config.newCardInsertOrder,
    leechAction: config.leechAction,
    leechThreshold: config.leechThreshold,
    disableAutoplay: config.disableAutoplay,
    capAnswerTimeToSecs: config.capAnswerTimeToSecs,
    showTimer: config.showTimer,
    skipQuestionWhenReplayingAnswer: config.skipQuestionWhenReplayingAnswer,
    buryNew: config.buryNew,
    buryReviews: config.buryReviews,
    buryInterdayLearning: config.buryInterdayLearning,
    newMix: config.newMix,
    interdayLearningMix: config.interdayLearningMix,
    newCardSortOrder: config.newCardSortOrder,
    reviewOrder: config.reviewOrder,
    newCardGatherPriority: config.newCardGatherPriority,
    newPerDayMinimum: config.newPerDayMinimum,
    questionAction: config.questionAction,
    desiredRetention: config.desiredRetention,
    stopTimerOnAnswer: config.stopTimerOnAnswer,
    historicalRetention: config.historicalRetention,
    secondsToShowQuestion: config.secondsToShowQuestion,
    secondsToShowAnswer: config.secondsToShowAnswer,
    answerAction: config.answerAction,
    waitForAudio: config.waitForAudio,
    paramSearch: config.paramSearch.slice(0, 2000),
    ignoreRevlogsBeforeDate: config.ignoreRevlogsBeforeDate.slice(0, 2000),
  };
  return { settings: settings, truncatedFields: truncated };
}
