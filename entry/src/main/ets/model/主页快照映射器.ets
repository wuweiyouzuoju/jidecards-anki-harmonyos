// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID MODEL-HOME-SNAPSHOT-001
// @名称 主页快照映射器
//
// @作用
// 把后端 DeckTreeNode + GraphsView 映射为主页快照（牌组列表 + 今日学习汇总 +
// 记忆表现汇总）。纯函数，无 UI/后端依赖，可单测。
//
// 数据语义（third_party/anki/rslib/src/decks/tree.rs）：
// - 根节点为占位（deckId=0、name=''），真实牌组在 children；
// - 节点 name 为末级名（顶层节点即完整牌组名）；
// - 节点 new/learn/review 计数已按日限裁剪，且含全部子节点合计。
// 记忆率语义（third_party/anki/rslib/src/stats/graphs/）：
// - reviews.count 键为相对今天的 day offset（0=今天、-1=昨天、-2=前天…，
//   见 reviews.rs `(elapsed_secs_since(next_day_start) / 86_400) as i32`）；
// - retrievability.average 为 0-100 百分制，仅 FSRS 开启且有 memory_state 卡片时非零。
//
// @输入
// 根节点 DeckTreeNode / 图表数据 GraphsView（拉取失败传 null）/ 当前时刻 Date（测试锚定用）
// / 色调覆盖 / 别名覆盖 / 顺序覆盖 / 背景图覆盖
//
// @输出
// 主页快照对象（含 decks / today / memory）
//
// @业务规则
// 父牌组计数直接沿用 Anki Core 聚合计数，不从已平铺子牌组重新求和。
// 今日完成来源：graphs.today.answerCount（含 learn/review/relearn/filtered，全库聚合）。
// 记忆状态卡片口径遵循 B12-X 改造（2026-07-21）：主指标用今日不会率。
//
// @副作用
// 无。本文件为纯函数，不读写 preferences 与后端。
// ========================================================

import type { DeckTreeNode } from '../proto/messages/DeckMessages';
import type { GraphsView, RetrievabilitySummary } from '../proto/messages/StatsMessages';
import type { 牌组汇总, 牌组色调, 主页快照, 记忆表现汇总 } from './主页模型';
import { 平铺牌组树 } from './牌组层级';

function 统计牌组树节点数(节点: DeckTreeNode): number {
  let 总数: number = 节点.children.length;
  for (const 子节点 of 节点.children) {
    总数 += 统计牌组树节点数(子节点);
  }
  return 总数;
}

/** 主页第三张卡：B12-X 改造 2026-07-21（详见 decisions.md）。
 *
 *  旧口径:retrievability.average = 全库 FSRS 卡平均可提取率。mature 卡占比高时拉到 95%+，
 *  掩盖"今天答不会的卡很多"的真实状态——用户主观感受与数字严重脱节。
 *
 *  新口径:主指标改用 today.againRate = (answerCount - correctCount) / answerCount
 *  （Anki Desktop today.ts 同款算法，rslib/src/stats/graphs/today.rs 提供数据）。
 *  全库平均可提取率保留为副标题（仅在 FSRS 已开且有 memory_state 卡片时显示）。
 *
 *  state:
 *  - load_error: graphs 拉取失败（null）
 *  - today_empty: 今日 answerCount=0，提示去学习
 *  - today_answered: 今日已答卡，显示今日不会率 + 副指标
 *  - loading: 调用方传入的初始态（构建主页快照 不会返回此态）
 */
