// SPDX-License-Identifier: AGPL-3.0-or-later

import { APP_FOREGROUND_KEY } from '../model/Redemption';
import {
  AbilityConstant,
  common,
  Configuration,
  ConfigurationConstant,
  UIAbility,
  Want
} from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { window } from '@kit.ArkUI';
import { resourceManager, i18n } from '@kit.LocalizationKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { backgroundTaskManager } from '@kit.BackgroundTasksKit';
import { 应用系统栏样式 } from '../utils/主题控制器';
import { 应用颜色主题 } from '../utils/颜色主题管理器';
import { 颜色主题, 默认颜色主题, 规范化颜色主题 } from '../model/颜色主题';
import { 刷新桌面卡片数据 } from '../model/FSRS控制器';
import { 刷新学习提醒 } from '../model/学习提醒服务';
import { AI_AGENT_CHANNELS_APP_STORAGE_KEY, initializeAiAgentChannels } from '../model/ReleaseFeatures';
import { initializeCardTextSize } from '../utils/CardTextSizeStore';
import { initializeStudyHaptics } from '../utils/StudyHaptics';
import { syncActivity } from '../model/SyncSettings';

const DOMAIN: number = 0x4342;

export default class EntryAbility extends UIAbility {
  /** 主窗口引用：规避区高度同步用（onWindowStageCreate 时赋值） */
  private 主窗口?: window.Window;

  private publishSystemDarkMode(isDark: boolean): void {
    AppStorage.setOrCreate<boolean>('systemDarkMode', isDark);
  }

  private refreshSystemDarkMode(): void {
    try {
      const configuration: resourceManager.Configuration =
        this.context.resourceManager.getConfigurationSync();
      this.publishSystemDarkMode(
        configuration.colorMode === resourceManager.ColorMode.DARK
      );
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

  onCreate(want: Want, _launchParam: AbilityConstant.LaunchParam): void {
    AppStorage.setOrCreate<common.UIAbilityContext>('abilityContext', this.context);
    initializeCardTextSize();
    initializeStudyHaptics();
    AppStorage.setOrCreate<boolean>(AI_AGENT_CHANNELS_APP_STORAGE_KEY, false);
    initializeAiAgentChannels().catch((_error: Object): void => {
      // 读取失败保持关闭；开发者可在设置页重新输入密钥。
    });
    this.refreshSystemDarkMode();
    // 存系统语言供纯函数层做本地化（如默认牌组名）
    try {
      const 语言: string = i18n.System.getAppPreferredLanguage();
      AppStorage.setOrCreate<string>('系统语言', 语言.startsWith('en') ? 'en' : 'zh-Hans');
    } catch (_e) {
      AppStorage.setOrCreate<string>('系统语言', 'zh-Hans');
    }
    // DeepLink 跳转：桌面卡片点击 → jidecards://stats → 写 AppStorage 信号让首页 aboutToAppear 跳统计页
    this.处理DeepLink(want);
    hilog.info(DOMAIN, 'jidecards', 'Application created');
  }

  onNewWant(want: Want, _launchParam: AbilityConstant.LaunchParam): void {
    // App 已在后台时，桌面卡片点击 → jidecards://stats → 写 AppStorage 信号让首页监听回调跳统计页
    this.处理DeepLink(want);
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
    // 语言/窗口等配置通知可能没有指定颜色模式，不能把它当成浅色切换。
    if (configuration.colorMode === ConfigurationConstant.ColorMode.COLOR_MODE_DARK) {
      this.publishSystemDarkMode(true);
    } else if (configuration.colorMode === ConfigurationConstant.ColorMode.COLOR_MODE_LIGHT) {
      this.publishSystemDarkMode(false);
    }
    // 系统语言变化时同步刷新 AppStorage，否则组件读到的还是上次启动时的旧值，
    // 主页摘要卡、桌面卡片注入的语言字段全部不会跟随系统切换。
    // language 字段为空时回退到 i18n.System.getAppPreferredLanguage() 兜底。
    try {
      const 语言: string = configuration.language && configuration.language.length > 0
        ? configuration.language
        : i18n.System.getAppPreferredLanguage();
      AppStorage.setOrCreate<string>('系统语言', 语言.startsWith('en') ? 'en' : 'zh-Hans');
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
      // 开启沉浸式全屏布局：让应用内容延伸到状态栏/导航栏区域，
      // 配合各弹层的 expandSafeArea 实现磨砂遮罩覆盖状态栏（设置面板/字段帮助面板等）。
      // 普通页面顶部条通过 paddingTop（状态栏高度）避免内容被状态栏遮挡；
      // 底部固定控件/滚动列表通过 paddingBottom（导航条高度）避免被手势导航条遮挡。
      try {
        this.主窗口 = windowStage.getMainWindowSync();
        this.主窗口.setWindowLayoutFullScreen(true);
        this.同步规避区高度();
        // 折叠屏展开/折叠、旋转等场景规避区尺寸会变化，必须动态监听更新，
        // 否则高度只在启动时取一次，Mate X7 展开后顶部条/底部控件避让全部错位。
        this.主窗口.on('avoidAreaChange', (): void => {
          this.同步规避区高度();
        });
        // 兜底：部分设备启动时规避区尚未计算完成（getWindowAvoidArea 返回 0）且
        // avoidAreaChange 不触发，会导致状态栏高度一直是 0、顶栏按钮与状态栏重合。
        // 延迟再同步一次（幂等，值无变化时 setOrCreate 不产生额外刷新）。
        setTimeout((): void => {
          this.同步规避区高度();
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
      AppStorage.setOrCreate<number>('状态栏高度', px2vp(系统栏区.topRect.height));
      AppStorage.setOrCreate<number>('导航条高度', px2vp(导航条区.bottomRect.height));
    } catch (e) {
      hilog.error(DOMAIN, 'jidecards', `getWindowAvoidArea failed: ${e}`);
    }
  }

  onWindowStageDestroy(): void {
    hilog.info(DOMAIN, 'jidecards', 'Window stage destroyed');
  }

  onForeground(): void {
    AppStorage.setOrCreate<boolean>(APP_FOREGROUND_KEY, true);
    this.refreshSystemDarkMode();
    this.refreshThemeColors();
    // 回前台时重同步规避区（分屏/折叠/悬浮窗等场景规避区可能已变化且事件未送达）
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
      const 信息: backgroundTaskManager.DelaySuspendInfo =
        backgroundTaskManager.requestSuspendDelay('刷新桌面卡片数据', (): void => {
          // 系统即将超时回调：仅记日志，不主动 cancel（让系统超时释放）
          hilog.warn(DOMAIN, 'jidecards', '短时任务即将超时（刷新桌面卡片数据未在配额内完成）');
        });
      短时任务Id = 信息.requestId;
    } catch (e) {
      hilog.error(DOMAIN, 'jidecards', `申请短时任务失败（直接 fire-and-forget 降级）: ${e}`);
    }
    const 释放短时任务 = (): void => {
      if (短时任务Id < 0) {
        return;
      }
      try {
        backgroundTaskManager.cancelSuspendDelay(短时任务Id);
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
    hilog.info(DOMAIN, 'jidecards', 'Application destroyed');
  }
}
