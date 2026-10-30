// SPDX-License-Identifier: AGPL-3.0-or-later

// CardsMessages 字节级测试：锁定 cards.proto 编解码与 prost 一致。
// 来源：third_party/anki/proto/anki/cards.proto（Anki 26.05）
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decodeCard,
  decodeFsrsMemoryState,
  encodeCard,
  encodeCardId,
  encodeCardIds,
  encodeRemoveCardsRequest,
  encodeSetDeckRequest,
  encodeSetFlagRequest,
  encodeUpdateCardsRequest,
  CardType,
  CardQueue
} from '../../entry/src/main/ets/proto/messages/CardsMessages.ts';
import { 协议读取器 } from '../../entry/src/main/ets/proto/core/ProtoReader.ts';
import { 协议写入器 } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';

function hex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(' ');
}

test('encodeCardId writes only cid field 1 as int64', () => {
  const bytes = encodeCardId(1234567890);
  // tag 0x08, varint(1234567890) = d2 85 d8 cc 04
  assert.equal(hex(bytes), '08 d2 85 d8 cc 04');
});

test('encodeCardId omits zero cid (proto3 default)', () => {
  assert.equal(hex(encodeCardId(0)), '');
});

test('encodeCardIds encodes packed repeated int64', () => {
  const bytes = encodeCardIds([1, 2, 300]);
  // field 1, wire type 2 (LEN): tag=0a, len=4
  // packed payload: 01, 02, ac 02 (300=0x12C -> 0xAC 0x02)
  assert.equal(hex(bytes), '0a 04 01 02 ac 02');
});

test('encodeCardIds empty list emits nothing (proto3 packed default)', () => {
  assert.equal(hex(encodeCardIds([])), '');
});

test('encodeRemoveCardsRequest packs card_ids as field 1', () => {
  const bytes = encodeRemoveCardsRequest([100, 200]);
  // tag 0x0a, len 3, payload: 64, c8 01 (200=0xC8 -> 0xC8 0x01)
  assert.equal(hex(bytes), '0a 03 64 c8 01');
});

test('encodeSetDeckRequest packs card_ids then deck_id as field 2', () => {
  const bytes = encodeSetDeckRequest([1, 2], 1701);
  // field1: 0a 02 01 02
  // field2: tag 0x10, varint(1701)=0x09 0x0D ... let me compute: 1701 = 0x6A5
  //   1701 mod 128 = 37 (0x25) -> 0x25 | 0x80 = 0xa5
  //   1701 >> 7 = 13 (0x0D) -> last byte
  //   varint = a5 0d
  assert.equal(hex(bytes), '0a 02 01 02 10 a5 0d');
});

test('encodeSetFlagRequest packs card_ids then flag as field 2 uint32', () => {
  const bytes = encodeSetFlagRequest([42], 3);
  // field1 packed: tag 0x0a, len 1, payload 0x2a
  // field2 uint32: tag 0x10, varint 0x03
  assert.equal(hex(bytes), '0a 01 2a 10 03');
});

test('encodeSetFlagRequest omits zero flag (proto3 default)', () => {
  assert.equal(hex(encodeSetFlagRequest([42], 0)), '0a 01 2a');
});

test('encodeUpdateCardsRequest embeds cards as repeated message field 1', () => {
  const card = {
    id: 100,
    noteId: 0, deckId: 0, templateIdx: 0, mtimeSecs: 0,
    usn: 0, ctype: 0, queue: 0, due: 0, interval: 0,
    easeFactor: 0, reps: 0, lapses: 0, remainingSteps: 0,
    originalDue: 0, originalDeckId: 0, flags: 0,
    customData: ''
  };
  const bytes = encodeUpdateCardsRequest([card], false);
  // Card id=100 -> tag 0x08, varint 0x64
  // Embedded as field 1 (LEN): tag 0x0a, len 2, payload 08 64
  assert.equal(hex(bytes), '0a 02 08 64');
});

test('encodeUpdateCardsRequest with skipUndoEntry writes bool field 2', () => {
  const bytes = encodeUpdateCardsRequest([], true);
  // No cards, only bool field 2 = true: tag 0x10, value 0x01
  assert.equal(hex(bytes), '10 01');
});

test('encodeCard encodes sint32 queue=-1 with zigzag (1 byte 0x01)', () => {
  const card = {
    id: 0, noteId: 0, deckId: 0, templateIdx: 0, mtimeSecs: 0,
    usn: 0, ctype: 0, queue: -1, due: 0, interval: 0,
    easeFactor: 0, reps: 0, lapses: 0, remainingSteps: 0,
    originalDue: 0, originalDeckId: 0, flags: 0,
    customData: ''
  };
  const bytes = encodeCard(card);
  // field 8 sint32: tag (8<<3)|0 = 0x40, varint zigzag(-1)=1 -> 0x01
  assert.equal(hex(bytes), '40 01');
});

