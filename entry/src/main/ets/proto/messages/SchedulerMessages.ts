// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID PROTO-MSG-SCHED-001
// @名称 调度器消息编解码
//
// @作用
// 编解码 anki.scheduler.proto / cards.proto / generic.proto 中复习链路相关消息（Anki 26.05）：
// - SchedulingStatesRaw：5 个评分档位（current/again/hard/good/easy）的不透明原始字节
// - QueuedCardsView：待复习队列（卡片列表 + new/learn/review 计数）
// - CardAnswer：作答请求（cardId + 旧/新状态 + rating + 用时）
// - CongratsInfo：完成页状态（剩余卡片/埋藏标记/牌组描述）
// - BuryOrSuspend / UnburyDeck / CountsForDeckToday / SchedTimingToday / StringList
// 字段来源：third_party/anki/proto/anki/scheduler.proto 等
//
// @输入
// 编码：CardAnswerInput / (cardIds, mode) / deckId 等
// 解码：字节流
//
// @输出
// 编码：Uint8Array 字节
// 解码：QueuedCardsView / CongratsInfo / SchedulingStatesRaw / SchedTimingToday 等
//
// @业务规则
// SchedulingState 是深层 oneof（New/Learning/Review/Relearning/Filtered…），
// 前端不解其内容——按钮文案由后端 DescribeNextStates 给出。
// 解码时把每个状态的原始字节原样保留（raw passthrough），作答时原样回写，
// 保证字节级保真，避免前端维护易过期的 oneof 重编码。
// custom_data（插件用）当前不填充：后端注释明确「不设置则不会更新」。
// RATING_*/QUEUE_*/BURY_SUSPEND_MODE_*/UNBURY_MODE_* 常量与 proto 枚举值对齐。
//
// @副作用
// 无
// ========================================================

import { 协议读取器 } from '../core/ProtoReader';
import { 协议写入器 } from '../core/ProtoWriter';

export interface ScheduleCardsAsNewOptions { restorePosition: boolean; resetCounts: boolean; }
export function encodeScheduleCardsAsNew(ids: number[], options: ScheduleCardsAsNewOptions): Uint8Array {
  const writer = new 协议写入器();
  for (const id of ids) {
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid card ID');
    writer.写入64位整数(1, id);
  }
  writer.写入布尔(2, true); // Keep history and record the manual reset.
  writer.写入布尔(3, options.restorePosition);
  writer.写入布尔(4, options.resetCounts);
  writer.写入变长整数(5, 0); // optional BROWSER must be present, even when zero.
  return writer.转为字节();
}
export function decodeScheduleCardsAsNewDefaults(bytes: Uint8Array): ScheduleCardsAsNewOptions {
  const reader = new 协议读取器(bytes);
  const options: ScheduleCardsAsNewOptions = { restorePosition: false, resetCounts: false };
  let tag;
  while ((tag = reader.读取标签()) !== null) {
    if (tag.字段号 === 1) options.restorePosition = reader.读取布尔();
    else if (tag.字段号 === 2) options.resetCounts = reader.读取布尔();
    else reader.跳过字段(tag.线类型);
  }
  return options;
}

/** SchedulingState 的不透明原始字节，作答时原样回传 */
export type RawSchedulingState = Uint8Array;

export interface SchedulingStatesRaw {
  current: RawSchedulingState;
  again: RawSchedulingState;
  hard: RawSchedulingState;
  good: RawSchedulingState;
  easy: RawSchedulingState;
}

/** 评分档位，与 CardAnswer.Rating 对应 */
export const RATING_AGAIN = 0;
export const RATING_HARD = 1;
export const RATING_GOOD = 2;
export const RATING_EASY = 3;

/** 卡片所属队列，与 QueuedCards.Queue 对应 */
export const QUEUE_NEW = 0;
export const QUEUE_LEARNING = 1;
export const QUEUE_REVIEW = 2;

export function decodeSchedulingStates(bytes: Uint8Array): SchedulingStatesRaw {
  const r = new 协议读取器(bytes);
  const states: SchedulingStatesRaw = {
    current: new Uint8Array(0),
    again: new Uint8Array(0),
    hard: new Uint8Array(0),
    good: new Uint8Array(0),
    easy: new Uint8Array(0)
  };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        states.current = r.读取字节();
        break;
      case 2:
        states.again = r.读取字节();
        break;
      case 3:
        states.hard = r.读取字节();
        break;
      case 4:
        states.good = r.读取字节();
        break;
      case 5:
        states.easy = r.读取字节();
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return states;
}

