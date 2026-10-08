// SPDX-License-Identifier: AGPL-3.0-or-later
// 领域契约适配；协议事实由 generated/CoreMessages.ts 提供。
import { StatsGraphPreferencesWeekday, StatsRevlogEntryReviewKind } from '../generated/CoreMessages';
import { CardsCardId, StatsCardStatsResponse, StatsCardStatsResponseStatsRevlogEntry, StatsGraphPreferences, StatsGraphsRequest, StatsGraphsResponse, StatsGraphsResponseAdded, StatsGraphsResponseAddedAddedEntry, StatsGraphsResponseButtons, StatsGraphsResponseButtonsButtonCounts, StatsGraphsResponseCardCounts, StatsGraphsResponseCardCountsCounts, StatsGraphsResponseEases, StatsGraphsResponseEasesEasesEntry, StatsGraphsResponseFutureDue, StatsGraphsResponseFutureDueFutureDueEntry, StatsGraphsResponseHours, StatsGraphsResponseHoursHour, StatsGraphsResponseIntervals, StatsGraphsResponseIntervalsIntervalsEntry, StatsGraphsResponseRetrievability, StatsGraphsResponseRetrievabilityRetrievabilityEntry, StatsGraphsResponseReviewCountsAndTimes, StatsGraphsResponseReviewCountsAndTimesCountEntry, StatsGraphsResponseReviewCountsAndTimesReviews, StatsGraphsResponseToday, StatsGraphsResponseTrueRetentionStats, StatsGraphsResponseTrueRetentionStatsTrueRetention } from '../generated/CoreMessages';
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
    buckets: Map<number, number> | null;
    average: number;
    sumByCard: number;
    sumByNote: number;
}
export interface ReviewKindCounts {
    learn: number;
    relearn: number;
    young: number;
    mature: number;
    filtered: number;
}
export interface ButtonCounts {
    learning: number[];
    young: number[];
    mature: number[];
}
export interface Buttons {
    oneMonth: ButtonCounts | null;
    threeMonths: ButtonCounts | null;
    oneYear: ButtonCounts | null;
    allTime: ButtonCounts | null;
}
export interface CardCountsBreakdown {
    newCards: number;
    learn: number;
    relearn: number;
    young: number;
    mature: number;
    suspended: number;
    buried: number;
}
export interface CardCounts {
    includingInactive: CardCountsBreakdown | null;
    excludingInactive: CardCountsBreakdown | null;
}
export interface HourBucket {
    total: number;
    correct: number;
}
export interface Hours {
    oneMonth: HourBucket[];
    threeMonths: HourBucket[];
    oneYear: HourBucket[];
    allTime: HourBucket[];
}
export interface Eases {
    eases: Map<number, number> | null;
    average: number;
}
export interface Intervals {
    intervals: Map<number, number> | null;
}
export interface FutureDue {
    futureDue: Map<number, number> | null;
    haveBacklog: boolean;
    dailyLoad: number;
}
export interface Added {
    added: Map<number, number> | null;
}
export interface TrueRetention {
    youngPassed: number;
    youngFailed: number;
    maturePassed: number;
    matureFailed: number;
}
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
    reviewCountsByDaysAgo: Map<number, ReviewKindCounts> | null;
    reviewTimesByDaysAgo: Map<number, ReviewKindCounts> | null;
    fsrs: boolean;
    buttons: Buttons | null;
    cardCounts: CardCounts | null;
    hours: Hours | null;
    eases: Eases | null;
    intervals: Intervals | null;
    futureDue: FutureDue | null;
    added: Added | null;
    rolloverHour: number;
    difficulty: Eases | null;
    stability: Intervals | null;
    trueRetention: TrueRetentionStats | null;
}
export function encodeGraphsRequest(days: number, search: string = ''): Uint8Array {
    const w = new StatsGraphsRequest();
    if (search !== '') {
        w.setSearch(search);
    }
    if (days > 0) {
        w.setDays(days);
    }
    return w.转为字节();
}
export function encodeCardIdRequest(cardId: number): Uint8Array {
    const w = new CardsCardId();
    if (cardId !== 0) {
        w.setCid(cardId);
    }
    return w.转为字节();
}
function decodeToday(bytes: Uint8Array): TodayCounts {
    const r = new StatsGraphsResponseToday(bytes);
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
    if (r.hasAnswerCount()) {
        out.answerCount = r.getAnswerCount();
    }
    if (r.hasAnswerMillis()) {
        out.answerMillis = r.getAnswerMillis();
    }
    if (r.hasCorrectCount()) {
        out.correctCount = r.getCorrectCount();
    }
    if (r.hasMatureCorrect()) {
        out.matureCorrect = r.getMatureCorrect();
    }
    if (r.hasMatureCount()) {
        out.matureCount = r.getMatureCount();
    }
    if (r.hasLearnCount()) {
        out.learnCount = r.getLearnCount();
    }
    if (r.hasReviewCount()) {
        out.reviewCount = r.getReviewCount();
    }
    if (r.hasRelearnCount()) {
        out.relearnCount = r.getRelearnCount();
    }
    if (r.hasEarlyReviewCount()) {
        out.earlyReviewCount = r.getEarlyReviewCount();
    }
    return out;
}
function decodeRetrievability(bytes: Uint8Array): RetrievabilitySummary {
    const m = new StatsGraphsResponseRetrievability(bytes);
    const out: RetrievabilitySummary = { buckets: null, average: m.getAverage(), sumByCard: m.getSumByCard(), sumByNote: m.getSumByNote() };
    if (m.hasRetrievability()) {
        const entries = new Map<number, number>();
        for (const raw of m.getRetrievability()) {
            const v = new StatsGraphsResponseRetrievabilityRetrievabilityEntry(raw);
            entries.set(v.getKey(), v.getValue());
        }
        out.buckets = entries;
    }
    return out;
}
function decodeReviews(bytes: Uint8Array): ReviewKindCounts {
    const r = new StatsGraphsResponseReviewCountsAndTimesReviews(bytes);
    const out: ReviewKindCounts = { learn: 0, relearn: 0, young: 0, mature: 0, filtered: 0 };
    if (r.hasLearn()) {
        out.learn = r.getLearn();
    }
    if (r.hasRelearn()) {
        out.relearn = r.getRelearn();
    }
    if (r.hasYoung()) {
        out.young = r.getYoung();
    }
    if (r.hasMature()) {
        out.mature = r.getMature();
    }
    if (r.hasFiltered()) {
        out.filtered = r.getFiltered();
    }
    return out;
}
function decodeReviewCountEntry(bytes: Uint8Array, out: Map<number, ReviewKindCounts>): void {
    const m = new StatsGraphsResponseReviewCountsAndTimesCountEntry(bytes);
    if (m.hasValue())
        out.set(m.getKey(), decodeReviews(m.getValueLast()!));
}
interface ReviewCountsAndTimes {
    count: Map<number, ReviewKindCounts>;
    time: Map<number, ReviewKindCounts>;
}
function decodeReviewCountsAndTimes(bytes: Uint8Array): ReviewCountsAndTimes {
    const m = new StatsGraphsResponseReviewCountsAndTimes(bytes);
    const out: ReviewCountsAndTimes = { count: new Map<number, ReviewKindCounts>(), time: new Map<number, ReviewKindCounts>() };
    for (const raw of m.getCount())
        decodeReviewCountEntry(raw, out.count);
    for (const raw of m.getTime())
        decodeReviewCountEntry(raw, out.time);
    return out;
}
function decodeButtonCounts(bytes: Uint8Array): ButtonCounts {
    const r = new StatsGraphsResponseButtonsButtonCounts(bytes);
    const out: ButtonCounts = { learning: [], young: [], mature: [] };
    if (r.hasLearning()) {
        out.learning.push(...r.getLearning());
    }
    if (r.hasYoung()) {
        out.young.push(...r.getYoung());
    }
    if (r.hasMature()) {
        out.mature.push(...r.getMature());
    }
    return out;
}
function decodeButtons(bytes: Uint8Array): Buttons {
    const r = new StatsGraphsResponseButtons(bytes);
    const out: Buttons = {
        oneMonth: null,
        threeMonths: null,
        oneYear: null,
        allTime: null
    };
    if (r.hasOneMonth()) {
        out.oneMonth = decodeButtonCounts(r.getOneMonthLast()!);
    }
    if (r.hasThreeMonths()) {
        out.threeMonths = decodeButtonCounts(r.getThreeMonthsLast()!);
    }
    if (r.hasOneYear()) {
        out.oneYear = decodeButtonCounts(r.getOneYearLast()!);
    }
    if (r.hasAllTime()) {
        out.allTime = decodeButtonCounts(r.getAllTimeLast()!);
    }
    return out;
}
function decodeCardCountsBreakdown(bytes: Uint8Array): CardCountsBreakdown {
    const r = new StatsGraphsResponseCardCountsCounts(bytes);
    const out: CardCountsBreakdown = {
        newCards: 0,
        learn: 0,
        relearn: 0,
        young: 0,
        mature: 0,
        suspended: 0,
        buried: 0
    };
    if (r.hasNewCards()) {
        out.newCards = r.getNewCards();
    }
    if (r.hasLearn()) {
        out.learn = r.getLearn();
    }
    if (r.hasRelearn()) {
        out.relearn = r.getRelearn();
    }
    if (r.hasYoung()) {
        out.young = r.getYoung();
    }
    if (r.hasMature()) {
        out.mature = r.getMature();
    }
    if (r.hasSuspended()) {
        out.suspended = r.getSuspended();
    }
    if (r.hasBuried()) {
        out.buried = r.getBuried();
    }
    return out;
}
function decodeCardCounts(bytes: Uint8Array): CardCounts {
    const r = new StatsGraphsResponseCardCounts(bytes);
    const out: CardCounts = {
        includingInactive: null,
        excludingInactive: null
    };
    if (r.hasIncludingInactive()) {
        out.includingInactive = decodeCardCountsBreakdown(r.getIncludingInactiveLast()!);
    }
    if (r.hasExcludingInactive()) {
        out.excludingInactive = decodeCardCountsBreakdown(r.getExcludingInactiveLast()!);
    }
    return out;
}
function decodeHourBucket(bytes: Uint8Array): HourBucket {
    const r = new StatsGraphsResponseHoursHour(bytes);
    const out: HourBucket = { total: 0, correct: 0 };
    if (r.hasTotal()) {
        out.total = r.getTotal();
    }
    if (r.hasCorrect()) {
        out.correct = r.getCorrect();
    }
    return out;
}
function decodeHours(bytes: Uint8Array): Hours {
    const r = new StatsGraphsResponseHours(bytes);
    const out: Hours = {
        oneMonth: [],
        threeMonths: [],
        oneYear: [],
        allTime: []
    };
    if (r.hasOneMonth()) {
        for (const item of r.getOneMonth())
            out.oneMonth.push(decodeHourBucket(item));
    }
    if (r.hasThreeMonths()) {
        for (const item of r.getThreeMonths())
            out.threeMonths.push(decodeHourBucket(item));
    }
    if (r.hasOneYear()) {
        for (const item of r.getOneYear())
            out.oneYear.push(decodeHourBucket(item));
    }
    if (r.hasAllTime()) {
        for (const item of r.getAllTime())
            out.allTime.push(decodeHourBucket(item));
    }
    return out;
}
function decodeEases(bytes: Uint8Array): Eases {
    const m = new StatsGraphsResponseEases(bytes);
    const out: Eases = { eases: null, average: m.getAverage() };
    if (m.hasEases()) {
        const entries = new Map<number, number>();
        for (const raw of m.getEases()) {
            const v = new StatsGraphsResponseEasesEasesEntry(raw);
            entries.set(v.getKey(), v.getValue());
        }
        out.eases = entries;
    }
    return out;
}
function decodeIntervals(bytes: Uint8Array): Intervals {
    const m = new StatsGraphsResponseIntervals(bytes);
    const out: Intervals = { intervals: null };
    if (m.hasIntervals()) {
        const entries = new Map<number, number>();
        for (const raw of m.getIntervals()) {
            const v = new StatsGraphsResponseIntervalsIntervalsEntry(raw);
            entries.set(v.getKey(), v.getValue());
        }
        out.intervals = entries;
    }
    return out;
}
function decodeFutureDue(bytes: Uint8Array): FutureDue {
    const m = new StatsGraphsResponseFutureDue(bytes);
    const out: FutureDue = { futureDue: null, haveBacklog: m.getHaveBacklog(), dailyLoad: m.getDailyLoad() };
    if (m.hasFutureDue()) {
        const entries = new Map<number, number>();
        for (const raw of m.getFutureDue()) {
            const v = new StatsGraphsResponseFutureDueFutureDueEntry(raw);
            entries.set(v.getKey(), v.getValue());
        }
        out.futureDue = entries;
    }
    return out;
}
function decodeAdded(bytes: Uint8Array): Added {
    const m = new StatsGraphsResponseAdded(bytes);
    const out: Added = { added: null };
    if (m.hasAdded()) {
        const entries = new Map<number, number>();
        for (const raw of m.getAdded()) {
            const v = new StatsGraphsResponseAddedAddedEntry(raw);
            entries.set(v.getKey(), v.getValue());
        }
        out.added = entries;
    }
    return out;
}
function decodeTrueRetention(bytes: Uint8Array): TrueRetention {
    const r = new StatsGraphsResponseTrueRetentionStatsTrueRetention(bytes);
    const out: TrueRetention = {
        youngPassed: 0,
        youngFailed: 0,
        maturePassed: 0,
        matureFailed: 0
    };
    if (r.hasYoungPassed()) {
        out.youngPassed = r.getYoungPassed();
    }
    if (r.hasYoungFailed()) {
        out.youngFailed = r.getYoungFailed();
    }
    if (r.hasMaturePassed()) {
        out.maturePassed = r.getMaturePassed();
    }
    if (r.hasMatureFailed()) {
        out.matureFailed = r.getMatureFailed();
    }
    return out;
}
function decodeTrueRetentionStats(bytes: Uint8Array): TrueRetentionStats {
    const r = new StatsGraphsResponseTrueRetentionStats(bytes);
    const out: TrueRetentionStats = {
        today: null,
        yesterday: null,
        week: null,
        month: null,
        year: null,
        allTime: null
    };
    if (r.hasToday()) {
        out.today = decodeTrueRetention(r.getTodayLast()!);
    }
    if (r.hasYesterday()) {
        out.yesterday = decodeTrueRetention(r.getYesterdayLast()!);
    }
    if (r.hasWeek()) {
        out.week = decodeTrueRetention(r.getWeekLast()!);
    }
    if (r.hasMonth()) {
        out.month = decodeTrueRetention(r.getMonthLast()!);
    }
    if (r.hasYear()) {
        out.year = decodeTrueRetention(r.getYearLast()!);
    }
    if (r.hasAllTime()) {
        out.allTime = decodeTrueRetention(r.getAllTimeLast()!);
    }
    return out;
}
export function decodeGraphsResponse(bytes: Uint8Array): GraphsView {
    const r = new StatsGraphsResponse(bytes);
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
    if (r.hasButtons()) {
        out.buttons = decodeButtons(r.getButtonsLast()!);
    }
    if (r.hasCardCounts()) {
        out.cardCounts = decodeCardCounts(r.getCardCountsLast()!);
    }
    if (r.hasHours()) {
        out.hours = decodeHours(r.getHoursLast()!);
    }
    if (r.hasToday()) {
        out.today = decodeToday(r.getTodayLast()!);
    }
    if (r.hasEases()) {
        out.eases = decodeEases(r.getEasesLast()!);
    }
    if (r.hasIntervals()) {
        out.intervals = decodeIntervals(r.getIntervalsLast()!);
    }
    if (r.hasFutureDue()) {
        out.futureDue = decodeFutureDue(r.getFutureDueLast()!);
    }
    if (r.hasAdded()) {
        out.added = decodeAdded(r.getAddedLast()!);
    }
    if (r.hasReviews()) {
        const reviews: ReviewCountsAndTimes = decodeReviewCountsAndTimes(r.getReviewsLast()!);
        out.reviewCountsByDaysAgo = reviews.count;
        out.reviewTimesByDaysAgo = reviews.time;
    }
    if (r.hasRolloverHour()) {
        out.rolloverHour = r.getRolloverHour();
    }
    if (r.hasDifficulty()) {
        out.difficulty = decodeEases(r.getDifficultyLast()!);
    }
    if (r.hasRetrievability()) {
        out.retrievability = decodeRetrievability(r.getRetrievabilityLast()!);
    }
    if (r.hasFsrs()) {
        out.fsrs = r.getFsrs();
    }
    if (r.hasStability()) {
        out.stability = decodeIntervals(r.getStabilityLast()!);
    }
    if (r.hasTrueRetention()) {
        out.trueRetention = decodeTrueRetentionStats(r.getTrueRetentionLast()!);
    }
    return out;
}
export enum Weekday {
    SUNDAY = StatsGraphPreferencesWeekday.SUNDAY,
    MONDAY = StatsGraphPreferencesWeekday.MONDAY,
    FRIDAY = StatsGraphPreferencesWeekday.FRIDAY,
    SATURDAY = StatsGraphPreferencesWeekday.SATURDAY
}
export interface GraphPreferences {
    calendarFirstDayOfWeek: Weekday;
    cardCountsSeparateInactive: boolean;
    browserLinksSupported: boolean;
    futureDueShowBacklog: boolean;
}
export function decodeGraphPreferences(bytes: Uint8Array): GraphPreferences {
    const r = new StatsGraphPreferences(bytes);
    const out: GraphPreferences = {
        calendarFirstDayOfWeek: Weekday.SUNDAY,
        cardCountsSeparateInactive: false,
        browserLinksSupported: false,
        futureDueShowBacklog: false
    };
    if (r.hasCalendarFirstDayOfWeek()) {
        out.calendarFirstDayOfWeek = r.getCalendarFirstDayOfWeek() as Weekday;
    }
    if (r.hasCardCountsSeparateInactive()) {
        out.cardCountsSeparateInactive = r.getCardCountsSeparateInactive();
    }
    if (r.hasBrowserLinksSupported()) {
        out.browserLinksSupported = r.getBrowserLinksSupported();
    }
    if (r.hasFutureDueShowBacklog()) {
        out.futureDueShowBacklog = r.getFutureDueShowBacklog();
    }
    return out;
}
export function encodeGraphPreferences(prefs: GraphPreferences): Uint8Array {
    const w = new StatsGraphPreferences();
    if (prefs.calendarFirstDayOfWeek !== Weekday.SUNDAY) {
        w.setCalendarFirstDayOfWeek(prefs.calendarFirstDayOfWeek);
    }
    if (prefs.cardCountsSeparateInactive) {
        w.setCardCountsSeparateInactive(true);
    }
    if (prefs.browserLinksSupported) {
        w.setBrowserLinksSupported(true);
    }
    if (prefs.futureDueShowBacklog) {
        w.setFutureDueShowBacklog(true);
    }
    return w.转为字节();
}
export function encodeEmpty(): Uint8Array {
    return new Uint8Array(0);
}
export enum ReviewKind {
    LEARNING = StatsRevlogEntryReviewKind.LEARNING,
    REVIEW = StatsRevlogEntryReviewKind.REVIEW,
    RELEARNING = StatsRevlogEntryReviewKind.RELEARNING,
    FILTERED = StatsRevlogEntryReviewKind.FILTERED,
    MANUAL = StatsRevlogEntryReviewKind.MANUAL,
    RESCHEDULED = StatsRevlogEntryReviewKind.RESCHEDULED
}
export interface StatsRevlogEntry {
    time: number;
    reviewKind: ReviewKind;
    buttonChosen: number;
    interval: number;
    ease: number;
    takenSecs: number;
    lastInterval: number;
}
export interface CardStatsView {
    revlog: StatsRevlogEntry[];
    cardId: number;
    noteId: number;
    deck: string;
    added: number;
    firstReview?: number;
    latestReview?: number;
    dueDate?: number;
    duePosition?: number;
    interval: number;
    ease: number;
    reviews: number;
    lapses: number;
    averageSecs: number;
    totalSecs: number;
    cardType: string;
    notetype: string;
    fsrsRetrievability?: number;
}
function decodeStatsRevlogEntry(bytes: Uint8Array): StatsRevlogEntry {
    const r = new StatsCardStatsResponseStatsRevlogEntry(bytes);
    const out: StatsRevlogEntry = {
        time: 0,
        reviewKind: ReviewKind.LEARNING,
        buttonChosen: 0,
        interval: 0,
        ease: 0,
        takenSecs: 0,
        lastInterval: 0
    };
    if (r.hasTime()) {
        out.time = r.getTime();
    }
    if (r.hasReviewKind()) {
        out.reviewKind = r.getReviewKind() as ReviewKind;
    }
    if (r.hasButtonChosen()) {
        out.buttonChosen = r.getButtonChosen();
    }
    if (r.hasInterval()) {
        out.interval = r.getInterval();
    }
    if (r.hasEase()) {
        out.ease = r.getEase();
    }
    if (r.hasTakenSecs()) {
        out.takenSecs = r.getTakenSecs();
    }
    if (r.hasLastInterval()) {
        out.lastInterval = r.getLastInterval();
    }
    return out;
}
export function decodeCardStatsResponse(bytes: Uint8Array): CardStatsView {
    const r = new StatsCardStatsResponse(bytes);
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
    if (r.hasRevlog()) {
        for (const item of r.getRevlog())
            out.revlog.push(decodeStatsRevlogEntry(item));
    }
    if (r.hasCardId()) {
        out.cardId = r.getCardId();
    }
    if (r.hasNoteId()) {
        out.noteId = r.getNoteId();
    }
    if (r.hasDeck()) {
        out.deck = r.getDeck();
    }
    if (r.hasAdded()) {
        out.added = r.getAdded();
    }
    if (r.hasFirstReview()) {
        out.firstReview = r.getFirstReview();
    }
    if (r.hasLatestReview()) {
        out.latestReview = r.getLatestReview();
    }
    if (r.hasDueDate()) {
        out.dueDate = r.getDueDate();
    }
    if (r.hasDuePosition()) {
        out.duePosition = r.getDuePosition();
    }
    if (r.hasInterval()) {
        out.interval = r.getInterval();
    }
    if (r.hasEase()) {
        out.ease = r.getEase();
    }
    if (r.hasReviews()) {
        out.reviews = r.getReviews();
    }
    if (r.hasLapses()) {
        out.lapses = r.getLapses();
    }
    if (r.hasAverageSecs()) {
        out.averageSecs = r.getAverageSecs();
    }
    if (r.hasTotalSecs()) {
        out.totalSecs = r.getTotalSecs();
    }
    if (r.hasCardType()) {
        out.cardType = r.getCardType();
    }
    if (r.hasNotetype()) {
        out.notetype = r.getNotetype();
    }
    if (r.hasFsrsRetrievability()) {
        out.fsrsRetrievability = r.getFsrsRetrievability();
    }
    return out;
}
