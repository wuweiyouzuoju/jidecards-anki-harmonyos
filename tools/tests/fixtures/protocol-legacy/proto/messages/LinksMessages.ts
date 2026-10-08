// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID PROTO-MSG-LINKS-001
// @名称 Links 消息编解码
//
// @作用
// 编解码 anki.links.proto 消息（Anki 26.05）：HelpPageLink RPC 的请求与响应。
// - HelpPageLinkRequest：携带一个 HelpPage 枚举，指明要打开的官方文档章节。
// - 响应为 generic.String（field 1 = val），即官方文档 URL。
// 字段来源：third_party/anki/proto/anki/links.proto
//
// @输入
// 编码：HelpPage 枚举值
// 解码：字节流
//
// @输出
// 编码：Uint8Array 字节
// 解码：string（官方文档 URL）
//
// @业务规则
// 服务号 21（后端链接），方法号 0（帮助页链接），与 backend.rs run_backend_links_service_method 对齐。
// proto3 默认值省略：page=0（NOTE_TYPE）时不写字段，与 prost 一致。
// 设置页底部「查看 Anki 官方文档」入口传 INDEX(10)，后端返回 docs.ankiweb.net 主页 URL。
//
// @副作用
// 纯函数，无副作用。
// ========================================================

import { 协议写入器 } from '../core/ProtoWriter';
import { 协议读取器 } from '../core/ProtoReader';

/** HelpPageLinkRequest.HelpPage：官方文档章节（与 anki/links.proto 一一对应） */
export enum HelpPage {
  NOTE_TYPE = 0,
  BROWSING = 1,
  BROWSING_FIND_AND_REPLACE = 2,
  BROWSING_NOTES_MENU = 3,
  KEYBOARD_SHORTCUTS = 4,
  EDITING = 5,
  ADDING_CARD_AND_NOTE = 6,
  ADDING_A_NOTE_TYPE = 7,
  LATEX = 8,
  PREFERENCES = 9,
  INDEX = 10,
  TEMPLATES = 11,
  FILTERED_DECK = 12,
  IMPORTING = 13,
  CUSTOMIZING_FIELDS = 14,
  DECK_OPTIONS = 15,
  EDITING_FEATURES = 16,
  FULL_SCREEN_ISSUE = 17,
  CARD_TYPE_DUPLICATE = 18,
  CARD_TYPE_NO_FRONT_FIELD = 19,
  CARD_TYPE_MISSING_CLOZE = 20,
  TROUBLESHOOTING = 21,
  CARD_TYPE_TEMPLATE_ERROR = 22
}

/**
 * HelpPageLinkRequest 编码：field 1 = HelpPage 枚举（varint）。
 * page=0（NOTE_TYPE）为 proto3 默认值，省略不写以与 prost 对齐。
 */
export function encodeHelpPageLinkRequest(page: HelpPage): Uint8Array {
  const w = new 协议写入器();
  if (page !== HelpPage.NOTE_TYPE) {
    w.写入变长整数(1, page);
  }
  return w.转为字节();
}

/**
 * generic.String 响应解码：field 1 = val（string）。
 * 用于 HelpPageLink 的返回值（官方文档 URL）。
 */
export function decodeStringResponse(bytes: Uint8Array): string {
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
