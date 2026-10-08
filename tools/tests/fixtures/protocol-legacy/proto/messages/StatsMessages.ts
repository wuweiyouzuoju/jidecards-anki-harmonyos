// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID PROTO-MSG-STATS-001
// @名称 统计消息编解码
//
// @意图
// 编解码 anki.stats.proto 消息（Anki 26.05），覆盖统计页与首页所需全部字段：
// - GraphsRequest：search 空 = 全库统计；非空 = 按牌组统计（统计页牌组下拉）
// - GraphsView：完整图表（今日/月历/预测/小时分布/牌组 breakdown/难度/间隔/记忆率/FSRS 标志/真实保留率）
// - GraphPreferences：图表偏好（周首日 / 卡片计数分离 inactive / 浏览链接 / 预测显示 backlog）
//
// @Invariants
// - 仅解码统计页与首页用到的字段；未知字段跳过保证向前兼容（新版 Anki 加字段不崩）
// - proto3 optional 用 null；repeated 子消息用数组；map 用 Map<number, ...>
// - int32/int64 负数按二进制补码解释（prost sign-extend 后再编码为 varint）
//
// @ExtensionPoints
// - 新增图表分区：在 GraphsView 接口加字段 + decodeGraphsResponse 加 case + 测试覆盖
// - 新增偏好项：在 GraphPreferences 接口加字段 + encode/decode 同步 + 测试覆盖
//
// @字段来源
// third_party/anki/proto/anki/stats.proto（GraphsResponse + GraphPreferences）
// @语义来源
// rslib/src/stats/graphs/
//
// @业务规则
// reviews.count 的键为「距今天数」，0=今天，1=昨天，与 rslib reviews.rs 分桶一致。
// retrievability.average 为 0-100 百分制，仅当存在带 FSRS 记忆状态的卡片时非零。
// ReviewCountsAndTimes 的 count（field 1）为每日复习次数，time（field 2）为每日答题用时毫秒
// （复习图「时间」模式，对齐 Anki ReviewsGraph showTime 复选框）。
// map<int32, Reviews> 的 key 是 int32 varint，负数按补码解释。
// Hours.repeated Hour 是 24 元素向量（一天的 0-23 时），四个时间段分别对应 1月/3月/1年/全部。
// Buttons.ButtonCounts.learning/young/mature 是 4 元素向量（对应评分按钮 1-4）。
// CardCounts.includingInactive 包含埋藏/暂停（但其 suspended/buried 计数为 0）；
// excludingInactive 将埋藏/暂停单独计数。
// FutureDue.future_due 键为「距今天数」（可为负数表示 backlog），daily_load 为日均负载。
//
// @副作用
// 无
// ========================================================

import { 协议读取器 } from '../core/ProtoReader';
import { 协议写入器, 线类型_长度分隔 } from '../core/ProtoWriter';

export interface TodayCounts {
  answerCount: number;
  answerMillis: number;
  correctCount: number;
  matureCorrect: number;
  matureCount: number;
  learnCount: number;
  reviewCount: number;
  relearnCount: number;
  earlyReviewCount: number;
}

export interface RetrievabilitySummary {
  /** map<uint32, uint32>：键为记忆率桶（百分制），值为卡片数（Anki 直方图用）。 */
  buckets: Map<number, number> | null;
  average: number;
  sumByCard: number;
  sumByNote: number;
}

/** 单日内按卡片阶段拆分的复习计数（ReviewCountsAndTimes.Reviews）。 */
export interface ReviewKindCounts {
  learn: number;
  relearn: number;
  young: number;
  mature: number;
  filtered: number;
}

/** Buttons.ButtonCounts：4 元素向量（对应评分按钮 1-4）。 */
export interface ButtonCounts {
  learning: number[];
  young: number[];
  mature: number[];
}

/** GraphsResponse.buttons：4 个时间窗口的按钮统计。 */
export interface Buttons {
  oneMonth: ButtonCounts | null;
  threeMonths: ButtonCounts | null;
  oneYear: ButtonCounts | null;
  allTime: ButtonCounts | null;
}

/** GraphsResponse.CardCounts.Counts：按卡片状态分桶。 */
export interface CardCountsBreakdown {
  newCards: number;
  learn: number;
  relearn: number;
  young: number;
  mature: number;
  suspended: number;
  buried: number;
}

