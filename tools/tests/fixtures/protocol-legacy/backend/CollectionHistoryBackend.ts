// SPDX-License-Identifier: AGPL-3.0-or-later
import { 后端会话 } from './后端会话';
import { 集合服务 } from './集合服务';
import type { CollectionHistoryBackend } from '../model/CollectionHistorySession';
import type { UndoStatus } from '../proto/messages/CollectionMessages';
import { 协议写入器 } from '../proto/core/ProtoWriter';

export class AnkiCollectionHistoryBackend implements CollectionHistoryBackend {
  status(): Promise<UndoStatus> { return new 集合服务().获取撤销状态(); }
  async apply(redo: boolean, expected: UndoStatus): Promise<void> {
    const writer = new 协议写入器();
    writer.写入字符串(1, expected.undo); writer.写入字符串(2, expected.redo);
    writer.写入变长整数(3, expected.lastStep);
    await 后端会话.获取实例().调用(1003, redo ? 1 : 0, writer.转为字节());
  }
}
