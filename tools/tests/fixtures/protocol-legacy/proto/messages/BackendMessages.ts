// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID PROTO-MSG-BACKEND-001
// @名称 后端初始化与错误消息编解码
//
// @作用
// 编解码 anki.backend.BackendInit / BackendError 消息（Anki 26.05）。
// 字段来源：third_party/anki/proto/anki/backend.proto
//
// @输入
// 编码：BackendInit 结构（语言列表、locale 目录、server 标志）
// 解码：字节流
//
// @输出
// 编码：Uint8Array 字节
// 解码：BackendErrorInfo（错误文案 / kind / 上下文）
//
// @业务规则
// proto3 默认值省略，与 prost 对齐。
// BackendError 解码时跳过 help_page / backtrace 字段。
//
// @副作用
// 无
// ========================================================

import { 协议读取器 } from '../core/ProtoReader';
import { 协议写入器 } from '../core/ProtoWriter';

export interface BackendInit {
  preferredLangs: string[];
  localeFolderPath: string;
  server: boolean;
}

export function encodeBackendInit(init: BackendInit): Uint8Array {
  const w = new 协议写入器();
  for (const lang of init.preferredLangs) {
    if (lang !== '') {
      w.写入字符串(1, lang);
    }
  }
  if (init.localeFolderPath !== '') {
    w.写入字符串(2, init.localeFolderPath);
  }
  if (init.server) {
    w.写入布尔(3, true);
  }
  return w.转为字节();
}

export interface BackendErrorInfo {
  message: string;
  kind: number;
  context: string;
}

export function decodeBackendError(bytes: Uint8Array): BackendErrorInfo {
  const r = new 协议读取器(bytes);
  const info: BackendErrorInfo = { message: '', kind: 0, context: '' };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        info.message = r.读取字符串();
        break;
      case 2:
        info.kind = r.读取变长整数();
        break;
      case 4:
        info.context = r.读取字符串();
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return info;
}
