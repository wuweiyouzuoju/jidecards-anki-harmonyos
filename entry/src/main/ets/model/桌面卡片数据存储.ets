// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID MODEL-WIDGET-DATA-001
// @名称 桌面卡片数据持久化
//
// @作用
// 桌面服务卡片（2×4 统计卡片）的数据桥接层。
// 主进程拉取 GraphsView 后提取 7 页所需数据，JSON 序列化存入 preferences；
// FormExtensionAbility（独立进程）读取后通过 formProvider.updateForm 推送到卡片 UI。
//
// 7 页数据：
// 1. 记忆率：retrievability.average（0-100 百分制）+ fsrs 标志
// 2. 今日计数：today { answerCount, correctCount, learnCount, reviewCount, relearnCount }
// 3. 卡片状态：cardCounts.excludingInactive（newCards/learn/relearn/young/mature/suspended/buried）
// 4. 小时分布：hours.allTime（24 元素 HourBucket）
// 5. 难度分布：eases.eases map → 桶数组 + average
// 6. 间隔分布：intervals.intervals map → 桶数组
// 7. 未来到期预测：futureDue 未来 7 天到期数数组
//
// @输入
// 保存：桌面卡片数据 接口
// 加载：无
//
// @输出
// 保存卡片数据(数据): Promise<void>
// 加载卡片数据(): Promise<桌面卡片数据 | null>
//
// @业务规则
// - 数据流方向：主进程写 → 卡片进程读（单向，跨进程通过 filesDir 共享文件）
// - 用文件系统而非 preferences：preferences 跨 Ability 共享行为不稳定
// - 必须用 applicationContext.filesDir：UIAbility 的 context.filesDir 是 /data/storage/el2/base/haps/entry/files，
//   FormExtensionAbility 的 context.filesDir 是 /data/storage/el2/base/haps/<formModule>/files，
//   两者路径不同互相读不到。applicationContext.filesDir 是 /data/storage/el2/base/files，跨所有 Ability 共享。
//   详见 https://developer.huawei.com/consumer/cn/doc/harmonyos-faqs/faqs-local-file-manager-42
// - Map 字段统一转为 [键, 值][] 数组（卡片沙箱无法直接 JSON.parse Map）
// - 未来到期只存未来 7 天（含今天），减少数据量
// - 持久化失败记录 hilog，卡片显示上次数据或空态
//
// @副作用
// 读写 filesDir/widget_stats.json
// 读写 filesDir/widget_form_ids.json（FormExtensionAbility 写 formId，主进程读后主动推送）
// ========================================================

import { common } from '@kit.AbilityKit';
import { fileIo } from '@kit.CoreFileKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { util } from '@kit.ArkTS';
import { preferences } from '@kit.ArkData';
import { formBindingData, formProvider, formInfo } from '@kit.FormKit';
import { 统计服务 } from '../backend/统计服务';
import type { GraphsView, TodayCounts, Eases, Hours, Intervals, GraphPreferences } from '../proto/messages/StatsMessages';

const 日志域: string = 'WidgetData';
const 数据文件名: string = 'widget_stats.json';
const formId文件名: string = 'widget_form_ids.json';
const 上下文键: string = 'abilityContext';
// preferences 持久化协议字段，禁止修改（统计页切换小时分布窗口/统计天数 → 卡片跟随）
const 偏好存储名: string = 'jidecards_settings';
const 小时分布窗口键: string = 'stats_hours_range';
const 统计天数键: string = 'stats_days_range';

// ========================================================
// @块ID MODEL-WIDGET-DATA-002
// @名称 桌面卡片数据结构
//
// @作用
// 7 页 Swiper 卡片所需数据的序列化载体。
// 全部为基础类型或其数组，可 JSON.stringify；卡片侧 JSON.parse 后直接渲染。
//
// @字段说明
// 记忆率：0-100 百分制；fsrsEnabled=false 时卡片显示"未启用 FSRS"
// 今日计数：直接透传 TodayCounts 的子集
// 卡片状态：7 个分桶计数（newCards/learn/relearn/young/mature/suspended/buried）
// 小时分布：24 个 [总数, 正确数] 二元组（hours.allTime）
// 难度分布：[难度桶, 卡片数][] + 平均值（后端已是百分比，直接显示）
// 间隔分布：[间隔桶天, 卡片数][]
// 未来到期：[距今天数, 到期数][] 未来 7 天
// 更新时间：毫秒时间戳，卡片显示"更新于 HH:mm"
// ========================================================
export interface 卡片状态数据 {
  新卡: number;
  学习中: number;
  重学中: number;
  年轻: number;
  成熟: number;
  暂停: number;
  埋藏: number;
}

