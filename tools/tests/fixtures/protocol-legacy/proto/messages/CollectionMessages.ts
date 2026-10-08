// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID PROTO-MSG-COLLECTION-001
// @名称 集合消息编解码
//
// @作用
// 编解码 anki.collection.proto 消息（Anki 26.05）：
// - OpenCollectionRequest / CloseCollectionRequest：打开/关闭集合
// - OpChanges 族：写操作返回的实体变更标记（卡片/笔记/牌组/标签等）
// - UndoStatus / OpChangesAfterUndo：撤销/重做链路
// - CheckDatabaseResponse：数据库检查问题列表
// 字段来源：third_party/anki/proto/anki/collection.proto
//
// @输入
// 编码：OpenCollectionRequest / CloseCollectionRequest 参数
// 解码：字节流
//
// @输出
// 编码：Uint8Array 字节
// 解码：OpChanges / UndoStatus / OpChangesAfterUndo / 问题列表
//
// @业务规则
// OpChangesWithId / OpChangesWithCount 仅提取需要的标量字段，跳过 changes 子消息。
// proto3 默认值省略，与 prost 对齐。
//
// @副作用
// 无
// ========================================================

import { 协议读取器 } from '../core/ProtoReader';
import { 协议写入器 } from '../core/ProtoWriter';

export interface OpenCollectionRequest {
  collectionPath: string;
  mediaFolderPath: string;
  mediaDbPath: string;
}

export function encodeOpenCollectionRequest(req: OpenCollectionRequest): Uint8Array {
  const w = new 协议写入器();
  if (req.collectionPath !== '') {
    w.写入字符串(1, req.collectionPath);
  }
  if (req.mediaFolderPath !== '') {
    w.写入字符串(2, req.mediaFolderPath);
  }
  if (req.mediaDbPath !== '') {
    w.写入字符串(3, req.mediaDbPath);
  }
  return w.转为字节();
}

/** BackendCollectionService.CloseCollectionRequest, with schema downgrade disabled. */
export function encodeCloseCollectionRequest(downgradeToSchema11: boolean = false): Uint8Array {
  const w = new 协议写入器();
  if (downgradeToSchema11) {
    w.写入布尔(1, downgradeToSchema11);
  }
  return w.转为字节();
}

/** OpChangesWithId：仅需 id，changes 子消息跳过 */
export function decodeOpChangesWithId(bytes: Uint8Array): number {
  const r = new 协议读取器(bytes);
  let id = 0;
  let tag;
  while ((tag = r.读取标签()) !== null) {
    if (tag.字段号 === 2) {
      id = r.读取64位整数();
    } else {
      r.跳过字段(tag.线类型);
    }
  }
  return id;
}

/** OpChangesWithCount：仅需 count */
export function decodeOpChangesWithCount(bytes: Uint8Array): number {
  const r = new 协议读取器(bytes);
  let count = 0;
  let tag;
  while ((tag = r.读取标签()) !== null) {
    if (tag.字段号 === 2) {
      count = r.读取变长整数();
    } else {
      r.跳过字段(tag.线类型);
    }
  }
  return count;
}

/** OpChanges：各实体变更标记，Undo/BuryOrSuspend 等写操作的响应 */
export interface OpChanges {
  card: boolean;
  note: boolean;
  deck: boolean;
  tag: boolean;
  notetype: boolean;
  config: boolean;
  deckConfig: boolean;
  mtime: boolean;
  browserTable: boolean;
  browserSidebar: boolean;
  noteText: boolean;
  studyQueues: boolean;
}

export function decodeOpChanges(bytes: Uint8Array): OpChanges {
  const r = new 协议读取器(bytes);
  const out: OpChanges = {
    card: false,
    note: false,
    deck: false,
    tag: false,
    notetype: false,
    config: false,
    deckConfig: false,
    mtime: false,
    browserTable: false,
    browserSidebar: false,
    noteText: false,
    studyQueues: false
  };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        out.card = r.读取布尔();
        break;
      case 2:
        out.note = r.读取布尔();
        break;
      case 3:
        out.deck = r.读取布尔();
        break;
      case 4:
        out.tag = r.读取布尔();
        break;
      case 5:
        out.notetype = r.读取布尔();
        break;
      case 6:
        out.config = r.读取布尔();
        break;
      case 7:
        out.browserTable = r.读取布尔();
        break;
      case 8:
        out.browserSidebar = r.读取布尔();
        break;
      case 9:
        out.noteText = r.读取布尔();
        break;
      case 10:
        out.studyQueues = r.读取布尔();
        break;
      case 11:
        out.deckConfig = r.读取布尔();
        break;
      case 12:
        out.mtime = r.读取布尔();
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

/** UndoStatus：undo/redo 为空串表示对应方向不可操作 */
export interface UndoStatus {
  undo: string;
  redo: string;
  lastStep: number;
}

export function decodeUndoStatus(bytes: Uint8Array): UndoStatus {
  const r = new 协议读取器(bytes);
  const out: UndoStatus = { undo: '', redo: '', lastStep: 0 };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        out.undo = r.读取字符串();
        break;
      case 2:
        out.redo = r.读取字符串();
        break;
      case 3:
        out.lastStep = r.读取变长整数();
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

/** OpChangesAfterUndo：Undo/Redo 的响应 */
export interface OpChangesAfterUndo {
  changes: OpChanges | null;
  operation: string;
  revertedToTimestamp: number;
  newStatus: UndoStatus | null;
  counter: number;
}

export function decodeOpChangesAfterUndo(bytes: Uint8Array): OpChangesAfterUndo {
  const r = new 协议读取器(bytes);
  const out: OpChangesAfterUndo = {
    changes: null,
    operation: '',
    revertedToTimestamp: 0,
    newStatus: null,
    counter: 0
  };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        out.changes = decodeOpChanges(r.读取字节());
        break;
      case 2:
        out.operation = r.读取字符串();
        break;
      case 3:
        out.revertedToTimestamp = r.读取64位整数();
        break;
      case 4:
        out.newStatus = decodeUndoStatus(r.读取字节());
        break;
      case 5:
        out.counter = r.读取变长整数();
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

/** CheckDatabaseResponse：问题列表，空数组表示检查通过 */
export function decodeCheckDatabaseResponse(bytes: Uint8Array): string[] {
  const r = new 协议读取器(bytes);
  const problems: string[] = [];
  let tag;
  while ((tag = r.读取标签()) !== null) {
    if (tag.字段号 === 1) {
      problems.push(r.读取字符串());
    } else {
      r.跳过字段(tag.线类型);
    }
  }
  return problems;
}
