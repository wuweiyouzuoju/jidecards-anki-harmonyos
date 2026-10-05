// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID PROTO-MSG-DECK-001
// @名称 牌组消息编解码
//
// @作用
// 编解码 anki.decks.proto 消息（Anki 26.05）：
// - Deck / DeckCommon / DeckNormal：牌组完整视图（含学习统计 + 配置限制）
// - DeckTreeNode：主页计数树（递归结构，含 new/review/learn 计数）
// - DeckNames / DeckId / DeckIds / RenameDeckRequest：牌组名称与ID 相关请求
// 字段来源：third_party/anki/proto/anki/decks.proto
//
// @输入
// 编码：Deck 结构 / now 时间戳 / (skipEmptyDefault, includeFiltered) 等
// 解码：字节流
//
// @输出
// 编码：Uint8Array 字节
// 解码：Deck / DeckTreeNode / DeckNameId[]
//
// @业务规则
// proto3 optional 字段用 null 表示「未设置」；编码时跳过默认值，与 prost 对齐。
// DeckCommon.other（field 255）原样往返保留 backend 自定义字节。
// DeckTreeNode.children 递归解码，深度由后端控制。
// kind=7（Filtered 牌组）新建流程不会产生，解码时跳过。
//
// @副作用
// 无
// ========================================================

import { 协议读取器 } from '../core/ProtoReader';
import { 协议写入器 } from '../core/ProtoWriter';

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
  /** 保留字节（field 255），原样往返 */
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

/** 仅覆盖普通牌组；NewDeck 模板与新建流程不会遇到 Filtered */
export interface Deck {
  id: number;
  name: string;
  mtimeSecs: number;
  usn: number;
  common: DeckCommon | null;
  normal: DeckNormal | null;
}

function encodeDayLimit(value: DeckDayLimit): 协议写入器 {
  const w = new 协议写入器();
  if (value.limit !== 0) {
    w.写入变长整数(1, value.limit);
  }
  if (value.today !== 0) {
    w.写入变长整数(2, value.today);
  }
  return w;
}

function decodeDayLimit(bytes: Uint8Array): DeckDayLimit {
  const r = new 协议读取器(bytes);
  const out: DeckDayLimit = { limit: 0, today: 0 };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    if (tag.字段号 === 1) {
      out.limit = r.读取变长整数();
    } else if (tag.字段号 === 2) {
      out.today = r.读取变长整数();
    } else {
      r.跳过字段(tag.线类型);
    }
  }
  return out;
}

function encodeCommon(value: DeckCommon): 协议写入器 {
  const w = new 协议写入器();
  if (value.studyCollapsed) {
    w.写入布尔(1, true);
  }
  if (value.browserCollapsed) {
    w.写入布尔(2, true);
  }
  if (value.lastDayStudied !== 0) {
    w.写入变长整数(3, value.lastDayStudied);
  }
  if (value.newStudied !== 0) {
    w.写入变长整数(4, value.newStudied);
  }
  if (value.learningStudied !== 0) {
    w.写入变长整数(6, value.learningStudied);
  }
  if (value.millisecondsStudied !== 0) {
    w.写入变长整数(7, value.millisecondsStudied);
  }
  if (value.other !== null && value.other.length > 0) {
    w.写入字节(255, value.other);
  }
  return w;
}

