// SPDX-License-Identifier: AGPL-3.0-or-later

// 学习页：复习流程页（M7）。
// 链路：确保已打开 → SetCurrentDeck+GetQueuedCards → RenderExistingCard →
//       DescribeNextStates → Web 渲染正面 → 翻面 → AnswerCard → 取下一张。
// 媒体加载：自建域名（学习卡片HTML构建器.媒体基地址）+ onInterceptRequest
// 映射到沙箱 collection.media/，绕过 ArkWeb file 协议跨域拦截（官方推荐做法）。

import { common } from '@kit.AbilityKit';
import { LengthMetrics } from '@kit.ArkUI';
import { webview } from '@kit.ArkWeb';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { 后端会话 } from '../backend/后端会话';
import { 调度器服务 } from '../backend/调度器服务';
import { 卡片渲染服务 } from '../backend/卡片渲染服务';
import { 卡片服务 } from '../backend/卡片服务';
import { 集合服务 } from '../backend/集合服务';
import { 笔记服务 } from '../backend/笔记服务';
import { 笔记类型服务 } from '../backend/笔记类型服务';
import { 比对答案 } from '../model/拼写比对器';
import { 提取拼写填空内容 } from '../model/填空解析器';
import type { RenderedCard, TtsItem } from '../proto/messages/CardRenderingMessages';
import {
  BURY_SUSPEND_MODE_BURY_USER,
  BURY_SUSPEND_MODE_SUSPEND,
  RATING_AGAIN,
  RATING_EASY,
  RATING_GOOD,
  RATING_HARD,
  UNBURY_MODE_ALL
} from '../proto/messages/SchedulerMessages';
import type { SchedulingStatesRaw, StudyCard } from '../proto/messages/SchedulerMessages';
import {
  构建卡片HTML,
  提取拼写标记,
  注入拼写结果,
  媒体基地址,
  原始侧HTML,
  剥除拼写标记
} from '../model/学习卡片HTML构建器';
import { 解码文件名, 取MIME类型, 读取媒体文件 } from '../utils/媒体响应助手';
import { 声音播放器 } from '../utils/声音播放器';
import { TTS播放器 } from '../utils/TTS播放器';
import { 应用尺寸 } from '../utils/应用尺寸';
import { 学习浮动工具栏 } from '../components/学习浮动工具栏';
import { 学习手写白板层 } from '../components/学习手写白板层';
import { StudyActionButton } from '../components/StudyActionButton';
import { 按下态按钮 } from '../components/common/按下态按钮';
import { 学习阶段 } from '../utils/吸附计算器';
import { 加载学习布局模式, 学习布局模式 } from '../model/学习布局存储';
import { 简洁模式AppStorage键, 加载简洁模式 } from '../model/简洁模式存储';
import { TapZones开关AppStorage键, 加载TapZones开关 } from '../model/实验性功能存储';
import { 加载主题模式 } from '../model/主题存储';
import { 解析是否深色, 主题模式 } from '../model/主题设置';
import { 刷新桌面卡片数据 } from '../model/FSRS控制器';
import { 颜色键 } from '../model/颜色主题';
import { CustomTransition } from '../utils/自定义转场';
// KeyCode 枚举：用于 onKeyPreIme 键盘事件判断（API 12+）。物理键盘/蓝牙键盘/2in1 设备统一派发。
import { KeyCode } from '@kit.InputKit';
import type { AI制卡页参数 } from './AI制卡页';
import type { 设置页参数 } from './设置页';
import {
  AgentSettings,
  isAgentProviderConfigured,
  loadAgentSettings
} from '../backend/agent/AgentSettingsStore';
import { loadAgentSecret } from '../backend/agent/AgentSecretStore';
import { AI_AGENT_CHANNELS_APP_STORAGE_KEY } from '../model/ReleaseFeatures';

/** 与上游 buildNextLearnMsg 一致：下一张学习卡 >=1 天后到期时，完成页不再提示学习卡 */
const SECONDS_PER_DAY: number = 86400;

export interface 学习页参数 {
  deckId?: string;
  deckName?: string;
}

// ========================================================
// Tap Zones 的 JS→ArkTS 回调代理：卡片 Web 内 click 监听通过
// window.ankiTapZone.onTap(nx, ny) 回传归一化点击坐标，
// ArkTS 侧按当前阶段分发（question→翻面 / answer→四象限评分）。
// registerJavaScriptProxy 要求 class 实例方法，箭头函数成员保 this 捕获。
// ========================================================
class TapZone代理 {
  处理: (nx: number, ny: number) => void = (nx: number, ny: number): void => {
  };

  onTap(nx: number, ny: number): void {
    this.处理(nx, ny);
  }
}

@Component
export struct 学习页 {
  /** Navigation 入栈参数（替代原路由取参方式） */
  pageDeckId: string = '';
  pageDeckName: string = '';
  /** 页面栈：返回主页时 pop */
  pathStack: NavPathStack = new NavPathStack();
  private readonly 调度器服务实例: 调度器服务 = new 调度器服务();
  private readonly 卡片渲染服务实例: 卡片渲染服务 = new 卡片渲染服务();
  private readonly 卡片服务实例: 卡片服务 = new 卡片服务();
  private readonly 集合服务实例: 集合服务 = new 集合服务();
  private readonly 笔记服务实例: 笔记服务 = new 笔记服务();
  private readonly 笔记类型服务实例: 笔记类型服务 = new 笔记类型服务();
  private readonly 网页控制器: webview.WebviewController = new webview.WebviewController();
  private readonly 声音播放器实例: 声音播放器 = new 声音播放器();
  private readonly TTS播放器实例: TTS播放器 = new TTS播放器();
  private 当前卡片: StudyCard | null = null;
  private 已渲染: RenderedCard | null = null;
  private 正面HTML: string = '';
  private 背面HTML: string = '';
  private 展示时刻毫秒: number = 0;
  private 评分中: boolean = false;
  private 媒体目录: string = '';
  private 兜底文案: string[] = [];
  @State private 牌组ID: number = 0;
  @State private 牌组名: string = '';
  @State private 阶段: 学习阶段 = 'loading';
  @State private 错误详情: string = '';
  @State private 按钮文案: string[] = [];
  @State private 新卡剩余: number = 0;
  @State private 学习中剩余: number = 0;
  @State private 复习剩余: number = 0;
  @State private 可撤销: boolean = false;
  @State private 有音频: boolean = false;
  @State private 完成页数据已加载: boolean = false;
  @State private 完成页学习剩余: number = 0;
  @State private 完成页下张学习分钟: number = 0;
  @State private 完成页复习受限: boolean = false;
  @State private 完成页新卡受限: boolean = false;
  @State private 完成页有埋藏: boolean = false;
  /** 复习页布局模式：bottom=底部固定（默认）；float=浮动可拖动两个工具栏。
   *  aboutToAppear 时从 preferences 加载，与 设置面板 切换联动（通过 AppStorage 同步）。 */
  @State private 学习布局模式值: 学习布局模式 = 'bottom';
  /** 主题模式 + 系统暗黑，用于浮动工具栏底色判断（与 首页.ets 同套机制）。 */
  @StorageLink('systemDarkMode') private 系统暗黑模式: boolean = false;
  /** 简洁模式：实验性功能（Tap Zones）仅在「实验版」模式下生效 */
  @StorageLink(简洁模式AppStorage键) private 简洁模式: boolean = true;
  /** Tap Zones 开关：answer 阶段把屏幕划成 2×2 象限直接评分；question 阶段不拦截 */
  @StorageLink(TapZones开关AppStorage键) private TapZones开关: boolean = false;
  @StorageLink(AI_AGENT_CHANNELS_APP_STORAGE_KEY) private Agent入口已启用: boolean = false;
  /** 手写模式：用户点「更多」菜单「手写」进入后置 true，关闭白板层后置 false（常驻入口，无开关） */
  @State private 手写模式: boolean = false;
  /** Agent 改卡写入成功后 AI制卡页 广播本键（Date.now()），本页据此协调当前卡与队列。
   *  双通道之一：NavPathStack.onPop 在本项目已知偶发不触发（BUG-006 同类），
   *  只挂 onPop 时改卡返回学习页会停在旧卡片上。与 onShown 并存，两者只消费一次。 */
  @StorageLink('cardContentChangedTick') @Watch('卡片内容变更_回调') private 卡片内容变更信号: number = 0;
  /** 已收到变更信号但尚未重渲染；页面隐藏时先累积，回到前台由 onShown 统一消费。 */
  private 待重渲染当前卡: boolean = false;
  /** 本 NavDestination 是否在前台（onShown / onHidden 维护）；隐藏时不向 Web 推数据。 */
  private 页面已显示: boolean = false;
  @State private 主题模式值: 主题模式 = 'system';
  @StorageProp(颜色键.动作主色) private 动作主色: string = '#2F5FD0';
  @StorageProp(颜色键.动作主色按下) private 动作主色按下色: string = '#1E4FB8';
  // 2.1.4.1 对比度：按钮背景专用档（配 #FFFFFF 文字 ≥ 4.5:1）
  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景色: string = '#2F5FD0';
  @StorageProp(颜色键.主色按钮按下) private 主色按钮按下色: string = '#1E4FB8';
  @StorageProp(颜色键.主色容器) private 主色容器色: string = '#E8EEFC';
  @StorageProp(颜色键.页面底色微染) private 页面底色微染值: string = '#F5F7FA';
  // 状态栏高度（沉浸式全屏下，顶部条需让出状态栏区域，避免按钮叠在状态栏上）
  @StorageProp('状态栏高度') private 状态栏高度: number = 0;
  // 手势导航条高度（bottom 布局下答案条贴底，需抬高避让导航条）
  @StorageProp('导航条高度') private 导航条高度: number = 0;
  @State private 显示答案按下: boolean = false;
  // Type-in-the-Answer：拼写字段名 为空串表示当前卡无 {{type:FieldName}} 标记，
  // 不渲染 TextInput、翻面时不注入比对结果。
  // 拼写填空=true 时翻面用 提取拼写填空内容 提取当前 cardOrd 的预期答案。
  @State private 已输入答案: string = '';
  @State private 拼写字段名: string = '';
  @State private 拼写组合: boolean = true;
  @State private 拼写填空: boolean = false;
  @State private 拼写卡片序号: number = 0;
  /** NavDestination 透明度（由 customNavContentTransition 回调控制，实现淡入淡出转场）。 */
  @State private 转场透明度: number = 1;

