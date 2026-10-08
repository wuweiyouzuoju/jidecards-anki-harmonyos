// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID BACKEND-SVC-ANKIWEB-001
// @名称 AnkiWeb 服务边界
//
// @作用
// 包装后端 AnkiWeb 服务的 2 个 RPC：获取插件信息 / 检查更新。
// 编解码 + 经 后端会话 调用；不持有 UI 状态，不做数据映射。
// 后端内部会通过 HTTP 调用 services.ankiweb.net，jidecards 不直接处理网络。
//
// @输入
// 客户端版本号 / 插件ID列表（≤25）/ 检查更新请求参数
//
// @输出
// Promise<GetAddonInfoResponse> / Promise<CheckForUpdateResponse>
//
// @业务规则
// 编号来源：backend.rs line 4870 run_backend_ankiweb_service_method
//   0 获取插件信息 / 1 检查更新
// AnkiWeb 限制：单次最多 25 个 addon id；没有匹配客户端版本的 addon 不会出现在响应里。
// 检查更新出参 new_version 为空串表示无需更新。
//
// @副作用
// 通过 后端会话 间接调用 NAPI 桥，后端再发起外部 HTTP 请求。
// ========================================================

import { 后端会话 } from './后端会话';
import { AnkiWeb方法, 服务号 } from './服务索引';
import {
  decodeCheckForUpdateResponse,
  decodeGetAddonInfoResponse,
  encodeCheckForUpdateRequest,
  encodeGetAddonInfoRequest
} from '../proto/messages/AnkiwebMessages';
import type {
  CheckForUpdateRequest,
  CheckForUpdateResponse,
  GetAddonInfoResponse
} from '../proto/messages/AnkiwebMessages';

export class AnkiWeb服务 {
  private readonly 会话: 后端会话 = 后端会话.获取实例();

  /**
   * 拉取 AnkiWeb addon 元信息。
   * AnkiWeb 限制：单次最多 25 个 addon id。
   * 没有匹配客户端版本的 addon 不会出现在响应里。
   */
  async 获取插件信息(客户端版本号: number, 插件ID列表: number[]): Promise<GetAddonInfoResponse> {
    if (插件ID列表.length > 25) {
      throw new Error(`AnkiWeb GetAddonInfo: max 25 addon ids per call, got ${插件ID列表.length}`);
    }
    const 响应字节 = await this.会话.调用(
      服务号.后端AnkiWeb,
      AnkiWeb方法.获取插件信息,
      encodeGetAddonInfoRequest({ clientVersion: 客户端版本号, addonIds: 插件ID列表 })
    );
    return decodeGetAddonInfoResponse(响应字节);
  }

  /**
   * 检查 Anki 客户端更新。
   * 入参 client_version/buildhash/os/install_id 用于上报客户端信息；
   * 出参 new_version 为空串表示无需更新。
   */
  async 检查更新(请求参数: CheckForUpdateRequest): Promise<CheckForUpdateResponse> {
    const 响应字节 = await this.会话.调用(
      服务号.后端AnkiWeb,
      AnkiWeb方法.检查更新,
      encodeCheckForUpdateRequest(请求参数)
    );
    return decodeCheckForUpdateResponse(响应字节);
  }
}
