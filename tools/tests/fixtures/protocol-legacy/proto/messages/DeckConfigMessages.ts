// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID PROTO-MSG-DECKCONF-001
// @名称 牌组配置消息编解码
//
// @作用
// 编解码 anki.deck_config.proto 消息（Anki 26.05）：
// - DeckConfig / DeckConfigSettings：完整牌组配置（40+ 字段，含 FSRS 参数）
// - DeckLimits / CurrentDeckInfo / DeckConfigsForUpdateView：配置面板视图
// - UpdateDeckConfigsInput：批量更新请求（增删改 + 应用到子牌组 + FSRS 重排）
// 字段来源：third_party/anki/proto/anki/deck_config.proto
//
// @输入
// 编码：DeckConfig / DeckLimits / UpdateDeckConfigsInput 结构
// 解码：字节流
//
// @输出
// 编码：Uint8Array 字节
// 解码：DeckConfig / DeckConfigsForUpdateView
//
// @业务规则
// `preserved` 字段原样保留未知字段字节，保证未来 Anki 加字段时更新无损。
// `other`（field 255）保留 backend 自定义字节。
// 每个公共 Config 字段都建模，无字段被丢弃。
// 紧凑写法（单行多语句）是为减小文件体积，逻辑与 prost 对齐。
//
// @副作用
// 无
// ========================================================

import { 协议读取器 } from '../core/ProtoReader';
import { 协议写入器, 线类型_长度分隔 } from '../core/ProtoWriter';

export function encodeDeckConfigId(dcid: number): Uint8Array {
  const w = new 协议写入器();
  if (dcid !== 0) w.写入64位整数(1, dcid);
  return w.转为字节();
}

export interface DeckConfigSettings {
  learnSteps: number[]; relearnSteps: number[]; fsrsParams4: number[]; easyDaysPercentages: number[];
  fsrsParams5: number[]; fsrsParams6: number[]; newPerDay: number; reviewsPerDay: number;
  initialEase: number; easyMultiplier: number; hardMultiplier: number; lapseMultiplier: number;
  intervalMultiplier: number; maximumReviewInterval: number; minimumLapseInterval: number;
  graduatingIntervalGood: number; graduatingIntervalEasy: number; newCardInsertOrder: number;
  leechAction: number; leechThreshold: number; disableAutoplay: boolean; capAnswerTimeToSecs: number;
  showTimer: boolean; skipQuestionWhenReplayingAnswer: boolean; buryNew: boolean; buryReviews: boolean;
  buryInterdayLearning: boolean; newMix: number; interdayLearningMix: number; newCardSortOrder: number;
  reviewOrder: number; newCardGatherPriority: number; newPerDayMinimum: number; questionAction: number;
  desiredRetention: number; stopTimerOnAnswer: boolean; historicalRetention: number;
  secondsToShowQuestion: number; secondsToShowAnswer: number; answerAction: number; waitForAudio: boolean;
  paramSearch: string; ignoreRevlogsBeforeDate: string; other: Uint8Array; preserved: Uint8Array[];
}

export interface DeckConfig { id: number; name: string; mtimeSecs: number; usn: number; config: DeckConfigSettings | null; }

export function emptyDeckConfigSettings(): DeckConfigSettings {
  return {
    learnSteps: [], relearnSteps: [], fsrsParams4: [], easyDaysPercentages: [], fsrsParams5: [], fsrsParams6: [],
    newPerDay: 0, reviewsPerDay: 0, initialEase: 0, easyMultiplier: 0, hardMultiplier: 0, lapseMultiplier: 0,
    intervalMultiplier: 0, maximumReviewInterval: 0, minimumLapseInterval: 0, graduatingIntervalGood: 0,
    graduatingIntervalEasy: 0, newCardInsertOrder: 0, leechAction: 0, leechThreshold: 0, disableAutoplay: false,
    capAnswerTimeToSecs: 0, showTimer: false, skipQuestionWhenReplayingAnswer: false, buryNew: false,
    buryReviews: false, buryInterdayLearning: false, newMix: 0, interdayLearningMix: 0, newCardSortOrder: 0,
    reviewOrder: 0, newCardGatherPriority: 0, newPerDayMinimum: 0, questionAction: 0, desiredRetention: 0,
    stopTimerOnAnswer: false, historicalRetention: 0, secondsToShowQuestion: 0, secondsToShowAnswer: 0,
    answerAction: 0, waitForAudio: false, paramSearch: '', ignoreRevlogsBeforeDate: '', other: new Uint8Array(), preserved: []
  };
}

