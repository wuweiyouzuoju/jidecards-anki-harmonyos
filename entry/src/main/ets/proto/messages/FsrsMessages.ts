// SPDX-License-Identifier: AGPL-3.0-or-later
// Wire contract: UPSTREAM.lock / anki.scheduler.proto (26.05).
import { 协议读取器 } from '../core/ProtoReader';
import { 协议写入器 } from '../core/ProtoWriter';

export interface ComputeFsrsParamsInput {
  search: string;
  currentParams: number[];
  ignoreRevlogsBeforeMs: number;
  numOfRelearningSteps: number;
  healthCheck: boolean;
}

export interface ComputeFsrsParamsOutput {
  params: number[];
  fsrsItems: number;
  healthCheckPassed: boolean | null;
}

export interface SimulateFsrsInput {
  params: number[];
  desiredRetention: number;
  deckSize: number;
  daysToSimulate: number;
  newLimit: number;
  reviewLimit: number;
  maxInterval: number;
  search: string;
  newCardsIgnoreReviewLimit: boolean;
  easyDaysPercentages: number[];
  reviewOrder: number;
  suspendAfterLapseCount: number | null;
  historicalRetention: number;
  learningStepCount: number;
  relearningStepCount: number;
}

export interface FsrsWorkloadPoint {
  retention: number;
  costSeconds: number;
  memorized: number;
  reviewCount: number;
}

export interface FsrsWorkloadOutput {
  points: FsrsWorkloadPoint[];
  reviewlessEndMemorized: number;
}

export interface EvaluateFsrsInput { params: number[]; search: string; ignoreRevlogsBeforeMs: number; }
export interface EvaluateFsrsOutput { logLoss: number; rmseBins: number; }
export interface FsrsMemoryOutput {
  state: FsrsMemoryState | null;
  desiredRetention: number;
  decay: number;
}
export interface FsrsMemoryState { stability: number; difficulty: number; }
export interface FsrsHistoryCount { included: number; total: number; }
export interface FsrsDailyOutput {
  accumulatedKnowledge: number[];
  dailyReviews: number[];
  dailyNew: number[];
  dailyTimeSeconds: number[];
}

export function encodeEvaluateFsrs(input: EvaluateFsrsInput): Uint8Array {
  const w = new 协议写入器();
  w.写入打包浮点(1, input.params); w.写入字符串(2, input.search);
  w.写入64位整数(3, input.ignoreRevlogsBeforeMs);
  return w.转为字节();
}

export function decodeEvaluateFsrs(bytes: Uint8Array): EvaluateFsrsOutput {
  const r = new 协议读取器(bytes);
  const out: EvaluateFsrsOutput = { logLoss: 0, rmseBins: 0 };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    if (tag.字段号 === 1) out.logLoss = r.读取浮点();
    else if (tag.字段号 === 2) out.rmseBins = r.读取浮点();
    else r.跳过字段(tag.线类型);
  }
  if (!Number.isFinite(out.logLoss) || !Number.isFinite(out.rmseBins) || out.logLoss < 0 || out.rmseBins < 0) {
    throw new Error('Invalid FSRS evaluation response');
  }
  return out;
}

export function decodeFsrsMemory(bytes: Uint8Array): FsrsMemoryOutput {
  const r = new 协议读取器(bytes);
  const out: FsrsMemoryOutput = { state: null, desiredRetention: 0, decay: 0 };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    if (tag.字段号 === 1) {
      const state = new 协议读取器(r.读取字节());
      const value: FsrsMemoryState = { stability: 0, difficulty: 0 };
      let field;
      while ((field = state.读取标签()) !== null) {
        if (field.字段号 === 1) value.stability = state.读取浮点();
        else if (field.字段号 === 2) value.difficulty = state.读取浮点();
        else state.跳过字段(field.线类型);
      }
      if (!Number.isFinite(value.stability) || !Number.isFinite(value.difficulty)) throw new Error('Invalid FSRS memory state');
      out.state = value;
    } else if (tag.字段号 === 2) out.desiredRetention = r.读取浮点();
    else if (tag.字段号 === 3) out.decay = r.读取浮点();
    else r.跳过字段(tag.线类型);
  }
  if (!Number.isFinite(out.desiredRetention) || !Number.isFinite(out.decay)) throw new Error('Invalid FSRS memory response');
  return out;
}

export function encodeFsrsHistoryCount(date: string, search: string): Uint8Array {
  const w = new 协议写入器(); w.写入字符串(1, date); w.写入字符串(2, search); return w.转为字节();
}
export function decodeFsrsHistoryCount(bytes: Uint8Array): FsrsHistoryCount {
  const r = new 协议读取器(bytes); const out: FsrsHistoryCount = { included: 0, total: 0 }; let tag;
  while ((tag = r.读取标签()) !== null) {
    if (tag.字段号 === 1) out.included = r.读取64位整数();
    else if (tag.字段号 === 2) out.total = r.读取64位整数();
    else r.跳过字段(tag.线类型);
  }
  if (!Number.isSafeInteger(out.included) || !Number.isSafeInteger(out.total) || out.included < 0 || out.total < out.included) {
    throw new Error('Invalid FSRS history count');
  }
  return out;
}

