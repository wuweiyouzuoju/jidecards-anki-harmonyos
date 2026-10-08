// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID BACKEND-SVC-DECKCONF-001
// @名称 牌组配置服务边界
//
// @作用
// 包装后端牌组配置服务的 2 个 RPC：获取牌组配置编辑视图 / 更新牌组配置。
// 不持有 UI 状态，不做字段映射——三字段建模与未建模字段保真回写见 DeckConfigMessages。
//
// @输入
// 牌组ID / 更新请求（UpdateDeckConfigsInput）
//
// @输出
// Promise<DeckConfigsForUpdateView> / Promise<void>
//
// @业务规则
// 保存语义对齐桌面端 deck-options（third_party/anki/ts/routes/deck-options/lib.ts）：
// 当前牌组选中的 config 始终随 configs 回传（最后一项决定牌组使用哪个预设）；
// currentDeck.limits 与全局 flag（fsrs 等）原样回传，避免静默重置。
//
// @副作用
// 通过 后端会话 间接调用 NAPI 桥，可能修改 Anki collection 状态。
// ========================================================

import { 后端会话 } from './后端会话';
import { 牌组配置方法, 服务号 } from './服务索引';
import { encodeDeckId } from '../proto/messages/DeckMessages';
import type {
  DeckConfigsForUpdateView,
  UpdateDeckConfigsInput
} from '../proto/messages/DeckConfigMessages';
import {
  decodeDeckConfigsForUpdate,
  encodeUpdateDeckConfigsRequest
} from '../proto/messages/DeckConfigMessages';

export class 牌组配置服务 {
  private readonly 会话: 后端会话 = 后端会话.获取实例();

  /**
   * 拉取指定牌组的选项编辑视图：全部预设（含使用计数）、当前牌组选中项
   * （configId/limits）与全局 flag。编辑面板据此定位 currentDeck.configId
   * 对应的 DeckConfig，修改三字段（new_per_day / reviews_per_day / learn_steps）。
   */
  async 获取牌组配置编辑视图(牌组ID: number): Promise<DeckConfigsForUpdateView> {
    const 请求: Uint8Array = encodeDeckId(牌组ID);
    const 响应: Uint8Array = await this.会话.调用(
      服务号.后端牌组配置, 牌组配置方法.获取牌组配置编辑视图, 请求);
    return decodeDeckConfigsForUpdate(响应);
  }

  /**
   * 整体回写牌组选项。request 需携带编辑后的 configs、当前牌组 limits
   * 与视图中的全局 flag；未建模字段经 DeckConfigMessages 保真字节回写。
   * 失败以 BackendError 抛出，message 可直接展示。
   */
  async 更新牌组配置(请求: UpdateDeckConfigsInput): Promise<void> {
    const 编码字节: Uint8Array = encodeUpdateDeckConfigsRequest(请求);
    await this.会话.调用(
      服务号.后端牌组配置, 牌组配置方法.更新牌组配置, 编码字节);
  }
}
