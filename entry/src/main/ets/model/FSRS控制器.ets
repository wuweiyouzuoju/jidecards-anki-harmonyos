// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID MODEL-FSRS-CTRL-001
// @名称 FSRS 全局开关控制器
//
// @作用
// FSRS（Free Spaced Repetition Scheduler）全局开关控制器。
// Anki 的 fsrs 字段是 collection 级全局 flag（不是 per-deck）：
// 整个 collection 要么全用 FSRS，要么全用 SM-2，二选一。
// Anki 24.04 起官方推荐默认开启 FSRS。
//
// 提供两个能力：
// 1. 确保FSRS已开启一次(): App 首次启动时若 fsrs=false 则自动开启一次，
//    并写 fsrs_initialized 标记；之后用户在设置页关闭就保持关闭，下次启动不再自动开启。
// 2. 设置FSRS开启状态(value): 设置页切换开关时回写到后端，保留 view 中其他字段不丢。
//
// 另提供 加载FSRS开启状态() 用于设置页打开时同步 UI。
//
// @输入
// 无（确保/加载）；enabled: boolean（设置）
//
// @输出
// 确保FSRS已开启一次(): Promise<void>
// 设置FSRS开启状态(enabled): Promise<boolean>
// 加载FSRS开启状态(): Promise<boolean | null>
//
// @业务规则
// - targetDeckId 用 Default deck (id=1)。Anki 约定 Default deck 不可删除且 id 固定，
//   fsrs 字段与 targetDeckId 无关，只是后端用 targetDeckId 定位 currentDeck.limits。
// - configs 数组只回传 view.allConfigs 里的所有 config，原样保真（含 preserved 字节）。
// - fsrsReschedule：view 里没有这个字段；开启 FSRS 时设 true（让卡片按新算法重新调度），
//   关闭时设 false（无新算法需要应用）。
//
// @副作用
// 读写 preferences 的 jidecards_settings store；
// 通过 牌组配置服务 间接修改 Anki collection 状态。
//
// @注意
// preferences 中的字符串键（'jidecards_settings' / 'fsrs_initialized' /
// 'abilityContext'）属持久化协议字段，保留英文，不可中文化。
// import 路径 `../backend/牌组配置服务` 已经是中文，保留不变。
// ========================================================

import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { 牌组配置服务 } from '../backend/牌组配置服务';
import { 统计服务 } from '../backend/统计服务';
import { 牌组服务 } from '../backend/牌组服务';
import { 后端会话 } from '../backend/后端会话';
import { 保存卡片数据, 提取卡片数据, 加载小时分布窗口, 加载统计天数, 加载分离暂停偏好 } from './桌面卡片数据存储';
import { 平铺牌组树 } from './牌组层级';
import type {
  DeckConfig,
  DeckConfigsForUpdateView,
  UpdateDeckConfigsInput
} from '../proto/messages/DeckConfigMessages';
import { UPDATE_DECK_CONFIGS_MODE_NORMAL } from '../proto/messages/DeckConfigMessages';
import type { GraphsView } from '../proto/messages/StatsMessages';

const 存储名: string = 'jidecards_settings';
const FSRS已初始化键: string = 'fsrs_initialized';
const 上下文键: string = 'abilityContext';
const 默认牌组ID: number = 1;

export const FSRS_STATE_REVISION_KEY: string = 'fsrsStateRevision';

/** 通知已挂载页面重新读取全局开关；通知值不承载 FSRS 状态。 */
export function notifyFsrsStateChanged(): void {
  const revision: number = AppStorage.get<number>(FSRS_STATE_REVISION_KEY) ?? 0;
  AppStorage.setOrCreate<number>(FSRS_STATE_REVISION_KEY, revision + 1);
}

function 取上下文(): common.UIAbilityContext | null {
  const 上下文: common.UIAbilityContext | undefined =
    AppStorage.get<common.UIAbilityContext>(上下文键);
  return 上下文 === undefined ? null : 上下文;
}