export interface StudyCard {
  cardId: number;
  noteId: number;
  deckId: number;
  /** 卡片模板序号（cards.proto Card.template_idx，对应 Anki 的 card_ord），用于 Cloze 拼写校验 */
  templateIdx: number;
  queue: number;
  states: SchedulingStatesRaw;
}

export interface QueuedCardsView {
  cards: StudyCard[];
  newCount: number;
  learningCount: number;
  reviewCount: number;
}

export function encodeGetQueuedCardsRequest(fetchLimit: number, intradayLearningOnly: boolean): Uint8Array {
  const w = new 协议写入器();
  if (fetchLimit !== 0) {
    w.写入变长整数(1, fetchLimit);
  }
  if (intradayLearningOnly) {
    w.写入布尔(2, true);
  }
  return w.转为字节();
}

/** 只取学习链路需要的 Card 字段（id/note_id/deck_id/template_idx），其余跳过 */
interface CardSummary {
  cardId: number;
  noteId: number;
  deckId: number;
  templateIdx: number;
}

function decodeCardSummary(bytes: Uint8Array): CardSummary {
  const r = new 协议读取器(bytes);
  const out: CardSummary = { cardId: 0, noteId: 0, deckId: 0, templateIdx: 0 };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        out.cardId = r.读取64位整数();
        break;
      case 2:
        out.noteId = r.读取64位整数();
        break;
      case 3:
        out.deckId = r.读取64位整数();
        break;
      case 4:
        out.templateIdx = r.读取变长整数();
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

function decodeQueuedCard(bytes: Uint8Array): StudyCard {
  const r = new 协议读取器(bytes);
  const card: StudyCard = {
    cardId: 0,
    noteId: 0,
    deckId: 0,
    templateIdx: 0,
    queue: QUEUE_NEW,
    states: {
      current: new Uint8Array(0),
      again: new Uint8Array(0),
      hard: new Uint8Array(0),
      good: new Uint8Array(0),
      easy: new Uint8Array(0)
    }
  };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1: {
        const summary = decodeCardSummary(r.读取字节());
        card.cardId = summary.cardId;
        card.noteId = summary.noteId;
        card.deckId = summary.deckId;
        card.templateIdx = summary.templateIdx;
        break;
      }
      case 2:
        card.queue = r.读取变长整数();
        break;
      case 3:
        card.states = decodeSchedulingStates(r.读取字节());
        break;
      default:
        // context（牌组名/随机种子）UI 暂不需要
        r.跳过字段(tag.线类型);
    }
  }
  return card;
}

export function decodeQueuedCards(bytes: Uint8Array): QueuedCardsView {
  const r = new 协议读取器(bytes);
  const view: QueuedCardsView = { cards: [], newCount: 0, learningCount: 0, reviewCount: 0 };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        view.cards.push(decodeQueuedCard(r.读取字节()));
        break;
      case 2:
        view.newCount = r.读取变长整数();
        break;
      case 3:
        view.learningCount = r.读取变长整数();
        break;
      case 4:
        view.reviewCount = r.读取变长整数();
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return view;
}

export interface CardAnswerInput {
  cardId: number;
  currentState: RawSchedulingState;
  newState: RawSchedulingState;
  rating: number;
  answeredAtMillis: number;
  millisecondsTaken: number;
}

export function encodeCardAnswer(answer: CardAnswerInput): Uint8Array {
  const w = new 协议写入器();
  if (answer.cardId !== 0) {
    w.写入64位整数(1, answer.cardId);
  }
  if (answer.currentState.length > 0) {
    w.写入字节(2, answer.currentState);
  }
  if (answer.newState.length > 0) {
    w.写入字节(3, answer.newState);
  }
  if (answer.rating !== 0) {
    w.写入变长整数(4, answer.rating);
  }
  if (answer.answeredAtMillis !== 0) {
    w.写入64位整数(5, answer.answeredAtMillis);
  }
  if (answer.millisecondsTaken !== 0) {
    w.写入变长整数(6, answer.millisecondsTaken);
  }
  return w.转为字节();
}

/** cards.CardId：GetSchedulingStates / RenderExistingCard 等的入参 */
export function encodeCardId(cardId: number): Uint8Array {
  const w = new 协议写入器();
  if (cardId !== 0) {
    w.写入64位整数(1, cardId);
  }
  return w.转为字节();
}

/** cards.CardIds：RestoreBuriedAndSuspendedCards 的入参（packed repeated int64） */
export function encodeCardIds(cardIds: number[]): Uint8Array {
  const w = new 协议写入器();
  w.写入打包64位整数(1, cardIds);
  return w.转为字节();
}

