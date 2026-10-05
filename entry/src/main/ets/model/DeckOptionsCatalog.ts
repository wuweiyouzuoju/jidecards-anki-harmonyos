// SPDX-License-Identifier: AGPL-3.0-or-later
// 对齐 UPSTREAM.lock 的 Anki 26.05：UI 和 JIDE 共用选项分组、字段与显示条件。
export interface DeckOptionDefinition {
  key: string;
  kind: string;
  scheduler: string;
  titleKey: string;
  helpKey: string;
}
export interface DeckOptionGroup {
  id: string;
  titleKey: string;
  fields: DeckOptionDefinition[];
}
export interface DeckOptionEnumChoice { value: number; titleKey: string; }
export const DECK_OPTIONS_UPSTREAM = { tag: '26.05', commit: 'e64c6b1' };
function field(key: string, kind: string = 'number', scheduler: string = ''): DeckOptionDefinition {
  return { key, kind, scheduler, titleKey: 'deck_' + key + '_label', helpKey: 'deck_' + key + '_help' };
}
export const DECK_OPTION_GROUPS: DeckOptionGroup[] = [
  { id: 'daily_limits', titleKey: 'deck_group_daily_limits', fields: [field('newPerDay'), field('reviewsPerDay'),
    field('newCardsIgnoreReviewLimit', 'global'), field('applyAllParentLimits', 'global')] },
  { id: 'new', titleKey: 'deck_group_new', fields: [field('learnSteps', 'steps'),
    field('graduatingIntervalGood', 'number', 'sm2'), field('graduatingIntervalEasy', 'number', 'sm2'), field('newCardInsertOrder', 'enum')] },
  { id: 'lapses', titleKey: 'deck_group_lapses', fields: [field('relearnSteps', 'steps'),
    field('minimumLapseInterval', 'number', 'sm2'), field('leechThreshold'), field('leechAction', 'enum')] },
  { id: 'display_order', titleKey: 'deck_group_display_order', fields: [field('newCardGatherPriority', 'enum'),
    field('newCardSortOrder', 'enum'), field('newMix', 'enum'), field('interdayLearningMix', 'enum'), field('reviewOrder', 'enum')] },
  { id: 'fsrs', titleKey: 'deck_group_fsrs', fields: [field('fsrsEnabled', 'global'),
    field('desiredRetention', 'percentage', 'fsrs'), field('fsrsParameters', 'params', 'fsrs'), field('paramSearch', 'text', 'fsrs'),
    field('fsrsReschedule', 'global', 'fsrs'), field('fsrsHealthCheck', 'global', 'fsrs')] },
  { id: 'burying', titleKey: 'deck_group_burying', fields: [field('buryNew', 'boolean'), field('buryReviews', 'boolean'), field('buryInterdayLearning', 'boolean')] },
  { id: 'audio', titleKey: 'deck_group_audio', fields: [field('disableAutoplay', 'boolean'), field('skipQuestionWhenReplayingAnswer', 'boolean')] },
  { id: 'timer', titleKey: 'deck_group_timer', fields: [field('capAnswerTimeToSecs'), field('showTimer', 'boolean'), field('stopTimerOnAnswer', 'boolean')] },
  { id: 'auto_advance', titleKey: 'deck_group_auto_advance', fields: [field('secondsToShowQuestion'), field('secondsToShowAnswer'),
    field('waitForAudio', 'boolean'), field('questionAction', 'enum'), field('answerAction', 'enum')] },
  { id: 'easy_days', titleKey: 'deck_group_easy_days', fields: [field('easyDaysPercentages', 'week')] },
  { id: 'advanced', titleKey: 'deck_group_advanced', fields: [field('maximumReviewInterval'),
    field('initialEase', 'number', 'sm2'), field('easyMultiplier', 'number', 'sm2'), field('intervalMultiplier', 'number', 'sm2'),
    field('hardMultiplier', 'number', 'sm2'), field('lapseMultiplier', 'number', 'sm2'),
    field('historicalRetention', 'percentage', 'fsrs'), field('ignoreRevlogsBeforeDate', 'text', 'fsrs'), field('customScheduling', 'unsupported')] }
];
export function visibleDeckOptionFields(group: DeckOptionGroup, fsrs: boolean): DeckOptionDefinition[] {
  return group.fields.filter(item => item.scheduler === '' || item.scheduler === (fsrs ? 'fsrs' : 'sm2'));
}
function choices(values: number[], keys: string[]): DeckOptionEnumChoice[] {
  return values.map((value, index) => ({ value, titleKey: 'deck_opt_' + keys[index] }));
}
export function deckOptionChoices(key: string, fsrs: boolean, gather: number = 0): DeckOptionEnumChoice[] {
  switch (key) {
    case 'newCardInsertOrder': return choices([0, 1], ['due', 'random']);
    case 'newCardGatherPriority': return choices([0, 5, 1, 2, 3, 4], ['deck', 'deck_random_notes', 'lowest_position', 'highest_position', 'random_notes', 'random_cards']);
    case 'newCardSortOrder': return choices([0, 1, 2, 3, 4], ['template', 'no_sort', 'template_random', 'random_note_template', 'random'])
      .filter(item => !disabledNewSortOrders(gather).includes(item.value));
    case 'newMix': case 'interdayLearningMix': return choices([0, 1, 2], ['mix', 'after_reviews', 'before_reviews']);
    case 'leechAction': return choices([0, 1], ['suspend', 'tag_only']);
    case 'questionAction': return choices([0, 1], ['show_answer', 'show_reminder']);
    case 'answerAction': return choices([0, 1, 2, 3, 4], ['bury_card', 'answer_again', 'answer_good', 'answer_hard', 'show_reminder']);
    case 'reviewOrder': {
      const prefix = choices([0, 1, 2, 3, 4], ['day', 'day_deck', 'deck_day', 'interval_asc', 'interval_desc']);
      const difficulty = fsrs ? choices([6, 5], ['difficulty_asc', 'difficulty_desc']) : choices([5, 6], ['ease_asc', 'ease_desc']);
      const retention = fsrs ? choices([7, 11], ['retr_asc', 'retr_desc']) : [];
      return prefix.concat(difficulty, retention, choices([12, 8, 9, 10], ['relative', 'random', 'added', 'reverse_added']));
    }
    default: return [];
  }
}
function disabledNewSortOrders(gather: number): number[] { return gather === 3 ? [2, 3] : gather === 4 ? [2, 3, 4] : []; }
export function compatibleNewSortOrder(gather: number, sort: number): number {
  return sort < 0 || sort > 4 || disabledNewSortOrders(gather).includes(sort) ? 0 : sort;
}
export function easyDayValues(values: number[]): number[] { return values.length === 7 ? values.slice() : [1, 1, 1, 1, 1, 1, 1]; }
export function updateEasyDay(values: number[], day: number, value: number): number[] {
  if (!Number.isInteger(day) || day < 0 || day > 6 || ![0, 0.5, 1].includes(value)) throw new Error('invalid easy day');
  const result = easyDayValues(values); result[day] = value; return result;
}
// 官方 SpinBoxFloatRow 的 0.01 步长按整数百分比显示；确认卡可显式保留更多小数。
export function percentageText(value: string, places: number = 0): string { return value.trim() === '' ? '' : String(Number((Number(value) * 100).toFixed(places))); }
export function percentageValue(text: string): string { return text.trim() === '' ? '' : String(Number(text) / 100); }
/** Core float32 读回的边界值可能略低/高于十进制边界，校验沿用协议精度。 */
export function deckOptionFloatInRange(value: number, minimum: number, maximum: number): boolean {
  return Number.isFinite(value) && Math.fround(value) >= Math.fround(minimum) && Math.fround(value) <= Math.fround(maximum);
}
// Core 的存储单位是分钟，界面支持 Anki 的 s/m/h/d 后缀，并保持旧无后缀分钟输入兼容。
export function parseDeckOptionSteps(text: string): number[] | null {
  if (text.trim() === '') return [];
  const result: number[] = [];
  for (const token of text.trim().split(/\s+/)) {
    const match = token.match(/^(\d+(?:\.\d+)?)([smhd]?)$/);
    if (match === null) return null;
    const unit = match[2]; const multiplier = unit === 's' ? 1 : unit === 'h' ? 3600 : unit === 'd' ? 86400 : 60;
    const seconds = Number(match[1]) * multiplier;
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    result.push(Math.min(seconds, 2 ** 31) / 60);
  }
  return result;
}
export function deckOptionStepsText(steps: number[]): string {
  return steps.map(minutes => {
    const seconds = Math.round(minutes * 60);
    if (seconds >= 86400 && seconds % 86400 === 0) return String(seconds / 86400) + 'd';
    if (seconds >= 3600 && seconds % 3600 === 0) return String(seconds / 3600) + 'h';
    if (seconds >= 60 && seconds % 60 === 0) return String(seconds / 60) + 'm';
    return String(seconds) + 's';
  }).join(' ');
}
