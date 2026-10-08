// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID PROTO-MSG-ANKIWEB-001
// @名称 AnkiWeb 消息编解码
//
// @作用
// 编解码 anki.ankiweb.proto 消息（Anki 26.05）：addon 信息查询、版本更新检查。
// 仅覆盖本项目使用的字段，与 prost 编码对齐：proto3 默认值省略。
//
// @输入
// 编码：GetAddonInfoRequest / CheckForUpdateRequest 结构
// 解码：字节流
//
// @输出
// 编码：Uint8Array 字节
// 解码：GetAddonInfoResponse / CheckForUpdateResponse 结构
//
// @业务规则
// packed repeated uint32 单独手写 varint 拼接：协议写入器.写入变长整数 会写 tag，
// 不适合拼 packed payload（连续 varint 无 tag）。
// optional 字段不存在时为空串/0。
//
// @副作用
// 无
// ========================================================

import { 协议读取器 } from '../core/ProtoReader';
import { 协议写入器 } from '../core/ProtoWriter';

/** GetAddonInfoRequest：客户端版本 + 最多 25 个 addon id */
export interface GetAddonInfoRequest {
  clientVersion: number;
  addonIds: number[];
}

/** AddonInfo：单个 addon 的元信息 */
export interface AddonInfo {
  id: number;
  modified: number;       // int64
  minVersion: number;
  maxVersion: number;
}

/** GetAddonInfoResponse：addon 列表（请求里没有的 addon 不在此列表中） */
export interface GetAddonInfoResponse {
  info: AddonInfo[];
}

/** CheckForUpdateRequest：客户端自报信息 */
export interface CheckForUpdateRequest {
  version: number;
  buildhash: string;
  os: string;
  installId: number;      // int64
  lastMessageId: number;
}

/** CheckForUpdateResponse：optional 字段可能不存在 */
export interface CheckForUpdateResponse {
  newVersion: string;      // optional，不存在时为空串
  currentTime: number;    // int64
  message: string;        // optional，不存在时为空串
  lastMessageId: number;
}

// ---- 编码 ----

export function encodeGetAddonInfoRequest(req: GetAddonInfoRequest): Uint8Array {
  const w = new 协议写入器();
  if (req.clientVersion !== 0) {
    w.写入变长整数(1, req.clientVersion);
  }
  if (req.addonIds.length > 0) {
    // packed repeated uint32：field 2 wire type 2，payload 是连续 raw varint（无 tag），
    // 与 prost 的 packed 默认编码一致。协议写入器.写入变长整数 会写 tag，不适合拼 packed payload，
    // 因此单独手写一份 uint32 varint 拼接。
    w.写入字节(2, encodePackedUint32(req.addonIds));
  }
  return w.转为字节();
}

/** 把 uint32 数组编成 packed payload（连续 varint，无 tag） */
function encodePackedUint32(values: number[]): Uint8Array {
  const bytes: number[] = [];
  for (const v of values) {
    let n = v >= 0 ? v : 0;
    // uint32 最大 5 字节
    while (n > 0x7f) {
      bytes.push((n & 0x7f) | 0x80);
      n >>>= 7;
    }
    bytes.push(n);
  }
  return new Uint8Array(bytes);
}

export function encodeCheckForUpdateRequest(req: CheckForUpdateRequest): Uint8Array {
  const w = new 协议写入器();
  if (req.version !== 0) {
    w.写入变长整数(1, req.version);
  }
  if (req.buildhash !== '') {
    w.写入字符串(2, req.buildhash);
  }
  if (req.os !== '') {
    w.写入字符串(3, req.os);
  }
  if (req.installId !== 0) {
    w.写入64位整数(4, req.installId);
  }
  if (req.lastMessageId !== 0) {
    w.写入变长整数(5, req.lastMessageId);
  }
  return w.转为字节();
}

// ---- 解码 ----

export function decodeAddonInfo(bytes: Uint8Array): AddonInfo {
  const r = new 协议读取器(bytes);
  const out: AddonInfo = {
    id: 0,
    modified: 0,
    minVersion: 0,
    maxVersion: 0
  };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        out.id = r.读取变长整数();
        break;
      case 2:
        out.modified = r.读取64位整数();
        break;
      case 3:
        out.minVersion = r.读取变长整数();
        break;
      case 4:
        out.maxVersion = r.读取变长整数();
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

export function decodeGetAddonInfoResponse(bytes: Uint8Array): GetAddonInfoResponse {
  const r = new 协议读取器(bytes);
  const out: GetAddonInfoResponse = { info: [] };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        out.info.push(decodeAddonInfo(r.读取字节()));
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}

export function decodeCheckForUpdateResponse(bytes: Uint8Array): CheckForUpdateResponse {
  const r = new 协议读取器(bytes);
  const out: CheckForUpdateResponse = {
    newVersion: '',
    currentTime: 0,
    message: '',
    lastMessageId: 0
  };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        out.newVersion = r.读取字符串();
        break;
      case 2:
        out.currentTime = r.读取64位整数();
        break;
      case 3:
        out.message = r.读取字符串();
        break;
      case 4:
        out.lastMessageId = r.读取变长整数();
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return out;
}
