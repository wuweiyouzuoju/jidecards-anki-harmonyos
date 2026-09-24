// SPDX-License-Identifier: AGPL-3.0-or-later
import { StudyTimerController, StudyTimerState } from '../model/StudyTimerController';
import { resourceText, showToastSafely } from '../utils/UiFeedback';
import { ThemeTextSpans } from '../components/common/ThemeText';
import { THEME_TEXT_COLORS_KEY } from '../model/ThemeCatalog';
import { PAGE_SURFACE_KEY, themeDefinition } from '../model/ThemeCatalog';
import { PrimaryGlassSurface } from '../utils/PrimaryGlassSurface';
import { PRIMARY_GLASS_KEY, PrimaryGlassStyle, themePrimaryGlass } from '../model/ThemeCatalog';

// 学习页：复习流程页（M7）。
// 链路：确保已打开 → SetCurrentDeck+GetQueuedCards → RenderExistingCard →
//       DescribeNextStates → Web 渲染正面 → 翻面 → AnswerCard → 取下一张。
// 媒体加载：自建域名（学习卡片HTML构建器.媒体基地址）+ onInterceptRequest
// 映射到沙箱 collection.media/，绕过 ArkWeb file 协议跨域拦截（官方推荐做法）。

import { common } from '@kit.AbilityKit';
import { LengthMetrics } from '@kit.ArkUI';
import { promptAction } from '@kit.ArkUI';
import { webview } from '@kit.ArkWeb';
import { interceptCardAsset } from '../utils/CardAssetResponse';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { 后端会话 } from '../backend/后端会话';
import { AnkiStudySessionBackend } from '../backend/StudySessionBackend';
import { StudySessionController, StudySnapshot } from '../model/StudySessionController';
import { StudyOptions, StudyAdvanceAction } from '../model/StudyTiming';
import { 调度器服务 } from '../backend/调度器服务';
import { 卡片渲染服务 } from '../backend/卡片渲染服务';
import { 集合服务 } from '../backend/集合服务';
import { 笔记服务 } from '../backend/笔记服务';
import { 笔记类型服务 } from '../backend/笔记类型服务';
import { EditableNote } from '../proto/messages/NoteMessages';
import { 浏览编辑区 } from '../components/browser/浏览编辑区';
import { NoteEditorSession, NoteEditorState, initialNoteEditorState } from '../model/NoteEditorSession';
import { AnkiNoteEditor } from '../backend/AnkiNoteEditor';
import { renderStudyAnswer, StudyAnswerNotetype } from '../model/StudyAnswerRenderer';
import { resolveStudyKey } from '../model/StudyInputPolicy';
import { studyKeyName } from '../utils/StudyKeyAdapter';

import type { RenderedCard, AvTagsResult } from '../proto/messages/CardRenderingMessages';
import {
  BURY_SUSPEND_MODE_BURY_USER,
  BURY_SUSPEND_MODE_SUSPEND,
  RATING_AGAIN,
  RATING_EASY,
  RATING_GOOD,
  RATING_HARD
} from '../proto/messages/SchedulerMessages';
import type { StudyCard } from '../proto/messages/SchedulerMessages';
import { 构建卡片HTML, 提取拼写标记, 媒体基地址, 原始侧HTML, 剥除拼写标记 } from '../model/学习卡片HTML构建器';
import { interceptMediaRequest } from '../utils/媒体响应助手';
import { 声音播放器 } from '../utils/声音播放器';
import { TTS播放器 } from '../utils/TTS播放器';
import { CardAudioSession } from '../model/CardAudioSession';
import { APP_FOREGROUND_KEY } from '../model/Redemption';
import { 应用尺寸 } from '../utils/应用尺寸';
import { 学习浮动工具栏 } from '../components/学习浮动工具栏';
import { 学习手写白板层 } from '../components/学习手写白板层';
import { StudyActionButton } from '../components/StudyActionButton';
import { isStudyGuideCompleted, completeStudyGuide } from '../utils/StudyGuideStore';
import { playStudyHaptic } from '../utils/StudyHaptics';
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
import type { JideChoiceOption, JideChoiceQuestion, JideChoiceGrade } from '../model/JideChoice';
import { gradeJideChoice, hideJideChoiceStaticOptions } from '../model/JideChoice';
// KeyCode 枚举：用于 onKeyPreIme 键盘事件判断（API 12+）。物理键盘/蓝牙键盘/2in1 设备统一派发。

import type { AI制卡页参数 } from './AI制卡页';
import { 设置页参数 } from '../model/navigation/PageParams';
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
  右滑处理: () => void = (): void => {};

  onTap(nx: number, ny: number): void {
    this.处理(nx, ny);
  }

  onSwipeRight(): void {
    this.右滑处理();
  }
}

