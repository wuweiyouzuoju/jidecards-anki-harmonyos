// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID PROTO-MSG-SEARCH-001
// @名称 搜索消息编解码
//
// @作用
// 编解码 anki.search.proto 消息（Anki 26.05），服务于「浏览卡片」功能：
// - SearchNode：搜索条件树（oneof filter + 嵌套 Group/Dupe/Rated/IdList/Field）
// - SearchRequest / SearchResponse：搜索卡片/笔记的请求与 ID 列表返回
// - SortOrder：搜索结果排序（none / custom / builtin）
// - JoinSearchNodesRequest / ReplaceSearchNodeRequest：搜索节点组合
// - FindAndReplaceRequest：查找替换
// - BrowserColumns / BrowserRow：浏览器列定义与行数据
// 字段来源：third_party/anki/proto/anki/search.proto
//
// @输入
// 编码：SearchNode / SearchRequest / FindAndReplaceRequest / SearchNode[] / 列ID列表 等
// 解码：字节流
//
// @输出
// 编码：Uint8Array 字节
// 解码：number[]（卡片/笔记 ID）/ BrowserColumns / BrowserRow / string（搜索串）等
//
// @业务规则
// proto3 默认值跳过编码（与 prost 对齐）。
// SearchNode.filter 是 oneof：编码时只写 kind 对应的字段；解码时按 field 号设置 kind。
// BrowserColumns/BrowserRow 的枚举值与 anki.search.proto 一致。
// generic.Empty/String/Int64/StringList 内联实现（项目惯例，参考 SyncMessages.ts）。
//
// @副作用
// 无
// ========================================================

import { 协议读取器 } from '../core/ProtoReader';
import { 协议写入器, 线类型_长度分隔 } from '../core/ProtoWriter';

// ---- 枚举（与 anki.search.proto 一致） ----

export enum SearchNodeFlag {
  FLAG_NONE = 0,
  FLAG_ANY = 1,
  FLAG_RED = 2,
  FLAG_ORANGE = 3,
  FLAG_GREEN = 4,
  FLAG_BLUE = 5,
  FLAG_PINK = 6,
  FLAG_TURQUOISE = 7,
  FLAG_PURPLE = 8
}

export enum SearchNodeRating {
  RATING_ANY = 0,
  RATING_AGAIN = 1,
  RATING_HARD = 2,
  RATING_GOOD = 3,
  RATING_EASY = 4,
  RATING_BY_RESCHEDULE = 5
}

export enum SearchNodeCardState {
  CARD_STATE_NEW = 0,
  CARD_STATE_LEARN = 1,
  CARD_STATE_REVIEW = 2,
  CARD_STATE_DUE = 3,
  CARD_STATE_SUSPENDED = 4,
  CARD_STATE_BURIED = 5
}

export enum SearchNodeJoiner {
  AND = 0,
  OR = 1
}

export enum SearchNodeFieldSearchMode {
  FIELD_SEARCH_MODE_NORMAL = 0,
  FIELD_SEARCH_MODE_REGEX = 1,
  FIELD_SEARCH_MODE_NOCOMBINING = 2
}

export enum BrowserColumnSorting {
  SORTING_NONE = 0,
  SORTING_ASCENDING = 1,
  SORTING_DESCENDING = 2
}

export enum BrowserColumnAlignment {
  ALIGNMENT_START = 0,
  ALIGNMENT_CENTER = 1
}

export enum BrowserCellTextElideMode {
  ELIDE_LEFT = 0,
  ELIDE_RIGHT = 1,
  ELIDE_MIDDLE = 2,
  ELIDE_NONE = 3
}

