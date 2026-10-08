// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID BACKEND-SVC-STATS-001
// @名称 统计服务边界
//
// @意图
// 包装后端统计服务的 4 个 RPC：图表统计 / 卡片统计 / 获取图表偏好 / 设置图表偏好。
// 不持有 UI 状态；失败抛 BackendError 由调用方决定回滚。
// 方法索引来源：服务索引.ts（提取自 Anki 26.05 生成代码 backend.rs）。
//
// @Invariants
// - 一次 Graphs 调用同时取回按日复习计数与平均可提取率
// - 搜索串为空 = 全库统计（graph_data_for_search 的 all 分支）；统计页牌组下拉传 deck 搜索串
// - GraphPreferences 与 prost 一致：默认值省略不写
//
// @ExtensionPoints
// - 新增统计 RPC：在 统计方法 加方法号常量 + 本类加 async 方法 + StatsMessages 加编解码
//
// @业务规则
// days 限定 revlog 回看窗口（含今天共 days+1 天），首页月历只需覆盖当月。
// reviews.count 键为「距今天数」（0=今天），按 Anki 日切分点（rollover）分桶。
// retrievability.average 为 0-100 百分制，无 FSRS 记忆状态卡片时为 0。
// GraphPreferences.calendarFirstDayOfWeek 仅支持 SUNDAY/MONDAY/FRIDAY/SATURDAY 4 值
// （与 Anki 桌面端一致，stats.proto enum Weekday 限制）。
//
// @副作用
// 通过 后端会话 间接调用 NAPI 桥，仅读取 / 写入 Anki collection 的统计聚合与偏好。
// ========================================================

import { 后端会话 } from './后端会话';
import { 服务号, 统计方法 } from './服务索引';
import type { CardStatsView, GraphPreferences, GraphsView } from '../proto/messages/StatsMessages';
import {
  decodeCardStatsResponse,
  decodeGraphPreferences,
  decodeGraphsResponse,
  encodeCardIdRequest,
  encodeEmpty,
  encodeGraphPreferences,
  encodeGraphsRequest
} from '../proto/messages/StatsMessages';

export class 统计服务 {
  private readonly 会话: 后端会话 = 后端会话.获取实例();

  /**
   * 拉取图表统计。天数 为回看天数（0=全部历史）。
   * 搜索串 为空 = 全库统计；传 deck:"牌组名" 时仅统计该牌组（统计页牌组下拉）。
   * 返回值中 reviewCountsByDaysAgo / retrievability 可能为 null（响应缺省字段）。
   */
  async 获取图表统计(天数: number, 搜索串: string = ''): Promise<GraphsView> {
    const 请求字节: Uint8Array = encodeGraphsRequest(天数, 搜索串);
    const 响应字节: Uint8Array = await this.会话.调用(
      服务号.后端统计, 统计方法.图表, 请求字节);
    return decodeGraphsResponse(响应字节);
  }

  /**
   * 拉取单卡完整统计（T11 卡片信息用）。含调度信息 + 复习历史。
   * 调 stats.proto 方法 0 CardStats(CardId) → CardStatsResponse。
   */
  async 获取卡片统计(卡片ID: number): Promise<CardStatsView> {
    const 请求字节: Uint8Array = encodeCardIdRequest(卡片ID);
    const 响应字节: Uint8Array = await this.会话.调用(
      服务号.后端统计, 统计方法.卡片统计, 请求字节);
    return decodeCardStatsResponse(响应字节);
  }

  /**
   * 拉取图表偏好（统计页 ⚙ 面板初始化用）。
   * 调 stats.proto 方法 3 GetGraphPreferences(generic.Empty) → GraphPreferences。
   * 后端默认值：SUNDAY 周首日 + 三个 false。
   */
  async 获取图表偏好(): Promise<GraphPreferences> {
    const 请求字节: Uint8Array = encodeEmpty();
    const 响应字节: Uint8Array = await this.会话.调用(
      服务号.后端统计, 统计方法.获取图表偏好, 请求字节);
    return decodeGraphPreferences(响应字节);
  }

  /**
   * 写入图表偏好（统计页 ⚙ 面板保存用）。
   * 调 stats.proto 方法 4 SetGraphPreferences(GraphPreferences) → generic.Empty。
   * 与 prost 一致：默认值字段省略不写入字节流。
   */
  async 设置图表偏好(偏好: GraphPreferences): Promise<void> {
    const 请求字节: Uint8Array = encodeGraphPreferences(偏好);
    await this.会话.调用(
      服务号.后端统计, 统计方法.设置图表偏好, 请求字节);
  }
}