/** GraphsResponse.card_counts：含/排除 inactive 两种口径。 */
export interface CardCounts {
  /** 含埋藏/暂停（但 suspended/buried 计数为 0）。 */
  includingInactive: CardCountsBreakdown | null;
  /** 排除埋藏/暂停（suspended/buried 单独计数）。 */
  excludingInactive: CardCountsBreakdown | null;
}

/** Hours.Hour：单小时总复习数与正确数。 */
export interface HourBucket {
  total: number;
  correct: number;
}

/** GraphsResponse.hours：4 个时间段的 24 小时分布（一天的 0-23 时）。 */
export interface Hours {
  oneMonth: HourBucket[];
  threeMonths: HourBucket[];
  oneYear: HourBucket[];
  allTime: HourBucket[];
}

/** GraphsResponse.Eases / difficulty：难度分布 + 平均值。 */
export interface Eases {
  /** map<uint32, uint32>：键为难度桶（per mill / 10），值为卡片数。 */
  eases: Map<number, number> | null;
  average: number;
}

/** GraphsResponse.Intervals：间隔分布。 */
export interface Intervals {
  /** map<uint32, uint32>：键为间隔桶（天），值为卡片数。 */
  intervals: Map<number, number> | null;
}

/** GraphsResponse.FutureDue：未来到期预测。 */
export interface FutureDue {
  /** map<int32, uint32>：键为距今天数（可为负数表示 backlog）。 */
  futureDue: Map<number, number> | null;
  haveBacklog: boolean;
  dailyLoad: number;
}

/** GraphsResponse.Added：新增卡片按日分布。 */
export interface Added {
  /** map<int32, uint32>：键为距今天数。 */
  added: Map<number, number> | null;
}

/** TrueRetentionStats.TrueRetention：通过/未通过计数。 */
export interface TrueRetention {
  youngPassed: number;
  youngFailed: number;
  maturePassed: number;
  matureFailed: number;
}

/** GraphsResponse.true_retention：6 个时间窗口的真实保留率。 */
export interface TrueRetentionStats {
  today: TrueRetention | null;
  yesterday: TrueRetention | null;
  week: TrueRetention | null;
  month: TrueRetention | null;
  year: TrueRetention | null;
  allTime: TrueRetention | null;
}

export interface GraphsView {
  today: TodayCounts | null;
  retrievability: RetrievabilitySummary | null;
  /** 按日复习计数：键为距今天数（0=今天，1=昨天……），与 rslib reviews.rs 分桶一致。 */
  reviewCountsByDaysAgo: Map<number, ReviewKindCounts> | null;
  /** 按日复习用时（毫秒）：复习图「时间」模式数据源（Anki ReviewsGraph showTime）。 */
  reviewTimesByDaysAgo: Map<number, ReviewKindCounts> | null;
  fsrs: boolean;
  /** 按评分按钮统计（1-4）× 时间窗口。 */
  buttons: Buttons | null;
  /** 卡片状态分桶（含/排除 inactive）。 */
  cardCounts: CardCounts | null;
  /** 按小时分布（4 个时间段）。 */
  hours: Hours | null;
  /** SM-2 难度分布 + 平均值。 */
  eases: Eases | null;
  /** 间隔分布。 */
  intervals: Intervals | null;
  /** 未来到期预测。 */
  futureDue: FutureDue | null;
  /** 新增卡片按日分布。 */
  added: Added | null;
  /** 日切小时（0-23）。 */
  rolloverHour: number;
  /** FSRS 难度分布 + 平均值。 */
  difficulty: Eases | null;
  /** FSRS 稳定性分布。 */
  stability: Intervals | null;
  /** 真实保留率（6 个时间窗口）。 */
  trueRetention: TrueRetentionStats | null;
}

/** GraphsRequest：搜索串为空 = 全库统计（rslib graph_data_for_search 的 all 分支）；
 *  传 deck 搜索串时仅统计对应牌组（统计页牌组下拉）。 */
export function encodeGraphsRequest(days: number, search: string = ''): Uint8Array {
  const w = new 协议写入器();
  if (search !== '') {
    w.写入字符串(1, search);
  }
  if (days > 0) {
    w.写入变长整数(2, days);
  }
  return w.转为字节();
}

/** CardId 请求编码（stats.proto CardStats / GetReviewLogs 都用 cards.CardId）。 */
export function encodeCardIdRequest(cardId: number): Uint8Array {
  const w = new 协议写入器();
  if (cardId !== 0) {
    w.写入64位整数(1, cardId);
  }
  return w.转为字节();
}

