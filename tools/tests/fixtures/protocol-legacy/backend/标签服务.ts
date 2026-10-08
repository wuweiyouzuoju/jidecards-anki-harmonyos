// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID BACKEND-SVC-TAGS-001
// @名称 标签服务边界
//
// @作用
// 包装后端标签服务的 7 个 RPC（T6 侧边栏 + 标签管理）：
// - 标签树（TagTree）：返回 TagTreeNode 递归树
// - 设置标签折叠（SetTagCollapsed）：持久化标签折叠状态
// - 清除未用标签（ClearUnusedTags）：删除未关联笔记的标签
// - 移除标签（RemoveTags）：按前缀删除标签
// - 重命名标签（RenameTags）：重命名标签前缀（级联子标签）
// - 查找并替换标签（FindAndReplaceTag）：在笔记标签中查找替换
// - 补全标签（CompleteTag）：根据部分输入补全标签名
// 方法索引来源：服务索引.ts（提取自 Anki 26.05 生成代码 backend.rs）。
//
// @输入
// TagTree：无入参（generic.Empty）
// SetTagCollapsed：name + collapsed
// ClearUnusedTags：无入参
// RemoveTags：标签前缀字符串（generic.String）
// RenameTags：currentPrefix + newPrefix
// FindAndReplaceTag：noteIds + search + replacement + regex + matchCase
// CompleteTag：input + matchLimit
//
// @输出
// Promise<TagTreeNode> / Promise<OpChanges> / Promise<number>(count) / Promise<CompleteTagResponse>
//
// @业务规则
// 服务号 45（后端标签），方法号见 服务索引.标签方法。
// 标签树返回的 TagTreeNode 含 children 递归结构，level 由后端控制缩进深度。
// 折叠状态持久化到 collection.anki2 配置表，下次打开侧边栏复用。
// 写操作返回 OpChangesWithCount，count 为受影响的笔记/标签数。
// 失败以 BackendError 抛出，message 可直接展示。
//
// @副作用
// 通过 后端会话 间接调用 NAPI 桥；标签树仅读取，其余写操作修改 Anki collection。
// ========================================================

import { 后端会话 } from './后端会话';
import { 服务号, 标签方法 } from './服务索引';
import type {
  TagTreeNode,
  SetTagCollapsedRequest,
  RenameTagsRequest,
  FindAndReplaceTagRequest,
  CompleteTagRequest,
  CompleteTagResponse,
  NoteIdsAndTagsRequest
} from '../proto/messages/TagsMessages';
import {
  decodeTagTreeNode,
  decodeCompleteTagResponse,
  encodeEmptyRequest,
  encodeStringRequest,
  encodeSetTagCollapsedRequest,
  encodeRenameTagsRequest,
  encodeFindAndReplaceTagRequest,
  encodeCompleteTagRequest,
  encodeNoteIdsAndTagsRequest
} from '../proto/messages/TagsMessages';
import { decodeOpChanges, decodeOpChangesWithCount } from '../proto/messages/CollectionMessages';
import type { OpChanges } from '../proto/messages/CollectionMessages';

export class 标签服务 {
  private readonly 会话: 后端会话 = 后端会话.获取实例();

  /**
   * 标签树（TagTree）。返回 TagTreeNode 递归树，含 name/level/collapsed/children。
   * UI 侧边栏用此树渲染标签分区，level 驱动缩进，collapsed 驱动展开/收起图标。
   * @returns 标签树根节点（name 为空，children 为顶级标签）
   */
  async 标签树(): Promise<TagTreeNode> {
    const 响应字节 = await this.会话.调用(
      服务号.后端标签, 标签方法.标签树, encodeEmptyRequest());
    return decodeTagTreeNode(响应字节);
  }

  /**
   * 设置标签折叠（SetTagCollapsed）。持久化标签折叠状态到配置表。
   * @param 请求 name（标签全名，含 :: 路径） + collapsed
   * @returns OpChanges（含配置变更标记）
   */
  async 设置标签折叠(请求: SetTagCollapsedRequest): Promise<OpChanges> {
    const 响应字节 = await this.会话.调用(
      服务号.后端标签, 标签方法.设置标签折叠, encodeSetTagCollapsedRequest(请求));
    return decodeOpChanges(响应字节);
  }

