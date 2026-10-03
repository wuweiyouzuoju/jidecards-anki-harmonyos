// SPDX-License-Identifier: AGPL-3.0-or-later

// proto/messages 字节级测试：锁定各消息编解码与 proto 定义（Anki 26.05）一致。
import assert from 'node:assert/strict';
import test from 'node:test';

import { 协议写入器 } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';
import {
  decodeBackendError,
  encodeBackendInit
} from '../../entry/src/main/ets/proto/messages/BackendMessages.ts';
import {
  decodeOpChangesWithCount,
  decodeOpChangesWithId,
  encodeOpenCollectionRequest
} from '../../entry/src/main/ets/proto/messages/CollectionMessages.ts';
import {
  decodeDeck,
  decodeDeckNames,
  decodeDeckTreeNode,
  encodeDeck,
  encodeDeckTreeRequest,
  encodeGetDeckNamesRequest
} from '../../entry/src/main/ets/proto/messages/DeckMessages.ts';
import {
  decodeImportResponse,
  encodeImportAnkiPackageRequest
} from '../../entry/src/main/ets/proto/messages/ImportExportMessages.ts';
import {
  decodeCompleteTagResponse,
  decodeTagTreeNode,
  encodeCompleteTagRequest,
  encodeEmptyRequest,
  encodeFindAndReplaceTagRequest,
  encodeRenameTagsRequest,
  encodeSetTagCollapsedRequest,
  encodeStringRequest
} from '../../entry/src/main/ets/proto/messages/TagsMessages.ts';

function hex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(' ');
}

test('OpenCollectionRequest encodes three paths in field order', () => {
  const bytes = encodeOpenCollectionRequest({
    collectionPath: '/c/collection.anki2',
    mediaFolderPath: '/c/media',
    mediaDbPath: '/c/media.db'
  });
  // field1 len 19, field2 len 8, field3 len 11
  assert.equal(
    hex(bytes),
    '0a 13 2f 63 2f 63 6f 6c 6c 65 63 74 69 6f 6e 2e 61 6e 6b 69 32 ' +
      '12 08 2f 63 2f 6d 65 64 69 61 ' +
      '1a 0b 2f 63 2f 6d 65 64 69 61 2e 64 62'
  );
});

test('BackendInit encodes repeated langs, folder and server flag', () => {
  const bytes = encodeBackendInit({
    preferredLangs: ['zh-CN', 'en'],
    localeFolderPath: '/l',
    server: true
  });
  // "zh-CN"=5B, "en"=2B, "/l"=2B, bool=1
  assert.equal(
    hex(bytes),
    '0a 05 7a 68 2d 43 4e 0a 02 65 6e 12 02 2f 6c 18 01'
  );
});

test('BackendError decodes message/kind/context and skips help/backtrace', () => {
  const w = new 协议写入器();
  w.写入字符串(1, 'collection is already open');
  w.写入变长整数(2, 5); // DB_ERROR
  w.写入变长整数(3, 0); // optional help_page 出现但为空值也应被跳过
  w.写入字符串(4, 'openCollection');
  w.写入字符串(5, 'stack...');
  const info = decodeBackendError(w.转为字节());
  assert.equal(info.message, 'collection is already open');
  assert.equal(info.kind, 5);
  assert.equal(info.context, 'openCollection');
});

test('Deck roundtrips with common/normal sub-messages and reserved bytes', () => {
  const deck = {
    id: 1752902400123,
    name: '英语::四级',
    mtimeSecs: 1752902400,
    usn: 3,
    common: {
      studyCollapsed: false,
      browserCollapsed: true,
      lastDayStudied: 1024,
      newStudied: 5,
      learningStudied: 2,
      millisecondsStudied: 60000,
      other: new Uint8Array([0xde, 0xad])
    },
    normal: {
      configId: 1,
      extendNew: 0,
      extendReview: 0,
      description: 'desc',
      markdownDescription: false,
      reviewLimit: 200,
      newLimit: null,
      reviewLimitToday: { limit: 200, today: 7 },
      newLimitToday: null,
      desiredRetention: 0.9
    }
  };
  const decoded = decodeDeck(encodeDeck(deck));
  assert.equal(decoded.id, deck.id);
  assert.equal(decoded.name, deck.name);
  assert.equal(decoded.mtimeSecs, deck.mtimeSecs);
  assert.equal(decoded.usn, deck.usn);
  assert.equal(decoded.common.browserCollapsed, true);
  assert.equal(decoded.common.lastDayStudied, 1024);
  assert.deepEqual([...decoded.common.other], [0xde, 0xad]);
  assert.equal(decoded.normal.reviewLimit, 200);
  assert.equal(decoded.normal.newLimit, null);
  assert.deepEqual(decoded.normal.reviewLimitToday, { limit: 200, today: 7 });
  assert.ok(Math.abs(decoded.normal.desiredRetention - 0.9) < 1e-6);
});

test('Deck encoding omits default-valued fields like prost', () => {
  // 全默认牌组只带 name：只有 field2 出现在字节流中
  const bytes = encodeDeck({
    id: 0,
    name: '默认',
    mtimeSecs: 0,
    usn: 0,
    common: null,
    normal: null
  });
  assert.equal(hex(bytes), '12 06 e9 bb 98 e8 ae a4');
});