/** CongratsInfoResponse：完成页状态（剩余卡片/待解压标记/牌组描述） */
export interface CongratsInfo {
  learnRemaining: number;
  secsUntilNextLearn: number;
  reviewRemaining: boolean;
  newRemaining: boolean;
  haveSchedBuried: boolean;
  haveUserBuried: boolean;
  isFilteredDeck: boolean;
  bridgeCommandsSupported: boolean;
  deckDescription: string;
}

export function decodeCongratsInfo(bytes: Uint8Array): CongratsInfo {
  const r = new 协议读取器(bytes);
  const out: CongratsInfo = {
    learnRemaining: 0,
    secsUntilNextLearn: 0,
    reviewRemaining: false,
    newRemaining: false,
    haveSchedBuried: false,
    haveUserBuried: false,
    isFilteredDeck: false,
    bridgeCommandsSupported: false,
    deckDescription: ''
  };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        out.learnRemaining = r.读取变长整数();
        break;
      case 2:
        out.secsUntilNextLearn = r.读取变长整数();
        break;
      case 3:
        out.reviewRemaining = r.读取布尔();
        break;
      case 4:
        out.newRemaining = r.读取布尔();
        break;
      case 5:
        out.haveSchedBuried = r.读取布尔();
        break;
      case 6:
        out.haveUserBuried = r.读取布尔();
        break;
      case 7:
        out.isFilteredDeck = r.读取布尔();
        break;
      case 8:
        out.bridgeCommandsSupported = r.读取布尔();
        break;
      case 9:
        out.deckDescription = r.读取字符串();
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

/** BuryOrSuspendCardsRequest.Mode */
export const BURY_SUSPEND_MODE_SUSPEND = 0;
export const BURY_SUSPEND_MODE_BURY_SCHED = 1;
export const BURY_SUSPEND_MODE_BURY_USER = 2;

/** BuryOrSuspendCardsRequest：card_ids/note_ids 为 packed repeated int64 */
export function encodeBuryOrSuspendCardsRequest(cardIds: number[], noteIds: number[], mode: number): Uint8Array {
  const w = new 协议写入器();
  w.写入打包64位整数(1, cardIds);
  w.写入打包64位整数(2, noteIds);
  if (mode !== 0) {
    w.写入变长整数(3, mode);
  }
  return w.转为字节();
}

/** UnburyDeckRequest.Mode */
export const UNBURY_MODE_ALL = 0;
export const UNBURY_MODE_SCHED_ONLY = 1;
export const UNBURY_MODE_USER_ONLY = 2;

export function encodeUnburyDeckRequest(deckId: number, mode: number): Uint8Array {
  const w = new 协议写入器();
  if (deckId !== 0) {
    w.写入64位整数(1, deckId);
  }
  if (mode !== 0) {
    w.写入变长整数(2, mode);
  }
  return w.转为字节();
}

export interface SchedTimingToday {
  daysElapsed: number;
  nextDayAt: number;
}

/** CountsForDeckTodayResponse：某牌组今日已完成的新卡/复习卡数（scheduler.proto 181 行） */
export interface DeckTodayCounts {
  newCount: number;
  reviewCount: number;
}

export function decodeCountsForDeckToday(bytes: Uint8Array): DeckTodayCounts {
  const r = new 协议读取器(bytes);
  const out: DeckTodayCounts = { newCount: 0, reviewCount: 0 };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    if (tag.字段号 === 1) {
      out.newCount = r.读取变长整数();
    } else if (tag.字段号 === 2) {
      out.reviewCount = r.读取变长整数();
    } else {
      r.跳过字段(tag.线类型);
    }
  }
  return out;
}

export function decodeSchedTimingToday(bytes: Uint8Array): SchedTimingToday {
  const r = new 协议读取器(bytes);
  const out: SchedTimingToday = { daysElapsed: 0, nextDayAt: 0 };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    if (tag.字段号 === 1) {
      out.daysElapsed = r.读取变长整数();
    } else if (tag.字段号 === 2) {
      out.nextDayAt = r.读取64位整数();
    } else {
      r.跳过字段(tag.线类型);
    }
  }
  return out;
}

/** generic.StringList：DescribeNextStates 的返回（按钮文案列表） */
export function decodeStringList(bytes: Uint8Array): string[] {
  const r = new 协议读取器(bytes);
  const vals: string[] = [];
  let tag;
  while ((tag = r.读取标签()) !== null) {
    if (tag.字段号 === 1) {
      vals.push(r.读取字符串());
    } else {
      r.跳过字段(tag.线类型);
    }
  }
  return vals;
}

