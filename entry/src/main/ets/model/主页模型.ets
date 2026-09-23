// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID MODEL-HOME-001
// @名称 主页模型
//
// @作用
// 主页所需的全部数据模型与辅助函数：牌组色调枚举与持久化字符串互转、
// 牌组汇总/今日学习汇总/记忆表现汇总/主页快照等接口定义、
// 牌组列表数据源（实现 IDataSource 供 LazyForEach 使用）、
// 待办数与显示名辅助函数、空态常量。
//
// @输入
// 牌组色调原始字符串（解析时）/ 牌组汇总对象（计算待办数与显示名时）
//
// @输出
// 牌组色调枚举与字符串互转结果 / 各类模型接口 / 牌组列表数据源实例 / 空态常量
//
// @业务规则
// 色调枚举的字符串值（'blue'/'purple'/'mint'/'amber'/'black'/'red'/'none'）
// 是持久化值，必须保留英文小写形式以兼容历史 preferences 数据。
// 枚举成员名（Blue/Purple/Mint/Amber/Black/Red/None）亦保留英文，避免破坏调用方。
// 记忆状态卡片口径遵循 B12-X 改造（2026-07-21）：
// 主指标使用今日不会率，副指标保留 mature 正确率与全库平均可提取率。
//
// @副作用
// 无。本文件仅定义类型与纯函数，不读写 preferences 与后端。
//
// @注意
// 修改色调枚举字符串值会破坏历史持久化数据；修改 牌组汇总 字段需同步
// 牌组层级.ets 的 平铺牌组树 与 主页快照映射器.ets 的 构建主页快照。
// ========================================================

export enum 牌组色调 {
  Blue,
  Purple,
  Mint,
  Amber,
  Black,
  Red,
  None
}

/** 把持久化的字符串值安全转回 牌组色调；非法/未设置时返回 null。 */
export function 解析牌组色调(原始值: string | undefined | null): 牌组色调 | null {
  switch (原始值) {
    case 'blue':
      return 牌组色调.Blue;
    case 'purple':
      return 牌组色调.Purple;
    case 'mint':
      return 牌组色调.Mint;
    case 'amber':
      return 牌组色调.Amber;
    case 'black':
      return 牌组色调.Black;
    case 'red':
      return 牌组色调.Red;
    case 'none':
      return 牌组色调.None;
    default:
      return null;
  }
}

/** 牌组色调 → 持久化字符串值（小写英文，写入 preferences 时使用）。 */
export function 牌组色调键(色调: 牌组色调): string {
  switch (色调) {
    case 牌组色调.Purple:
      return 'purple';
    case 牌组色调.Mint:
      return 'mint';
    case 牌组色调.Amber:
      return 'amber';
    case 牌组色调.Black:
      return 'black';
    case 牌组色调.Red:
      return 'red';
    case 牌组色调.None:
      return 'none';
    case 牌组色调.Blue:
    default:
      return 'blue';
  }
}

export interface 牌组汇总 {
  id: string;
  name: string;
  fullName: string;
  depth: number;
  parentId: string;
  hasChildren: boolean;
  ancestorIds: string[];
  description: string;
  newCount: number;
  learningCount: number;
  reviewCount: number;
  totalCards: number;
  tone: 牌组色调;
  // 用户自定义别名（来自本地 preferences，不动后端 deck name）。
  // 空串表示无覆盖，UI 显示时回退到 name；非空时 UI 优先显示此值。
  displayName: string;
  // 牌组背景图沙盒路径（来自本地 preferences + filesDir，不动后端）。
  // 空串表示无背景图，DeckListItem 走原 surface_card 背景；非空时 Stack 底层叠 Image(objectFit=Cover)。
  backgroundImage: string;
}

export interface 今日学习汇总 {
  completedCount: number;
  pendingCount: number;
  deckCount: number;
}

// 记忆状态卡片的展示状态（B12-X 改造 2026-07-21）：
// 旧实现基于 retrievability.average（全库 FSRS 卡平均可提取率），但这是"全库平均"而非"今日表现"，
// 用户主观感受"今天答不会的卡很多"会被全库 mature 卡拉高的 97% 掩盖（详见 decisions.md B12-X）。
// 新口径改用 Anki Desktop today.ts 同款算法：today.againRate = (answer - correct) / answer。
// - today_answered: 今天已答卡，显示今日不会率 + mature 正确率 + 全库平均可提取率（副标题）
// - today_empty: 今天还没答卡，空态提示去学习
// - load_error: graphs 拉取失败
// - loading: 首次拉取中
export type 记忆状态 = 'today_answered' | 'today_empty' | 'load_error' | 'loading';

