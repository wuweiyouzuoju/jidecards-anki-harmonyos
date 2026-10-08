// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID PROTO-TAGS-001
// @名称 TagsMessages
//
// @作用
// 编解码 anki.tags.proto 消息（Anki 26.05），服务于「浏览侧边栏 T6」与「标签管理」：
// - TagTreeNode：标签树（递归结构，含 name/level/collapsed/children）
// - SetTagCollapsedRequest：设置标签折叠状态
// - RenameTagsRequest：重命名标签前缀
// - FindAndReplaceTagRequest：在标签中查找替换
// - CompleteTagRequest / CompleteTagResponse：标签补全
// - generic.String / generic.Empty：移除标签 / 清除未用标签 的入参
// 字段来源：third_party/anki/proto/anki/tags.proto
//
// @输入
// 编码：SetTagCollapsedRequest / RenameTagsRequest / FindAndReplaceTagRequest / CompleteTagRequest / String / Empty
// 解码：字节流 → TagTreeNode / CompleteTagResponse
//
// @输出
// 编码：Uint8Array 字节
// 解码：TagTreeNode / CompleteTagResponse
//
// @业务规则
// 服务号 45（后端标签），方法号 0-10 与 anki.tags.proto 的 11 个 RPC 一一对应。
// T6 侧边栏使用 标签树(4) + 设置标签折叠(3)；标签管理使用 清除未用(0)/移除(2)/重命名(6)/查找替换(9)/补全(10)。
// TagTreeNode.children 递归解码，深度由后端控制。
// proto3 默认值省略，与 prost 对齐。
//
// @副作用
// 纯函数，无副作用。
// ========================================================

import { 协议写入器 } from '../core/ProtoWriter';
import { 协议读取器 } from '../core/ProtoReader';
import { decodeOpChanges } from './CollectionMessages';

// 重新导出 OpChanges / OpChangesWithCount 解码器，供 标签服务 复用
export { decodeOpChanges, decodeOpChangesWithCount } from './CollectionMessages';

/** anki.tags.TagTreeNode：标签树节点（递归） */
export interface TagTreeNode {
  name: string;
  children: TagTreeNode[];
  level: number;
  collapsed: boolean;
}

/** anki.tags.SetTagCollapsedRequest */
export interface SetTagCollapsedRequest {
  name: string;
  collapsed: boolean;
}

// ---- TagTreeNode 解码（递归，参考 DeckMessages.decodeDeckTreeNode 模式） ----

export function decodeTagTreeNode(bytes: Uint8Array): TagTreeNode {
  const r = new 协议读取器(bytes);
  const node: TagTreeNode = {
    name: '',
    children: [],
    level: 0,
    collapsed: false
  };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        node.name = r.读取字符串();
        break;
      case 2:
        node.children.push(decodeTagTreeNode(r.读取字节()));
        break;
      case 3:
        node.level = r.读取变长整数();
        break;
      case 4:
        node.collapsed = r.读取布尔();
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
  return node;
}

// ---- SetTagCollapsedRequest 编码 ----

export function encodeSetTagCollapsedRequest(req: SetTagCollapsedRequest): Uint8Array {
  const w = new 协议写入器();
  if (req.name !== '') {
    w.写入字符串(1, req.name);
  }
  if (req.collapsed) {
    w.写入布尔(2, req.collapsed);
  }
  return w.转为字节();
}

// ---- 内联 generic 消息 ----

/** generic.Empty：空请求体（TagTree / ClearUnusedTags 入参） */
export function encodeEmptyRequest(): Uint8Array {
  return new Uint8Array(0);
}

/** generic.String：单字符串请求体（RemoveTags 入参，field 1 = value） */
export function encodeStringRequest(值: string): Uint8Array {
  const w = new 协议写入器();
  if (值 !== '') {
    w.写入字符串(1, 值);
  }
  return w.转为字节();
}

// ---- RenameTagsRequest ----

