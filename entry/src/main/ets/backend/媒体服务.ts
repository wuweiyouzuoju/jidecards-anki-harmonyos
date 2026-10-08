import { MediaSnapshotRpc } from '../proto/generated/PrivateRpc';
import { CoreRpc } from '../proto/generated/CoreRpc';
// SPDX-License-Identifier: AGPL-3.0-or-later
// ========================================================
// @块ID BACKEND-SVC-MEDIA-001
// @名称 媒体服务边界
//
// @作用
// 包装后端媒体服务的 6 个 RPC：添加媒体文件 / 检查媒体 / 媒体文件进回收站 /
// 清空回收站 / 恢复回收站 / 提取静态媒体文件。
// 编解码经 MediaMessages + NotetypeMessages，通过 后端会话 调用；不持有 UI 状态。
//
// @输入
// 添加媒体文件：文件名（期望名，string）/ 字节（Uint8Array）
// 检查媒体：无入参（generic.Empty）
// 媒体文件进回收站：文件名列表（string[]）
// 清空回收站 / 恢复回收站：无入参（generic.Empty）
// 提取静态媒体文件：笔记类型 ID（number）
//
// @输出
// 添加媒体文件：Promise<string>（最终写入 collection.media 的文件名）
// 检查媒体：Promise<CheckMediaResponse>（unused/missing/missing_media_notes/report/have_trash）
// 媒体文件进回收站 / 清空回收站 / 恢复回收站：Promise<void>
// 提取静态媒体文件：Promise<string[]>（提取出的媒体文件名列表）
//
// @业务规则
// AddMediaFileRequest { desired_name: string = 1; data: bytes = 2 }。
// 返回 generic.String { val: string = 1 }，val 即最终文件名。
// TrashMediaFilesRequest { repeated string fnames = 1 }。
// CheckMediaResponse { repeated string unused = 1; repeated string missing = 2;
//   repeated int64 missing_media_notes = 3; string report = 4; bool have_trash = 5 }。
// ExtractStaticMediaFiles 入参 NotetypeId { int64 id = 1 }，返回 generic.StringList。
// proto3 默认值（空串）不在网络上传输。
//
// @副作用
// 通过 后端会话 间接调用 NAPI 桥；会在 collection.media 目录写入/删除/恢复文件。
// ========================================================
import type { MediaSnapshotPage } from '../proto/messages/MediaSnapshotMessages';
import { 后端会话 } from './后端会话';
import { MEDIA_SNAPSHOT_SERVICE, encodeMediaSnapshotRequest, decodeMediaSnapshotPage } from '../proto/messages/MediaSnapshotMessages';
import { MediaAddMediaFileRequest, GenericString } from '../proto/generated/CoreMessages';
import { encodeNotetypeId } from '../proto/messages/NotetypeMessages';
import { decodeCheckMediaResponse, decodeStringList, encodeEmpty, encodeTrashMediaFilesRequest } from '../proto/messages/MediaMessages';
import type { CheckMediaResponse } from '../proto/messages/MediaMessages';
function encodeAddMediaFileRequest(name: string, bytes: Uint8Array): Uint8Array {
    const m = new MediaAddMediaFileRequest();
    if (name !== '')
        m.setDesiredName(name);
    m.setData(bytes);
    return m.toBytes();
}
function decodeString(bytes: Uint8Array): string { return new GenericString(bytes).getVal(); }
/** 媒体管理后端边界：添加媒体文件 / 检查媒体 / 回收站操作 / 提取静态媒体文件。 */
export class 媒体服务 {
    private readonly 会话: 后端会话 = 后端会话.获取实例();
    async createSnapshot(): Promise<MediaSnapshotPage> {
        return decodeMediaSnapshotPage(await new MediaSnapshotRpc(this.会话).check(encodeEmpty()));
    }
    async reportPage(token: number, offset: number): Promise<MediaSnapshotPage> {
        return decodeMediaSnapshotPage(await new MediaSnapshotRpc(this.会话).report(encodeMediaSnapshotRequest(token, offset)));
    }
    async unusedPage(token: number, offset: number): Promise<MediaSnapshotPage> {
        return decodeMediaSnapshotPage(await new MediaSnapshotRpc(this.会话).unused(encodeMediaSnapshotRequest(token, offset)));
    }
    async trashSnapshot(token: number): Promise<void> {
        await new MediaSnapshotRpc(this.会话).trash(encodeMediaSnapshotRequest(token));
    }
    async releaseSnapshot(token: number): Promise<void> {
        await new MediaSnapshotRpc(this.会话).end(encodeMediaSnapshotRequest(token));
    }
    async missingNotesPage(token: number, offset: number): Promise<MediaSnapshotPage> {
        return decodeMediaSnapshotPage(await new MediaSnapshotRpc(this.会话).missingNotes(encodeMediaSnapshotRequest(token, offset)));
    }
    async tagMissingNotes(token: number): Promise<number> {
        return (decodeMediaSnapshotPage(await new MediaSnapshotRpc(this.会话).tagMissing(encodeMediaSnapshotRequest(token))).taggedCount ?? 0);
    }
    /** 牌组删除差集仍需文件名，但不再传输完整报告和缺失笔记。 */
    async unusedFiles(): Promise<string[]> {
        const snapshot: MediaSnapshotPage = await this.createSnapshot();
        const files: string[] = [];
        let offset: number = 0;
        try {
            do {
                const page: MediaSnapshotPage = await this.unusedPage(snapshot.token, offset);
                for (const file of page.files)
                    files.push(file);
                offset = page.nextOffset;
            } while (offset !== 0);
            return files;
        }
        finally {
            await this.releaseSnapshot(snapshot.token);
        }
    }
    /**
     * 把字节写入 collection.media 并返回最终文件名。
     * 图片遮盖建卡流程等使用。
     */
    async 添加媒体文件(文件名: string, 字节: Uint8Array): Promise<string> {
        const 响应字节 = await new CoreRpc(this.会话).Media_add_media_file(encodeAddMediaFileRequest(文件名, 字节));
        return decodeString(响应字节);
    }
    /**
     * 检查媒体：返回 collection.media 中未使用的文件、被笔记引用但缺失的文件、
     * 缺失媒体的笔记 ID 列表、文本报告，以及回收站是否有内容。
     * 失败以 BackendError 抛出。
     */
    async 检查媒体(): Promise<CheckMediaResponse> {
        const 响应字节 = await new CoreRpc(this.会话).Media_check_media(encodeEmpty());
        return decodeCheckMediaResponse(响应字节);
    }
    /**
     * 将指定文件名列表放入回收站（后端 TrashMediaFiles）。
     * 文件从 collection.media 移到 trash 子目录，可通过 恢复回收站 找回。
     * 失败以 BackendError 抛出。
     */
    async 媒体文件进回收站(文件名列表: string[]): Promise<void> {
        for (let offset: number = 0; offset < 文件名列表.length; offset += 256) {
            await new CoreRpc(this.会话).Media_trash_media_files(encodeTrashMediaFilesRequest(文件名列表.slice(offset, offset + 256)));
        }
    }
    /**
     * 清空回收站：永久删除回收站中的所有媒体文件，不可恢复。
     * 失败以 BackendError 抛出。
     */
    async 清空回收站(): Promise<void> {
        await new CoreRpc(this.会话).Media_empty_trash(encodeEmpty());
    }
    /**
     * 恢复回收站：将回收站中的所有媒体文件移回 collection.media。
     * 失败以 BackendError 抛出。
     */
    async 恢复回收站(): Promise<void> {
        await new CoreRpc(this.会话).Media_restore_trash(encodeEmpty());
    }
    /**
     * 提取静态媒体文件：返回指定笔记类型模板中引用的媒体文件名列表。
     * 用于在导出/同步前确认笔记类型依赖的媒体文件是否齐全。
     * 失败以 BackendError 抛出。
     */
    async 提取静态媒体文件(笔记类型ID: number): Promise<string[]> {
        const 响应字节 = await new CoreRpc(this.会话).Media_extract_static_media_files(encodeNotetypeId(笔记类型ID));
        return decodeStringList(响应字节);
    }
}
