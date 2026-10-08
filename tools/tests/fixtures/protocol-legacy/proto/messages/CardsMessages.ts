// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID PROTO-MSG-CARDS-001
// @名称 卡片消息编解码
//
// @作用
// 编解码 anki.cards.proto 消息（Anki 26.05）：
// - Card 完整视图（22+ 字段，含 FSRS 记忆状态）
// - CardId / CardIds / UpdateCards / RemoveCards / SetDeck / SetFlag 等请求
// 字段来源：third_party/anki/proto/anki/cards.proto
// service 号：BACKEND_CARDS = 5（backend.rs line 6672）
// 方法号：CARDS_METHOD（ServiceIds.ts）
//
// @输入
// 编码：Card 结构 / cardIds 数组 / (cardIds, deckId/flag) 等
// 解码：字节流
//
// @输出
// 编码：Uint8Array 字节
// 解码：Card 完整视图
//
// @业务规则
// sint32 字段（usn/queue/due/originalDue）用 zigzag 编码，与 prost 一致。
// FSRS 状态字段（20-23）由 backend 维护，前端不在 UpdateCards 中回写。
// 响应复用 CollectionMessages 的 OpChanges / OpChangesWithCount 解码。
//
// @副作用
// 无
// ========================================================

import { 协议读取器 } from '../core/ProtoReader';
import { 协议写入器 } from '../core/ProtoWriter';
import { decodeOpChanges, decodeOpChangesWithCount } from './CollectionMessages';

/** sint32 zigzag 编码：((n << 1) ^ (n >> 31)) >>> 0，结果是无符号 32 位 */
function zigzag32(n: number): number {
  return ((n << 1) ^ (n >> 31)) >>> 0;
}

/** 在 协议写入器 上写 sint32 字段（varint + zigzag，与 prost 一致） */
function writeSint32(w: 协议写入器, fieldNumber: number, value: number): void {
  w.写入变长整数(fieldNumber, zigzag32(value));
}

/** 从 协议读取器 读 sint32 字段（varint + zigzag 反向） */
function readSint32(reader: 协议读取器): number {
  const unsigned = reader.读取大变长整数() & 0xFFFFFFFFn;
  // zigzag 反向：(n >> 1) ^ -(n & 1)
  const low = unsigned & 1n;
  const rest = unsigned >> 1n;
  const signed = rest ^ -low;
  return Number(BigInt.asIntN(32, signed));
}

/** CardId：单张卡片的 cid */
export function encodeCardId(cid: number): Uint8Array {
  const w = new 协议写入器();
  if (cid !== 0) {
    w.写入64位整数(1, cid);
  }
  return w.转为字节();
}

/** CardIds：repeated int64 cids = 1，proto3 标量 repeated 默认 packed */
export function encodeCardIds(cids: number[]): Uint8Array {
  const w = new 协议写入器();
  w.写入打包64位整数(1, cids);
  return w.转为字节();
}

/** 卡片队列类型（ctype 字段） */
export enum CardType {
  NEW = 0,
  LEARNING = 1,
  REVIEW = 2,
  RELEARNING = 3
}

/** 卡片队列状态（queue 字段） */
export enum CardQueue {
  SUSPENDED = -1,
  BURIED_MANUALLY = -2,
  BURIED_BY_SCHEDULE = -3,
  NEW = 0,
  LEARNING = 1,
  REVIEW = 2,
  DAY_LEARN = 3,
  PREVIEW = 4
}

/** FsrsMemoryState：FSRS 算法的记忆状态 */
export interface FsrsMemoryState {
  stability: number;
  difficulty: number;
}

export function decodeFsrsMemoryState(reader: 协议读取器): FsrsMemoryState {
  const out: FsrsMemoryState = { stability: 0, difficulty: 0 };
  let tag;
  while ((tag = reader.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        out.stability = reader.读取浮点();
        break;
      case 2:
        out.difficulty = reader.读取浮点();
        break;
      default:
        reader.跳过字段(tag.线类型);
    }
  }
  return out;
}

/** Card：完整卡片视图（cards.proto Card 消息，22+ 字段） */
export interface Card {
  id: number;
  noteId: number;
  deckId: number;
  templateIdx: number;
  mtimeSecs: number;
  usn: number;
  ctype: number;
  queue: number;
  due: number;
  interval: number;
  easeFactor: number;
  reps: number;
  lapses: number;
  remainingSteps: number;
  originalDue: number;
  originalDeckId: number;
  flags: number;
  originalPosition?: number;
  memoryState?: FsrsMemoryState;
  desiredRetention?: number;
  decay?: number;
  lastReviewTimeSecs?: number;
  customData: string;
}

