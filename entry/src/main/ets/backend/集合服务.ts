// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID BACKEND-SVC-COLLECTION-001
// @名称 集合服务边界
//
// @作用
// 包装后端集合服务的 4 个 RPC：获取撤销状态 / 撤销 / 重做 / 检查数据库。
// 编解码 + 经 后端会话 调用；不持有 UI 状态，不做数据映射。
//
// @输入
// 无（4 个方法均无入参字节，传空 Uint8Array）
//
// @输出
// Promise<UndoStatus> / Promise<OpChangesAfterUndo> / Promise<string[]>
//
// @业务规则
// 编号来源：backend.rs run_backend_collection_service_method 分支
//   6 检查数据库 / 7 获取撤销状态 / 8 撤销 / 9 重做
// 链路语义（与桌面 Anki reviewer.py 一致）：
//   - UndoStatus.undo/redo 为可撤销/重做操作的本地化描述文案，空串表示该方向不可操作；
//   - 撤销 撤销最近一次操作（如评分），被撤销的卡片由 Rust core 放回学习队列顶部，调用方撤销后应重新取卡；
//   - 重做 仅在服务层封装备用，UI 不暴露（上游移动端惯例）。
// 检查数据库 返回本地化问题列表，空数组表示检查通过。
//
// @副作用
// 通过 后端会话 间接调用 NAPI 桥，可能修改 Anki collection 状态（撤销/重做/数据库修复）。
// ========================================================

import { encodeCreateBackup } from '../proto/messages/PreferencesMessages';
import { decodeBoolResponse } from '../proto/messages/ConfigMessages';
import { 后端会话 } from './后端会话';
import { 集合方法, 服务号 } from './服务索引';
import type {
  OpChangesAfterUndo,
  UndoStatus
} from '../proto/messages/CollectionMessages';
import {
  decodeCheckDatabaseResponse,
  decodeOpChangesAfterUndo,
  decodeUndoStatus
} from '../proto/messages/CollectionMessages';

export class 集合服务 {
  /** Core 决定是否创建及保留策略；返回前等待实际归档完成。 */
  async createBackup(folder: string, force: boolean = false): Promise<boolean> {
    return decodeBoolResponse(await this.会话.调用(服务号.后端集合, 集合方法.创建备份,
      encodeCreateBackup(folder, force)));
  }

  private readonly 会话: 后端会话 = 后端会话.获取实例();

  /** 查询撤销/重做状态；undo/redo 描述为空串表示对应方向不可用。 */
  async 获取撤销状态(): Promise<UndoStatus> {
    const 响应字节: Uint8Array = await this.会话.调用(
      服务号.后端集合, 集合方法.获取撤销状态, new Uint8Array(0));
    return decodeUndoStatus(响应字节);
  }

  /** 撤销最近一次操作；评分被撤销后卡片回到队列顶部，调用方应重新取卡。 */
  async 撤销(): Promise<OpChangesAfterUndo> {
    const 响应字节: Uint8Array = await this.会话.调用(
      服务号.后端集合, 集合方法.撤销, new Uint8Array(0));
    return decodeOpChangesAfterUndo(响应字节);
  }

  /** 重做最近一次被撤销的操作；仅服务层备用，UI 不暴露。 */
  async 重做(): Promise<OpChangesAfterUndo> {
    const 响应字节: Uint8Array = await this.会话.调用(
      服务号.后端集合, 集合方法.重做, new Uint8Array(0));
    return decodeOpChangesAfterUndo(响应字节);
  }

  /** 检查数据库完整性；返回本地化问题列表，空数组表示检查通过。 */
  async 检查数据库(): Promise<string[]> {
    const 响应字节: Uint8Array = await this.会话.调用(
      服务号.后端集合, 集合方法.检查数据库, new Uint8Array(0));
    return decodeCheckDatabaseResponse(响应字节);
  }
}
