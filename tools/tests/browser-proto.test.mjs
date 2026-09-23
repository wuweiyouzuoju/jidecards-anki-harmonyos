// SPDX-License-Identifier: AGPL-3.0-or-later
// 浏览协议的线格式行为测试，不加载页面或平台服务。
import assert from 'node:assert/strict';
import test from 'node:test';

import { 协议写入器 } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';
import { 协议读取器 } from '../../entry/src/main/ets/proto/core/ProtoReader.ts';
import {
  BrowserCellTextElideMode,
  BrowserColumnAlignment,
  BrowserColumnSorting,
  BrowserRowColor,
  SearchNodeCardState,
  SearchNodeFieldSearchMode,
  SearchNodeFlag,
  SearchNodeJoiner,
  SearchNodeRating,
  decodeBrowserColumns,
  decodeBrowserRow,
  decodeSearchNode,
  decodeSearchResponse,
  encodeFindAndReplaceRequest,
  encodeSearchNode,
  encodeSearchRequest,
  makeCardStateNode,
  makeDeckNode,
  makeParsableTextNode,
  makeTagNode
} from '../../entry/src/main/ets/proto/messages/SearchMessages.ts';
import {
  ReviewKind,
  decodeCardStatsResponse,
  encodeCardIdRequest
} from '../../entry/src/main/ets/proto/messages/StatsMessages.ts';

function roundTripSearchNode(node) {
  return decodeSearchNode(encodeSearchNode(node).转为字节());
}

// ---- 测试局部解码器（验证 encode 侧 wire format 契约） ----
// encodeSortOrder / decodeSortOrder 未导出，经 encodeSearchRequest 编码后
// 用 协议读取器 独立解析，验证编码 wire format 与 prost 对齐。

function decodeSortOrderForTest(bytes) {
  const r = new 协议读取器(bytes);
  const order = { kind: 'none' };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        r.读取字节(); // generic.Empty 子消息
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
            case 1: order.column = inner.读取字符串(); break;
            case 2: order.reverse = inner.读取布尔(); break;
            default: inner.跳过字段(innerTag.线类型);
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

function decodeSearchRequestForTest(bytes) {
  const r = new 协议读取器(bytes);
  const req = { search: '', order: { kind: 'none' } };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1: req.search = r.读取字符串(); break;
      case 2: req.order = decodeSortOrderForTest(r.读取字节()); break;
      default: r.跳过字段(tag.线类型);
    }
  }
  return req;
}

function decodeFindAndReplaceRequestForTest(bytes) {
  const r = new 协议读取器(bytes);
  const req = { nids: [], search: '', replacement: '', regex: false, matchCase: false, fieldName: '' };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        if (tag.线类型 === 2) {
          req.nids.push(...r.读取打包64位整数());
        } else {
          req.nids.push(r.读取64位整数());
        }
        break;
      case 2: req.search = r.读取字符串(); break;
      case 3: req.replacement = r.读取字符串(); break;
      case 4: req.regex = r.读取布尔(); break;
      case 5: req.matchCase = r.读取布尔(); break;
      case 6: req.fieldName = r.读取字符串(); break;
      default: r.跳过字段(tag.线类型);
    }
  }
  return req;
}

// ============================================================
// A. proto 编解码往返
// ============================================================

test('makeParsableTextNode round-trips through proto encode/decode', () => {
  const node = makeParsableTextNode('deck:Swahili');
  const rt = roundTripSearchNode(node);
  assert.equal(rt.kind, 'parsable_text');
  assert.equal(rt.text, 'deck:Swahili');
});

test('makeDeckNode round-trips through proto encode/decode', () => {
  const node = makeDeckNode('Default');
  const rt = roundTripSearchNode(node);
  assert.equal(rt.kind, 'deck');
  assert.equal(rt.deck, 'Default');
});

test('makeTagNode round-trips through proto encode/decode', () => {
  const node = makeTagNode('important');
  const rt = roundTripSearchNode(node);
  assert.equal(rt.kind, 'tag');
  assert.equal(rt.tag, 'important');
});

test('makeCardStateNode round-trips with CARD_STATE_DUE', () => {
  const node = makeCardStateNode(SearchNodeCardState.CARD_STATE_DUE);
  const rt = roundTripSearchNode(node);
  assert.equal(rt.kind, 'card_state');
  assert.equal(rt.cardState, SearchNodeCardState.CARD_STATE_DUE);
});

