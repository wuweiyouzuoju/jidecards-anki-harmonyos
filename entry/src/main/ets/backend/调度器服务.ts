// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID BACKEND-SVC-SCHED-001
// @名称 调度器服务边界
//
// @作用
// 包装后端调度器服务的 9 个 RPC：获取队首卡片 / 描述下一档状态 / 提交评分 /
// 今日计时 / 牌组今日计数 / 埋藏或暂停 / 按牌组恢复埋藏 / 恢复埋藏与暂停 / 完成页信息。
// 编解码 + 经 后端会话 调用；不持有 UI 状态。
//
// @输入
// 牌组ID / 状态字节 / 作答参数 / 卡片ID / 卡片ID列表 / 模式 等
//
// @输出
// Promise<QueuedCardsView> / Promise<string[]> / Promise<void> /
// Promise<SchedTimingToday> / Promise<DeckTodayCounts> / Promise<CongratsInfo>
//
// @业务规则
// 获取队首卡片：先 设置当前牌组（Anki 队列按当前牌组构建），再 获取队首卡片。
// 提交评分：新状态字节必须取 QueuedCard.states 对应档位字节；评分落库后队列立即变化。
// Anki flag 取值：0=无 / 1=红 / 2=橙 / 3=绿 / 4=蓝。
//
// @副作用
// 通过 后端会话 间接调用 NAPI 桥，可能修改 Anki collection 状态。
// ========================================================

import { 后端会话 } from './后端会话';
import { 调度器方法, 牌组方法, 服务号 } from './服务索引';
import type {
  CardAnswerInput,
  CongratsInfo,
  DeckTodayCounts,
  QueuedCardsView,
  SchedTimingToday,
  SchedulingStatesRaw,
  重新定位默认值,
  自定义学习默认值
} from '../proto/messages/SchedulerMessages';
import {
  decodeCongratsInfo,
  decodeCountsForDeckToday,
  decodeQueuedCards,
  decodeSchedTimingToday,
  decodeStringList,
  decode重新定位默认值,
  decode自定义学习默认值,
  encodeBuryOrSuspendCardsRequest,
  encodeCardAnswer,
  encodeCardIds,
  encodeCustomStudyDefaultsRequest,
  encodeCustomStudyRequest,
  encodeGetQueuedCardsRequest,
  encodeSchedulingStates,
  encodeSetDueDateRequest,
  encodeSortCardsRequest,
  encodeUnburyDeckRequest,
  自定义学习预设
} from '../proto/messages/SchedulerMessages';
import { encodeDeckId } from '../proto/messages/DeckMessages';
import { decodeOpChanges, decodeOpChangesWithCount } from '../proto/messages/CollectionMessages';

export class 调度器服务 {
  private readonly 会话: 后端会话 = 后端会话.获取实例();

  /**
   * 拉取指定牌组的队首卡片（最多 1 张）。
   * 先 设置当前牌组（Anki 队列按当前牌组构建），再 获取队首卡片。
   * 返回空 cards 表示该牌组当前无待学习卡片。
   */
  async 获取队首卡片(牌组ID: number): Promise<QueuedCardsView> {
    await this.设置当前牌组(牌组ID);
    const 请求字节: Uint8Array = encodeGetQueuedCardsRequest(1, false);
    const 响应字节: Uint8Array = await this.会话.调用(
      服务号.后端调度器, 调度器方法.获取队首卡片, 请求字节);
    return decodeQueuedCards(响应字节);
  }

  /**
   * 获取四档评分按钮的本地化文案（如「<10 分钟」「1 天」）。
   * 入参为 QueuedCard.states 原始字节，原样回传给后端。
   */
  async 描述下一档状态(状态字节: SchedulingStatesRaw): Promise<string[]> {
    const 请求字节: Uint8Array = encodeSchedulingStates(状态字节);
    const 响应字节: Uint8Array = await this.会话.调用(
      服务号.后端调度器, 调度器方法.描述下一档状态, 请求字节);
    return decodeStringList(响应字节);
  }

  /**
   * 提交评分。newState 必须取 QueuedCard.states 对应档位字节；
   * 评分落库后队列立即变化，调用方应重新 获取队首卡片 取下一张。
   */
  async 提交评分(作答参数: CardAnswerInput): Promise<void> {
    const 请求字节: Uint8Array = encodeCardAnswer(作答参数);
    await this.会话.调用(
      服务号.后端调度器, 调度器方法.提交评分, 请求字节);
  }

