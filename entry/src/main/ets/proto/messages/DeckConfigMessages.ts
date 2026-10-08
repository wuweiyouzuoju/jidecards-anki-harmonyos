// SPDX-License-Identifier: AGPL-3.0-or-later
// 领域契约适配；协议事实由 generated/CoreMessages.ts 提供。
import { DeckConfigUpdateDeckConfigsMode } from '../generated/CoreMessages';
import { 协议写入器 } from '../core/ProtoWriter';
import { DeckConfigDeckConfig, DeckConfigDeckConfigConfig, DeckConfigDeckConfigId, DeckConfigDeckConfigsForUpdate, DeckConfigDeckConfigsForUpdateConfigWithExtra, DeckConfigDeckConfigsForUpdateCurrentDeck, DeckConfigDeckConfigsForUpdateCurrentDeckLimits, DeckConfigUpdateDeckConfigsRequest } from '../generated/CoreMessages';
export function encodeDeckConfigId(dcid: number): Uint8Array {
    const w = new DeckConfigDeckConfigId();
    if (dcid !== 0)
        w.setDcid(dcid);
    return w.转为字节();
}
export interface DeckConfigSettings {
    learnSteps: number[];
    relearnSteps: number[];
    fsrsParams4: number[];
    easyDaysPercentages: number[];
    fsrsParams5: number[];
    fsrsParams6: number[];
    newPerDay: number;
    reviewsPerDay: number;
    initialEase: number;
    easyMultiplier: number;
    hardMultiplier: number;
    lapseMultiplier: number;
    intervalMultiplier: number;
    maximumReviewInterval: number;
    minimumLapseInterval: number;
    graduatingIntervalGood: number;
    graduatingIntervalEasy: number;
    newCardInsertOrder: number;
    leechAction: number;
    leechThreshold: number;
    disableAutoplay: boolean;
    capAnswerTimeToSecs: number;
    showTimer: boolean;
    skipQuestionWhenReplayingAnswer: boolean;
    buryNew: boolean;
    buryReviews: boolean;
    buryInterdayLearning: boolean;
    newMix: number;
    interdayLearningMix: number;
    newCardSortOrder: number;
    reviewOrder: number;
    newCardGatherPriority: number;
    newPerDayMinimum: number;
    questionAction: number;
    desiredRetention: number;
    stopTimerOnAnswer: boolean;
    historicalRetention: number;
    secondsToShowQuestion: number;
    secondsToShowAnswer: number;
    answerAction: number;
    waitForAudio: boolean;
    paramSearch: string;
    ignoreRevlogsBeforeDate: string;
    other: Uint8Array;
    preserved: Uint8Array[];
}
export interface DeckConfig {
    id: number;
    name: string;
    mtimeSecs: number;
    usn: number;
    config: DeckConfigSettings | null;
}
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
function encodeSettings(input: DeckConfigSettings): 协议写入器 {
    const w = new DeckConfigDeckConfigConfig();
    if (input.learnSteps !== undefined && input.learnSteps.length > 0)
        w.setLearnSteps(input.learnSteps);
    if (input.relearnSteps !== undefined && input.relearnSteps.length > 0)
        w.setRelearnSteps(input.relearnSteps);
    if (input.fsrsParams4 !== undefined && input.fsrsParams4.length > 0)
        w.setFsrsParams4(input.fsrsParams4);
    if (input.easyDaysPercentages !== undefined && input.easyDaysPercentages.length > 0)
        w.setEasyDaysPercentages(input.easyDaysPercentages);
    if (input.fsrsParams5 !== undefined && input.fsrsParams5.length > 0)
        w.setFsrsParams5(input.fsrsParams5);
    if (input.fsrsParams6 !== undefined && input.fsrsParams6.length > 0)
        w.setFsrsParams6(input.fsrsParams6);
    if (input.newPerDay !== undefined && input.newPerDay !== 0)
        w.setNewPerDay(input.newPerDay);
    if (input.reviewsPerDay !== undefined && input.reviewsPerDay !== 0)
        w.setReviewsPerDay(input.reviewsPerDay);
    if (input.initialEase !== undefined && input.initialEase !== 0)
        w.setInitialEase(input.initialEase);
    if (input.easyMultiplier !== undefined && input.easyMultiplier !== 0)
        w.setEasyMultiplier(input.easyMultiplier);
    if (input.hardMultiplier !== undefined && input.hardMultiplier !== 0)
        w.setHardMultiplier(input.hardMultiplier);
    if (input.lapseMultiplier !== undefined && input.lapseMultiplier !== 0)
        w.setLapseMultiplier(input.lapseMultiplier);
    if (input.intervalMultiplier !== undefined && input.intervalMultiplier !== 0)
        w.setIntervalMultiplier(input.intervalMultiplier);
    if (input.maximumReviewInterval !== undefined && input.maximumReviewInterval !== 0)
        w.setMaximumReviewInterval(input.maximumReviewInterval);
    if (input.minimumLapseInterval !== undefined && input.minimumLapseInterval !== 0)
        w.setMinimumLapseInterval(input.minimumLapseInterval);
    if (input.graduatingIntervalGood !== undefined && input.graduatingIntervalGood !== 0)
        w.setGraduatingIntervalGood(input.graduatingIntervalGood);
    if (input.graduatingIntervalEasy !== undefined && input.graduatingIntervalEasy !== 0)
        w.setGraduatingIntervalEasy(input.graduatingIntervalEasy);
    if (input.newCardInsertOrder !== undefined && input.newCardInsertOrder !== 0)
        w.setNewCardInsertOrder(input.newCardInsertOrder);
    if (input.leechAction !== undefined && input.leechAction !== 0)
        w.setLeechAction(input.leechAction);
    if (input.leechThreshold !== undefined && input.leechThreshold !== 0)
        w.setLeechThreshold(input.leechThreshold);
    if (input.disableAutoplay !== undefined && input.disableAutoplay)
        w.setDisableAutoplay(input.disableAutoplay);
    if (input.capAnswerTimeToSecs !== undefined && input.capAnswerTimeToSecs !== 0)
        w.setCapAnswerTimeToSecs(input.capAnswerTimeToSecs);
    if (input.showTimer !== undefined && input.showTimer)
        w.setShowTimer(input.showTimer);
    if (input.skipQuestionWhenReplayingAnswer !== undefined && input.skipQuestionWhenReplayingAnswer)
        w.setSkipQuestionWhenReplayingAnswer(input.skipQuestionWhenReplayingAnswer);
    if (input.buryNew !== undefined && input.buryNew)
        w.setBuryNew(input.buryNew);
    if (input.buryReviews !== undefined && input.buryReviews)
        w.setBuryReviews(input.buryReviews);
    if (input.buryInterdayLearning !== undefined && input.buryInterdayLearning)
        w.setBuryInterdayLearning(input.buryInterdayLearning);
    if (input.newMix !== undefined && input.newMix !== 0)
        w.setNewMix(input.newMix);
    if (input.interdayLearningMix !== undefined && input.interdayLearningMix !== 0)
        w.setInterdayLearningMix(input.interdayLearningMix);
    if (input.newCardSortOrder !== undefined && input.newCardSortOrder !== 0)
        w.setNewCardSortOrder(input.newCardSortOrder);
    if (input.reviewOrder !== undefined && input.reviewOrder !== 0)
        w.setReviewOrder(input.reviewOrder);
    if (input.newCardGatherPriority !== undefined && input.newCardGatherPriority !== 0)
        w.setNewCardGatherPriority(input.newCardGatherPriority);
    if (input.newPerDayMinimum !== undefined && input.newPerDayMinimum !== 0)
        w.setNewPerDayMinimum(input.newPerDayMinimum);
    if (input.questionAction !== undefined && input.questionAction !== 0)
        w.setQuestionAction(input.questionAction);
    if (input.desiredRetention !== undefined && input.desiredRetention !== 0)
        w.setDesiredRetention(input.desiredRetention);
    if (input.stopTimerOnAnswer !== undefined && input.stopTimerOnAnswer)
        w.setStopTimerOnAnswer(input.stopTimerOnAnswer);
    if (input.historicalRetention !== undefined && input.historicalRetention !== 0)
        w.setHistoricalRetention(input.historicalRetention);
    if (input.secondsToShowQuestion !== undefined && input.secondsToShowQuestion !== 0)
        w.setSecondsToShowQuestion(input.secondsToShowQuestion);
    if (input.secondsToShowAnswer !== undefined && input.secondsToShowAnswer !== 0)
        w.setSecondsToShowAnswer(input.secondsToShowAnswer);
    if (input.answerAction !== undefined && input.answerAction !== 0)
        w.setAnswerAction(input.answerAction);
    if (input.waitForAudio !== undefined && input.waitForAudio)
        w.setWaitForAudio(input.waitForAudio);
    if (input.paramSearch !== undefined && input.paramSearch !== '')
        w.setParamSearch(input.paramSearch);
    if (input.ignoreRevlogsBeforeDate !== undefined && input.ignoreRevlogsBeforeDate !== '')
        w.setIgnoreRevlogsBeforeDate(input.ignoreRevlogsBeforeDate);
    if (input.other !== undefined && input.other.length > 0)
        w.setOther(input.other);
    for (const raw of input.preserved ?? [])
        w.appendRaw(raw);
    const writer = new 协议写入器();
    writer.写入原始字节(w.toBytes());
    return writer;
}
function decodeSettings(bytes: Uint8Array): DeckConfigSettings {
    const m = new DeckConfigDeckConfigConfig(bytes);
    const out = emptyDeckConfigSettings();
    if (m.hasLearnSteps())
        out.learnSteps = m.getLearnSteps();
    if (m.hasRelearnSteps())
        out.relearnSteps = m.getRelearnSteps();
    if (m.hasFsrsParams4())
        out.fsrsParams4 = m.getFsrsParams4();
    if (m.hasEasyDaysPercentages())
        out.easyDaysPercentages = m.getEasyDaysPercentages();
    if (m.hasFsrsParams5())
        out.fsrsParams5 = m.getFsrsParams5();
    if (m.hasFsrsParams6())
        out.fsrsParams6 = m.getFsrsParams6();
    if (m.hasNewPerDay())
        out.newPerDay = m.getNewPerDay();
    if (m.hasReviewsPerDay())
        out.reviewsPerDay = m.getReviewsPerDay();
    if (m.hasInitialEase())
        out.initialEase = m.getInitialEase();
    if (m.hasEasyMultiplier())
        out.easyMultiplier = m.getEasyMultiplier();
    if (m.hasHardMultiplier())
        out.hardMultiplier = m.getHardMultiplier();
    if (m.hasLapseMultiplier())
        out.lapseMultiplier = m.getLapseMultiplier();
    if (m.hasIntervalMultiplier())
        out.intervalMultiplier = m.getIntervalMultiplier();
    if (m.hasMaximumReviewInterval())
        out.maximumReviewInterval = m.getMaximumReviewInterval();
    if (m.hasMinimumLapseInterval())
        out.minimumLapseInterval = m.getMinimumLapseInterval();
    if (m.hasGraduatingIntervalGood())
        out.graduatingIntervalGood = m.getGraduatingIntervalGood();
    if (m.hasGraduatingIntervalEasy())
        out.graduatingIntervalEasy = m.getGraduatingIntervalEasy();
    if (m.hasNewCardInsertOrder())
        out.newCardInsertOrder = m.getNewCardInsertOrder();
    if (m.hasLeechAction())
        out.leechAction = m.getLeechAction();
    if (m.hasLeechThreshold())
        out.leechThreshold = m.getLeechThreshold();
    if (m.hasDisableAutoplay())
        out.disableAutoplay = m.getDisableAutoplay();
    if (m.hasCapAnswerTimeToSecs())
        out.capAnswerTimeToSecs = m.getCapAnswerTimeToSecs();
    if (m.hasShowTimer())
        out.showTimer = m.getShowTimer();
    if (m.hasSkipQuestionWhenReplayingAnswer())
        out.skipQuestionWhenReplayingAnswer = m.getSkipQuestionWhenReplayingAnswer();
    if (m.hasBuryNew())
        out.buryNew = m.getBuryNew();
    if (m.hasBuryReviews())
        out.buryReviews = m.getBuryReviews();
    if (m.hasBuryInterdayLearning())
        out.buryInterdayLearning = m.getBuryInterdayLearning();
    if (m.hasNewMix())
        out.newMix = m.getNewMix();
    if (m.hasInterdayLearningMix())
        out.interdayLearningMix = m.getInterdayLearningMix();
    if (m.hasNewCardSortOrder())
        out.newCardSortOrder = m.getNewCardSortOrder();
    if (m.hasReviewOrder())
        out.reviewOrder = m.getReviewOrder();
    if (m.hasNewCardGatherPriority())
        out.newCardGatherPriority = m.getNewCardGatherPriority();
    if (m.hasNewPerDayMinimum())
        out.newPerDayMinimum = m.getNewPerDayMinimum();
    if (m.hasQuestionAction())
        out.questionAction = m.getQuestionAction();
    if (m.hasDesiredRetention())
        out.desiredRetention = m.getDesiredRetention();
    if (m.hasStopTimerOnAnswer())
        out.stopTimerOnAnswer = m.getStopTimerOnAnswer();
    if (m.hasHistoricalRetention())
        out.historicalRetention = m.getHistoricalRetention();
    if (m.hasSecondsToShowQuestion())
        out.secondsToShowQuestion = m.getSecondsToShowQuestion();
    if (m.hasSecondsToShowAnswer())
        out.secondsToShowAnswer = m.getSecondsToShowAnswer();
    if (m.hasAnswerAction())
        out.answerAction = m.getAnswerAction();
    if (m.hasWaitForAudio())
        out.waitForAudio = m.getWaitForAudio();
    if (m.hasParamSearch())
        out.paramSearch = m.getParamSearch();
    if (m.hasIgnoreRevlogsBeforeDate())
        out.ignoreRevlogsBeforeDate = m.getIgnoreRevlogsBeforeDate();
    if (m.hasOther())
        out.other = m.getOther()!;
    out.preserved = m.preserved();
    return out;
}
export function encodeDeckConfig(value: DeckConfig): Uint8Array {
    const w = new DeckConfigDeckConfig();
    if (value.id !== 0)
        w.setId(value.id);
    if (value.name !== '')
        w.setName(value.name);
    if (value.mtimeSecs !== 0)
        w.setMtimeSecs(value.mtimeSecs);
    if (value.usn !== 0)
        w.setUsn(value.usn);
    if (value.config !== null)
        w.setConfigWriter(encodeSettings(value.config));
    return w.转为字节();
}
export function decodeDeckConfig(bytes: Uint8Array): DeckConfig {
    const r = new DeckConfigDeckConfig(bytes);
    const out: DeckConfig = { id: 0, name: '', mtimeSecs: 0, usn: 0, config: null };
    if (r.hasId()) {
        out.id = r.getId();
    }
    if (r.hasName()) {
        out.name = r.getName();
    }
    if (r.hasMtimeSecs()) {
        out.mtimeSecs = r.getMtimeSecs();
    }
    if (r.hasUsn()) {
        out.usn = r.getUsn();
    }
    if (r.hasConfig()) {
        out.config = decodeSettings(r.getConfigLast()!);
    }
    return out;
}
export interface DeckLimits {
    review: number | null;
    new: number | null;
    reviewToday: number | null;
    newToday: number | null;
    reviewTodayActive: boolean;
    newTodayActive: boolean;
    desiredRetention: number | null;
}
export function encodeLimits(v: DeckLimits): 协议写入器 {
    const w = new DeckConfigDeckConfigsForUpdateCurrentDeckLimits();
    if (v.review !== null)
        w.setReview(v.review);
    if (v.new !== null)
        w.setNew(v.new);
    if (v.reviewToday !== null)
        w.setReviewToday(v.reviewToday);
    if (v.newToday !== null)
        w.setNewToday(v.newToday);
    if (v.reviewTodayActive)
        w.setReviewTodayActive(true);
    if (v.newTodayActive)
        w.setNewTodayActive(true);
    if (v.desiredRetention !== null)
        w.setDesiredRetention(v.desiredRetention);
    const out = new 协议写入器();
    out.写入原始字节(w.toBytes());
    return out;
}
export function decodeLimits(bytes: Uint8Array): DeckLimits {
    const r = new DeckConfigDeckConfigsForUpdateCurrentDeckLimits(bytes);
    const out: DeckLimits = { review: null, new: null, reviewToday: null, newToday: null, reviewTodayActive: false, newTodayActive: false, desiredRetention: null };
    if (r.hasReview()) {
        out.review = r.getReview();
    }
    if (r.hasNew()) {
        out.new = r.getNew();
    }
    if (r.hasReviewToday()) {
        out.reviewToday = r.getReviewToday();
    }
    if (r.hasNewToday()) {
        out.newToday = r.getNewToday();
    }
    if (r.hasReviewTodayActive()) {
        out.reviewTodayActive = r.getReviewTodayActive();
    }
    if (r.hasNewTodayActive()) {
        out.newTodayActive = r.getNewTodayActive();
    }
    if (r.hasDesiredRetention()) {
        out.desiredRetention = r.getDesiredRetention();
    }
    return out;
}
export interface DeckConfigWithUseCount {
    config: DeckConfig;
    useCount: number;
}
export interface CurrentDeckInfo {
    name: string;
    configId: number;
    parentConfigIds: number[];
    limits: DeckLimits | null;
}
function decodeConfigWithExtra(bytes: Uint8Array): DeckConfigWithUseCount {
    const m = new DeckConfigDeckConfigsForUpdateConfigWithExtra(bytes);
    const out: DeckConfigWithUseCount = { config: decodeDeckConfig(m.getConfigLast() ?? new Uint8Array(0)), useCount: m.getUseCount() };
    return out;
}
function decodeCurrentDeck(bytes: Uint8Array): CurrentDeckInfo {
    const r = new DeckConfigDeckConfigsForUpdateCurrentDeck(bytes);
    const out: CurrentDeckInfo = { name: '', configId: 0, parentConfigIds: [], limits: null };
    if (r.hasName()) {
        out.name = r.getName();
    }
    if (r.hasConfigId()) {
        out.configId = r.getConfigId();
    }
    if (r.hasParentConfigIds()) {
        out.parentConfigIds.push(...r.getParentConfigIds());
    }
    if (r.hasLimits()) {
        out.limits = decodeLimits(r.getLimitsLast()!);
    }
    return out;
}
export interface DeckConfigsForUpdateView {
    allConfigs: DeckConfigWithUseCount[];
    currentDeck: CurrentDeckInfo | null;
    defaults: DeckConfig | null;
    schemaModified: boolean;
    cardStateCustomizer: string;
    newCardsIgnoreReviewLimit: boolean;
    fsrs: boolean;
    applyAllParentLimits: boolean;
    fsrsHealthCheck: boolean;
}
export function decodeDeckConfigsForUpdate(bytes: Uint8Array): DeckConfigsForUpdateView {
    const r = new DeckConfigDeckConfigsForUpdate(bytes);
    const out: DeckConfigsForUpdateView = { allConfigs: [], currentDeck: null, defaults: null, schemaModified: false, cardStateCustomizer: '', newCardsIgnoreReviewLimit: false, fsrs: false, applyAllParentLimits: false, fsrsHealthCheck: false };
    if (r.hasAllConfig()) {
        for (const item of r.getAllConfig())
            out.allConfigs.push(decodeConfigWithExtra(item));
    }
    if (r.hasCurrentDeck()) {
        out.currentDeck = decodeCurrentDeck(r.getCurrentDeckLast()!);
    }
    if (r.hasDefaults()) {
        out.defaults = decodeDeckConfig(r.getDefaultsLast()!);
    }
    if (r.hasSchemaModified()) {
        out.schemaModified = r.getSchemaModified();
    }
    if (r.hasCardStateCustomizer()) {
        out.cardStateCustomizer = r.getCardStateCustomizer();
    }
    if (r.hasNewCardsIgnoreReviewLimit()) {
        out.newCardsIgnoreReviewLimit = r.getNewCardsIgnoreReviewLimit();
    }
    if (r.hasFsrs()) {
        out.fsrs = r.getFsrs();
    }
    if (r.hasApplyAllParentLimits()) {
        out.applyAllParentLimits = r.getApplyAllParentLimits();
    }
    if (r.hasFsrsHealthCheck()) {
        out.fsrsHealthCheck = r.getFsrsHealthCheck();
    }
    return out;
}
export const UPDATE_DECK_CONFIGS_MODE_NORMAL = DeckConfigUpdateDeckConfigsMode.UPDATE_DECK_CONFIGS_MODE_NORMAL;
export const UPDATE_DECK_CONFIGS_MODE_APPLY_TO_CHILDREN = DeckConfigUpdateDeckConfigsMode.UPDATE_DECK_CONFIGS_MODE_APPLY_TO_CHILDREN;
export const UPDATE_DECK_CONFIGS_MODE_COMPUTE_ALL_PARAMS = DeckConfigUpdateDeckConfigsMode.UPDATE_DECK_CONFIGS_MODE_COMPUTE_ALL_PARAMS;
export interface UpdateDeckConfigsInput {
    targetDeckId: number;
    configs: DeckConfig[];
    removedConfigIds: number[];
    mode: number;
    cardStateCustomizer: string;
    limits: DeckLimits | null;
    newCardsIgnoreReviewLimit: boolean;
    fsrs: boolean;
    applyAllParentLimits: boolean;
    fsrsReschedule: boolean;
    fsrsHealthCheck: boolean;
}
export function encodeUpdateDeckConfigsRequest(req: UpdateDeckConfigsInput): Uint8Array {
    const w = new DeckConfigUpdateDeckConfigsRequest();
    if (req.targetDeckId !== 0)
        w.setTargetDeckId(req.targetDeckId);
    w.setConfigs(req.configs.map((v: DeckConfig): Uint8Array => encodeDeckConfig(v)));
    w.setRemovedConfigIds(req.removedConfigIds);
    if (req.mode !== 0)
        w.setMode(req.mode);
    if (req.cardStateCustomizer !== '')
        w.setCardStateCustomizer(req.cardStateCustomizer);
    if (req.limits !== null)
        w.setLimits(encodeLimits(req.limits).转为字节());
    if (req.newCardsIgnoreReviewLimit)
        w.setNewCardsIgnoreReviewLimit(true);
    if (req.fsrs)
        w.setFsrs(true);
    if (req.applyAllParentLimits)
        w.setApplyAllParentLimits(true);
    if (req.fsrsReschedule)
        w.setFsrsReschedule(true);
    if (req.fsrsHealthCheck)
        w.setFsrsHealthCheck(true);
    return w.toBytes();
}
export function decodeUpdateDeckConfigsRequest(bytes: Uint8Array): UpdateDeckConfigsInput {
    const r = new DeckConfigUpdateDeckConfigsRequest(bytes);
    const out: UpdateDeckConfigsInput = { targetDeckId: 0, configs: [], removedConfigIds: [], mode: 0, cardStateCustomizer: '', limits: null, newCardsIgnoreReviewLimit: false, fsrs: false, applyAllParentLimits: false, fsrsReschedule: false, fsrsHealthCheck: false };
    if (r.hasTargetDeckId()) {
        out.targetDeckId = r.getTargetDeckId();
    }
    if (r.hasConfigs()) {
        for (const item of r.getConfigs())
            out.configs.push(decodeDeckConfig(item));
    }
    if (r.hasRemovedConfigIds()) {
        out.removedConfigIds.push(...r.getRemovedConfigIds());
    }
    if (r.hasMode()) {
        out.mode = r.getMode();
    }
    if (r.hasCardStateCustomizer()) {
        out.cardStateCustomizer = r.getCardStateCustomizer();
    }
    if (r.hasLimits()) {
        out.limits = decodeLimits(r.getLimitsLast()!);
    }
    if (r.hasNewCardsIgnoreReviewLimit()) {
        out.newCardsIgnoreReviewLimit = r.getNewCardsIgnoreReviewLimit();
    }
    if (r.hasFsrs()) {
        out.fsrs = r.getFsrs();
    }
    if (r.hasApplyAllParentLimits()) {
        out.applyAllParentLimits = r.getApplyAllParentLimits();
    }
    if (r.hasFsrsReschedule()) {
        out.fsrsReschedule = r.getFsrsReschedule();
    }
    if (r.hasFsrsHealthCheck()) {
        out.fsrsHealthCheck = r.getFsrsHealthCheck();
    }
    return out;
}