  async aboutToAppear(): Promise<void> {
    this.牌组ID = this.pageDeckId === '' ? 0 : parseInt(this.pageDeckId);
    this.牌组名 = this.pageDeckName;
    // 注册自定义转场回调：首页 Navigation.customNavContentTransition 通过此 name 查找回调，
    // 在 animateTo 内调用起点/终点回调修改 转场透明度，实现淡入淡出（替代系统默认左右平移）。
    // key 用 'StudyPage'（NavPathStack pushPath 时传的 name，与 from.name / to.name 一致）。
    CustomTransition.getInstance().注册NavParam('StudyPage',
      (isPush: boolean, isExit: boolean): void => {
        // 起点：进入方从 0 开始淡入；退出方从 1 起始（保持显示，淡出由终点回调控制）
        this.转场透明度 = isExit ? 1 : 0;
      },
      (isPush: boolean, isExit: boolean): void => {
        // 终点：进入方淡入到 1；退出方淡出到 0（pop 时退出方被卸载，opacity 无关紧要）
        this.转场透明度 = isExit ? 0 : 1;
      }
    );
    // 布局模式与主题并行加载，避免阻塞 启动会话；任一失败回退默认值。
    try {
      this.主题模式值 = await 加载主题模式();
    } catch (error) {
      this.主题模式值 = 'system';
    }
    try {
      this.学习布局模式值 = await 加载学习布局模式();
    } catch (error) {
      this.学习布局模式值 = 'bottom';
    }
    // 实验性功能开关同样加载持久化值，让 @StorageLink 跨重启保持一致
    try {
      const 简洁模式持久化值: boolean = await 加载简洁模式();
      AppStorage.setOrCreate<boolean>(简洁模式AppStorage键, 简洁模式持久化值);
    } catch (error) {
      // 加载失败保留默认值 true（简洁版）
    }
    try {
      const TapZones持久化值: boolean = await 加载TapZones开关();
      AppStorage.setOrCreate<boolean>(TapZones开关AppStorage键, TapZones持久化值);
    } catch (error) {
      // 加载失败保留默认值 false（关闭）
    }
    this.加载兜底文案();
    this.启动会话();
  }

  /** 暗色模式判断：主题模式值=system 时跟随系统，否则按显式选择。与 首页.ets 同语义。 */
  private 是否深色(): boolean {
    return 解析是否深色(this.主题模式值, this.系统暗黑模式);
  }

  aboutToDisappear(): void {
    // 页面销毁释放原生播放器与 TTS 引擎（fire-and-forget，不等释放完成）
    this.声音播放器实例.释放();
    this.TTS播放器实例.释放();
    // 注销自定义转场回调，避免内存泄漏与野回调
    CustomTransition.getInstance().注销NavParam('StudyPage');
    // 评分已写入后端，pop 离开学习页时异步刷新桌面卡片数据（拉最新 Graphs + 牌组树 → 推送所有桌面卡片）。
    // 不 await，不阻塞页面销毁；失败静默，不影响主流程。
    // 解决：学习期间桌面卡片显示旧数据，必须进统计页才更新的问题。
    // 不在每次评分时刷新：连续答题时避免频繁调后端 Graphs；只在离开学习页时刷新一次。
    刷新桌面卡片数据().catch((错误: Object): void => {
      hilog.error(0x4342, '学习页', `离开学习页刷新桌面卡片数据失败: ${错误}`);
    });
    // 通知首页刷新牌组计数/今日进度：onPop 在部分设备/API 版本偶发不触发（BUG-006 同类问题），
    // 此广播作为双保险；加载主页数据 幂等，与 onPop 同时触发只是多跑一次，无副作用。
    AppStorage.setOrCreate<number>('需要刷新主页', Date.now());
  }

  /** 评分按钮兜底文案（后端 DescribeNextStates 异常时可用），启动时从资源读一次 */
  private 加载兜底文案(): void {
    const context: common.UIAbilityContext | null = this.取能力上下文();
    if (context === null) {
      return;
    }
    this.兜底文案 = [
      context.resourceManager.getStringSync($r('app.string.rating_again').id),
      context.resourceManager.getStringSync($r('app.string.rating_hard').id),
      context.resourceManager.getStringSync($r('app.string.rating_good').id),
      context.resourceManager.getStringSync($r('app.string.rating_easy').id)
    ];
  }

  private 取能力上下文(): common.UIAbilityContext | null {
    const context: common.UIAbilityContext | undefined =
      AppStorage.get<common.UIAbilityContext>('abilityContext');
    return context === undefined ? null : context;
  }

  // ========================================================
  // @块ID UI-PAGE-STUDY-001
  // @名称 启动会话
  //
  // @作用
  // 确保后端已打开本地 collection，进入首张卡片加载流程。
  //
  // @输入
  // 无（从 abilityContext 取 filesDir）
  //
  // @输出
  // 成功 → 进入 加载下一张卡；失败 → 进入 error 态
  //
  // @业务规则
  // context 不可用时直接报错。
  //
  // @副作用
  // 调后端 确保已打开；初始化 媒体目录
  // ========================================================
  private async 启动会话(): Promise<void> {
    const context: common.UIAbilityContext | null = this.取能力上下文();
    if (context === null) {
      this.阶段 = 'error';
      this.错误详情 = this.getUIContext().getHostContext()!.resourceManager.getStringSync($r('app.string.ability_context_unavailable').id);
      return;
    }
    this.媒体目录 = `${context.filesDir}/collection.media`;
    try {
      await 后端会话.获取实例().确保已打开(context.filesDir);
      await this.加载下一张卡();
    } catch (error) {
      this.阶段 = 'error';
      this.错误详情 = error instanceof Error ? error.message : `${error}`;
    }
  }

  // ========================================================
  // @块ID UI-PAGE-STUDY-002
  // @名称 加载下一张卡
  //
  // @作用
  // 取队首卡片并渲染正面；队列为空进入完成态。进入页面与评分后都会走到这里，顺带刷新撤销状态。
  //
  // @输入
  // 无（使用 牌组ID）
  //
  // @输出
  // 更新 阶段 / 当前卡片 / 已渲染 / 正面HTML / 背面HTML / 按钮文案 / 剩余计数 等
  //
  // @业务规则
  // 重置 Type-in-the-Answer 状态：上一张的输入与标记不带到下一张。
  // 检测 {{type:FieldName}} / {{type:cloze:FieldName}} 标记（后端渲染为 [[type:...]]）。
  // 标记通常在背面模板，先查 answerNodes 再查 questionNodes。
  // 正面始终剥除标记；背面有标记时保留，翻面时 注入拼写结果 替换。
  //
  // @副作用
  // 调后端 获取队首卡片 / 渲染既有卡片 / 描述下一档状态；播放音频/TTS
  // ========================================================
  private async 加载下一张卡(): Promise<void> {
    this.阶段 = 'loading';
    this.完成页数据已加载 = false;
    // 重置 Type-in-the-Answer 状态：上一张的输入与标记不带到下一张。
    this.已输入答案 = '';
    this.拼写字段名 = '';
    this.拼写组合 = true;
    this.拼写填空 = false;
    this.拼写卡片序号 = 0;
    try {
      await this.刷新撤销状态();
      const queued = await this.调度器服务实例.获取队首卡片(this.牌组ID);
      this.新卡剩余 = queued.newCount;
      this.学习中剩余 = queued.learningCount;
      this.复习剩余 = queued.reviewCount;
      if (queued.cards.length === 0) {
        this.当前卡片 = null;
        this.有音频 = false;
        await this.声音播放器实例.停止();
        await this.TTS播放器实例.停止();
        this.阶段 = 'done';
        await this.加载完成页信息();
        return;
      }
      this.当前卡片 = queued.cards[0];
      this.已渲染 = await this.卡片渲染服务实例.渲染既有卡片(this.当前卡片.cardId);
      this.按钮文案 = await this.调度器服务实例.描述下一档状态(this.当前卡片.states);
      // 检测 {{type:FieldName}} / {{type:cloze:FieldName}} 标记（后端渲染为 [[type:...]]）。
      // 标记通常在背面模板，先查 answerNodes 再查 questionNodes。
      const marker = 提取拼写标记(this.已渲染.answerNodes)
        ?? 提取拼写标记(this.已渲染.questionNodes);
      if (marker !== null) {
        this.拼写字段名 = marker.fieldName;
        this.拼写组合 = marker.combining;
        this.拼写填空 = marker.cloze;
        this.拼写卡片序号 = this.当前卡片.templateIdx;
      }
      // 正面始终剥除标记（不在 Web 中显示输入框占位）。
      this.正面HTML = 剥除拼写标记(构建卡片HTML(this.已渲染, 'question'));
      // 背面：有 type 标记时保留原始标记，翻面时 注入拼写结果 替换为比对结果；
      //       无标记时 剥除拼写标记 为 no-op。
      this.背面HTML = this.拼写字段名 !== ''
        ? 构建卡片HTML(this.已渲染, 'answer')
        : 剥除拼写标记(构建卡片HTML(this.已渲染, 'answer'));
      const rawQuestionHtml: string = 原始侧HTML(this.已渲染, 'question');
      const questionSounds: string[] = await this.安全提取音频(rawQuestionHtml, true);
      const questionTtsItems: TtsItem[] = await this.安全提取TTS项(rawQuestionHtml, true);
      this.网页控制器.loadData(this.正面HTML, 'text/html', 'UTF-8', 媒体基地址, ' ');
      this.展示时刻毫秒 = Date.now();
      this.阶段 = 'question';
      this.有音频 = questionSounds.length > 0 || questionTtsItems.length > 0;
      await this.声音播放器实例.播放队列(this.转音频路径(questionSounds));
      await this.TTS播放器实例.播放队列(questionTtsItems);
    } catch (error) {
      this.有音频 = false;
      await this.声音播放器实例.停止();
      await this.TTS播放器实例.停止();
      this.阶段 = 'error';
      this.错误详情 = error instanceof Error ? error.message : `${error}`;
    }
  }