function decodeCommon(bytes: Uint8Array): DeckCommon {
  const r = new 协议读取器(bytes);
  const out: DeckCommon = {
    studyCollapsed: false,
    browserCollapsed: false,
    lastDayStudied: 0,
    newStudied: 0,
    learningStudied: 0,
    millisecondsStudied: 0,
    other: null
  };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        out.studyCollapsed = r.读取布尔();
        break;
      case 2:
        out.browserCollapsed = r.读取布尔();
        break;
      case 3:
        out.lastDayStudied = r.读取变长整数();
        break;
      case 4:
        out.newStudied = r.读取32位整数();
        break;
      case 6:
        out.learningStudied = r.读取32位整数();
        break;
      case 7:
        out.millisecondsStudied = r.读取32位整数();
        break;
      case 255:
        out.other = r.读取字节();
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

function encodeNormal(value: DeckNormal): 协议写入器 {
  const w = new 协议写入器();
  if (value.configId !== 0) {
    w.写入64位整数(1, value.configId);
  }
  if (value.extendNew !== 0) {
    w.写入变长整数(2, value.extendNew);
  }
  if (value.extendReview !== 0) {
    w.写入变长整数(3, value.extendReview);
  }
  if (value.description !== '') {
    w.写入字符串(4, value.description);
  }
  if (value.markdownDescription) {
    w.写入布尔(5, true);
  }
  if (value.reviewLimit !== null) {
    w.写入变长整数(6, value.reviewLimit);
  }
  if (value.newLimit !== null) {
    w.写入变长整数(7, value.newLimit);
  }
  if (value.reviewLimitToday !== null) {
    w.写入子消息(8, encodeDayLimit(value.reviewLimitToday));
  }
  if (value.newLimitToday !== null) {
    w.写入子消息(9, encodeDayLimit(value.newLimitToday));
  }
  if (value.desiredRetention !== null) {
    w.写入浮点(10, value.desiredRetention);
  }
  return w;
}

function decodeNormal(bytes: Uint8Array): DeckNormal {
  const r = new 协议读取器(bytes);
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
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        out.configId = r.读取64位整数();
        break;
      case 2:
        out.extendNew = r.读取变长整数();
        break;
      case 3:
        out.extendReview = r.读取变长整数();
        break;
      case 4:
        out.description = r.读取字符串();
        break;
      case 5:
        out.markdownDescription = r.读取布尔();
        break;
      case 6:
        out.reviewLimit = r.读取变长整数();
        break;
      case 7:
        out.newLimit = r.读取变长整数();
        break;
      case 8:
        out.reviewLimitToday = decodeDayLimit(r.读取字节());
        break;
      case 9:
        out.newLimitToday = decodeDayLimit(r.读取字节());
        break;
      case 10:
        out.desiredRetention = r.读取浮点();
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

export function encodeDeck(deck: Deck): Uint8Array {
  const w = new 协议写入器();
  if (deck.id !== 0) {
    w.写入64位整数(1, deck.id);
  }
  if (deck.name !== '') {
    w.写入字符串(2, deck.name);
  }
  if (deck.mtimeSecs !== 0) {
    w.写入64位整数(3, deck.mtimeSecs);
  }
  if (deck.usn !== 0) {
    w.写入变长整数(4, deck.usn);
  }
  if (deck.common !== null) {
    w.写入子消息(5, encodeCommon(deck.common));
  }
  if (deck.normal !== null) {
    w.写入子消息(6, encodeNormal(deck.normal));
  }
  return w.转为字节();
}

/** ReparentDecksRequest：field 1 repeated int64 deck_ids，field 2 int64 new_parent（0=顶级）。 */
export function encodeReparentDecksRequest(deckIds: number[], parentId: number): Uint8Array {
  const w = new 协议写入器();
  for (const id of deckIds) w.写入64位整数(1, id);
  if (parentId !== 0) w.写入64位整数(2, parentId);
  return w.转为字节();
}

/** RenameDeckRequest：field 1 int64 deck_id，field 2 string new_name；Core 级联子牌组。 */
export function encodeRenameDeckRequest(deckId: number, newName: string): Uint8Array {
  const w = new 协议写入器();
  if (deckId !== 0) {
    w.写入64位整数(1, deckId);
  }
  if (newName !== '') {
    w.写入字符串(2, newName);
  }
  return w.转为字节();
}

export function decodeDeck(bytes: Uint8Array): Deck {
  const r = new 协议读取器(bytes);
  const deck: Deck = { id: 0, name: '', mtimeSecs: 0, usn: 0, common: null, normal: null };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        deck.id = r.读取64位整数();
        break;
      case 2:
        deck.name = r.读取字符串();
        break;
      case 3:
        deck.mtimeSecs = r.读取64位整数();
        break;
      case 4:
        deck.usn = r.读取32位整数();
        break;
      case 5:
        deck.common = decodeCommon(r.读取字节());
        break;
      case 6:
        deck.normal = decodeNormal(r.读取字节());
        break;
      default:
        // kind=7 Filtered 等不处理：新建流程不会产生
        r.跳过字段(tag.线类型);
    }
  }
  return deck;
}

