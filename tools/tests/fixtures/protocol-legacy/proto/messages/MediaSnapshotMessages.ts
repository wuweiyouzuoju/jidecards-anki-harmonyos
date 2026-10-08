// SPDX-License-Identifier: AGPL-3.0-or-later
// 应用扩展协议，唯一原生实现 native/rsharmony/src/media_snapshot.rs；不修改 Anki RPC。
import { 协议读取器 } from '../core/ProtoReader';
import { 协议写入器 } from '../core/ProtoWriter';

export const MEDIA_SNAPSHOT_SERVICE: number = 1000;
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
  const writer = new 协议写入器();
  writer.写入变长整数(1, token);
  writer.写入变长整数(2, offset);
  return writer.转为字节();
}
export function decodeMediaSnapshotPage(bytes: Uint8Array): MediaSnapshotPage {
  const reader = new 协议读取器(bytes);
  const page: MediaSnapshotPage = { token: 0, unusedCount: 0, missingCount: 0,
    haveTrash: false, report: '', nextOffset: 0, files: [], noteIds: [], missingNoteCount: 0, taggedCount: 0 };
  let tag;
  while ((tag = reader.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1: page.token = reader.读取变长整数(); break;
      case 2: page.unusedCount = reader.读取变长整数(); break;
      case 3: page.missingCount = reader.读取变长整数(); break;
      case 4: page.haveTrash = reader.读取布尔(); break;
      case 5: page.report = reader.读取字符串(); break;
      case 6: page.nextOffset = reader.读取变长整数(); break;
      case 7: page.files.push(reader.读取字符串()); break;
      case 8:
        if (tag.线类型 === 2) page.noteIds = (page.noteIds ?? []).concat(reader.读取打包64位整数());
        else (page.noteIds ?? []).push(reader.读取64位整数());
        break;
      case 9: page.missingNoteCount = reader.读取变长整数(); break;
      case 10: page.taggedCount = reader.读取变长整数(); break;
      default: reader.跳过字段(tag.线类型);
    }
  }
  return page;
}
