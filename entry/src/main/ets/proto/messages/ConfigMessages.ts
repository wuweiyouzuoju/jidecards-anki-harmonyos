// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID PROTO-CONFIG-001
// @名称 ConfigMessages
//
// @作用
// 编解码 anki.config.proto 消息（Anki 26.05），服务于「浏览侧边栏 T6 已保存搜索」：
// - GetConfigJson / SetConfigJson：按字符串 key 存取 JSON（saved searches 走此路径）
// - GetConfigBool / SetConfigBool：按 ConfigKey.Bool 枚举存取布尔（折叠状态走此路径）
// 字段来源：third_party/anki/proto/anki/config.proto
//
// @输入
// 编码：string key / ConfigKey.Bool / JSON 字符串 / bool 值
// 解码：字节流 → string（JSON）/ bool
//
// @输出
// 编码：Uint8Array 字节
// 解码：string / bool
//
// @业务规则
// 服务号 9（后端配置），方法号 0-10 与 anki.config.proto 的 11 个 RPC 一一对应。
// T6 侧边栏仅使用 获取配置JSON(0) + 设置配置JSON(1) + 获取配置布尔(5) + 设置配置布尔(6) 四个方法。
// saved searches 在 Anki 桌面端存在 config 表的 "savedSearches" key 下，JSON 数组格式。
// 折叠状态走 ConfigKey.Bool 枚举（COLLAPSE_TAGS=4 / COLLAPSE_DECKS=6 / COLLAPSE_SAVED_SEARCHES=7）。
//
// @副作用
// 纯函数，无副作用。
// ========================================================

import { 协议写入器 } from '../core/ProtoWriter';
import { 协议读取器 } from '../core/ProtoReader';

// 重新导出 OpChanges 解码器，供 配置服务.设置配置JSON/设置配置布尔 复用
export { decodeOpChanges } from './CollectionMessages';

/**
 * anki.config.ConfigKey.Bool 枚举（按需暴露浏览模式和侧边栏折叠状态）。
 * 完整枚举见 config.proto ConfigKey.Bool（29 项），此处按需暴露。
 */
export enum ConfigKeyBool {
  BROWSER_TABLE_SHOW_NOTES_MODE = 0,
  COLLAPSE_TAGS = 4,
  COLLAPSE_DECKS = 6,
  COLLAPSE_SAVED_SEARCHES = 7
}

// ---- generic 消息编解码 ----

/** generic.String：仅一个 field 1 string（GetConfigJson 入参） */
export function encodeStringRequest(value: string): Uint8Array {
  const w = new 协议写入器();
  if (value !== '') {
    w.写入字符串(1, value);
  }
  return w.转为字节();
}

/** generic.Json：仅一个 field 1 string（JSON 序列化字符串，GetConfigJson 返回） */
export function decodeJsonResponse(bytes: Uint8Array): string {
  const r = new 协议读取器(bytes);
  let value = '';
  let tag;
  while ((tag = r.读取标签()) !== null) {
    if (tag.字段号 === 1) {
      value = r.读取字符串();
    } else {
      r.跳过字段(tag.线类型);
    }
  }
  return value;
}

/** generic.Bool：仅一个 field 1 bool（GetConfigBool 返回） */
export function decodeBoolResponse(bytes: Uint8Array): boolean {
  const r = new 协议读取器(bytes);
  let value = false;
  let tag;
  while ((tag = r.读取标签()) !== null) {
    if (tag.字段号 === 1) {
      value = r.读取布尔();
    } else {
      r.跳过字段(tag.线类型);
    }
  }
  return value;
}

/** generic.Empty：空请求体 */
export function encodeEmptyRequest(): Uint8Array {
  return new Uint8Array(0);
}

// ---- GetConfigBoolRequest 编码 ----

/** anki.config.GetConfigBoolRequest { ConfigKey.Bool key = 1; } */
export function encodeGetConfigBoolRequest(key: ConfigKeyBool): Uint8Array {
  const w = new 协议写入器();
  // ConfigKeyBool 枚举从 4 开始（无 0 值），但 proto3 默认值仍为 0；
  // 用 number 强转避免 ArkTS 枚举与字面量无重叠的编译错误
  if ((key as number) !== 0) {
    w.写入变长整数(1, key);
  }
  return w.转为字节();
}

// ---- SetConfigBoolRequest 编码 ----

/** anki.config.SetConfigBoolRequest { ConfigKey.Bool key = 1; bool value = 2; bool undoable = 3; } */
export interface SetConfigBoolRequest {
  key: ConfigKeyBool;
  value: boolean;
  undoable: boolean;
}

export function encodeSetConfigBoolRequest(req: SetConfigBoolRequest): Uint8Array {
  const w = new 协议写入器();
  // ConfigKeyBool 枚举从 4 开始（无 0 值），用 number 强转避免枚举与字面量无重叠的编译错误
  if ((req.key as number) !== 0) {
    w.写入变长整数(1, req.key);
  }
  if (req.value) {
    w.写入布尔(2, req.value);
  }
  if (req.undoable) {
    w.写入布尔(3, req.undoable);
  }
  return w.转为字节();
}

// ---- SetConfigJsonRequest 编码 ----

/** anki.config.SetConfigJsonRequest { string key = 1; bytes value_json = 2; bool undoable = 3; } */
export interface SetConfigJsonRequest {
  key: string;
  valueJson: string;
  undoable: boolean;
}

export function encodeSetConfigJsonRequest(req: SetConfigJsonRequest): Uint8Array {
  const w = new 协议写入器();
  if (req.key !== '') {
    w.写入字符串(1, req.key);
  }
  if (req.valueJson !== '') {
    // bytes 字段按 string 编码（UTF-8），proto3 bytes 与 string wire format 相同（length-delimited）
    w.写入字符串(2, req.valueJson);
  }
  if (req.undoable) {
    w.写入布尔(3, req.undoable);
  }
  return w.转为字节();
}
