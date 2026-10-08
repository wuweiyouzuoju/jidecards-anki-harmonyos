// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID BACKEND-SVC-SEARCH-001
// @名称 搜索服务边界
//
// @作用
// 包装后端搜索服务的 9 个 RPC：构建搜索串 / 搜索卡片 / 搜索笔记 /
// 连接搜索节点 / 替换搜索节点 / 查找并替换 / 全部浏览器列 / 浏览器行按ID /
// 设置激活浏览器列。服务于「浏览卡片」功能,不持有 UI 状态。
// 方法索引来源：服务索引.ts（提取自 Anki 26.05 生成代码 backend.rs）。
//
// @输入
// SearchNode / SearchRequest / JoinSearchNodesRequest / ReplaceSearchNodeRequest /
// FindAndReplaceRequest / 列ID列表 / 行ID 等
//
// @输出
// Promise<string>（搜索串）/ Promise<number[]>（卡片/笔记 ID 列表）/
// Promise<number>（替换计数）/ Promise<BrowserColumns> / Promise<BrowserRow> / Promise<void>
//
// @业务规则
// 服务号 29（后端搜索）,方法号 0-8 与 anki.search.proto 的 9 个 RPC 一一对应。
// 搜索串由后端构建（前端不拼字符串），保证与 Anki 桌面端搜索语法一致。
// 查找并替换返回实际替换的笔记数（OpChangesWithCount.count）。
// 全部浏览器列返回 Anki 后端预定义的列定义（key + 中英标签 + 排序方向等）。
// 设置激活浏览器列持久化用户选择的列顺序，下次打开浏览页时复用。
//
// @副作用
// 通过 后端会话 间接调用 NAPI 桥，仅读取 Anki collection；查找并替换会修改 notes 表。
// ========================================================

import { 后端会话 } from './后端会话';
import { 服务号, 搜索方法 } from './服务索引';
import type {
  BrowserColumn,
  BrowserColumns,
  BrowserRow,
  FindAndReplaceRequest,
  JoinSearchNodesRequest,
  ReplaceSearchNodeRequest,
  SearchNode,
  SearchRequest
} from '../proto/messages/SearchMessages';
import {
  decodeBrowserColumns,
  decodeBrowserRow,
  decodeSearchResponse,
  decodeStringResponse,
  encodeEmptyRequest,
  encodeFindAndReplaceRequest,
  encodeInt64Request,
  encodeJoinSearchNodesRequest,
  encodeReplaceSearchNodeRequest,
  encodeSearchNode,
  encodeSearchRequest,
  encodeStringListRequest
} from '../proto/messages/SearchMessages';
import { decodeOpChangesWithCount } from '../proto/messages/CollectionMessages';

export class 搜索服务 {
  private readonly 会话: 后端会话 = 后端会话.获取实例();

  /**
   * 构建搜索串（BuildSearchString）。
   * 把 SearchNode 结构化条件转为 Anki 搜索语法字符串，如 `"deck:Swahili is:due"`。
   * @param 节点 搜索条件树（UI 通常传 makeParsableTextNode(text)）
   * @returns Anki 搜索语法字符串
   */
  async 构建搜索串(节点: SearchNode): Promise<string> {
    const 响应字节 = await this.会话.调用(
      服务号.后端搜索, 搜索方法.构建搜索串, encodeSearchNode(节点).转为字节());
    return decodeStringResponse(响应字节);
  }

  /**
   * 搜索卡片（SearchCards）。返回卡片 ID 列表（按 SortOrder 排序）。
   * @param 请求 搜索串 + 排序方式
   * @returns 卡片 ID 列表
   */
  async 搜索卡片(请求: SearchRequest): Promise<number[]> {
    const 响应字节 = await this.会话.调用(
      服务号.后端搜索, 搜索方法.搜索卡片, encodeSearchRequest(请求));
    return decodeSearchResponse(响应字节);
  }