export interface 记忆表现汇总 {
  state: 记忆状态;
  // 主指标：今日不会率（0-1）= (answerCount - correctCount) / answerCount
  // state='today_answered' 时有意义；其余状态保持 0。
  todayAgainRate: number;
  // 今日已答次数（副标题"今日共答 N 次"用），仅 today_answered 时 > 0
  todayAnsweredCount: number;
  // 今日 mature 卡正确率（0-1，副标题用）
  // hasMatureData=false 时 matureCorrectRate 保持 0 且不显示
  matureCorrectRate: number;
  hasMatureData: boolean;
  // 全库平均可提取率（0-1，副标题用）
  // hasRetrievability=false 时（FSRS 未开 / 无 memory_state 卡）保持 0 且不显示
  averageRetrievability: number;
  hasRetrievability: boolean;
}

export interface 主页快照 {
  today: 今日学习汇总;
  decks: 牌组汇总[];
  memory: 记忆表现汇总;
}

export type 主页加载状态 = 'loading' | 'ready' | 'empty' | 'error';

export class 牌组列表数据源 implements IDataSource {
  private 牌组列表: 牌组汇总[];
  private readonly 监听器列表: DataChangeListener[] = [];

  constructor(初始牌组: 牌组汇总[]) {
    this.牌组列表 = 初始牌组;
  }

  totalCount(): number {
    return this.牌组列表.length;
  }

  getData(索引: number): 牌组汇总 {
    return this.牌组列表[索引];
  }

  replaceAll(新牌组: 牌组汇总[]): void {
    this.牌组列表 = 新牌组;
    for (let 索引: number = 0; 索引 < this.监听器列表.length; 索引++) {
      this.监听器列表[索引].onDataReloaded();
    }
  }

  /**
   * 拖拽排序：把 from 位置的项移动到 to 位置（仅内存，不落盘；调用方需另行 saveDeckOrder）。
   * ArkUI List.onMove 回调语义：from > to 表示前移，from < to 表示后移。
   * 实现按 splice 移除再插入，与 ArkUI 默认预期一致。
   * 调用方需自行校验 from/to 在同一 parent（同 depth 同 ancestorIds），跨 parent 不允许移动。
   */
  moveItem(起点: number, 终点: number): void {
    if (起点 === 终点 || 起点 < 0 || 终点 < 0
      || 起点 >= this.牌组列表.length || 终点 >= this.牌组列表.length) {
      return;
    }
    const 移动项: 牌组汇总 = this.牌组列表[起点];
    this.牌组列表.splice(起点, 1);
    this.牌组列表.splice(终点, 0, 移动项);
    for (let 索引: number = 0; 索引 < this.监听器列表.length; 索引++) {
      this.监听器列表[索引].onDataReloaded();
    }
  }

  /** 取当前列表数据快照（用于计算某 parent 下的最新顺序并持久化）。 */
  snapshotDecks(): 牌组汇总[] {
    return this.牌组列表.slice();
  }

  registerDataChangeListener(监听器: DataChangeListener): void {
    if (this.监听器列表.indexOf(监听器) < 0) {
      this.监听器列表.push(监听器);
    }
  }

  unregisterDataChangeListener(监听器: DataChangeListener): void {
    const 索引: number = this.监听器列表.indexOf(监听器);
    if (索引 >= 0) {
      this.监听器列表.splice(索引, 1);
    }
  }
}

/** 计算单张牌组的待办总数（新学 + 学习中 + 待复习）。 */
export function 待办数(牌组: 牌组汇总): number {
  return 牌组.newCount + 牌组.learningCount + 牌组.reviewCount;
}

/** UI 显示用的牌组名：有 displayName 覆盖时优先用，否则回退到后端真实 name。
 *  默认牌组（id=1）名跟随系统语言：中文显示"默认牌组"，英文显示"Default"。 */
export function 牌组显示名(牌组: 牌组汇总): string {
  if (牌组.displayName !== '') {
    return 牌组.displayName;
  }
  // 默认牌组本地化：数据库里存的是 "Default"，前端按系统语言显示
  if (牌组.id === '1') {
    const 语言: string = AppStorage.get<string>('系统语言') ?? 'zh-Hans';
    return 语言.startsWith('en') ? 'Default' : '默认牌组';
  }
  return 牌组.name;
}

export const 空牌组汇总: 牌组汇总 = {
  id: '',
  name: '',
  fullName: '',
  depth: 0,
  parentId: '',
  hasChildren: false,
  ancestorIds: [],
  description: '',
  newCount: 0,
  learningCount: 0,
  reviewCount: 0,
  totalCards: 0,
  tone: 牌组色调.Blue,
  displayName: '',
  backgroundImage: ''
};

export const 空主页快照: 主页快照 = {
  today: {
    completedCount: 0,
    pendingCount: 0,
    deckCount: 0
  },
  decks: [],
  memory: {
    state: 'loading',
    todayAgainRate: 0,
    todayAnsweredCount: 0,
    matureCorrectRate: 0,
    hasMatureData: false,
    averageRetrievability: 0,
    hasRetrievability: false
  }
};