test('SearchNode field (fieldName + text + mode) round-trips', () => {
  const node = {
    kind: 'field',
    field: {
      fieldName: 'Front',
      text: 'hello',
      mode: SearchNodeFieldSearchMode.FIELD_SEARCH_MODE_REGEX
    }
  };
  const rt = roundTripSearchNode(node);
  assert.equal(rt.kind, 'field');
  assert.equal(rt.field.fieldName, 'Front');
  assert.equal(rt.field.text, 'hello');
  assert.equal(rt.field.mode, SearchNodeFieldSearchMode.FIELD_SEARCH_MODE_REGEX);
});

test('SearchNode group (nodes + joiner=OR) round-trips', () => {
  const node = {
    kind: 'group',
    group: {
      nodes: [makeParsableTextNode('deck:Swahili'), makeTagNode('important')],
      joiner: SearchNodeJoiner.OR
    }
  };
  const rt = roundTripSearchNode(node);
  assert.equal(rt.kind, 'group');
  assert.equal(rt.group.joiner, SearchNodeJoiner.OR);
  assert.equal(rt.group.nodes.length, 2);
  assert.equal(rt.group.nodes[0].kind, 'parsable_text');
  assert.equal(rt.group.nodes[0].text, 'deck:Swahili');
  assert.equal(rt.group.nodes[1].kind, 'tag');
  assert.equal(rt.group.nodes[1].tag, 'important');
});

test('SearchNode negated round-trips', () => {
  const node = { kind: 'negated', negated: makeParsableTextNode('is:new') };
  const rt = roundTripSearchNode(node);
  assert.equal(rt.kind, 'negated');
  assert.equal(rt.negated.kind, 'parsable_text');
  assert.equal(rt.negated.text, 'is:new');
});

test('SearchNode nids=[1,2,3] round-trips', () => {
  const node = { kind: 'nids', nids: [1, 2, 3] };
  const rt = roundTripSearchNode(node);
  assert.equal(rt.kind, 'nids');
  assert.deepEqual(rt.nids, [1, 2, 3]);
});

test('SearchNode rated (days=7 + rating=HARD) round-trips', () => {
  const node = {
    kind: 'rated',
    rated: { days: 7, rating: SearchNodeRating.RATING_HARD }
  };
  const rt = roundTripSearchNode(node);
  assert.equal(rt.kind, 'rated');
  assert.equal(rt.rated.days, 7);
  assert.equal(rt.rated.rating, SearchNodeRating.RATING_HARD);
});

test('SearchNode dupe (notetypeId=123 + firstField=hello) round-trips', () => {
  const node = {
    kind: 'dupe',
    dupe: { notetypeId: 123, firstField: 'hello' }
  };
  const rt = roundTripSearchNode(node);
  assert.equal(rt.kind, 'dupe');
  assert.equal(rt.dupe.notetypeId, 123);
  assert.equal(rt.dupe.firstField, 'hello');
});

test('SearchNode flag=FLAG_RED round-trips', () => {
  const node = { kind: 'flag', flag: SearchNodeFlag.FLAG_RED };
  const rt = roundTripSearchNode(node);
  assert.equal(rt.kind, 'flag');
  assert.equal(rt.flag, SearchNodeFlag.FLAG_RED);
});

test('SortOrder { kind: none } encodes as omitted (proto3 default)', () => {
  // none 是 SortOrder oneof 的默认值，encodeSearchRequest 不写 field 2
  const bytes = encodeSearchRequest({ search: '', order: { kind: 'none' } });
  assert.equal(bytes.length, 0, 'none order + empty search must produce zero bytes');
  const rt = decodeSearchRequestForTest(bytes);
  assert.equal(rt.order.kind, 'none', 'decoding absent field 2 defaults to none');
});

test('SortOrder { kind: custom, custom: field:Foo } round-trips', () => {
  const bytes = encodeSearchRequest({ search: '', order: { kind: 'custom', custom: 'field:Foo' } });
  const rt = decodeSearchRequestForTest(bytes);
  assert.equal(rt.order.kind, 'custom');
  assert.equal(rt.order.custom, 'field:Foo');
});