function floats(w: 协议写入器, field: number, value: number[]): void { if (value.length > 0) w.写入打包浮点(field, value); }
function uint(w: 协议写入器, field: number, value: number): void { if (value !== 0) w.写入变长整数(field, value); }
function float(w: 协议写入器, field: number, value: number): void { if (value !== 0) w.写入浮点(field, value); }
function bool(w: 协议写入器, field: number, value: boolean): void { if (value) w.写入布尔(field, true); }
function text(w: 协议写入器, field: number, value: string): void { if (value !== '') w.写入字符串(field, value); }
function 读取浮点s(r: 协议读取器, wireType: number, target: number[]): void {
  if (wireType === 线类型_长度分隔) target.push(...r.读取打包浮点()); else target.push(r.读取浮点());
}

function encodeSettings(input: DeckConfigSettings): 协议写入器 {
  const v: DeckConfigSettings = { ...emptyDeckConfigSettings(), ...input };
  const w = new 协议写入器();
  floats(w, 1, v.learnSteps); floats(w, 2, v.relearnSteps); floats(w, 3, v.fsrsParams4); floats(w, 4, v.easyDaysPercentages);
  floats(w, 5, v.fsrsParams5); floats(w, 6, v.fsrsParams6); uint(w, 9, v.newPerDay); uint(w, 10, v.reviewsPerDay);
  float(w, 11, v.initialEase); float(w, 12, v.easyMultiplier); float(w, 13, v.hardMultiplier); float(w, 14, v.lapseMultiplier);
  float(w, 15, v.intervalMultiplier); uint(w, 16, v.maximumReviewInterval); uint(w, 17, v.minimumLapseInterval);
  uint(w, 18, v.graduatingIntervalGood); uint(w, 19, v.graduatingIntervalEasy); uint(w, 20, v.newCardInsertOrder);
  uint(w, 21, v.leechAction); uint(w, 22, v.leechThreshold); bool(w, 23, v.disableAutoplay); uint(w, 24, v.capAnswerTimeToSecs);
  bool(w, 25, v.showTimer); bool(w, 26, v.skipQuestionWhenReplayingAnswer); bool(w, 27, v.buryNew); bool(w, 28, v.buryReviews);
  bool(w, 29, v.buryInterdayLearning); uint(w, 30, v.newMix); uint(w, 31, v.interdayLearningMix); uint(w, 32, v.newCardSortOrder);
  uint(w, 33, v.reviewOrder); uint(w, 34, v.newCardGatherPriority); uint(w, 35, v.newPerDayMinimum); uint(w, 36, v.questionAction);
  float(w, 37, v.desiredRetention); bool(w, 38, v.stopTimerOnAnswer); float(w, 40, v.historicalRetention);
  float(w, 41, v.secondsToShowQuestion); float(w, 42, v.secondsToShowAnswer); uint(w, 43, v.answerAction); bool(w, 44, v.waitForAudio);
  text(w, 45, v.paramSearch); text(w, 46, v.ignoreRevlogsBeforeDate); if (v.other.length > 0) w.写入字节(255, v.other);
  for (const raw of v.preserved) w.写入原始字节(raw);
  return w;
}

