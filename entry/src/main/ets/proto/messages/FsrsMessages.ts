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