function 转为记忆表现汇总(图表数据: GraphsView | null): 记忆表现汇总 {
  if (图表数据 === null) {
    return {
      state: 'load_error',
      todayAgainRate: 0, todayAnsweredCount: 0,
      matureCorrectRate: 0, hasMatureData: false,
      averageRetrievability: 0, hasRetrievability: false
    };
  }
  // 副指标2：全库平均可提取率（FSRS 已开且有 memory_state 卡片时才有意义）
  // 在 today_answered 与 today_empty 两种状态下都计算，让用户在还没学习时也能看全库参考。
  const 可提取率: RetrievabilitySummary | null = 图表数据.retrievability;
  const 有可提取率: boolean = 图表数据.fsrs
    && 可提取率 !== null && 可提取率.average > 0;
  const 全库平均可提取率: number = 有可提取率
    ? 可提取率!.average / 100 : 0;

  const 今日数据 = 图表数据.today;
  if (今日数据 === null || 今日数据.answerCount <= 0) {
    return {
      state: 'today_empty',
      todayAgainRate: 0, todayAnsweredCount: 0,
      matureCorrectRate: 0, hasMatureData: false,
      averageRetrievability: 全库平均可提取率,
      hasRetrievability: 有可提取率
    };
  }
  // 主指标：今日不会率 = (answer - correct) / answer
  const 不会次数: number = 今日数据.answerCount - 今日数据.correctCount;
  const 今日不会率: number = 不会次数 / 今日数据.answerCount;
  // 副指标1：今日 mature 卡正确率（仅 matureCount>0 时有意义）
  const 有熟练卡数据: boolean = 今日数据.matureCount > 0;
  const 熟练卡正确率: number = 有熟练卡数据
    ? 今日数据.matureCorrect / 今日数据.matureCount : 0;
  return {
    state: 'today_answered',
    todayAgainRate: 今日不会率,
    todayAnsweredCount: 今日数据.answerCount,
    matureCorrectRate: 熟练卡正确率,
    hasMatureData: 有熟练卡数据,
    averageRetrievability: 全库平均可提取率,
    hasRetrievability: 有可提取率
  };
}

/**
 * 主页列表按前序保留完整牌组树。父牌组计数直接沿用 Anki Core 的聚合计数，
 * 不从已平铺的子牌组重新求和。
 *
 * 今日完成（completedCount）来源：graphs.today.answerCount（Anki 后端 today.rs
 * 遍历 revlog 统计 learn+review+relearn+filtered，全库聚合、含全部子牌组学习）。
 * 旧实现用 CountsForDeckToday RPC 对顶层牌组求 new+review，既漏子牌组学习、
 * 又缺 learn/relearn 口径，已废弃。
 *
 * 图表数据 为 StatsService.getGraphs 结果（拉取失败传 null 时 completedCount/
 * 热力/记忆率均保持空态）；当前时刻 供测试锚定「今天」以校验热力日期映射。
 */
export function 构建主页快照(根节点: DeckTreeNode,
  图表数据: GraphsView | null = null, 当前时刻: Date = new Date(),
  色调覆盖: Map<string, 牌组色调> | null = null,
  别名覆盖: Map<string, string> | null = null,
  顺序覆盖: Map<string, string[]> | null = null,
  背景图覆盖: Map<string, string> | null = null): 主页快照 {
  const 牌组列表: 牌组汇总[] = 平铺牌组树(根节点, 色调覆盖, 别名覆盖,
    顺序覆盖, 背景图覆盖);
  let 总待办数: number = 0;
  for (const 子节点 of 根节点.children) {
    总待办数 += 子节点.newCount + 子节点.learnCount + 子节点.reviewCount;
  }
  return {
    today: {
      completedCount: 转为今日完成数(图表数据),
      pendingCount: 总待办数,
      deckCount: 统计牌组树节点数(根节点)
    },
    decks: 牌组列表,
    memory: 转为记忆表现汇总(图表数据)
  };
}

/** 今日完成 = graphs.today.answerCount（含 learn/review/relearn/filtered，全库聚合）；缺省为 0。 */
function 转为今日完成数(图表数据: GraphsView | null): number {
  if (图表数据 === null || 图表数据.today === null) {
    return 0;
  }
  return 图表数据.today.answerCount;
}
