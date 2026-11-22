// SPDX-License-Identifier: AGPL-3.0-or-later
import { LEADERBOARD_PREVIEW_KEY } from '../model/StudyLeaderboard';
import { initializeLeaderboardVisibility } from '../model/LeaderboardVisibility';
import { externalMcpService } from '../backend/external-agent/ExternalMcpService';
import { showToastSafely } from '../utils/UiFeedback';
import { initializeHomeLayout } from '../utils/HomeLayoutStore';
import { CONTINUATION_MIN_VERSION, CONTINUATION_PARAM, CONTINUATION_MAX_CHARS, continuationSession } from '../model/ContinuationSession';
import { wantConstant } from '@kit.AbilityKit';
import { initializeEditorWheelPreferences } from '../utils/EditorWheelPreferencesStore';
import { HIDDEN_WINDOW_TITLE_BAR, WINDOW_KEYBOARD_TOP_KEY, WINDOW_TITLE_BAR_LAYOUT_KEY, WINDOW_PINNED_KEY, WindowTitleBarLayout } from '../model/WindowSafeLayout';

import { APP_FOREGROUND_KEY } from '../model/AppLifecycleState';
import { setStudyPenKitContext, clearStudyPenKitContext } from '../backend/StudyPenKitContext';
import { resolveAppLocale } from '../model/AppLocales';
import {
  AbilityConstant,
  common,
  Configuration,
  UIAbility,
  Want
} from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { startInstallationUsage, stopInstallationUsage } from '../backend/InstallationRegistration';
import { window } from '@kit.ArkUI';
import { i18n } from '@kit.LocalizationKit';
import { BusinessError, deviceInfo } from '@kit.BasicServicesKit';
import { backgroundTaskManager } from '@kit.BackgroundTasksKit';
import { 应用系统栏样式, readSystemDarkMode } from '../utils/主题控制器';
import { 应用颜色主题 } from '../utils/颜色主题管理器';
import { 颜色主题, 默认颜色主题, 规范化颜色主题 } from '../model/颜色主题';
import { 刷新桌面卡片数据 } from '../model/FSRS控制器';
import { 刷新学习提醒 } from '../model/学习提醒服务';
import { AI_AGENT_CHANNELS_APP_STORAGE_KEY, initializeAiAgentChannels } from '../model/ReleaseFeatures';
import { initializeCardTextSize } from '../utils/CardTextSizeStore';
import { initializeDeckListAppearance } from '../utils/DeckListAppearanceStore';
import { DESKTOP_HOME_LAYOUT_KEY } from '../model/DeckListAppearance';
import { initializeSurfaceMaterial } from '../utils/SurfaceMaterialStore';
import { initializeMotionStyle } from '../utils/MotionStyleStore';
import { initializeStudyHaptics } from '../utils/StudyHaptics';
import { initializeStudyAnswerButtons } from '../utils/StudyAnswerButtons';
import { initializeSimpleMode } from '../model/简洁模式存储';
import { syncActivity } from '../model/SyncSettings';
import { externalDeckUri, externalDeckOpens, EXTERNAL_DECK_OPEN_REVISION_KEY } from '../model/ExternalDeckOpen';
import { windowSafeInsets, WINDOW_SAFE_TOP_KEY, WINDOW_SAFE_BOTTOM_KEY, WINDOW_SAFE_LEFT_KEY,
  WINDOW_SAFE_RIGHT_KEY, WINDOW_HEIGHT_KEY, WINDOW_SIZE_KEY, WindowSizeVp } from '../model/WindowSafeLayout';
import { APP_LOG_DOMAIN, installHilogLogSink } from '../utils/HilogLogSink';

const DOMAIN: number = APP_LOG_DOMAIN;

