import { PressFeedback } from '../utils/PressFeedback';
import { EditNotePageParams } from '../model/navigation/PageParams';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { StudyTimerController, StudyTimerState } from '../model/StudyTimerController';
import { resourceText, namedResourceText, showToastSafely } from '../utils/UiFeedback';
import { AppInterfaceItem, AppInterfaceMenuItem, AppInterfaceControl, studyInterfaceMenu, visibleInterfaceItems } from '../model/AppInterface';
import { appInterface } from '../backend/AppInterfaceService';
import { ThemeTextSpans } from '../components/common/ThemeText';
import { THEME_TEXT_COLORS_KEY } from '../model/ThemeCatalog';
import { PAGE_SURFACE_KEY } from '../model/ThemeCatalog';
import { DECK_LIST_NARROW_KEY } from '../model/DeckListAppearance';
import { 开始学习按钮 } from '../components/开始学习按钮';

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
import { StudySessionController, StudySnapshot, StudyTimeboxNotice } from '../model/StudySessionController';
import { ReviewPreferences } from '../proto/messages/PreferencesMessages';
import { DialogFrame } from '../components/common/DialogFrame';
import { DialogHeader } from '../components/common/DialogHeader';
import { StudyOptions, StudyAdvanceAction, StudyAutoAdvanceSettings } from '../model/StudyTiming';
import { StudyAutoAdvanceDraft } from '../model/StudyAutoAdvanceDraft';
import { StudyAutoAdvanceDialog } from '../components/StudyAutoAdvanceDialog';
import { 调度器服务 } from '../backend/调度器服务';
import { 卡片渲染服务 } from '../backend/卡片渲染服务';
import { 集合服务 } from '../backend/集合服务';
import { 笔记服务 } from '../backend/笔记服务';
import { 笔记类型服务 } from '../backend/笔记类型服务';
import { EditableNote } from '../proto/messages/NoteMessages';
import { renderStudyAnswer, StudyAnswerNotetype } from '../model/StudyAnswerRenderer';
import { resolveStudyKey } from '../model/StudyInputPolicy';
import { buildStudyGestureScript, resolveStudyGesture, StudyGestureState, StudyQuickAnswerMode } from '../model/StudyGestures';
import { StudyTapZonesGuide } from '../components/StudyTapZonesGuide';
import { studyKeyName } from '../utils/StudyKeyAdapter';
import { CardViewport } from '../components/common/CardViewport';
import { CardActionMenu } from '../components/common/CardActionMenu';
import { DelayedLoadingIndicator } from '../components/common/DelayedLoadingIndicator';

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
import { CardWebView } from '../utils/CardWebView';
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
import { STUDY_QUICK_ANSWER_KEY, loadStudyQuickAnswerMode,
  isTapZonesGuideCompleted, completeTapZonesGuide } from '../model/实验性功能存储';
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

/** Web 只传意图与原始代次，页面再次检查当前会话和阻塞状态。 */
class StudyGestureProxy {
  handle: (action: string, nx: number, ny: number, version: number, surface: number) => void =
    (_action: string, _nx: number, _ny: number, _version: number, _surface: number): void => {};
  onAction(action: string, nx: number, ny: number, version: number, surface: number): void {
    this.handle(action, nx, ny, version, surface);
  }
}

@Component
export struct 学习页 {
  @StorageProp(DECK_LIST_NARROW_KEY) private narrowDeckLayout: boolean = false;
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
  private readonly cardWeb: CardWebView = new CardWebView(this.网页控制器,
    (): void => { this.studyCardShown(); }, (message: string): void => {
      if (!this.isCurrentRequest(this.requestVersion)) return;
      this.audioSession.stop();
      this.stopStudyTimers();
      this.阶段 = 'error';
      this.错误详情 = message;
    });
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
  @State private reviewPreferences: ReviewPreferences = new ReviewPreferences();
  @State private timeboxNotice: StudyTimeboxNotice | null = null;
  private timeboxOpenedAt: number = 0;
  @State private autoAdvanceEnabled: boolean = false;
  private readonly autoAdvanceSettings: StudyAutoAdvanceSettings = new StudyAutoAdvanceSettings();
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
  private autoAdvanceSettingsOpen: boolean = false;
  private autoAdvanceDialog: CustomDialogController | null = null;
  private autoAdvanceDialogBack: () => void = (): void => {};
  @State @Watch('publishInterface') private studyMenuOpen: boolean = false;
  private questionHasAudio: boolean = false;
  private 正面HTML: string = '';
  private 背面HTML: string = '';
  private 展示时刻毫秒: number = 0;
  @State @Watch('publishInterface') private 评分中: boolean = false;
  private 媒体目录: string = '';
  private studyGuideChecked: boolean = false;
  private studyGuideVisible: boolean = false;
  private interactionVersion: number = 0;
  private tapZonesGuideChecked: boolean = false;
  private tapZonesGuideStarted: number = 0;
  @State private tapZonesGuideVisible: boolean = false;
  @StorageLink(STUDY_QUICK_ANSWER_KEY) private quickAnswerMode: StudyQuickAnswerMode = StudyQuickAnswerMode.Off;