  /** 今日已学习卡片数/秒数上报前的计时锚点（M8 主页统计用）。 */
  async 获取今日计时(): Promise<SchedTimingToday> {
    const 响应字节: Uint8Array = await this.会话.调用(
      服务号.后端调度器, 调度器方法.今日计时, new Uint8Array(0));
    return decodeSchedTimingToday(响应字节);
  }

  /** 指定牌组今日已完成（新+复习）卡片数；主页「今日完成」对顶层牌组求和。 */
  async 获取牌组今日计数(牌组ID: number): Promise<DeckTodayCounts> {
    const 请求字节: Uint8Array = encodeDeckId(牌组ID);
    const 响应字节: Uint8Array = await this.会话.调用(
      服务号.后端调度器, 调度器方法.牌组今日计数, 请求字节);
    return decodeCountsForDeckToday(响应字节);
  }

  /**
   * 埋藏或暂停卡片。模式 取 BURY_SUSPEND_MODE_*：
   * 手动埋藏（BURY_USER，明天再见）/暂停（SUSPEND，手动恢复前不再出现）。
   * 成功后卡片立即离开今日队列，调用方应重新 获取队首卡片 取下一张。
   */
  async 埋藏或暂停卡片(卡片ID: number, 模式: number): Promise<void> {
    const 请求字节: Uint8Array = encodeBuryOrSuspendCardsRequest([卡片ID], [], 模式);
    await this.会话.调用(
      服务号.后端调度器, 调度器方法.埋藏或暂停, 请求字节);
  }

  /**
   * 批量埋藏或暂停卡片（浏览页 T8 批量操作栏用）。
   * 与单卡版同 RPC，只是 cardIds 传数组；encodeBuryOrSuspendCardsRequest 已支持 packed repeated int64。
   * 模式 取 BURY_SUSPEND_MODE_*（SUSPEND=0 / BURY_SCHED=1 / BURY_USER=2）。
   */
  async 批量埋藏或暂停卡片(卡片ID列表: number[], 模式: number): Promise<void> {
    const 请求字节: Uint8Array = encodeBuryOrSuspendCardsRequest(卡片ID列表, [], 模式);
    await this.会话.调用(
      服务号.后端调度器, 调度器方法.埋藏或暂停, 请求字节);
  }

  /**
   * 按笔记批量埋藏或暂停：由 Anki Core 展开每条笔记实际生成的全部卡片。
   * 浏览器 Notes 模式使用 note_ids，避免前端重复实现兄弟卡解析语义。
   */
  async 批量埋藏或暂停笔记(笔记ID列表: number[], 模式: number): Promise<void> {
    const 请求字节: Uint8Array = encodeBuryOrSuspendCardsRequest([], 笔记ID列表, 模式);
    await this.会话.调用(
      服务号.后端调度器, 调度器方法.埋藏或暂停, 请求字节);
  }

  /**
   * 按牌组恢复被埋藏的卡片（模式 取 UNBURY_MODE_*）。
   * CongratsInfo 只给 haveSchedBuried/haveUserBuried 标记、不给卡片 id，
   * 因此完成页的「恢复」只能按牌组维度恢复，与桌面 overview 的 unbury 一致。
   */
  async 按牌组恢复埋藏(牌组ID: number, 模式: number): Promise<void> {
    const 请求字节: Uint8Array = encodeUnburyDeckRequest(牌组ID, 模式);
    await this.会话.调用(
      服务号.后端调度器, 调度器方法.按牌组恢复埋藏, 请求字节);
  }

  /** 按卡片 id 精确恢复埋藏/暂停卡；仅在调用方已知 id 时可用（如卡片列表多选）。 */
  async 恢复埋藏与暂停的卡片(卡片ID列表: number[]): Promise<void> {
    const 请求字节: Uint8Array = encodeCardIds(卡片ID列表);
    await this.会话.调用(
      服务号.后端调度器, 调度器方法.恢复埋藏与暂停, 请求字节);
  }

  /** 完成页真实数据：剩余学习卡/到期秒数/今日上限标记/埋藏标记等。 */
  async 获取完成页信息(): Promise<CongratsInfo> {
    const 响应字节: Uint8Array = await this.会话.调用(
      服务号.后端调度器, 调度器方法.完成页信息, new Uint8Array(0));
    return decodeCongratsInfo(响应字节);
  }

  /**
   * 自定义学习（CustomStudy, method 27）。
   * 5 个预设：
   * - 新卡上限增量 / 复习上限增量：调整当前牌组上限，不创建过滤牌组
   * - 复习遗忘天数 / 提前复习天数 / 预览新卡天数：创建名为「Custom Study Session」的过滤牌组
   * 失败以 BackendError 抛出。
   */
  async 自定义学习(牌组ID: number, 预设: number, 值: number): Promise<void> {
    const 请求字节: Uint8Array = encodeCustomStudyRequest(牌组ID, 预设, 值);
    await this.会话.调用(
      服务号.后端调度器, 调度器方法.自定义学习, 请求字节);
  }

