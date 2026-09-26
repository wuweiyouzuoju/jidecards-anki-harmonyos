// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID BACKEND-SVC-CONFIG-001
// @名称 配置服务边界
//
// @作用
// 包装后端配置服务的 4 个 RPC（T6 侧边栏已保存搜索 + 折叠状态用）：
// - 获取配置JSON（GetConfigJson）：按字符串 key 读 JSON
// - 设置配置JSON（SetConfigJson）：按字符串 key 写 JSON
// - 获取配置布尔（GetConfigBool）：按 ConfigKey.Bool 枚举读布尔
// - 设置配置布尔（SetConfigBool）：按 ConfigKey.Bool 枚举写布尔
// 方法索引来源：服务索引.ts（提取自 Anki 26.05 生成代码 backend.rs）。
//
// @输入
// GetConfigJson：string key（如 "savedSearches"）
// SetConfigJson：key + valueJson + undoable
// GetConfigBool：ConfigKey.Bool 枚举（如 COLLAPSE_SAVED_SEARCHES）
// SetConfigBool：key + value + undoable
//
// @输出
// Promise<string>（JSON）/ Promise<boolean> / Promise<OpChanges>
//
// @业务规则
// 服务号 9（后端配置），方法号 0/1/5/6。
// saved searches 在 Anki/AnkiDroid 共享 config 表的 "savedFilters" key 下，为名称到查询的 JSON 映射。
// 折叠状态走 ConfigKey.Bool 枚举（COLLAPSE_TAGS=4 / COLLAPSE_DECKS=6 / COLLAPSE_SAVED_SEARCHES=7）。
// GetConfigJson 返回空串表示该 key 不存在（Anki 后端对缺失 key 返回空 JSON）。
//
// @副作用
// 通过 后端会话 间接调用 NAPI 桥；GetConfig* 仅读取，SetConfig* 会写配置表。
// ========================================================

import { 后端会话 } from './后端会话';
import { 服务号, 配置方法 } from './服务索引';
import type { SetConfigBoolRequest, SetConfigJsonRequest } from '../proto/messages/ConfigMessages';
import { ConfigKeyBool } from '../proto/messages/ConfigMessages';
import {
  decodeBoolResponse,
  decodeJsonResponse,
  encodeGetConfigBoolRequest,
  encodeSetConfigBoolRequest,
  encodeSetConfigJsonRequest,
  encodeStringRequest
} from '../proto/messages/ConfigMessages';
import { decodeOpChanges } from '../proto/messages/CollectionMessages';
import type { OpChanges } from '../proto/messages/CollectionMessages';

export class 配置服务 {
  private readonly 会话: 后端会话 = 后端会话.获取实例();

  /**
   * 获取配置JSON（GetConfigJson）。按字符串 key 读 JSON 字符串。
   * 用于 saved searches 等自定义配置（非枚举 key）。
   * @param key 配置 key（如 "savedSearches"）
   * @returns JSON 字符串（空串表示 key 不存在或值为空）
   */
  async 获取配置JSON(key: string): Promise<string> {
    const 响应字节 = await this.会话.调用(
      服务号.后端配置, 配置方法.获取配置JSON, encodeStringRequest(key));
    return decodeJsonResponse(响应字节);
  }

  /**
   * 设置配置JSON（SetConfigJson）。按字符串 key 写 JSON 字符串。
   * @param 请求 key + valueJson + undoable（undoable=true 进入撤销栈）
   * @returns OpChanges
   */
  async 设置配置JSON(请求: SetConfigJsonRequest): Promise<OpChanges> {
    const 响应字节 = await this.会话.调用(
      服务号.后端配置, 配置方法.设置配置JSON, encodeSetConfigJsonRequest(请求));
    return decodeOpChanges(响应字节);
  }

  /**
   * 获取配置布尔（GetConfigBool）。按 ConfigKey.Bool 枚举读布尔。
   * 用于侧边栏折叠状态（COLLAPSE_TAGS / COLLAPSE_DECKS / COLLAPSE_SAVED_SEARCHES）。
   * @param key ConfigKey.Bool 枚举值
   * @returns 布尔值
   */
  async 获取配置布尔(key: ConfigKeyBool): Promise<boolean> {
    const 响应字节 = await this.会话.调用(
      服务号.后端配置, 配置方法.获取配置布尔, encodeGetConfigBoolRequest(key));
    return decodeBoolResponse(响应字节);
  }

  /**
   * 设置配置布尔（SetConfigBool）。按 ConfigKey.Bool 枚举写布尔。
   * @param 请求 key + value + undoable
   * @returns OpChanges
   */
  async 设置配置布尔(请求: SetConfigBoolRequest): Promise<OpChanges> {
    const 响应字节 = await this.会话.调用(
      服务号.后端配置, 配置方法.设置配置布尔, encodeSetConfigBoolRequest(请求));
    return decodeOpChanges(响应字节);
  }
}