export interface 难度分布数据 {
  桶: [number, number][];
  平均: number;
}

export interface 桌面卡片数据 {
  // 页1：今日进度（主页今日进度卡样式：完成/待学/进度条/牌组数/今日答对率）
  今日完成数: number;       // = graphs.today.answerCount
  待学数: number;           // 牌组树 newCount+learnCount+reviewCount 聚合
  牌组数: number;           // 牌组树节点数
  今日答对率: number;        // correctCount/answerCount，0-1；-1 表示今日无答题
  // 页2：记忆率
  记忆率: number;           // 0-100 百分制，0 表示无 FSRS 数据
  fsrs已启用: boolean;
  // 页3：今日计数
  今日答题数: number;
  今日正确数: number;
  今日新学数: number;
  今日复习数: number;
  今日重学数: number;
  // 页4：卡片状态 —— 7 个分桶（excludingInactive）
  卡片状态: 卡片状态数据;
  // 页5：小时分布 —— 24 个 [总数, 正确数][]（按 小时分布窗口 取对应时间段）
  小时分布: [number, number][];
  // 小时分布窗口：0=近1月 1=近3月 2=近1年 3=全部（与统计页小时分布卡切换档一致）
  小时分布窗口: number;
  // 页6：难度分布 —— [难度桶百分比, 卡片数][] + 平均值（已是百分比）
  难度分布: 难度分布数据;
  // 页7：间隔分布 —— [间隔桶天, 卡片数][]
  间隔分布: [number, number][];
  // 页8：未来到期预测 —— [距今天数, 到期数][] 未来 7 天（含今天）
  未来到期: [number, number][];
  // 元信息
  更新时间: number;         // 毫秒时间戳
  // 系统语言（卡片沙箱不支持 i18n API，主进程注入）：'zh' 或 'en'
  语言: string;
  // 主题色（卡片沙箱无法访问 AppStorage，主进程序列化传入）
  主题色: 主题色载体;
}

// 主题色载体：从 AppStorage 读取后序列化传给卡片沙箱
export interface 主题色载体 {
  主色按钮背景: string;     // 进度环/今日答题数/今日新学/未来今日
  主色容器: string;         // 卡片背景微染
  主色文字: string;         // 标题
  文字主: string;           // 正文
  文字次: string;           // 次要文字
  页面底色: string;         // 卡片背景色（跟随主题页面底色）
  卡片底色: string;         // 卡片内部分区背景
  是否深色: boolean;
}

function 取上下文(): common.UIAbilityContext | null {
  const 上下文: common.UIAbilityContext | undefined =
    AppStorage.get<common.UIAbilityContext>(上下文键);
  return 上下文 === undefined ? null : 上下文;
}

// ========================================================
// @名称 聚合分布桶
// @作用 等宽分箱合并分布桶到上限数量，控制卡片 JSON 体积。
//       卡片/首页摘要的柱状图只用计数值（键不显示），合并对 UI 透明。
// @输入 桶数组: 已按键升序排序的 [键, 计数][]；上限: 最大桶数
// ========================================================
function 聚合分布桶(桶数组: [number, number][], 上限: number): [number, number][] {
  if (桶数组.length <= 上限) {
    return 桶数组;
  }
  const 最小键: number = 桶数组[0][0];
  const 最大键: number = 桶数组[桶数组.length - 1][0];
  const 桶宽: number = Math.max(1, Math.ceil((最大键 - 最小键 + 1) / 上限));
  const 结果: [number, number][] = [];
  let 当前箱序号: number = -1;
  for (let i: number = 0; i < 桶数组.length; i++) {
    const 键: number = 桶数组[i][0];
    const 计数: number = 桶数组[i][1];
    const 箱序号: number = Math.floor((键 - 最小键) / 桶宽);
    if (箱序号 === 当前箱序号 && 结果.length > 0) {
      结果[结果.length - 1][1] += 计数;
    } else {
      结果.push([键, 计数]);
      当前箱序号 = 箱序号;
    }
  }
  return 结果;
}