/** anki.tags.RenameTagsRequest：重命名标签前缀（级联影响所有子标签） */
export interface RenameTagsRequest {
  /** 当前标签前缀（含 :: 路径，如 "英语::四级"） */
  currentPrefix: string;
  /** 新标签前缀（如 "英语::六级"） */
  newPrefix: string;
}

export function encodeRenameTagsRequest(req: RenameTagsRequest): Uint8Array {
  const w = new 协议写入器();
  if (req.currentPrefix !== '') {
    w.写入字符串(1, req.currentPrefix);
  }
  if (req.newPrefix !== '') {
    w.写入字符串(2, req.newPrefix);
  }
  return w.转为字节();
}

// ---- FindAndReplaceTagRequest ----

/** anki.tags.FindAndReplaceTagRequest：在指定笔记的标签中查找替换 */
export interface FindAndReplaceTagRequest {
  /** 目标笔记 ID 列表（空=全部笔记） */
  noteIds: number[];
  /** 查找内容 */
  search: string;
  /** 替换内容 */
  replacement: string;
  /** 是否使用正则表达式 */
  regex: boolean;
  /** 是否区分大小写 */
  matchCase: boolean;
}

export function encodeFindAndReplaceTagRequest(req: FindAndReplaceTagRequest): Uint8Array {
  const w = new 协议写入器();
  if (req.noteIds.length > 0) {
    w.写入打包64位整数(1, req.noteIds);
  }
  if (req.search !== '') {
    w.写入字符串(2, req.search);
  }
  if (req.replacement !== '') {
    w.写入字符串(3, req.replacement);
  }
  if (req.regex) {
    w.写入布尔(4, true);
  }
  if (req.matchCase) {
    w.写入布尔(5, true);
  }
  return w.转为字节();
}

// ---- CompleteTagRequest / CompleteTagResponse ----

/** anki.tags.CompleteTagRequest：标签补全请求 */
export interface CompleteTagRequest {
  /** 部分标签输入（可含 :: 路径分隔） */
  input: string;
  /** 最大返回数量 */
  matchLimit: number;
}

/** anki.tags.CompleteTagResponse：标签补全响应 */
export interface CompleteTagResponse {
  /** 匹配到的标签列表 */
  tags: string[];
}

export function encodeCompleteTagRequest(req: CompleteTagRequest): Uint8Array {
  const w = new 协议写入器();
  if (req.input !== '') {
    w.写入字符串(1, req.input);
  }
  if (req.matchLimit > 0) {
    w.写入变长整数(2, req.matchLimit);
  }
  return w.转为字节();
}

export function decodeCompleteTagResponse(bytes: Uint8Array): CompleteTagResponse {
  const r = new 协议读取器(bytes);
  const res: CompleteTagResponse = { tags: [] };
  let tag;
  while ((tag = r.读取标签()) !== null) {
    if (tag.字段号 === 1) {
      res.tags.push(r.读取字符串());
    } else {
      r.跳过字段(tag.线类型);
    }
  }
  return res;
}

// ---- NoteIdsAndTagsRequest（AddNoteTags / RemoveNoteTags 共用入参） ----

/**
 * anki.tags.NoteIdsAndTagsRequest：批量给笔记添加/移除标签的入参。
 * 字段来源：third_party/anki/proto/anki/tags.proto NoteIdsAndTagsRequest
 * - field 1: repeated int64 note_ids（packed）
 * - field 2: string tags（空格分隔的多个标签，可含 :: 路径）
 */
export interface NoteIdsAndTagsRequest {
  noteIds: number[];
  tags: string;
}

export function encodeNoteIdsAndTagsRequest(req: NoteIdsAndTagsRequest): Uint8Array {
  const w = new 协议写入器();
  if (req.noteIds.length > 0) {
    w.写入打包64位整数(1, req.noteIds);
  }
  if (req.tags !== '') {
    w.写入字符串(2, req.tags);
  }
  return w.转为字节();
}