export enum BrowserRowColor {
  COLOR_DEFAULT = 0,
  COLOR_MARKED = 1,
  COLOR_SUSPENDED = 2,
  COLOR_FLAG_RED = 3,
  COLOR_FLAG_ORANGE = 4,
  COLOR_FLAG_GREEN = 5,
  COLOR_FLAG_BLUE = 6,
  COLOR_FLAG_PINK = 7,
  COLOR_FLAG_TURQUOISE = 8,
  COLOR_FLAG_PURPLE = 9,
  COLOR_BURIED = 10
}

// ---- SearchNode 嵌套消息接口 ----

export interface SearchNodeDupe {
  notetypeId: number;
  firstField: string;
}

export interface SearchNodeRated {
  days: number;
  rating: SearchNodeRating;
}

export interface SearchNodeIdList {
  ids: number[];
}

export interface SearchNodeGroup {
  nodes: SearchNode[];
  joiner: SearchNodeJoiner;
}

export interface SearchNodeField {
  fieldName: string;
  text: string;
  mode: SearchNodeFieldSearchMode;
}

// ---- SearchNode（oneof filter 用 kind discriminant，ArkTS 友好） ----

export type SearchNodeFilterKind =
  | 'group'
  | 'negated'
  | 'parsable_text'
  | 'template'
  | 'nid'
  | 'dupe'
  | 'field_name'
  | 'rated'
  | 'added_in_days'
  | 'due_in_days'
  | 'flag'
  | 'card_state'
  | 'nids'
  | 'edited_in_days'
  | 'deck'
  | 'due_on_day'
  | 'tag'
  | 'note'
  | 'introduced_in_days'
  | 'field'
  | 'literal_text';

export interface SearchNode {
  kind: SearchNodeFilterKind;
  group?: SearchNodeGroup;
  negated?: SearchNode;
  text?: string;
  template?: number;
  nid?: number;
  dupe?: SearchNodeDupe;
  fieldName?: string;
  rated?: SearchNodeRated;
  days?: number;
  flag?: SearchNodeFlag;
  cardState?: SearchNodeCardState;
  nids?: number[];
  day?: number;
  deck?: string;
  tag?: string;
  note?: string;
  field?: SearchNodeField;
}

// ---- SortOrder（oneof value） ----

export type SortOrderKind = 'none' | 'custom' | 'builtin';

export interface SortOrder {
  kind: SortOrderKind;
  custom?: string;
  column?: string;
  reverse?: boolean;
}

// ---- 顶层消息接口 ----

export interface SearchRequest {
  search: string;
  order: SortOrder;
}

export interface JoinSearchNodesRequest {
  joiner: SearchNodeJoiner;
  existingNode: SearchNode;
  additionalNode: SearchNode;
}

export interface ReplaceSearchNodeRequest {
  existingNode: SearchNode;
  replacementNode: SearchNode;
}

export interface FindAndReplaceRequest {
  nids: number[];
  search: string;
  replacement: string;
  regex: boolean;
  matchCase: boolean;
  fieldName: string;
}

export interface BrowserColumn {
  key: string;
  cardsModeLabel: string;
  notesModeLabel: string;
  sortingCards: BrowserColumnSorting;
  sortingNotes: BrowserColumnSorting;
  usesCellFont: boolean;
  alignment: BrowserColumnAlignment;
  cardsModeTooltip: string;
  notesModeTooltip: string;
}

export interface BrowserColumns {
  columns: BrowserColumn[];
}

export interface BrowserCell {
  text: string;
  isRtl: boolean;
  elideMode: BrowserCellTextElideMode;
}

export interface BrowserRow {
  cells: BrowserCell[];
  color: BrowserRowColor;
  fontName: string;
  fontSize: number;
}

// ---- 便捷构造函数（UI 常用，避免散落的字面量） ----

/** 从搜索串构造 SearchNode（最常用，MVP 唯一使用路径） */
export function makeParsableTextNode(text: string): SearchNode {
  return { kind: 'parsable_text', text };
}

/** 从 deck:xxx 构造 SearchNode */
export function makeDeckNode(deck: string): SearchNode {
  return { kind: 'deck', deck };
}