  /** 提取一侧音频文件名；失败降级为静音，不阻断学习流程 */
  private async 安全提取音频(rawHtml: string, questionSide: boolean): Promise<string[]> {
    try {
      return await this.卡片渲染服务实例.提取音频文件(rawHtml, questionSide);
    } catch (error) {
      return [];
    }
  }

  /** 提取一侧 TTS 朗读项；失败降级为不朗读，不阻断学习流程 */
  private async 安全提取TTS项(rawHtml: string, questionSide: boolean): Promise<TtsItem[]> {
    try {
      return await this.卡片渲染服务实例.提取TTS项(rawHtml, questionSide);
    } catch (error) {
      return [];
    }
  }

  /**
   * 媒体文件名 → 沙箱 collection.media/ 绝对路径。
   * 文件名经 decodeURIComponent 还原（Anki 卡片中可能写作 [sound:%E4%B8%AD.mp3]，
   * 后端 extract_av_tags 提取的是字面字符串，需解码才能匹配磁盘上的中文文件名）；
   * 与 ArkWeb 图片拦截器（interceptMedia 中已调 decodeURIComponent）行为对齐。
   * 解码失败（如含非编码 %）时回退原字面名，避免抛错中断播放。
   */
  private 转音频路径(files: string[]): string[] {
    return files.map((name: string): string => `${this.媒体目录}/${解码文件名(name)}`);
  }

  /** 刷新撤销可用状态；查询失败不阻断学习流程，仅关闭撤销入口。 */
  private async 刷新撤销状态(): Promise<void> {
    try {
      const status = await this.集合服务实例.获取撤销状态();
      this.可撤销 = status.undo.length > 0;
    } catch (error) {
      this.可撤销 = false;
    }
  }

  // ========================================================
  // @块ID UI-PAGE-STUDY-003
  // @名称 撤销上次
  //
  // @作用
  // 撤销上一次评分；被撤销的卡回到队列顶部，成功后重新取卡。
  //
  // @输入
  // 无
  //
  // @输出
  // 成功 → 调 加载下一张卡；失败 → 进入 error 态
  //
  // @业务规则
  // 复用 评分中 防重入；可撤销=false 时直接返回。
  //
  // @副作用
  // 调后端 撤销
  // ========================================================
  private async 撤销上次(): Promise<void> {
    if (this.评分中 || !this.可撤销) {
      return;
    }
    this.评分中 = true;
    try {
      await this.集合服务实例.撤销();
      await this.加载下一张卡();
    } catch (error) {
      this.阶段 = 'error';
      this.错误详情 = error instanceof Error ? error.message : `${error}`;
    } finally {
      this.评分中 = false;
    }
  }

  // ========================================================
  // @块ID UI-PAGE-STUDY-MORE-MENU
  // @名称 顶部条更多菜单
  //
  // @作用
  // 2026-07-28：原顶部条左侧「返回+撤销」+ 右侧「删除」三按钮布局，
  // 撤销按钮（约 62px）与返回按钮叠加宽度约 132px，覆盖到居中牌组名
  // （maxWidth 40% 居中后左边缘约屏宽 30%）的左侧字符。
  // 改为左侧只留「返回」，右侧「更多」按钮 bindMenu 弹出菜单：
  //   - 撤销（enabled = 可撤销）
  //   - 删除此卡（enabled = 阶段是 question/answer）
  // 牌组名 maxWidth 放大到 50%（左侧只剩返回按钮，避让空间充足）。
  //
  // @输入
  // 无（读取 可撤销 / 阶段 / 评分中）
  //
  // @输出
  // MenuElement[]：bindMenu 数据源
  //
  // @业务规则
  // MenuElement.value 只接受 string，需把 Resource 转 string。
  // enabled 跟随状态：可撤销 / 阶段。组件重新 build 时数组重新求值，状态实时刷新。
  //
  // @副作用
  // 无（纯数据构建）。
  // ========================================================
  private 取文案(资源: Resource): string {
    return this.getUIContext().getHostContext()!.resourceManager.getStringSync(资源.id);
  }

  private 更多菜单(): MenuElement[] {
    const 菜单: MenuElement[] = [
      { value: this.取文案($r('app.string.study_undo')), action: () => { this.撤销上次(); }, enabled: this.可撤销 },
      { value: this.取文案($r('app.string.study_delete_card')), action: () => { this.请求删除当前卡(); }, enabled: this.阶段 === 'question' || this.阶段 === 'answer' }
    ];
    // 「手写」入口：常驻显示（question/answer 阶段），无开关，进入后叠加 Canvas 笔迹层
    if (this.阶段 === 'question' || this.阶段 === 'answer') {
      if (this.Agent入口已启用) {
        菜单.push({
          value: this.取文案($r('app.string.ai_card_edit')),
          action: () => { this.打开AI改卡(); },
          enabled: this.当前卡片 !== null
        });
      }
      菜单.push({
        value: this.取文案($r('app.string.study_handwrite')),
        action: () => { this.手写模式 = true; },
        enabled: true
      });
    }
    return 菜单;
  }

  /** 当前卡只作为本地入口上下文；打开页面不会触发任何 AI 网络请求。
   *  未配置 AI 时与首页同款跳转：直接进入设置并展开 AI 智能体分组；
   *  学习进度不动，配置完成返回后可原样再从菜单进入。 */
  private async 打开AI改卡(): Promise<void> {
    if (this.当前卡片 === null) { return; }
    if (!await this.isAIConfigured()) {
      this.openAISettings();
      return;
    }
    const params: AI制卡页参数 = {
      mode: 'edit',
      deckId: String(this.当前卡片.deckId),
      deckName: this.牌组名,
      deckOptions: [],
      cardIds: [this.当前卡片.cardId],
      noteIds: [this.当前卡片.noteId],
      templateIdx: this.当前卡片.templateIdx
    };
    this.pathStack.pushPath({
      name: 'AiCardPage', param: params,
      // 只置位不直接刷新：真正重渲染统一由 onShown 消费，
      // 避免 onPop 与 AppStorage 广播同时命中时对同一张卡重复发渲染 RPC。
      onPop: (): void => { this.待重渲染当前卡 = true; }
    });
  }

  /** Agent 入口配置预检（与首页同款）；读取失败按未配置处理。 */
  private async isAIConfigured(): Promise<boolean> {
    try {
      const settings: AgentSettings = await loadAgentSettings();
      const secret: string = await loadAgentSecret(settings.selectedProvider);
      return isAgentProviderConfigured(settings, secret);
    } catch (error) {
      return false;
    }
  }

  /** 未配置时从学习页直接进入设置，并展开 AI 智能体分组。 */
  private openAISettings(): void {
    const params: 设置页参数 = { openAiSettings: true };
    this.pathStack.pushPath({ name: 'SettingsPage', param: params });
  }

  /** 卡片内容变更广播回调（@Watch）：改卡写入成功即置位。
   *  页面在前台则立刻重渲染；被 AI 页盖住时只置位，等 onShown 再消费。 */
  private 卡片内容变更_回调(): void {
    if (this.卡片内容变更信号 <= 0) { return; }
    this.待重渲染当前卡 = true;
    if (this.页面已显示) {
      this.消费待重渲染();
    }
  }