// ========================================================
// @块ID MODEL-WIDGET-DATA-003
// @名称 从 GraphsView 提取卡片数据
//
// @作用
// 主进程拉取统计后调此函数，把 GraphsView 转换为可序列化的 桌面卡片数据。
// 与 主页快照映射器.ets 的 转为按日期复习计数 同款日期键算法。
//
// @输入
// 图表数据: GraphsView（统计服务返回）
//
// @输出
// 桌面卡片数据（已剥离 Map/Resource 等不可序列化类型）
// ========================================================
export function 提取卡片数据(图表数据: GraphsView, 待学数: number = 0, 牌组数: number = 0, 小时窗口: number = 0, 分离暂停: boolean = false): 桌面卡片数据 {
  const 主题色: 主题色载体 = 读取主题色();
  const 当前时刻: Date = new Date();

  // 页1：今日进度（主页今日进度卡样式）
  const 今日: TodayCounts | null = 图表数据.today;
  const 今日答题数: number = 今日 !== null ? 今日.answerCount : 0;
  const 今日正确数: number = 今日 !== null ? 今日.correctCount : 0;
  const 今日完成数: number = 今日答题数; // 完成数 = 答题数（learn+review+relearn+filtered 全口径）
  const 今日答对率: number = 今日答题数 > 0 ? 今日正确数 / 今日答题数 : -1;

  // 页2：记忆率
  const 记忆率: number = 图表数据.retrievability !== null ? 图表数据.retrievability.average : 0;
  const fsrs已启用: boolean = 图表数据.fsrs;

  // 页3：今日计数（详细分桶，与今日进度页互补）
  const 今日新学数: number = 今日 !== null ? 今日.learnCount : 0;
  const 今日复习数: number = 今日 !== null ? 今日.reviewCount : 0;
  const 今日重学数: number = 今日 !== null ? 今日.relearnCount : 0;

  // 页4：卡片状态 —— 跟随统计页「分离暂停与搁置卡片」偏好（Anki CardCounts 口径）：
  // 分离=true 用 excludingInactive（暂停/埋藏单独计数）；false 用 includingInactive；
  // 所选口径为 null 时回退另一口径（后端只算出其中一份的场景）
  const 卡片状态源 = 图表数据.cardCounts !== null
    ? ((分离暂停 ? 图表数据.cardCounts.excludingInactive : 图表数据.cardCounts.includingInactive)
       ?? (分离暂停 ? 图表数据.cardCounts.includingInactive : 图表数据.cardCounts.excludingInactive))
    : null;
  const 卡片状态: 卡片状态数据 = {
    新卡: 卡片状态源 !== null ? 卡片状态源.newCards : 0,
    学习中: 卡片状态源 !== null ? 卡片状态源.learn : 0,
    重学中: 卡片状态源 !== null ? 卡片状态源.relearn : 0,
    年轻: 卡片状态源 !== null ? 卡片状态源.young : 0,
    成熟: 卡片状态源 !== null ? 卡片状态源.mature : 0,
    暂停: 卡片状态源 !== null ? 卡片状态源.suspended : 0,
    埋藏: 卡片状态源 !== null ? 卡片状态源.buried : 0
  };

  // 页5：小时分布 —— 按窗口取对应时间段（0=1月 1=3月 2=1年 3=全部，与统计页切换档一致）
  const 小时源: Hours | null = 图表数据.hours;
  let 桶列表 = 小时源 === null ? [] :
    (小时窗口 === 1 ? 小时源.threeMonths
      : 小时窗口 === 2 ? 小时源.oneYear
        : 小时窗口 === 3 ? 小时源.allTime
          : 小时源.oneMonth);
  const 小时分布: [number, number][] = [];
  if (桶列表.length > 0) {
    for (let i: number = 0; i < 桶列表.length; i++) {
      const 桶 = 桶列表[i];
      小时分布.push([桶.total, 桶.correct]);
    }
  } else {
    // 无数据时补齐 24 个零桶，卡片侧渲染保持稳定
    for (let i: number = 0; i < 24; i++) {
      小时分布.push([0, 0]);
    }
  }

  // 页6：难度分布 —— FSRS 用 difficulty，SM-2 用 eases，两者结构相同（Eases）
  // 回退规则：FSRS 启用时后端可能返回 difficulty 对象但其 eases map 为 null/空
  // （卡片尚未经过 FSRS 算法），此时回退到 eases（SM-2 历史难度数据）。
  let 难度源: Eases | null = null;
  if (图表数据.difficulty !== null
      && 图表数据.difficulty.eases !== null
      && 图表数据.difficulty.eases.size > 0) {
    难度源 = 图表数据.difficulty;
  } else if (图表数据.eases !== null
             && 图表数据.eases.eases !== null
             && 图表数据.eases.eases.size > 0) {
    难度源 = 图表数据.eases;
  }
  const 难度桶数组: [number, number][] = [];
  if (难度源 !== null && 难度源.eases !== null) {
    难度源.eases.forEach((计数: number, 桶: number) => {
      难度桶数组.push([桶, 计数]);
    });
  }
  难度桶数组.sort((a, b) => a[0] - b[0]);
  // 聚合分箱控制在 20 桶内：卡片 UI 只按计数画柱（键不显示），
  // SM-2 键域 130~390 可达上百桶，直接透传会撑爆 FormBindingData 的 2KB 跨进程上限
  const 难度分布: 难度分布数据 = {
    桶: 聚合分布桶(难度桶数组, 20),
    平均: 难度源 !== null ? 难度源.average : 0
  };

  // 页7：间隔分布 —— 对齐 Anki 官方 Review Intervals：始终显示复习间隔天数，与 FSRS 无关
  const 间隔源: Intervals | null = 图表数据.intervals;
  const 间隔桶数组: [number, number][] = [];
  if (间隔源 !== null && 间隔源.intervals !== null) {
    间隔源.intervals.forEach((计数: number, 桶: number) => {
      间隔桶数组.push([桶, 计数]);
    });
  }
  间隔桶数组.sort((a, b) => a[0] - b[0]);
  // 聚合分箱控制在 20 桶内（与难度分布同款）：截断会丢长间隔数据，
  // 等宽合并后仍保留全键域；卡片 UI 只按计数画柱，合并对渲染透明
  const 间隔分布: [number, number][] = 聚合分布桶(间隔桶数组, 20);

  // 页8：未来到期预测 —— 取未来 30 天（0~29，整月），过滤 backlog（负数）
  const 未来到期: [number, number][] = [];
  if (图表数据.futureDue !== null && 图表数据.futureDue.futureDue !== null) {
    图表数据.futureDue.futureDue.forEach((到期数: number, 天偏移: number) => {
      if (天偏移 >= 0 && 天偏移 <= 29) {
        未来到期.push([天偏移, 到期数]);
      }
    });
  }
  // 补齐 30 天（缺失的天补 0），卡片侧细条整月渲染保持稳定
  for (let i: number = 0; i <= 29; i++) {
    const 已存在: boolean = 未来到期.some((项) => 项[0] === i);
    if (!已存在) {
      未来到期.push([i, 0]);
    }
  }
  未来到期.sort((a, b) => a[0] - b[0]);

  return {
    今日完成数,
    待学数,
    牌组数,
    今日答对率,
    记忆率,
    fsrs已启用,
    今日答题数,
    今日正确数,
    今日新学数,
    今日复习数,
    今日重学数,
    卡片状态,
    小时分布,
    小时分布窗口: 小时窗口,
    难度分布,
    间隔分布,
    未来到期,
    更新时间: 当前时刻.getTime(),
    语言: 读取系统语言(),
    主题色
  };
}

