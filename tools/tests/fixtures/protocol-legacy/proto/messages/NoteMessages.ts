// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID PROTO-MSG-NOTE-001
// @名称 笔记消息编解码
//
// @作用
// 编解码 anki.notes.proto 消息（Anki 26.05），服务于「添加卡片」流程：
// - EditableNote：笔记完整视图（id/guid/notetypeId/mtime/usn/tags/fields）
// - AddNoteRequest / AddNoteResponse：新增笔记请求与返回的 noteId
// - DefaultsForAddingRequest / DeckAndNotetype：默认牌组与笔记类型
// - NoteFieldsCheckResponse：字段校验状态（正常/空/重复/缺 cloze 等）
// 字段来源：third_party/anki/proto/anki/notes.proto
//
// @输入
// 编码：EditableNote / (note, deckId) / homeDeckOfCurrentReviewCard
// 解码：字节流
//
// @输出
// 编码：Uint8Array 字节
// 解码：noteId / DeckAndNotetype / NoteFieldsCheckResponse
//
// @业务规则
// tags 与 fields 均为 repeated string，空串 tag 跳过不编码。
// NoteFieldsCheckState 枚举值与 anki.notes.proto 一致。
//
// @副作用
// 无
// ========================================================

import { 协议读取器 } from '../core/ProtoReader';
import { 协议写入器, 线类型_长度分隔, 线类型_变长整数 } from '../core/ProtoWriter';

export interface EditableNote {
  id: number;
  guid: string;
  notetypeId: number;
  mtimeSecs: number;
  usn: number;
  tags: string[];
  fields: string[];
}

export interface DeckAndNotetype {
  deckId: number;
  notetypeId: number;
}

export enum NoteFieldsCheckState {
  NORMAL = 0,
  EMPTY = 1,
  DUPLICATE = 2,
  MISSING_CLOZE = 3,
  NOTETYPE_NOT_CLOZE = 4,
  FIELD_NOT_CLOZE = 5
}

export interface NoteFieldsCheckResponse {
  state: NoteFieldsCheckState;
}

export function encodeNote(note: EditableNote): Uint8Array {
  const writer = new 协议写入器();
  if (note.id !== 0) {
    writer.写入64位整数(1, note.id);
  }
  if (note.guid !== '') {
    writer.写入字符串(2, note.guid);
  }
  if (note.notetypeId !== 0) {
    writer.写入64位整数(3, note.notetypeId);
  }
  if (note.mtimeSecs !== 0) {
    writer.写入变长整数(4, note.mtimeSecs);
  }
  if (note.usn !== 0) {
    writer.写入64位整数(5, note.usn);
  }
  for (const tag of note.tags) {
    if (tag !== '') {
      writer.写入字符串(6, tag);
    }
  }
  for (const field of note.fields) {
    writer.写入字符串(7, field);
  }
  return writer.转为字节();
}

export function decodeNote(bytes: Uint8Array): EditableNote {
  const reader = new 协议读取器(bytes);
  const note: EditableNote = {
    id: 0,
    guid: '',
    notetypeId: 0,
    mtimeSecs: 0,
    usn: 0,
    tags: [],
    fields: []
  };
  let tag;
  while ((tag = reader.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        note.id = reader.读取64位整数();
        break;
      case 2:
        note.guid = reader.读取字符串();
        break;
      case 3:
        note.notetypeId = reader.读取64位整数();
        break;
      case 4:
        note.mtimeSecs = reader.读取变长整数();
        break;
      case 5:
        note.usn = reader.读取64位整数();
        break;
      case 6:
        note.tags.push(reader.读取字符串());
        break;
      case 7:
        note.fields.push(reader.读取字符串());
        break;
      default:
        reader.跳过字段(tag.线类型);
    }
  }
  return note;
}

export function encodeNoteId(noteId: number): Uint8Array {
  const writer = new 协议写入器();
  if (noteId !== 0) {
    writer.写入64位整数(1, noteId);
  }
  return writer.转为字节();
}

/** notes.NoteIds：供 GetSingleNotetypeOfNotes 使用。 */
export function encodeNoteIds(noteIds: number[]): Uint8Array {
  const writer = new 协议写入器();
  writer.写入打包64位整数(1, noteIds);
  return writer.转为字节();
}