export function encodeDeckTreeRequest(now: number): Uint8Array {
  const w = new 协议写入器();
  if (now !== 0) {
    w.写入64位整数(1, now);
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
  const r = new 协议读取器(bytes);
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
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        node.deckId = r.读取64位整数();
        break;
      case 2:
        node.name = r.读取字符串();
        break;
      case 3:
        node.children.push(decodeDeckTreeNode(r.读取字节()));
        break;
      case 4:
        node.level = r.读取变长整数();
        break;
      case 5:
        node.collapsed = r.读取布尔();
        break;
      case 6:
        node.reviewCount = r.读取变长整数();
        break;
      case 7:
        node.learnCount = r.读取变长整数();
        break;
      case 8:
        node.newCount = r.读取变长整数();
        break;
      case 13:
        node.totalInDeck = r.读取变长整数();
        break;
      case 14:
        node.totalIncludingChildren = r.读取变长整数();
        break;
      case 16:
        node.filtered = r.读取布尔();
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return node;
}

export function encodeGetDeckNamesRequest(skipEmptyDefault: boolean, includeFiltered: boolean): Uint8Array {
  const w = new 协议写入器();
  if (skipEmptyDefault) {
    w.写入布尔(1, true);
  }
  if (includeFiltered) {
    w.写入布尔(2, true);
  }
  return w.转为字节();
}

/** decks.DeckId：SetCurrentDeck 等的入参（字段来源：decks.proto 第 46 行） */
export function encodeDeckId(deckId: number): Uint8Array {
  const w = new 协议写入器();
  if (deckId !== 0) {
    w.写入64位整数(1, deckId);
  }
  return w.转为字节();
}

/**
 * 编码 DeckIds（decks.proto 第 50-52 行）：
 * - field 1: repeated int64 dids（packed 或非 packed 均可，后端兼容）
 * RemoveDecks RPC 的入参；后端 remove_decks_and_child_decks 会递归删除所有子牌组。
 */
export function encodeDeckIds(deckIds: number[]): Uint8Array {
  const w = new 协议写入器();
  for (let i = 0; i < deckIds.length; i++) {
    w.写入64位整数(1, deckIds[i]);
  }
  return w.转为字节();
}

export interface DeckNameId {
  id: number;
  name: string;
}

export function decodeDeckNames(bytes: Uint8Array): DeckNameId[] {
  const r = new 协议读取器(bytes);
  const entries: DeckNameId[] = [];
  let tag;
  while ((tag = r.读取标签()) !== null) {
    if (tag.字段号 === 1) {
      entries.push(decodeDeckNameId(r.读取字节()));
    } else {
      r.跳过字段(tag.线类型);
    }
  }
  return entries;
}

function decodeDeckNameId(bytes: Uint8Array): DeckNameId {
  const r = new 协议读取器(bytes);
  const entry: DeckNameId = { id: 0, name: '' };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    if (tag.字段号 === 1) {
      entry.id = r.读取64位整数();
    } else if (tag.字段号 === 2) {
      entry.name = r.读取字符串();
    } else {
      r.跳过字段(tag.线类型);
    }
  }
  return entry;
}

// ========================================================
// Filtered Deck（过滤牌组）相关编解码
// 来源：proto/anki/decks.proto
// ========================================================

/** FilteredDeck.SearchTerm.Order 枚举值 */
export const 过滤牌组排序 = {
  最旧复习优先: 0,
  随机: 1,
  间隔升序: 2,
  间隔降序: 3,
  遗忘次数: 4,
  添加顺序: 5,
  到期日: 6,
  逆添加顺序: 7,
  可回忆率升序: 8,
  可回忆率降序: 9,
  相对逾期程度: 10
} as const;