// ========================================================
// @名称 读取系统语言
// @作用 从 AppStorage 读取 EntryAbility 启动时存的系统语言，供卡片沙箱本地化
// @兜底 AppStorage 无值时返回 'zh'
// ========================================================
function 读取系统语言(): string {
  const 语言: string | undefined = AppStorage.get<string>('系统语言');
  return 语言 === undefined ? 'zh-Hans' : 语言;
}

// ========================================================
// @名称 读取主题色
// @作用 从 AppStorage 读取当前主题色板，序列化传给卡片沙箱
// @兜底 AppStorage 无值时用极光蓝默认色板
// ========================================================
function 读取主题色(): 主题色载体 {
  const 取串: (键: string, 默认: string) => string = (键: string, 默认: string): string => {
    const 值: string | undefined = AppStorage.get<string>(键);
    return 值 === undefined ? 默认 : 值;
  };
  // 深浅色判断逻辑与 EntryAbility.effectiveDarkMode 一致
  const 主题模式: string = AppStorage.get<string>('themeMode') ?? 'system';
  const 系统深色: boolean = AppStorage.get<boolean>('systemDarkMode') ?? false;
  const 是否深色: boolean = 主题模式 === 'dark' ? true : (主题模式 === 'light' ? false : 系统深色);
  return {
    主色按钮背景: 取串('theme_color_primary_button', '#2F5FD0'),
    主色容器: 取串('theme_color_primary_container', '#E8EEFC'),
    主色文字: 取串('theme_color_primary_text', '#2F5FD0'),
    文字主: 是否深色 ? '#E6E8EE' : '#182230',
    文字次: 是否深色 ? '#9AA4B2' : '#667085',
    页面底色: 取串('theme_color_surface_page_tint', 是否深色 ? '#1C1F26' : '#F5F7FA'),
    卡片底色: 是否深色 ? '#252830' : '#FFFFFF',
    是否深色
  };
}