export default class EntryAbility extends UIAbility {
  /** 主窗口引用：规避区高度同步用（onWindowStageCreate 时赋值） */
  private 主窗口?: window.Window;
  private desktopTitleBarActive: boolean = false;
  private readonly desktopWindow: boolean = deviceInfo.deviceType === 'pc' || deviceInfo.deviceType === '2in1';
  private readonly titleButtonsChanged: (rect: window.TitleButtonRect) => void =
    (rect: window.TitleButtonRect): void => {
      if (this.desktopTitleBarActive && this.主窗口 !== undefined && rect.width > 0 && rect.height > 0) {
        this.publishDesktopTitleBar(this.主窗口, rect);
      }
    };
  private windowLayoutTail: Promise<void> = Promise.resolve();
  private readonly windowStatusChanged: (status: window.WindowStatusType) => void = (status: window.WindowStatusType): void => {
    hilog.info(DOMAIN, 'jidecards', 'Window status changed: %{public}d', status);
    this.syncWindowLayout();
    if (this.desktopWindow) this.syncDesktopTitleBar();
  };

  /** 只跟随系统窗口模式调整内容布局，不调用最大化、最小化或窗口模式切换。 */
  private syncWindowLayout(): void {
    const target: window.Window | undefined = this.主窗口;
    if (target === undefined) return;
    this.windowLayoutTail = this.windowLayoutTail.then(async (): Promise<void> => {
      if (target !== this.主窗口) return;
      const status: window.WindowStatusType = target.getWindowStatus();
      if (status === window.WindowStatusType.UNDEFINED || status === window.WindowStatusType.MINIMIZE) return;
      // 半屏/悬浮窗保留系统标题栏与手势边界，不能沿用整屏启动时的沉浸布局。
      await target.setWindowLayoutFullScreen(status === window.WindowStatusType.FULL_SCREEN);
      if (target === this.主窗口) this.同步规避区高度();
    }).catch((error: Error): void => {
      hilog.warn(DOMAIN, 'jidecards', 'Window layout sync failed: %{public}s', error.message);
    });
  }

  private syncDesktopTitleBar(): void {
    const target: window.Window | undefined = this.主窗口;
    if (!this.desktopWindow || target === undefined) return;
    try {
      const status: window.WindowStatusType = target.getWindowStatus();
      if (status === window.WindowStatusType.MINIMIZE) return;
      const freeform: boolean = deviceInfo.sdkApiVersion < 22 || target.isInFreeWindowMode();
      if (!freeform || (status !== window.WindowStatusType.FLOATING && status !== window.WindowStatusType.MAXIMIZE)) {
        if (this.desktopTitleBarActive) {
          target.setWindowDecorVisible(true);
          this.desktopTitleBarActive = false;
          AppStorage.setOrCreate<WindowTitleBarLayout>(WINDOW_TITLE_BAR_LAYOUT_KEY, HIDDEN_WINDOW_TITLE_BAR);
        }
        return;
      }

      const rect: window.TitleButtonRect = target.getTitleButtonRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      if (!this.desktopTitleBarActive) {
        target.setWindowDecorVisible(false);
        this.desktopTitleBarActive = true;
      }
      this.publishDesktopTitleBar(target, rect);
    } catch (error) {
      hilog.warn(DOMAIN, 'jidecards', 'Desktop window title bar sync failed');
    }
  }

  private publishDesktopTitleBar(target: window.Window, rect: window.TitleButtonRect): void {
    let height: number = rect.top + rect.height;
    try { height = Math.max(height, target.getWindowDecorHeight()); }
    catch { /* The system controls still define the required minimum height. */ }
    const layout: WindowTitleBarLayout = { height: height, controlsWidth: rect.width,
      controlsTop: rect.top, controlsHeight: rect.height };
    const previous: WindowTitleBarLayout | undefined = AppStorage.get<WindowTitleBarLayout>(WINDOW_TITLE_BAR_LAYOUT_KEY);
    if (previous?.height !== layout.height || previous?.controlsWidth !== layout.controlsWidth ||
      previous?.controlsTop !== layout.controlsTop || previous?.controlsHeight !== layout.controlsHeight) {
      AppStorage.setOrCreate<WindowTitleBarLayout>(WINDOW_TITLE_BAR_LAYOUT_KEY, layout);
    }
  }

  private publishSystemDarkMode(isDark: boolean): void {
    AppStorage.setOrCreate<boolean>('systemDarkMode', isDark);
  }

  private refreshSystemDarkMode(): void {
    try {
      this.publishSystemDarkMode(readSystemDarkMode());
    } catch (error) {
      // 暂时读取失败保留已知状态，避免返回前台时闪成浅色。
      this.publishSystemDarkMode(AppStorage.get<boolean>('systemDarkMode') ?? false);
    }
  }