@Component
export struct 学习页 {
  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  @StorageProp('cardTextSizePercent') private cardTextSizePercent: number = 100;
  /** Navigation 入栈参数（替代原路由取参方式） */
  pageDeckId: string = '';
  pageDeckName: string = '';
  /** 页面栈：返回主页时 pop */
  pathStack: NavPathStack = new NavPathStack();
  private readonly 调度器服务实例: 调度器服务 = new 调度器服务();
  private readonly 卡片渲染服务实例: 卡片渲染服务 = new 卡片渲染服务();
  private readonly 集合服务实例: 集合服务 = new 集合服务();
  private readonly studySession: StudySessionController = new StudySessionController(
    new AnkiStudySessionBackend(this.调度器服务实例, this.卡片渲染服务实例, this.集合服务实例));
  private readonly 笔记服务实例: 笔记服务 = new 笔记服务();
  private readonly 笔记类型服务实例: 笔记类型服务 = new 笔记类型服务();
  private readonly 网页控制器: webview.WebviewController = new webview.WebviewController();
  private readonly 声音播放器实例: 声音播放器 = new 声音播放器();
  private readonly TTS播放器实例: TTS播放器 = new TTS播放器();
  private readonly audioSession: CardAudioSession = new CardAudioSession(this.声音播放器实例, this.TTS播放器实例,
    (html: string, question: boolean): Promise<AvTagsResult> => this.卡片渲染服务实例.extractAudioTags(html, question));
  private mounted: boolean = false;
  private sessionReady: boolean = false;
  private requestVersion: number = 0;
  private loadingVersion: number = -1;
  private flipPending: boolean = false;
  private controllerReady: boolean = false;
  private pendingHtml: string = '';
  @StorageProp(APP_FOREGROUND_KEY) @Watch('studyActivityChanged') private foreground: boolean = true;
  private 当前卡片: StudyCard | null = null;
  private 已渲染: RenderedCard | null = null;
  @State private studyOptions: StudyOptions = new StudyOptions();
  @State private autoAdvanceEnabled: boolean = false;
  @State private studyTimerText: string = '';
  private readonly studyTimer: StudyTimerController = new StudyTimerController({
    state: (): StudyTimerState => this.studyTimerState(),
    display: (text: string): void => { this.studyTimerText = text; },
    act: (action: StudyAdvanceAction): void => { this.applyTimedAction(action); }
  }, {
    now: (): number => Date.now(),
    repeat: (work: () => void): number => setInterval(work, 200),
    cancel: (id: number): void => clearInterval(id)
  });
  private choiceAutoAdvanceTimer: number = -1;
  private choiceFeedbackDeadline: number = 0;
  private choiceDelayMenuOpen: boolean = false;
  private studyMenuOpen: boolean = false;
  private questionHasAudio: boolean = false;
  private 正面HTML: string = '';
  private 背面HTML: string = '';
  private 展示时刻毫秒: number = 0;
  private 评分中: boolean = false;
  private 媒体目录: string = '';
  private studyGuideChecked: boolean = false;
  private studyGuideVisible: boolean = false;
  @State private editor: NoteEditorState = initialNoteEditorState();
  private readonly editorSession: NoteEditorSession = new NoteEditorSession(new AnkiNoteEditor(),
    (state: NoteEditorState): void => { this.editor = state; });
  private editStartedAt: number = 0;
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
  /** 复习页布局模式：bottom=底部固定（默认）；float=浮动可拖动答案与评分工具栏。
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
  private contentRefreshInFlight: boolean = false;
  /** 本 NavDestination 是否在前台（onShown / onHidden 维护）；隐藏时不向 Web 推数据。 */
  @State private 页面已显示: boolean = false;
  @State private 主题模式值: 主题模式 = 'system';
  @StorageProp(颜色键.动作主色) private 动作主色: string = '#2F5FD0';
  @StorageProp(颜色键.动作主色按下) private 动作主色按下色: string = '#1E4FB8';
  // 2.1.4.1 对比度：按钮背景专用档（配 #FFFFFF 文字 ≥ 4.5:1）
  @StorageProp(颜色键.主色容器) private 主色容器色: string = '#E8EEFC';
  @StorageProp(PAGE_SURFACE_KEY) private 页面底色微染值: string = '#F5F7FA';
  // 状态栏高度（沉浸式全屏下，顶部条需让出状态栏区域，避免按钮叠在状态栏上）
  @StorageProp('状态栏高度') private 状态栏高度: number = 0;
  // 手势导航条高度（bottom 布局下答案条贴底，需抬高避让导航条）
  @StorageProp('导航条高度') private 导航条高度: number = 0;
  @State private 显示答案按下: boolean = false;
  @StorageProp(PRIMARY_GLASS_KEY) private primaryGlass: PrimaryGlassStyle = themePrimaryGlass(themeDefinition('aurora'), false);
  // Type-in-the-Answer：拼写字段名 为空串表示当前卡无 {{type:FieldName}} 标记，
  // 不渲染 TextInput、翻面时不注入比对结果。
  // 拼写填空=true 时翻面用 提取拼写填空内容 提取当前 cardOrd 的预期答案。
  @State private 已输入答案: string = '';
  @State private 拼写字段名: string = '';
  @State private 拼写组合: boolean = true;
  @State private 拼写填空: boolean = false;
  @State private 拼写卡片序号: number = 0;
  @State private choiceQuestion: JideChoiceQuestion | null = null;
  @State private choiceSelectedIds: string[] = [];
  @State private choiceGrade: JideChoiceGrade | null = null;
  @State private choiceFeedbackSecondsOverride: number = -1;
  /** NavDestination 透明度（由 customNavContentTransition 回调控制，实现淡入淡出转场）。 */
  @State private 转场透明度: number = 1;

  async aboutToAppear(): Promise<void> {
    this.mounted = true;
    this.studySession.activate();
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
    // 恢复显示偏好后启动会话；失败使用默认值。
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
    if (this.mounted) { this.启动会话(); }
  }

  /** 暗色模式判断：主题模式值=system 时跟随系统，否则按显式选择。与 首页.ets 同语义。 */
  private 是否深色(): boolean {
    return 解析是否深色(this.主题模式值, this.系统暗黑模式);
  }

  aboutToDisappear(): void {
    this.editorSession.dispose();
    this.studyTimer.dispose();
    this.mounted = false;
    this.studySession.dispose();
    this.页面已显示 = false;
    this.invalidateCardWork();
    this.clearChoiceAutoAdvance();
    this.待重渲染当前卡 = false;
    this.controllerReady = false;
    this.audioSession.release();
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

  private 取能力上下文(): common.UIAbilityContext | null {
    const context: common.UIAbilityContext | undefined =
      AppStorage.get<common.UIAbilityContext>('abilityContext');
    return context === undefined ? null : context;
  }

  /** 等待可见页面和首张卡片，空牌组不消耗首次教学机会。 */
  private maybeShowStudyGuide(): void {
    if (this.studyGuideChecked || !this.页面已显示 || !this.controllerReady || this.pendingHtml !== '' ||
      this.评分中 || this.阶段 !== 'question') {
      return;
    }
    this.studyGuideChecked = true;
    try {
      if (isStudyGuideCompleted()) {
        return;
      }
    } catch (error) {
      hilog.warn(0x4342, '学习页', 'Study guide preference could not be loaded');
    }
    this.showStudyGuide();
  }

  /** 初次与手动重看共用教学；阅读期间不计入当前卡答题时长。 */
  private showStudyGuide(): void {
    if (this.studyGuideVisible || !this.页面已显示 || this.阶段 === 'loading' || this.评分中) {
      return;
    }
    this.studyGuideVisible = true;
    this.stopStudyTimers();
    this.clearChoiceAutoAdvance();
    this.Ctrl按下 = false;
    const openedAt: number = Date.now();
    const card: StudyCard | null = this.当前卡片;
    const closeGuide = (): void => {
      if (this.studyGuideVisible && card !== null && card === this.当前卡片) {
        this.展示时刻毫秒 += Date.now() - openedAt;
      }
      this.studyGuideVisible = false;
      this.startStudyTimers();
      this.scheduleChoiceAutoAdvance();
    };
    this.getUIContext().showAlertDialog({
      title: $r('app.string.study_guide_title'),
      message: $r('app.string.study_guide_message'),
      autoCancel: false,
      alignment: DialogAlignment.Center,
      onWillDismiss: (action: DismissDialogAction): void => {
        closeGuide();
        action.dismiss();
      },
      confirm: {
        value: $r('app.string.study_guide_start'),
        action: (): void => {
          closeGuide();
          completeStudyGuide().catch((error: Object): void => {
            hilog.warn(0x4342, '学习页', 'Study guide preference could not be saved');
            showToastSafely(this.getUIContext(), {
              message: this.取文案($r('app.string.study_guide_save_failed'))
            });
          });
        }
      }
    });
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
      this.错误详情 = resourceText(this.getUIContext(), $r('app.string.ability_context_unavailable'));
      return;
    }
    this.媒体目录 = `${context.filesDir}/collection.media`;
    try {
      await 后端会话.获取实例().确保已打开(context.filesDir);
      if (!this.mounted) { return; }
      this.sessionReady = true;
      await this.加载下一张卡();
    } catch (error) {
      if (!this.mounted) { return; }
      this.阶段 = 'error';
      this.错误详情 = error instanceof Error ? error.message : `${error}`;
    }
  }