/** 把 SchedulingStatesRaw 重新编码为 SchedulingStates 字节（DescribeNextStates 入参） */
export function encodeSchedulingStates(states: SchedulingStatesRaw): Uint8Array {
  const w = new 协议写入器();
  if (states.current.length > 0) {
    w.写入字节(1, states.current);
  }
  if (states.again.length > 0) {
    w.写入字节(2, states.again);
  }
  if (states.hard.length > 0) {
    w.写入字节(3, states.hard);
  }
  if (states.good.length > 0) {
    w.写入字节(4, states.good);
  }
  if (states.easy.length > 0) {
    w.写入字节(5, states.easy);
  }
  return w.转为字节();
}

// ========================================================
// Custom Study（自定义学习）相关编解码
// 来源：proto/anki/scheduler.proto
// ========================================================

/** CustomStudyRequest 的预设类型（与锁定 scheduler.proto 的 oneof value 对齐） */
export const 自定义学习预设 = {
  /** 增加新卡上限（int32，可负）—— 不创建过滤牌组 */
  新卡上限增量: 2,
  /** 增加复习上限（int32，可负）—— 不创建过滤牌组 */
  复习上限增量: 3,
  /** 复习遗忘（uint32 天数）—— 创建过滤牌组 */
  复习遗忘天数: 4,
  /** 提前复习（uint32 天数）—— 创建过滤牌组 */
  提前复习天数: 5,
  /** 预览新卡（uint32 天数）—— 创建过滤牌组 */
  预览新卡天数: 6,
  按状态或标签: 7
} as const;

export enum CustomStudyCardKind { Due = 0, New = 1, Review = 2, All = 3 }

export interface CustomStudyCram {
  kind: CustomStudyCardKind;
  cardLimit: number;
  tagsToInclude: string[];
  tagsToExclude: string[];
}

/** 状态/标签分支由 Core 构造搜索，前端不拼接标签查询或重新实现调度。 */
export function encodeCustomStudyCramRequest(deckId: number, cram: CustomStudyCram): Uint8Array {
  const w = new 协议写入器();
  w.写入64位整数(1, deckId);
  const value = new 协议写入器();
  value.写入变长整数(1, cram.kind);
  value.写入变长整数(2, cram.cardLimit);
  for (const tag of cram.tagsToInclude) {
    value.写入字符串(3, tag);
  }
  for (const tag of cram.tagsToExclude) {
    value.写入字符串(4, tag);
  }
  w.写入子消息(7, value);
  return w.转为字节();
}

/**
 * 编码 CustomStudyRequest（oneof value 只编码指定字段，其余跳过）。
 * deckId：目标牌组 ID
 * 预设字段号：见 自定义学习预设
 * 值：增量或天数
 */
export function encodeCustomStudyRequest(deckId: number, 预设字段号: number, 值: number): Uint8Array {
  const w = new 协议写入器();
  if (deckId !== 0) {
    w.写入64位整数(1, deckId);
  }
  // oneof value：字段号 2-6，int32 负数需用 64 位补码编码（与 prost 一致），uint32 用变长
  if (预设字段号 === 自定义学习预设.新卡上限增量) {
    // int32 可负，用 64 位补码编码
    w.写入64位整数(2, 值);
  } else if (预设字段号 === 自定义学习预设.复习上限增量) {
    w.写入64位整数(3, 值);
  } else if (预设字段号 === 自定义学习预设.复习遗忘天数) {
    if (值 !== 0) {
      w.写入变长整数(4, 值);
    }
  } else if (预设字段号 === 自定义学习预设.提前复习天数) {
    if (值 !== 0) {
      w.写入变长整数(5, 值);
    }
  } else if (预设字段号 === 自定义学习预设.预览新卡天数) {
    if (值 !== 0) {
      w.写入变长整数(6, 值);
    }
  }
  return w.转为字节();
}

/**
 * 编码 CustomStudyDefaultsRequest（仅 deck_id）。
 * 与 decks.DeckId 同结构，但类型独立。
 */
export function encodeCustomStudyDefaultsRequest(deckId: number): Uint8Array {
  const w = new 协议写入器();
  if (deckId !== 0) {
    w.写入64位整数(1, deckId);
  }
  return w.转为字节();
}

export interface 自定义学习标签 {
  name: string;
  include: boolean;
  exclude: boolean;
}