  /**
   * 获取自定义学习默认值（CustomStudyDefaults, method 28）。
   * 返回该牌组可用的标签列表、extend_new/extend_review 默认值、可用新卡/复习卡数（含子牌组）。
   */
  async 获取自定义学习默认值(牌组ID: number): Promise<自定义学习默认值> {
    const 请求字节: Uint8Array = encodeCustomStudyDefaultsRequest(牌组ID);
    const 响应字节: Uint8Array = await this.会话.调用(
      服务号.后端调度器, 调度器方法.自定义学习默认值, 请求字节);
    return decode自定义学习默认值(响应字节);
  }

  /**
   * 清空过滤牌组（EmptyFilteredDeck, method 15）。
   * 将过滤牌组中的卡片移回原牌组，但保留过滤牌组本身（可重建）。
   */
  async 清空过滤牌组(牌组ID: number): Promise<void> {
    const 请求字节: Uint8Array = encodeDeckId(牌组ID);
    await this.会话.调用(
      服务号.后端调度器, 调度器方法.清空过滤牌组, 请求字节);
  }

  /**
   * 重建过滤牌组（RebuildFilteredDeck, method 16）。
   * 重新执行搜索并填充卡片。
   */
  async 重建过滤牌组(牌组ID: number): Promise<void> {
    const 请求字节: Uint8Array = encodeDeckId(牌组ID);
    await this.会话.调用(
      服务号.后端调度器, 调度器方法.重建过滤牌组, 请求字节);
  }

  /**
   * 批量设置到期日（SetDueDate, method 19）。浏览页 T8 批量操作栏「重调度」用。
   * days 字符串格式与 Anki 桌面端「Set Due Date」对话框一致：
   *   "0"=今天 / "1"=明天 / "5"=5 天后 / "1-3"=1~3 天随机 / "!1"=1 天后（FSRS 重排）
   * 成功无返回值（后端返回 OpChanges，前端只需知道不报错即成功）。
   *
   * Invariants: 卡片 ID 列表来自浏览页选中行（cards 模式直接用，notes 模式需先查 noteId→cardIds）。
   * Extension Points: 浏览页 T8 批量操作栏「重调度」调用此方法。
   */
  async 设置到期日(卡片ID列表: number[], days: string): Promise<void> {
    const 请求字节: Uint8Array = encodeSetDueDateRequest(卡片ID列表, days);
    await this.会话.调用(
      服务号.后端调度器, 调度器方法.设置到期日, 请求字节);
  }

  /**
   * 批量重新定位（SortCards, method 21）。浏览页 T8 批量操作栏「重新定位」用。
   * 调整新卡的 due 值（位置），不影响 review/learning 卡片。
   * startingFrom=起始位置（默认 1）/ stepSize=步长（默认 1）/ randomize=随机 / shiftExisting=顺移已有新卡。
   * 成功无返回值（后端返回 OpChanges）。
   *
   * Invariants: 仅对 new 队列卡片生效；startingFrom 与 stepSize 都为 0 时后端用默认值（1/1）。
   * Extension Points: 浏览页 T8 批量操作栏「重新定位」调用此方法。
   */
  async 排序卡片(
    卡片ID列表: number[],
    起始位置: number,
    步长: number,
    随机: boolean,
    顺移已有: boolean
  ): Promise<void> {
    const 请求字节: Uint8Array = encodeSortCardsRequest(
      卡片ID列表, 起始位置, 步长, 随机, 顺移已有);
    await this.会话.调用(
      服务号.后端调度器, 调度器方法.排序卡片, 请求字节);
  }

  /**
   * 获取重新定位对话框默认值（RepositionDefaults, method 29）。
   * 返回 Anki collection 配置中保存的 random/shift 两个开关默认值。
   * 浏览页 T8「重新定位」弹层初始化用。
   */
  async 获取重新定位默认值(): Promise<重新定位默认值> {
    const 响应字节: Uint8Array = await this.会话.调用(
      服务号.后端调度器, 调度器方法.重新定位默认值, new Uint8Array(0));
    return decode重新定位默认值(响应字节);
  }

  private async 设置当前牌组(牌组ID: number): Promise<void> {
    const 请求字节: Uint8Array = encodeDeckId(牌组ID);
    await this.会话.调用(
      服务号.后端牌组, 牌组方法.设置当前牌组, 请求字节);
  }
}