  /** 消费一次待重渲染标记。onShown 与 @Watch 共用，保证多通道命中只刷新一次。 */
  private 消费待重渲染(): void {
    if (!this.待重渲染当前卡) { return; }
    this.待重渲染当前卡 = false;
    this.刷新AI改卡后当前卡();
  }

  /** 核对 Agent 写入后的队首；同卡原地重渲染，当前卡失效时进入真实新队首。 */
  private async 刷新AI改卡后当前卡(): Promise<void> {
    if (this.当前卡片 === null || (this.阶段 !== 'question' && this.阶段 !== 'answer')) { return; }
    const currentCardId: number = this.当前卡片.cardId;
    try {
      const queued = await this.调度器服务实例.获取队首卡片(this.牌组ID);
      if (queued.cards.length === 0 || queued.cards[0].cardId !== currentCardId) {
        await this.加载下一张卡();
        return;
      }
      this.新卡剩余 = queued.newCount;
      this.学习中剩余 = queued.learningCount;
      this.复习剩余 = queued.reviewCount;
      this.当前卡片 = queued.cards[0];
      this.已渲染 = await this.卡片渲染服务实例.渲染既有卡片(this.当前卡片.cardId);
      this.正面HTML = 剥除拼写标记(构建卡片HTML(this.已渲染, 'question'));
      this.背面HTML = 构建卡片HTML(this.已渲染, 'answer');
      const html: string = this.阶段 === 'answer' ? this.背面HTML : this.正面HTML;
      this.网页控制器.loadData(html, 'text/html', 'UTF-8', 媒体基地址, ' ');
      hilog.info(0x4342, '学习页', `Agent 改卡后已重渲染当前卡 cardId=${this.当前卡片.cardId}`);
    } catch (error) {
      // 协调查询或重渲染失败时保留当前画面，不把一次返回刷新失败升级为学习页错误态。
      hilog.error(0x4342, '学习页',
        `Agent 改卡后协调学习队列失败: ${error instanceof Error ? error.message : `${error}`}`);
    }
  }

  // ========================================================
  // @块ID UI-PAGE-STUDY-004
  // @名称 埋藏或暂停当前卡
  //
  // @作用
  // 埋藏（BURY_USER，明天再见）或暂停（SUSPEND，手动恢复前不再出现）当前卡片。
  // 成功后该卡即从今日队列移除，直接取下一张。
  //
  // @输入
  // mode: BURY_SUSPEND_MODE_BURY_USER 或 BURY_SUSPEND_MODE_SUSPEND
  //
  // @输出
  // 成功 → 调 加载下一张卡；失败 → 进入 error 态
  //
  // @业务规则
  // 与上游 reviewer 的 bury_current_card/suspend_current_card 语义一致。
  // 复用 评分中 防重入；阶段 必须是 question 或 answer。
  //
  // @副作用
  // 调后端 埋藏或暂停卡片
  // ========================================================
  private async 埋藏或暂停当前卡(mode: number): Promise<void> {
    if (this.评分中 || this.当前卡片 === null) {
      return;
    }
    if (this.阶段 !== 'question' && this.阶段 !== 'answer') {
      return;
    }
    this.评分中 = true;
    try {
      await this.调度器服务实例.埋藏或暂停卡片(this.当前卡片.cardId, mode);
      await this.加载下一张卡();
    } catch (error) {
      this.阶段 = 'error';
      this.错误详情 = error instanceof Error ? error.message : `${error}`;
    } finally {
      this.评分中 = false;
    }
  }

  // ========================================================
  // @块ID UI-PAGE-STUDY-005
  // @名称 请求删除当前卡
  //
  // @作用
  // 请求删除当前卡片：先弹 AlertDialog 二次确认，确认后真正调用 删除卡片。
  // 与 埋藏或暂停当前卡 同款防重入与 阶段 守卫；删除后该卡从今日队列移除，直接取下一张。
  //
  // @输入
  // 无（使用 当前卡片）
  //
  // @输出
  // 弹出确认框；确认后调 确认删除当前卡
  //
  // @业务规则
  // 删除语义：调用 backend RemoveCards([cardId]) 仅删当前一张卡。
  // - 若该笔记只剩这一张卡，笔记也会一并删除（笔记变空自动清理）
  // - 与 AnkiDroid 的 Delete Card 行为一致；与 Anki 桌面端 Delete Note（删整条笔记 + 所有卡）不同
  // - 可通过顶部撤销按钮恢复（undo 栈会记录 RemoveCards 操作）
  // - 入口在 顶部条 右侧（与 back/undo 同区），bottom 与 float 两种布局模式都能触达；
  //   Anki 桌面端放在 More 菜单，jidecards 直接置顶更易触达。
  //
  // @副作用
  // 无（仅弹框）
  // ========================================================
  private 请求删除当前卡(): void {
    if (this.评分中 || this.当前卡片 === null) {
      return;
    }
    if (this.阶段 !== 'question' && this.阶段 !== 'answer') {
      return;
    }
    this.getUIContext().showAlertDialog({
      title: $r('app.string.study_delete_card_confirm_title'),
      message: $r('app.string.study_delete_card_confirm_message'),
      autoCancel: false,
      alignment: DialogAlignment.Center,
      primaryButton: {
        value: $r('app.string.cancel'),
        action: (): void => {}
      },
      secondaryButton: {
        value: $r('app.string.study_delete_card'),
        fontColor: $r('app.color.error_text'),
        action: (): void => {
          this.确认删除当前卡();
        }
      }
    });
  }

  private async 确认删除当前卡(): Promise<void> {
    if (this.当前卡片 === null) {
      return;
    }
    this.评分中 = true;
    try {
      await this.卡片服务实例.删除卡片([this.当前卡片.cardId]);
      await this.加载下一张卡();
    } catch (error) {
      this.阶段 = 'error';
      const reason: string = error instanceof Error ? error.message : `${error}`;
      this.错误详情 = this.getUIContext().getHostContext()!.resourceManager
        .getStringSync($r('app.string.study_delete_card_failed').id)
        .replace('%s', reason);
    } finally {
      this.评分中 = false;
    }
  }

  /** 完成页真实数据；拉取失败降级为静态完成文案（完成页数据已加载=false），不进入错误态。 */
  private async 加载完成页信息(): Promise<void> {
    try {
      const info = await this.调度器服务实例.获取完成页信息();
      // 上游 buildNextLearnMsg：下一张学习卡 >=1 天后到期时不再提示
      this.完成页学习剩余 = info.secsUntilNextLearn < SECONDS_PER_DAY ? info.learnRemaining : 0;
      this.完成页下张学习分钟 = Math.max(1, Math.ceil(info.secsUntilNextLearn / 60));
      this.完成页复习受限 = info.reviewRemaining;
      this.完成页新卡受限 = info.newRemaining;
      this.完成页有埋藏 = info.haveSchedBuried || info.haveUserBuried;
      this.完成页数据已加载 = true;
    } catch (error) {
      this.完成页数据已加载 = false;
    }
  }

  /**
   * 恢复本牌组被埋藏的卡片。CongratsInfo 只有布尔标记、不给卡片 id，
   * 故按牌组维度恢复（同桌面 overview 的 unbury，Mode.ALL），成功后重新取卡。
   */
  private async 恢复埋藏(): Promise<void> {
    if (this.评分中) {
      return;
    }
    this.评分中 = true;
    try {
      await this.调度器服务实例.按牌组恢复埋藏(this.牌组ID, UNBURY_MODE_ALL);
      await this.加载下一张卡();
    } catch (error) {
      this.阶段 = 'error';
      this.错误详情 = error instanceof Error ? error.message : `${error}`;
    } finally {
      this.评分中 = false;
    }
  }

  // ========================================================
  // @块ID UI-PAGE-STUDY-006
  // @名称 显示答案
  //
  // @作用
  // 翻面：背面 HTML 注入 拼写比对结果（如有 type 标记）后加载到 Web，并播放背面音频/TTS。
  //
  // @输入
  // 无（使用 已渲染 / 背面HTML / 拼写字段名）
  //
  // @输出
  // 阶段 切换为 'answer'；背面 HTML 渲染到 Web
  //
  // @业务规则
  // Type-in-the-Answer：翻面前拉取笔记字段值，生成比对 HTML，替换 背面HTML 中的 [[type:...]] 标记。
  // getNote/getNotetype 失败时降级为剥除标记（不阻断翻面，用户仍可评分）。
  // 重赋值 this.背面HTML（而非局部变量）以保持 loadData 契约；加载下一张卡 会重建该字段。
  //
  // @副作用
  // 调 Web 控制器 loadData；播放音频/TTS
  // ========================================================
  private async 显示答案(): Promise<void> {
    if (this.阶段 !== 'question' || this.已渲染 === null) {
      return;
    }
    try {
      // Type-in-the-Answer：翻面前拉取笔记字段值，生成比对 HTML，替换 背面HTML 中的 [[type:...]] 标记。
      // getNote/getNotetype 失败时降级为剥除标记（不阻断翻面，用户仍可评分）。
      // 重赋值 this.背面HTML（而非局部变量）以保持 loadData 契约；加载下一张卡 会重建该字段。
      if (this.拼写字段名 !== '') {
        this.背面HTML = await this.构建拼写答案HTML(this.背面HTML);
      }
      this.网页控制器.loadData(this.背面HTML, 'text/html', 'UTF-8', 媒体基地址, ' ');
      this.阶段 = 'answer';
      const rawAnswerHtml: string = 原始侧HTML(this.已渲染, 'answer');
      const answerSounds: string[] = await this.安全提取音频(rawAnswerHtml, false);
      const answerTtsItems: TtsItem[] = await this.安全提取TTS项(rawAnswerHtml, false);
      this.有音频 = answerSounds.length > 0 || answerTtsItems.length > 0;
      await this.声音播放器实例.播放队列(this.转音频路径(answerSounds));
      await this.TTS播放器实例.播放队列(answerTtsItems);
    } catch (error) {
      this.阶段 = 'error';
      this.错误详情 = error instanceof Error ? error.message : `${error}`;
    }
  }