function decodeSettings(bytes: Uint8Array): DeckConfigSettings {
  const r = new 协议读取器(bytes); const out = emptyDeckConfigSettings();
  while (true) {
    const start = r.当前位置;
    const tag = r.读取标签();
    if (tag === null) break;
    switch (tag.字段号) {
      case 1: 读取浮点s(r, tag.线类型, out.learnSteps); break; case 2: 读取浮点s(r, tag.线类型, out.relearnSteps); break;
      case 3: 读取浮点s(r, tag.线类型, out.fsrsParams4); break; case 4: 读取浮点s(r, tag.线类型, out.easyDaysPercentages); break;
      case 5: 读取浮点s(r, tag.线类型, out.fsrsParams5); break; case 6: 读取浮点s(r, tag.线类型, out.fsrsParams6); break;
      case 9: out.newPerDay = r.读取变长整数(); break; case 10: out.reviewsPerDay = r.读取变长整数(); break;
      case 11: out.initialEase = r.读取浮点(); break; case 12: out.easyMultiplier = r.读取浮点(); break;
      case 13: out.hardMultiplier = r.读取浮点(); break; case 14: out.lapseMultiplier = r.读取浮点(); break;
      case 15: out.intervalMultiplier = r.读取浮点(); break; case 16: out.maximumReviewInterval = r.读取变长整数(); break;
      case 17: out.minimumLapseInterval = r.读取变长整数(); break; case 18: out.graduatingIntervalGood = r.读取变长整数(); break;
      case 19: out.graduatingIntervalEasy = r.读取变长整数(); break; case 20: out.newCardInsertOrder = r.读取变长整数(); break;
      case 21: out.leechAction = r.读取变长整数(); break; case 22: out.leechThreshold = r.读取变长整数(); break;
      case 23: out.disableAutoplay = r.读取布尔(); break; case 24: out.capAnswerTimeToSecs = r.读取变长整数(); break;
      case 25: out.showTimer = r.读取布尔(); break; case 26: out.skipQuestionWhenReplayingAnswer = r.读取布尔(); break;
      case 27: out.buryNew = r.读取布尔(); break; case 28: out.buryReviews = r.读取布尔(); break;
      case 29: out.buryInterdayLearning = r.读取布尔(); break; case 30: out.newMix = r.读取变长整数(); break;
      case 31: out.interdayLearningMix = r.读取变长整数(); break; case 32: out.newCardSortOrder = r.读取变长整数(); break;
      case 33: out.reviewOrder = r.读取变长整数(); break; case 34: out.newCardGatherPriority = r.读取变长整数(); break;
      case 35: out.newPerDayMinimum = r.读取变长整数(); break; case 36: out.questionAction = r.读取变长整数(); break;
      case 37: out.desiredRetention = r.读取浮点(); break; case 38: out.stopTimerOnAnswer = r.读取布尔(); break;
      case 40: out.historicalRetention = r.读取浮点(); break; case 41: out.secondsToShowQuestion = r.读取浮点(); break;
      case 42: out.secondsToShowAnswer = r.读取浮点(); break; case 43: out.answerAction = r.读取变长整数(); break;
      case 44: out.waitForAudio = r.读取布尔(); break; case 45: out.paramSearch = r.读取字符串(); break;
      case 46: out.ignoreRevlogsBeforeDate = r.读取字符串(); break; case 255: out.other = r.读取字节(); break;
      default: r.跳过字段(tag.线类型); out.preserved.push(r.截取片段(start)); break;
    }
  }
  return out;
}

export function encodeDeckConfig(value: DeckConfig): Uint8Array {
  const w = new 协议写入器(); if (value.id !== 0) w.写入64位整数(1, value.id); if (value.name !== '') w.写入字符串(2, value.name);
  if (value.mtimeSecs !== 0) w.写入64位整数(3, value.mtimeSecs); if (value.usn !== 0) w.写入变长整数(4, value.usn);
  if (value.config !== null) w.写入子消息(5, encodeSettings(value.config)); return w.转为字节();
}
export function decodeDeckConfig(bytes: Uint8Array): DeckConfig {
  const r = new 协议读取器(bytes); const out: DeckConfig = { id: 0, name: '', mtimeSecs: 0, usn: 0, config: null }; let tag;
  while ((tag = r.读取标签()) !== null) { switch (tag.字段号) { case 1: out.id = r.读取64位整数(); break; case 2: out.name = r.读取字符串(); break; case 3: out.mtimeSecs = r.读取64位整数(); break; case 4: out.usn = r.读取32位整数(); break; case 5: out.config = decodeSettings(r.读取字节()); break; default: r.跳过字段(tag.线类型); } }
  return out;
}

