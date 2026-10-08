// SPDX-License-Identifier: AGPL-3.0-or-later
// 领域契约适配；协议事实由 generated/CoreMessages.ts 提供。
import { CardsFsrsMemoryState, DeckConfigGetIgnoredBeforeCountRequest, DeckConfigGetIgnoredBeforeCountResponse, SchedulerComputeFsrsParamsRequest, SchedulerComputeFsrsParamsResponse, SchedulerComputeMemoryStateResponse, SchedulerEvaluateParamsLegacyRequest, SchedulerEvaluateParamsResponse, SchedulerSimulateFsrsReviewRequest, SchedulerSimulateFsrsReviewResponse, SchedulerSimulateFsrsWorkloadResponse, SchedulerSimulateFsrsWorkloadResponseCostEntry, SchedulerSimulateFsrsWorkloadResponseMemorizedEntry, SchedulerSimulateFsrsWorkloadResponseReviewCountEntry } from '../generated/CoreMessages';
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
export interface EvaluateFsrsInput {
    params: number[];
    search: string;
    ignoreRevlogsBeforeMs: number;
}
export interface EvaluateFsrsOutput {
    logLoss: number;
    rmseBins: number;
}
export interface FsrsMemoryOutput {
    state: FsrsMemoryState | null;
    desiredRetention: number;
    decay: number;
}
export interface FsrsMemoryState {
    stability: number;
    difficulty: number;
}
export interface FsrsHistoryCount {
    included: number;
    total: number;
}
export interface FsrsDailyOutput {
    accumulatedKnowledge: number[];
    dailyReviews: number[];
    dailyNew: number[];
    dailyTimeSeconds: number[];
}
export function encodeEvaluateFsrs(input: EvaluateFsrsInput): Uint8Array {
    const w = new SchedulerEvaluateParamsLegacyRequest();
    w.setParams(input.params);
    w.setSearch(input.search);
    w.setIgnoreRevlogsBeforeMs(input.ignoreRevlogsBeforeMs);
    return w.转为字节();
}
export function decodeEvaluateFsrs(bytes: Uint8Array): EvaluateFsrsOutput {
    const m = new SchedulerEvaluateParamsResponse(bytes);
    const out: EvaluateFsrsOutput = { logLoss: m.getLogLoss(), rmseBins: m.getRmseBins() };
    if (!Number.isFinite(out.logLoss) || !Number.isFinite(out.rmseBins) || out.logLoss < 0 || out.rmseBins < 0) {
        throw new Error('Invalid FSRS evaluation response');
    }
    return out;
}
export function decodeFsrsMemory(bytes: Uint8Array): FsrsMemoryOutput {
    const m = new SchedulerComputeMemoryStateResponse(bytes);
    const out: FsrsMemoryOutput = { state: null, desiredRetention: m.getDesiredRetention(), decay: m.getDecay() };
    if (m.hasState()) {
        const s = new CardsFsrsMemoryState(m.getStateLast()!);
        const value: FsrsMemoryState = { stability: s.getStability(), difficulty: s.getDifficulty() };
        if (!Number.isFinite(value.stability) || !Number.isFinite(value.difficulty))
            throw new Error('Invalid FSRS memory state');
        out.state = value;
    }
    if (!Number.isFinite(out.desiredRetention) || !Number.isFinite(out.decay))
        throw new Error('Invalid FSRS memory response');
    return out;
}
export function encodeFsrsHistoryCount(date: string, search: string): Uint8Array {
    const w = new DeckConfigGetIgnoredBeforeCountRequest();
    w.setIgnoreRevlogsBeforeDate(date);
    w.setSearch(search);
    return w.转为字节();
}
export function decodeFsrsHistoryCount(bytes: Uint8Array): FsrsHistoryCount {
    const m = new DeckConfigGetIgnoredBeforeCountResponse(bytes);
    const out: FsrsHistoryCount = { included: m.getIncluded(), total: m.getTotal() };
    if (!Number.isSafeInteger(out.included) || !Number.isSafeInteger(out.total) || out.included < 0 || out.total < out.included) {
        throw new Error('Invalid FSRS history count');
    }
    return out;
}
export function decodeFsrsDaily(bytes: Uint8Array, days: number): FsrsDailyOutput {
    const r = new SchedulerSimulateFsrsReviewResponse(bytes);
    const out: FsrsDailyOutput = { accumulatedKnowledge: [], dailyReviews: [], dailyNew: [], dailyTimeSeconds: [] };
    if (r.hasAccumulatedKnowledgeAcquisition()) {
        out.accumulatedKnowledge.push(...r.getAccumulatedKnowledgeAcquisition());
    }
    if (r.hasDailyReviewCount()) {
        out.dailyReviews.push(...r.getDailyReviewCount());
    }
    if (r.hasDailyNewCount()) {
        out.dailyNew.push(...r.getDailyNewCount());
    }
    if (r.hasDailyTimeCost()) {
        out.dailyTimeSeconds.push(...r.getDailyTimeCost());
    }
    for (const values of [out.accumulatedKnowledge, out.dailyReviews, out.dailyNew, out.dailyTimeSeconds]) {
        if (values.length !== days || values.some((value: number): boolean => !Number.isFinite(value) || value < 0)) {
            throw new Error('Incomplete FSRS daily simulation response');
        }
    }
    return out;
}
export function encodeComputeFsrsParams(input: ComputeFsrsParamsInput): Uint8Array {
    const w = new SchedulerComputeFsrsParamsRequest();
    w.setSearch(input.search);
    w.setCurrentParams(input.currentParams);
    if (input.ignoreRevlogsBeforeMs !== 0)
        w.setIgnoreRevlogsBeforeMs(input.ignoreRevlogsBeforeMs);
    if (input.numOfRelearningSteps !== 0)
        w.setNumOfRelearningSteps(input.numOfRelearningSteps);
    if (input.healthCheck)
        w.setHealthCheck(true);
    return w.转为字节();
}
export function decodeComputeFsrsParams(bytes: Uint8Array): ComputeFsrsParamsOutput {
    const r = new SchedulerComputeFsrsParamsResponse(bytes);
    const out: ComputeFsrsParamsOutput = { params: [], fsrsItems: 0, healthCheckPassed: null };
    if (r.hasParams()) {
        out.params.push(...r.getParams());
    }
    if (r.hasFsrsItems()) {
        out.fsrsItems = r.getFsrsItems();
    }
    if (r.hasHealthCheckPassed()) {
        out.healthCheckPassed = r.getHealthCheckPassed();
    }
    return out;
}
export function encodeSimulateFsrs(input: SimulateFsrsInput): Uint8Array {
    const w = new SchedulerSimulateFsrsReviewRequest();
    w.setParams(input.params);
    if (input.desiredRetention !== 0)
        w.setDesiredRetention(input.desiredRetention);
    if (input.deckSize !== 0)
        w.setDeckSize(input.deckSize);
    w.setDaysToSimulate(input.daysToSimulate);
    if (input.newLimit !== 0)
        w.setNewLimit(input.newLimit);
    if (input.reviewLimit !== 0)
        w.setReviewLimit(input.reviewLimit);
    w.setMaxInterval(input.maxInterval);
    w.setSearch(input.search);
    if (input.newCardsIgnoreReviewLimit)
        w.setNewCardsIgnoreReviewLimit(true);
    w.setEasyDaysPercentages(input.easyDaysPercentages);
    if (input.reviewOrder !== 0)
        w.setReviewOrder(input.reviewOrder);
    if (input.suspendAfterLapseCount !== null)
        w.setSuspendAfterLapseCount(input.suspendAfterLapseCount);
    if (input.historicalRetention !== 0)
        w.setHistoricalRetention(input.historicalRetention);
    if (input.learningStepCount !== 0)
        w.setLearningStepCount(input.learningStepCount);
    if (input.relearningStepCount !== 0)
        w.setRelearningStepCount(input.relearningStepCount);
    return w.转为字节();
}
export function decodeFsrsWorkload(bytes: Uint8Array): FsrsWorkloadOutput {
    const m = new SchedulerSimulateFsrsWorkloadResponse(bytes);
    const costs = new Map<number, number>();
    const memorized = new Map<number, number>();
    const counts = new Map<number, number>();
    const out: FsrsWorkloadOutput = { points: [], reviewlessEndMemorized: m.getReviewlessEndMemorized() };
    for (const raw of m.getCost()) {
        const e = new SchedulerSimulateFsrsWorkloadResponseCostEntry(raw);
        costs.set(e.getKey(), e.getValue());
    }
    for (const raw of m.getMemorized()) {
        const e = new SchedulerSimulateFsrsWorkloadResponseMemorizedEntry(raw);
        memorized.set(e.getKey(), e.getValue());
    }
    for (const raw of m.getReviewCount()) {
        const e = new SchedulerSimulateFsrsWorkloadResponseReviewCountEntry(raw);
        counts.set(e.getKey(), e.getValue());
    }
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