test('SortOrder { kind: builtin, column: due, reverse: true } round-trips', () => {
  const bytes = encodeSearchRequest({
    search: '',
    order: { kind: 'builtin', column: 'due', reverse: true }
  });
  const rt = decodeSearchRequestForTest(bytes);
  assert.equal(rt.order.kind, 'builtin');
  assert.equal(rt.order.column, 'due');
  assert.equal(rt.order.reverse, true);
});

test('SearchRequest { search: is:new, order: { kind: none } } round-trips', () => {
  const original = { search: 'is:new', order: { kind: 'none' } };
  const bytes = encodeSearchRequest(original);
  const rt = decodeSearchRequestForTest(bytes);
  assert.equal(rt.search, 'is:new');
  assert.equal(rt.order.kind, 'none', 'none order omitted on wire, defaults back to none');
});

test('FindAndReplaceRequest round-trips all six fields', () => {
  const original = {
    nids: [1, 2],
    search: 'foo',
    replacement: 'bar',
    regex: false,
    matchCase: true,
    fieldName: 'Front'
  };
  const bytes = encodeFindAndReplaceRequest(original);
  const rt = decodeFindAndReplaceRequestForTest(bytes);
  assert.deepEqual(rt.nids, [1, 2]);
  assert.equal(rt.search, 'foo');
  assert.equal(rt.replacement, 'bar');
  assert.equal(rt.regex, false, 'regex=false is proto3 default, must not be written but decoded as false');
  assert.equal(rt.matchCase, true);
  assert.equal(rt.fieldName, 'Front');
});

test('SearchResponse decodes packed repeated int64 (prost default wire type 2)', () => {
  // prost 对 proto3 repeated int64 默认 packed：field 1, wire type 2, 载荷是连续 varint
  const w = new 协议写入器();
  w.写入打包64位整数(1, [100, 200, 300]);
  const ids = decodeSearchResponse(w.转为字节());
  assert.deepEqual(ids, [100, 200, 300], 'packed repeated int64 must decode via wire type 2 payload');
});

test('SearchResponse also decodes non-packed repeated int64 (backward compat wire type 0)', () => {
  // 旧编码器可能用非 packed：每个元素单独 field 1, wire type 0
  const w = new 协议写入器();
  w.写入64位整数(1, 100);
  w.写入64位整数(1, 200);
  w.写入64位整数(1, 300);
  const ids = decodeSearchResponse(w.转为字节());
  assert.deepEqual(ids, [100, 200, 300], 'non-packed repeated int64 must still decode via wire type 0');
});

test('SearchResponse empty input returns empty array', () => {
  const ids = decodeSearchResponse(new Uint8Array(0));
  assert.deepEqual(ids, []);
});

test('SearchResponse mixed packed + non-packed accumulates all ids', () => {
  // prost 不会混用，但规范允许；解码器应能处理
  const w = new 协议写入器();
  w.写入打包64位整数(1, [1, 2]);
  w.写入64位整数(1, 3);
  const ids = decodeSearchResponse(w.转为字节());
  assert.deepEqual(ids, [1, 2, 3]);
});

test('BrowserColumns decodes column with key + labels + sorting', () => {
  const col = new 协议写入器();
  col.写入字符串(1, 'question');
  col.写入字符串(2, 'Question');
  col.写入字符串(3, '问题');
  col.写入变长整数(4, BrowserColumnSorting.SORTING_ASCENDING);
  col.写入变长整数(6, BrowserColumnAlignment.ALIGNMENT_CENTER);
  const cols = new 协议写入器();
  cols.写入子消息(1, col);

  const decoded = decodeBrowserColumns(cols.转为字节());
  assert.equal(decoded.columns.length, 1);
  assert.equal(decoded.columns[0].key, 'question');
  assert.equal(decoded.columns[0].cardsModeLabel, 'Question');
  assert.equal(decoded.columns[0].notesModeLabel, '问题');
  assert.equal(decoded.columns[0].sortingCards, BrowserColumnSorting.SORTING_ASCENDING);
  assert.equal(decoded.columns[0].sortingNotes, BrowserColumnSorting.SORTING_NONE, 'unset sorting defaults to NONE');
  assert.equal(decoded.columns[0].alignment, BrowserColumnAlignment.ALIGNMENT_CENTER);
  assert.equal(decoded.columns[0].usesCellFont, false, 'unset bool defaults to false');
});