function decodeToday(bytes: Uint8Array): TodayCounts {
  const r = new 协议读取器(bytes);
  const out: TodayCounts = {
    answerCount: 0,
    answerMillis: 0,
    correctCount: 0,
    matureCorrect: 0,
    matureCount: 0,
    learnCount: 0,
    reviewCount: 0,
    relearnCount: 0,
    earlyReviewCount: 0
  };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        out.answerCount = r.读取变长整数();
        break;
      case 2:
        out.answerMillis = r.读取变长整数();
        break;
      case 3:
        out.correctCount = r.读取变长整数();
        break;
      case 4:
        out.matureCorrect = r.读取变长整数();
        break;
      case 5:
        out.matureCount = r.读取变长整数();
        break;
      case 6:
        out.learnCount = r.读取变长整数();
        break;
      case 7:
        out.reviewCount = r.读取变长整数();
        break;
      case 8:
        out.relearnCount = r.读取变长整数();
        break;
      case 9:
        out.earlyReviewCount = r.读取变长整数();
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

function decodeRetrievability(bytes: Uint8Array): RetrievabilitySummary {
  const r = new 协议读取器(bytes);
  const out: RetrievabilitySummary = { buckets: null, average: 0, sumByCard: 0, sumByNote: 0 };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1: {
        if (out.buckets === null) {
          out.buckets = new Map<number, number>();
        }
        decodeUint32Uint32Entry(r.读取字节(), out.buckets);
        break;
      }
      case 2:
        out.average = r.读取浮点();
        break;
      case 3:
        out.sumByCard = r.读取浮点();
        break;
      case 4:
        out.sumByNote = r.读取浮点();
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

function decodeReviews(bytes: Uint8Array): ReviewKindCounts {
  const r = new 协议读取器(bytes);
  const out: ReviewKindCounts = { learn: 0, relearn: 0, young: 0, mature: 0, filtered: 0 };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        out.learn = r.读取变长整数();
        break;
      case 2:
        out.relearn = r.读取变长整数();
        break;
      case 3:
        out.young = r.读取变长整数();
        break;
      case 4:
        out.mature = r.读取变长整数();
        break;
      case 5:
        out.filtered = r.读取变长整数();
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

/** map<int32, Reviews> 条目：field1=key（int32 varint，负数按补码），field2=value 子消息。 */
function decodeReviewCountEntry(bytes: Uint8Array, out: Map<number, ReviewKindCounts>): void {
  const r = new 协议读取器(bytes);
  let daysAgo: number = 0;
  let counts: ReviewKindCounts | null = null;
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        daysAgo = Number(BigInt.asIntN(32, r.读取大变长整数()));
        break;
      case 2:
        counts = decodeReviews(r.读取字节());
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  if (counts !== null) {
    out.set(daysAgo, counts);
  }
}

/** GraphsResponse.reviews：count（每日次数）+ time（每日用时毫秒，复习图「时间」模式）。 */
interface ReviewCountsAndTimes {
  count: Map<number, ReviewKindCounts>;
  time: Map<number, ReviewKindCounts>;
}

function decodeReviewCountsAndTimes(bytes: Uint8Array): ReviewCountsAndTimes {
  const r = new 协议读取器(bytes);
  const out: ReviewCountsAndTimes = {
    count: new Map<number, ReviewKindCounts>(),
    time: new Map<number, ReviewKindCounts>()
  };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        decodeReviewCountEntry(r.读取字节(), out.count);
        break;
      case 2:
        // 每日答题用时（毫秒）：Anki ReviewsGraph showTime 复选框的数据源
        decodeReviewCountEntry(r.读取字节(), out.time);
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

// ========================================================
// 新增图表分区 decode（forecast/hours/decks/ease/interval 等）
// ========================================================

/** packed repeated uint32（wire type 2 载荷）。 */
function decodeUint32Array(bytes: Uint8Array): number[] {
  const r = new 协议读取器(bytes);
  const out: number[] = [];
  while (!r.已读完) {
    out.push(r.读取变长整数());
  }
  return out;
}

/** map<uint32, uint32> 条目：field1=key，field2=value。 */
function decodeUint32Uint32Entry(bytes: Uint8Array, out: Map<number, number>): void {
  const r = new 协议读取器(bytes);
  let key: number = 0;
  let value: number = 0;
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        key = r.读取变长整数();
        break;
      case 2:
        value = r.读取变长整数();
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  out.set(key, value);
}

/** map<int32, uint32> 条目：field1=key（int32 varint，负数按补码），field2=value。 */
function decodeInt32Uint32Entry(bytes: Uint8Array, out: Map<number, number>): void {
  const r = new 协议读取器(bytes);
  let key: number = 0;
  let value: number = 0;
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        key = Number(BigInt.asIntN(32, r.读取大变长整数()));
        break;
      case 2:
        value = r.读取变长整数();
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  out.set(key, value);
}

/** 解码 Buttons.ButtonCounts（4 元素向量 × 3 个按钮类别）。
 * proto3 repeated uint32 默认 packed（wire type 2），但解析器必须同时接受 unpacked
 * （每个值单独 wire type 0）。prost 一直发 packed，此处兼容两种以符合 proto3 规范。 */
function decodeButtonCounts(bytes: Uint8Array): ButtonCounts {
  const r = new 协议读取器(bytes);
  const out: ButtonCounts = { learning: [], young: [], mature: [] };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        if (tag.线类型 === 线类型_长度分隔) {
          out.learning = decodeUint32Array(r.读取字节());
        } else {
          out.learning.push(r.读取变长整数());
        }
        break;
      case 2:
        if (tag.线类型 === 线类型_长度分隔) {
          out.young = decodeUint32Array(r.读取字节());
        } else {
          out.young.push(r.读取变长整数());
        }
        break;
      case 3:
        if (tag.线类型 === 线类型_长度分隔) {
          out.mature = decodeUint32Array(r.读取字节());
        } else {
          out.mature.push(r.读取变长整数());
        }
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

/** 解码 GraphsResponse.buttons（4 个时间窗口）。 */
function decodeButtons(bytes: Uint8Array): Buttons {
  const r = new 协议读取器(bytes);
  const out: Buttons = {
    oneMonth: null,
    threeMonths: null,
    oneYear: null,
    allTime: null
  };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        out.oneMonth = decodeButtonCounts(r.读取字节());
        break;
      case 2:
        out.threeMonths = decodeButtonCounts(r.读取字节());
        break;
      case 3:
        out.oneYear = decodeButtonCounts(r.读取字节());
        break;
      case 4:
        out.allTime = decodeButtonCounts(r.读取字节());
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

/** 解码 CardCounts.Counts（按状态分桶）。 */
function decodeCardCountsBreakdown(bytes: Uint8Array): CardCountsBreakdown {
  const r = new 协议读取器(bytes);
  const out: CardCountsBreakdown = {
    newCards: 0,
    learn: 0,
    relearn: 0,
    young: 0,
    mature: 0,
    suspended: 0,
    buried: 0
  };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        out.newCards = r.读取变长整数();
        break;
      case 2:
        out.learn = r.读取变长整数();
        break;
      case 3:
        out.relearn = r.读取变长整数();
        break;
      case 4:
        out.young = r.读取变长整数();
        break;
      case 5:
        out.mature = r.读取变长整数();
        break;
      case 6:
        out.suspended = r.读取变长整数();
        break;
      case 7:
        out.buried = r.读取变长整数();
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

/** 解码 GraphsResponse.card_counts（含/排除 inactive）。 */
function decodeCardCounts(bytes: Uint8Array): CardCounts {
  const r = new 协议读取器(bytes);
  const out: CardCounts = {
    includingInactive: null,
    excludingInactive: null
  };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        out.includingInactive = decodeCardCountsBreakdown(r.读取字节());
        break;
      case 2:
        out.excludingInactive = decodeCardCountsBreakdown(r.读取字节());
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

/** 解码 Hours.Hour（单小时计数）。 */
function decodeHourBucket(bytes: Uint8Array): HourBucket {
  const r = new 协议读取器(bytes);
  const out: HourBucket = { total: 0, correct: 0 };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        out.total = r.读取变长整数();
        break;
      case 2:
        out.correct = r.读取变长整数();
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

/** 解码 GraphsResponse.hours（4 个时间段，每个是 repeated Hour 子消息）。
 * repeated Hour 在 wire format 中是同一 field 号多次出现（非 packed），
 * 每次 wire type 2（子消息），与 CardStatsResponse.revlog 同模式。 */
function decodeHours(bytes: Uint8Array): Hours {
  const r = new 协议读取器(bytes);
  const out: Hours = {
    oneMonth: [],
    threeMonths: [],
    oneYear: [],
    allTime: []
  };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        out.oneMonth.push(decodeHourBucket(r.读取字节()));
        break;
      case 2:
        out.threeMonths.push(decodeHourBucket(r.读取字节()));
        break;
      case 3:
        out.oneYear.push(decodeHourBucket(r.读取字节()));
        break;
      case 4:
        out.allTime.push(decodeHourBucket(r.读取字节()));
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

/** 解码 Eases / difficulty：map<uint32, uint32> + average。 */
function decodeEases(bytes: Uint8Array): Eases {
  const r = new 协议读取器(bytes);
  const out: Eases = { eases: null, average: 0 };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1: {
        if (out.eases === null) {
          out.eases = new Map<number, number>();
        }
        decodeUint32Uint32Entry(r.读取字节(), out.eases);
        break;
      }
      case 2:
        out.average = r.读取浮点();
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

/** 解码 Intervals / stability：map<uint32, uint32>。 */
function decodeIntervals(bytes: Uint8Array): Intervals {
  const r = new 协议读取器(bytes);
  const out: Intervals = { intervals: null };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1: {
        if (out.intervals === null) {
          out.intervals = new Map<number, number>();
        }
        decodeUint32Uint32Entry(r.读取字节(), out.intervals);
        break;
      }
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

/** 解码 FutureDue：map<int32, uint32> + have_backlog + daily_load。 */
function decodeFutureDue(bytes: Uint8Array): FutureDue {
  const r = new 协议读取器(bytes);
  const out: FutureDue = { futureDue: null, haveBacklog: false, dailyLoad: 0 };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1: {
        if (out.futureDue === null) {
          out.futureDue = new Map<number, number>();
        }
        decodeInt32Uint32Entry(r.读取字节(), out.futureDue);
        break;
      }
      case 2:
        out.haveBacklog = r.读取布尔();
        break;
      case 3:
        out.dailyLoad = r.读取变长整数();
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

/** 解码 Added：map<int32, uint32>。 */
function decodeAdded(bytes: Uint8Array): Added {
  const r = new 协议读取器(bytes);
  const out: Added = { added: null };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1: {
        if (out.added === null) {
          out.added = new Map<number, number>();
        }
        decodeInt32Uint32Entry(r.读取字节(), out.added);
        break;
      }
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

/** 解码 TrueRetention。 */
function decodeTrueRetention(bytes: Uint8Array): TrueRetention {
  const r = new 协议读取器(bytes);
  const out: TrueRetention = {
    youngPassed: 0,
    youngFailed: 0,
    maturePassed: 0,
    matureFailed: 0
  };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        out.youngPassed = r.读取变长整数();
        break;
      case 2:
        out.youngFailed = r.读取变长整数();
        break;
      case 3:
        out.maturePassed = r.读取变长整数();
        break;
      case 4:
        out.matureFailed = r.读取变长整数();
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

/** 解码 TrueRetentionStats（6 个时间窗口）。 */
function decodeTrueRetentionStats(bytes: Uint8Array): TrueRetentionStats {
  const r = new 协议读取器(bytes);
  const out: TrueRetentionStats = {
    today: null,
    yesterday: null,
    week: null,
    month: null,
    year: null,
    allTime: null
  };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        out.today = decodeTrueRetention(r.读取字节());
        break;
      case 2:
        out.yesterday = decodeTrueRetention(r.读取字节());
        break;
      case 3:
        out.week = decodeTrueRetention(r.读取字节());
        break;
      case 4:
        out.month = decodeTrueRetention(r.读取字节());
        break;
      case 5:
        out.year = decodeTrueRetention(r.读取字节());
        break;
      case 6:
        out.allTime = decodeTrueRetention(r.读取字节());
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

export function decodeGraphsResponse(bytes: Uint8Array): GraphsView {
  const r = new 协议读取器(bytes);
  const out: GraphsView = {
    today: null,
    retrievability: null,
    reviewCountsByDaysAgo: null,
    reviewTimesByDaysAgo: null,
    fsrs: false,
    buttons: null,
    cardCounts: null,
    hours: null,
    eases: null,
    intervals: null,
    futureDue: null,
    added: null,
    rolloverHour: 0,
    difficulty: null,
    stability: null,
    trueRetention: null
  };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    // 单字段解码失败时附字段号 + 线类型，便于定位是哪个图表分区的数据触发了
    // "proto:length-delimited field exceeds input" 等错误。
    try {
      switch (tag.字段号) {
        case 1:
          out.buttons = decodeButtons(r.读取字节());
          break;
        case 2:
          out.cardCounts = decodeCardCounts(r.读取字节());
          break;
        case 3:
          out.hours = decodeHours(r.读取字节());
          break;
        case 4:
          out.today = decodeToday(r.读取字节());
          break;
        case 5:
          out.eases = decodeEases(r.读取字节());
          break;
        case 6:
          out.intervals = decodeIntervals(r.读取字节());
          break;
        case 7:
          out.futureDue = decodeFutureDue(r.读取字节());
          break;
        case 8:
          out.added = decodeAdded(r.读取字节());
          break;
        case 9: {
          const reviews: ReviewCountsAndTimes = decodeReviewCountsAndTimes(r.读取字节());
          out.reviewCountsByDaysAgo = reviews.count;
          out.reviewTimesByDaysAgo = reviews.time;
          break;
        }
        case 10:
          out.rolloverHour = r.读取变长整数();
          break;
        case 11:
          out.difficulty = decodeEases(r.读取字节());
          break;
        case 12:
          out.retrievability = decodeRetrievability(r.读取字节());
          break;
        case 13:
          out.fsrs = r.读取布尔();
          break;
        case 14:
          out.stability = decodeIntervals(r.读取字节());
          break;
        case 15:
          out.trueRetention = decodeTrueRetentionStats(r.读取字节());
          break;
        default:
          r.跳过字段(tag.线类型);
      }
    } catch (e) {
      const 原始信息 = e instanceof Error ? e.message : `${e}`;
      throw new Error(`stats field ${tag.字段号} (wire ${tag.线类型}): ${原始信息}`);
    }
  }
  return out;
}

// ========================================================
// GraphPreferences 编解码（统计偏好）
// ========================================================

/** GraphPreferences.Weekday：周首日（与 stats.proto 对齐，仅枚举 Anki 支持的 4 值）。 */
export enum Weekday {
  SUNDAY = 0,
  MONDAY = 1,
  FRIDAY = 5,
  SATURDAY = 6
}

export interface GraphPreferences {
  calendarFirstDayOfWeek: Weekday;
  cardCountsSeparateInactive: boolean;
  browserLinksSupported: boolean;
  futureDueShowBacklog: boolean;
}

/** 解码 GraphPreferences（GetGraphPreferences 响应）。 */
export function decodeGraphPreferences(bytes: Uint8Array): GraphPreferences {
  const r = new 协议读取器(bytes);
  const out: GraphPreferences = {
    calendarFirstDayOfWeek: Weekday.SUNDAY,
    cardCountsSeparateInactive: false,
    browserLinksSupported: false,
    futureDueShowBacklog: false
  };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        out.calendarFirstDayOfWeek = r.读取变长整数() as Weekday;
        break;
      case 2:
        out.cardCountsSeparateInactive = r.读取布尔();
        break;
      case 3:
        out.browserLinksSupported = r.读取布尔();
        break;
      case 4:
        out.futureDueShowBacklog = r.读取布尔();
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

/**
 * 编码 GraphPreferences（SetGraphPreferences 请求）。
 * 与 prost 一致：proto3 默认值（SUNDAY=0 / false）省略不写。
 */
export function encodeGraphPreferences(prefs: GraphPreferences): Uint8Array {
  const w = new 协议写入器();
  if (prefs.calendarFirstDayOfWeek !== Weekday.SUNDAY) {
    w.写入变长整数(1, prefs.calendarFirstDayOfWeek);
  }
  if (prefs.cardCountsSeparateInactive) {
    w.写入布尔(2, true);
  }
  if (prefs.browserLinksSupported) {
    w.写入布尔(3, true);
  }
  if (prefs.futureDueShowBacklog) {
    w.写入布尔(4, true);
  }
  return w.转为字节();
}

/** 编码 generic.Empty（GetGraphPreferences 请求，零字节）。 */
export function encodeEmpty(): Uint8Array {
  return new Uint8Array(0);
}

// ========================================================
// CardStatsResponse / ReviewLogs（T11 卡片信息用）
// ========================================================

/** RevlogEntry.ReviewKind：复习类型 */
export enum ReviewKind {
  LEARNING = 0,
  REVIEW = 1,
  RELEARNING = 2,
  FILTERED = 3,
  MANUAL = 4,
  RESCHEDULED = 5
}

/** CardStatsResponse.StatsRevlogEntry：单条复习日志（T11 卡片信息历史列表用） */
export interface StatsRevlogEntry {
  time: number;
  reviewKind: ReviewKind;
  buttonChosen: number;
  /** 间隔（秒） */
  interval: number;
  /** 难度（per mill） */
  ease: number;
  /** 用时（秒） */
  takenSecs: number;
  /** 上次间隔（秒） */
  lastInterval: number;
}

/** CardStatsResponse：卡片完整统计（调度信息 + 复习历史） */
export interface CardStatsView {
  /** 复习历史（按时间倒序，最新在前） */
  revlog: StatsRevlogEntry[];
  cardId: number;
  noteId: number;
  deck: string;
  /** 添加时间（Unix 时间戳，秒） */
  added: number;
  /** 首次复习时间（可选，Unix 时间戳，秒） */
  firstReview?: number;
  /** 最近复习时间（可选，Unix 时间戳，秒） */
  latestReview?: number;
  /** 到期时间（可选，Unix 时间戳，秒） */
  dueDate?: number;
  /** 到期位置（可选，新卡按位置排序时用） */
  duePosition?: number;
  /** 当前间隔（天） */
  interval: number;
  /** 难度（per mill） */
  ease: number;
  /** 复习次数 */
  reviews: number;
  /** 遗忘次数 */
  lapses: number;
  /** 平均用时（秒） */
  averageSecs: number;
  /** 总用时（秒） */
  totalSecs: number;
  /** 卡片类型名 */
  cardType: string;
  /** 笔记类型名 */
  notetype: string;
  /** FSRS 可提取率（0-1，可选） */
  fsrsRetrievability?: number;
}

function decodeStatsRevlogEntry(bytes: Uint8Array): StatsRevlogEntry {
  const r = new 协议读取器(bytes);
  const out: StatsRevlogEntry = {
    time: 0,
    reviewKind: ReviewKind.LEARNING,
    buttonChosen: 0,
    interval: 0,
    ease: 0,
    takenSecs: 0,
    lastInterval: 0
  };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1: out.time = r.读取64位整数(); break;
      case 2: out.reviewKind = r.读取变长整数() as ReviewKind; break;
      case 3: out.buttonChosen = r.读取变长整数(); break;
      case 4: out.interval = r.读取变长整数(); break;
      case 5: out.ease = r.读取变长整数(); break;
      case 6: out.takenSecs = r.读取浮点(); break;
      case 8: out.lastInterval = r.读取变长整数(); break;
      default: r.跳过字段(tag.线类型);
    }
  }
  return out;
}

/** 解码 CardStatsResponse（stats.proto 方法 0 CardStats 的响应） */
export function decodeCardStatsResponse(bytes: Uint8Array): CardStatsView {
  const r = new 协议读取器(bytes);
  const out: CardStatsView = {
    revlog: [],
    cardId: 0,
    noteId: 0,
    deck: '',
    added: 0,
    interval: 0,
    ease: 0,
    reviews: 0,
    lapses: 0,
    averageSecs: 0,
    totalSecs: 0,
    cardType: '',
    notetype: ''
  };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1: out.revlog.push(decodeStatsRevlogEntry(r.读取字节())); break;
      case 2: out.cardId = r.读取64位整数(); break;
      case 3: out.noteId = r.读取64位整数(); break;
      case 4: out.deck = r.读取字符串(); break;
      case 5: out.added = r.读取64位整数(); break;
      case 6: out.firstReview = r.读取64位整数(); break;
      case 7: out.latestReview = r.读取64位整数(); break;
      case 8: out.dueDate = r.读取64位整数(); break;
      case 9: out.duePosition = r.读取变长整数(); break;
      case 10: out.interval = r.读取变长整数(); break;
      case 11: out.ease = r.读取变长整数(); break;
      case 12: out.reviews = r.读取变长整数(); break;
      case 13: out.lapses = r.读取变长整数(); break;
      case 14: out.averageSecs = r.读取浮点(); break;
      case 15: out.totalSecs = r.读取浮点(); break;
      case 16: out.cardType = r.读取字符串(); break;
      case 17: out.notetype = r.读取字符串(); break;
      case 19: out.fsrsRetrievability = r.读取浮点(); break;
      default: r.跳过字段(tag.线类型);
    }
  }
  return out;
}