test('DeckTreeNode decodes nested children recursively', () => {
  const child = new 协议写入器();
  child.写入64位整数(1, 20);
  child.写入字符串(2, '四级');
  child.写入变长整数(8, 3); // new_count
  const root = new 协议写入器();
  root.写入64位整数(1, 10);
  root.写入字符串(2, '英语');
  root.写入子消息(3, child);
  root.写入变长整数(4, 0); // level
  root.写入变长整数(6, 11); // review_count
  root.写入变长整数(7, 2); // learn_count
  root.写入变长整数(13, 100); // total_in_deck
  root.写入变长整数(14, 150); // total_including_children
  root.写入布尔(16, false);

  const node = decodeDeckTreeNode(root.转为字节());
  assert.equal(node.deckId, 10);
  assert.equal(node.name, '英语');
  assert.equal(node.reviewCount, 11);
  assert.equal(node.learnCount, 2);
  assert.equal(node.totalInDeck, 100);
  assert.equal(node.totalIncludingChildren, 150);
  assert.equal(node.children.length, 1);
  assert.equal(node.children[0].deckId, 20);
  assert.equal(node.children[0].newCount, 3);
});

test('DeckTreeRequest encodes now timestamp only when non-zero', () => {
  assert.equal(encodeDeckTreeRequest(0).length, 0);
  const bytes = encodeDeckTreeRequest(1752902400);
  const w = new 协议写入器();
  w.写入64位整数(1, 1752902400);
  assert.equal(hex(bytes), hex(w.转为字节()));
});

test('GetDeckNamesRequest flags and DeckNames decoding', () => {
  assert.equal(encodeGetDeckNamesRequest(false, false).length, 0);
  assert.equal(hex(encodeGetDeckNamesRequest(true, true)), '08 01 10 01');

  const entry = new 协议写入器();
  entry.写入64位整数(1, 1);
  entry.写入字符串(2, '默认');
  const list = new 协议写入器();
  list.写入子消息(1, entry);
  const names = decodeDeckNames(list.转为字节());
  assert.deepEqual(names, [{ id: 1, name: '默认' }]);
});

test('OpChangesWithId / OpChangesWithCount extract scalars and skip changes', () => {
  const w = new 协议写入器();
  const changes = new 协议写入器();
  changes.写入布尔(3, true); // deck changed
  w.写入子消息(1, changes);
  w.写入64位整数(2, 1752902400999);
  assert.equal(decodeOpChangesWithId(w.转为字节()), 1752902400999);

  const c = new 协议写入器();
  c.写入布尔(1, true);
  c.写入变长整数(2, 42);
  assert.equal(decodeOpChangesWithCount(c.转为字节()), 42);
});

test('ImportAnkiPackageRequest encodes path only', () => {
  const bytes = encodeImportAnkiPackageRequest('/f/四级.apkg');
  const w = new 协议写入器();
  w.写入字符串(1, '/f/四级.apkg');
  assert.equal(hex(bytes), hex(w.转为字节()));
});

test('ImportResponse tallies log buckets and found_notes', () => {
  const note = new 协议写入器();
  note.写入64位整数(1, 1); // NoteId 子消息字节无需真实，计数即可
  const log = new 协议写入器();
  log.写入子消息(1, note); // new
  log.写入子消息(1, note); // new
  log.写入子消息(2, note); // updated
  log.写入子消息(3, note); // duplicate
  log.写入变长整数(10, 99); // found_notes
  const resp = new 协议写入器();
  const changes = new 协议写入器();
  changes.写入布尔(2, true);
  resp.写入子消息(1, changes);
  resp.写入子消息(2, log);

  const summary = decodeImportResponse(resp.转为字节());
  assert.deepEqual(summary, { newNotes: 2, updatedNotes: 1, duplicateNotes: 1, foundNotes: 99,
    conflictingNotes: 0, firstFieldMatches: 0, missingNotetypeNotes: 0, missingDeckNotes: 0, emptyFirstFieldNotes: 0 });
});

// ---- Tags messages (T6 标签管理) ----

test('EmptyRequest encodes zero bytes (ClearUnusedTags / TagTree input)', () => {
  assert.equal(encodeEmptyRequest().length, 0);
});

test('StringRequest encodes single string field (RemoveTags input)', () => {
  const bytes = encodeStringRequest('英语::四级');
  const w = new 协议写入器();
  w.写入字符串(1, '英语::四级');
  assert.equal(hex(bytes), hex(w.转为字节()));
});

test('StringRequest omits empty string like prost', () => {
  assert.equal(encodeStringRequest('').length, 0);
});

test('SetTagCollapsedRequest encodes name + collapsed', () => {
  const bytes = encodeSetTagCollapsedRequest({ name: 'hard', collapsed: true });
  const w = new 协议写入器();
  w.写入字符串(1, 'hard');
  w.写入布尔(2, true);
  assert.equal(hex(bytes), hex(w.转为字节()));
});