test('encodeCard encodes sint32 due=-3 (BURIED_BY_SCHEDULE) as zigzag 5', () => {
  const card = {
    id: 0, noteId: 0, deckId: 0, templateIdx: 0, mtimeSecs: 0,
    usn: 0, ctype: 0, queue: 0, due: -3, interval: 0,
    easeFactor: 0, reps: 0, lapses: 0, remainingSteps: 0,
    originalDue: 0, originalDeckId: 0, flags: 0,
    customData: ''
  };
  // zigzag(-3) = 5
  // field 9 tag = (9<<3)|0 = 0x48
  assert.equal(hex(encodeCard(card)), '48 05');
});

test('encodeCard writes customData as field 19 string', () => {
  const card = {
    id: 0, noteId: 0, deckId: 0, templateIdx: 0, mtimeSecs: 0,
    usn: 0, ctype: 0, queue: 0, due: 0, interval: 0,
    easeFactor: 0, reps: 0, lapses: 0, remainingSteps: 0,
    originalDue: 0, originalDeckId: 0, flags: 0,
    customData: '{"x":1}'
  };
  // field 19: tag (19<<3)|2 = 0x9A 0x01, len 7, payload '{"x":1}'
  assert.equal(hex(encodeCard(card)), '9a 01 07 7b 22 78 22 3a 31 7d');
});

test('decodeCard roundtrips a full scheduling card with sint32 fields', () => {
  const original = {
    id: 1234567890123,
    noteId: 555,
    deckId: 1,
    templateIdx: 0,
    mtimeSecs: 1700000000,
    usn: -42,
    ctype: CardType.REVIEW,
    queue: CardQueue.REVIEW,
    due: 12345,
    interval: 30,
    easeFactor: 2500,
    reps: 10,
    lapses: 1,
    remainingSteps: 0,
    originalDue: 0,
    originalDeckId: 0,
    flags: 0,
    customData: ''
  };
  const bytes = encodeCard(original);
  const decoded = decodeCard(bytes);
  assert.equal(decoded.id, original.id);
  assert.equal(decoded.noteId, original.noteId);
  assert.equal(decoded.deckId, original.deckId);
  assert.equal(decoded.mtimeSecs, original.mtimeSecs);
  assert.equal(decoded.usn, original.usn); // sint32 roundtrip preserves negative
  assert.equal(decoded.ctype, original.ctype);
  assert.equal(decoded.queue, original.queue);
  assert.equal(decoded.due, original.due);
  assert.equal(decoded.interval, original.interval);
  assert.equal(decoded.easeFactor, original.easeFactor);
  assert.equal(decoded.reps, original.reps);
  assert.equal(decoded.lapses, original.lapses);
});

test('decodeCard reads FSRS memory_state submessage (field 20)', () => {
  // 手工构造含 memory_state 的 Card 字节
  const w = new 协议写入器();
  w.写入64位整数(1, 42);
  const fsrs = new 协议写入器();
  fsrs.写入浮点(1, 5.5);   // stability
  fsrs.写入浮点(2, 4.2);   // difficulty
  w.写入字节(20, fsrs.转为字节());
  const card = decodeCard(w.转为字节());
  assert.equal(card.id, 42);
  assert.ok(card.memoryState);
  assert.equal(card.memoryState.stability, 5.5);
  // 4.2 在 float32 中不精确表示，比较时用近似
  assert.ok(Math.abs(card.memoryState.difficulty - 4.2) < 1e-6);
});

test('decodeCard reads optional float desired_retention (field 21)', () => {
  const w = new 协议写入器();
  w.写入浮点(21, 0.9);
  const card = decodeCard(w.转为字节());
  // 0.9 在 float32 中不精确表示，比较时用近似
  assert.ok(Math.abs(card.desiredRetention - 0.9) < 1e-6);
});

test('decodeCard reads optional int64 last_review_time_secs (field 23)', () => {
  const w = new 协议写入器();
  w.写入64位整数(23, 1699999999);
  const card = decodeCard(w.转为字节());
  assert.equal(card.lastReviewTimeSecs, 1699999999);
});

test('decodeCard skips unknown fields preserving forward compat', () => {
  // 构造一个含未知字段 99 的 Card
  const w = new 协议写入器();
  w.写入64位整数(1, 7);
  w.写入字符串(99, 'unknown-future-field'); // unknown field
  w.写入64位整数(3, 100);
  const card = decodeCard(w.转为字节());
  assert.equal(card.id, 7);
  assert.equal(card.deckId, 100);
});

test('decodeFsrsMemoryState reads stability and difficulty', () => {
  const w = new 协议写入器();
  w.写入浮点(1, 1.5);
  w.写入浮点(2, 6.0);
  const reader = new 协议读取器(w.转为字节());
  const state = decodeFsrsMemoryState(reader);
  assert.equal(state.stability, 1.5);
  assert.equal(state.difficulty, 6.0);
});