export function decodeFsrsDaily(bytes: Uint8Array, days: number): FsrsDailyOutput {
  const r = new 协议读取器(bytes);
  const out: FsrsDailyOutput = { accumulatedKnowledge: [], dailyReviews: [], dailyNew: [], dailyTimeSeconds: [] };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1: out.accumulatedKnowledge.push(...(tag.线类型 === 2 ? r.读取打包浮点() : [r.读取浮点()])); break;
      case 2: out.dailyReviews.push(...(tag.线类型 === 2 ? r.读取打包64位整数() : [r.读取变长整数()])); break;
      case 3: out.dailyNew.push(...(tag.线类型 === 2 ? r.读取打包64位整数() : [r.读取变长整数()])); break;
      case 4: out.dailyTimeSeconds.push(...(tag.线类型 === 2 ? r.读取打包浮点() : [r.读取浮点()])); break;
      default: r.跳过字段(tag.线类型);
    }
  }
  for (const values of [out.accumulatedKnowledge, out.dailyReviews, out.dailyNew, out.dailyTimeSeconds]) {
    if (values.length !== days || values.some((value: number): boolean => !Number.isFinite(value) || value < 0)) {
      throw new Error('Incomplete FSRS daily simulation response');
    }
  }
  return out;
}

export function encodeComputeFsrsParams(input: ComputeFsrsParamsInput): Uint8Array {
  const w = new 协议写入器();
  w.写入字符串(1, input.search);
  w.写入打包浮点(2, input.currentParams);
  if (input.ignoreRevlogsBeforeMs !== 0) w.写入64位整数(3, input.ignoreRevlogsBeforeMs);
  if (input.numOfRelearningSteps !== 0) w.写入变长整数(4, input.numOfRelearningSteps);
  if (input.healthCheck) w.写入布尔(5, true);
  return w.转为字节();
}

export function decodeComputeFsrsParams(bytes: Uint8Array): ComputeFsrsParamsOutput {
  const r = new 协议读取器(bytes);
  const out: ComputeFsrsParamsOutput = { params: [], fsrsItems: 0, healthCheckPassed: null };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1: out.params.push(...(tag.线类型 === 2 ? r.读取打包浮点() : [r.读取浮点()])); break;
      case 2: out.fsrsItems = r.读取变长整数(); break;
      case 3: out.healthCheckPassed = r.读取布尔(); break;
      default: r.跳过字段(tag.线类型);
    }
  }
  return out;
}

export function encodeSimulateFsrs(input: SimulateFsrsInput): Uint8Array {
  const w = new 协议写入器();
  w.写入打包浮点(1, input.params);
  if (input.desiredRetention !== 0) w.写入浮点(2, input.desiredRetention);
  if (input.deckSize !== 0) w.写入变长整数(3, input.deckSize);
  w.写入变长整数(4, input.daysToSimulate);
  if (input.newLimit !== 0) w.写入变长整数(5, input.newLimit);
  if (input.reviewLimit !== 0) w.写入变长整数(6, input.reviewLimit);
  w.写入变长整数(7, input.maxInterval);
  w.写入字符串(8, input.search);
  if (input.newCardsIgnoreReviewLimit) w.写入布尔(9, true);
  w.写入打包浮点(10, input.easyDaysPercentages);
  if (input.reviewOrder !== 0) w.写入变长整数(11, input.reviewOrder);
  // optional 0 and absent have different meanings.
  if (input.suspendAfterLapseCount !== null) w.写入变长整数(12, input.suspendAfterLapseCount);
  if (input.historicalRetention !== 0) w.写入浮点(13, input.historicalRetention);
  if (input.learningStepCount !== 0) w.写入变长整数(14, input.learningStepCount);
  if (input.relearningStepCount !== 0) w.写入变长整数(15, input.relearningStepCount);
  return w.转为字节();
}

function readMap(bytes: Uint8Array, integer: boolean, target: Map<number, number>): void {
  const r = new 协议读取器(bytes);
  let key = 0;
  let value = 0;
  let tag;
  while ((tag = r.读取标签()) !== null) {
    if (tag.字段号 === 1) key = r.读取变长整数();
    else if (tag.字段号 === 2) value = integer ? r.读取变长整数() : r.读取浮点();
    else r.跳过字段(tag.线类型);
  }
  target.set(key, value);
}

export function decodeFsrsWorkload(bytes: Uint8Array): FsrsWorkloadOutput {
  const r = new 协议读取器(bytes);
  const costs = new Map<number, number>();
  const memorized = new Map<number, number>();
  const counts = new Map<number, number>();
  const out: FsrsWorkloadOutput = { points: [], reviewlessEndMemorized: 0 };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1: readMap(r.读取字节(), false, costs); break;
      case 2: out.reviewlessEndMemorized = r.读取浮点(); break;
      case 3: readMap(r.读取字节(), false, memorized); break;
      case 4: readMap(r.读取字节(), true, counts); break;
      default: r.跳过字段(tag.线类型);
    }
  }
  // Core 26.05 returns all 30 points; incomplete data is an error, not zero work.
  for (let retention = 70; retention <= 99; retention++) {
    const cost = costs.get(retention);
    const memory = memorized.get(retention);
    const count = counts.get(retention);
    if (cost === undefined || memory === undefined || count === undefined ||
      !Number.isFinite(cost) || !Number.isFinite(memory) || cost < 0 || memory < 0) {
      throw new Error('Incomplete FSRS workload response');
    }
    out.points.push({ retention: retention, costSeconds: cost, memorized: memory, reviewCount: count });
  }
  return out;
}
