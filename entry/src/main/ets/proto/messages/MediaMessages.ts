// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID PROTO-MSG-MEDIA-001
// @名称 媒体消息编解码
//
// @作用
// 编解码 anki.media.proto 消息（Anki 26.05）：
// - CheckMediaResponse：检查媒体结果（unused/missing/missing_media_notes/report/have_trash）
// - TrashMediaFilesRequest：媒体文件进回收站请求（repeated fnames）
// - generic.Empty：CheckMedia/EmptyTrash/RestoreTrash 的空入参
// - generic.StringList：ExtractStaticMediaFiles 的返回值（repeated vals）
// 字段来源：third_party/anki/proto/anki/media.proto、anki/generic.proto
//
// @输入
// 编码：string[]（fnames）/ number（notetypeId 委托 NotetypeMessages）
// 解码：字节流
//
// @输出
// 编码：Uint8Array 字节
// 解码：CheckMediaResponse / string[]
//
// @业务规则
// proto3 默认值（空串/0/false）不在网络上传输；repeated string 每个元素单独编一个 tag。
// CheckMediaResponse.missing_media_notes 是 repeated int64，非 packed（后端逐个编码）。
//
// @副作用
// 无
// ========================================================

import { 协议读取器 } from '../core/ProtoReader';
import { 线类型_长度分隔, 协议写入器 } from '../core/ProtoWriter';

/** CheckMediaResponse：检查媒体后 unused/missing 列表 + 回收站状态 + 文本报告。 */
export interface CheckMediaResponse {
  /** collection.media 中存在但未被任何笔记引用的文件名 */
  unused: string[];
  /** 被笔记引用但在 collection.media 中找不到的文件名 */
  missing: string[];
  /** 缺失媒体的笔记 ID（int64） */
  missingMediaNotes: number[];
  /** 人类可读的检查报告（Anki 桌面端直接展示） */
  report: string;
  /** 回收站是否有内容（true=可清空/恢复） */
  haveTrash: boolean;
}

// The report is rendered as one scrollable text block; no per-file UI nodes are created.

/** 保留 unused 供一次性清理，报告负责展示全部明细。 */
export interface CheckMediaSummary {
  unused: string[];
  unusedCount: number;
  missingCount: number;
  report: string;
  haveTrash: boolean;
}

/** 面板显示 Core 报告，不把每个文件展开成 ArkUI 节点。 */
export function decodeCheckMediaSummary(bytes: Uint8Array): CheckMediaSummary {
  const reader = new 协议读取器(bytes);
  const result: CheckMediaSummary = {
    unused: [], unusedCount: 0, missingCount: 0, report: '', haveTrash: false
  };
  let tag;
  while ((tag = reader.读取标签()) !== null) {
    if (tag.字段号 === 1) {
      result.unusedCount++;
      result.unused.push(reader.读取字符串());
    } else if (tag.字段号 === 2) {
      result.missingCount++;
      reader.跳过字段(tag.线类型);
    } else if (tag.字段号 === 4) {
      result.report = reader.读取字符串();
    } else if (tag.字段号 === 5) {
      result.haveTrash = reader.读取布尔();
    } else {
      reader.跳过字段(tag.线类型);
    }
  }
  return result;
}

/**
 * 编码 generic.Empty（无字段），返回空字节数组。
 * CheckMedia / EmptyTrash / RestoreTrash 的入参。
 */
export function encodeEmpty(): Uint8Array {
  return new Uint8Array(0);
}

/**
 * 解码 CheckMediaResponse（media.proto）：
 * - field 1: repeated string unused
 * - field 2: repeated string missing
 * - field 3: repeated int64 missing_media_notes
 * - field 4: string report
 * - field 5: bool have_trash
 */
export function decodeCheckMediaResponse(bytes: Uint8Array): CheckMediaResponse {
  const r = new 协议读取器(bytes);
  const out: CheckMediaResponse = {
    unused: [],
    missing: [],
    missingMediaNotes: [],
    report: '',
    haveTrash: false
  };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        out.unused.push(r.读取字符串());
        break;
      case 2:
        out.missing.push(r.读取字符串());
        break;
      case 3:
        // repeated int64 missing_media_notes：proto3 默认 packed（线类型 2），兼客服端旧 unpacked
        if (tag.线类型 === 线类型_长度分隔) {
          const packed: number[] = r.读取打包64位整数();
          for (const id of packed) {
            out.missingMediaNotes.push(id);
          }
        } else {
          out.missingMediaNotes.push(r.读取64位整数());
        }
        break;
      case 4:
        out.report = r.读取字符串();
        break;
      case 5:
        out.haveTrash = r.读取布尔();
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

/**
 * 编码 TrashMediaFilesRequest（media.proto）：
 * - field 1: repeated string fnames（每个文件名单独编一个 tag）
 */
export function encodeTrashMediaFilesRequest(fnames: string[]): Uint8Array {
  const w = new 协议写入器();
  for (let i = 0; i < fnames.length; i++) {
    w.写入字符串(1, fnames[i]);
  }
  return w.转为字节();
}

/**
 * 解码 generic.StringList（generic.proto）：
 * - field 1: repeated string vals
 * ExtractStaticMediaFiles 的返回值。
 */
export function decodeStringList(bytes: Uint8Array): string[] {
  const r = new 协议读取器(bytes);
  const out: string[] = [];
  let tag;
  while ((tag = r.读取标签()) !== null) {
    if (tag.字段号 === 1) {
      out.push(r.读取字符串());
    } else {
      r.跳过字段(tag.线类型);
    }
  }
  return out;
}