export interface DeckLimits { review: number | null; new: number | null; reviewToday: number | null; newToday: number | null; reviewTodayActive: boolean; newTodayActive: boolean; desiredRetention: number | null; }
export function encodeLimits(v: DeckLimits): 协议写入器 {
  const w = new 协议写入器();
  // optional 的 0 表示零限额，必须与 null（跟随预设／清除覆盖）区分。
  if (v.review !== null) w.写入变长整数(1, v.review);
  if (v.new !== null) w.写入变长整数(2, v.new);
  if (v.reviewToday !== null) w.写入变长整数(3, v.reviewToday);
  if (v.newToday !== null) w.写入变长整数(4, v.newToday);
  bool(w, 5, v.reviewTodayActive); bool(w, 6, v.newTodayActive);
  if (v.desiredRetention !== null) w.写入浮点(7, v.desiredRetention);
  return w;
}
export function decodeLimits(bytes: Uint8Array): DeckLimits { const r = new 协议读取器(bytes); const out: DeckLimits = { review: null, new: null, reviewToday: null, newToday: null, reviewTodayActive: false, newTodayActive: false, desiredRetention: null }; let tag; while ((tag = r.读取标签()) !== null) { switch (tag.字段号) { case 1: out.review = r.读取变长整数(); break; case 2: out.new = r.读取变长整数(); break; case 3: out.reviewToday = r.读取变长整数(); break; case 4: out.newToday = r.读取变长整数(); break; case 5: out.reviewTodayActive = r.读取布尔(); break; case 6: out.newTodayActive = r.读取布尔(); break; case 7: out.desiredRetention = r.读取浮点(); break; default: r.跳过字段(tag.线类型); } } return out; }