  /**
   * 搜索笔记（SearchNotes）。返回笔记 ID 列表（按 SortOrder 排序）。
   * @param 请求 搜索串 + 排序方式
   * @returns 笔记 ID 列表
   */
  async 搜索笔记(请求: SearchRequest): Promise<number[]> {
    const 响应字节 = await this.会话.调用(
      服务号.后端搜索, 搜索方法.搜索笔记, encodeSearchRequest(请求));
    return decodeSearchResponse(响应字节);
  }

  /**
   * 连接搜索节点（JoinSearchNodes）。把 additional 用 joiner(AND/OR) 接到 existing,
   * 返回合并后的搜索串。
   * @param 请求 joiner + existingNode + additionalNode
   * @returns 合并后的搜索语法字符串
   */
  async 连接搜索节点(请求: JoinSearchNodesRequest): Promise<string> {
    const 响应字节 = await this.会话.调用(
      服务号.后端搜索, 搜索方法.连接搜索节点, encodeJoinSearchNodesRequest(请求));
    return decodeStringResponse(响应字节);
  }

  /**
   * 替换搜索节点（ReplaceSearchNode）。把 existing 中匹配的子节点替换为 replacement,
   * 返回替换后的搜索串。用于 Anki 桌面端 Ctrl+Shift+Click 切换搜索项的场景。
   * @param 请求 existingNode + replacementNode
   * @returns 替换后的搜索语法字符串
   */
  async 替换搜索节点(请求: ReplaceSearchNodeRequest): Promise<string> {
    const 响应字节 = await this.会话.调用(
      服务号.后端搜索, 搜索方法.替换搜索节点, encodeReplaceSearchNodeRequest(请求));
    return decodeStringResponse(响应字节);
  }

  /**
   * 查找并替换（FindAndReplace）。仅替换指定笔记的字段；标签使用标签服务。
   * @param 请求 nids(空=全部笔记) + search + replacement + regex + matchCase + fieldName(空=所有字段)
   * @returns 实际替换的笔记数
   */
  async 查找并替换(请求: FindAndReplaceRequest): Promise<number> {
    const 响应字节 = await this.会话.调用(
      服务号.后端搜索, 搜索方法.查找并替换, encodeFindAndReplaceRequest(请求));
    return decodeOpChangesWithCount(响应字节);
  }

  /**
   * 全部浏览器列（AllBrowserColumns）。返回 Anki 后端预定义的所有列定义,
   * 包括 key / cardsModeLabel / notesModeLabel / sorting / alignment / tooltip。
   * UI 用此列表渲染表格列选择器。
   * @returns 浏览器列定义列表
   */
  async 全部浏览器列(): Promise<BrowserColumns> {
    const 响应字节 = await this.会话.调用(
      服务号.后端搜索, 搜索方法.全部浏览器列, encodeEmptyRequest());
    return decodeBrowserColumns(响应字节);
  }

  /**
   * 浏览器行按ID（BrowserRowForId）。根据卡片 ID 拉取该行所有列的单元格数据。
   * UI 表格渲染每行时调用（受限于 Anki 后端 API 设计，无批量接口）。
   * @param 行ID 卡片 ID 或笔记 ID（取决于当前模式）
   * @returns 浏览器行（cells + color + fontName + fontSize）
   */
  async 浏览器行按ID(行ID: number): Promise<BrowserRow> {
    const 响应字节 = await this.会话.调用(
      服务号.后端搜索, 搜索方法.浏览器行按ID, encodeInt64Request(行ID));
    return decodeBrowserRow(响应字节);
  }

  /**
   * 设置激活浏览器列（SetActiveBrowserColumns）。持久化用户选择的列顺序，
   * 下次打开浏览页时复用。Anki 后端会保存到 collection.anki2 的配置表。
   * @param 列键列表 列 key 数组（来自 BrowserColumn.key）
   */
  async 设置激活浏览器列(列键列表: string[]): Promise<void> {
    await this.会话.调用(
      服务号.后端搜索, 搜索方法.设置激活浏览器列, encodeStringListRequest(列键列表));
  }
}
