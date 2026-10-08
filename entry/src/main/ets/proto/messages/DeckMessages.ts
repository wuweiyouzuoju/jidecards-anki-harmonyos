// SPDX-License-Identifier: AGPL-3.0-or-later
// 领域契约适配；协议事实由 generated/CoreMessages.ts 提供。
import { DecksDeckFilteredSearchTermOrder } from '../generated/CoreMessages';
import { 协议写入器 } from '../core/ProtoWriter';
import { DecksDeck, DecksDeckCommon, DecksDeckFiltered, DecksDeckFilteredSearchTerm, DecksDeckId, DecksDeckIds, DecksDeckNameId, DecksDeckNames, DecksDeckNormal, DecksDeckNormalDayLimit, DecksDeckTreeNode, DecksDeckTreeRequest, DecksFilteredDeckForUpdate, DecksGetDeckNamesRequest, DecksRenameDeckRequest, DecksReparentDecksRequest } from '../generated/CoreMessages';
export interface DeckDayLimit {
    limit: number;
    today: number;
}
export interface DeckCommon {
    studyCollapsed: boolean;
    browserCollapsed: boolean;
    lastDayStudied: number;
    newStudied: number;
    learningStudied: number;
    millisecondsStudied: number;
    other: Uint8Array | null;
}
export interface DeckNormal {
    configId: number;
    extendNew: number;
    extendReview: number;
    description: string;
    markdownDescription: boolean;
    reviewLimit: number | null;
    newLimit: number | null;
    reviewLimitToday: DeckDayLimit | null;
    newLimitToday: DeckDayLimit | null;
    desiredRetention: number | null;
}
export interface Deck {
    id: number;
    name: string;
    mtimeSecs: number;
    usn: number;
    common: DeckCommon | null;
    normal: DeckNormal | null;
}
function encodeDayLimit(value: DeckDayLimit): 协议写入器 {
    const w = new DecksDeckNormalDayLimit();
    if (value.limit !== 0) {
        w.setLimit(value.limit);
    }
    if (value.today !== 0) {
        w.setToday(value.today);
    }
    const writer = new 协议写入器();
    writer.写入原始字节(w.toBytes());
    return writer;
}
function decodeDayLimit(bytes: Uint8Array): DeckDayLimit {
    const m = new DecksDeckNormalDayLimit(bytes);
    const out: DeckDayLimit = { limit: m.getLimit(), today: m.getToday() };
    return out;
}
function encodeCommon(value: DeckCommon): 协议写入器 {
    const w = new DecksDeckCommon();
    if (value.studyCollapsed) {
        w.setStudyCollapsed(true);
    }
    if (value.browserCollapsed) {
        w.setBrowserCollapsed(true);
    }
    if (value.lastDayStudied !== 0) {
        w.setLastDayStudied(value.lastDayStudied);
    }
    if (value.newStudied !== 0) {
        w.setNewStudied(value.newStudied);
    }
    if (value.learningStudied !== 0) {
        w.setLearningStudied(value.learningStudied);
    }
    if (value.millisecondsStudied !== 0) {
        w.setMillisecondsStudied(value.millisecondsStudied);
    }
    if (value.other !== null && value.other.length > 0) {
        w.setOther(value.other);
    }
    const writer = new 协议写入器();
    writer.写入原始字节(w.toBytes());
    return writer;
}
function decodeCommon(bytes: Uint8Array): DeckCommon {
    const r = new DecksDeckCommon(bytes);
    const out: DeckCommon = {
        studyCollapsed: false,
        browserCollapsed: false,
        lastDayStudied: 0,
        newStudied: 0,
        learningStudied: 0,
        millisecondsStudied: 0,
        other: null
    };
    if (r.hasStudyCollapsed()) {
        out.studyCollapsed = r.getStudyCollapsed();
    }
    if (r.hasBrowserCollapsed()) {
        out.browserCollapsed = r.getBrowserCollapsed();
    }
    if (r.hasLastDayStudied()) {
        out.lastDayStudied = r.getLastDayStudied();
    }
    if (r.hasNewStudied()) {
        out.newStudied = r.getNewStudied();
    }
    if (r.hasLearningStudied()) {
        out.learningStudied = r.getLearningStudied();
    }
    if (r.hasMillisecondsStudied()) {
        out.millisecondsStudied = r.getMillisecondsStudied();
    }
    if (r.hasOther()) {
        out.other = r.getOther();
    }
    return out;
}
function encodeNormal(value: DeckNormal): 协议写入器 {
    const w = new DecksDeckNormal();
    if (value.configId !== 0) {
        w.setConfigId(value.configId);
    }
    if (value.extendNew !== 0) {
        w.setExtendNew(value.extendNew);
    }
    if (value.extendReview !== 0) {
        w.setExtendReview(value.extendReview);
    }
    if (value.description !== '') {
        w.setDescription(value.description);
    }
    if (value.markdownDescription) {
        w.setMarkdownDescription(true);
    }
    if (value.reviewLimit !== null) {
        w.setReviewLimit(value.reviewLimit);
    }
    if (value.newLimit !== null) {
        w.setNewLimit(value.newLimit);
    }
    if (value.reviewLimitToday !== null) {
        w.setReviewLimitTodayWriter(encodeDayLimit(value.reviewLimitToday));
    }
    if (value.newLimitToday !== null) {
        w.setNewLimitTodayWriter(encodeDayLimit(value.newLimitToday));
    }
    if (value.desiredRetention !== null) {
        w.setDesiredRetention(value.desiredRetention);
    }
    const writer = new 协议写入器();
    writer.写入原始字节(w.toBytes());
    return writer;
}
function decodeNormal(bytes: Uint8Array): DeckNormal {
    const r = new DecksDeckNormal(bytes);
    const out: DeckNormal = {
        configId: 0,
        extendNew: 0,
        extendReview: 0,
        description: '',
        markdownDescription: false,
        reviewLimit: null,
        newLimit: null,
        reviewLimitToday: null,
        newLimitToday: null,
        desiredRetention: null
    };
    if (r.hasConfigId()) {
        out.configId = r.getConfigId();
    }
    if (r.hasExtendNew()) {
        out.extendNew = r.getExtendNew();
    }
    if (r.hasExtendReview()) {
        out.extendReview = r.getExtendReview();
    }
    if (r.hasDescription()) {
        out.description = r.getDescription();
    }
    if (r.hasMarkdownDescription()) {
        out.markdownDescription = r.getMarkdownDescription();
    }
    if (r.hasReviewLimit()) {
        out.reviewLimit = r.getReviewLimit();
    }
    if (r.hasNewLimit()) {
        out.newLimit = r.getNewLimit();
    }
    if (r.hasReviewLimitToday()) {
        out.reviewLimitToday = decodeDayLimit(r.getReviewLimitTodayLast()!);
    }
    if (r.hasNewLimitToday()) {
        out.newLimitToday = decodeDayLimit(r.getNewLimitTodayLast()!);
    }
    if (r.hasDesiredRetention()) {
        out.desiredRetention = r.getDesiredRetention();
    }
    return out;
}
export function encodeDeck(deck: Deck): Uint8Array {
    const w = new DecksDeck();
    if (deck.id !== 0) {
        w.setId(deck.id);
    }
    if (deck.name !== '') {
        w.setName(deck.name);
    }
    if (deck.mtimeSecs !== 0) {
        w.setMtimeSecs(deck.mtimeSecs);
    }
    if (deck.usn !== 0) {
        w.setUsn(deck.usn);
    }
    if (deck.common !== null) {
        w.setCommonWriter(encodeCommon(deck.common));
    }
    if (deck.normal !== null) {
        w.setNormalWriter(encodeNormal(deck.normal));
    }
    return w.转为字节();
}
export function encodeReparentDecksRequest(deckIds: number[], parentId: number): Uint8Array {
    const w = new DecksReparentDecksRequest();
    for (const id of deckIds)
        w.setDeckIds([id], false);
    if (parentId !== 0)
        w.setNewParent(parentId);
    return w.转为字节();
}
export function encodeRenameDeckRequest(deckId: number, newName: string): Uint8Array {
    const w = new DecksRenameDeckRequest();
    if (deckId !== 0) {
        w.setDeckId(deckId);
    }
    if (newName !== '') {
        w.setNewName(newName);
    }
    return w.转为字节();
}
export function decodeDeck(bytes: Uint8Array): Deck {
    const r = new DecksDeck(bytes);
    const deck: Deck = { id: 0, name: '', mtimeSecs: 0, usn: 0, common: null, normal: null };
    if (r.hasId()) {
        deck.id = r.getId();
    }
    if (r.hasName()) {
        deck.name = r.getName();
    }
    if (r.hasMtimeSecs()) {
        deck.mtimeSecs = r.getMtimeSecs();
    }
    if (r.hasUsn()) {
        deck.usn = r.getUsn();
    }
    if (r.hasCommon()) {
        deck.common = decodeCommon(r.getCommonLast()!);
    }
    if (r.hasNormal()) {
        deck.normal = decodeNormal(r.getNormalLast()!);
    }
    return deck;
}
export function encodeDeckTreeRequest(now: number): Uint8Array {
    const w = new DecksDeckTreeRequest();
    if (now !== 0) {
        w.setNow(now);
    }
    return w.转为字节();
}
export interface DeckTreeNode {
    deckId: number;
    name: string;
    level: number;
    collapsed: boolean;
    reviewCount: number;
    learnCount: number;
    newCount: number;
    totalInDeck: number;
    totalIncludingChildren: number;
    filtered: boolean;
    children: DeckTreeNode[];
}
export function decodeDeckTreeNode(bytes: Uint8Array): DeckTreeNode {
    const r = new DecksDeckTreeNode(bytes);
    const node: DeckTreeNode = {
        deckId: 0,
        name: '',
        level: 0,
        collapsed: false,
        reviewCount: 0,
        learnCount: 0,
        newCount: 0,
        totalInDeck: 0,
        totalIncludingChildren: 0,
        filtered: false,
        children: []
    };
    if (r.hasDeckId()) {
        node.deckId = r.getDeckId();
    }
    if (r.hasName()) {
        node.name = r.getName();
    }
    if (r.hasChildren()) {
        for (const item of r.getChildren())
            node.children.push(decodeDeckTreeNode(item));
    }
    if (r.hasLevel()) {
        node.level = r.getLevel();
    }
    if (r.hasCollapsed()) {
        node.collapsed = r.getCollapsed();
    }
    if (r.hasReviewCount()) {
        node.reviewCount = r.getReviewCount();
    }
    if (r.hasLearnCount()) {
        node.learnCount = r.getLearnCount();
    }
    if (r.hasNewCount()) {
        node.newCount = r.getNewCount();
    }
    if (r.hasTotalInDeck()) {
        node.totalInDeck = r.getTotalInDeck();
    }
    if (r.hasTotalIncludingChildren()) {
        node.totalIncludingChildren = r.getTotalIncludingChildren();
    }
    if (r.hasFiltered()) {
        node.filtered = r.getFiltered();
    }
    return node;
}
export function encodeGetDeckNamesRequest(skipEmptyDefault: boolean, includeFiltered: boolean): Uint8Array {
    const w = new DecksGetDeckNamesRequest();
    if (skipEmptyDefault) {
        w.setSkipEmptyDefault(true);
    }
    if (includeFiltered) {
        w.setIncludeFiltered(true);
    }
    return w.转为字节();
}
export function encodeDeckId(deckId: number): Uint8Array {
    const w = new DecksDeckId();
    if (deckId !== 0) {
        w.setDid(deckId);
    }
    return w.转为字节();
}
export function encodeDeckIds(deckIds: number[]): Uint8Array {
    const w = new DecksDeckIds();
    for (let i = 0; i < deckIds.length; i++) {
        w.setDids([deckIds[i]], false);
    }
    return w.转为字节();
}
export interface DeckNameId {
    id: number;
    name: string;
}
export function decodeDeckNames(bytes: Uint8Array): DeckNameId[] {
    return new DecksDeckNames(bytes).getEntries().map((raw: Uint8Array): DeckNameId => decodeDeckNameId(raw));
}
function decodeDeckNameId(bytes: Uint8Array): DeckNameId {
    const m = new DecksDeckNameId(bytes);
    const out: DeckNameId = { id: m.getId(), name: m.getName() };
    return out;
}
export const 过滤牌组排序 = {
    最旧复习优先: DecksDeckFilteredSearchTermOrder.OLDEST_REVIEWED_FIRST,
    随机: DecksDeckFilteredSearchTermOrder.RANDOM,
    间隔升序: DecksDeckFilteredSearchTermOrder.INTERVALS_ASCENDING,
    间隔降序: DecksDeckFilteredSearchTermOrder.INTERVALS_DESCENDING,
    遗忘次数: DecksDeckFilteredSearchTermOrder.LAPSES,
    添加顺序: DecksDeckFilteredSearchTermOrder.ADDED,
    到期日: DecksDeckFilteredSearchTermOrder.DUE,
    逆添加顺序: DecksDeckFilteredSearchTermOrder.REVERSE_ADDED,
    可回忆率升序: DecksDeckFilteredSearchTermOrder.RETRIEVABILITY_ASCENDING,
    可回忆率降序: DecksDeckFilteredSearchTermOrder.RETRIEVABILITY_DESCENDING,
    相对逾期程度: DecksDeckFilteredSearchTermOrder.RELATIVE_OVERDUENESS
} as const;
export interface 搜索条件 {
    preserved?: Uint8Array[];
    search: string;
    limit: number;
    order: number;
}
export interface 过滤牌组配置 {
    preserved?: Uint8Array[];
    reschedule: boolean;
    searchTerms: 搜索条件[];
    previewDelay: number;
    previewAgainSecs: number;
    previewHardSecs: number;
    previewGoodSecs: number;
}
export interface 过滤牌组更新 {
    id: number;
    name: string;
    config: 过滤牌组配置;
    allowEmpty: boolean;
    preserved?: Uint8Array[];
}
function encode搜索条件(term: 搜索条件): 协议写入器 {
    const w = new DecksDeckFilteredSearchTerm();
    if (term.search !== '') {
        w.setSearch(term.search);
    }
    if (term.limit !== 0) {
        w.setLimit(term.limit);
    }
    if (term.order !== 0) {
        w.setOrder(term.order);
    }
    for (const raw of term.preserved ?? [])
        w.appendRaw(raw);
    const writer = new 协议写入器();
    writer.写入原始字节(w.toBytes());
    return writer;
}
function decode搜索条件(bytes: Uint8Array): 搜索条件 {
    const m = new DecksDeckFilteredSearchTerm(bytes);
    const out: 搜索条件 = { search: m.getSearch(), limit: m.getLimit(), order: m.getOrder() };
    const preserved = m.preserved();
    if (preserved.length > 0)
        out.preserved = preserved;
    return out;
}
function encode过滤牌组配置(config: 过滤牌组配置): 协议写入器 {
    const w = new DecksDeckFiltered();
    if (config.reschedule) {
        w.setReschedule(true);
    }
    for (let i = 0; i < config.searchTerms.length; i++) {
        w.setSearchTermsWriter([encode搜索条件(config.searchTerms[i])]);
    }
    if (config.previewDelay !== 0) {
        w.setPreviewDelay(config.previewDelay);
    }
    if (config.previewHardSecs !== 0) {
        w.setPreviewHardSecs(config.previewHardSecs);
    }
    if (config.previewGoodSecs !== 0) {
        w.setPreviewGoodSecs(config.previewGoodSecs);
    }
    if (config.previewAgainSecs !== 0) {
        w.setPreviewAgainSecs(config.previewAgainSecs);
    }
    for (const raw of config.preserved ?? [])
        w.appendRaw(raw);
    const writer = new 协议写入器();
    writer.写入原始字节(w.toBytes());
    return writer;
}
function decode过滤牌组配置(bytes: Uint8Array): 过滤牌组配置 {
    const m = new DecksDeckFiltered(bytes);
    const out: 过滤牌组配置 = { reschedule: m.getReschedule(), searchTerms: m.getSearchTerms().map((raw: Uint8Array): 搜索条件 => decode搜索条件(raw)), previewDelay: m.getPreviewDelay(), previewAgainSecs: m.getPreviewAgainSecs(), previewHardSecs: m.getPreviewHardSecs(), previewGoodSecs: m.getPreviewGoodSecs() };
    const preserved = m.unknown([DecksDeckFiltered.FIELD_reschedule, DecksDeckFiltered.FIELD_searchTerms, DecksDeckFiltered.FIELD_previewDelay, DecksDeckFiltered.FIELD_previewAgainSecs, DecksDeckFiltered.FIELD_previewHardSecs, DecksDeckFiltered.FIELD_previewGoodSecs]);
    if (preserved.length > 0)
        out.preserved = preserved;
    return out;
}
export function encode过滤牌组更新(deck: 过滤牌组更新): Uint8Array {
    const w = new DecksFilteredDeckForUpdate();
    if (deck.id !== 0) {
        w.setId(deck.id);
    }
    if (deck.name !== '') {
        w.setName(deck.name);
    }
    w.setConfigWriter(encode过滤牌组配置(deck.config));
    if (deck.allowEmpty) {
        w.setAllowEmpty(true);
    }
    for (const raw of deck.preserved ?? [])
        w.appendRaw(raw);
    return w.转为字节();
}
export function decode过滤牌组更新(bytes: Uint8Array): 过滤牌组更新 {
    const m = new DecksFilteredDeckForUpdate(bytes);
    const out: 过滤牌组更新 = { id: m.getId(), name: m.getName(), config: decode过滤牌组配置(m.getConfigLast() ?? new Uint8Array(0)), allowEmpty: m.getAllowEmpty() };
    const preserved = m.preserved();
    if (preserved.length > 0)
        out.preserved = preserved;
    return out;
}
