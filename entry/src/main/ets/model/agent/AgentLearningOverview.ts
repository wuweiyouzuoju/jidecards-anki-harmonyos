// SPDX-License-Identifier: AGPL-3.0-or-later
import type { CardCounts, GraphsView, TodayCounts } from '../../proto/messages/StatsMessages';
import type { DeckStudyHistory } from '../DeckStudyHistory';
import { buildDeckStudyHistory } from '../DeckStudyHistory';
import { dueOverview } from '../StatsOverview';

export interface AgentForecastDay { daysFromToday: number; count: number; }
export interface AgentLearningForecast {
  dueThroughToday: number;
  overdue: number;
  days: AgentForecastDay[];
  scheduledInWindow: number;
  dailyLoad: number;
}
export interface AgentLearningOverview {
  query: string;
  historyDays: number;
  forecastDays: number;
  rolloverHour: number;
  fsrs: boolean;
  today: TodayCounts | null;
  history: DeckStudyHistory;
  cardCounts: CardCounts | null;
  forecast: AgentLearningForecast | null;
  averageRetrievabilityPercent: number | null;
  contentRead: false;
}

/** 仅聚合 Core 日桶；不读取笔记、不重算调度，也不把到期预测当每日可学队列。 */
export function buildAgentLearningOverview(graphs: GraphsView, query: string,
  days: number, forecastDays: number): AgentLearningOverview {
  if (!Number.isSafeInteger(forecastDays) || forecastDays < 1 || forecastDays > 30) {
    throw new Error('Invalid forecast window');
  }
  const due = dueOverview(graphs.futureDue);
  let forecast: AgentLearningForecast | null = null;
  if (due !== null && graphs.futureDue !== null && graphs.futureDue.futureDue !== null) {
    forecast = { dueThroughToday: due.due, overdue: due.overdue, days: [],
      scheduledInWindow: 0, dailyLoad: graphs.futureDue.dailyLoad };
    for (let day = 0; day < forecastDays; day++) {
      const count: number = graphs.futureDue.futureDue.get(day) ?? 0;
      forecast.days.push({ daysFromToday: day, count: count });
      forecast.scheduledInWindow += count;
    }
  }
  let memoryCardCount: number = 0;
  if (graphs.retrievability !== null && graphs.retrievability.buckets !== null) {
    graphs.retrievability.buckets.forEach((count: number): void => { memoryCardCount += count; });
  }
  return { query: query, historyDays: days, forecastDays: forecastDays,
    rolloverHour: graphs.rolloverHour, fsrs: graphs.fsrs, today: graphs.today,
    history: buildDeckStudyHistory(graphs, days), cardCounts: graphs.cardCounts, forecast: forecast,
    averageRetrievabilityPercent: graphs.fsrs && graphs.retrievability !== null && memoryCardCount > 0 ?
      graphs.retrievability.average : null, contentRead: false };
}