async function 加载已初始化标记(): Promise<boolean> {
  const 上下文: common.UIAbilityContext | null = 取上下文();
  if (上下文 === null) {
    return false;
  }
  try {
    const 存储: preferences.Preferences = await preferences.getPreferences(上下文, 存储名);
    const 值: preferences.ValueType = await 存储.get(FSRS已初始化键, false);
    return 值 === true;
  } catch (错误) {
    return false;
  }
}

async function 标记已初始化(): Promise<void> {
  const 上下文: common.UIAbilityContext | null = 取上下文();
  if (上下文 === null) {
    return;
  }
  try {
    const 存储: preferences.Preferences = await preferences.getPreferences(上下文, 存储名);
    await 存储.put(FSRS已初始化键, true);
    await 存储.flush();
  } catch (错误) {
    // 偏好不可用时不阻断；下次启动可能再次尝试开启。
  }
}

/** 从 view 构造 UpdateDeckConfigsInput，仅覆盖 fsrs/fsrsReschedule，其他字段原样回传。 */
function 构造请求(视图: DeckConfigsForUpdateView, fsrs开关: boolean, fsrs重调度: boolean): UpdateDeckConfigsInput {
  const 配置列表: DeckConfig[] = [];
  for (let i: number = 0; i < 视图.allConfigs.length; i++) {
    配置列表.push(视图.allConfigs[i].config);
  }
  return {
    targetDeckId: 默认牌组ID,
    configs: 配置列表,
    removedConfigIds: [],
    mode: UPDATE_DECK_CONFIGS_MODE_NORMAL,
    cardStateCustomizer: 视图.cardStateCustomizer,
    limits: 视图.currentDeck === null ? null : 视图.currentDeck.limits,
    newCardsIgnoreReviewLimit: 视图.newCardsIgnoreReviewLimit,
    fsrs: fsrs开关,
    applyAllParentLimits: 视图.applyAllParentLimits,
    fsrsReschedule: fsrs重调度,
    fsrsHealthCheck: 视图.fsrsHealthCheck
  };
}

// ========================================================
// @块ID MODEL-FSRS-CTRL-002
// @名称 确保FSRS已开启一次
//
// @作用
// App 首次启动时调用一次：若 fsrs 未初始化且当前为 false，则自动开启 FSRS。
// 已初始化过则跳过，保留用户后续在设置页的关闭状态。
//
// @输入
// 无
//
// @输出
// Promise<void>。失败静默降级，不阻断首页加载。
//
// @业务规则
// 后端不可用时不写 initialized 标记，下次启动重试。
//
// @副作用
// 读取并写入 preferences 的 fsrs_initialized 键；
// 通过 牌组配置服务 修改 Anki collection 的 fsrs 字段。
// ========================================================
export async function 确保FSRS已开启一次(): Promise<void> {
  const 已初始化: boolean = await 加载已初始化标记();
  if (已初始化) {
    return;
  }
  const 服务: 牌组配置服务 = new 牌组配置服务();
  try {
    const 视图: DeckConfigsForUpdateView = await 服务.获取牌组配置编辑视图(默认牌组ID);
    if (!视图.fsrs) {
      const 请求: UpdateDeckConfigsInput = 构造请求(视图, true, true);
      await 服务.更新牌组配置(请求);
      notifyFsrsStateChanged();
    }
  } catch (错误) {
    // 后端不可用时不写 initialized 标记，下次启动重试。
    return;
  }
  await 标记已初始化();
}