  /**
   * 清除未用标签（ClearUnusedTags）。删除所有未关联到笔记的标签。
   * @returns 被清除的标签数量
   */
  async 清除未用标签(): Promise<number> {
    const 响应字节 = await this.会话.调用(
      服务号.后端标签, 标签方法.清除未用标签, encodeEmptyRequest());
    return decodeOpChangesWithCount(响应字节);
  }

  /**
   * 移除标签（RemoveTags）。按前缀删除标签（含所有子标签）。
   * @param 标签名 标签前缀（如 "英语" 会删除 "英语" 及 "英语::四级" 等）
   * @returns 被移除的标签关联的笔记数
   */
  async 移除标签(标签名: string): Promise<number> {
    const 响应字节 = await this.会话.调用(
      服务号.后端标签, 标签方法.移除标签, encodeStringRequest(标签名));
    return decodeOpChangesWithCount(响应字节);
  }

  /**
   * 重命名标签（RenameTags）。重命名标签前缀，级联影响所有子标签。
   * @param 请求 currentPrefix（当前前缀） + newPrefix（新前缀）
   * @returns 受影响的笔记数
   */
  async 重命名标签(请求: RenameTagsRequest): Promise<number> {
    const 响应字节 = await this.会话.调用(
      服务号.后端标签, 标签方法.重命名标签, encodeRenameTagsRequest(请求));
    return decodeOpChangesWithCount(响应字节);
  }

  /**
   * 查找并替换标签（FindAndReplaceTag）。在指定笔记的标签中查找替换文本。
   * @param 请求 noteIds（空=全部笔记） + search + replacement + regex + matchCase
   * @returns 受影响的笔记数
   */
  async 查找并替换标签(请求: FindAndReplaceTagRequest): Promise<number> {
    const 响应字节 = await this.会话.调用(
      服务号.后端标签, 标签方法.查找并替换标签, encodeFindAndReplaceTagRequest(请求));
    return decodeOpChangesWithCount(响应字节);
  }

  /**
   * 补全标签（CompleteTag）。根据部分输入返回匹配的标签列表。
   * @param 请求 input（部分标签输入） + matchLimit（最大返回数）
   * @returns 匹配的标签列表
   */
  async 补全标签(请求: CompleteTagRequest): Promise<CompleteTagResponse> {
    const 响应字节 = await this.会话.调用(
      服务号.后端标签, 标签方法.补全标签, encodeCompleteTagRequest(请求));
    return decodeCompleteTagResponse(响应字节);
  }

  /**
   * 添加笔记标签（AddNoteTags, method 7）。批量给指定笔记追加标签。
   * @param 请求 noteIds（目标笔记 ID 列表） + tags（空格分隔的标签名，可含 :: 路径）
   * @returns 受影响的笔记数
   *
   * Invariants: tags 为空格分隔的多个标签；后端会自动去重已存在的标签。
   * Extension Points: 浏览页 T8 批量操作栏「添加标签」调用此方法。
   */
  async 添加笔记标签(请求: NoteIdsAndTagsRequest): Promise<number> {
    const 响应字节 = await this.会话.调用(
      服务号.后端标签, 标签方法.添加笔记标签, encodeNoteIdsAndTagsRequest(请求));
    return decodeOpChangesWithCount(响应字节);
  }

  /**
   * 移除笔记标签（RemoveNoteTags, method 8）。批量从指定笔记移除标签。
   * @param 请求 noteIds（目标笔记 ID 列表） + tags（空格分隔的标签名，可含 :: 路径）
   * @returns 受影响的笔记数
   *
   * Invariants: tags 为空格分隔的多个标签；后端对笔记上不存在的标签静默跳过。
   * Extension Points: 浏览页 T8 批量操作栏「移除标签」调用此方法。
   */
  async 移除笔记标签(请求: NoteIdsAndTagsRequest): Promise<number> {
    const 响应字节 = await this.会话.调用(
      服务号.后端标签, 标签方法.移除笔记标签, encodeNoteIdsAndTagsRequest(请求));
    return decodeOpChangesWithCount(响应字节);
  }
}