  private get gesturesEnabled(): boolean {
    return this.quickAnswerMode === StudyQuickAnswerMode.Gestures;
  }
  @State private editingPageOpen: boolean = false;
  private editStartedAt: number = 0;
  @State private 牌组ID: number = 0;
  @State private 牌组名: string = '';
  @State @Watch('publishInterface') private 阶段: 学习阶段 = 'loading';
  @State private 错误详情: string = '';
  @State private 按钮文案: string[] = [];
  @State @Watch('publishInterface') private 新卡剩余: number = 0;
  @State @Watch('publishInterface') private 学习中剩余: number = 0;
  @State @Watch('publishInterface') private 复习剩余: number = 0;
  @State @Watch('publishInterface') private 可撤销: boolean = false;
  @State @Watch('publishInterface') private 有音频: boolean = false;
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
  /** 保留当前界面模式；学习输入偏好不再受模式限制。 */
  @StorageLink(简洁模式AppStorage键) private 简洁模式: boolean = true;
  /** 四象限：题目面单击显示答案，答案面按分区评分。 */
  private get TapZones开关(): boolean {
    return this.quickAnswerMode === StudyQuickAnswerMode.TapZones;
  }
  @StorageLink(AI_AGENT_CHANNELS_APP_STORAGE_KEY) @Watch('publishInterface') private Agent入口已启用: boolean = false;
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
  @StorageLink('themeMode') private 主题模式值: 主题模式 = 'system';
  @StorageProp(颜色键.动作主色) private 动作主色: string = '#2F5FD0';
  @StorageProp(颜色键.动作主色按下) private 动作主色按下色: string = '#1E4FB8';
  // 2.1.4.1 对比度：按钮背景专用档（配 #FFFFFF 文字 ≥ 4.5:1）
  @StorageProp(颜色键.主色容器) private 主色容器色: string = '#E8EEFC';
  @StorageProp(PAGE_SURFACE_KEY) private 页面底色微染值: string = '#F5F7FA';
  // 状态栏高度（沉浸式全屏下，顶部条需让出状态栏区域，避免按钮叠在状态栏上）
  @StorageProp('状态栏高度') private 状态栏高度: number = 0;
  // 手势导航条高度（bottom 布局下答案条贴底，需抬高避让导航条）
  @StorageProp('导航条高度') private 导航条高度: number = 0;
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
  @State private 转场透明度: number = 1;