  /** 取队首并原子提交卡片/渲染/调度状态；过期请求不更新页面。 */
  private async 加载下一张卡(): Promise<void> {
    if (!this.mounted) { return; }
    if (!this.页面已显示 || !this.foreground) {
      this.待重渲染当前卡 = true;
      return;
    }
    this.invalidateCardWork();
    this.clearChoiceAutoAdvance();
    const version: number = this.requestVersion;
    this.loadingVersion = version;
    this.阶段 = 'loading';
    this.完成页数据已加载 = false;
    this.已输入答案 = '';
    this.拼写字段名 = '';
    this.拼写组合 = true;
    this.拼写填空 = false;
    this.拼写卡片序号 = 0;
    this.choiceQuestion = null;
    this.choiceSelectedIds = [];
    this.choiceGrade = null;
    try {
      const snapshot: StudySnapshot | null = await this.studySession.loadNext(this.牌组ID,
        (): boolean => this.isCurrentRequest(version));
      if (snapshot === null || !this.isCurrentRequest(version)) { return; }
      this.可撤销 = snapshot.canUndo;
      this.新卡剩余 = snapshot.queue.newCount;
      this.学习中剩余 = snapshot.queue.learningCount;
      this.复习剩余 = snapshot.queue.reviewCount;
      if (snapshot.card === null || snapshot.rendered === null) {
        this.当前卡片 = null;
        this.已渲染 = null;
        this.正面HTML = '';
        this.背面HTML = '';
        this.按钮文案 = [];
        this.手写模式 = false;
        this.阶段 = 'done';
        this.applyStudyHtml('<!DOCTYPE html><html><body></body></html>');
        await this.加载完成页信息();
        if (this.isCurrentRequest(version)) this.studySession.markComplete();
        return;
      }
      const card: StudyCard = snapshot.card;
      const rendered: RenderedCard = snapshot.rendered;
      // 卡片身份、调度状态与渲染结果一起提交，异步期间不暴露半张新卡。
      this.当前卡片 = card;
      this.已渲染 = rendered;
      this.按钮文案 = snapshot.labels;
      this.choiceQuestion = snapshot.choiceQuestion;
      this.studyOptions = snapshot.options;
      this.questionHasAudio = false;
      const marker = 提取拼写标记(rendered.answerNodes) ?? 提取拼写标记(rendered.questionNodes);
      if (marker !== null) {
        this.拼写字段名 = marker.fieldName;
        this.拼写组合 = marker.combining;
        this.拼写填空 = marker.cloze;
        this.拼写卡片序号 = card.templateIdx;
      }
      this.正面HTML = 剥除拼写标记(构建卡片HTML(rendered, 'question', this.是否深色()));
      this.背面HTML = this.拼写字段名 !== ''
        ? 构建卡片HTML(rendered, 'answer', this.是否深色())
        : 剥除拼写标记(构建卡片HTML(rendered, 'answer', this.是否深色()));
      if (this.choiceQuestion !== null) {
        this.正面HTML = hideJideChoiceStaticOptions(this.正面HTML);
        this.背面HTML = hideJideChoiceStaticOptions(this.背面HTML);
      }
      this.阶段 = 'question';
      this.applyStudyHtml(this.正面HTML);
    } catch (error) {
      if (!this.isCurrentRequest(version)) { return; }
      this.audioSession.stop();
      this.阶段 = 'error';
      this.错误详情 = error instanceof Error ? error.message : `${error}`;
    } finally {
      if (this.loadingVersion === version) { this.loadingVersion = -1; }
      this.消费待重渲染();
    }
  }

  /** 统一使旧卡面请求失效；不撤回已经提交给 Anki 的写入。 */
  private invalidateCardWork(): void {
    this.stopStudyTimers();
    this.requestVersion += 1;
    this.flipPending = false;
    this.pendingHtml = '';
    this.有音频 = false;
    this.audioSession.stop();
  }

  private isCurrentRequest(version: number): boolean {
    return this.mounted && this.页面已显示 && this.foreground && version === this.requestVersion;
  }

  /** 隐藏和系统后台共用取消规则；回来后重新读取队列，不能继续评旧卡。 */
  private studyActivityChanged(): void {
    if (!this.mounted) { return; }
    if (!this.页面已显示 || !this.foreground) {
      this.clearChoiceAutoAdvance();
      this.autoAdvanceEnabled = false;
      this.invalidateCardWork();
      this.Ctrl按下 = false;
      this.待重渲染当前卡 = true;
      if (this.controllerReady) {
        this.网页控制器.runJavaScript('document.querySelectorAll("audio,video").forEach(function(m){m.pause();});')
          .catch((error: Object): void => { console.info(`Study media pause: ${error}`); });
      }
      return;
    }
    this.消费待重渲染();
    this.scheduleChoiceAutoAdvance();
  }

  /** 首卡可以早于 Web attach；只在可见且控制器就绪时推送当前文档。 */
  /** @throws {Error} Web 渲染失败，由学习渲染控制器进入错误态。 */
  private applyStudyHtml(html: string): void {
    if (!this.isCurrentRequest(this.requestVersion)) { return; }
    if (!this.controllerReady) { this.pendingHtml = html; return; }
    this.pendingHtml = '';
    this.网页控制器.loadData(html, 'text/html', 'UTF-8', 媒体基地址, ' ');
    if (this.阶段 === 'question') {
      this.展示时刻毫秒 = Date.now();
      this.studyTimer.showQuestion(this.展示时刻毫秒);
    } else if (this.阶段 === 'answer') {
      this.studyTimer.showAnswer(Date.now());
    }
    this.maybeShowStudyGuide();
    this.playStudyAudio();
    this.startStudyTimers();
  }

  /** 消费晚到的控制器；加载失败保持可见错误，不遗留可评分的空白卡面。 */
  private studyWebAttached(): void {
    if (!this.mounted) { return; }
    this.controllerReady = true;
    if (this.pendingHtml === '') { return; }
    try {
      this.applyStudyHtml(this.pendingHtml);
    } catch (error) {
      this.阶段 = 'error';
      this.错误详情 = error instanceof Error ? error.message : `${error}`;
      this.audioSession.stop();
    }
  }

  /** 原生音频失败不阻断评分；重播会重新解析，允许失败后恢复。 */
  private async playStudyAudio(autoplay: boolean = true, manual: boolean = false): Promise<void> {
    const rendered: RenderedCard | null = this.已渲染;
    if (!this.isCurrentRequest(this.requestVersion) || !this.controllerReady || rendered === null ||
      this.editor.visible || this.editor.busy || (this.阶段 !== 'question' && this.阶段 !== 'answer')) { return; }
    const version: number = this.requestVersion;
    const question: boolean = this.阶段 === 'question';
    const replayQuestion: string = manual && !question && !this.studyOptions.skipQuestionWhenReplayingAnswer ?
      原始侧HTML(rendered, 'question') : '';
    try {
      const hasAudio: boolean | null = await this.audioSession.play(
        原始侧HTML(rendered, this.阶段 === 'answer' ? 'answer' : 'question'), this.阶段 === 'question', this.媒体目录,
        autoplay && (manual || this.studyOptions.autoplay), replayQuestion,
        (available: boolean): void => {
          if (this.isCurrentRequest(version) && question === (this.阶段 === 'question')) {
            if (question) this.questionHasAudio = available;
            this.有音频 = available || (!question && !this.studyOptions.skipQuestionWhenReplayingAnswer && this.questionHasAudio);
          }
        });
      if (hasAudio !== null && this.isCurrentRequest(version) && question === (this.阶段 === 'question')) {
        this.有音频 = hasAudio || (!question && !this.studyOptions.skipQuestionWhenReplayingAnswer && this.questionHasAudio);
      }
    } catch (error) {
      if (!this.isCurrentRequest(version)) { return; }
      this.有音频 = true;
      console.info(`Study audio: ${error}`);
      showToastSafely(this.getUIContext(), {
        message: this.取文案($r('app.string.browser_preview_audio_error'))
      });
    }
  }