  private effectiveDarkMode(): boolean {
    const systemDark: boolean = AppStorage.get<boolean>('systemDarkMode') ?? false;
    const themeMode: string = AppStorage.get<string>('themeMode') ?? 'system';
    if (themeMode === 'dark') {
      return true;
    }
    if (themeMode === 'light') {
      return false;
    }
    return systemDark;
  }

  /** 系统事件与回前台使用应用最终模式，避免显式浅色页面拿到深色色板。 */
  private refreshThemeColors(): void {
    const storedTheme: string | undefined = AppStorage.get<string>('colorTheme');
    const theme: 颜色主题 = storedTheme === undefined ? 默认颜色主题 : 规范化颜色主题(storedTheme);
    const isDark: boolean = this.effectiveDarkMode();
    应用颜色主题(theme, isDark);
  }

  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    installHilogLogSink();
    AppStorage.setOrCreate<boolean>(LEADERBOARD_PREVIEW_KEY, this.context.applicationInfo.debug &&
      want.parameters?.['jideLeaderboardPreview'] === true);
    AppStorage.setOrCreate<boolean>('analyticsTestSource', this.context.applicationInfo.debug &&
      want.parameters?.['jideAnalyticsTest'] === true);
    continuationSession.setListener((): void => { this.updateContinuationState(); });
    setStudyPenKitContext(this.context);
    AppStorage.setOrCreate<common.UIAbilityContext>('abilityContext', this.context);
    externalMcpService.restore(this.context.abilityInfo.bundleName);
    initializeSimpleMode();
    initializeLeaderboardVisibility(this.context);
    initializeCardTextSize();
    AppStorage.setOrCreate<boolean>(DESKTOP_HOME_LAYOUT_KEY, this.desktopWindow);
    initializeDeckListAppearance();
    initializeHomeLayout();
    initializeSurfaceMaterial();
    initializeMotionStyle();
    initializeEditorWheelPreferences();
    initializeStudyHaptics();
    initializeStudyAnswerButtons();
    AppStorage.setOrCreate<boolean>(AI_AGENT_CHANNELS_APP_STORAGE_KEY, false);
    initializeAiAgentChannels().catch((_error: Object): void => {
      // 读取失败保持入口隐藏。
    });
    this.refreshSystemDarkMode();
    // 存系统语言供纯函数层做本地化（如默认牌组名）
    try {
      const 语言: string = i18n.System.getAppPreferredLanguage();
      AppStorage.setOrCreate<string>('系统语言', resolveAppLocale(语言));
    } catch (_e) {
      AppStorage.setOrCreate<string>('系统语言', 'zh-Hans');
    }
    // DeepLink 跳转：桌面卡片点击 → jidecards://stats → 写 AppStorage 信号让首页 aboutToAppear 跳统计页
    if (this.receiveContinuation(want, launchParam)) return;
    this.处理DeepLink(want);
    this.receiveExternalDeck(want);
    hilog.info(DOMAIN, 'jidecards', 'Application created');
  }

  onNewWant(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    if (this.receiveContinuation(want, launchParam)) return;
    // App 已在后台时，桌面卡片点击 → jidecards://stats → 写 AppStorage 信号让首页监听回调跳统计页
    this.处理DeepLink(want);
    this.receiveExternalDeck(want);
  }

  private continuationNotice: string = '';
  private lastContinuationState: boolean | null = null;
  private continuationStateTail: Promise<void> = Promise.resolve();
  private updateContinuationState(): void {
    this.continuationStateTail = this.continuationStateTail.then(async (): Promise<void> => {
      const active: boolean = continuationSession.capture() !== null;
      if (active === this.lastContinuationState) return;
      await this.context.setMissionContinueState(active ? AbilityConstant.ContinueState.ACTIVE : AbilityConstant.ContinueState.INACTIVE);
      this.lastContinuationState = active;
    }).catch((error: Error): void => {
      hilog.warn(DOMAIN, 'jidecards', 'Continuation state update failed: %{public}s', error.message);
    });
  }

  private continuationToast(key: string): void {
    try {
      showToastSafely(this.context.windowStage.getMainWindowSync().getUIContext(), {
        message: this.context.resourceManager.getStringByNameSync(key)
      });
    } catch (error) { hilog.warn(DOMAIN, 'jidecards', 'Unable to display continuation message'); }
  }

  onContinue(wantParam: Record<string, Object>): AbilityConstant.OnContinueResult {
    try {
      if (typeof wantParam.version !== 'number' || wantParam.version < CONTINUATION_MIN_VERSION) {
        this.continuationToast('continuation_invalid');
        return AbilityConstant.OnContinueResult.MISMATCH;
      }
      const payload = continuationSession.capture();
      if (payload === null || syncActivity.isCollectionBusy()) {
        this.continuationToast('continuation_busy');
        return AbilityConstant.OnContinueResult.REJECT;
      }
      const text: string = JSON.stringify(payload);
      if (text.length > CONTINUATION_MAX_CHARS) throw new Error('continuation_invalid');
      wantParam[CONTINUATION_PARAM] = text;
      wantParam[wantConstant.Params.SUPPORT_CONTINUE_PAGE_STACK_KEY] = false;
      wantParam[wantConstant.Params.SUPPORT_CONTINUE_SOURCE_EXIT_KEY] = false;
      return AbilityConstant.OnContinueResult.AGREE;
    } catch (error) {
      this.continuationToast('continuation_invalid');
      return AbilityConstant.OnContinueResult.REJECT;
    }
  }

  private receiveContinuation(want: Want, launchParam: AbilityConstant.LaunchParam): boolean {
    if (launchParam.launchReason !== AbilityConstant.LaunchReason.CONTINUATION) return false;
    let accepted: boolean = false;
    try {
      const text = want.parameters?.[CONTINUATION_PARAM];
      if (typeof text !== 'string') throw new Error('continuation_invalid');
      if (!continuationSession.receive(text)) return true;
      accepted = true;
      this.context.restoreWindowStage(new LocalStorage());
      this.updateContinuationState();
    } catch (error) {
      if (accepted) continuationSession.discard();
      const busy: boolean = error instanceof Error && error.message === 'continuation_busy';
      this.continuationToast(busy ? 'continuation_busy' : 'continuation_invalid');
      if (this.主窗口 === undefined) {
        this.continuationNotice = busy ? 'continuation_busy' : 'continuation_invalid';
        try { this.context.restoreWindowStage(new LocalStorage()); }
        catch (restoreError) { hilog.error(DOMAIN, 'jidecards', 'Continuation fallback window restore failed'); }
      }
      hilog.warn(DOMAIN, 'jidecards', 'Continuation receive failed');
    }
    return true;
  }

  onWindowStageRestore(windowStage: window.WindowStage): void {
    // Navigation 状态由根宿主恢复；窗口初始化与普通启动共用同一个入口。
    this.onWindowStageDestroy();
    this.onWindowStageCreate(windowStage);
  }

  /** 冷热启动共用入口，先保留文件，再通知首页安全导入。 */
  private receiveExternalDeck(want: Want): void {
    const uri: string | null = externalDeckUri(want.action ?? '', want.uri ?? '', want.type ?? '');
    if (uri === null || !externalDeckOpens.enqueue(uri)) return;
    const revision: number = AppStorage.get<number>(EXTERNAL_DECK_OPEN_REVISION_KEY) ?? 0;
    AppStorage.setOrCreate<number>(EXTERNAL_DECK_OPEN_REVISION_KEY, revision + 1);
  }

  // ========================================================
  // @名称 处理DeepLink
  // @作用 解析 want.uri，若是 jidecards://stats 写 AppStorage 信号 'navigateToStats'
  //       首页 @StorageLink 监听此键变化触发跳转统计页
  // ========================================================
  private 处理DeepLink(want: Want): void {
    const uri: string | undefined = want.uri;
    if (uri === undefined || uri === '') {
      return;
    }
    if (uri === 'jidecards://stats') {
      // 用时间戳作为信号值，确保即使连续两次相同 uri 也能触发 @StorageLink 变化
      AppStorage.setOrCreate<number>('navigateToStats', Date.now());
    }
  }

  onConfigurationUpdate(configuration: Configuration): void {
    // 通知可能来自应用强制模式或语言变更，始终读取设备实际主题。
    this.refreshSystemDarkMode();
    // 系统语言变化时同步刷新 AppStorage，否则组件读到的还是上次启动时的旧值，
    // 主页摘要卡、桌面卡片注入的语言字段全部不会跟随系统切换。
    // 应用语言优先，不能让主题通知中的系统 language 覆盖应用偏好。
    try {
      const 语言: string = i18n.System.getAppPreferredLanguage();
      AppStorage.setOrCreate<string>('系统语言', resolveAppLocale(语言));
    } catch (_e) {
      // 读取失败保留旧值，不阻塞其他配置更新流程
    }
    this.refreshThemeColors();
    // 系统深浅色变化时桌面卡片也需刷新（卡片在独立进程，无法感知 AppStorage 变化）
    刷新桌面卡片数据().catch((错误: Object): void => {
      hilog.error(DOMAIN, 'jidecards', `系统主题变化后刷新桌面卡片数据失败: ${错误}`);
    });
  }

  private retryLoadContent(windowStage: window.WindowStage, remainingAttempts: number): void {
    if (remainingAttempts <= 0) {
      hilog.fatal(DOMAIN, 'jidecards', 'Main page failed to load after retry; giving up');
      return;
    }
    setTimeout(() => {
      windowStage.loadContent('pages/首页', (error: BusinessError) => {
        if (error.code) {
          hilog.error(DOMAIN, 'jidecards', 'Retry failed to load main page: %{public}d', error.code);
          this.retryLoadContent(windowStage, remainingAttempts - 1);
          return;
        }
        应用系统栏样式(this.context, this.effectiveDarkMode());
      });
    }, 1000);
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    windowStage.loadContent('pages/首页', (error: BusinessError) => {
      if (error.code) {
        hilog.error(DOMAIN, 'jidecards', 'Unable to load main page: %{public}d', error.code);
        this.retryLoadContent(windowStage, 1);
        return;
      }
      if (this.continuationNotice !== '') {
        this.continuationToast(this.continuationNotice); this.continuationNotice = '';
      }
      // 全屏时采用沉浸布局；半屏/悬浮窗跟随系统边界，不主动恢复全屏。
      // 全屏布局让应用内容延伸到状态栏/导航栏区域，
      // 配合各弹层的 expandSafeArea 实现磨砂遮罩覆盖状态栏（设置面板/字段帮助面板等）。
      // 普通页面顶部条通过 paddingTop（状态栏高度）避免内容被状态栏遮挡；
      // 底部固定控件/滚动列表通过 paddingBottom（导航条高度）避免被手势导航条遮挡。
      try {
        this.主窗口 = windowStage.getMainWindowSync();
        this.主窗口.on('windowStatusChange', this.windowStatusChanged);
        this.syncWindowLayout();
        this.同步规避区高度();
        // 折叠屏展开/折叠、旋转等场景规避区尺寸会变化，必须动态监听更新，
        // 否则高度只在启动时取一次，Mate X7 展开后顶部条/底部控件避让全部错位。
        this.主窗口.on('avoidAreaChange', (): void => {
          this.同步规避区高度();
        });
        this.主窗口.on('keyboardHeightChange', (): void => { this.同步规避区高度(); });
        this.主窗口.on('windowRectChange', (): void => {
          this.同步规避区高度();
          if (this.desktopWindow && !this.desktopTitleBarActive) this.syncDesktopTitleBar();
        });
        if (this.desktopWindow) {
          this.主窗口.on('windowTitleButtonRectChange', this.titleButtonsChanged);
          this.syncDesktopTitleBar();
        }
        // 兜底：部分设备启动时规避区尚未计算完成（getWindowAvoidArea 返回 0）且
        // avoidAreaChange 不触发，会导致状态栏高度一直是 0、顶栏按钮与状态栏重合。
        // 延迟再同步一次（幂等，值无变化时 setOrCreate 不产生额外刷新）。
        setTimeout((): void => {
          this.同步规避区高度();
          if (this.desktopWindow) this.syncDesktopTitleBar();
        }, 600);
      } catch (e) {
        hilog.error(DOMAIN, 'jidecards', `setWindowLayoutFullScreen failed: ${e}`);
        AppStorage.setOrCreate<number>('状态栏高度', 0);
        AppStorage.setOrCreate<number>('导航条高度', 0);
      }
      应用系统栏样式(this.context, this.effectiveDarkMode());
    });
  }

  /** 同步状态栏/导航条规避区高度到 AppStorage（各页面顶栏/底部控件避让依据，幂等可重复调用） */
  private 同步规避区高度(): void {
    if (this.主窗口 === undefined) {
      return;
    }
    try {
      const 系统栏区 = this.主窗口.getWindowAvoidArea(window.AvoidAreaType.TYPE_SYSTEM);
      const 导航条区 = this.主窗口.getWindowAvoidArea(window.AvoidAreaType.TYPE_NAVIGATION_INDICATOR);
      const 挖孔区 = this.主窗口.getWindowAvoidArea(window.AvoidAreaType.TYPE_CUTOUT);
      const bounds = this.主窗口.getWindowProperties().windowRect;
      const safe = windowSafeInsets(系统栏区, 挖孔区, 导航条区, bounds.width, bounds.height);
      const ui = this.主窗口.getUIContext();
      AppStorage.setOrCreate<number>(WINDOW_SAFE_TOP_KEY, ui.px2vp(safe.top));
      AppStorage.setOrCreate<number>(WINDOW_SAFE_BOTTOM_KEY, ui.px2vp(safe.bottom));
      AppStorage.setOrCreate<number>(WINDOW_SAFE_LEFT_KEY, ui.px2vp(safe.left));
      AppStorage.setOrCreate<number>(WINDOW_SAFE_RIGHT_KEY, ui.px2vp(safe.right));
      AppStorage.setOrCreate<number>(WINDOW_HEIGHT_KEY, ui.px2vp(bounds.height));
      // 键盘读数暂不可用时仍发布系统安全区，并保留上次键盘位置。
      try {
        const keyboard = this.主窗口.getWindowAvoidArea(window.AvoidAreaType.TYPE_KEYBOARD).bottomRect;
        AppStorage.setOrCreate<number>(WINDOW_KEYBOARD_TOP_KEY, keyboard.height > 0 ? ui.px2vp(keyboard.top) : 0);
      } catch (_error) { /* 窗口事件稍后会刷新。 */ }
      AppStorage.setOrCreate<number>('状态栏高度', this.主窗口.getUIContext().px2vp(系统栏区.topRect.height));
      AppStorage.setOrCreate<number>('导航条高度', this.主窗口.getUIContext().px2vp(导航条区.bottomRect.height));
      const width: number = ui.px2vp(bounds.width);
      const height: number = ui.px2vp(bounds.height);
      const previousSize = AppStorage.get<WindowSizeVp>(WINDOW_SIZE_KEY);
      if (previousSize?.width !== width || previousSize?.height !== height) {
        AppStorage.setOrCreate<WindowSizeVp>(WINDOW_SIZE_KEY, { width: width, height: height });
      }
    } catch (e) {
      hilog.error(DOMAIN, 'jidecards', `getWindowAvoidArea failed: ${e}`);
    }
  }

  onWindowStageDestroy(): void {
    if (this.desktopWindow) {
      try { this.主窗口?.off('windowTitleButtonRectChange', this.titleButtonsChanged); }
      catch { hilog.warn(DOMAIN, 'jidecards', 'Title button listener release failed'); }
      this.desktopTitleBarActive = false;
      AppStorage.setOrCreate<WindowTitleBarLayout>(WINDOW_TITLE_BAR_LAYOUT_KEY, HIDDEN_WINDOW_TITLE_BAR);
      AppStorage.setOrCreate<boolean>(WINDOW_PINNED_KEY, false);
    }
    try { this.主窗口?.off('windowStatusChange', this.windowStatusChanged); }
    catch (error) { hilog.warn(DOMAIN, 'jidecards', 'Window status listener release failed'); }
    this.主窗口 = undefined;
    hilog.info(DOMAIN, 'jidecards', 'Window stage destroyed');
  }

  onForeground(): void {
    startInstallationUsage(this.context);
    AppStorage.setOrCreate<boolean>(APP_FOREGROUND_KEY, true);
    this.refreshSystemDarkMode();
    this.refreshThemeColors();
    // 回前台重读真实窗口模式，修复后台期间可能漏送的分屏/悬浮窗变化。
    this.syncWindowLayout();
    if (this.desktopWindow) this.syncDesktopTitleBar();
    this.同步规避区高度();
  }

  // 切到后台时执行。
  // onBackground 回调返回后系统会在几秒内挂起应用进程，fire-and-forget 异步任务会被冻结，
  // 导致「学完按 Home 切桌面」场景下 刷新桌面卡片数据() 中途被挂起，桌面卡片一直显示旧数据，
  // 必须等用户打开统计页触发同步刷新才能更新（症状：延迟十几分钟）。
  // 修复：申请短时任务保活——HarmonyOS 在 onBackground 内调用 backgroundTaskManager.requestSuspendDelay
  // 可让应用进程最多延长 3 分钟（单日配额 10 分钟），足够刷新（1-3 秒）完成。
  // 短时任务不需要权限申请，任务完成后必须主动 cancelSuspendDelay 否则消耗配额。
  // 失败不阻塞退出，静默跳过保留上次的提醒快照与卡片数据。
  onBackground(): void {
    stopInstallationUsage(this.context);
    syncActivity.continueInBackground();
    AppStorage.setOrCreate<boolean>(APP_FOREGROUND_KEY, false);
    hilog.info(DOMAIN, 'jidecards', 'Application moved to background');
    this.刷新桌面卡片到后台();
    this.刷新学习提醒到后台();
  }

  private 刷新桌面卡片到后台(): void {
    // 申请短时任务保活，避免 fire-and-forget 切后台后被冻结。
    // 配额机制：单次最长 3 分钟，单日 10 分钟（低电量 1 分钟）。刷新通常 1-3 秒完成。
    let 短时任务Id: number = -1;
    try {
      if (canIUse('SystemCapability.ResourceSchedule.BackgroundTaskManager.Core')) {
        if (canIUse('SystemCapability.ResourceSchedule.BackgroundTaskManager.TransientTask')) {
          const 信息: backgroundTaskManager.DelaySuspendInfo =
            backgroundTaskManager.requestSuspendDelay('刷新桌面卡片数据', (): void => {
              hilog.warn(DOMAIN, 'jidecards', '短时任务即将超时（刷新桌面卡片数据未在配额内完成）');
            });
          短时任务Id = 信息.requestId;
        }
      }
    } catch (e) {
      hilog.error(DOMAIN, 'jidecards', `申请短时任务失败（直接 fire-and-forget 降级）: ${e}`);
    }
    const 释放短时任务 = (): void => {
      if (短时任务Id < 0) {
        return;
      }
      try {
        if (canIUse('SystemCapability.ResourceSchedule.BackgroundTaskManager.Core')) {
          if (canIUse('SystemCapability.ResourceSchedule.BackgroundTaskManager.TransientTask')) {
            backgroundTaskManager.cancelSuspendDelay(短时任务Id);
          }
        }
      } catch (e) {
        // 重复释放或释放失败可忽略
      }
    };
    刷新桌面卡片数据()
      .then((): void => {
        hilog.info(DOMAIN, 'jidecards', '后台刷新桌面卡片数据成功');
        释放短时任务();
      })
      .catch((错误: Object): void => {
        hilog.error(DOMAIN, 'jidecards', `后台刷新桌面卡片数据失败（不阻塞退出）: ${错误}`);
        释放短时任务();
      });
  }

  private 刷新学习提醒到后台(): void {
    刷新学习提醒()
      .then((): void => {
        hilog.info(DOMAIN, 'jidecards', '后台刷新学习提醒成功');
      })
      .catch((错误: Object): void => {
        hilog.error(DOMAIN, 'jidecards', `后台刷新学习提醒失败（不阻塞退出）: ${错误}`);
      });
  }

  onDestroy(): void {
    externalMcpService.dispose();
    continuationSession.setListener(null);
    clearStudyPenKitContext(this.context);
    hilog.info(DOMAIN, 'jidecards', 'Application destroyed');
  }
}