  async aboutToAppear(): Promise<void> {
    // 与浏览、统计共用转场协议；背景由首页根层持续持有。
    CustomTransition.getInstance().注册NavParam('StudyPage',
      (isPush: boolean, isExit: boolean): void => {
        this.转场透明度 = isExit ? 1 : 0;
      },
      (isPush: boolean, isExit: boolean): void => {
        this.转场透明度 = isExit ? 0 : 1;
      }
    );
    this.mounted = true;
    this.studySession.activate();
    this.牌组ID = this.pageDeckId === '' ? 0 : parseInt(this.pageDeckId);
    this.牌组名 = this.pageDeckName;
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
      await loadStudyQuickAnswerMode();
    } catch (error) {
      showToastSafely(this.getUIContext(), { message: $r('app.string.settings_study_controls_failed') });
    }
    if (this.mounted) { this.启动会话(); }
  }

  /** 暗色模式判断：主题模式值=system 时跟随系统，否则按显式选择。与 首页.ets 同语义。 */
  private 是否深色(): boolean {
    return 解析是否深色(this.主题模式值, this.系统暗黑模式);
  }

  aboutToDisappear(): void {
    this.mounted = false;
    appInterface.hidePage('study');
    appInterface.leave('study');
    appInterface.leave('study_more');
    this.studyMenuOpen = false;
    CustomTransition.getInstance().注销NavParam('StudyPage');
    this.studyTimer.dispose();
    this.studySession.dispose();
    this.页面已显示 = false;
    this.invalidateCardWork();
    this.clearChoiceAutoAdvance();
    this.待重渲染当前卡 = false;
    this.controllerReady = false;
    this.audioSession.release();
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
        this.maybeShowTapZonesGuide();
        return;
      }
    } catch (error) {
      hilog.warn(0x4342, '学习页', 'Study guide preference could not be loaded');
    }
    this.showStudyGuide();
  }

  /** 初次与手动重看共用教学；阅读期间不计入当前卡答题时长。 */
  private showStudyGuide(): void {
    if (this.studyGuideVisible || this.tapZonesGuideVisible || !this.页面已显示 || this.阶段 === 'loading' || this.评分中) {
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
      this.maybeShowTapZonesGuide();
      this.startStudyTimers();
      this.scheduleChoiceAutoAdvance();
    };
    this.getUIContext().showAlertDialog({
      title: $r('app.string.study_guide_title'),
      message: this.取文案($r('app.string.study_guide_message')) + '\n\n' +
        this.取文案($r('app.string.glossary_shortcuts_help')) + '\n\n' +
        this.取文案($r('app.string.study_gestures_help')) + '\n\n' +
        this.取文案($r('app.string.settings_tap_zones_hint')),
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

  private maybeShowTapZonesGuide(): void {
    if (this.tapZonesGuideChecked || !this.TapZones开关 || this.choiceQuestion !== null ||
      !this.isCurrentRequest(this.requestVersion) || !this.controllerReady || this.pendingHtml !== '' ||
      this.阶段 !== 'question' || this.评分中 || this.flipPending || this.studyGuideVisible ||
      this.studyMenuOpen || this.autoAdvanceSettingsOpen || this.editingPageOpen || this.手写模式) return;
    this.tapZonesGuideChecked = true;
    try {
      if (isTapZonesGuideCompleted()) return;
    } catch (error) {
      showToastSafely(this.getUIContext(), { message: $r('app.string.settings_study_controls_failed') });
    }
    this.tapZonesGuideVisible = true;
    this.tapZonesGuideStarted = Date.now();
    this.stopStudyTimers();
    this.clearChoiceAutoAdvance();
    this.Ctrl按下 = false;
  }

  private closeTapZonesGuide(confirm: boolean): void {
    if (!this.tapZonesGuideVisible) return;
    this.tapZonesGuideVisible = false;
    this.展示时刻毫秒 += Date.now() - this.tapZonesGuideStarted;
    // 教学结束前开始的触摸不能在结束后变成一次评分。
    this.interactionVersion++;
    this.studyCardShown();
    this.startStudyTimers();
    if (confirm) {
      completeTapZonesGuide().catch((error: Object): void => {
        showToastSafely(this.getUIContext(), { message: $r('app.string.study_guide_save_failed') });
      });
    }
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
      this.studyMenuOpen = false;
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
      this.reviewPreferences = snapshot.preferences;
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
        this.applyStudyHtml('<!DOCTYPE html><html><head></head><body><div id="qa"></div></body></html>');
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
      this.publishInterface();
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
    this.cardWeb.reset();
    this.stopStudyTimers();
    this.requestVersion += 1;
    this.autoAdvanceDialog?.close();
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
    this.publishInterface();
    if (!this.页面已显示 || !this.foreground) {
      this.timeboxNotice = null;
      this.stopStudyTimers();
      if (this.tapZonesGuideVisible) {
        this.tapZonesGuideVisible = false;
        this.tapZonesGuideChecked = false;
      }
      this.studyMenuOpen = false;
      this.clearChoiceAutoAdvance();
      this.autoAdvanceEnabled = false;
      if (!this.editingPageOpen) this.invalidateCardWork();
      this.Ctrl按下 = false;
      if (!this.editingPageOpen) this.待重渲染当前卡 = true;
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
    this.interactionVersion++;
    this.cardWeb.show(html, this.requestVersion, this.阶段, true);
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


  /** 每次卡面脚本和公式完成后安装幂等文档交互。 */
  private studyCardShown(): void {
    if (!this.isCurrentRequest(this.requestVersion)) return;
    this.maybeShowTapZonesGuide();
    try {
      this.网页控制器.runJavaScript(buildStudyGestureScript(this.requestVersion, this.interactionVersion,
        this.gesturesEnabled))
        .catch((error: Object): void => { console.info(`Study interaction: ${error}`); });
    } catch (error) {
      console.info(`Study interaction: ${error}`);
    }
  }

  /** 消费晚到的控制器；加载失败保持可见错误，不遗留可评分的空白卡面。 */
  private studyWebAttached(): void {
    if (!this.mounted) { return; }
    this.controllerReady = true;
    try {
      this.cardWeb.attach();
      if (this.pendingHtml === '') { return; }
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
      this.editingPageOpen || (this.阶段 !== 'question' && this.阶段 !== 'answer')) { return; }
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
    this.maybeShowTimebox();
    if (this.studyTimerState().active) this.studySession.resumeTimebox();
    else this.studySession.pauseTimebox();
    this.studyTimer.start();
  }

  private stopStudyTimers(): void {
    this.studySession.pauseTimebox();
    this.studyTimer.stop();
  }

  private maybeShowTimebox(): void {
    if (!this.mounted || !this.页面已显示 || !this.foreground || this.评分中 || this.editingPageOpen ||
      this.studyMenuOpen || this.studyGuideVisible || this.tapZonesGuideVisible || this.autoAdvanceSettingsOpen ||
      this.手写模式 || this.timeboxNotice !== null || this.阶段 === 'loading' || this.阶段 === 'error') return;
    const notice: StudyTimeboxNotice | null = this.studySession.pendingTimebox();
    if (notice === null) return;
    this.timeboxNotice = notice;
    this.timeboxOpenedAt = Date.now();
    this.Ctrl按下 = false;
    this.stopStudyTimers();
    this.clearChoiceAutoAdvance();
  }

  private closeTimebox(finish: boolean = false): void {
    if (this.timeboxNotice === null) return;
    this.timeboxNotice = null;
    this.studySession.continueTimebox();
    if (finish) { this.返回(); return; }
    this.展示时刻毫秒 += Date.now() - this.timeboxOpenedAt;
    if (this.choiceFeedbackDeadline > 0) this.choiceFeedbackDeadline += Date.now() - this.timeboxOpenedAt;
    this.startStudyTimers();
    this.scheduleChoiceAutoAdvance();
  }

  private clearChoiceAutoAdvance(): void {
    if (this.choiceAutoAdvanceTimer >= 0) clearTimeout(this.choiceAutoAdvanceTimer);
    this.choiceAutoAdvanceTimer = -1;
  }

  private scheduleChoiceAutoAdvance(): void {
    this.clearChoiceAutoAdvance();
    if (!this.页面已显示 || !this.foreground || this.studyGuideVisible || this.studyMenuOpen || this.评分中 ||
      this.editingPageOpen || this.手写模式 || this.autoAdvanceSettingsOpen || this.timeboxNotice !== null ||
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

  private configureAutoAdvance(): void {
    if (this.autoAdvanceSettingsOpen || this.评分中 || this.当前卡片 === null ||
      (this.阶段 !== 'question' && this.阶段 !== 'answer')) return;
    const version: number = this.requestVersion;
    const choice: boolean = this.choiceQuestion !== null;
    const openedAt: number = Date.now();
    const initialFeedbackSeconds: number = this.choiceAutoAdvanceSeconds();
    let feedbackTimeChanged: boolean = false;
    const draft: StudyAutoAdvanceDraft = new StudyAutoAdvanceDraft(
      this.autoAdvanceSettings.resolve(this.studyOptions), this.autoAdvanceEnabled, initialFeedbackSeconds);
    this.autoAdvanceSettingsOpen = true;
    this.stopStudyTimers();
    this.clearChoiceAutoAdvance();
    const finish: () => void = (): void => {
      if (!this.autoAdvanceSettingsOpen) return;
      this.autoAdvanceSettingsOpen = false;
      this.autoAdvanceDialog = null;
      this.autoAdvanceDialogBack = (): void => {};
      if (!this.isCurrentRequest(version)) return;
      if (choice && this.choiceFeedbackDeadline > 0) {
        this.choiceFeedbackDeadline = feedbackTimeChanged ? Date.now() + this.choiceAutoAdvanceSeconds() * 1000 :
          this.choiceFeedbackDeadline + Date.now() - openedAt;
      }
      this.startStudyTimers();
      this.scheduleChoiceAutoAdvance();
    };
    try {
      this.autoAdvanceDialog = new CustomDialogController({
        builder: StudyAutoAdvanceDialog({ draft: draft, choice: choice,
          registerBack: (back: () => void): void => { this.autoAdvanceDialogBack = back; },
          onConfirm: (result: StudyAutoAdvanceDraft): void => {
            if (!this.isCurrentRequest(version)) return;
            if (choice) {
              feedbackTimeChanged = result.feedbackSeconds !== initialFeedbackSeconds;
              this.choiceFeedbackSecondsOverride = result.feedbackSeconds;
              if (this.choiceGrade !== null && this.阶段 === 'answer' && feedbackTimeChanged) {
                this.choiceFeedbackDeadline = result.feedbackSeconds > 0 ? Date.now() + result.feedbackSeconds * 1000 : 0;
              }
            } else {
              result.apply(this.autoAdvanceSettings);
              this.autoAdvanceEnabled = result.enabled && result.canEnable();
            }
            this.studyTimer.restartAdvance();
          },
          onClose: finish }),
        autoCancel: false, customStyle: true, alignment: DialogAlignment.Center,
        onWillDismiss: (_action: DismissDialogAction): void => { this.autoAdvanceDialogBack(); }
      });
      this.autoAdvanceDialog.open();
    } catch (error) {
      console.error(`Auto advance dialog failed: ${error}`);
      finish();
    }
  }

  private 继续选择题反馈(): void {
    if (this.choiceGrade === null || this.阶段 !== 'answer' || this.评分中 || this.studyGuideVisible ||
      this.studyMenuOpen || this.autoAdvanceSettingsOpen || this.editingPageOpen || this.手写模式 || this.timeboxNotice !== null ||
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
      active: this.isCurrentRequest(this.requestVersion) && this.controllerReady && !this.studyMenuOpen && !this.autoAdvanceSettingsOpen && this.timeboxNotice === null &&
        !this.editingPageOpen && !this.studyGuideVisible && !this.tapZonesGuideVisible && !this.手写模式 && !this.评分中 &&
        (this.阶段 === 'question' || this.阶段 === 'answer'),
      advance: this.autoAdvanceEnabled,
      blocked: this.choiceQuestion !== null || this.评分中 || this.flipPending,
      audioPlaying: this.audioSession.isPlaying(), options: this.autoAdvanceSettings.resolve(this.studyOptions) };
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
      this.startStudyTimers();
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
  // 改为左侧只留「返回」，右侧「更多」按钮通过共享 CardActionMenu 弹出菜单：
  //   - 撤销（enabled = 可撤销）
  //   - 删除此卡（enabled = 阶段是 question/answer）
  // 牌组名 maxWidth 放大到 50%（左侧只剩返回按钮，避让空间充足）。
  //
  // @输入
  // 无（读取 可撤销 / 阶段 / 评分中）
  //
  // @输出
  // MenuElement[]：共享动作菜单数据源
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
    return this.interfaceMenuItems().map((item: AppInterfaceMenuItem): MenuElement => ({
      value: namedResourceText(this.getUIContext(), item.titleKey), enabled: item.enabled,
      action: (): void => { this.executeMenuAction(item.id); }
    }));
  }

  private interfaceMenuItems(): AppInterfaceMenuItem[] {
    return studyInterfaceMenu({ phase: this.阶段, busy: this.评分中, hasCard: this.当前卡片 !== null,
      hasAudio: this.有音频, canUndo: this.可撤销, agent: this.Agent入口已启用 });
  }

  private executeMenuAction(id: string): void {
    if (id === 'edit') this.openNoteEditor();
    else if (id === 'audio') this.playStudyAudio(true, true);
    else if (id === 'guide') this.showStudyGuide();
    else if (id === 'undo') this.撤销上次();
    else if (id === 'bury') this.埋藏或暂停当前卡(BURY_SUSPEND_MODE_BURY_USER);
    else if (id === 'suspend') this.埋藏或暂停当前卡(BURY_SUSPEND_MODE_SUSPEND);
    else if (id === 'delete') this.请求删除当前卡();
    else if (id === 'agent') this.打开AI改卡();
    else if (id === 'handwrite') { this.手写模式 = true; this.stopStudyTimers(); }
    else if (id === 'auto_advance') this.configureAutoAdvance();
  }

  private publishInterface(): void {
    if (!this.mounted) return;
    const controls: AppInterfaceControl[] = visibleInterfaceItems('study', { simple: this.简洁模式,
      agent: this.Agent入口已启用, cloudDeck: false, themeHasTextures: false })
      .filter((item: AppInterfaceItem): boolean => item.condition === undefined ||
        (item.condition === this.阶段 && this.choiceQuestion === null))
      .map((item: AppInterfaceItem): AppInterfaceControl => ({ id: item.id,
        title: namedResourceText(this.getUIContext(), item.titleKey), enabled: !this.评分中, selected: false }));
    appInterface.observe({ surface: 'study', sectionId: this.阶段, selectedId: String(this.当前卡片?.cardId ?? ''),
      optionIds: [], optionLabels: [], busy: this.评分中,
      items: controls,
      values: [{ id: 'deck', value: this.牌组名 }, { id: 'phase', value: this.阶段 },
        { id: 'new', value: String(this.新卡剩余) }, { id: 'learning', value: String(this.学习中剩余) },
        { id: 'review', value: String(this.复习剩余) }] });
    if (!this.studyMenuOpen || !this.页面已显示) { appInterface.leave('study_more'); return; }
    const items: AppInterfaceMenuItem[] = this.interfaceMenuItems();
    appInterface.observe({ surface: 'study_more', sectionId: this.阶段, selectedId: '', busy: this.评分中,
      optionIds: items.map((item: AppInterfaceMenuItem): string => item.id),
      optionLabels: items.map((item: AppInterfaceMenuItem): string => namedResourceText(this.getUIContext(), item.titleKey)),
      items: items.map((item: AppInterfaceMenuItem): AppInterfaceControl => ({ id: item.id,
        titleKey: item.titleKey,
        title: namedResourceText(this.getUIContext(), item.titleKey), enabled: item.enabled, selected: false })) });
  }

  private openStudyMenu(): void {
    if (this.tapZonesGuideVisible || this.timeboxNotice !== null) return;
    this.studyMenuOpen = true;
    this.Ctrl按下 = false;
    this.stopStudyTimers();
    this.clearChoiceAutoAdvance();
  }

  private closeStudyMenu(): void {
    if (!this.studyMenuOpen) return;
    this.studyMenuOpen = false;
    this.startStudyTimers();
    this.scheduleChoiceAutoAdvance();
  }

  private selectStudyMenu(item: MenuElement): void {
    if (!this.studyMenuOpen || item.enabled === false) return;
    this.studyMenuOpen = false;
    // 动作先建立编辑/引导/手写阻塞状态，再判断是否恢复计时。
    item.action?.();
    this.startStudyTimers();
    this.scheduleChoiceAutoAdvance();
  }

  /** 编辑页拥有草稿；学习页只冻结当前交互并在返回时恢复。 */
  private async openNoteEditor(): Promise<void> {
    if (this.评分中 || this.editingPageOpen || this.studyGuideVisible || this.当前卡片 === null ||
      (this.阶段 !== 'question' && this.阶段 !== 'answer') || !this.isCurrentRequest(this.requestVersion)) return;
    this.editStartedAt = Date.now();
    this.editingPageOpen = true;
    this.评分中 = true;
    this.Ctrl按下 = false;
    this.stopStudyTimers(); this.clearChoiceAutoAdvance(); this.audioSession.stop();
    this.requestVersion++;
    this.flipPending = false;
    const params: EditNotePageParams = { targetId: this.当前卡片.noteId, isNote: true };
    this.pathStack.pushPath({ name: 'EditNotePage', param: params });
  }

  private returnFromEditor(): void {
    if (!this.editingPageOpen) return;
    this.展示时刻毫秒 += Date.now() - this.editStartedAt;
    this.editingPageOpen = false;
    this.评分中 = false;
    this.Ctrl按下 = false;
    if (!this.待重渲染当前卡) { this.playStudyAudio(false); this.startStudyTimers(); }
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
      !this.页面已显示 || this.contentRefreshInFlight || this.评分中 || this.editingPageOpen ||
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
      this.startStudyTimers();
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
        this.startStudyTimers();
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
        this.startStudyTimers();
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
        this.startStudyTimers();
      }
    }
  }

  /** 翻面只提交当前请求结果；拼写请求期间切卡会使本次结果失效。 */
  private async 显示答案(): Promise<void> {
    if (this.timeboxNotice !== null) return;
    if (this.editingPageOpen || this.studyGuideVisible || this.tapZonesGuideVisible || this.flipPending ||
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
    if (this.timeboxNotice !== null) return;
    if (this.choiceQuestion === null || this.choiceGrade !== null || this.choiceSelectedIds.length === 0 ||
      this.阶段 !== 'question' || this.studyGuideVisible || this.editingPageOpen ||
      this.当前卡片 === null || this.评分中 || !this.isCurrentRequest(this.requestVersion)) return;
    const version: number = this.requestVersion;
    const question: JideChoiceQuestion = this.choiceQuestion;
    const card: StudyCard = this.当前卡片;
    const grade: JideChoiceGrade = gradeJideChoice(this.choiceSelectedIds, question.answer);
    this.choiceGrade = grade;
    this.评分中 = true;
    this.stopStudyTimers();
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
      this.startStudyTimers();
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
            .attributeModifier(new PressFeedback())
            .stateEffect(false)
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
            .attributeModifier(new PressFeedback())
            .stateEffect(false)
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
    .attributeModifier(new PressFeedback())
    .stateEffect(false)
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

  private handleStudyGesture(action: string, nx: number, ny: number, version: number, surface: number): void {
    if (!this.isCurrentRequest(version) || surface !== this.interactionVersion) return;
    const state: StudyGestureState = {
      phase: this.阶段, gestures: this.gesturesEnabled, tapZones: this.TapZones开关,
      choice: this.choiceQuestion !== null,
      blocked: this.studyGuideVisible || this.tapZonesGuideVisible || this.studyMenuOpen || this.timeboxNotice !== null ||
        this.autoAdvanceSettingsOpen || this.editingPageOpen || this.手写模式 || this.评分中 ||
        this.flipPending || this.contentRefreshInFlight || !this.controllerReady || this.pendingHtml !== ''
    };
    switch (resolveStudyGesture(action, state, nx, ny)) {
      case 'flip': this.显示答案(); break;
      case 'again': this.评分(RATING_AGAIN); break;
      case 'hard': this.评分(RATING_HARD); break;
      case 'good': this.评分(RATING_GOOD); break;
      case 'easy': this.评分(RATING_EASY); break;
      case 'continue': this.继续选择题反馈(); break;
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
    if (this.timeboxNotice !== null) return;
    if (this.studyGuideVisible || this.tapZonesGuideVisible) { return; }
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
      this.startStudyTimers();
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
    if (!this.reviewPreferences.showIntervals) return '';
    if (index < this.按钮文案.length && this.按钮文案[index].length > 0) {
      return this.按钮文案[index];
    }
    return '';
  }

  private 返回(): void {
    if (this.timeboxNotice !== null) { this.closeTimebox(); return; }
    if (this.tapZonesGuideVisible) { this.closeTapZonesGuide(false); return; }
    if (this.editingPageOpen) return;
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
    if (this.timeboxNotice !== null) {
      this.Ctrl按下 = false;
      if (event.type === KeyType.Down && studyKeyName(event.keyCode) === 'escape') this.closeTimebox();
      return true;
    }
    if (this.tapZonesGuideVisible) {
      this.Ctrl按下 = false;
      if (event.type === KeyType.Down && studyKeyName(event.keyCode) === 'escape') this.closeTapZonesGuide(false);
      return true;
    }
    if (this.studyMenuOpen) {
      this.Ctrl按下 = false;
      if (event.type === KeyType.Down && studyKeyName(event.keyCode) === 'escape') this.closeStudyMenu();
      return true;
    }
    const result = resolveStudyKey(studyKeyName(event.keyCode), event.type === KeyType.Down,
      this.Ctrl按下, this.阶段, this.editingPageOpen,
      this.studyGuideVisible || this.autoAdvanceSettingsOpen);
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

        if (this.reviewPreferences.showRemaining) {
          Text($r('app.string.study_remaining_detail', this.新卡剩余, this.学习中剩余, this.复习剩余))
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_secondary'))
          .margin({ top: 2 })
        }
      }
      .justifyContent(FlexAlign.Center)
      .alignItems(HorizontalAlign.Center)
      .hitTestBehavior(HitTestMode.None)

      // 顶层：所有按钮放同一 Row，用 Blank() 撑开左右——
      // 不再分左右两个 width('100%') Row 叠层（之前 hitTestBehavior Transparent 仍被遮挡），
      // 单层 Row 内按钮天然不重叠，Blank() 占位区无 onClick 不消费触摸。
      // 2026-07-28：撤销与删除合并到右侧「更多」按钮（共享菜单），左侧只留返回，
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

        // 右侧：更多（共享菜单展示学习动作）
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
          .attributeModifier(new PressFeedback())
          .stateEffect(false)
          .onClick((): void => { this.openStudyMenu(); })
      }
      .width('100%')
      .height('100%')
      .alignItems(VerticalAlign.Center)
    }
    .width('100%')
    .height(应用尺寸.pageToolbarHeight(this.状态栏高度, this.narrowDeckLayout))
    .padding({
      left: 应用尺寸.页面内边距_水平,
      right: 应用尺寸.页面内边距_水平,
      top: 应用尺寸.pageToolbarTop(this.状态栏高度, this.narrowDeckLayout),
      bottom: 0
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
        // 后续加载（下一张卡）没有 src 竞争所以正常显示，正好解释
        // "首卡不显示，点击显示答案或埋藏取消埋藏后能恢复"的现象。
        // 改为空字符串避免自动加载；loadData 的 baseUrl 仍是 媒体基地址，
        // 相对路径资源解析与 onInterceptRequest 媒体拦截不受影响。
        Web({ src: '', controller: this.网页控制器 })
        .backgroundColor($r('app.color.surface_card'))
        .textZoomRatio(this.cardTextSizePercent)
        .javaScriptAccess(true)
        .fileAccess(true)
        .domStorageAccess(true)
        // focusable(false)：Web 不抢键盘焦点，让根 Stack 的 onKeyPreIme 稳定接管所有物理键盘事件。
        // 卡片 HTML 的触摸/点击交互不受影响（ArkWeb 内部走 onTouch，不依赖组件焦点）。
        .focusable(false)
        // 同一代理接收手势与四象限，携带原文档/卡面代次。
        .onControllerAttached(() => {
          const proxy: StudyGestureProxy = new StudyGestureProxy();
          proxy.handle = (action: string, nx: number, ny: number, version: number, surface: number): void => {
            this.handleStudyGesture(action, nx, ny, version, surface);
          };
          this.网页控制器.registerJavaScriptProxy(proxy, 'jideStudyInput', ['onAction']);
          this.studyWebAttached();
        })
        .onInterceptRequest((event: OnInterceptRequestEvent): WebResourceResponse | null => {
          return interceptCardAsset(event.request.getRequestUrl()) ?? this.拦截媒体(event);
        })
        .width('100%')
        .height(this.choiceQuestion === null ? '100%' : '42%')
        .align(Alignment.TopStart)
        // 保留控制器供撤销/恢复埋藏复用；加载、完成及错误态均不透出旧卡。
        .visibility(this.阶段 === 'question' || this.阶段 === 'answer' ? Visibility.Visible : Visibility.Hidden)

        this.选择题区()

      // 学习手势与四象限只在 Web 内识别；教学覆盖层仅展示，不提交评分。
      // 点击判定在卡片 Web 内部完成（卡面完成回调注入的 click 监听 + javaScriptProxy 回调），
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

      if (this.阶段 === 'loading') {
        Column({ space: 应用尺寸.间距_8 }) {
          DelayedLoadingIndicator({ tint: this.动作主色 })
        }
        .width('100%')
        .height('100%')
        .justifyContent(FlexAlign.Center)
        .backgroundColor($r('app.color.surface_card'))
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
            .attributeModifier(new PressFeedback())
            .stateEffect(false)
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
                .attributeModifier(new PressFeedback())
                .stateEffect(false)
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
      if (this.tapZonesGuideVisible) {
        StudyTapZonesGuide({ onConfirm: (): void => { this.closeTapZonesGuide(true); } })
          .width('100%').height('100%')
      }
      }
      .width('100%')
      .layoutWeight(1)
      .alignContent(Alignment.BottomEnd)
      .backgroundColor($r('app.color.surface_card'))
      .borderRadius(应用尺寸.圆角_卡片)
      .clip(true)
      .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })

      // Type-in-the-Answer：正面阶段在 Web 下方渲染输入框，翻面后比对用户输入与笔记字段值。
      // Enter 提交翻面（对齐 Anki 桌面端输入框回车显示答案）。
      // 左右边距由卡片区唯一提供，与答案条对齐；输入控件复用主操作的圆角和底色。
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
              .fontColor($r('app.color.text_primary'))
              .placeholderColor($r('app.color.text_tertiary'))
              .padding({ left: 应用尺寸.卡片内边距, right: 应用尺寸.卡片内边距 })
              .borderRadius(应用尺寸.圆角_行动按钮)
              .border({ width: 0 })
              .backgroundColor($r('app.color.surface_card'))
              // 聚焦视觉完全去主题色，三层处理：局部主题色、组件状态样式、系统焦点框。
              .stateStyles({
                focused: {
                  .border({ width: 0 })
                  .backgroundColor($r('app.color.surface_card'))
                },
                normal: {
                  .border({ width: 0 })
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
          top: 应用尺寸.操作区顶部间距(this.narrowDeckLayout),
          bottom: this.学习布局模式值 === 'float' ? 应用尺寸.页面内边距_水平 + this.导航条高度 : 0
        })
        // 留白透出页面底色，避免输入控件外出现矩形白底。
        .backgroundColor(Color.Transparent)
      }
    }
    .width('100%')
    .layoutWeight(1)
    .padding({
      top: 应用尺寸.页面内容顶部间距(this.narrowDeckLayout),
      left: 应用尺寸.页面内边距_水平,
      right: 应用尺寸.页面内边距_水平,
      // bottom 模式的答案条自己贡献唯一的上方区块间距，避免卡片区再叠一层。
      bottom: this.学习布局模式值 === 'bottom' ? 0 : 应用尺寸.页面分组间距(this.narrowDeckLayout)
    })
    // 幻彩时 PAGE_SURFACE_KEY 为透明，让卡片四周显示已有根背景。
    .backgroundColor(this.页面底色微染值)
  }

  @Builder
  private 答案条() {
    Column() {
      // 非学习阶段也占据同样的按钮高度，避免首帧和完成页撑大卡片。
      if ((this.阶段 === 'question' && this.choiceQuestion === null) ||
        this.阶段 === 'loading' || this.阶段 === 'done' || this.阶段 === 'error') {
        开始学习按钮({
          文案: $r('app.string.study_show_answer'),
          isAvailable: this.阶段 === 'question',
          开始学习回调: (): void => { this.显示答案(); }
        })
      }
      if (this.阶段 === 'answer' && this.choiceQuestion === null) {
        Row({ space: 应用尺寸.间距_8 }) {
          StudyActionButton({
            label: $r('app.string.rating_again'),
            subtitle: this.按钮文案位(RATING_AGAIN),
            labelColor: $r('app.color.study_again_text'),
            fillColor: $r('app.color.study_again_background'),
            onActivate: (): void => {
              this.评分(RATING_AGAIN);
            }
          })
          StudyActionButton({
            label: $r('app.string.rating_hard'),
            subtitle: this.按钮文案位(RATING_HARD),
            labelColor: $r('app.color.study_hard_text'),
            fillColor: $r('app.color.study_hard_background'),
            onActivate: (): void => {
              this.评分(RATING_HARD);
            }
          })
          StudyActionButton({
            label: $r('app.string.rating_good'),
            subtitle: this.按钮文案位(RATING_GOOD),
            labelColor: $r('app.color.study_good_text'),
            fillColor: $r('app.color.study_good_background'),
            onActivate: (): void => {
              this.评分(RATING_GOOD);
            }
          })
          StudyActionButton({
            label: $r('app.string.rating_easy'),
            subtitle: this.按钮文案位(RATING_EASY),
            labelColor: $r('app.color.study_easy_text'),
            fillColor: $r('app.color.study_easy_background'),
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
      top: 应用尺寸.操作区顶部间距(this.narrowDeckLayout),
      // 抬高避让手势导航条（AppGallery 导航栏适配要求）
      bottom: 应用尺寸.操作区底部间距(this.narrowDeckLayout, this.导航条高度)
    })
    .backgroundColor(this.页面底色微染值)
  }

  @Builder
  private cardViewportContent() {
    Column() {
      this.顶部条()
      this.卡片区()
      if (this.学习布局模式值 === 'bottom') {
        this.答案条()
      }
    }
    .width('100%')
    .height('100%')
  }

  build() {
    NavDestination() {
      // 外层 Stack：浮层工具栏用 position 绝对定位，需要全屏父容器；底层是限宽居中的内容列。
      // bottom 模式下 答案条 在内容列内，与原体验一致；float 模式下 答案条 不渲染，答案与评分浮动工具栏叠加在 Stack 上层。
      Stack() {
        CardViewport({ content: () => { this.cardViewportContent(); } })
        .width('100%')
        .height('100%')
        .backgroundColor(Color.Transparent)

        if (this.学习布局模式值 === 'float') {
          // 主操作浮动工具栏：question 阶段显示「显示答案」，answer 阶段切换为 4 个评分按钮。
          if (this.choiceQuestion === null) 学习浮动工具栏({
            当前阶段: this.阶段,
            评分按钮文案: this.reviewPreferences.showIntervals ? this.按钮文案 : [],
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
        if (this.studyMenuOpen) {
          CardActionMenu({ items: this.更多菜单(),
            onClose: (): void => { this.closeStudyMenu(); },
            onSelect: (item: MenuElement): void => { this.selectStudyMenu(item); } })
        }

        if (this.timeboxNotice !== null) {
          DialogFrame({ onDismiss: (): void => { this.closeTimebox(); },
            header: () => { this.timeboxHeader(); },
            content: () => { this.timeboxContent(); } })
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
    .opacity(this.转场透明度)
    .onBackPressed((): boolean => {
      if (this.timeboxNotice !== null) { this.closeTimebox(); return true; }
      if (this.tapZonesGuideVisible) { this.closeTapZonesGuide(false); return true; }
      if (this.studyMenuOpen) { this.closeStudyMenu(); return true; }
      return false;
    })
    // 从任何编辑/设置页返回都重新读取卡面。onPageShow 只对 @Entry 路由页生效，
    // NavDestination 必须用 onShown（与 学习提醒页 同款）；这是比 onPop 可靠的通道。
    .onShown((): void => {
      appInterface.showPage('study');
      this.页面已显示 = true;
      this.returnFromEditor();
      this.studyActivityChanged();
      this.maybeShowStudyGuide();
      this.publishInterface();
    })
    .onHidden((): void => {
      appInterface.hidePage('study');
      this.页面已显示 = false;
      this.studyActivityChanged();
      this.publishInterface();
    })
  }

  @Builder
  private timeboxHeader() {
    DialogHeader({ title: $r('app.string.study_timebox_title'),
      closeLabel: $r('app.string.study_timebox_finish'), actionLabel: $r('app.string.continue'),
      onClose: (): void => { this.closeTimebox(true); },
      onAction: (): void => { this.closeTimebox(); } })
  }

  @Builder
  private timeboxContent() {
    Text($r('app.string.study_timebox_message', Math.floor((this.timeboxNotice?.seconds ?? 0) / 60),
      this.timeboxNotice?.answers ?? 0))
      .fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_primary')).width('100%')
  }
}