test('BrowserRow decodes cells + color + fontName + fontSize', () => {
  const cell = new 协议写入器();
  cell.写入字符串(1, 'hello');
  cell.写入布尔(2, true);
  cell.写入变长整数(3, BrowserCellTextElideMode.ELIDE_RIGHT);
  const row = new 协议写入器();
  row.写入子消息(1, cell);
  row.写入变长整数(2, BrowserRowColor.COLOR_SUSPENDED);
  row.写入字符串(3, 'Arial');
  row.写入变长整数(4, 14);

  const decoded = decodeBrowserRow(row.转为字节());
  assert.equal(decoded.cells.length, 1);
  assert.equal(decoded.cells[0].text, 'hello');
  assert.equal(decoded.cells[0].isRtl, true);
  assert.equal(decoded.cells[0].elideMode, BrowserCellTextElideMode.ELIDE_RIGHT);
  assert.equal(decoded.color, BrowserRowColor.COLOR_SUSPENDED);
  assert.equal(decoded.fontName, 'Arial');
  assert.equal(decoded.fontSize, 14);
});

test('proto3: empty parsable_text SearchNode encodes to zero bytes', () => {
  const bytes = encodeSearchNode(makeParsableTextNode('')).转为字节();
  assert.equal(bytes.length, 0, 'default text="" must be omitted');
});

test('proto3: empty SearchRequest encodes to zero bytes', () => {
  const bytes = encodeSearchRequest({ search: '', order: { kind: 'none' } });
  assert.equal(bytes.length, 0, 'all defaults must be omitted');
});

test('proto3: all-default FindAndReplaceRequest encodes to zero bytes', () => {
  const bytes = encodeFindAndReplaceRequest({
    nids: [], search: '', replacement: '', regex: false, matchCase: false, fieldName: ''
  });
  assert.equal(bytes.length, 0, 'all defaults must be omitted');
});

test('encodeCardIdRequest(cardId=0) produces zero bytes (proto3 default omitted)', () => {
  const bytes = encodeCardIdRequest(0);
  assert.equal(bytes.length, 0, 'cardId=0 must be omitted');
});

test('encodeCardIdRequest(cardId=42) round-trips via 协议读取器', () => {
  const bytes = encodeCardIdRequest(42);
  const r = new 协议读取器(bytes);
  const tag = r.读取标签();
  assert.equal(tag.字段号, 1);
  assert.equal(tag.线类型, 0, 'int64 field uses wire type 0 (varint)');
  assert.equal(r.读取64位整数(), 42);
  assert.equal(r.读取标签(), null, 'no more fields');
});

test('decodeCardStatsResponse decodes empty bytes as all-default CardStatsView', () => {
  const out = decodeCardStatsResponse(new Uint8Array(0));
  assert.deepEqual(out.revlog, []);
  assert.equal(out.cardId, 0);
  assert.equal(out.noteId, 0);
  assert.equal(out.deck, '');
  assert.equal(out.added, 0);
  assert.equal(out.interval, 0);
  assert.equal(out.reviews, 0);
  assert.equal(out.lapses, 0);
  assert.equal(out.cardType, '');
  assert.equal(out.notetype, '');
  assert.equal(out.firstReview, undefined);
  assert.equal(out.latestReview, undefined);
  assert.equal(out.dueDate, undefined);
  assert.equal(out.duePosition, undefined);
  assert.equal(out.fsrsRetrievability, undefined);
});