// ========================================================
// @块ID MODEL-WIDGET-DATA-004
// @名称 保存卡片数据
//
// @作用
// 主进程拉取统计后调用：把 桌面卡片数据 JSON 序列化写入 filesDir 共享文件。
// FormExtensionAbility 进程通过 加载卡片数据 读取同一文件。
//
// @为什么用文件系统而非 preferences：
// HarmonyOS preferences 在同一 bundle 不同 Ability 间的共享行为不稳定
// （实测 UIAbility 写入后 FormExtensionAbility 读不到）。
// filesDir 路径 /data/storage/el2/database/<bundleName>/base/files 跨 Ability 确定共享。
//
// @输入
// 数据: 桌面卡片数据
//
// @输出
// Promise<void>。持久化失败记录日志（卡片显示上次数据或空态）。
//
// @副作用
// 写入 filesDir/widget_stats.json（覆盖写）。
// ========================================================
export async function 保存卡片数据(数据: 桌面卡片数据): Promise<void> {
  const 上下文: common.UIAbilityContext | null = 取上下文();
  if (上下文 === null) {
    hilog.error(0x0000, 日志域, '保存卡片数据失败: AppStorage 中无 abilityContext');
    return;
  }
  try {
    const 路径: string = `${上下文.getApplicationContext().filesDir}/${数据文件名}`;
    const 文件: fileIo.File = fileIo.openSync(路径, fileIo.OpenMode.CREATE | fileIo.OpenMode.READ_WRITE | fileIo.OpenMode.TRUNC);
    const JSON串: string = JSON.stringify(数据);
    fileIo.writeSync(文件.fd, JSON串);
    fileIo.fsyncSync(文件.fd);
    fileIo.closeSync(文件);
    hilog.info(0x0000, 日志域, `保存卡片数据成功: ${路径}, ${JSON串.length} 字节`);
    // 保存成功后主动推送到所有已注册卡片，不依赖系统 30 分钟定时刷新
    await 推送到所有卡片(数据);
  } catch (错误) {
    hilog.error(0x0000, 日志域, `保存卡片数据异常: ${错误}`);
  }
}

// ========================================================
// @块ID MODEL-WIDGET-DATA-006
// @名称 小时分布窗口偏好
//
// @作用
// 统计页/首页卡片/桌面卡片共用的小时分布时间段选择（0=近1月 1=近3月 2=近1年 3=全部）。
// 统计页切换档位时保存；提取卡片数据前加载，实现三处口径一致。
//
// @副作用
// 读写 preferences（jidecards_settings / stats_hours_range）。
// ========================================================
export async function 加载小时分布窗口(): Promise<number> {
  const 上下文: common.UIAbilityContext | null = 取上下文();
  if (上下文 === null) {
    return 2;
  }
  try {
    const 存储: preferences.Preferences = await preferences.getPreferences(上下文, 偏好存储名);
    const 值: preferences.ValueType = await 存储.get(小时分布窗口键, 2);
    const 窗口: number = typeof 值 === 'number' ? 值 : 2;
    return 窗口 >= 0 && 窗口 <= 3 ? 窗口 : 2;
  } catch (_错误) {
    return 2;
  }
}