  // ========================================================
  // @块ID UI-PAGE-STUDY-007
  // @名称 构建拼写答案HTML
  //
  // @作用
  // 拉取当前卡笔记的对应字段值，调 拼写比对器 生成字符级 diff HTML，
  // 用 注入拼写结果 替换 背面HTML 中的 [[type:FieldName]] 标记。
  //
  // @输入
  // answerHtml: 待注入的背面 HTML
  //
  // @输出
  // 注入比对结果后的 HTML；任一步失败时降级为 剥除拼写标记
  //
  // @业务规则
  // Cloze 卡（拼写填空=true）：用 提取拼写填空内容 从字段值中提取当前
  //   cardOrd 的预期答案；无匹配 cloze 时降级为 剥除拼写标记 不渲染输入框。
  // 若 answerHtml 不含 [[type:...]] 占位符（标记仅在 questionNodes），在末尾追加
  //   <hr> + 比对结果，与 Anki 桌面端行为一致。
  // 已输入答案 为空时 比对答案 返回纯预期答案（无 diff），与 Anki 行为一致。
  // 任一后端调用失败时降级为 剥除拼写标记（剥除标记，不显示比对结果），不阻断翻面。
  //
  // @副作用
  // 调后端 获取笔记 / 获取笔记类型
  // ========================================================
  private async 构建拼写答案HTML(answerHtml: string): Promise<string> {
    if (this.当前卡片 === null) {
      return 剥除拼写标记(answerHtml);
    }
    try {
      const note = await this.笔记服务实例.获取笔记(this.当前卡片.noteId);
      const notetype = await this.笔记类型服务实例.获取笔记类型(note.notetypeId);
      const fieldIdx = notetype.fieldNames.indexOf(this.拼写字段名);
      const fieldValue = fieldIdx >= 0 && fieldIdx < note.fields.length ? note.fields[fieldIdx] : '';
      // Cloze 卡：从字段值中提取当前 cardOrd 的预期答案；无匹配则降级为剥除标记。
      let expected: string;
      if (this.拼写填空) {
        expected = 提取拼写填空内容(fieldValue, this.拼写卡片序号 + 1);
        if (expected === '') {
          return 剥除拼写标记(answerHtml);
        }
      } else {
        expected = fieldValue;
      }
      const resultHtml = 比对答案(expected, this.已输入答案, this.拼写组合);
      // 注入比对结果；若 answerHtml 不含 [[type:...]] 占位符（标记仅在 questionNodes），
      // 在末尾追加 <hr> + 比对结果，与 Anki 桌面端行为一致。
      const injected = 注入拼写结果(answerHtml, resultHtml);
      if (injected === answerHtml) {
        return `${answerHtml}<hr><code id=typeans>${resultHtml}</code>`;
      }
      return injected;
    } catch (error) {
      return 剥除拼写标记(answerHtml);
    }
  }

  // ========================================================
  // @名称 处理TapZone点击
  //
  // @作用
  // Tap Zones 回调入口：卡片 Web 内 click 监听（已排除链接/按钮等交互标签）
  // 回传归一化坐标。question 阶段任意点击=显示答案；
  // answer 阶段按 2×2 象限评分：左上=重来 右上=困难 左下=良好 右下=简单。
  //
  // @输入
  // nx / ny: 归一化点击坐标 [0,1]
  //
  // @业务规则
  // 仅 TapZones 开关开启且非简洁模式时生效；loading/error/done 阶段忽略。
  // ========================================================
  private 处理TapZone点击(nx: number, ny: number): void {
    if (!this.TapZones开关 || this.简洁模式) {
      return;
    }
    if (this.阶段 === 'question') {
      this.显示答案();
      return;
    }
    if (this.阶段 === 'answer') {
      let rating: number;
      if (ny < 0.5) {
        rating = nx < 0.5 ? RATING_AGAIN : RATING_HARD;
      } else {
        rating = nx < 0.5 ? RATING_GOOD : RATING_EASY;
      }
      this.评分(rating);
    }
  }

  // ========================================================
  // @块ID UI-PAGE-STUDY-008
  // @名称 评分
  //
  // @作用
  // 提交评分并取下一张。
  //
  // @输入
  // rating: RATING_AGAIN / RATING_HARD / RATING_GOOD / RATING_EASY
  //
  // @输出
  // 成功 → 调 加载下一张卡；失败 → 进入 error 态
  //
  // @业务规则
  // 防重入避免双击连评。仅 answer 阶段可评分。
  //
  // @副作用
  // 调后端 提交评分
  // ========================================================
  private async 评分(rating: number): Promise<void> {
    if (this.评分中 || this.阶段 !== 'answer' || this.当前卡片 === null) {
      return;
    }
    this.评分中 = true;
    try {
      const states: SchedulingStatesRaw = this.当前卡片.states;
      const newStates: Uint8Array[] = [states.again, states.hard, states.good, states.easy];
      await this.调度器服务实例.提交评分({
        cardId: this.当前卡片.cardId,
        currentState: states.current,
        newState: newStates[rating],
        rating: rating,
        answeredAtMillis: Date.now(),
        millisecondsTaken: Math.max(0, Date.now() - this.展示时刻毫秒)
      });
      await this.加载下一张卡();
    } catch (error) {
      this.阶段 = 'error';
      this.错误详情 = error instanceof Error ? error.message : `${error}`;
    } finally {
      this.评分中 = false;
    }
  }

  // ========================================================
  // @块ID UI-PAGE-STUDY-009
  // @名称 拦截媒体
  //
  // @作用
  // 拦截自建域名请求 → 沙箱媒体文件；未命中返回 null 放行（裂图/静音可接受）。
  //
  // @输入
  // event: OnInterceptRequestEvent
  //
  // @输出
  // WebResourceResponse 或 null（放行）
  //
  // @业务规则
  // 文件名为空时回一张空白页，避免 404 错误页闪现。
  // 文件不存在时返回 404。
  //
  // @副作用
  // 读沙箱文件
  // ========================================================
  private 拦截媒体(event: OnInterceptRequestEvent): WebResourceResponse | null {
    const url: string = event.request.getRequestUrl();
    if (!url.startsWith(媒体基地址)) {
      return null;
    }
    const fileName: string = decodeURIComponent(url.substring(媒体基地址.length));
    if (fileName.length === 0) {
      // Web 组件初始 src 占位：回一张空白页，避免 404 错误页闪现
      const blank: WebResourceResponse = new WebResourceResponse();
      blank.setResponseData('<!DOCTYPE html><html><body></body></html>');
      blank.setResponseMimeType('text/html');
      blank.setResponseEncoding('UTF-8');
      blank.setResponseCode(200);
      blank.setReasonMessage('OK');
      return blank;
    }
    const data: ArrayBuffer | null = 读取媒体文件(this.媒体目录, fileName);
    if (data === null) {
      const notFound: WebResourceResponse = new WebResourceResponse();
      notFound.setResponseCode(404);
      notFound.setReasonMessage('Not Found');
      notFound.setResponseData('');
      notFound.setResponseMimeType('text/plain');
      notFound.setResponseEncoding('UTF-8');
      return notFound;
    }
    const response: WebResourceResponse = new WebResourceResponse();
    response.setResponseData(data);
    response.setResponseMimeType(取MIME类型(fileName));
    response.setResponseCode(200);
    response.setReasonMessage('OK');
    return response;
  }

  private 按钮文案位(index: number): string {
    if (index < this.按钮文案.length && this.按钮文案[index].length > 0) {
      return this.按钮文案[index];
    }
    if (index < this.兜底文案.length) {
      return this.兜底文案[index];
    }
    return '';
  }

  private 返回(): void {
    this.pathStack.pop();
  }

  /** Ctrl 键按下状态（用于检测 Ctrl+Z 撤销）。
   *  HarmonyOS KeyEvent 没有 ctrlKey 字段，需在 onKeyPreIme 里自行维护。 */
  private Ctrl按下: boolean = false;

