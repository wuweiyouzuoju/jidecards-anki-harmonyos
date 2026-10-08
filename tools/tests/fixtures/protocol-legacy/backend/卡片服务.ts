// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID BACKEND-SVC-CARDS-001
// @名称 卡片服务边界
//
// @作用
// 包装后端卡片服务的 5 个 RPC：获取卡片 / 更新卡片 / 删除卡片 / 设置牌组 / 设置标志。
// 编解码 + 经 后端会话 调用；不持有 UI 状态，不做数据映射。
//
// @输入
// 卡片ID / 卡片列表 / 牌组ID / 标志值 / 卡片ID列表 / 是否跳过撤销栈 等
//
// @输出
// Promise<Card> / Promise<OpChanges> / Promise<number> 等
//
// @业务规则
// 编号来源：backend.rs line 6672 run_backend_cards_service_method
//   0 获取卡片 / 1 更新卡片 / 2 删除卡片 / 3 设置牌组 / 4 设置标志
// FSRS memory_state / desired_retention / decay / last_review_time 等字段由后端维护，前端不在 更新卡片 中回写。
// 更新卡片：只传需要修改的字段，其余字段由 backend 保留原值。
// 删除卡片：若笔记只剩这一张卡片，笔记也会被删除。
// 设置标志：Anki flag 取值 0=无 / 1=红 / 2=橙 / 3=绿 / 4=蓝。
// 设置牌组与设置标志返回实际操作卡片数。
//
// @副作用
// 通过 后端会话 间接调用 NAPI 桥，可能修改 Anki collection 状态。
// ========================================================

import { 后端会话 } from './后端会话';
import { validateCardFlag } from '../model/CardMarking';
import { 卡片方法, 服务号 } from './服务索引';
import type { Card } from '../proto/messages/CardsMessages';
import {
  decodeCard,
  decodeRemoveCardsResponse,
  decodeSetDeckResponse,
  decodeSetFlagResponse,
  decodeUpdateCardsResponse,
  encodeCardId,
  encodeRemoveCardsRequest,
  encodeSetDeckRequest,
  encodeSetFlagRequest,
  encodeUpdateCardsRequest
} from '../proto/messages/CardsMessages';
import type { OpChanges } from '../proto/messages/CollectionMessages';

export class 卡片服务 {
  private readonly 会话: 后端会话 = 后端会话.获取实例();

  /** 获取单张卡片完整信息（含调度状态、FSRS memory_state 等） */
  async 获取卡片(卡片ID: number): Promise<Card> {
    const 响应字节 = await this.会话.调用(
      服务号.后端卡片, 卡片方法.获取卡片, encodeCardId(卡片ID));
    return decodeCard(响应字节);
  }

  /**
   * 批量更新卡片字段。只传需要修改的字段，其余字段由 backend 保留原值。
   * 注意：FSRS memory_state / desired_retention / decay / last_review_time 等字段
   * 由 backend 维护，前端不在 更新卡片 中回写。
   * @param 卡片列表 待更新卡片列表（必须含 id）
   * @param 跳过撤销栈 true 表示此操作不进入 undo 栈（用于批量操作）
   * @returns OpChanges 标记哪些实体类型受影响（card / note / deck 等）
   */
  async 更新卡片(卡片列表: Card[], 跳过撤销栈: boolean = false): Promise<OpChanges> {
    const 响应字节 = await this.会话.调用(
      服务号.后端卡片, 卡片方法.更新卡片,
      encodeUpdateCardsRequest(卡片列表, 跳过撤销栈));
    return decodeUpdateCardsResponse(响应字节);
  }

  /**
   * 删除卡片（连同其所属笔记的关联）。
   * 若笔记只剩这一张卡片，笔记也会被删除。
   * @returns 实际删除的卡片数
   */
  async 删除卡片(卡片ID列表: number[]): Promise<number> {
    const 响应字节 = await this.会话.调用(
      服务号.后端卡片, 卡片方法.删除卡片, encodeRemoveCardsRequest(卡片ID列表));
    return decodeRemoveCardsResponse(响应字节);
  }

  /**
   * 将多张卡片移动到指定牌组。
   * @returns 实际移动的卡片数
   */
  async 设置牌组(卡片ID列表: number[], 牌组ID: number): Promise<number> {
    const 响应字节 = await this.会话.调用(
      服务号.后端卡片, 卡片方法.设置牌组, encodeSetDeckRequest(卡片ID列表, 牌组ID));
    return decodeSetDeckResponse(响应字节);
  }

  /**
   * 设置卡片旗标（七色或清除），只改 Core flags 低三位。
   * Anki flag：0=无 / 1=红 / 2=橙 / 3=绿 / 4=蓝 / 5=粉 / 6=青 / 7=紫
   * @returns 实际设置标志的卡片数
   */
  async 设置标志(卡片ID列表: number[], 标志: number): Promise<number> {
    validateCardFlag(标志);
    const 响应字节 = await this.会话.调用(
      服务号.后端卡片, 卡片方法.设置标志, encodeSetFlagRequest(卡片ID列表, 标志));
    return decodeSetFlagResponse(响应字节);
  }
}