export async function 保存小时分布窗口(窗口: number): Promise<void> {
  const 上下文: common.UIAbilityContext | null = 取上下文();
  if (上下文 === null) {
    return;
  }
  try {
    const 存储: preferences.Preferences = await preferences.getPreferences(上下文, 偏好存储名);
    await 存储.put(小时分布窗口键, 窗口);
    await 存储.flush();
  } catch (_错误) {
    // 偏好写入失败静默跳过，不影响统计页展示
  }
}

// ========================================================
// @名称 统计天数偏好
// @作用 统计页顶栏「近 1 年(365)/全部(0)」两档（Anki RangeBox）的本地持久化。
//       统计页切换档位时保存；首页/FSRS控制器拉 GraphsView 前加载，
//       实现摘要卡/桌面卡片与统计页同一数据口径（days 决定后端 revlog 范围）。
//
// @副作用 读写 preferences（jidecards_settings / stats_days_range）。
// ========================================================
export async function 加载统计天数(): Promise<number> {
  const 上下文: common.UIAbilityContext | null = 取上下文();
  if (上下文 === null) {
    return 365;
  }
  try {
    const 存储: preferences.Preferences = await preferences.getPreferences(上下文, 偏好存储名);
    const 值: preferences.ValueType = await 存储.get(统计天数键, 365);
    if (typeof 值 !== 'number') {
      return 365;
    }
    // 仅两档合法：365=近 1 年，0=全部；越界回退默认
    return 值 === 0 ? 0 : 365;
  } catch (_错误) {
    return 365;
  }
}

export async function 保存统计天数(天数: number): Promise<void> {
  const 上下文: common.UIAbilityContext | null = 取上下文();
  if (上下文 === null) {
    return;
  }
  try {
    const 存储: preferences.Preferences = await preferences.getPreferences(上下文, 偏好存储名);
    await 存储.put(统计天数键, 天数);
    await 存储.flush();
  } catch (_错误) {
    // 偏好写入失败静默跳过，不影响统计页展示
  }
}

// ========================================================
// @名称 加载分离暂停偏好
// @作用 首页/FSRS控制器提取卡片数据时调用：读后端 GraphPreferences 的
//       cardCountsSeparateInactive（统计页图内复选框即时落库），
//       保证摘要卡/桌面卡片的「卡片数量」口径与统计页一致。
// @兜底 偏好读取失败返回 false（不分离，Anki 默认值）
// ========================================================
export async function 加载分离暂停偏好(): Promise<boolean> {
  try {
    const 统计: 统计服务 = new 统计服务();
    const 偏好: GraphPreferences = await 统计.获取图表偏好();
    return 偏好.cardCountsSeparateInactive;
  } catch (_错误) {
    return false;
  }
}

// ========================================================
// @块ID MODEL-WIDGET-DATA-005
// @名称 加载卡片数据
//
// @作用
// FormExtensionAbility 进程调用：从 filesDir 读取上次主进程保存的卡片数据。
//
// @输入
// 上下文: FormExtensionAbility 的 context（filesDir 与 UIAbility 共享）
//
// @输出
// Promise<桌面卡片数据 | null>。无数据或解析失败返回 null（卡片显示空态）。
//
// @副作用
// 只读 filesDir/widget_stats.json，不写入。
// ========================================================
export async function 加载卡片数据(上下文: common.Context): Promise<桌面卡片数据 | null> {
  try {
    const 路径: string = `${上下文.getApplicationContext().filesDir}/${数据文件名}`;
    if (!fileIo.accessSync(路径)) {
      hilog.info(0x0000, 日志域, `加载卡片数据: 文件不存在 ${路径}`);
      return null;
    }
    const 文件: fileIo.File = fileIo.openSync(路径, fileIo.OpenMode.READ_ONLY);
    const stat: fileIo.Stat = fileIo.statSync(文件.fd);
    const 长度: number = stat.size;
    const 缓冲: ArrayBuffer = new ArrayBuffer(长度);
    fileIo.readSync(文件.fd, 缓冲);
    fileIo.closeSync(文件);
    const 解码器: util.TextDecoder = util.TextDecoder.create('utf-8');
    const JSON串: string = 解码器.decodeToString(new Uint8Array(缓冲));
    hilog.info(0x0000, 日志域, `加载卡片数据成功: ${路径}, ${JSON串.length} 字节`);
    return JSON.parse(JSON串) as 桌面卡片数据;
  } catch (错误) {
    hilog.error(0x0000, 日志域, `加载卡片数据异常: ${错误}`);
    return null;
  }
}