test('decodeCardStatsResponse round-trips all 17 top-level fields', () => {
  // 构造一个含全部字段的 CardStatsResponse 字节流
  const revlog = new 协议写入器();
  revlog.写入64位整数(1, 1700000000);              // time
  revlog.写入变长整数(2, ReviewKind.REVIEW);        // reviewKind
  revlog.写入变长整数(3, 3);                         // buttonChosen
  revlog.写入变长整数(4, 86400);                     // interval
  revlog.写入变长整数(5, 2500);                      // ease
  revlog.写入浮点(6, 12.5);                          // takenSecs
  revlog.写入变长整数(8, 43200);                     // lastInterval

  const w = new 协议写入器();
  w.写入子消息(1, revlog);
  w.写入64位整数(2, 12345);                          // cardId
  w.写入64位整数(3, 67890);                          // noteId
  w.写入字符串(4, 'Default::Sub');                   // deck
  w.写入64位整数(5, 1690000000);                     // added
  w.写入64位整数(6, 1690001000);                     // firstReview
  w.写入64位整数(7, 1700000000);                     // latestReview
  w.写入64位整数(8, 1710000000);                     // dueDate
  w.写入变长整数(9, 7);                              // duePosition
  w.写入变长整数(10, 21);                            // interval
  w.写入变长整数(11, 2500);                          // ease
  w.写入变长整数(12, 15);                            // reviews
  w.写入变长整数(13, 2);                             // lapses
  w.写入浮点(14, 8.3);                              // averageSecs
  w.写入浮点(15, 124.5);                            // totalSecs
  w.写入字符串(16, 'rev');                           // cardType
  w.写入字符串(17, 'Basic');                         // notetype
  w.写入浮点(19, 0.875);                            // fsrsRetrievability

  const out = decodeCardStatsResponse(w.转为字节());
  assert.equal(out.revlog.length, 1);
  assert.equal(out.revlog[0].time, 1700000000);
  assert.equal(out.revlog[0].reviewKind, ReviewKind.REVIEW);
  assert.equal(out.revlog[0].buttonChosen, 3);
  assert.equal(out.revlog[0].interval, 86400);
  assert.equal(out.revlog[0].ease, 2500);
  assert.equal(out.revlog[0].takenSecs, 12.5);
  assert.equal(out.revlog[0].lastInterval, 43200);
  assert.equal(out.cardId, 12345);
  assert.equal(out.noteId, 67890);
  assert.equal(out.deck, 'Default::Sub');
  assert.equal(out.added, 1690000000);
  assert.equal(out.firstReview, 1690001000);
  assert.equal(out.latestReview, 1700000000);
  assert.equal(out.dueDate, 1710000000);
  assert.equal(out.duePosition, 7);
  assert.equal(out.interval, 21);
  assert.equal(out.ease, 2500);
  assert.equal(out.reviews, 15);
  assert.equal(out.lapses, 2);
  assert.equal(out.averageSecs === undefined ? undefined : Math.abs(out.averageSecs - 8.3) < 0.001, true, `averageSecs float32 precision: actual=${out.averageSecs}`);
  assert.equal(out.totalSecs === undefined ? undefined : Math.abs(out.totalSecs - 124.5) < 0.001, true, `totalSecs float32 precision: actual=${out.totalSecs}`);
  assert.equal(out.cardType, 'rev');
  assert.equal(out.notetype, 'Basic');
  assert.equal(out.fsrsRetrievability === undefined ? undefined : Math.abs(out.fsrsRetrievability - 0.875) < 0.001, true, `fsrsRetrievability float32 precision: actual=${out.fsrsRetrievability}`);
});

test('decodeCardStatsResponse decodes multiple revlog entries in order', () => {
  const revlog1 = new 协议写入器();
  revlog1.写入64位整数(1, 1700000000);
  revlog1.写入变长整数(2, ReviewKind.REVIEW);
  const revlog2 = new 协议写入器();
  revlog2.写入64位整数(1, 1690000000);
  revlog2.写入变长整数(2, ReviewKind.LEARNING);
  const w = new 协议写入器();
  w.写入子消息(1, revlog1);
  w.写入子消息(1, revlog2);
  const out = decodeCardStatsResponse(w.转为字节());
  assert.equal(out.revlog.length, 2);
  assert.equal(out.revlog[0].time, 1700000000);
  assert.equal(out.revlog[0].reviewKind, ReviewKind.REVIEW);
  assert.equal(out.revlog[1].time, 1690000000);
  assert.equal(out.revlog[1].reviewKind, ReviewKind.LEARNING);
});

test('decodeCardStatsResponse skips unknown fields (forward compat)', () => {
  // 假设未来 Anki 加了 field 20 (string)，本解码器应跳过不崩
  const w = new 协议写入器();
  w.写入字符串(20, 'unknown future field');
  w.写入64位整数(2, 999); // cardId
  const out = decodeCardStatsResponse(w.转为字节());
  assert.equal(out.cardId, 999);
});
