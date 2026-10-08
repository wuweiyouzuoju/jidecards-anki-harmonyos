// SPDX-License-Identifier: AGPL-3.0-or-later
import { 后端会话 } from './后端会话';
import { 集合服务 } from './集合服务';
import type { CollectionHistoryBackend } from '../model/CollectionHistorySession';
import type { UndoStatus } from '../proto/messages/CollectionMessages';
import { CollectionUndoStatus } from '../proto/generated/CoreMessages';
import { CollectionHistoryRpc } from '../proto/generated/PrivateRpc';
export class AnkiCollectionHistoryBackend implements CollectionHistoryBackend {
    status(): Promise<UndoStatus> { return new 集合服务().获取撤销状态(); }
    async apply(redo: boolean, expected: UndoStatus): Promise<void> {
        const writer = new CollectionUndoStatus();
        writer.setUndo(expected.undo);
        writer.setRedo(expected.redo);
        writer.setLastStep(expected.lastStep);
        const rpc = new CollectionHistoryRpc(后端会话.获取实例());
        await (redo ? rpc.redo(writer.toBytes()) : rpc.undo(writer.toBytes()));
    }
}
