// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID BACKEND-SVC-CONFIG-001
// @名称 配置服务边界
//
// @作用
// 包装 Core 配置与集合偏好 RPC：
// - 获取配置JSON（GetConfigJson）：按字符串 key 读 JSON
// - 设置配置JSON（SetConfigJson）：按字符串 key 写 JSON
// - 获取配置布尔（GetConfigBool）：按 ConfigKey.Bool 枚举读布尔
// - 设置配置布尔（SetConfigBool）：按 ConfigKey.Bool 枚举写布尔
// - GetPreferences/SetPreferences：读取原始消息，按编辑字段局部替换后保存
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
// 服务号 9（后端配置），方法号 0/1/5/6/9/10。
// saved searches 在 Anki/AnkiDroid 共享 config 表的 "savedFilters" key 下，为名称到查询的 JSON 映射。
// 折叠状态走 ConfigKey.Bool 枚举（COLLAPSE_TAGS=4 / COLLAPSE_DECKS=6 / COLLAPSE_SAVED_SEARCHES=7）。
// GetConfigJson 对缺失 key 返回 NotFound；需要默认值时使用 GetAllConfig 区分缺失与读取故障。
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

  /** Anki 26.05 Preferences 原始消息；调用方保留未编辑字段。 */
  getPreferences(): Promise<Uint8Array> {
    return this.会话.调用(服务号.后端配置, 配置方法.获取偏好, new Uint8Array(0));
  }

  async setPreferences(bytes: Uint8Array): Promise<OpChanges> {
    return decodeOpChanges(await this.会话.调用(服务号.后端配置, 配置方法.设置偏好, bytes));
  }

  /**
   * 获取配置JSON（GetConfigJson）。按字符串 key 读 JSON 字符串。
   * 用于 saved searches 等自定义配置（非枚举 key）。
   * @param key 配置 key（如 "savedSearches"）
   * @returns Core JSON 字符串；缺失 key 抛出 NotFound，不返回空 JSON
   */
  async 获取配置JSON(key: string): Promise<string> {
    const 响应字节 = await this.会话.调用(
      服务号.后端配置, 配置方法.获取配置JSON, encodeStringRequest(key));
    return decodeJsonResponse(响应字节);
  }

  /** 缺失的自定义 key 在 Core 中返回 NotFound；从完整配置读取可区分缺失与读取失败。 */
  async 获取全部配置(): Promise<string> {
    return decodeJsonResponse(await this.会话.调用(服务号.后端配置, 配置方法.获取全部配置, new Uint8Array()));
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