export interface 搜索条件 {
  search: string;
  limit: number;
  order: number;
}

export interface 过滤牌组配置 {
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
}

function encode搜索条件(term: 搜索条件): 协议写入器 {
  const w = new 协议写入器();
  if (term.search !== '') {
    w.写入字符串(1, term.search);
  }
  if (term.limit !== 0) {
    w.写入变长整数(2, term.limit);
  }
  if (term.order !== 0) {
    w.写入变长整数(3, term.order);
  }
  return w;
}

function decode搜索条件(bytes: Uint8Array): 搜索条件 {
  const r = new 协议读取器(bytes);
  const out: 搜索条件 = { search: '', limit: 0, order: 0 };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        out.search = r.读取字符串();
        break;
      case 2:
        out.limit = r.读取变长整数();
        break;
      case 3:
        out.order = r.读取变长整数();
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

function encode过滤牌组配置(config: 过滤牌组配置): 协议写入器 {
  const w = new 协议写入器();
  if (config.reschedule) {
    w.写入布尔(1, true);
  }
  for (let i = 0; i < config.searchTerms.length; i++) {
    w.写入子消息(2, encode搜索条件(config.searchTerms[i]));
  }
  // field 3 delays 是 v1 scheduler 专用，v3 不编码
  if (config.previewDelay !== 0) {
    w.写入变长整数(4, config.previewDelay);
  }
  if (config.previewHardSecs !== 0) {
    w.写入变长整数(5, config.previewHardSecs);
  }
  if (config.previewGoodSecs !== 0) {
    w.写入变长整数(6, config.previewGoodSecs);
  }
  if (config.previewAgainSecs !== 0) {
    w.写入变长整数(7, config.previewAgainSecs);
  }
  return w;
}

function decode过滤牌组配置(bytes: Uint8Array): 过滤牌组配置 {
  const r = new 协议读取器(bytes);
  const out: 过滤牌组配置 = {
    reschedule: false,
    searchTerms: [],
    previewDelay: 0,
    previewAgainSecs: 0,
    previewHardSecs: 0,
    previewGoodSecs: 0
  };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        out.reschedule = r.读取布尔();
        break;
      case 2:
        out.searchTerms.push(decode搜索条件(r.读取字节()));
        break;
      case 3:
        // delays (v1 only) - 跳过
        r.跳过字段(tag.线类型);
        break;
      case 4:
        out.previewDelay = r.读取变长整数();
        break;
      case 5:
        out.previewHardSecs = r.读取变长整数();
        break;
      case 6:
        out.previewGoodSecs = r.读取变长整数();
        break;
      case 7:
        out.previewAgainSecs = r.读取变长整数();
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

/** 编码 FilteredDeckForUpdate（AddOrUpdateFilteredDeck 入参） */
export function encode过滤牌组更新(deck: 过滤牌组更新): Uint8Array {
  const w = new 协议写入器();
  if (deck.id !== 0) {
    w.写入64位整数(1, deck.id);
  }
  if (deck.name !== '') {
    w.写入字符串(2, deck.name);
  }
  w.写入子消息(3, encode过滤牌组配置(deck.config));
  if (deck.allowEmpty) {
    w.写入布尔(4, true);
  }
  return w.转为字节();
}

/** 解码 FilteredDeckForUpdate（GetOrCreateFilteredDeck 出参） */
export function decode过滤牌组更新(bytes: Uint8Array): 过滤牌组更新 {
  const r = new 协议读取器(bytes);
  const out: 过滤牌组更新 = {
    id: 0,
    name: '',
    config: {
      reschedule: false,
      searchTerms: [],
      previewDelay: 0,
      previewAgainSecs: 0,
      previewHardSecs: 0,
      previewGoodSecs: 0
    },
    allowEmpty: false
  };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        out.id = r.读取64位整数();
        break;
      case 2:
        out.name = r.读取字符串();
        break;
      case 3:
        out.config = decode过滤牌组配置(r.读取字节());
        break;
      case 4:
        out.allowEmpty = r.读取布尔();
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}