  // ========================================================
  // @块ID UI-PAGE-STUDY-010
  // @名称 处理按键
  //
  // @作用
  // 物理键盘快捷键处理（Anki 桌面端标准键位）。
  // 挂在根 Stack 的 onKeyPreIme 上（API 12+），输入法消费前拦截，返回 true 表示已消费。
  //
  // @输入
  // event: KeyEvent
  //
  // @输出
  // true 表示已消费；false 让系统默认行为生效
  //
  // @业务规则
  // 键位映射（与 Anki 桌面端一致）：
  // - Space / Enter：question 阶段=显示答案；answer 阶段=Good 评分
  // - 1 / 2 / 3 / 4：Again / Hard / Good / Easy 评分（仅 answer 阶段）
  // - `*`（Shift+8，KEYCODE_STAR）：埋藏当前卡（BURY_USER）
  // - `@`（Shift+2，KEYCODE_AT）：暂停当前卡（SUSPEND）
  // - Esc：返回上一页（任意阶段）
  // - Delete（KEYCODE_FORWARD_DEL）：删除当前卡（弹确认框）
  // - Ctrl+Z：撤销上一次评分
  // 只在 KeyType.Down 执行业务（Up 不执行，避免一次按键触发两次）。
  // Ctrl/Shift 单独按下时只更新状态、不执行业务，并消费事件避免系统处理。
  // loading/done/error 阶段只允许 Esc，其他键不处理（让系统默认行为生效）。
  // 各业务方法内部已有 阶段 守卫和 评分中 防重入，重复调用是安全的。
  //
  // @副作用
  // 无（触发其他块副作用）
  // ========================================================
  private 处理按键(event: KeyEvent): boolean {
    // KeyType.Up：仅更新 Ctrl 松开状态，不执行业务
    if (event.type !== KeyType.Down) {
      if (event.keyCode === KeyCode.KEYCODE_CTRL_LEFT || event.keyCode === KeyCode.KEYCODE_CTRL_RIGHT) {
        this.Ctrl按下 = false;
      }
      return false;
    }
    // Ctrl 按下：更新状态并消费，避免系统处理
    if (event.keyCode === KeyCode.KEYCODE_CTRL_LEFT || event.keyCode === KeyCode.KEYCODE_CTRL_RIGHT) {
      this.Ctrl按下 = true;
      return true;
    }
    // Ctrl+Z 撤销（任意阶段都生效，与 Anki 桌面端一致）
    if (this.Ctrl按下 && event.keyCode === KeyCode.KEYCODE_Z) {
      this.撤销上次();
      return true;
    }
    // Esc 返回（任意阶段都生效）
    if (event.keyCode === KeyCode.KEYCODE_ESCAPE) {
      this.返回();
      return true;
    }
    // 仅 question/answer 阶段处理以下键
    if (this.阶段 !== 'question' && this.阶段 !== 'answer') {
      return false;
    }
    // Delete 删除当前卡（弹确认框，与按钮点击同流程）
    if (event.keyCode === KeyCode.KEYCODE_FORWARD_DEL) {
      this.请求删除当前卡();
      return true;
    }
    // `*` 或 `B` 埋藏当前卡（B 为字母替代键，更易按；两者并存以兼容 Anki 桌面端键位）
    if (event.keyCode === KeyCode.KEYCODE_STAR || event.keyCode === KeyCode.KEYCODE_B) {
      this.埋藏或暂停当前卡(BURY_SUSPEND_MODE_BURY_USER);
      return true;
    }
    // `@` 或 `S` 暂停当前卡（S 为字母替代键）
    if (event.keyCode === KeyCode.KEYCODE_AT || event.keyCode === KeyCode.KEYCODE_S) {
      this.埋藏或暂停当前卡(BURY_SUSPEND_MODE_SUSPEND);
      return true;
    }
    // `R` 重放音频（question/answer 阶段均生效，与 Anki 桌面端一致；无音频时 重播 静默无副作用）
    if (event.keyCode === KeyCode.KEYCODE_R) {
      this.声音播放器实例.重播();
      this.TTS播放器实例.重播();
      return true;
    }
    // question 阶段：Space/Enter 显示答案
    if (this.阶段 === 'question') {
      if (event.keyCode === KeyCode.KEYCODE_SPACE || event.keyCode === KeyCode.KEYCODE_ENTER) {
        this.显示答案();
        return true;
      }
      return false;
    }
    // answer 阶段：1/2/3/4 评分；Space/Enter = Good（与 Anki 桌面端一致）
    if (event.keyCode === KeyCode.KEYCODE_1) {
      this.评分(RATING_AGAIN);
      return true;
    }
    if (event.keyCode === KeyCode.KEYCODE_2) {
      this.评分(RATING_HARD);
      return true;
    }
    if (event.keyCode === KeyCode.KEYCODE_3
      || event.keyCode === KeyCode.KEYCODE_SPACE
      || event.keyCode === KeyCode.KEYCODE_ENTER) {
      this.评分(RATING_GOOD);
      return true;
    }
    if (event.keyCode === KeyCode.KEYCODE_4) {
      this.评分(RATING_EASY);
      return true;
    }
    return false;
  }

  @Builder
  private 顶部条() {
    Stack() {
      // 底层：牌组名称 + 剩余计数（仅显示，Stack 默认居中）。
      // hitTestBehavior None 让整列不参与命中测试，触摸事件穿透到顶层 Row 的按钮。
      Column() {
        Text(this.牌组名)
          .fontSize(应用尺寸.字号_标题)
          .fontWeight(FontWeight.Medium)
          .fontColor($r('app.color.text_primary'))
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
          // 2026-07-28：左侧只剩「返回」按钮（约 62px），右侧只剩「更多」按钮（约 62px），
          // 牌组名 maxWidth 从 40%/60% 放大到 50%，居中后左边缘约屏宽 25%，
          // 避开左侧返回按钮右边缘（约屏宽 22%），不再被遮挡。
          .constraintSize({ maxWidth: '50%' })
          .textAlign(TextAlign.Center)

        Text($r('app.string.study_remaining_detail', this.新卡剩余, this.学习中剩余, this.复习剩余))
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_secondary'))
          .margin({ top: 2 })
      }
      .justifyContent(FlexAlign.Center)
      .alignItems(HorizontalAlign.Center)
      .hitTestBehavior(HitTestMode.None)

      // 顶层：所有按钮放同一 Row，用 Blank() 撑开左右——
      // 不再分左右两个 width('100%') Row 叠层（之前 hitTestBehavior Transparent 仍被遮挡），
      // 单层 Row 内按钮天然不重叠，Blank() 占位区无 onClick 不消费触摸。
      // 2026-07-28：撤销与删除合并到右侧「更多」按钮（bindMenu），左侧只留返回，
      // 避免左侧两按钮叠加宽度覆盖居中牌组名。
      Row() {
        // 左侧：返回
        按下态按钮({
          文案: $r('app.string.study_back'),
          选中态背景: this.主色容器色,
          字色: $r('app.color.text_primary'),
          点击回调: (): void => { this.返回(); }
        })

        // 中间空白撑开：让左侧按钮靠左、右侧按钮靠右
        Blank()

        // 右侧：更多（bindMenu 弹出 撤销 / 删除此卡）
        // 菜单项 enabled 跟随 可撤销 / 阶段 状态，组件重新 build 时数组重新求值。
        Button($r('app.string.study_more'))
          .height(应用尺寸.按钮高度)
          .padding({ left: 应用尺寸.卡片内边距, right: 应用尺寸.卡片内边距 })
          .constraintSize({ minWidth: 0 })
          .fontSize(应用尺寸.字号_按钮)
          .fontColor($r('app.color.text_primary'))
          .backgroundColor($r('app.color.surface_card'))
          .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
          .borderRadius(应用尺寸.圆角_胶囊)
          .bindMenu(this.更多菜单())
      }
      .width('100%')
      .height('100%')
      .alignItems(VerticalAlign.Center)
    }
    .width('100%')
    .height(应用尺寸.工具栏高度 + this.状态栏高度)
    .padding({
      left: 应用尺寸.页面内边距_水平,
      right: 应用尺寸.页面内边距_水平,
      top: this.状态栏高度 + 应用尺寸.间距_8,
      bottom: 应用尺寸.间距_8
    })
    .backgroundColor(this.页面底色微染值)
  }