// ========================================================
// @块ID MODEL-WIDGET-DATA-006
// @名称 formId 注册表（跨进程）
//
// @作用
// FormExtensionAbility.onAddForm 时调用 保存formId 把 formId 写入 filesDir。
// 主进程 保存卡片数据 后调用 推送到所有卡片 读取 formId 列表，
// 对每个 formId 调 formProvider.updateForm 主动推送数据。
//
// @为什么需要主动推送：
// HarmonyOS form 系统定时刷新最少 30 分钟，用户打开 App 拉到新数据后
// 卡片不会立即更新。主动推送让卡片在 App 拉到数据后立即刷新。
//
// @数据流
// FormExtensionAbility.onAddForm → 保存formId(formId) → filesDir/widget_form_ids.json
// 主进程 保存卡片数据 → 推送到所有卡片(数据) → 读 formId 列表 → formProvider.updateForm
// ========================================================

// formId 列表的 JSON 载体（arkts-no-untyped-obj-literals 要求）
interface formId载体 {
  ids: string[];
}

export async function 保存formId(formId: string): Promise<void> {
  try {
    const 上下文: common.UIAbilityContext | null = 取上下文();
    if (上下文 !== null) {
      // 主进程场景（理论上 FormExtensionAbility 才调此函数，此处兜底）
      await 写formId文件(上下文, formId);
      return;
    }
  } catch (e) {
    // ignore
  }
  // FormExtensionAbility 进程无 abilityContext，用传入的 context
  // 但此函数签名无 context 参数，FormExtensionAbility 应直接调 写formId文件
}

// 带 context 的保存formId（FormExtensionAbility 调用）
export async function 保存formId带上下文(上下文: common.Context, formId: string): Promise<void> {
  await 写formId文件(上下文, formId);
}

async function 写formId文件(上下文: common.Context, formId: string): Promise<void> {
  try {
    const 路径: string = `${上下文.getApplicationContext().filesDir}/${formId文件名}`;
    // 读取现有列表
    let ids: string[] = [];
    if (fileIo.accessSync(路径)) {
      const 文件: fileIo.File = fileIo.openSync(路径, fileIo.OpenMode.READ_ONLY);
      const stat: fileIo.Stat = fileIo.statSync(文件.fd);
      const 缓冲: ArrayBuffer = new ArrayBuffer(stat.size);
      fileIo.readSync(文件.fd, 缓冲);
      fileIo.closeSync(文件);
      const 解码器: util.TextDecoder = util.TextDecoder.create('utf-8');
      const JSON串: string = 解码器.decodeToString(new Uint8Array(缓冲));
      const 载体: formId载体 = JSON.parse(JSON串) as formId载体;
      ids = 载体.ids;
    }
    // 去重添加
    if (!ids.includes(formId)) {
      ids.push(formId);
    }
    // 写回
    const 写入载体: formId载体 = { ids };
    const 写入串: string = JSON.stringify(写入载体);
    const 写文件: fileIo.File = fileIo.openSync(路径, fileIo.OpenMode.CREATE | fileIo.OpenMode.READ_WRITE | fileIo.OpenMode.TRUNC);
    fileIo.writeSync(写文件.fd, 写入串);
    fileIo.fsyncSync(写文件.fd);
    fileIo.closeSync(写文件);
    hilog.info(0x0000, 日志域, `保存formId成功: ${formId}, 当前共 ${ids.length} 个`);
  } catch (错误) {
    hilog.error(0x0000, 日志域, `保存formId异常: ${错误}`);
  }
}

async function 读formId列表(上下文: common.Context): Promise<string[]> {
  try {
    const 路径: string = `${上下文.getApplicationContext().filesDir}/${formId文件名}`;
    if (!fileIo.accessSync(路径)) {
      return [];
    }
    const 文件: fileIo.File = fileIo.openSync(路径, fileIo.OpenMode.READ_ONLY);
    const stat: fileIo.Stat = fileIo.statSync(文件.fd);
    const 缓冲: ArrayBuffer = new ArrayBuffer(stat.size);
    fileIo.readSync(文件.fd, 缓冲);
    fileIo.closeSync(文件);
    const 解码器: util.TextDecoder = util.TextDecoder.create('utf-8');
    const JSON串: string = 解码器.decodeToString(new Uint8Array(缓冲));
    const 载体: formId载体 = JSON.parse(JSON串) as formId载体;
    return 载体.ids;
  } catch (错误) {
    return [];
  }
}

