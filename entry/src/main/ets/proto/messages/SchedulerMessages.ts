// SPDX-License-Identifier: AGPL-3.0-or-later
// 领域契约适配；协议事实由 generated/CoreMessages.ts 提供。
import { SchedulerCardAnswerRating, SchedulerQueuedCardsQueue, SchedulerBuryOrSuspendCardsRequestMode, SchedulerUnburyDeckRequestMode, SchedulerCustomStudyRequestCramCramKind } from '../generated/CoreMessages';
import { CardsCard, CardsCardId, CardsCardIds, GenericStringList, SchedulerBuryOrSuspendCardsRequest, SchedulerCardAnswer, SchedulerCongratsInfoResponse, SchedulerCountsForDeckTodayResponse, SchedulerCustomStudyDefaultsRequest, SchedulerCustomStudyDefaultsResponse, SchedulerCustomStudyDefaultsResponseTag, SchedulerCustomStudyRequest, SchedulerCustomStudyRequestCram, SchedulerGetQueuedCardsRequest, SchedulerQueuedCards, SchedulerQueuedCardsQueuedCard, SchedulerRepositionDefaultsResponse, SchedulerSchedTimingTodayResponse, SchedulerScheduleCardsAsNewDefaultsResponse, SchedulerScheduleCardsAsNewRequest, SchedulerSchedulingStates, SchedulerSetDueDateRequest, SchedulerSortCardsRequest, SchedulerUnburyDeckRequest } from '../generated/CoreMessages';
export interface ScheduleCardsAsNewOptions {
    restorePosition: boolean;
    resetCounts: boolean;
}
export function encodeScheduleCardsAsNew(ids: number[], options: ScheduleCardsAsNewOptions): Uint8Array {
    const w = new SchedulerScheduleCardsAsNewRequest();
    for (const id of ids) {
        if (!Number.isSafeInteger(id) || id <= 0)
            throw new Error('Invalid card ID');
        w.setCardIds([id], false);
    }
    w.setLog(true);
    w.setRestorePosition(options.restorePosition);
    w.setResetCounts(options.resetCounts);
    w.setContext(0);
    return w.toBytes();
}
export function decodeScheduleCardsAsNewDefaults(bytes: Uint8Array): ScheduleCardsAsNewOptions {
    const m = new SchedulerScheduleCardsAsNewDefaultsResponse(bytes);
    const out: ScheduleCardsAsNewOptions = { restorePosition: m.getRestorePosition(), resetCounts: m.getResetCounts() };
    return out;
}
export type RawSchedulingState = Uint8Array;
export interface SchedulingStatesRaw {
    raw?: Uint8Array;
    current: RawSchedulingState;
    again: RawSchedulingState;
    hard: RawSchedulingState;
    good: RawSchedulingState;
    easy: RawSchedulingState;
}
export const RATING_AGAIN = SchedulerCardAnswerRating.AGAIN;
export const RATING_HARD = SchedulerCardAnswerRating.HARD;
export const RATING_GOOD = SchedulerCardAnswerRating.GOOD;
export const RATING_EASY = SchedulerCardAnswerRating.EASY;
export const QUEUE_NEW = SchedulerQueuedCardsQueue.NEW;
export const QUEUE_LEARNING = SchedulerQueuedCardsQueue.LEARNING;
export const QUEUE_REVIEW = SchedulerQueuedCardsQueue.REVIEW;
export function decodeSchedulingStates(bytes: Uint8Array): SchedulingStatesRaw {
    const r = new SchedulerSchedulingStates(bytes);
    const states: SchedulingStatesRaw = {
        current: new Uint8Array(0),
        again: new Uint8Array(0),
        hard: new Uint8Array(0),
        good: new Uint8Array(0),
        easy: new Uint8Array(0)
    };
    if (r.hasCurrent()) {
        states.current = r.getCurrentLast()!;
    }
    if (r.hasAgain()) {
        states.again = r.getAgainLast()!;
    }
    if (r.hasHard()) {
        states.hard = r.getHardLast()!;
    }
    if (r.hasGood()) {
        states.good = r.getGoodLast()!;
    }
    if (r.hasEasy()) {
        states.easy = r.getEasyLast()!;
    }
    states.raw = bytes.slice();
    return states;
}
export interface StudyCard {
    cardId: number;
    noteId: number;
    deckId: number;
    templateIdx: number;
    queue: number;
    states: SchedulingStatesRaw;
    schedulingContext?: Uint8Array;
    customData?: string;
}
export interface QueuedCardsView {
    cards: StudyCard[];
    newCount: number;
    learningCount: number;
    reviewCount: number;
}
export function encodeGetQueuedCardsRequest(fetchLimit: number, intradayLearningOnly: boolean): Uint8Array {
    const w = new SchedulerGetQueuedCardsRequest();
    if (fetchLimit !== 0) {
        w.setFetchLimit(fetchLimit);
    }
    if (intradayLearningOnly) {
        w.setIntradayLearningOnly(true);
    }
    return w.转为字节();
}
interface CardSummary {
    cardId: number;
    noteId: number;
    deckId: number;
    templateIdx: number;
    customData: string;
}
function decodeCardSummary(bytes: Uint8Array): CardSummary {
    const r = new CardsCard(bytes);
    const out: CardSummary = { cardId: 0, noteId: 0, deckId: 0, templateIdx: 0, customData: '' };
    if (r.hasId()) {
        out.cardId = r.getId();
    }
    if (r.hasNoteId()) {
        out.noteId = r.getNoteId();
    }
    if (r.hasDeckId()) {
        out.deckId = r.getDeckId();
    }
    if (r.hasTemplateIdx()) {
        out.templateIdx = r.getTemplateIdx();
    }
    if (r.hasCustomData()) {
        out.customData = r.getCustomData();
    }
    return out;
}
function decodeQueuedCard(bytes: Uint8Array): StudyCard {
    const r = new SchedulerQueuedCardsQueuedCard(bytes);
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
    if (r.hasCard()) {
        const summary = decodeCardSummary(r.getCardLast()!);
        card.cardId = summary.cardId;
        card.noteId = summary.noteId;
        card.deckId = summary.deckId;
        card.templateIdx = summary.templateIdx;
        card.customData = summary.customData;
    }
    if (r.hasQueue()) {
        card.queue = r.getQueue();
    }
    if (r.hasStates()) {
        card.states = decodeSchedulingStates(r.getStatesLast()!);
    }
    if (r.hasContext()) {
        card.schedulingContext = r.getContextLast()!;
    }
    return card;
}
export function decodeQueuedCards(bytes: Uint8Array): QueuedCardsView {
    const r = new SchedulerQueuedCards(bytes);
    const view: QueuedCardsView = { cards: [], newCount: 0, learningCount: 0, reviewCount: 0 };
    if (r.hasCards()) {
        for (const item of r.getCards())
            view.cards.push(decodeQueuedCard(item));
    }
    if (r.hasNewCount()) {
        view.newCount = r.getNewCount();
    }
    if (r.hasLearningCount()) {
        view.learningCount = r.getLearningCount();
    }
    if (r.hasReviewCount()) {
        view.reviewCount = r.getReviewCount();
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
    const w = new SchedulerCardAnswer();
    if (answer.cardId !== 0) {
        w.setCardId(answer.cardId);
    }
    if (answer.currentState.length > 0) {
        w.setCurrentState(answer.currentState);
    }
    if (answer.newState.length > 0) {
        w.setNewState(answer.newState);
    }
    if (answer.rating !== 0) {
        w.setRating(answer.rating);
    }
    if (answer.answeredAtMillis !== 0) {
        w.setAnsweredAtMillis(answer.answeredAtMillis);
    }
    if (answer.millisecondsTaken !== 0) {
        w.setMillisecondsTaken(answer.millisecondsTaken);
    }
    return w.转为字节();
}
export function encodeCardId(cardId: number): Uint8Array {
    const w = new CardsCardId();
    if (cardId !== 0) {
        w.setCid(cardId);
    }
    return w.转为字节();
}
export function encodeCardIds(cardIds: number[]): Uint8Array {
    const w = new CardsCardIds();
    w.setCids(cardIds);
    return w.转为字节();
}
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
    const r = new SchedulerCongratsInfoResponse(bytes);
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
    if (r.hasLearnRemaining()) {
        out.learnRemaining = r.getLearnRemaining();
    }
    if (r.hasSecsUntilNextLearn()) {
        out.secsUntilNextLearn = r.getSecsUntilNextLearn();
    }
    if (r.hasReviewRemaining()) {
        out.reviewRemaining = r.getReviewRemaining();
    }
    if (r.hasNewRemaining()) {
        out.newRemaining = r.getNewRemaining();
    }
    if (r.hasHaveSchedBuried()) {
        out.haveSchedBuried = r.getHaveSchedBuried();
    }
    if (r.hasHaveUserBuried()) {
        out.haveUserBuried = r.getHaveUserBuried();
    }
    if (r.hasIsFilteredDeck()) {
        out.isFilteredDeck = r.getIsFilteredDeck();
    }
    if (r.hasBridgeCommandsSupported()) {
        out.bridgeCommandsSupported = r.getBridgeCommandsSupported();
    }
    if (r.hasDeckDescription()) {
        out.deckDescription = r.getDeckDescription();
    }
    return out;
}
export const BURY_SUSPEND_MODE_SUSPEND = SchedulerBuryOrSuspendCardsRequestMode.SUSPEND;
export const BURY_SUSPEND_MODE_BURY_SCHED = SchedulerBuryOrSuspendCardsRequestMode.BURY_SCHED;
export const BURY_SUSPEND_MODE_BURY_USER = SchedulerBuryOrSuspendCardsRequestMode.BURY_USER;
export function encodeBuryOrSuspendCardsRequest(cardIds: number[], noteIds: number[], mode: number): Uint8Array {
    const w = new SchedulerBuryOrSuspendCardsRequest();
    w.setCardIds(cardIds);
    w.setNoteIds(noteIds);
    if (mode !== 0) {
        w.setMode(mode);
    }
    return w.转为字节();
}
export const UNBURY_MODE_ALL = SchedulerUnburyDeckRequestMode.ALL;
export const UNBURY_MODE_SCHED_ONLY = SchedulerUnburyDeckRequestMode.SCHED_ONLY;
export const UNBURY_MODE_USER_ONLY = SchedulerUnburyDeckRequestMode.USER_ONLY;
export function encodeUnburyDeckRequest(deckId: number, mode: number): Uint8Array {
    const w = new SchedulerUnburyDeckRequest();
    if (deckId !== 0) {
        w.setDeckId(deckId);
    }
    if (mode !== 0) {
        w.setMode(mode);
    }
    return w.转为字节();
}
export interface SchedTimingToday {
    daysElapsed: number;
    nextDayAt: number;
}
export interface DeckTodayCounts {
    newCount: number;
    reviewCount: number;
}
export function decodeCountsForDeckToday(bytes: Uint8Array): DeckTodayCounts {
    const m = new SchedulerCountsForDeckTodayResponse(bytes);
    const out: DeckTodayCounts = { newCount: m.getNew(), reviewCount: m.getReview() };
    return out;
}
export function decodeSchedTimingToday(bytes: Uint8Array): SchedTimingToday {
    const m = new SchedulerSchedTimingTodayResponse(bytes);
    const out: SchedTimingToday = { daysElapsed: m.getDaysElapsed(), nextDayAt: m.getNextDayAt() };
    return out;
}
export function decodeStringList(bytes: Uint8Array): string[] {
    return new GenericStringList(bytes).getVals();
}
export function encodeSchedulingStates(states: SchedulingStatesRaw): Uint8Array {
    if (states.raw !== undefined) {
        const original = new SchedulerSchedulingStates(states.raw);
        const w = new SchedulerSchedulingStates(states.raw);
        if (!sameState(states.current, original.getCurrentLast())) w.replaceCurrent(states.current.length === 0 ? null : states.current);
        if (!sameState(states.again, original.getAgainLast())) w.replaceAgain(states.again.length === 0 ? null : states.again);
        if (!sameState(states.hard, original.getHardLast())) w.replaceHard(states.hard.length === 0 ? null : states.hard);
        if (!sameState(states.good, original.getGoodLast())) w.replaceGood(states.good.length === 0 ? null : states.good);
        if (!sameState(states.easy, original.getEasyLast())) w.replaceEasy(states.easy.length === 0 ? null : states.easy);
        return w.toBytes();
    }
    const w = new SchedulerSchedulingStates();
    if (states.current.length > 0) {
        w.setCurrent(states.current);
    }
    if (states.again.length > 0) {
        w.setAgain(states.again);
    }
    if (states.hard.length > 0) {
        w.setHard(states.hard);
    }
    if (states.good.length > 0) {
        w.setGood(states.good);
    }
    if (states.easy.length > 0) {
        w.setEasy(states.easy);
    }
    return w.转为字节();
}
function sameState(value: Uint8Array, original: Uint8Array | null): boolean {
    const bytes = original ?? new Uint8Array(0);
    return value.length === bytes.length && value.every((item: number, index: number): boolean => item === bytes[index]);
}
export const 自定义学习预设 = {
    新卡上限增量: SchedulerCustomStudyRequest.FIELD_newLimitDelta,
    复习上限增量: SchedulerCustomStudyRequest.FIELD_reviewLimitDelta,
    复习遗忘天数: SchedulerCustomStudyRequest.FIELD_forgotDays,
    提前复习天数: SchedulerCustomStudyRequest.FIELD_reviewAheadDays,
    预览新卡天数: SchedulerCustomStudyRequest.FIELD_previewDays,
    按状态或标签: SchedulerCustomStudyRequest.FIELD_cram
} as const;
export enum CustomStudyCardKind {
    Due = SchedulerCustomStudyRequestCramCramKind.CRAM_KIND_DUE,
    New = SchedulerCustomStudyRequestCramCramKind.CRAM_KIND_NEW,
    Review = SchedulerCustomStudyRequestCramCramKind.CRAM_KIND_REVIEW,
    All = SchedulerCustomStudyRequestCramCramKind.CRAM_KIND_ALL
}
export interface CustomStudyCram {
    kind: CustomStudyCardKind;
    cardLimit: number;
    tagsToInclude: string[];
    tagsToExclude: string[];
}
export function encodeCustomStudyCramRequest(deckId: number, cram: CustomStudyCram): Uint8Array {
    const w = new SchedulerCustomStudyRequest();
    w.setDeckId(deckId);
    const v = new SchedulerCustomStudyRequestCram();
    v.setKind(cram.kind);
    v.setCardLimit(cram.cardLimit);
    v.setTagsToInclude(cram.tagsToInclude);
    v.setTagsToExclude(cram.tagsToExclude);
    w.setCram(v.toBytes());
    return w.toBytes();
}
export function encodeCustomStudyRequest(deckId: number, 预设字段号: number, 值: number): Uint8Array {
    const w = new SchedulerCustomStudyRequest();
    if (deckId !== 0) {
        w.setDeckId(deckId);
    }
    if (预设字段号 === 自定义学习预设.新卡上限增量) {
        w.setNewLimitDelta(值);
    }
    else if (预设字段号 === 自定义学习预设.复习上限增量) {
        w.setReviewLimitDelta(值);
    }
    else if (预设字段号 === 自定义学习预设.复习遗忘天数) {
        if (值 !== 0) {
            w.setForgotDays(值);
        }
    }
    else if (预设字段号 === 自定义学习预设.提前复习天数) {
        if (值 !== 0) {
            w.setReviewAheadDays(值);
        }
    }
    else if (预设字段号 === 自定义学习预设.预览新卡天数) {
        if (值 !== 0) {
            w.setPreviewDays(值);
        }
    }
    return w.转为字节();
}
export function encodeCustomStudyDefaultsRequest(deckId: number): Uint8Array {
    const w = new SchedulerCustomStudyDefaultsRequest();
    if (deckId !== 0) {
        w.setDeckId(deckId);
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
    const r = new SchedulerCustomStudyDefaultsResponseTag(bytes);
    const out: 自定义学习标签 = { name: '', include: false, exclude: false };
    if (r.hasName()) {
        out.name = r.getName();
    }
    if (r.hasInclude()) {
        out.include = r.getInclude();
    }
    if (r.hasExclude()) {
        out.exclude = r.getExclude();
    }
    return out;
}
export function decode自定义学习默认值(bytes: Uint8Array): 自定义学习默认值 {
    const r = new SchedulerCustomStudyDefaultsResponse(bytes);
    const out: 自定义学习默认值 = {
        tags: [],
        extendNew: 0,
        extendReview: 0,
        availableNew: 0,
        availableReview: 0,
        availableNewInChildren: 0,
        availableReviewInChildren: 0
    };
    if (r.hasTags()) {
        for (const raw of r.getTags()) out.tags.push(decode自定义学习标签(raw));
    }
    if (r.hasExtendNew()) {
        out.extendNew = r.getExtendNew();
    }
    if (r.hasExtendReview()) {
        out.extendReview = r.getExtendReview();
    }
    if (r.hasAvailableNew()) {
        out.availableNew = r.getAvailableNew();
    }
    if (r.hasAvailableReview()) {
        out.availableReview = r.getAvailableReview();
    }
    if (r.hasAvailableNewInChildren()) {
        out.availableNewInChildren = r.getAvailableNewInChildren();
    }
    if (r.hasAvailableReviewInChildren()) {
        out.availableReviewInChildren = r.getAvailableReviewInChildren();
    }
    return out;
}
export function encodeSetDueDateRequest(cardIds: number[], days: string): Uint8Array {
    const w = new SchedulerSetDueDateRequest();
    if (cardIds.length > 0) {
        w.setCardIds(cardIds);
    }
    if (days !== '') {
        w.setDays(days);
    }
    return w.转为字节();
}
export function encodeSortCardsRequest(cardIds: number[], startingFrom: number, stepSize: number, randomize: boolean, shiftExisting: boolean): Uint8Array {
    const w = new SchedulerSortCardsRequest();
    if (cardIds.length > 0) {
        w.setCardIds(cardIds);
    }
    if (startingFrom !== 0) {
        w.setStartingFrom(startingFrom);
    }
    if (stepSize !== 0) {
        w.setStepSize(stepSize);
    }
    if (randomize) {
        w.setRandomize(true);
    }
    if (shiftExisting) {
        w.setShiftExisting(true);
    }
    return w.转为字节();
}
export interface 重新定位默认值 {
    random: boolean;
    shift: boolean;
}
export function decode重新定位默认值(bytes: Uint8Array): 重新定位默认值 {
    const m = new SchedulerRepositionDefaultsResponse(bytes);
    const out: 重新定位默认值 = { random: m.getRandom(), shift: m.getShift() };
    return out;
}