/** 从 tag:xxx 构造 SearchNode */
export function makeTagNode(tag: string): SearchNode {
  return { kind: 'tag', tag };
}

/** 从 is:new/is:due 等构造 SearchNode */
export function makeCardStateNode(state: SearchNodeCardState): SearchNode {
  return { kind: 'card_state', cardState: state };
}

// ---- 嵌套消息编解码 ----

function encodeDupe(value: SearchNodeDupe): 协议写入器 {
  const w = new 协议写入器();
  if (value.notetypeId !== 0) {
    w.写入64位整数(1, value.notetypeId);
  }
  if (value.firstField !== '') {
    w.写入字符串(2, value.firstField);
  }
  return w;
}

function decodeDupe(bytes: Uint8Array): SearchNodeDupe {
  const r = new 协议读取器(bytes);
  const out: SearchNodeDupe = { notetypeId: 0, firstField: '' };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        out.notetypeId = r.读取64位整数();
        break;
      case 2:
        out.firstField = r.读取字符串();
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

function encodeRated(value: SearchNodeRated): 协议写入器 {
  const w = new 协议写入器();
  if (value.days !== 0) {
    w.写入变长整数(1, value.days);
  }
  if (value.rating !== SearchNodeRating.RATING_ANY) {
    w.写入变长整数(2, value.rating);
  }
  return w;
}

function decodeRated(bytes: Uint8Array): SearchNodeRated {
  const r = new 协议读取器(bytes);
  const out: SearchNodeRated = { days: 0, rating: SearchNodeRating.RATING_ANY };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        out.days = r.读取变长整数();
        break;
      case 2:
        out.rating = r.读取变长整数() as SearchNodeRating;
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

function encodeIdList(value: SearchNodeIdList): 协议写入器 {
  const w = new 协议写入器();
  if (value.ids.length > 0) {
    w.写入打包64位整数(1, value.ids);
  }
  return w;
}

function decodeIdList(bytes: Uint8Array): SearchNodeIdList {
  const r = new 协议读取器(bytes);
  const ids: number[] = [];
  let tag;
  while ((tag = r.读取标签()) !== null) {
    if (tag.字段号 === 1) {
      if (tag.线类型 === 线类型_长度分隔) {
        ids.push(...r.读取打包64位整数());
      } else {
        ids.push(r.读取64位整数());
      }
    } else {
      r.跳过字段(tag.线类型);
    }
  }
  return { ids };
}

function encodeGroup(value: SearchNodeGroup): 协议写入器 {
  const w = new 协议写入器();
  for (const node of value.nodes) {
    w.写入子消息(1, encodeSearchNode(node));
  }
  if (value.joiner !== SearchNodeJoiner.AND) {
    w.写入变长整数(2, value.joiner);
  }
  return w;
}

function decodeGroup(bytes: Uint8Array): SearchNodeGroup {
  const r = new 协议读取器(bytes);
  const nodes: SearchNode[] = [];
  let joiner: SearchNodeJoiner = SearchNodeJoiner.AND;
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        nodes.push(decodeSearchNode(r.读取字节()));
        break;
      case 2:
        joiner = r.读取变长整数() as SearchNodeJoiner;
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return { nodes, joiner };
}

function encodeField(value: SearchNodeField): 协议写入器 {
  const w = new 协议写入器();
  if (value.fieldName !== '') {
    w.写入字符串(1, value.fieldName);
  }
  if (value.text !== '') {
    w.写入字符串(2, value.text);
  }
  if (value.mode !== SearchNodeFieldSearchMode.FIELD_SEARCH_MODE_NORMAL) {
    w.写入变长整数(3, value.mode);
  }
  return w;
}

function decodeField(bytes: Uint8Array): SearchNodeField {
  const r = new 协议读取器(bytes);
  const out: SearchNodeField = {
    fieldName: '',
    text: '',
    mode: SearchNodeFieldSearchMode.FIELD_SEARCH_MODE_NORMAL
  };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        out.fieldName = r.读取字符串();
        break;
      case 2:
        out.text = r.读取字符串();
        break;
      case 3:
        out.mode = r.读取变长整数() as SearchNodeFieldSearchMode;
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

// ---- SearchNode 编解码（核心，oneof filter 按 kind 分支） ----

export function encodeSearchNode(node: SearchNode): 协议写入器 {
  const w = new 协议写入器();
  switch (node.kind) {
    case 'group':
      if (node.group) {
        w.写入子消息(1, encodeGroup(node.group));
      }
      break;
    case 'negated':
      if (node.negated) {
        w.写入子消息(2, encodeSearchNode(node.negated));
      }
      break;
    case 'parsable_text':
      if (node.text !== undefined && node.text !== '') {
        w.写入字符串(3, node.text);
      }
      break;
    case 'template':
      if (node.template !== undefined && node.template !== 0) {
        w.写入变长整数(4, node.template);
      }
      break;
    case 'nid':
      if (node.nid !== undefined && node.nid !== 0) {
        w.写入64位整数(5, node.nid);
      }
      break;
    case 'dupe':
      if (node.dupe) {
        w.写入子消息(6, encodeDupe(node.dupe));
      }
      break;
    case 'field_name':
      if (node.fieldName !== undefined && node.fieldName !== '') {
        w.写入字符串(7, node.fieldName);
      }
      break;
    case 'rated':
      if (node.rated) {
        w.写入子消息(8, encodeRated(node.rated));
      }
      break;
    case 'added_in_days':
      if (node.days !== undefined && node.days !== 0) {
        w.写入变长整数(9, node.days);
      }
      break;
    case 'due_in_days':
      if (node.days !== undefined && node.days !== 0) {
        w.写入变长整数(10, node.days);
      }
      break;
    case 'flag':
      if (node.flag !== undefined) {
        w.写入变长整数(11, node.flag);
      }
      break;
    case 'card_state':
      if (node.cardState !== undefined && node.cardState !== SearchNodeCardState.CARD_STATE_NEW) {
        w.写入变长整数(12, node.cardState);
      }
      break;
    case 'nids':
      if (node.nids) {
        w.写入子消息(13, encodeIdList({ ids: node.nids }));
      }
      break;
    case 'edited_in_days':
      if (node.days !== undefined && node.days !== 0) {
        w.写入变长整数(14, node.days);
      }
      break;
    case 'deck':
      if (node.deck !== undefined && node.deck !== '') {
        w.写入字符串(15, node.deck);
      }
      break;
    case 'due_on_day':
      if (node.day !== undefined && node.day !== 0) {
        w.写入变长整数(16, node.day);
      }
      break;
    case 'tag':
      if (node.tag !== undefined && node.tag !== '') {
        w.写入字符串(17, node.tag);
      }
      break;
    case 'note':
      if (node.note !== undefined && node.note !== '') {
        w.写入字符串(18, node.note);
      }
      break;
    case 'introduced_in_days':
      if (node.days !== undefined && node.days !== 0) {
        w.写入变长整数(19, node.days);
      }
      break;
    case 'field':
      if (node.field) {
        w.写入子消息(20, encodeField(node.field));
      }
      break;
    case 'literal_text':
      if (node.text !== undefined && node.text !== '') {
        w.写入字符串(21, node.text);
      }
      break;
  }
  return w;
}

export function decodeSearchNode(bytes: Uint8Array): SearchNode {
  const r = new 协议读取器(bytes);
  // 默认 parsable_text + 空串（解码到未设置字段时返回此值）
  const node: SearchNode = { kind: 'parsable_text', text: '' };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        node.kind = 'group';
        node.group = decodeGroup(r.读取字节());
        break;
      case 2:
        node.kind = 'negated';
        node.negated = decodeSearchNode(r.读取字节());
        break;
      case 3:
        node.kind = 'parsable_text';
        node.text = r.读取字符串();
        break;
      case 4:
        node.kind = 'template';
        node.template = r.读取变长整数();
        break;
      case 5:
        node.kind = 'nid';
        node.nid = r.读取64位整数();
        break;
      case 6:
        node.kind = 'dupe';
        node.dupe = decodeDupe(r.读取字节());
        break;
      case 7:
        node.kind = 'field_name';
        node.fieldName = r.读取字符串();
        break;
      case 8:
        node.kind = 'rated';
        node.rated = decodeRated(r.读取字节());
        break;
      case 9:
        node.kind = 'added_in_days';
        node.days = r.读取变长整数();
        break;
      case 10:
        node.kind = 'due_in_days';
        node.days = r.读取32位整数();
        break;
      case 11:
        node.kind = 'flag';
        node.flag = r.读取变长整数() as SearchNodeFlag;
        break;
      case 12:
        node.kind = 'card_state';
        node.cardState = r.读取变长整数() as SearchNodeCardState;
        break;
      case 13:
        node.kind = 'nids';
        node.nids = decodeIdList(r.读取字节()).ids;
        break;
      case 14:
        node.kind = 'edited_in_days';
        node.days = r.读取变长整数();
        break;
      case 15:
        node.kind = 'deck';
        node.deck = r.读取字符串();
        break;
      case 16:
        node.kind = 'due_on_day';
        node.day = r.读取32位整数();
        break;
      case 17:
        node.kind = 'tag';
        node.tag = r.读取字符串();
        break;
      case 18:
        node.kind = 'note';
        node.note = r.读取字符串();
        break;
      case 19:
        node.kind = 'introduced_in_days';
        node.days = r.读取变长整数();
        break;
      case 20:
        node.kind = 'field';
        node.field = decodeField(r.读取字节());
        break;
      case 21:
        node.kind = 'literal_text';
        node.text = r.读取字符串();
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return node;
}

// ---- SortOrder 编解码（oneof value） ----

function encodeSortOrder(order: SortOrder): 协议写入器 {
  const w = new 协议写入器();
  switch (order.kind) {
    case 'none':
      // generic.Empty：空子消息
      w.写入子消息(1, new 协议写入器());
      break;
    case 'custom':
      if (order.custom !== undefined && order.custom !== '') {
        w.写入字符串(2, order.custom);
      }
      break;
    case 'builtin':
      if (order.column !== undefined || order.reverse !== undefined) {
        const inner = new 协议写入器();
        if (order.column !== undefined && order.column !== '') {
          inner.写入字符串(1, order.column);
        }
        if (order.reverse) {
          inner.写入布尔(2, true);
        }
        w.写入子消息(3, inner);
      }
      break;
  }
  return w;
}

function decodeSortOrder(bytes: Uint8Array): SortOrder {
  const r = new 协议读取器(bytes);
  const order: SortOrder = { kind: 'none' };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        // generic.Empty 子消息
        r.读取字节();
        order.kind = 'none';
        break;
      case 2:
        order.kind = 'custom';
        order.custom = r.读取字符串();
        break;
      case 3: {
        order.kind = 'builtin';
        const inner = new 协议读取器(r.读取字节());
        let innerTag;
        while ((innerTag = inner.读取标签()) !== null) {
          switch (innerTag.字段号) {
            case 1:
              order.column = inner.读取字符串();
              break;
            case 2:
              order.reverse = inner.读取布尔();
              break;
            default:
              inner.跳过字段(innerTag.线类型);
          }
        }
        break;
      }
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return order;
}

// ---- SearchRequest / SearchResponse ----

export function encodeSearchRequest(req: SearchRequest): Uint8Array {
  const w = new 协议写入器();
  if (req.search !== '') {
    w.写入字符串(1, req.search);
  }
  // SortOrder 是 oneof 字段，只有非 none 时编码（none 是默认值，prost 不编码）
  if (req.order.kind !== 'none') {
    w.写入子消息(2, encodeSortOrder(req.order));
  }
  return w.转为字节();
}

export function decodeSearchResponse(bytes: Uint8Array): number[] {
  const r = new 协议读取器(bytes);
  const ids: number[] = [];
  let tag;
  while ((tag = r.读取标签()) !== null) {
    if (tag.字段号 === 1) {
      if (tag.线类型 === 线类型_长度分隔) {
        // packed: wire type 2，载荷是连续 varint（prost 默认编码）
        ids.push(...r.读取打包64位整数());
      } else {
        // 非 packed: wire type 0，单个 varint（向后兼容）
        ids.push(r.读取64位整数());
      }
    } else {
      r.跳过字段(tag.线类型);
    }
  }
  return ids;
}

// ---- JoinSearchNodesRequest / ReplaceSearchNodeRequest ----

export function encodeJoinSearchNodesRequest(req: JoinSearchNodesRequest): Uint8Array {
  const w = new 协议写入器();
  if (req.joiner !== SearchNodeJoiner.AND) {
    w.写入变长整数(1, req.joiner);
  }
  w.写入子消息(2, encodeSearchNode(req.existingNode));
  w.写入子消息(3, encodeSearchNode(req.additionalNode));
  return w.转为字节();
}

export function encodeReplaceSearchNodeRequest(req: ReplaceSearchNodeRequest): Uint8Array {
  const w = new 协议写入器();
  w.写入子消息(1, encodeSearchNode(req.existingNode));
  w.写入子消息(2, encodeSearchNode(req.replacementNode));
  return w.转为字节();
}

// ---- FindAndReplaceRequest ----

export function encodeFindAndReplaceRequest(req: FindAndReplaceRequest): Uint8Array {
  const w = new 协议写入器();
  if (req.nids.length > 0) {
    w.写入打包64位整数(1, req.nids);
  }
  if (req.search !== '') {
    w.写入字符串(2, req.search);
  }
  if (req.replacement !== '') {
    w.写入字符串(3, req.replacement);
  }
  if (req.regex) {
    w.写入布尔(4, true);
  }
  if (req.matchCase) {
    w.写入布尔(5, true);
  }
  if (req.fieldName !== '') {
    w.写入字符串(6, req.fieldName);
  }
  return w.转为字节();
}

// ---- BrowserColumns / BrowserRow ----

function encodeColumn(col: BrowserColumn): 协议写入器 {
  const w = new 协议写入器();
  if (col.key !== '') {
    w.写入字符串(1, col.key);
  }
  if (col.cardsModeLabel !== '') {
    w.写入字符串(2, col.cardsModeLabel);
  }
  if (col.notesModeLabel !== '') {
    w.写入字符串(3, col.notesModeLabel);
  }
  if (col.sortingCards !== BrowserColumnSorting.SORTING_NONE) {
    w.写入变长整数(4, col.sortingCards);
  }
  if (col.usesCellFont) {
    w.写入布尔(5, true);
  }
  if (col.alignment !== BrowserColumnAlignment.ALIGNMENT_START) {
    w.写入变长整数(6, col.alignment);
  }
  if (col.cardsModeTooltip !== '') {
    w.写入字符串(7, col.cardsModeTooltip);
  }
  if (col.notesModeTooltip !== '') {
    w.写入字符串(8, col.notesModeTooltip);
  }
  if (col.sortingNotes !== BrowserColumnSorting.SORTING_NONE) {
    w.写入变长整数(9, col.sortingNotes);
  }
  return w;
}

function decodeColumn(bytes: Uint8Array): BrowserColumn {
  const r = new 协议读取器(bytes);
  const out: BrowserColumn = {
    key: '',
    cardsModeLabel: '',
    notesModeLabel: '',
    sortingCards: BrowserColumnSorting.SORTING_NONE,
    sortingNotes: BrowserColumnSorting.SORTING_NONE,
    usesCellFont: false,
    alignment: BrowserColumnAlignment.ALIGNMENT_START,
    cardsModeTooltip: '',
    notesModeTooltip: ''
  };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        out.key = r.读取字符串();
        break;
      case 2:
        out.cardsModeLabel = r.读取字符串();
        break;
      case 3:
        out.notesModeLabel = r.读取字符串();
        break;
      case 4:
        out.sortingCards = r.读取变长整数() as BrowserColumnSorting;
        break;
      case 5:
        out.usesCellFont = r.读取布尔();
        break;
      case 6:
        out.alignment = r.读取变长整数() as BrowserColumnAlignment;
        break;
      case 7:
        out.cardsModeTooltip = r.读取字符串();
        break;
      case 8:
        out.notesModeTooltip = r.读取字符串();
        break;
      case 9:
        out.sortingNotes = r.读取变长整数() as BrowserColumnSorting;
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

export function decodeBrowserColumns(bytes: Uint8Array): BrowserColumns {
  const r = new 协议读取器(bytes);
  const columns: BrowserColumn[] = [];
  let tag;
  while ((tag = r.读取标签()) !== null) {
    if (tag.字段号 === 1) {
      columns.push(decodeColumn(r.读取字节()));
    } else {
      r.跳过字段(tag.线类型);
    }
  }
  return { columns };
}

function decodeCell(bytes: Uint8Array): BrowserCell {
  const r = new 协议读取器(bytes);
  const out: BrowserCell = {
    text: '',
    isRtl: false,
    elideMode: BrowserCellTextElideMode.ELIDE_LEFT
  };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        out.text = r.读取字符串();
        break;
      case 2:
        out.isRtl = r.读取布尔();
        break;
      case 3:
        out.elideMode = r.读取变长整数() as BrowserCellTextElideMode;
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

export function decodeBrowserRow(bytes: Uint8Array): BrowserRow {
  const r = new 协议读取器(bytes);
  const cells: BrowserCell[] = [];
  const row: BrowserRow = {
    cells,
    color: BrowserRowColor.COLOR_DEFAULT,
    fontName: '',
    fontSize: 0
  };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        row.cells.push(decodeCell(r.读取字节()));
        break;
      case 2:
        row.color = r.读取变长整数() as BrowserRowColor;
        break;
      case 3:
        row.fontName = r.读取字符串();
        break;
      case 4:
        row.fontSize = r.读取变长整数();
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return row;
}

// ---- 内联 generic 消息（项目惯例，参考 SyncMessages.ts） ----

/** generic.Empty：空请求体（AllBrowserColumns 入参） */
export function encodeEmptyRequest(): Uint8Array {
  return new Uint8Array(0);
}

/** generic.String：仅一个 field 1 string（BuildSearchString 的返回 / SetActiveBrowserColumns 的入参） */
export function decodeStringResponse(bytes: Uint8Array): string {
  const r = new 协议读取器(bytes);
  let value = '';
  let tag;
  while ((tag = r.读取标签()) !== null) {
    if (tag.字段号 === 1) {
      value = r.读取字符串();
    } else {
      r.跳过字段(tag.线类型);
    }
  }
  return value;
}

export function encodeStringListRequest(values: string[]): Uint8Array {
  const w = new 协议写入器();
  for (const v of values) {
    if (v !== '') {
      w.写入字符串(1, v);
    }
  }
  return w.转为字节();
}

/** generic.Int64：仅一个 field 1 int64（BrowserRowForId 入参） */
export function encodeInt64Request(value: number): Uint8Array {
  const w = new 协议写入器();
  if (value !== 0) {
    w.写入64位整数(1, value);
  }
  return w.转为字节();
}