export interface DeckConfigWithUseCount { config: DeckConfig; useCount: number; }
export interface CurrentDeckInfo { name: string; configId: number; parentConfigIds: number[]; limits: DeckLimits | null; }
function decodeConfigWithExtra(bytes: Uint8Array): DeckConfigWithUseCount { const r = new 协议读取器(bytes); const out: DeckConfigWithUseCount = { config: { id: 0, name: '', mtimeSecs: 0, usn: 0, config: null }, useCount: 0 }; let tag; while ((tag = r.读取标签()) !== null) { if (tag.字段号 === 1) out.config = decodeDeckConfig(r.读取字节()); else if (tag.字段号 === 2) out.useCount = r.读取变长整数(); else r.跳过字段(tag.线类型); } return out; }
function decodeCurrentDeck(bytes: Uint8Array): CurrentDeckInfo { const r = new 协议读取器(bytes); const out: CurrentDeckInfo = { name: '', configId: 0, parentConfigIds: [], limits: null }; let tag; while ((tag = r.读取标签()) !== null) { switch (tag.字段号) { case 1: out.name = r.读取字符串(); break; case 2: out.configId = r.读取64位整数(); break; case 3: if (tag.线类型 === 线类型_长度分隔) out.parentConfigIds.push(...r.读取打包64位整数()); else out.parentConfigIds.push(r.读取64位整数()); break; case 4: out.limits = decodeLimits(r.读取字节()); break; default: r.跳过字段(tag.线类型); } } return out; }
export interface DeckConfigsForUpdateView { allConfigs: DeckConfigWithUseCount[]; currentDeck: CurrentDeckInfo | null; defaults: DeckConfig | null; schemaModified: boolean; cardStateCustomizer: string; newCardsIgnoreReviewLimit: boolean; fsrs: boolean; applyAllParentLimits: boolean; fsrsHealthCheck: boolean; }
export function decodeDeckConfigsForUpdate(bytes: Uint8Array): DeckConfigsForUpdateView { const r = new 协议读取器(bytes); const out: DeckConfigsForUpdateView = { allConfigs: [], currentDeck: null, defaults: null, schemaModified: false, cardStateCustomizer: '', newCardsIgnoreReviewLimit: false, fsrs: false, applyAllParentLimits: false, fsrsHealthCheck: false }; let tag; while ((tag = r.读取标签()) !== null) { switch (tag.字段号) { case 1: out.allConfigs.push(decodeConfigWithExtra(r.读取字节())); break; case 2: out.currentDeck = decodeCurrentDeck(r.读取字节()); break; case 3: out.defaults = decodeDeckConfig(r.读取字节()); break; case 4: out.schemaModified = r.读取布尔(); break; case 6: out.cardStateCustomizer = r.读取字符串(); break; case 7: out.newCardsIgnoreReviewLimit = r.读取布尔(); break; case 8: out.fsrs = r.读取布尔(); break; case 9: out.applyAllParentLimits = r.读取布尔(); break; case 11: out.fsrsHealthCheck = r.读取布尔(); break; default: r.跳过字段(tag.线类型); } } return out; }
export const UPDATE_DECK_CONFIGS_MODE_NORMAL = 0; export const UPDATE_DECK_CONFIGS_MODE_APPLY_TO_CHILDREN = 1; export const UPDATE_DECK_CONFIGS_MODE_COMPUTE_ALL_PARAMS = 2;
export interface UpdateDeckConfigsInput { targetDeckId: number; configs: DeckConfig[]; removedConfigIds: number[]; mode: number; cardStateCustomizer: string; limits: DeckLimits | null; newCardsIgnoreReviewLimit: boolean; fsrs: boolean; applyAllParentLimits: boolean; fsrsReschedule: boolean; fsrsHealthCheck: boolean; }
export function encodeUpdateDeckConfigsRequest(req: UpdateDeckConfigsInput): Uint8Array { const w = new 协议写入器(); if (req.targetDeckId !== 0) w.写入64位整数(1, req.targetDeckId); for (const config of req.configs) w.写入字节(2, encodeDeckConfig(config)); w.写入打包64位整数(3, req.removedConfigIds); uint(w, 4, req.mode); text(w, 5, req.cardStateCustomizer); if (req.limits !== null) w.写入子消息(6, encodeLimits(req.limits)); bool(w, 7, req.newCardsIgnoreReviewLimit); bool(w, 8, req.fsrs); bool(w, 9, req.applyAllParentLimits); bool(w, 10, req.fsrsReschedule); bool(w, 11, req.fsrsHealthCheck); return w.转为字节(); }
export function decodeUpdateDeckConfigsRequest(bytes: Uint8Array): UpdateDeckConfigsInput { const r = new 协议读取器(bytes); const out: UpdateDeckConfigsInput = { targetDeckId: 0, configs: [], removedConfigIds: [], mode: 0, cardStateCustomizer: '', limits: null, newCardsIgnoreReviewLimit: false, fsrs: false, applyAllParentLimits: false, fsrsReschedule: false, fsrsHealthCheck: false }; let tag; while ((tag = r.读取标签()) !== null) { switch (tag.字段号) { case 1: out.targetDeckId = r.读取64位整数(); break; case 2: out.configs.push(decodeDeckConfig(r.读取字节())); break; case 3: if (tag.线类型 === 线类型_长度分隔) out.removedConfigIds.push(...r.读取打包64位整数()); else out.removedConfigIds.push(r.读取64位整数()); break; case 4: out.mode = r.读取变长整数(); break; case 5: out.cardStateCustomizer = r.读取字符串(); break; case 6: out.limits = decodeLimits(r.读取字节()); break; case 7: out.newCardsIgnoreReviewLimit = r.读取布尔(); break; case 8: out.fsrs = r.读取布尔(); break; case 9: out.applyAllParentLimits = r.读取布尔(); break; case 10: out.fsrsReschedule = r.读取布尔(); break; case 11: out.fsrsHealthCheck = r.读取布尔(); break; default: r.跳过字段(tag.线类型); } } return out; }
