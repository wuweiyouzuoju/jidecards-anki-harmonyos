// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID BACKEND-SVC-SYNC-001
// @名称 同步服务边界
//
// @作用
// 包装后端同步服务的 9 个 RPC：同步登录 / 同步状态检查 / 同步集合 /
// 全量上传或下载 / 同步媒体 / 媒体同步状态 / 中止同步 / 中止媒体同步 / 设置自定义证书。
// 编解码 + 经 后端会话 调用；不持有 UI 状态。
// backend.rs 内部直连 sync.ankiweb.net（或自定义端点），jidecards 不直接处理 HTTP。
//
// @输入
// 用户名 / 密码 / 端点 / 凭证 / 是否同步媒体 / 是否上传 / 服务器USN / PEM文本 等
//
// @输出
// Promise<SyncAuth> / Promise<SyncStatusResponse> /
// Promise<SyncCollectionResponse> / Promise<MediaSyncStatusResponse> /
// Promise<boolean> / Promise<void>
//
// @业务规则
// 同步登录：端点 为空串时使用官方 sync.ankiweb.net；返回的 SyncAuth 供后续所有同步 RPC 使用。
// 同步状态检查：required 取值见 SYNC_STATUS_REQUIRED，newEndpoint 非空时需迁移端点。
// 同步集合：是否同步媒体=true 时同步完成后自动挂起媒体同步；
//   required 取值见 SYNC_COLLECTION_REQUIRED（可能要求全量上传/下载）。
// 全量上传或下载：是否上传 决定方向，调用方须先得到用户确认；服务器USN 为 null 时跳过媒体 usn 记录。
// 同步媒体：rslib 对重复启动安全。
// 设置自定义证书：注入 PEM 文本形式的 CA 证书，供同步 TLS 校验使用。
//
// @副作用
// 通过 后端会话 间接调用 NAPI 桥，可能发起对外 HTTP 请求并修改 Anki collection / 媒体库。
// ========================================================

import { 后端会话 } from './后端会话';
import { 服务号, 同步方法 } from './服务索引';
import {
  decodeBoolResponse,
  decodeMediaSyncStatusResponse,
  decodeSyncAuth,
  decodeSyncCollectionResponse,
  decodeSyncStatusResponse,
  encodeEmptyRequest,
  encodeFullUploadOrDownloadRequest,
  encodeStringRequest,
  encodeSyncAuth,
  encodeSyncCollectionRequest,
  encodeSyncLoginRequest
} from '../proto/messages/SyncMessages';
import type {
  MediaSyncStatusResponse,
  SyncAuth,
  SyncCollectionResponse,
  SyncStatusResponse
} from '../proto/messages/SyncMessages';

export class 同步服务 {
  private readonly 会话: 后端会话 = 后端会话.获取实例();

  /**
   * AnkiWeb 登录。
   * 端点 为空串时使用官方 sync.ankiweb.net；返回的 SyncAuth 供后续所有同步 RPC 使用。
   */
  async 同步登录(用户名: string, 密码: string, 端点: string = ''): Promise<SyncAuth> {
    const 响应字节 = await this.会话.调用(
      服务号.后端同步,
      同步方法.同步登录,
      encodeSyncLoginRequest({ username: 用户名, password: 密码, endpoint: 端点 })
    );
    return decodeSyncAuth(响应字节);
  }

  /** 同步前检查：required 取值见 SYNC_STATUS_REQUIRED，newEndpoint 非空时需迁移端点。 */
  async 同步状态检查(凭证: SyncAuth): Promise<SyncStatusResponse> {
    const 响应字节 = await this.会话.调用(
      服务号.后端同步,
      同步方法.同步状态,
      encodeSyncAuth(凭证)
    );
    return decodeSyncStatusResponse(响应字节);
  }

  /**
   * 执行一次集合同步。
   * 是否同步媒体=true 时同步完成后自动挂起媒体同步；
   * required 取值见 SYNC_COLLECTION_REQUIRED（可能要求全量上传/下载）。
   */
  async 同步集合(凭证: SyncAuth, 是否同步媒体: boolean): Promise<SyncCollectionResponse> {
    const 响应字节 = await this.会话.调用(
      服务号.后端同步,
      同步方法.同步集合,
      encodeSyncCollectionRequest({ auth: 凭证, syncMedia: 是否同步媒体 })
    );
    return decodeSyncCollectionResponse(响应字节);
  }

  /**
   * 强制全量上传（是否上传=true）或全量下载（是否上传=false），调用方须先得到用户确认。
   * 服务器USN 为 null 时跳过媒体 usn 记录；响应为 generic.Empty，忽略字节。
   */
  async 全量上传或下载(凭证: SyncAuth, 是否上传: boolean, 服务器USN: number | null): Promise<void> {
    await this.会话.调用(
      服务号.后端同步,
      同步方法.全量上传或下载,
      encodeFullUploadOrDownloadRequest({ auth: 凭证, upload: 是否上传, serverUsn: 服务器USN })
    );
  }

  /** 显式启动媒体；Core 已启动时只监测，重复调用可能丢弃已结束任务的结果。 */
  async 同步媒体(凭证: SyncAuth): Promise<void> {
    await this.会话.调用(
      服务号.后端同步,
      同步方法.同步媒体,
      encodeSyncAuth(凭证)
    );
  }

  /** 消费媒体结果：只允许任务拥有者调用；其他页面通过 SyncActivity 查询占用。 */
  async 媒体同步状态(): Promise<MediaSyncStatusResponse> {
    const 响应字节 = await this.会话.调用(
      服务号.后端同步,
      同步方法.媒体同步状态,
      encodeEmptyRequest()
    );
    return decodeMediaSyncStatusResponse(响应字节);
  }

  /** 中止进行中的集合同步；响应为 generic.Empty，忽略字节。 */
  async 中止同步(): Promise<void> {
    await this.会话.调用(
      服务号.后端同步,
      同步方法.中止同步,
      encodeEmptyRequest()
    );
  }

  /** 中止进行中的媒体同步；响应为 generic.Empty，忽略字节。 */
  async 中止媒体同步(): Promise<void> {
    await this.会话.调用(
      服务号.后端同步,
      同步方法.中止媒体同步,
      encodeEmptyRequest()
    );
  }

  /** 注入自定义 CA 证书（PEM 文本），供同步 TLS 校验使用；返回是否生效。 */
  async 设置自定义证书(PEM文本: string): Promise<boolean> {
    const 响应字节 = await this.会话.调用(
      服务号.后端同步,
      同步方法.设置自定义证书,
      encodeStringRequest(PEM文本)
    );
    return decodeBoolResponse(响应字节);
  }
}