/** cards.CardIds：CardsOfNote 的响应，兼容 packed / unpacked repeated int64。 */
export function decodeCardIds(bytes: Uint8Array): number[] {
  const reader = new 协议读取器(bytes);
  const cardIds: number[] = [];
  let tag;
  while ((tag = reader.读取标签()) !== null) {
    if (tag.字段号 === 1 && tag.线类型 === 线类型_长度分隔) {
      const packed: number[] = reader.读取打包64位整数();
      for (const cardId of packed) {
        cardIds.push(cardId);
      }
    } else if (tag.字段号 === 1 && tag.线类型 === 线类型_变长整数) {
      cardIds.push(reader.读取64位整数());
    } else {
      reader.跳过字段(tag.线类型);
    }
  }
  return cardIds;
}

/** notetypes.NotetypeId：GetSingleNotetypeOfNotes 的响应。 */
export function decodeNotetypeId(bytes: Uint8Array): number {
  const reader = new 协议读取器(bytes);
  let notetypeId: number = 0;
  let tag;
  while ((tag = reader.读取标签()) !== null) {
    if (tag.字段号 === 1) {
      notetypeId = reader.读取64位整数();
    } else {
      reader.跳过字段(tag.线类型);
    }
  }
  return notetypeId;
}

export function encodeAddNoteRequest(note: EditableNote, deckId: number): Uint8Array {
  const writer = new 协议写入器();
  writer.写入字节(1, encodeNote(note));
  if (deckId !== 0) {
    writer.写入64位整数(2, deckId);
  }
  return writer.转为字节();
}

export function decodeAddNoteResponse(bytes: Uint8Array): number {
  const reader = new 协议读取器(bytes);
  let noteId = 0;
  let tag;
  while ((tag = reader.读取标签()) !== null) {
    if (tag.字段号 === 2) {
      noteId = reader.读取64位整数();
    } else {
      reader.跳过字段(tag.线类型);
    }
  }
  return noteId;
}

export function encodeDefaultsForAddingRequest(homeDeckOfCurrentReviewCard: number = 0): Uint8Array {
  const writer = new 协议写入器();
  if (homeDeckOfCurrentReviewCard !== 0) {
    writer.写入64位整数(1, homeDeckOfCurrentReviewCard);
  }
  return writer.转为字节();
}

export function decodeDeckAndNotetype(bytes: Uint8Array): DeckAndNotetype {
  const reader = new 协议读取器(bytes);
  const result: DeckAndNotetype = { deckId: 0, notetypeId: 0 };
  let tag;
  while ((tag = reader.读取标签()) !== null) {
    if (tag.字段号 === 1) {
      result.deckId = reader.读取64位整数();
    } else if (tag.字段号 === 2) {
      result.notetypeId = reader.读取64位整数();
    } else {
      reader.跳过字段(tag.线类型);
    }
  }
  return result;
}

export function decodeNoteFieldsCheckResponse(bytes: Uint8Array): NoteFieldsCheckResponse {
  const reader = new 协议读取器(bytes);
  let state: NoteFieldsCheckState = NoteFieldsCheckState.NORMAL;
  let tag;
  while ((tag = reader.读取标签()) !== null) {
    if (tag.字段号 === 1) {
      state = reader.读取变长整数() as NoteFieldsCheckState;
    } else {
      reader.跳过字段(tag.线类型);
    }
  }
  return { state };
}

/**
 * 编码 UpdateNotesRequest：repeated Note notes = 1, bool skip_undo_entry = 2。
 * 与 CardsMessages.encodeUpdateCardsRequest 同构（repeated 子消息 + bool skip_undo_entry）。
 *
 * Invariants: notes 为空数组时仍编码合法空请求（后端按 0 笔记处理）。
 * Extension Points: 浏览编辑区 T7 单条编辑时调 encodeUpdateNotesRequest([note], false)。
 */
export function encodeUpdateNotesRequest(notes: EditableNote[], skipUndoEntry: boolean = false): Uint8Array {
  const writer = new 协议写入器();
  for (const note of notes) {
    writer.写入字节(1, encodeNote(note));
  }
  if (skipUndoEntry) {
    writer.写入布尔(2, true);
  }
  return writer.转为字节();
}

// UpdateNotes 返回 collection.OpChanges，复用 CollectionMessages.decodeOpChanges，不重复实现。
export { decodeOpChanges as decodeUpdateNotesResponse } from './CollectionMessages';