  @Builder
  private 卡片区() {
    Column() {
      Stack() {
        // BUG-008 2026-07-29 修复首卡不显示：
        // src 不能设为 媒体基地址，否则 Web 组件 attached 后会自动加载
        // https://jidecards-media.local/（根路径无对应资源，返回空白），
        // 与 aboutToAppear 中的 loadData(data: URL) 竞争，导致首卡渲染被初始空加载覆盖。
        // 后续 loadData（显示答案/下一张卡）没有 src 竞争所以正常显示，正好解释
        // "首卡不显示，点击显示答案或埋藏取消埋藏后能恢复"的现象。
        // 改为空字符串避免自动加载；loadData 的 baseUrl 仍是 媒体基地址，
        // 相对路径资源解析与 onInterceptRequest 媒体拦截不受影响。
        Web({ src: '', controller: this.网页控制器 })
        .javaScriptAccess(true)
        .fileAccess(true)
        .domStorageAccess(true)
        // focusable(false)：Web 不抢键盘焦点，让根 Stack 的 onKeyPreIme 稳定接管所有物理键盘事件。
        // 卡片 HTML 的触摸/点击交互不受影响（ArkWeb 内部走 onTouch，不依赖组件焦点）。
        .focusable(false)
        // Tap Zones：controller attach 后注册 JS 回调代理（页面侧 window.ankiTapZone.onTap(nx, ny)）
        .onControllerAttached(() => {
          const 代理: TapZone代理 = new TapZone代理();
          代理.处理 = (nx: number, ny: number): void => {
            this.处理TapZone点击(nx, ny);
          };
          this.网页控制器.registerJavaScriptProxy(代理, 'ankiTapZone', ['onTap']);
        })
        .onInterceptRequest((event: OnInterceptRequestEvent): WebResourceResponse | null => {
          return this.拦截媒体(event);
        })
        // onPageEnd 兜底（BUG-001）：ArkWeb 对 qfmt/afmt 模板内联 <script> 的执行时序存在抖动，
        // 极少数情况下 anki.imageOcclusion.setup() 未被调用导致遮罩未绘制。
        // 页面加载完成后显式再调一次，setup() 内部幂等（无 #image-occlusion-canvas 直接返回），
        // 对 Basic/Cloze 卡片零影响。
        .onPageEnd((event: OnPageEndEvent) => {
          this.网页控制器.runJavaScript('anki.imageOcclusion.setup()');
          // Tap Zones：注入 click 监听（幂等）。判定在 Web 内部完成——
          // 点击目标上溯命中 A/BUTTON/INPUT/TEXTAREA/SELECT/CANVAS/AUDIO/VIDEO/IFRAME
          // 任一交互标签则忽略（链接照常跳转、挖空遮罩照常点），否则回传归一化坐标。
          this.网页控制器.runJavaScript(
            '(function(){ if(window.__tapZonesInstalled){return;} window.__tapZonesInstalled=true;'
            + 'document.addEventListener("click",function(e){'
            + 'var el=e.target; while(el&&el!==document.body){'
            + 'var t=el.tagName;'
            + 'if(t==="A"||t==="BUTTON"||t==="INPUT"||t==="TEXTAREA"||t==="SELECT"||t==="CANVAS"||t==="AUDIO"||t==="VIDEO"||t==="IFRAME"){return;}'
            + 'el=el.parentElement;}'
            + 'if(window.ankiTapZone){window.ankiTapZone.onTap(e.clientX/window.innerWidth, e.clientY/window.innerHeight);}'
            + '},true); })();'
          );
          // 翻面后自动滚动到答案区（<hr id=answer> 或底部），避免用户手动下滑（2026-07-28 加）。
          // setTimeout 100ms 等图片加载完，避免 scrollIntoView 位置算错。
          if (this.阶段 === 'answer') {
            this.网页控制器.runJavaScript(
              'setTimeout(function(){ var a=document.getElementById("answer"); if(a){ a.scrollIntoView({block:"start"}); } else { window.scrollTo(0, document.body.scrollHeight); } }, 100);'
            );
          }
        })
        .width('100%')
        .height('100%')

      // Tap Zones（实验性功能，仅「实验版」模式下且开关开启时生效）：
      // 点击判定在卡片 Web 内部完成（onPageEnd 注入的 click 监听 + javaScriptProxy 回调），
      // 不再用 ArkUI 覆盖层——覆盖层无法区分"点卡片内容"与"点卡片内链接/交互元素"，
      // 且会与 Web 的触摸/滚动互相干扰。Web 内判定天然排除 A/INPUT/CANVAS 等交互标签，
      // 顶部条（返回/更多）与答案条/浮动工具栏（埋藏/暂停/评分按钮）在 ArkUI 层，不受影响。

      if (this.有音频) {
        Button($r('app.string.study_replay_sound'))
          .height(应用尺寸.按钮高度)
          .padding({ left: 应用尺寸.卡片内边距, right: 应用尺寸.卡片内边距 })
          .margin(应用尺寸.间距_12)
          .fontSize(应用尺寸.字号_按钮)
          .fontColor(this.动作主色)
          .backgroundColor($r('app.color.surface_card'))
          .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
          .borderRadius(应用尺寸.圆角_胶囊)
          .onClick(() => {
            this.声音播放器实例.重播();
            this.TTS播放器实例.重播();
          })
      }

      if (this.阶段 === 'loading') {
        Column({ space: 应用尺寸.间距_8 }) {
          LoadingProgress()
            .width(应用尺寸.加载指示器尺寸)
            .height(应用尺寸.加载指示器尺寸)
            .color(this.动作主色)
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
        .backgroundColor(this.页面底色微染值)
      }

      if (this.阶段 === 'error') {
        Column({ space: 应用尺寸.间距_8 }) {
          Text($r('app.string.study_load_error'))
            .fontSize(应用尺寸.字号_标题)
            .fontWeight(FontWeight.Medium)
            .fontColor($r('app.color.text_primary'))
          Text(this.错误详情)
            .fontSize(应用尺寸.字号_正文_中)
            .fontColor($r('app.color.text_secondary'))
            .textAlign(TextAlign.Center)
          Button($r('app.string.study_back'))
            .height(应用尺寸.按钮高度)
            .fontSize(应用尺寸.字号_按钮)
            .fontColor(this.动作主色)
            .backgroundColor($r('app.color.surface_card'))
            .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
            .borderRadius(应用尺寸.圆角_胶囊)
            .onClick(() => {
              this.返回();
            })
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
        .padding(应用尺寸.卡片内边距)
        .backgroundColor(this.页面底色微染值)
      }

      if (this.阶段 === 'done') {
        Column({ space: 应用尺寸.间距_8 }) {
          Text(this.完成页数据已加载 ? $r('app.string.study_congrats_title') : $r('app.string.study_finish_title'))
            .fontSize(应用尺寸.字号_面板标题)
            .fontWeight(FontWeight.Bold)
            .fontColor($r('app.color.text_primary'))
          if (this.完成页数据已加载) {
            if (this.完成页学习剩余 > 0) {
              Text($r('app.string.study_congrats_learn_remaining', this.完成页学习剩余, this.完成页下张学习分钟))
                .fontSize(应用尺寸.字号_正文_中)
                .fontColor($r('app.color.text_secondary'))
                .textAlign(TextAlign.Center)
            }
            if (this.完成页复习受限) {
              Text($r('app.string.study_congrats_review_limit'))
                .fontSize(应用尺寸.字号_正文_中)
                .fontColor($r('app.color.text_secondary'))
                .textAlign(TextAlign.Center)
            }
            if (this.完成页新卡受限) {
              Text($r('app.string.study_congrats_new_limit'))
                .fontSize(应用尺寸.字号_正文_中)
                .fontColor($r('app.color.text_secondary'))
                .textAlign(TextAlign.Center)
            }
            if (this.完成页有埋藏) {
              Button($r('app.string.study_unbury'))
                .height(应用尺寸.按钮高度)
                .fontSize(应用尺寸.字号_按钮)
                .fontColor(this.动作主色)
                .backgroundColor($r('app.color.surface_card'))
                .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
                .borderRadius(应用尺寸.圆角_胶囊)
                .margin({ top: 应用尺寸.间距_8 })
                .onClick(() => {
                  this.恢复埋藏();
                })
            }
          } else {
            Text($r('app.string.study_finish_hint'))
              .fontSize(应用尺寸.字号_正文_中)
              .fontColor($r('app.color.text_secondary'))
              .textAlign(TextAlign.Center)
          }
          Button($r('app.string.study_back'))
            .height(应用尺寸.按钮高度)
            .fontSize(应用尺寸.字号_按钮)
            .fontColor(this.动作主色)
            .backgroundColor($r('app.color.surface_card'))
            .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
            .borderRadius(应用尺寸.圆角_胶囊)
            .margin({ top: 应用尺寸.间距_12 })
            .onClick(() => {
              this.返回();
            })
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
        .padding(应用尺寸.卡片内边距)
        .backgroundColor(this.页面底色微染值)
      }
      }
      .width('100%')
      .layoutWeight(1)
      .alignContent(Alignment.BottomEnd)

      // Type-in-the-Answer：正面阶段在 Web 下方渲染输入框，翻面后比对用户输入与笔记字段值。
      // Enter 提交翻面（对齐 Anki 桌面端输入框回车显示答案）。
      // 左右内边距与 答案条 的埋藏/暂停行同款（输入框总宽 = 埋藏+暂停两键之和）；
      // float 模式下 答案条 不渲染、输入框是卡片区最后元素贴屏底，
      // 底部抬高避让手势导航条（与 答案条 bottom padding 同公式）。
      if (this.阶段 === 'question' && this.拼写字段名 !== '') {
        Column() {
          WithTheme({
            theme: {
              colors: {
                compBackgroundFocus: Color.Transparent,
                compFocusedPrimary: Color.Transparent,
                compFocusedSecondary: Color.Transparent,
                compFocusedTertiary: Color.Transparent,
                interactiveFocus: Color.Transparent
              }
            }
          }) {
            TextInput({ placeholder: $r('app.string.study_type_answer_placeholder'), text: this.已输入答案 })
              .width('100%')
              .height(应用尺寸.行动按钮高度)
              .fontSize(应用尺寸.字号_按钮)
              .borderRadius(应用尺寸.圆角_面板)
              .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
              .backgroundColor($r('app.color.surface_card'))
              // 聚焦视觉完全去主题色，三层处理：局部主题色、组件状态样式、系统焦点框。
              .stateStyles({
                focused: {
                  .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
                  .backgroundColor($r('app.color.surface_card'))
                },
                normal: {
                  .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
                  .backgroundColor($r('app.color.surface_card'))
                }
              })
              .focusBox({
                strokeWidth: LengthMetrics.vp(0),
                margin: LengthMetrics.vp(0)
              })
              .enterKeyType(EnterKeyType.Done)
              .onSubmit((): void => {
                this.显示答案();
              })
              .onChange((value: string) => {
                this.已输入答案 = value;
              })
          }
        }
        .width('100%')
        .padding({
          left: 应用尺寸.页面内边距_水平,
          right: 应用尺寸.页面内边距_水平,
          // 间距用 padding（在背景内），避免透出页面底色形成主题色横带
          top: 应用尺寸.间距_8
        })
        .margin({
          bottom: this.学习布局模式值 === 'float' ? 应用尺寸.页面内边距_水平 + this.导航条高度 : 0
        })
        // 与卡片区域/答案条同底色：此行原为透明，会透出整页的 页面底色微染（主题色浅色横带）
        .backgroundColor($r('app.color.surface_card'))
      }
    }
    .width('100%')
    .layoutWeight(1)
  }

  @Builder
  private 答案条() {
    Column() {
      if (this.阶段 === 'question') {
        Button($r('app.string.study_show_answer'))
          .width('100%')
          .height(应用尺寸.行动按钮高度)
          .fontSize(应用尺寸.字号_标题)
          .fontWeight(FontWeight.Medium)
          .fontColor(Color.White)
          // 渐变方案：默认 primary→primaryActive（凸起），按下纯 primaryActive（凹陷）
          .linearGradient({
              angle: 180,
              colors: this.显示答案按下
                ? [[this.主色按钮按下色 as ResourceColor, 0.0], [this.主色按钮按下色 as ResourceColor, 1.0]]
                : [[this.主色按钮背景色 as ResourceColor, 0.0], [this.主色按钮按下色 as ResourceColor, 1.0]]
            })
          .borderRadius(应用尺寸.圆角_行动按钮)
          .animation({ duration: 80, curve: Curve.EaseOut })
          .onTouch((event: TouchEvent): void => {
            if (event.type === TouchType.Down) {
              this.显示答案按下 = true;
            } else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
              this.显示答案按下 = false;
            }
          })
          .onClick(() => {
            this.显示答案();
          })
      }
      if (this.阶段 === 'question' || this.阶段 === 'answer') {
        Row({ space: 应用尺寸.间距_8 }) {
          StudyActionButton({
            label: $r('app.string.study_bury'),
            buttonHeight: 应用尺寸.按钮高度,
            labelFontSize: 应用尺寸.字号_正文_中,
            labelColor: $r('app.color.text_secondary'),
            pressedBackground: this.主色容器色,
            onActivate: (): void => {
              this.埋藏或暂停当前卡(BURY_SUSPEND_MODE_BURY_USER);
            }
          })
          StudyActionButton({
            label: $r('app.string.study_suspend'),
            buttonHeight: 应用尺寸.按钮高度,
            labelFontSize: 应用尺寸.字号_正文_中,
            labelColor: $r('app.color.text_secondary'),
            pressedBackground: this.主色容器色,
            onActivate: (): void => {
              this.埋藏或暂停当前卡(BURY_SUSPEND_MODE_SUSPEND);
            }
          })
        }
        .width('100%')
        .margin({ top: 应用尺寸.间距_8 })
      }
      if (this.阶段 === 'answer') {
        Row({ space: 应用尺寸.间距_8 }) {
          StudyActionButton({
            label: this.按钮文案位(RATING_AGAIN),
            labelColor: $r('app.color.error_text'),
            pressedBackground: this.主色容器色,
            onActivate: (): void => {
              this.评分(RATING_AGAIN);
            }
          })
          StudyActionButton({
            label: this.按钮文案位(RATING_HARD),
            pressedBackground: this.主色容器色,
            onActivate: (): void => {
              this.评分(RATING_HARD);
            }
          })
          StudyActionButton({
            label: this.按钮文案位(RATING_GOOD),
            labelColor: this.动作主色,
            pressedBackground: this.主色容器色,
            pressedBorderColor: this.动作主色,
            onActivate: (): void => {
              this.评分(RATING_GOOD);
            }
          })
          StudyActionButton({
            label: this.按钮文案位(RATING_EASY),
            pressedBackground: this.主色容器色,
            onActivate: (): void => {
              this.评分(RATING_EASY);
            }
          })
        }
        .width('100%')
      }
    }
    .width('100%')
    .padding({
      left: 应用尺寸.页面内边距_水平,
      right: 应用尺寸.页面内边距_水平,
      top: 应用尺寸.间距_8,
      // 抬高避让手势导航条（AppGallery 导航栏适配要求）
      bottom: 应用尺寸.页面内边距_水平 + this.导航条高度
    })
    .backgroundColor($r('app.color.surface_card'))
  }

  build() {
    NavDestination() {
      // 外层 Stack：浮层工具栏用 position 绝对定位，需要全屏父容器；底层是限宽居中的内容列。
      // bottom 模式下 答案条 在内容列内，与原体验一致；float 模式下 答案条 不渲染，两个浮动工具栏叠加在 Stack 上层。
      Stack() {
        Column() {
          Column() {
            this.顶部条()
            this.卡片区()
            if (this.学习布局模式值 === 'bottom') {
              this.答案条()
            }
          }
          .width('100%')
          .constraintSize({ maxWidth: 应用尺寸.复习页内容最大宽度 })
          .height('100%')
        }
        .width('100%')
        .height('100%')
        .alignItems(HorizontalAlign.Center)
        .backgroundColor(this.页面底色微染值)

        if (this.学习布局模式值 === 'float') {
          // 主操作浮动工具栏：question 阶段显示「显示答案」，answer 阶段切换为 4 个评分按钮。
          学习浮动工具栏({
            工具栏类型: 'main',
            当前阶段: this.阶段,
            评分按钮文案: this.按钮文案,
            兜底文案: this.兜底文案,
            是否深色: this.是否深色(),
            显示答案回调: (): void => {
              this.显示答案();
            },
            埋藏回调: (): void => {
              this.埋藏或暂停当前卡(BURY_SUSPEND_MODE_BURY_USER);
            },
            暂停回调: (): void => {
              this.埋藏或暂停当前卡(BURY_SUSPEND_MODE_SUSPEND);
            },
            评分回调: (rating: number): void => {
              this.评分(rating);
            }
          })
          // 辅助操作浮动工具栏：question/answer 阶段都显示「埋藏 + 暂停」。
          学习浮动工具栏({
            工具栏类型: 'aux',
            当前阶段: this.阶段,
            评分按钮文案: this.按钮文案,
            兜底文案: this.兜底文案,
            是否深色: this.是否深色(),
            显示答案回调: (): void => {
              this.显示答案();
            },
            埋藏回调: (): void => {
              this.埋藏或暂停当前卡(BURY_SUSPEND_MODE_BURY_USER);
            },
            暂停回调: (): void => {
              this.埋藏或暂停当前卡(BURY_SUSPEND_MODE_SUSPEND);
            },
            评分回调: (rating: number): void => {
              this.评分(rating);
            }
          })
        }

        // 手写白板层：实验性功能，仅当用户从「更多」菜单点「手写」进入后显示；
        // 全屏覆盖卡片区域，提供关闭/撤销/清空。关闭时回调置 手写模式=false。
        if (this.手写模式) {
          学习手写白板层({
            是否深色: this.是否深色(),
            onClose: (): void => {
              this.手写模式 = false;
            }
          })
        }
      }
      .width('100%')
      .height('100%')
      // 物理键盘快捷键：挂在根 Stack 上，输入法消费前拦截（API 12+）。
      // focusable(true) + defaultFocus(true)：让根 Stack 默认获焦，确保 onKeyPreIme 稳定触发。
      //   按钮获焦时键盘事件会冒泡到根 Stack（ArkUI 事件冒泡机制），仍能触发。
      // Web 已 focusable(false)，不会抢焦点；浮动工具栏按钮如被触摸获焦，事件冒泡到根 Stack 处理。
      .focusable(true)
      .defaultFocus(true)
      .onKeyPreIme((event: KeyEvent): boolean => {
        return this.处理按键(event);
      })
    }
    .hideTitleBar(true)
    .opacity(this.转场透明度)
    // 从 AI 改卡页 pop 返回时重渲染当前卡。onPageShow 只对 @Entry 路由页生效，
    // NavDestination 必须用 onShown（与 学习提醒页 同款）；这是比 onPop 可靠的通道。
    .onShown((): void => {
      this.页面已显示 = true;
      this.消费待重渲染();
    })
    .onHidden((): void => {
      this.页面已显示 = false;
    })
  }
}