export function decodeCard(bytes: Uint8Array): Card {
  const reader = new 协议读取器(bytes);
  const card: Card = {
    id: 0,
    noteId: 0,
    deckId: 0,
    templateIdx: 0,
    mtimeSecs: 0,
    usn: 0,
    ctype: 0,
    queue: 0,
    due: 0,
    interval: 0,
    easeFactor: 0,
    reps: 0,
    lapses: 0,
    remainingSteps: 0,
    originalDue: 0,
    originalDeckId: 0,
    flags: 0,
    customData: ''
  };
  let tag;
  while ((tag = reader.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1: card.id = reader.读取64位整数(); break;
      case 2: card.noteId = reader.读取64位整数(); break;
      case 3: card.deckId = reader.读取64位整数(); break;
      case 4: card.templateIdx = reader.读取变长整数(); break;
      case 5: card.mtimeSecs = reader.读取64位整数(); break;
      case 6: card.usn = readSint32(reader); break;        // sint32 zigzag
      case 7: card.ctype = reader.读取变长整数(); break;       // uint32
      case 8: card.queue = readSint32(reader); break;       // sint32 zigzag
      case 9: card.due = readSint32(reader); break;         // sint32 zigzag
      case 10: card.interval = reader.读取变长整数(); break;  // uint32
      case 11: card.easeFactor = reader.读取变长整数(); break;
      case 12: card.reps = reader.读取变长整数(); break;
      case 13: card.lapses = reader.读取变长整数(); break;
      case 14: card.remainingSteps = reader.读取变长整数(); break;
      case 15: card.originalDue = readSint32(reader); break;
      case 16: card.originalDeckId = reader.读取64位整数(); break;
      case 17: card.flags = reader.读取变长整数(); break;
      case 18: card.originalPosition = reader.读取变长整数(); break;
      case 19: card.customData = reader.读取字符串(); break;
      case 20: {
        const sub = new 协议读取器(reader.读取字节());
        card.memoryState = decodeFsrsMemoryState(sub);
        break;
      }
      case 21: card.desiredRetention = reader.读取浮点(); break;
      case 22: card.decay = reader.读取浮点(); break;
      case 23: card.lastReviewTimeSecs = reader.读取64位整数(); break;
      default: reader.跳过字段(tag.线类型);
    }
  }
  return card;
}

/** 编码 Card 子消息（用于 UpdateCardsRequest.cards 嵌入） */
export function encodeCard(card: Card): Uint8Array {
  const w = new 协议写入器();
  if (card.id !== 0) w.写入64位整数(1, card.id);
  if (card.noteId !== 0) w.写入64位整数(2, card.noteId);
  if (card.deckId !== 0) w.写入64位整数(3, card.deckId);
  if (card.templateIdx !== 0) w.写入变长整数(4, card.templateIdx);
  if (card.mtimeSecs !== 0) w.写入64位整数(5, card.mtimeSecs);
  if (card.usn !== 0) writeSint32(w, 6, card.usn);            // sint32 zigzag
  if (card.ctype !== 0) w.写入变长整数(7, card.ctype);
  if (card.queue !== 0) writeSint32(w, 8, card.queue);        // sint32 zigzag
  if (card.due !== 0) writeSint32(w, 9, card.due);            // sint32 zigzag
  if (card.interval !== 0) w.写入变长整数(10, card.interval);
  if (card.easeFactor !== 0) w.写入变长整数(11, card.easeFactor);
  if (card.reps !== 0) w.写入变长整数(12, card.reps);
  if (card.lapses !== 0) w.写入变长整数(13, card.lapses);
  if (card.remainingSteps !== 0) w.写入变长整数(14, card.remainingSteps);
  if (card.originalDue !== 0) writeSint32(w, 15, card.originalDue);
  if (card.originalDeckId !== 0) w.写入64位整数(16, card.originalDeckId);
  if (card.flags !== 0) w.写入变长整数(17, card.flags);
  if (card.originalPosition !== undefined) w.写入变长整数(18, card.originalPosition);
  if (card.customData !== '') w.写入字符串(19, card.customData);
  // FSRS 状态（20-23 字段）由 backend 维护，前端不在 UpdateCards 中回写
  return w.转为字节();
}

/** UpdateCardsRequest：repeated Card cards = 1, bool skip_undo_entry = 2 */
export function encodeUpdateCardsRequest(cards: Card[], skipUndoEntry: boolean = false): Uint8Array {
  const w = new 协议写入器();
  for (const card of cards) {
    w.写入字节(1, encodeCard(card));
  }
  if (skipUndoEntry) {
    w.写入布尔(2, true);
  }
  return w.转为字节();
}

/** RemoveCardsRequest：repeated int64 card_ids = 1（packed） */
export function encodeRemoveCardsRequest(cardIds: number[]): Uint8Array {
  const w = new 协议写入器();
  w.写入打包64位整数(1, cardIds);
  return w.转为字节();
}

/** SetDeckRequest：repeated int64 card_ids = 1（packed）, int64 deck_id = 2 */
export function encodeSetDeckRequest(cardIds: number[], deckId: number): Uint8Array {
  const w = new 协议写入器();
  w.写入打包64位整数(1, cardIds);
  if (deckId !== 0) {
    w.写入64位整数(2, deckId);
  }
  return w.转为字节();
}

/** SetFlagRequest：repeated int64 card_ids = 1（packed）, uint32 flag = 2 */
export function encodeSetFlagRequest(cardIds: number[], flag: number): Uint8Array {
  const w = new 协议写入器();
  w.写入打包64位整数(1, cardIds);
  if (flag !== 0) {
    w.写入变长整数(2, flag);
  }
  return w.转为字节();
}

// 响应解码（全部复用 CollectionMessages 的 OpChanges / OpChangesWithCount）
export {
  decodeOpChanges as decodeUpdateCardsResponse,
  decodeOpChangesWithCount as decodeRemoveCardsResponse,
  decodeOpChangesWithCount as decodeSetDeckResponse,
  decodeOpChangesWithCount as decodeSetFlagResponse
};
