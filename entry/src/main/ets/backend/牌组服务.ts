// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID BACKEND-SVC-DECK-001
// @名称 牌组服务边界
//
// @作用
// 包装后端牌组查询、创建、重命名、删除及过滤牌组等 RPC。
// 编解码 + 经 后端会话 调用；不持有 UI 状态，不做数据映射。
// 数据语义见 HomeSnapshotMapper 与 third_party/anki/rslib/src/decks/tree.rs。
//
// @输入
// 牌组ID / 新名称 / 牌组ID列表 / 当前秒数 等
//
// @输出
// Promise<DeckTreeNode> / Promise<number> / Promise<void>
//
// @业务规则
// 创建牌组流程：新建牌组模板 → 改名 → 添加牌组，返回新牌组ID。
// 名称支持「父::子」层级（缺失的父级由后端自动创建）。
// 删除牌组：递归删除所有子牌组及其卡片（与 Anki 桌面端 deckbrowser.py:369 行为一致）。
//
// @副作用
// 通过 后端会话 间接调用 NAPI 桥，可能修改 Anki collection 状态。
// ========================================================

import { 后端会话 } from './后端会话';
import { 牌组方法, 服务号 } from './服务索引';
import type { Deck, DeckTreeNode, 过滤牌组更新 } from '../proto/messages/DeckMessages';
import {
  decodeDeck,
  decodeDeckTreeNode,
  decode过滤牌组更新,
  encodeDeck,
  encodeDeckIds,
  encodeDeckTreeRequest,
  encodeDeckId,
  encodeRenameDeckRequest,
  encode过滤牌组更新
} from '../proto/messages/DeckMessages';
import { decodeOpChanges, decodeOpChangesWithCount, decodeOpChangesWithId } from '../proto/messages/CollectionMessages';
import { decodeStringList } from '../proto/messages/SchedulerMessages';

export class 牌组服务 {
  private readonly 会话: 后端会话 = 后端会话.获取实例();

  /**
   * 拉取牌组树（DeckTree）。
   * 返回根节点占位（deckId=0、name=''），真实牌组在 children；
   * 每个节点的 new/learn/review 计数已按日限裁剪且包含子节点合计。
   */
  async 获取牌组树(): Promise<DeckTreeNode> {
    const 当前秒数: number = Math.floor(Date.now() / 1000);
    const 请求: Uint8Array = encodeDeckTreeRequest(当前秒数);
    const 响应: Uint8Array = await this.会话.调用(
      服务号.后端牌组, 牌组方法.牌组树, 请求);
    return decodeDeckTreeNode(响应);
  }

  /**
   * 新建牌组：NewDeck 模板 → 改名 → AddDeck，返回新牌组 id。
   * 名称支持「父::子」层级（缺失的父级由后端自动创建）。
   * 重复名等失败以 BackendError 抛出，message 可直接展示。
   */
  async 创建牌组(名称: string): Promise<number> {
    const 模板字节: Uint8Array = await this.会话.调用(
      服务号.后端牌组, 牌组方法.新建牌组, new Uint8Array(0));
    const 模板: Deck = decodeDeck(模板字节);
    模板.id = 0;
    模板.name = 名称;
    const 已添加: Uint8Array = await this.会话.调用(
      服务号.后端牌组, 牌组方法.添加牌组, encodeDeck(模板));
    return decodeOpChangesWithId(已添加);
  }

  /**
   * 重命名牌组：调用后端 rename_deck（method 18），自动级联重命名子牌组前缀。
   * 名称冲突等失败以 BackendError 抛出，message 可直接展示。
   */
  async 重命名牌组(牌组ID: number, 新名称: string): Promise<void> {
    const 请求: Uint8Array = encodeRenameDeckRequest(牌组ID, 新名称);
    await this.会话.调用(
      服务号.后端牌组, 牌组方法.重命名牌组, 请求);
  }

  /**
   * 删除牌组：调用后端 remove_decks（method 16）。
   *
   * 后端语义（rslib/src/decks/remove.rs:6 remove_decks_and_child_decks）：
   * - 递归处理子牌组；普通牌组删除卡片及孤立笔记，筛选牌组将卡片归还原牌组
   * - 默认牌组保留并重置名称；媒体文件不随牌组删除
   * - 返回 OpChangesWithCount.count = 实际删除的卡片数（含子牌组），操作进入 Core 撤销栈
   *
   * 二次确认防误删（与 Anki 桌面端 deckbrowser.py:369 行为一致）。
   */
  async 删除牌组(牌组ID列表: number[]): Promise<number> {
    const 请求: Uint8Array = encodeDeckIds(牌组ID列表);
    const 响应: Uint8Array = await this.会话.调用(
      服务号.后端牌组, 牌组方法.删除牌组, 请求);
    return decodeOpChangesWithCount(响应);
  }

  /**
   * 获取或创建过滤牌组（GetOrCreateFilteredDeck, method 19）。
   * 传入 deckId=0 表示新建；传入已有过滤牌组 ID 表示编辑。
   * 返回 FilteredDeckForUpdate 供前端编辑后回写。
   */
  async 获取或创建过滤牌组(牌组ID: number): Promise<过滤牌组更新> {
    const 响应: Uint8Array = await this.会话.调用(
      服务号.后端牌组, 牌组方法.获取或创建过滤牌组, encodeDeckId(牌组ID));
    return decode过滤牌组更新(响应);
  }

  /**
   * 添加或更新过滤牌组（AddOrUpdateFilteredDeck, method 20）。
   * 传入编辑后的 FilteredDeckForUpdate，后端会执行搜索并填充卡片。
   * 返回新过滤牌组 ID（新建）或原 ID（更新）。
   */
  async 添加或更新过滤牌组(更新: 过滤牌组更新): Promise<number> {
    const 响应: Uint8Array = await this.会话.调用(
      服务号.后端牌组, 牌组方法.添加或更新过滤牌组, encode过滤牌组更新(更新));
    return decodeOpChangesWithId(响应);
  }

  /**
   * 获取过滤牌组排序选项的本地化标签（FilteredDeckOrderLabels, method 21）。
   * 返回的字符串列表顺序与 过滤牌组排序 枚举值一一对应。
   */
  async 获取过滤牌组排序标签(): Promise<string[]> {
    const 响应: Uint8Array = await this.会话.调用(
      服务号.后端牌组, 牌组方法.过滤牌组排序标签, new Uint8Array(0));
    return decodeStringList(响应);
  }
}