// ========================================================
// @块ID MODEL-FSRS-CTRL-003
// @名称 设置FSRS开启状态
//
// @作用
// 设置页切换 FSRS 开关：拉取最新 view 后仅覆盖 fsrs/fsrsReschedule 字段回写。
//
// @输入
// enabled: boolean - 期望的 FSRS 开关状态
//
// @输出
// Promise<boolean>：最终落盘的 fsrs 值（成功时与入参一致；失败时抛出异常，
// 由调用方决定回滚 UI）。
//
// @副作用
// 通过 牌组配置服务 修改 Anki collection 的 fsrs 字段。
// ========================================================
export async function 设置FSRS开启状态(开启: boolean): Promise<boolean> {
  const 服务: 牌组配置服务 = new 牌组配置服务();
  const 视图: DeckConfigsForUpdateView = await 服务.获取牌组配置编辑视图(默认牌组ID);
  const 请求: UpdateDeckConfigsInput = 构造请求(视图, 开启, 开启);
  try {
    await 服务.更新牌组配置(请求);
    const saved: DeckConfigsForUpdateView = await 服务.获取牌组配置编辑视图(默认牌组ID);
    if (saved.fsrs !== 开启) {
      throw new Error('FSRS state verification failed');
    }
  } finally {
    // 写入或读回失败也刷新，避免界面继续展示未经确认的乐观状态。
    notifyFsrsStateChanged();
  }
  // FSRS 状态变更后主动刷新桌面卡片数据：用户在设置页开/关 FSRS 后，
  // 桌面卡片的"记忆率/难度分布"页需立即反映新状态，否则会一直显示
  // "未启用 FSRS"（仅靠首页加载触发推送，用户不回首页就不会刷新）。
  刷新桌面卡片数据().catch((错误: Object): void => {
    hilog.error(0x0000, 'FSRS控制器', `切换FSRS后刷新桌面卡片数据失败: ${错误}`);
  });
  return 开启;
}

// ========================================================
// @名称 刷新桌面卡片数据
// @作用 拉取最新 GraphsView 并推送到桌面卡片（FSRS 切换 / 主题切换等需立即反映的场景）
// @副作用 调用 统计服务 + 保存卡片数据（写 filesDir + formProvider.updateForm）
// ========================================================
export async function 刷新桌面卡片数据(): Promise<void> {
  const 上下文: common.UIAbilityContext | null = 取上下文();
  if (上下文 === null) {
    return;
  }
  try {
    await 后端会话.获取实例().确保已打开(上下文.filesDir);
    const 统计: 统计服务 = new 统计服务();
    // days 跟随统计页「近 1 年/全部」偏好，否则桌面卡片与统计页数据不一致
    const graphs: GraphsView = await 统计.获取图表统计(await 加载统计天数());
    // 拉牌组树算待学数/牌组数，供桌面卡片今日进度页（失败时传0）
    let 总待学: number = 0;
    let 牌组总数: number = 0;
    try {
      const 牌组: 牌组服务 = new 牌组服务();
      const tree = await 牌组.获取牌组树();
      for (const 子节点 of tree.children) {
        总待学 += 子节点.newCount + 子节点.learnCount + 子节点.reviewCount;
      }
      牌组总数 = 平铺牌组树(tree).length;
    } catch (_牌组错误) {
      // 牌组树拉取失败不阻塞，桌面卡片显示0
    }
    await 保存卡片数据(提取卡片数据(graphs, 总待学, 牌组总数, await 加载小时分布窗口(), await 加载分离暂停偏好()));
  } catch (错误) {
    hilog.error(0x0000, 'FSRS控制器', `刷新桌面卡片数据异常: ${错误}`);
  }
}

// ========================================================
// @块ID MODEL-FSRS-CTRL-004
// @名称 加载FSRS开启状态
//
// @作用
// 读取当前 FSRS 开关状态（从后端 view 拉）。设置页打开时调用一次同步 UI。
//
// @输入
// 无
//
// @输出
// Promise<boolean | null>：当前 FSRS 开关；失败时返回 null，
// UI 可显示"加载失败"或隐藏开关。
//
// @副作用
// 通过 牌组配置服务 只读 view，不写入。
// ========================================================
export async function 加载FSRS开启状态(): Promise<boolean | null> {
  const 服务: 牌组配置服务 = new 牌组配置服务();
  try {
    const 视图: DeckConfigsForUpdateView = await 服务.获取牌组配置编辑视图(默认牌组ID);
    return 视图.fsrs;
  } catch (错误) {
    return null;
  }
}