// 卡片绑定数据载体（与 统计卡片Ability.ets 中一致）
interface 卡片绑定载体 {
  'statsCardData': string;
}

// ========================================================
// @块ID MODEL-WIDGET-DATA-007
// @名称 推送到所有卡片
//
// @作用
// 主进程 保存卡片数据 后调用：读取所有已注册 formId，对每个调
// formProvider.updateForm 主动推送数据。不依赖系统 30 分钟定时刷新。
//
// @输入
// 数据: 桌面卡片数据
//
// @输出
// Promise<void>。推送失败记录日志，不抛异常。
//
// @副作用
// 调 formProvider.updateForm 推送数据到每个卡片
// ========================================================
async function 推送到所有卡片(数据: 桌面卡片数据): Promise<void> {
  const 上下文: common.UIAbilityContext | null = 取上下文();
  if (上下文 === null) {
    return;
  }
  let ids: string[] = await 读formId列表(上下文);
  if (ids.length === 0) {
    // formId 文件缺失（旧版本添加的卡片未注册过 formId）时，
    // 用系统 API 兜底拉取本应用全部卡片并写回文件自愈，后续推送不再走兜底
    ids = await 从系统拉取formId(上下文);
  }
  if (ids.length === 0) {
    hilog.info(0x0000, 日志域, '推送到所有卡片: 无已注册 formId，跳过');
    return;
  }
  const JSON串: string = JSON.stringify(数据);
  // FormBindingData 跨进程传输有 2KB 上限，超限 updateForm 会失败导致卡片冻结在旧数据
  hilog.info(0x0000, 日志域, `推送卡片 JSON 大小: ${JSON串.length} 字节, 目标 ${ids.length} 张卡片`);
  const 绑定数据: 卡片绑定载体 = { 'statsCardData': JSON串 };
  for (const id of ids) {
    try {
      await formProvider.updateForm(id, formBindingData.createFormBindingData(绑定数据));
      hilog.info(0x0000, 日志域, `推送卡片成功: ${id}`);
    } catch (错误) {
      hilog.error(0x0000, 日志域, `推送卡片失败: ${id}, ${错误}`);
      // 卡片可能已被移除，formId 失效；后续可考虑清理失效 formId
    }
  }
}

// ========================================================
// @名称 从系统拉取formId
// @作用 formId 文件缺失/为空时的兜底：getPublishedRunningFormInfos 查询
//       本应用当前所有已发布卡片（FormInfo 无 formId 字段，需用 RunningFormInfo），
//       把 formId 写回文件自愈。
// ========================================================
async function 从系统拉取formId(上下文: common.UIAbilityContext): Promise<string[]> {
  try {
    const 信息列表: formInfo.RunningFormInfo[] = await formProvider.getPublishedRunningFormInfos();
    const ids: string[] = [];
    for (let i: number = 0; i < 信息列表.length; i++) {
      ids.push(信息列表[i].formId);
    }
    hilog.info(0x0000, 日志域, `从系统拉取formId: ${ids.length} 张卡片`);
    if (ids.length > 0) {
      await 覆盖写formId文件(上下文, ids);
    }
    return ids;
  } catch (错误) {
    hilog.error(0x0000, 日志域, `从系统拉取formId失败: ${错误}`);
    return [];
  }
}

async function 覆盖写formId文件(上下文: common.Context, ids: string[]): Promise<void> {
  try {
    const 路径: string = `${上下文.getApplicationContext().filesDir}/${formId文件名}`;
    const 写入载体: formId载体 = { ids };
    const 写文件: fileIo.File = fileIo.openSync(路径, fileIo.OpenMode.CREATE | fileIo.OpenMode.READ_WRITE | fileIo.OpenMode.TRUNC);
    fileIo.writeSync(写文件.fd, JSON.stringify(写入载体));
    fileIo.fsyncSync(写文件.fd);
    fileIo.closeSync(写文件);
  } catch (错误) {
    hilog.error(0x0000, 日志域, `覆盖写formId文件失败: ${错误}`);
  }
}
