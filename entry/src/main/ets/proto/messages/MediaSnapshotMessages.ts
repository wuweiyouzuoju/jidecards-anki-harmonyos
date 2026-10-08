// SPDX-License-Identifier: AGPL-3.0-or-later
// 应用扩展协议，唯一原生实现 native/rsharmony/src/media_snapshot.rs；不修改 Anki RPC。
import { JideMediaRequest, JideMediaPage } from '../generated/CoreMessages';
import { MediaSnapshotRpc } from '../generated/PrivateRpc';
export const MEDIA_SNAPSHOT_SERVICE: number = MediaSnapshotRpc.SERVICE;
export interface MediaSnapshotPage {
    token: number;
    unusedCount: number;
    missingCount: number;
    haveTrash: boolean;
    report: string;
    nextOffset: number;
    files: string[];
    noteIds?: number[];
    missingNoteCount?: number;
    taggedCount?: number;
}
export function encodeMediaSnapshotRequest(token: number, offset: number = 0): Uint8Array {
    const writer = new JideMediaRequest();
    writer.setToken(token);
    writer.setOffset(offset);
    return writer.转为字节();
}
export function decodeMediaSnapshotPage(bytes: Uint8Array): MediaSnapshotPage {
    const m = new JideMediaPage(bytes);
    return { token: m.getToken(), unusedCount: m.getUnusedCount(), missingCount: m.getMissingCount(),
        haveTrash: m.getHaveTrash(), report: m.getReport(), nextOffset: m.getNextOffset(), files: m.getFiles(),
        noteIds: m.getNoteIds(), missingNoteCount: m.getMissingNoteCount(), taggedCount: m.getTaggedCount() };
}