  /** 页面唯一计时器：隐藏/编辑/引导时暂停，过期回调不能触发新卡评分。 */
  private startStudyTimers(): void {
    this.studyTimer.start();
  }

  private stopStudyTimers(): void {
    this.studyTimer.stop();
  }

  private clearChoiceAutoAdvance(): void {
    if (this.choiceAutoAdvanceTimer >= 0) clearTimeout(this.choiceAutoAdvanceTimer);
    this.choiceAutoAdvanceTimer = -1;
  }

  private scheduleChoiceAutoAdvance(): void {
    this.clearChoiceAutoAdvance();
    if (!this.页面已显示 || !this.foreground || this.studyGuideVisible || this.studyMenuOpen || this.评分中 ||
      this.editor.visible || this.editor.busy || this.手写模式 || this.choiceDelayMenuOpen ||
      this.阶段 !== 'answer' || this.choiceGrade === null || this.choiceQuestion === null ||
      this.choiceAutoAdvanceSeconds() <= 0 || this.choiceFeedbackDeadline <= 0) return;
    const remaining: number = Math.max(0, this.choiceFeedbackDeadline - Date.now());
    this.choiceAutoAdvanceTimer = setTimeout((): void => {
      this.choiceAutoAdvanceTimer = -1;
      this.继续选择题反馈();
    }, remaining);
  }

  private choiceAutoAdvanceSeconds(): number {
    if (this.choiceFeedbackSecondsOverride >= 0) return this.choiceFeedbackSecondsOverride;
    return this.choiceQuestion === null ? 0 : this.choiceQuestion.feedbackSeconds;
  }

  private 选择题自动跳过选项(): void {
    this.clearChoiceAutoAdvance();
    this.choiceDelayMenuOpen = true;
    const seconds: number[] = [0, 3, 5, 10, 15, 30];
    this.getUIContext().getPromptAction().showActionMenu({
      title: this.取文案($r('app.string.jide_choice_auto_skip_title')),
      buttons: [
        { text: this.取文案($r('app.string.jide_choice_auto_skip_option', 0)), color: $r('app.color.text_primary') },
        { text: this.取文案($r('app.string.jide_choice_auto_skip_option', 3)), color: $r('app.color.text_primary') },
        { text: this.取文案($r('app.string.jide_choice_auto_skip_option', 5)), color: $r('app.color.text_primary') },
        { text: this.取文案($r('app.string.jide_choice_auto_skip_option', 10)), color: $r('app.color.text_primary') },
        { text: this.取文案($r('app.string.jide_choice_auto_skip_option', 15)), color: $r('app.color.text_primary') },
        { text: this.取文案($r('app.string.jide_choice_auto_skip_option', 30)), color: $r('app.color.text_primary') }
      ]
    }).then((data: promptAction.ActionMenuSuccessResponse): void => {
      this.choiceDelayMenuOpen = false;
      if (this.choiceQuestion !== null && data.index >= 0 && data.index < seconds.length) {
        this.choiceFeedbackSecondsOverride = seconds[data.index];
        if (this.choiceGrade !== null && this.阶段 === 'answer') {
          this.choiceFeedbackDeadline = seconds[data.index] > 0 ? Date.now() + seconds[data.index] * 1000 : 0;
        }
      }
      this.scheduleChoiceAutoAdvance();
    }).catch((): void => {
      this.choiceDelayMenuOpen = false;
      this.scheduleChoiceAutoAdvance();
    });
  }

  private 继续选择题反馈(): void {
    if (this.choiceGrade === null || this.阶段 !== 'answer' || this.评分中 || this.studyGuideVisible ||
      this.studyMenuOpen || this.choiceDelayMenuOpen || this.editor.visible || this.editor.busy || this.手写模式 ||
      !this.页面已显示 || !this.foreground) return;
    this.clearChoiceAutoAdvance();
    this.choiceFeedbackDeadline = 0;
    this.加载下一张卡();
  }

  private toggleAutoAdvance(): void {
    this.autoAdvanceEnabled = !this.autoAdvanceEnabled;
    this.studyTimer.restartAdvance();
    this.startStudyTimers();
  }

  private studyTimerState(): StudyTimerState {
    return { version: this.requestVersion,
      active: this.isCurrentRequest(this.requestVersion) && this.controllerReady && !this.studyMenuOpen &&
        !this.editor.visible && !this.editor.busy && !this.studyGuideVisible && !this.手写模式 &&
        (this.阶段 === 'question' || this.阶段 === 'answer'),
      advance: this.autoAdvanceEnabled,
      blocked: this.choiceQuestion !== null || this.评分中 || this.flipPending,
      audioPlaying: this.audioSession.isPlaying(), options: this.studyOptions };
  }