export interface 自定义学习默认值 {
  tags: 自定义学习标签[];
  extendNew: number;
  extendReview: number;
  availableNew: number;
  availableReview: number;
  availableNewInChildren: number;
  availableReviewInChildren: number;
}

function decode自定义学习标签(bytes: Uint8Array): 自定义学习标签 {
  const r = new 协议读取器(bytes);
  const out: 自定义学习标签 = { name: '', include: false, exclude: false };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        out.name = r.读取字符串();
        break;
      case 2:
        out.include = r.读取布尔();
        break;
      case 3:
        out.exclude = r.读取布尔();
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

export function decode自定义学习默认值(bytes: Uint8Array): 自定义学习默认值 {
  const r = new 协议读取器(bytes);
  const out: 自定义学习默认值 = {
    tags: [],
    extendNew: 0,
    extendReview: 0,
    availableNew: 0,
    availableReview: 0,
    availableNewInChildren: 0,
    availableReviewInChildren: 0
  };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        out.tags.push(decode自定义学习标签(r.读取字节()));
        break;
      case 2:
        out.extendNew = r.读取变长整数();
        break;
      case 3:
        out.extendReview = r.读取变长整数();
        break;
      case 4:
        out.availableNew = r.读取变长整数();
        break;
      case 5:
        out.availableReview = r.读取变长整数();
        break;
      case 6:
        out.availableNewInChildren = r.读取变长整数();
        break;
      case 7:
        out.availableReviewInChildren = r.读取变长整数();
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

// ========================================================
// SetDueDate / SortCards / RepositionDefaults（浏览页 T8 批量操作用）
// 字段来源：third_party/anki/proto/anki/scheduler.proto
// ========================================================

/**
 * anki.scheduler.SetDueDateRequest：
 * - field 1: repeated int64 card_ids（packed）
 * - field 2: string days（如 "5"=5天后 / "1-3"=1~3 天随机 / "0"=今天）
 * - field 3: config.OptionalStringConfigKey（持久化最近输入；前端不写则留空）
 *
 * Invariants: days 字符串格式与 Anki 桌面端「Set Due Date」对话框一致：
 *   "0"=今天 / "1"=明天 / "5"=5 天后 / "1-3"=1~3 天随机 / "!1"=1 天后（FSRS 重排）
 */
export function encodeSetDueDateRequest(cardIds: number[], days: string): Uint8Array {
  const w = new 协议写入器();
  if (cardIds.length > 0) {
    w.写入打包64位整数(1, cardIds);
  }
  if (days !== '') {
    w.写入字符串(2, days);
  }
  // field 3 config_key 留空：前端不复用 Anki 桌面端的「记住上次输入」配置
  return w.转为字节();
}

/**
 * anki.scheduler.SortCardsRequest（即「Reposition / 重新定位」）：
 * - field 1: repeated int64 card_ids（packed）
 * - field 2: uint32 starting_from（起始位置，默认 1）
 * - field 3: uint32 step_size（步长，默认 1）
 * - field 4: bool randomize（是否随机打乱）
 * - field 5: bool shift_existing（是否顺移已有新卡）
 *
 * Invariants: 仅对 new 队列卡片生效；review/learning 卡片位置不变。
 */
export function encodeSortCardsRequest(
  cardIds: number[],
  startingFrom: number,
  stepSize: number,
  randomize: boolean,
  shiftExisting: boolean
): Uint8Array {
  const w = new 协议写入器();
  if (cardIds.length > 0) {
    w.写入打包64位整数(1, cardIds);
  }
  if (startingFrom !== 0) {
    w.写入变长整数(2, startingFrom);
  }
  if (stepSize !== 0) {
    w.写入变长整数(3, stepSize);
  }
  if (randomize) {
    w.写入布尔(4, true);
  }
  if (shiftExisting) {
    w.写入布尔(5, true);
  }
  return w.转为字节();
}

/** anki.scheduler.RepositionDefaultsResponse：前端 Reposition 对话框默认值 */
export interface 重新定位默认值 {
  random: boolean;
  shift: boolean;
}

export function decode重新定位默认值(bytes: Uint8Array): 重新定位默认值 {
  const r = new 协议读取器(bytes);
  const out: 重新定位默认值 = { random: false, shift: false };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    if (tag.字段号 === 1) {
      out.random = r.读取布尔();
    } else if (tag.字段号 === 2) {
      out.shift = r.读取布尔();
    } else {
      r.跳过字段(tag.线类型);
    }
  }
  return out;
}