test('RenameTagsRequest encodes current_prefix + new_prefix', () => {
  const bytes = encodeRenameTagsRequest({ currentPrefix: '英语::四级', newPrefix: '英语::六级' });
  const w = new 协议写入器();
  w.写入字符串(1, '英语::四级');
  w.写入字符串(2, '英语::六级');
  assert.equal(hex(bytes), hex(w.转为字节()));
});

test('RenameTagsRequest omits default-valued fields', () => {
  // Both empty → zero bytes
  assert.equal(encodeRenameTagsRequest({ currentPrefix: '', newPrefix: '' }).length, 0);
  // Only currentPrefix non-empty → only field 1
  const bytes = encodeRenameTagsRequest({ currentPrefix: 'old', newPrefix: '' });
  const w = new 协议写入器();
  w.写入字符串(1, 'old');
  assert.equal(hex(bytes), hex(w.转为字节()));
});

test('FindAndReplaceTagRequest encodes all fields in order', () => {
  const bytes = encodeFindAndReplaceTagRequest({
    noteIds: [1, 2, 3],
    search: 'old',
    replacement: 'new',
    regex: true,
    matchCase: false
  });
  const w = new 协议写入器();
  w.写入打包64位整数(1, [1, 2, 3]);
  w.写入字符串(2, 'old');
  w.写入字符串(3, 'new');
  w.写入布尔(4, true);
  // matchCase=false omitted (proto3 default)
  assert.equal(hex(bytes), hex(w.转为字节()));
});

test('FindAndReplaceTagRequest omits empty noteIds and default bools', () => {
  const bytes = encodeFindAndReplaceTagRequest({
    noteIds: [],
    search: 'x',
    replacement: '',
    regex: false,
    matchCase: false
  });
  const w = new 协议写入器();
  w.写入字符串(2, 'x');
  assert.equal(hex(bytes), hex(w.转为字节()));
});

test('CompleteTagRequest encodes input + matchLimit', () => {
  const bytes = encodeCompleteTagRequest({ input: '英', matchLimit: 20 });
  const w = new 协议写入器();
  w.写入字符串(1, '英');
  w.写入变长整数(2, 20);
  assert.equal(hex(bytes), hex(w.转为字节()));
});

test('CompleteTagRequest omits empty input and zero limit', () => {
  assert.equal(encodeCompleteTagRequest({ input: '', matchLimit: 0 }).length, 0);
});

test('CompleteTagResponse decodes repeated string tags', () => {
  const w = new 协议写入器();
  w.写入字符串(1, '英语');
  w.写入字符串(1, '英语::四级');
  w.写入字符串(1, '英语::六级');
  const resp = decodeCompleteTagResponse(w.转为字节());
  assert.deepEqual(resp.tags, ['英语', '英语::四级', '英语::六级']);
});

test('CompleteTagResponse handles empty response', () => {
  const resp = decodeCompleteTagResponse(new Uint8Array(0));
  assert.deepEqual(resp.tags, []);
});

test('TagTreeNode decodes name/children/level/collapsed recursively', () => {
  const child = new 协议写入器();
  child.写入字符串(1, '四级');
  child.写入变长整数(3, 1);
  child.写入布尔(4, false);
  const root = new 协议写入器();
  root.写入字符串(1, '英语');
  root.写入子消息(2, child);
  root.写入变长整数(3, 0);
  root.写入布尔(4, true);

  const node = decodeTagTreeNode(root.转为字节());
  assert.equal(node.name, '英语');
  assert.equal(node.level, 0);
  assert.equal(node.collapsed, true);
  assert.equal(node.children.length, 1);
  assert.equal(node.children[0].name, '四级');
  assert.equal(node.children[0].level, 1);
  assert.equal(node.children[0].collapsed, false);
});

// ---- Links messages (T10 帮助页外链) ----

test('HelpPageLinkRequest encodes page enum as varint field 1', async () => {
  const { HelpPage, encodeHelpPageLinkRequest, decodeStringResponse } =
    await import('../../entry/src/main/ets/proto/messages/LinksMessages.ts');
  // INDEX=10：field1 varint 10 → tag 0x08, value 0x0a
  assert.equal(hex(encodeHelpPageLinkRequest(HelpPage.INDEX)), '08 0a');
  // NOTE_TYPE=0（proto3 默认值）：省略不写
  assert.equal(encodeHelpPageLinkRequest(HelpPage.NOTE_TYPE).length, 0);
  // BROWSING=1
  assert.equal(hex(encodeHelpPageLinkRequest(HelpPage.BROWSING)), '08 01');
});

test('HelpPageLink generic.String response decodes URL from field 1', async () => {
  const { decodeStringResponse } =
    await import('../../entry/src/main/ets/proto/messages/LinksMessages.ts');
  const w = new 协议写入器();
  w.写入字符串(1, 'https://docs.ankiweb.net');
  assert.equal(decodeStringResponse(w.转为字节()), 'https://docs.ankiweb.net');
  // 空响应 → 空串
  assert.equal(decodeStringResponse(new Uint8Array(0)), '');
});