  private applyTimedAction(action: StudyAdvanceAction): void {
    switch (action) {
      case StudyAdvanceAction.ShowAnswer: this.显示答案(); break;
      case StudyAdvanceAction.Bury: this.埋藏或暂停当前卡(BURY_SUSPEND_MODE_BURY_USER); break;
      case StudyAdvanceAction.Again: this.评分(0); break;
      case StudyAdvanceAction.Good: this.评分(2); break;
      case StudyAdvanceAction.Hard: this.评分(1); break;
      case StudyAdvanceAction.Reminder:
        const message: string = this.取文案(this.阶段 === 'question' ?
          $r('app.string.study_question_time_elapsed') : $r('app.string.study_answer_time_elapsed'));
        showToastSafely(this.getUIContext(), { message: message });
        break;
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
    if (!this.isCurrentRequest(this.requestVersion)) { return; }
    this.评分中 = true;
    this.invalidateCardWork();
    const version: number = this.requestVersion;
    try {
      await this.studySession.undo();
      await this.加载下一张卡();
    } catch (error) {
      if (!this.isCurrentRequest(version)) { return; }
      this.阶段 = 'error';
      this.错误详情 = error instanceof Error ? error.message : `${error}`;
    } finally {
      this.评分中 = false;
      this.消费待重渲染();
      this.maybeShowStudyGuide();
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
    return resourceText(this.getUIContext(), 资源);
  }

  private 更多菜单(): MenuElement[] {
    const canManageCard: boolean = !this.评分中 && this.当前卡片 !== null &&
      (this.阶段 === 'question' || this.阶段 === 'answer');
    const 菜单: MenuElement[] = [
      { value: this.取文案($r('app.string.study_edit_note')), action: () => { this.openNoteEditor(); }, enabled: canManageCard },
      { value: this.取文案($r('app.string.study_guide_title')), action: () => { this.showStudyGuide(); }, enabled: this.阶段 !== 'loading' && !this.评分中 },
      { value: this.取文案($r('app.string.study_undo')), action: () => { this.撤销上次(); }, enabled: this.可撤销 },
      {
        value: this.取文案($r('app.string.study_bury')),
        action: () => { this.埋藏或暂停当前卡(BURY_SUSPEND_MODE_BURY_USER); },
        enabled: canManageCard
      },
      {
        value: this.取文案($r('app.string.study_suspend')),
        action: () => { this.埋藏或暂停当前卡(BURY_SUSPEND_MODE_SUSPEND); },
        enabled: canManageCard
      },
      { value: this.取文案($r('app.string.study_delete_card')), action: () => { this.请求删除当前卡(); }, enabled: this.阶段 === 'question' || this.阶段 === 'answer' }
    ];
    if (this.choiceQuestion !== null) {
      菜单.push({
        value: this.取文案($r('app.string.jide_choice_auto_skip_current', this.choiceAutoAdvanceSeconds())),
        action: (): void => { this.选择题自动跳过选项(); },
        enabled: canManageCard
      });
    } else {
      菜单.unshift({
        value: this.取文案(this.autoAdvanceEnabled ? $r('app.string.study_auto_advance_pause') :
          $r('app.string.study_auto_advance_start')),
        action: (): void => { this.toggleAutoAdvance(); },
        enabled: canManageCard && (this.studyOptions.secondsToShowQuestion > 0 || this.studyOptions.secondsToShowAnswer > 0)
      });
    }
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
        action: () => { this.手写模式 = true; this.stopStudyTimers(); },
        enabled: true
      });
    }
    return 菜单;
  }

  /** 从当前学习卡读取笔记；字段就绪后才挂载编辑器，避免初始化为空草稿。 */

  private async openNoteEditor(): Promise<void> {
    if (this.评分中 || this.studyGuideVisible || this.当前卡片 === null ||
      (this.阶段 !== 'question' && this.阶段 !== 'answer') || !this.isCurrentRequest(this.requestVersion)) return;
    this.评分中 = true;
    this.editStartedAt = Date.now();
    this.Ctrl按下 = false;
    const noteId: number = this.当前卡片.noteId;
    this.invalidateCardWork();
    const version: number = this.requestVersion;
    const result: string = await this.editorSession.open(noteId, true,
      (): boolean => this.isCurrentRequest(version), false);
    if (!this.mounted) return;
    if (result === 'failed') {
      this.展示时刻毫秒 += Date.now() - this.editStartedAt;
      showToastSafely(this.getUIContext(), { message: this.取文案($r('app.string.browser_detail_load_error')) });
    }
    if (!this.editor.visible) {
      this.评分中 = false;
      this.消费待重渲染();
      this.startStudyTimers();
    }
  }

  /** 取消不重载卡片，并扣除编辑占用的答题时间。 */
  private closeNoteEditor(): void {
    if (this.editor.busy || !this.editor.visible) return;
    this.展示时刻毫秒 += Date.now() - this.editStartedAt;
    this.editorSession.close();
    this.评分中 = false;
    this.Ctrl按下 = false;
    this.消费待重渲染();
    this.playStudyAudio(false);
    this.startStudyTimers();
  }

  /** 保存原笔记并保留撤销记录；从后端重新获取队首、调度状态和题面。 */
  private async saveNoteEdits(fields: string[], tags: string[]): Promise<boolean> {
    if (this.editor.busy || !this.editor.visible || this.editor.note === null) return false;
    const saved: boolean = await this.editorSession.save(fields, tags, async (note: EditableNote): Promise<boolean> => {
      await this.studySession.saveNote(note, note.fields, note.tags);
      if (this.mounted) await this.加载下一张卡();
      return true;
    });
    if (this.mounted) {
      if (saved) { this.评分中 = false; this.Ctrl按下 = false; }
      this.消费待重渲染();
      if (!this.editor.visible) this.playStudyAudio();
      this.startStudyTimers();
    }
    return saved;
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

  /** 返回与写入通知共用刷新入口；加载或编辑期间保留标记，不并发覆盖卡面。 */
  private 消费待重渲染(): void {
    if (!this.mounted || !this.sessionReady || !this.foreground || !this.待重渲染当前卡 ||
      !this.页面已显示 || this.contentRefreshInFlight || this.评分中 || this.editor.visible || this.editor.busy ||
      (this.阶段 === 'loading' && this.loadingVersion === this.requestVersion)) { return; }
    this.待重渲染当前卡 = false;
    this.刷新编辑后当前卡();
  }

  /** 复用完整加载链更新模板、字段、拼写和音频；同一张卡保留正反面，失效时使用真实队首。 */
  private async 刷新编辑后当前卡(): Promise<void> {
    const currentCardId: number = this.当前卡片?.cardId ?? 0;
    const wasAnswer: boolean = this.阶段 === 'answer';
    this.contentRefreshInFlight = true;
    this.评分中 = true;
    try {
      this.invalidateCardWork();
      await this.加载下一张卡();
      if (this.页面已显示 && wasAnswer && this.当前卡片?.cardId === currentCardId) {
        await this.显示答案();
      }
    } catch (error) {
      this.阶段 = 'error';
      this.错误详情 = error instanceof Error ? error.message : `${error}`;
    } finally {
      this.contentRefreshInFlight = false;
      this.评分中 = false;
      this.消费待重渲染();
      this.maybeShowStudyGuide();
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
    if (!this.isCurrentRequest(this.requestVersion)) { return; }
    this.评分中 = true;
    this.invalidateCardWork();
    const version: number = this.requestVersion;
    try {
      const cardId: number = this.当前卡片.cardId;
      await this.studySession.buryCard(cardId, mode);
      await this.加载下一张卡();
    } catch (error) {
      if (!this.isCurrentRequest(version)) { return; }
      this.阶段 = 'error';
      this.错误详情 = error instanceof Error ? error.message : `${error}`;
    } finally {
      if (this.mounted) {
        this.评分中 = false;
        this.消费待重渲染();
        this.maybeShowStudyGuide();
      }
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
    this.autoAdvanceEnabled = false;
    const cardId: number = this.当前卡片.cardId;
    const version: number = this.requestVersion;
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
          if (!this.isCurrentRequest(version) || this.当前卡片?.cardId !== cardId) return;
          this.确认删除当前卡();
        }
      }
    });
  }

  private async 确认删除当前卡(): Promise<void> {
    if (this.评分中 || this.当前卡片 === null) {
      return;
    }
    if (!this.isCurrentRequest(this.requestVersion)) { return; }
    this.评分中 = true;
    this.invalidateCardWork();
    const version: number = this.requestVersion;
    try {
      const cardId: number = this.当前卡片.cardId;
      await this.studySession.removeCard(cardId);
      await this.加载下一张卡();
    } catch (error) {
      if (!this.isCurrentRequest(version)) { return; }
      this.阶段 = 'error';
      const reason: string = error instanceof Error ? error.message : `${error}`;
      this.错误详情 = resourceText(this.getUIContext(), $r('app.string.study_delete_card_failed'))
        .replace('%s', reason);
    } finally {
      if (this.mounted) {
        this.评分中 = false;
        this.消费待重渲染();
        this.maybeShowStudyGuide();
      }
    }
  }

  /** 完成页真实数据；拉取失败降级为静态完成文案（完成页数据已加载=false），不进入错误态。 */
  private async 加载完成页信息(): Promise<void> {
    const version: number = this.requestVersion;
    try {
      const info = await this.studySession.congrats();
      if (!this.isCurrentRequest(version)) { return; }
      // 上游 buildNextLearnMsg：下一张学习卡 >=1 天后到期时不再提示
      this.完成页学习剩余 = info.secsUntilNextLearn < SECONDS_PER_DAY ? info.learnRemaining : 0;
      this.完成页下张学习分钟 = Math.max(1, Math.ceil(info.secsUntilNextLearn / 60));
      this.完成页复习受限 = info.reviewRemaining;
      this.完成页新卡受限 = info.newRemaining;
      this.完成页有埋藏 = info.haveSchedBuried || info.haveUserBuried;
      this.完成页数据已加载 = true;
    } catch (error) {
      if (!this.isCurrentRequest(version)) { return; }
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
    if (!this.isCurrentRequest(this.requestVersion)) { return; }
    this.评分中 = true;
    this.invalidateCardWork();
    const version: number = this.requestVersion;
    try {
      await this.studySession.unburyDeck(this.牌组ID);
      await this.加载下一张卡();
    } catch (error) {
      if (!this.isCurrentRequest(version)) { return; }
      this.阶段 = 'error';
      this.错误详情 = error instanceof Error ? error.message : `${error}`;
    } finally {
      if (this.mounted) {
        this.评分中 = false;
        this.消费待重渲染();
        this.maybeShowStudyGuide();
      }
    }
  }

  /** 翻面只提交当前请求结果；拼写请求期间切卡会使本次结果失效。 */
  private async 显示答案(): Promise<void> {
    if (this.editor.visible || this.editor.busy || this.studyGuideVisible || this.flipPending ||
      (this.评分中 && !this.contentRefreshInFlight)) { return; }
    if (this.choiceQuestion !== null) return;
    if (!this.isCurrentRequest(this.requestVersion) || !this.controllerReady || this.pendingHtml !== '' ||
      this.阶段 !== 'question' || this.已渲染 === null) { return; }
    const version: number = this.requestVersion;
    this.flipPending = true;
    try {
      const html: string = this.拼写字段名 !== ''
        ? await this.构建拼写答案HTML(this.背面HTML) : this.背面HTML;
      if (!this.isCurrentRequest(version)) { return; }
      this.背面HTML = html;
      this.阶段 = 'answer';
      this.applyStudyHtml(html);
    } catch (error) {
      if (!this.isCurrentRequest(version)) { return; }
      this.audioSession.stop();
      this.阶段 = 'error';
      this.错误详情 = error instanceof Error ? error.message : `${error}`;
    } finally {
      if (version === this.requestVersion) { this.flipPending = false; }
    }
  }

  private 切换选择题选项(id: string): void {
    if (this.choiceGrade !== null || this.choiceQuestion === null) return;
    if (this.choiceQuestion.type === 'single_choice') {
      this.choiceSelectedIds = [id];
      return;
    }
    const next: string[] = this.choiceSelectedIds.slice();
    const index: number = next.indexOf(id);
    if (index >= 0) next.splice(index, 1); else next.push(id);
    this.choiceSelectedIds = next;
  }

  private async 提交选择题(): Promise<void> {
    if (this.choiceQuestion === null || this.choiceGrade !== null || this.choiceSelectedIds.length === 0 ||
      this.阶段 !== 'question' || this.studyGuideVisible || this.editor.visible || this.editor.busy ||
      this.当前卡片 === null || this.评分中 || !this.isCurrentRequest(this.requestVersion)) return;
    const version: number = this.requestVersion;
    const question: JideChoiceQuestion = this.choiceQuestion;
    const card: StudyCard = this.当前卡片;
    const grade: JideChoiceGrade = gradeJideChoice(this.choiceSelectedIds, question.answer);
    this.choiceGrade = grade;
    this.评分中 = true;
    playStudyHaptic();
    try {
      await this.studySession.answer(card, grade.correct ? RATING_GOOD : RATING_HARD, Date.now(), this.展示时刻毫秒);
      if (!this.isCurrentRequest(version) || this.当前卡片 !== card) return;
      this.阶段 = 'answer';
      this.applyStudyHtml(this.背面HTML);
      const autoAdvanceSeconds: number = this.choiceAutoAdvanceSeconds();
      this.choiceFeedbackDeadline = autoAdvanceSeconds > 0 ? Date.now() + autoAdvanceSeconds * 1000 : 0;
      this.scheduleChoiceAutoAdvance();
    } catch (error) {
      if (!this.isCurrentRequest(version)) return;
      this.阶段 = 'error';
      this.错误详情 = error instanceof Error ? error.message : `${error}`;
    } finally {
      this.评分中 = false;
      this.scheduleChoiceAutoAdvance();
    }
  }

  @Builder
  private 选择题区() {
    if (this.choiceQuestion !== null && (this.阶段 === 'question' || this.阶段 === 'answer')) {
      Column({ space: 应用尺寸.间距_8 }) {
        Scroll() {
          Row({ space: 应用尺寸.间距_8 }) {
            Column({ space: 应用尺寸.间距_8 }) {
              ForEach(this.choiceQuestion.options.slice(0, Math.ceil(this.choiceQuestion.options.length / 2)),
                (option: JideChoiceOption): void => { this.选择题选项按钮(option); },
                (option: JideChoiceOption): string => option.id)
            }.layoutWeight(1)
            Column({ space: 应用尺寸.间距_8 }) {
              ForEach(this.choiceQuestion.options.slice(Math.ceil(this.choiceQuestion.options.length / 2)),
                (option: JideChoiceOption): void => { this.选择题选项按钮(option); },
                (option: JideChoiceOption): string => option.id)
            }.layoutWeight(1)
          }
          .width('100%')
        }
        .layoutWeight(1)
        .scrollBar(BarState.Auto)
        if (this.阶段 === 'question') {
          Button($r('app.string.jide_choice_submit'))
            .width('100%').height(应用尺寸.行动按钮高度)
            .backgroundColor(this.动作主色).fontColor($r('app.color.action_on_primary'))
            .borderRadius(应用尺寸.圆角_行动按钮)
            .enabled(this.choiceSelectedIds.length > 0 && !this.评分中)
            .onClick((): void => { this.提交选择题(); });
        }
        if (this.阶段 === 'answer' && this.choiceGrade !== null) {
          Text(this.choiceGrade.correct ? $r('app.string.jide_choice_correct') : $r('app.string.jide_choice_wrong'))
            .fontSize(应用尺寸.字号_正文_中)
            .fontColor(this.choiceGrade.correct ? $r('app.color.status_ready') : $r('app.color.error_text'))
          Button($r('app.string.jide_choice_continue'))
            .width('100%').height(应用尺寸.行动按钮高度)
            .backgroundColor(this.动作主色).fontColor($r('app.color.action_on_primary'))
            .borderRadius(应用尺寸.圆角_行动按钮)
            .onClick((): void => { this.继续选择题反馈(); });
        }
      }
      .width('100%').height('58%')
      .padding({ left: 应用尺寸.页面内边距_水平, right: 应用尺寸.页面内边距_水平,
        top: 应用尺寸.间距_8, bottom: 应用尺寸.间距_8 })
      .align(Alignment.Bottom)
      .backgroundColor($r('app.color.surface_page'))
      .parallelGesture(SwipeGesture({ direction: SwipeDirection.Horizontal })
        .onAction((event: GestureEvent): void => {
          if (Math.abs(event.angle) < 90) this.继续选择题反馈();
        }))
    }
  }

  private 选择题选项序号(option: JideChoiceOption): number {
    return this.choiceQuestion === null ? 0 : this.choiceQuestion.options.indexOf(option);
  }

  private 选择题选项已选(option: JideChoiceOption): boolean {
    return this.choiceSelectedIds.indexOf(option.id) >= 0;
  }

  private 选择题选项正确(option: JideChoiceOption): boolean {
    return this.choiceQuestion !== null && this.choiceQuestion.answer.indexOf(option.id) >= 0;
  }

  @Builder
  private 选择题选项按钮(option: JideChoiceOption) {
    Button() {
      Row({ space: 应用尺寸.间距_8 }) {
        Text(`${String.fromCharCode(65 + this.选择题选项序号(option))}.`)
          .fontSize(应用尺寸.字号_按钮).fontColor($r('app.color.text_secondary'))
        Text(this.choiceGrade === null ? (this.选择题选项已选(option) ? '✓' : '○') :
          (this.选择题选项正确(option) ? '✓' : (this.选择题选项已选(option) ? '×' : '○')))
          .fontSize(应用尺寸.字号_按钮)
          .fontColor(this.choiceGrade === null ? this.动作主色 :
            (this.选择题选项正确(option) ? $r('app.color.status_ready') :
              (this.选择题选项已选(option) ? $r('app.color.error_text') : this.动作主色)))
        Text(option.text).fontSize(应用尺寸.字号_正文_中)
          .fontColor($r('app.color.text_primary')).textAlign(TextAlign.Start).layoutWeight(1)
      }
      .width('100%')
    }
    .width('100%').constraintSize({ minHeight: 应用尺寸.行动按钮高度 })
    .backgroundColor(this.选择题选项已选(option) ? $r('app.color.surface_selected') : $r('app.color.surface_card'))
    .border({ width: 1, color: $r('app.color.border_subtle') })
    .borderRadius(应用尺寸.圆角_面板)
    .enabled(this.choiceGrade === null && !this.评分中)
    .onClick((): void => { this.切换选择题选项(option.id); });
  }

  /** 根据翻面时的拼写快照生成比对结果；字段读取失败时仍显示答案。 */
  private async 构建拼写答案HTML(answerHtml: string): Promise<string> {
    return renderStudyAnswer(answerHtml, this.当前卡片 === null ? null : {
      noteId: this.当前卡片.noteId, fieldName: this.拼写字段名, cloze: this.拼写填空,
      ordinal: this.拼写卡片序号, input: this.已输入答案, combining: this.拼写组合
    }, {
      note: (id: number): Promise<EditableNote> => this.笔记服务实例.获取笔记(id),
      notetype: (id: number): Promise<StudyAnswerNotetype> => this.笔记类型服务实例.获取笔记类型(id)
    });
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
    if (this.studyGuideVisible) { return; }
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
    if (this.studyGuideVisible) { return; }
    if (this.choiceQuestion !== null) { return; }
    if (this.评分中 || this.阶段 !== 'answer' || this.当前卡片 === null) {
      return;
    }
    if (!this.isCurrentRequest(this.requestVersion)) { return; }
    this.评分中 = true;
    playStudyHaptic();
    this.invalidateCardWork();
    const version: number = this.requestVersion;
    try {
      await this.studySession.answer(this.当前卡片, rating, Date.now(), this.展示时刻毫秒);
      await this.加载下一张卡();
    } catch (error) {
      if (!this.isCurrentRequest(version)) { return; }
      this.阶段 = 'error';
      this.错误详情 = error instanceof Error ? error.message : `${error}`;
    } finally {
      this.评分中 = false;
      this.消费待重渲染();
      this.maybeShowStudyGuide();
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
    return interceptMediaRequest(event.request, this.媒体目录, 媒体基地址);
  }

  private 按钮文案位(index: number): string {
    if (index < this.按钮文案.length && this.按钮文案[index].length > 0) {
      return this.按钮文案[index];
    }
    return '';
  }

  private 返回(): void {
    if (this.editor.busy) { return; }
    if (this.editor.visible) { this.closeNoteEditor(); return; }
    this.autoAdvanceEnabled = false;
    this.stopStudyTimers();
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
    const result = resolveStudyKey(studyKeyName(event.keyCode), event.type === KeyType.Down,
      this.Ctrl按下, this.阶段, this.editor.visible || this.editor.busy, this.studyGuideVisible);
    this.Ctrl按下 = result.control;
    switch (result.command) {
      case 'undo': this.撤销上次(); break;
      case 'back': this.返回(); break;
      case 'delete': this.请求删除当前卡(); break;
      case 'bury': this.埋藏或暂停当前卡(BURY_SUSPEND_MODE_BURY_USER); break;
      case 'suspend': this.埋藏或暂停当前卡(BURY_SUSPEND_MODE_SUSPEND); break;
      case 'replay': this.playStudyAudio(true, true); break;
      case 'flip': this.显示答案(); break;
      case 'again': this.评分(RATING_AGAIN); break;
      case 'hard': this.评分(RATING_HARD); break;
      case 'good': this.评分(RATING_GOOD); break;
      case 'easy': this.评分(RATING_EASY); break;
    }
    return result.command !== 'none';
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
          .bindMenu(this.更多菜单(), {
            onAppear: (): void => { this.studyMenuOpen = true; this.stopStudyTimers(); this.clearChoiceAutoAdvance(); },
            onDisappear: (): void => { this.studyMenuOpen = false; this.startStudyTimers(); this.scheduleChoiceAutoAdvance(); }
          })
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
      top: this.状态栏高度 + 应用尺寸.toolbarVerticalInset,
      bottom: 应用尺寸.toolbarVerticalInset
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
        .textZoomRatio(this.cardTextSizePercent)
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
          代理.右滑处理 = (): void => { this.继续选择题反馈(); };
          this.网页控制器.registerJavaScriptProxy(代理, 'ankiTapZone', ['onTap', 'onSwipeRight']);
          this.studyWebAttached();
        })
        .onInterceptRequest((event: OnInterceptRequestEvent): WebResourceResponse | null => {
          return interceptCardAsset(event.request.getRequestUrl()) ?? this.拦截媒体(event);
        })
        // onPageEnd 兜底（BUG-001）：ArkWeb 对 qfmt/afmt 模板内联 <script> 的执行时序存在抖动，
        // 极少数情况下 anki.imageOcclusion.setup() 未被调用导致遮罩未绘制。
        // 页面加载完成后显式再调一次，setup() 内部幂等（无 #image-occlusion-canvas 直接返回），
        // 对 Basic/Cloze 卡片零影响。
        .onPageEnd((event: OnPageEndEvent) => {
          if (this.阶段 !== 'question' && this.阶段 !== 'answer') return;
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
            + '(function(){if(window.__jideSwipeInstalled){return;}window.__jideSwipeInstalled=true;var sx=0,sy=0,st=0;'
            + 'document.addEventListener("touchstart",function(e){if(e.touches.length!==1){st=0;return;}sx=e.touches[0].clientX;sy=e.touches[0].clientY;st=Date.now();},{passive:true,capture:true});'
            + 'document.addEventListener("touchend",function(e){if(!st||e.changedTouches.length!==1)return;var dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;'
            + 'if(dx>=56&&Math.abs(dx)>Math.abs(dy)*1.25&&Date.now()-st<1500&&window.ankiTapZone){window.ankiTapZone.onSwipeRight();}st=0;},{passive:true,capture:true});})();'
          );
          // 翻面后自动滚动到答案区（<hr id=answer> 或底部），避免用户手动下滑（2026-07-28 加）。
          // 先等待公式排版再给图片留 100ms，避免公式撑高后滚动位置偏移。
          if (this.阶段 === 'answer') {
            this.网页控制器.runJavaScript(
              '(function(){ var ready=window.MathJax && MathJax.startup ? MathJax.startup.promise : Promise.resolve(); ready.catch(function(){}).then(function(){ setTimeout(function(){ var a=document.getElementById("answer"); if(a){ a.scrollIntoView({block:"start"}); } else { window.scrollTo(0, document.body.scrollHeight); } }, 100); }); })();'
            );
          }
        })
        .width('100%')
        .height(this.choiceQuestion === null ? '100%' : '42%')
        .align(Alignment.TopStart)
        // 保留控制器供撤销/恢复埋藏复用；加载、完成及错误态均不透出旧卡。
        .visibility(this.阶段 === 'question' || this.阶段 === 'answer' ? Visibility.Visible : Visibility.Hidden)

        this.选择题区()

      // Tap Zones（实验性功能，仅「实验版」模式下且开关开启时生效）：
      // 点击判定在卡片 Web 内部完成（onPageEnd 注入的 click 监听 + javaScriptProxy 回调），
      // 不再用 ArkUI 覆盖层——覆盖层无法区分"点卡片内容"与"点卡片内链接/交互元素"，
      // 且会与 Web 的触摸/滚动互相干扰。Web 内判定天然排除 A/INPUT/CANVAS 等交互标签，
      // 顶部条（返回/更多）与答案条/浮动工具栏（埋藏/暂停/评分按钮）在 ArkUI 层，不受影响。

      if (this.studyOptions.showTimer && (this.阶段 === 'question' || this.阶段 === 'answer')) {
        Text(this.studyTimerText)
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_secondary'))
          .padding(应用尺寸.间距_8)
          .backgroundColor($r('app.color.surface_card'))
          .borderRadius(应用尺寸.圆角_胶囊)
          .align(Alignment.TopEnd)
          .margin(应用尺寸.间距_12)
          .hitTestBehavior(HitTestMode.None)
      }

      if (this.有音频 && (this.阶段 === 'question' || this.阶段 === 'answer')) {
        Button() {
          Text() { ThemeTextSpans($r('app.string.study_replay_sound'), this.themeAccentColors, this.getUIContext()) }.fontSize(应用尺寸.字号_按钮).fontColor(this.动作主色)
        }
          .height(应用尺寸.按钮高度)
          .padding({ left: 应用尺寸.卡片内边距, right: 应用尺寸.卡片内边距 })
          .margin(应用尺寸.间距_12)
          .fontSize(应用尺寸.字号_按钮)
          .fontColor(this.动作主色)
          .backgroundColor($r('app.color.surface_card'))
          .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
          .borderRadius(应用尺寸.圆角_胶囊)
          .onClick(() => {
            this.playStudyAudio(true, true);
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
          Button() {
            Text() { ThemeTextSpans($r('app.string.study_back'), this.themeAccentColors, this.getUIContext()) }.fontSize(应用尺寸.字号_按钮).fontColor(this.动作主色)
          }
            .height(应用尺寸.按钮高度)
            .padding({ left: 应用尺寸.卡片内边距, right: 应用尺寸.卡片内边距 })
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
              Button() {
                Text() { ThemeTextSpans($r('app.string.study_unbury'), this.themeAccentColors, this.getUIContext()) }.fontSize(应用尺寸.字号_按钮).fontColor(this.动作主色)
              }
                .height(应用尺寸.按钮高度)
                .padding({ left: 应用尺寸.卡片内边距, right: 应用尺寸.卡片内边距 })
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
      // 输入框与答案条使用相同的左右内边距；
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
          // 上下留白都在背景内，浮动模式的导航条避让区不能透出主题色横带。
          top: 应用尺寸.间距_8,
          bottom: this.学习布局模式值 === 'float' ? 应用尺寸.页面内边距_水平 + this.导航条高度 : 0
        })
        // 输入框和导航条避让区与卡片区域/答案条同底色。
        .backgroundColor($r('app.color.surface_card'))
      }
    }
    .width('100%')
    .layoutWeight(1)
    .padding({ top: 应用尺寸.pageContentTopInset })
  }

  @Builder
  private 答案条() {
    Column() {
      if (this.阶段 === 'question' && this.choiceQuestion === null) {
        Button() {
          Text() { ThemeTextSpans($r('app.string.study_show_answer'), this.themeAccentColors, this.getUIContext()) }
            .fontSize(应用尺寸.字号_标题).fontWeight(FontWeight.Medium).fontColor(this.动作主色)
        }
          .width('100%')
          .height(应用尺寸.行动按钮高度)
          .fontSize(应用尺寸.字号_标题)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.动作主色)
          .attributeModifier(new PrimaryGlassSurface(this.显示答案按下, this.primaryGlass))
          .stateEffect(false)
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
      if (this.阶段 === 'answer' && this.choiceQuestion === null) {
        Row({ space: 应用尺寸.间距_8 }) {
          StudyActionButton({
            label: $r('app.string.rating_again'),
            subtitle: this.按钮文案位(RATING_AGAIN),
            labelColor: $r('app.color.error_text'),
            onActivate: (): void => {
              this.评分(RATING_AGAIN);
            }
          })
          StudyActionButton({
            label: $r('app.string.rating_hard'),
            subtitle: this.按钮文案位(RATING_HARD),
            onActivate: (): void => {
              this.评分(RATING_HARD);
            }
          })
          StudyActionButton({
            label: $r('app.string.rating_good'),
            subtitle: this.按钮文案位(RATING_GOOD),
            labelColor: this.动作主色,
            onActivate: (): void => {
              this.评分(RATING_GOOD);
            }
          })
          StudyActionButton({
            label: $r('app.string.rating_easy'),
            subtitle: this.按钮文案位(RATING_EASY),
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
      // bottom 模式下 答案条 在内容列内，与原体验一致；float 模式下 答案条 不渲染，答案与评分浮动工具栏叠加在 Stack 上层。
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
        .backgroundColor(Color.Transparent)

        if (this.学习布局模式值 === 'float') {
          // 主操作浮动工具栏：question 阶段显示「显示答案」，answer 阶段切换为 4 个评分按钮。
          if (this.choiceQuestion === null) 学习浮动工具栏({
            当前阶段: this.阶段,
            评分按钮文案: this.按钮文案,
            是否深色: this.是否深色(),
            显示答案回调: (): void => {
              this.显示答案();
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
              this.startStudyTimers();
            }
          })
        }
        if (this.editor.visible && this.editor.note !== null) {
          浏览编辑区({
            isDark: this.是否深色(),
            busy: this.editor.busy,
            errorMessage: this.editor.error === '' ? '' : this.取文案($r('app.string.browser_detail_save_error')),
            fieldNames: this.editor.fieldNames,
            initialFieldValues: this.editor.note.fields,
            initialTags: this.editor.note.tags.join(' '),
            onCancel: (): void => { this.closeNoteEditor(); },
            onSave: (fields: string[], tags: string[]): Promise<boolean> => {
              return this.saveNoteEdits(fields, tags);
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
    .backgroundColor(Color.Transparent)
    .onBackPressed((): boolean => {
      if (this.editor.busy) { return true; }
      if (this.editor.visible) { this.closeNoteEditor(); return true; }
      return false;
    })
    .opacity(this.转场透明度)
    // 从任何编辑/设置页返回都重新读取卡面。onPageShow 只对 @Entry 路由页生效，
    // NavDestination 必须用 onShown（与 学习提醒页 同款）；这是比 onPop 可靠的通道。
    .onShown((): void => {
      this.页面已显示 = true;
      this.studyActivityChanged();
      this.maybeShowStudyGuide();
    })
    .onHidden((): void => {
      this.页面已显示 = false;
      this.studyActivityChanged();
    })
  }
}
