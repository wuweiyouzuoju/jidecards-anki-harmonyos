// SPDX-License-Identifier: AGPL-3.0-or-later
import { resourceText } from '../utils/UiFeedback';
import { ThemeTextSpans } from './common/ThemeText';
import { THEME_TEXT_COLORS_KEY } from '../model/ThemeCatalog';

import { DialogHeader } from './common/DialogHeader';
import { 同步服务 } from '../backend/同步服务';
import { 后端错误 } from '../backend/错误类型';
import type {
  MediaSyncStatusResponse,
  SyncAuth,
  SyncCollectionResponse
} from '../proto/messages/SyncMessages';
import {
  清除同步凭证,
  保存同步端点,
  设置媒体待同步,
  加载媒体同步开关
} from '../model/同步凭证存储';
import {
  应用新端点,
  分类同步错误,
  判定集合同步走向,
  提取新端点
} from '../model/同步流程';
import type { 集合同步结果走向 } from '../model/同步流程';
import { 设置面板色板_取, 设置面板色板 } from '../utils/设置面板配色';
import { 应用尺寸 } from '../utils/应用尺寸';
import { 取全屏转场时长, 取全屏转场曲线 } from '../utils/转场时长';
import { 颜色键 } from '../model/颜色主题';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { syncActivity } from '../model/SyncSettings';
import { autoSyncScheduler } from '../model/AutoSyncScheduler';
import { 加载FSRS开启状态, notifyFsrsStateChanged } from '../model/FSRS控制器';
import { APP_FOREGROUND_KEY } from '../model/Redemption';
import { backgroundTaskManager } from '@kit.BackgroundTasksKit';

// 同步流程诊断日志：DOMAIN 0x4342 与 EntryAbility 一致，tag 用 jidecards 便于过滤
const 同步日志域: number = 0x4342;
const 同步日志标签: string = 'jidecards';

/** 全量同步方向冲突类型（与 同步流程 的 集合同步结果走向 冲突分支一一对应）。 */
type 冲突类型 = 'fullSync' | 'fullDownload' | 'fullUpload';

// ========================================================
// @块ID COMP-SYNC-PANEL-001
// @名称 同步面板组件声明与状态字段
//
// @作用
// 根宿主持有手动与自动共用的 SyncCollection → 媒体执行链。
// 登录/注销仍在设置分组；详情随时可收起，任务不随页面返回销毁。
// 首页接收状态文案与图标状态；自动传输只显示小图标，失败/冲突保留处理入口。
//
// 状态机：
// - syncing：同步进行中（含 SyncCollection/mediaSync pending 与媒体轮询中）
// - conflict：服务端要求全量同步，释放集合供学习，确认方向前重新检查云端
// - done：同步完成 / 已是最新 / 已中止 / 错误，允许关闭
//
// auth 流转：initialAuth 由 Index 透传；内部若服务端下发新端点，写回 preferences
// （saveSyncEndpoint）并更新内部 auth。下次 SyncGroup.aboutToAppear 会读到最新值。
// auth 类错误时清凭证（clearSyncAuth），关闭弹窗后 SyncGroup 重新 aboutToAppear 会回 loggedOut。
//
// @输入
// 是否深色 / 账号名 / 初始鉴权 / 同步完成回调 / 关闭回调（由 Index 挂载时透传）。
//
// @输出
// 一个全屏 Stack 弹窗：磨砂遮罩 + 居中浮卡（按阶段切换 syncing/conflict/done 内容）。
//
// @业务规则
// 任务仅在终态销毁；收起详情不释放租约，学习让路必须等待原调用回滚或提交。
// 颜色主题通过 @StorageProp 触发重 build，让 设置面板色板_取(isDark).主色 即时变化。
//
// @副作用
// 持有 同步服务 实例与轮询定时器；aboutToDisappear 清理定时器。
// ========================================================

@Component
export struct 同步面板 {
  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  @StorageProp(颜色键.动作主色) private dialogActionColor: string = '#2F5FD0';
  @Prop 是否深色: boolean = false;
  @Prop 账号名: string = '';
  @Prop automatic: boolean = false;
  @Prop @Watch('dismissPresentation') backRequest: number = 0;
  @Prop @Watch('showDetails') detailsRequest: number = 0;
  @StorageProp(APP_FOREGROUND_KEY) @Watch('syncForegroundChanged') private syncForeground: boolean = true;
  @State private detailsVisible: boolean = false;
  状态变化回调: (collectionBusy: boolean, modal: boolean) => void = (_busy: boolean, _modal: boolean): void => {};
  // 初始鉴权 由 Index 在挂载本组件时传入（来自 SyncGroup 上抛）
  初始鉴权: SyncAuth | null = null;
  同步完成回调: (fsrsDisabledBySync: boolean) => void = (_fsrsDisabledBySync: boolean): void => {};
  关闭回调: () => void = (): void => {};
  statusChanged: (text: string, indicator: string) => void = (_text: string, _indicator: string): void => {};
  onYield: (automatic: boolean) => void = (_automatic: boolean): void => {};
  onRetry: () => void = (): void => {};

  // @StorageProp 触发颜色主题切换时重 build，让 设置面板色板_取(isDark).主色 即时变化
  @StorageProp(颜色键.动作主色) private 动作主色: string = '#2F5FD0';
  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景: string = '#2F5FD0';

  @State private 当前阶段: 'syncing' | 'conflict' | 'done' = 'syncing';
  @State private 状态文案: string = '';
  @State private 错误文案: string = '';
  @State private 媒体进度文案: string = '';
  @State private 当前冲突类型: 冲突类型 = 'fullSync';
  @State private 是否请求中止: boolean = false;

  // 内部（非 @State，不参与 UI 刷新）
  private 鉴权: SyncAuth | null = null;
  private 轮询定时器: number = -1;
  private 媒体检查次数: number = 0;
  /** 媒体同步是否曾进入 active=true 状态（防误判：未启动时 active=false 不应立即判完成）。 */
  private 媒体曾进入活跃: boolean = false;
  private 待定服务器USN: number | null = null;
  @State private 是否在媒体阶段: boolean = false;
  /** syncCollection 已完成（数据已写入本地 DB）；中止后据此决定是否刷新牌组列表。 */
  private 集合已同步: boolean = false;
  private readonly 同步服务实例: 同步服务 = new 同步服务();
  private readonly syncOwner: Object = new Object();
  private ownsSync: boolean = false;
  private disposed: boolean = false;
  private mediaPollInFlight: boolean = false;
  private fsrsBeforeSync: boolean | null = null;
  private fsrsDisabledBySync: boolean = false;
  private collectionResultNotified: boolean = false;
  private suspendDelayId: number = -1;
  private yieldingForStudy: boolean = false;
  private syncAborted: boolean = false;
  private fullSyncInFlight: boolean = false;
  private collectionCallInFlight: boolean = false;
  private abortTimer: number = -1;
  private abortCall: Promise<void> | null = null;
  private successTimer: number = -1;
  private syncTask: Promise<void> | null = null;
  private mediaStart: Promise<void> | null = null;
  private mediaMayBeRunning: boolean = false;
  private disposalStarted: boolean = false;

  aboutToAppear(): void {
    this.disposed = false;
    this.ownsSync = syncActivity.acquire(this.syncOwner, (): void => { this.requestBackgroundTime(); });
    if (!this.ownsSync) {
      this.错误文案 = this.取本地化文案($r('app.string.sync_already_running'));
      this.setSyncPhase('done');
      return;
    }
    this.publishSyncState();
    this.鉴权 = this.初始鉴权;
    syncActivity.setStudyYieldHandler(this.syncOwner, (): boolean => this.requestStudyYield());
    this.启动同步();
  }

  aboutToDisappear(): void {
    this.disposed = true;
    this.releaseSuspendDelay();
    this.stopAbortTimer();
    if (this.successTimer >= 0) clearTimeout(this.successTimer);
    this.清理轮询定时器();
    if (!this.ownsSync || this.disposalStarted) return;
    this.disposalStarted = true;
    if (this.当前阶段 === 'done' ||
      (this.syncTask === null && this.mediaStart === null && !this.mediaMayBeRunning)) {
      syncActivity.release(this.syncOwner, Date.now());
    } else {
      this.finishDisposedSync();
    }
  }

  /** 销毁仅解除展示；集合提交/回滚及后台媒体确实结束后才释放租约。 */
  private async finishDisposedSync(): Promise<void> {
    try {
      if (this.syncTask !== null) await this.syncTask;
      if (this.mediaStart !== null) await this.mediaStart;
      if (this.abortCall !== null) await this.abortCall;
    } catch (error) {
      hilog.warn(同步日志域, 同步日志标签, 'sync: detached operation finished with error');
    }
    if (this.mediaMayBeRunning) {
      // AbortMediaSync 只发信号；再次查询 active=false 才证明后台线程已退出。
      while (true) {
        try {
          await this.同步服务实例.中止媒体同步();
          const status: MediaSyncStatusResponse = await this.同步服务实例.媒体同步状态();
          if (!status.active) break;
        } catch (error) {
          // 状态查询会取走已结束线程的错误；下一次确认 inactive，不能据一次失败提前释放。
          hilog.warn(同步日志域, 同步日志标签, 'sync: waiting for detached media termination');
        }
        await new Promise<void>((resolve: () => void): void => { setTimeout(resolve, 1000); });
      }
    }
    syncActivity.release(this.syncOwner, Date.now());
  }

  /** 任务生命周期独立于详情显隐；集合阶段只保护数据库入口，不覆盖首页。 */
  private publishSyncState(): void {
    if (this.disposed) return;
    syncActivity.setCollectionBusy(this.syncOwner, this.当前阶段 === 'syncing' && !this.是否在媒体阶段);
    this.状态变化回调(this.当前阶段 === 'syncing' && !this.是否在媒体阶段,
      this.detailsVisible);
    this.publishStatus();
  }

  /** 图标语义独立于翻译文案；等待处理与中止不能伪装成仍在传输或成功。 */
  private publishStatus(): void {
    let text: string = '';
    let indicator: string = 'syncing';
    if (this.错误文案 !== '' || this.当前阶段 === 'conflict') {
      indicator = 'attention';
      text = this.取本地化文案(this.错误文案 !== '' ?
        $r('app.string.sync_background_error') : $r('app.string.sync_needs_attention'));
    } else if (this.当前阶段 === 'done') {
      indicator = this.syncAborted ? 'paused' : 'done';
      text = this.状态文案;
    } else if (this.yieldingForStudy) {
      indicator = 'waiting';
      text = this.取本地化文案($r('app.string.sync_yielding'));
    } else {
      text = this.是否在媒体阶段 ?
        this.媒体进度文案 || this.取本地化文案($r('app.string.sync_syncing_media')) :
        this.取本地化文案($r('app.string.sync_syncing'));
    }
    this.statusChanged(text, indicator);
  }

  private showDetails(): void {
    this.detailsVisible = true;
    this.publishSyncState();
  }

  /** 全量替换只能由用户明确发起，学习不自动打断已确认的替换。 */
  private requestStudyYield(): boolean {
    if (this.fullSyncInFlight) return false;
    if (this.当前阶段 !== 'syncing' || this.是否在媒体阶段 || this.集合已同步) return true;
    this.yieldingForStudy = true;
    this.是否请求中止 = true;
    this.detailsVisible = false;
    this.publishSyncState();
    if (this.collectionCallInFlight && this.abortTimer < 0) {
      this.sendAbort();
      this.abortTimer = setInterval((): void => { this.sendAbort(); }, 50);
    }
    return true;
  }

  /** 覆盖取消早于 Core 注册句柄的竞态；同一时刻只发送一个取消请求。 */
  private sendAbort(): void {
    if (this.disposed || !this.collectionCallInFlight || this.abortCall !== null) return;
    this.abortCall = this.同步服务实例.中止同步()
      .catch((): void => { hilog.warn(同步日志域, 同步日志标签, 'sync: abort signal failed, retrying'); })
      .finally((): void => { this.abortCall = null; });
  }

  private stopAbortTimer(): void {
    if (this.abortTimer >= 0) clearInterval(this.abortTimer);
    this.abortTimer = -1;
  }

  /** 只有原始调用回滚/提交完成且取消信号落定后，才能归还集合租约。 */
  private async syncCollectionWithPriority(auth: SyncAuth, media: boolean): Promise<SyncCollectionResponse> {
    this.collectionCallInFlight = true;
    try {
      return await this.同步服务实例.同步集合(auth, media);
    } finally {
      this.collectionCallInFlight = false;
      this.stopAbortTimer();
      if (this.abortCall !== null) await this.abortCall;
    }
  }

  /** 终态释放任务租约，保留错误展示；媒体仍运行时不得释放。 */
  private setSyncPhase(phase: 'syncing' | 'conflict' | 'done'): void {
    this.当前阶段 = phase;
    if (phase !== 'syncing') this.releaseSuspendDelay();
    if (phase === 'done') syncActivity.release(this.syncOwner, Date.now());
    this.publishSyncState();
  }

  /** 自动详情可以收起，正在执行的任务继续由根宿主持有。 */
  private dismissPresentation(): void {
    if (this.当前阶段 !== 'done') {
      this.detailsVisible = false;
      this.publishSyncState();
    } else if (this.是否允许关闭()) {
      this.关闭回调();
    }
  }

  /** 仅给已启动的同步申请退后台收尾时间，不创建后台轮询任务。 */
  private syncForegroundChanged(): void {
    if (this.syncForeground) {
      this.releaseSuspendDelay();
    }
  }

  /** 必须由 Ability 退后台回调同步触发，不能等 ArkUI Watch 调度。 */
  private requestBackgroundTime(): void {
    if (this.disposed || this.当前阶段 !== 'syncing' || !this.ownsSync || this.suspendDelayId >= 0) return;
    try {
      if (canIUse('SystemCapability.ResourceSchedule.BackgroundTaskManager.Core')) {
        if (canIUse('SystemCapability.ResourceSchedule.BackgroundTaskManager.TransientTask')) {
          const delay: backgroundTaskManager.DelaySuspendInfo = backgroundTaskManager.requestSuspendDelay(
            this.取本地化文案($r('app.string.settings_sync_group')), (): void => { this.releaseSuspendDelay(); });
          this.suspendDelayId = delay.requestId;
        }
      }
    } catch (error) {
      hilog.warn(同步日志域, 同步日志标签, 'sync: background extension unavailable');
    }
  }

  /** 完成、恢复前台或超时均归还短时任务配额。 */
  private releaseSuspendDelay(): void {
    if (this.suspendDelayId < 0) return;
    const requestId: number = this.suspendDelayId;
    this.suspendDelayId = -1;
    try {
      if (canIUse('SystemCapability.ResourceSchedule.BackgroundTaskManager.Core')) {
        if (canIUse('SystemCapability.ResourceSchedule.BackgroundTaskManager.TransientTask')) {
          backgroundTaskManager.cancelSuspendDelay(requestId);
        }
      }
    } catch (error) {
      hilog.warn(同步日志域, 同步日志标签, 'sync: background extension already released');
    }
  }

  /** 自动同步仅在成功完成后收起；媒体失败和全量覆盖冲突必须继续可见。 */
  private notifySyncResult(): void {
    if (this.disposed) return;
    this.notifyCollectionResult();
    if (this.当前阶段 === 'done' && this.错误文案 === '' && !this.是否请求中止) {
      if (this.automatic) this.关闭回调();
      else this.successTimer = setTimeout((): void => { this.关闭回调(); }, 3000);
    }
  }

  /** 集合成功提交后立即取样，避免媒体阶段影响变化判定；未知值不推断为关闭。 */
  private async captureFsrsAfterSync(): Promise<void> {
    const after: boolean | null = await 加载FSRS开启状态();
    this.fsrsDisabledBySync = this.fsrsBeforeSync === true && after === false;
    hilog.info(同步日志域, 同步日志标签, 'sync: FSRS before=%{public}s after=%{public}s disabledBySync=%{public}s',
      `${this.fsrsBeforeSync}`, `${after}`, `${this.fsrsDisabledBySync}`);
    notifyFsrsStateChanged();
  }

  /** 集合提交立即通知一次；后续媒体成功、失败或中止不会重复刷新。 */
  private notifyCollectionResult(): void {
    if (this.disposed || this.collectionResultNotified) return;
    this.collectionResultNotified = true;
    this.同步完成回调(this.fsrsDisabledBySync);
  }

  // ========================================================
  // @块ID COMP-SYNC-PANEL-002
  // @名称 色板/本地化/定时器/关闭判定辅助方法
  //
  // @作用
  // 提供四个无状态的小辅助：取本地化资源字符串、取设置面板色板、
  // 清理媒体轮询定时器、判定弹窗是否允许关闭。
  //
  // @输入
  // 取本地化文案：Resource；取色板：isDark；清理轮询定时器：无；是否允许关闭：无（读 this.当前阶段 与 this.是否请求中止）。
  //
  // @输出
  // 取本地化文案：本地化字符串；取色板：设置面板色板 对象；其余无返回。
  //
  // @业务规则
  // 关闭判定：仅 当前阶段 === 'done' 且 是否请求中止 === false 才允许关闭。
  //
  // @副作用
  // 清理轮询定时器会 clearInterval 并置位 -1。
  // ========================================================

  private 取本地化文案(资源: Resource): string {
    return resourceText(this.getUIContext(), 资源);
  }

  private 取色板(): 设置面板色板 {
    return 设置面板色板_取(this.是否深色);
  }

  /** 清理媒体轮询定时器。 */
  private 清理轮询定时器(): void {
    if (this.轮询定时器 >= 0) {
      clearInterval(this.轮询定时器);
      this.轮询定时器 = -1;
    }
  }

  /** 终态可以销毁任务；其他阶段只收起详情。 */
  private 是否允许关闭(): boolean {
    return this.当前阶段 === 'done' && !this.是否请求中止;
  }

  // ========================================================
  // @块ID COMP-SYNC-PANEL-003
  // @名称 同步中止与错误统一处理
  //
  // @作用
  // 同步流程统一错误出口与中止落定态处理：
  // - 完成中止：清轮询、置 done、显示「已中止」文案；若 syncCollection 已完成则刷新牌组列表。
  // - 处理同步错误：用户中止优先走完成中止；其余按 auth/network/other 分类显示错误文案；
  //   媒体阶段出错且集合已同步时仍刷新牌组列表。
  //
  // @输入
  // 完成中止：无（读 this.集合已同步）；处理同步错误：Error 实例。
  //
  // @输出
  // 当前阶段置 'done'，状态文案/错误文案更新，必要时调用 同步完成回调。
  //
  // @业务规则
  // auth 错误：清凭证（关闭后 SyncGroup 回 loggedOut）。
  // network/other：停留 done，显示错误文案，允许关闭。
  // 中止或错误时若 集合已同步=true，仍需刷新牌组列表让用户看到已同步的牌组。
  //
  // @副作用
  // 清理轮询定时器；auth 错误时 清除同步凭证 + 置 鉴权=null；调用 同步完成回调。
  // ========================================================

  /** 中止落定态：清轮询、置 done、显示「已中止」文案。 */
  private 完成中止(): void {
    const 集合是否已同步: boolean = this.集合已同步;
    this.syncAborted = true;
    this.是否请求中止 = false;
    this.集合已同步 = false;
    this.是否在媒体阶段 = false;
    this.清理轮询定时器();
    this.媒体进度文案 = '';
    this.状态文案 = this.取本地化文案($r('app.string.sync_aborted'));
    if (this.yieldingForStudy) this.onYield(this.automatic);
    this.setSyncPhase('done');
    // syncCollection 已完成（数据已入 DB）但用户中止了媒体阶段：仍需刷新牌组列表，
    // 否则用户看不到刚同步的牌组，再点同步又显示「已最新」但 UI 不更新。
    if (集合是否已同步) {
      hilog.info(同步日志域, 同步日志标签, 'sync: aborted after collection synced, refreshing deck list');
      this.notifyCollectionResult();
    }
    if (this.yieldingForStudy) this.关闭回调();
  }

  /**
   * 同步流程统一错误出口：
   * - 用户中止优先：落「已中止」态（done）；
   * - auth：会话过期，清凭证（关闭后 SyncGroup 回 loggedOut）；
   * - network/other：停留 done，显示错误文案，允许关闭。
   */
  private 处理同步错误(error: Error): void {
    if (this.disposed) return;
    if (this.是否请求中止) {
      this.完成中止();
      return;
    }
    const 集合是否已同步: boolean = this.集合已同步;
    this.集合已同步 = false;
    this.是否在媒体阶段 = false;
    this.清理轮询定时器();
    this.媒体进度文案 = '';
    const 后端错误类别: number | undefined = error instanceof 后端错误 ? error.kind : undefined;
    const 错误类别 = 分类同步错误(error, 后端错误类别);
    hilog.error(同步日志域, 同步日志标签, 'sync error: kind=%{public}s backendKind=%{public}d msg=%{public}s',
      错误类别, 后端错误类别 ?? -1, error.message);
    if (错误类别 === 'auth') {
      清除同步凭证();
      this.鉴权 = null;
      this.错误文案 = this.取本地化文案($r('app.string.sync_error_session_expired'));
    } else if (错误类别 === 'network') {
      this.错误文案 = `${this.取本地化文案($r('app.string.sync_error_network'))} [kind=${后端错误类别 ?? -1}]：${error.message}`;
    } else {
      this.错误文案 = `${this.取本地化文案($r('app.string.sync_error_generic'))} [kind=${后端错误类别 ?? -1}]：${error.message}`;
    }
    this.setSyncPhase('done');
    // 媒体阶段出错时集合同步已完成（数据已入 DB），仍需刷新牌组列表让用户看到已同步的牌组。
    if (集合是否已同步) {
      hilog.info(同步日志域, 同步日志标签, 'sync: error after collection synced, refreshing deck list');
      this.notifyCollectionResult();
    }
  }

  // ========================================================
  // @块ID COMP-SYNC-PANEL-004
  // @名称 启动同步主流程
  //
  // @作用
  // 执行 SyncCollection → 媒体阶段 的主流程：
  // - 直接调 syncCollection 检查并同步，应用服务端新端点；
  // - 判定集合同步走向：done=进入媒体阶段；否则进 conflict 阶段等用户决策。
  //
  // @输入
  // 读 this.鉴权 / this.是否请求中止。
  //
  // @输出
  // 更新 this.鉴权（端点迁移时）、this.状态文案、this.当前阶段、this.待定服务器USN、this.当前冲突类型。
  //
  // @业务规则
  // 任一阶段检测到 是否请求中止 立即走 完成中止。
  // outcome=done 时标记 集合已同步=true 再进媒体阶段。
  //
  // @副作用
  // 调 同步服务.同步集合；端点变更时 保存同步端点；调 同步完成回调。
  // ========================================================

  /** 启动同步：SyncCollection → 媒体阶段。 */
  private 启动同步(): Promise<void> {
    if (this.disposed || this.syncTask !== null) return Promise.resolve();
    this.syncTask = this.runSync().finally((): void => { this.syncTask = null; });
    return this.syncTask;
  }

  private async runSync(): Promise<void> {
    const 当前鉴权: SyncAuth | null = this.鉴权;
    if (当前鉴权 === null) {
      this.错误文案 = this.取本地化文案($r('app.string.sync_error_session_expired'));
      this.setSyncPhase('done');
      return;
    }
    this.错误文案 = '';
    this.状态文案 = '';
    this.媒体进度文案 = '';
    this.是否请求中止 = this.yieldingForStudy;
    this.集合已同步 = false;
    this.fsrsBeforeSync = null;
    this.fsrsDisabledBySync = false;
    this.collectionResultNotified = false;
    this.setSyncPhase('syncing');
    try {
      let 鉴权: SyncAuth = 当前鉴权;
      // 媒体同步开关关闭时，中止上次同步可能仍在运行的后台媒体同步线程
      // （rslib 后台线程不会因关闭弹窗而停止，需显式中止）。
      if (!加载媒体同步开关()) {
        hilog.info(同步日志域, 同步日志标签, 'sync: media sync disabled, aborting any running background media sync');
        await this.同步服务实例.中止媒体同步();
      }
      // 对齐 Anki：真正同步直接访问 syncCollection，不能被 syncStatus 的五分钟缓存短路。
      // 读取媒体同步开关（对齐 Anki 桌面端 Preferences → Sync → "Sync media"）。
      // 关闭时 syncMedia=false（rslib 不挂起媒体同步任务），同步面板跳过媒体阶段。
      const 媒体同步开启: boolean = 加载媒体同步开关();
      this.fsrsBeforeSync = await 加载FSRS开启状态();
      if (this.disposed) return;
      if (this.是否请求中止) {
        this.完成中止();
        return;
      }
      hilog.info(同步日志域, 同步日志标签, 'sync: calling syncCollection syncMedia=%{public}s',
        媒体同步开启 ? 'true' : 'false');
      this.mediaMayBeRunning = 媒体同步开启;
      const 集合响应: SyncCollectionResponse = await this.syncCollectionWithPriority(鉴权, 媒体同步开启);
      if (this.disposed) {
        const endpoint: string = 提取新端点(集合响应);
        if (endpoint !== '') 保存同步端点(endpoint);
        if (判定集合同步走向(集合响应) === 'done') {
          设置媒体待同步(媒体同步开启);
          await this.captureFsrsAfterSync();
        }
        return;
      }
      // 提交先赢得竞态时，保留成功结果与 Core 已启动的媒体任务。
      this.是否请求中止 = false;
      this.yieldingForStudy = false;
      const 集合端点: string = 提取新端点(集合响应);
      if (集合端点 !== '') {
        鉴权 = 应用新端点(鉴权, 集合端点);
        this.鉴权 = 鉴权;
        保存同步端点(集合端点);
      }
      const 走向: 集合同步结果走向 = 判定集合同步走向(集合响应);
      hilog.info(同步日志域, 同步日志标签,
        'sync: syncCollection done required=%{public}d outcome=%{public}s serverMediaUsn=%{public}d hostNumber=%{public}d serverMsg=%{public}s',
        集合响应.required, 走向, 集合响应.serverMediaUsn, 集合响应.hostNumber, 集合响应.serverMessage);
      if (走向 === 'done') {
        // outcome=done = 集合已原子提交到本地 DB；标记以便后续中止时刷新牌组列表。
        设置媒体待同步(媒体同步开启);
        this.集合已同步 = true;
        await this.captureFsrsAfterSync();
        if (this.disposed) return;
        this.notifyCollectionResult();
        if (this.是否请求中止) {
          this.完成中止();
          return;
        }
        // 媒体同步开关关闭（对齐 Anki 桌面端 "Sync media" 开关）：不进媒体阶段，直接完成。
        if (!媒体同步开启) {
          hilog.info(同步日志域, 同步日志标签, 'sync: syncCollection done, media sync disabled, skipping media phase');
          // 媒体同步已禁用，清除待完成标志（避免上次中断的媒体同步残留标志干扰）。
          设置媒体待同步(false);
          this.状态文案 = this.取本地化文案($r('app.string.sync_success'));
          this.setSyncPhase('done');
          this.notifySyncResult();
          return;
        }
        // 集合同步成功，媒体同步待完成——若媒体同步被中断，下次同步凭此标志继续。
        设置媒体待同步(true);
        this.启动媒体阶段(鉴权);
        return;
      }

      if (this.disposed) return;
      if (this.是否请求中止) {
        this.完成中止();
        return;
      }
      // 全量冲突：进 conflict 阶段，等待用户选方向（不弹 CustomDialog，内联到本弹窗）
      this.待定服务器USN = 集合响应.serverMediaUsn;
      this.当前冲突类型 = 走向;
      this.setSyncPhase('conflict');
      hilog.info(同步日志域, 同步日志标签, 'sync: entering conflict phase kind=%{public}s', 走向);
    } catch (error) {
      this.处理同步错误(error instanceof Error ? error : new Error(`${error}`));
    }
  }

  // ========================================================
  // @块ID COMP-SYNC-PANEL-005
  // @名称 冲突确认与媒体阶段启动
  //
  // @作用
  // - 冲突确认：用户选上传/下载方向后调 全量上传或下载，成功后进媒体阶段；
  // - 媒体阶段启动：调 同步媒体 后台启动，RPC 返回后开始 1s 轮询媒体状态。
  //
  // @输入
  // 冲突确认：是否上传（boolean）；启动媒体阶段：当前 SyncAuth。
  //
  // @输出
  // 当前阶段置 'syncing'，集合已同步=true（全量上传/下载成功后）。
  //
  // @业务规则
  // 全量上传/下载完成 = 集合已写入本地 DB，标记 集合已同步=true 以便后续中止时刷新牌组列表。
  // 媒体阶段开始即检查 是否请求中止，命中则走 完成中止。
  //
  // @副作用
  // 调 同步服务.全量上传或下载 / 同步媒体；RPC 失败走 处理同步错误。
  // ========================================================

  /** 冲突确认：FullUploadOrDownload 成功后进入媒体阶段。 */
  private 冲突确认(是否上传: boolean): Promise<void> {
    if (this.disposed || this.syncTask !== null) return Promise.resolve();
    this.syncTask = this.runFullSync(是否上传).finally((): void => { this.syncTask = null; });
    return this.syncTask;
  }

  private async runFullSync(是否上传: boolean): Promise<void> {
    if (this.当前阶段 !== 'conflict' || !autoSyncScheduler.canSync()) return;
    const 鉴权: SyncAuth | null = this.鉴权;
    if (鉴权 === null) {
      this.setSyncPhase('done');
      return;
    }
    this.错误文案 = '';
    this.状态文案 = '';
    this.detailsVisible = true;
    this.fullSyncInFlight = true;
    this.setSyncPhase('syncing');
    // 收起冲突后允许本地学习；覆盖前重新检查方向、端点和媒体 USN。
    try {
      this.fsrsBeforeSync = await 加载FSRS开启状态();
      if (this.disposed) return;
      const response: SyncCollectionResponse = await this.同步服务实例.同步集合(鉴权, false);
      const endpoint: string = 提取新端点(response);
      if (this.disposed) {
        if (endpoint !== '') 保存同步端点(endpoint);
        if (判定集合同步走向(response) === 'done') {
          设置媒体待同步(加载媒体同步开关());
          await this.captureFsrsAfterSync();
        }
        return;
      }
      if (endpoint !== '') {
        this.鉴权 = 应用新端点(鉴权, endpoint);
        保存同步端点(endpoint);
      }
      const outcome: 集合同步结果走向 = 判定集合同步走向(response);
      this.待定服务器USN = response.serverMediaUsn;
      if (outcome === 'done') {
        设置媒体待同步(加载媒体同步开关());
        this.集合已同步 = true;
        await this.captureFsrsAfterSync();
        if (this.disposed) return;
        this.fullSyncInFlight = false;
        this.notifyCollectionResult();
        if (加载媒体同步开关()) {
          设置媒体待同步(true);
          this.启动媒体阶段(this.鉴权!);
        } else {
          this.状态文案 = this.取本地化文案($r('app.string.sync_success'));
          this.setSyncPhase('done');
          this.notifySyncResult();
        }
        return;
      }
      this.当前冲突类型 = outcome;
      if ((是否上传 && outcome === 'fullDownload') || (!是否上传 && outcome === 'fullUpload')) {
        this.fullSyncInFlight = false;
        this.setSyncPhase('conflict');
        return;
      }
    } catch (error) {
      this.fullSyncInFlight = false;
      this.处理同步错误(error instanceof Error ? error : new Error(`${error}`));
      return;
    }
    // 媒体同步开关关闭时不传 serverUSN——rslib full_sync_inner 仅在 server_usn.is_some()
    // 时启动后台媒体同步（不检查 sync_media 字段），传 null 使 rslib 跳过媒体同步。
    const 媒体同步开启: boolean = 加载媒体同步开关();
    const 服务器USN: number | null = 媒体同步开启 ? this.待定服务器USN : null;
    hilog.info(同步日志域, 同步日志标签,
      'sync: calling fullUploadOrDownload upload=%{public}s serverUsn=%{public}s mediaEnabled=%{public}s',
      是否上传 ? 'true' : 'false', 服务器USN === null ? 'null' : `${服务器USN}`, 媒体同步开启 ? 'true' : 'false');
    this.mediaMayBeRunning = 媒体同步开启;
    await this.同步服务实例.全量上传或下载(this.鉴权!, 是否上传, 服务器USN)
      .then(async (): Promise<void> => {
        设置媒体待同步(媒体同步开启);
        // 全量上传/下载完成 = 集合已写入本地 DB；标记以便后续中止时刷新牌组列表。
        this.集合已同步 = true;
        await this.captureFsrsAfterSync();
        if (this.disposed) return;
        this.notifyCollectionResult();
        this.fullSyncInFlight = false;
        if (this.是否请求中止) {
          this.完成中止();
          return;
        }
        // 媒体同步开关关闭：不进媒体阶段，直接完成。
        if (!媒体同步开启) {
          hilog.info(同步日志域, 同步日志标签, 'sync: fullUploadOrDownload done, media sync disabled, skipping media phase');
          设置媒体待同步(false);
          this.状态文案 = this.取本地化文案($r('app.string.sync_success'));
          this.setSyncPhase('done');
          this.notifySyncResult();
          return;
        }
        hilog.info(同步日志域, 同步日志标签, 'sync: fullUploadOrDownload done, entering media phase');
        // 集合同步成功，媒体同步待完成——若媒体同步被中断，下次同步凭此标志继续。
        设置媒体待同步(true);
        this.启动媒体阶段(this.鉴权!);
      })
      .catch((error: Error): void => {
        this.fullSyncInFlight = false;
        this.处理同步错误(error instanceof Error ? error : new Error(`${error}`));
      });
  }

  /**
   * 媒体阶段：SyncMedia 后台启动 → 1s 轮询 MediaSyncStatus。
   * rslib 约定：媒体同步出错后下一次 MediaSyncStatus 返回错误（走 catch 分支）。
   */
  private 启动媒体阶段(鉴权: SyncAuth): void {
    if (this.是否请求中止) {
      this.完成中止();
      return;
    }
    this.是否在媒体阶段 = true;
    this.notifyCollectionResult();
    this.setSyncPhase('syncing');
    const RPC开始时间: number = Date.now();
    hilog.info(同步日志域, 同步日志标签,
      'sync: calling syncMedia (background start) at %{public}d', RPC开始时间);
    this.mediaMayBeRunning = true;
    this.mediaStart = this.同步服务实例.同步媒体(鉴权)
      .then((): void => {
        if (this.disposed) return;
        if (this.是否请求中止) {
          this.完成中止();
          return;
        }
        hilog.info(同步日志域, 同步日志标签,
          'sync: syncMedia RPC returned in %{public}dms, starting polling', Date.now() - RPC开始时间);
        this.开始媒体轮询();
      })
      .catch((error: Error): void => {
        hilog.error(同步日志域, 同步日志标签,
          'sync: syncMedia RPC FAILED in %{public}dms: %{public}s',
          Date.now() - RPC开始时间, error instanceof Error ? error.message : `${error}`);
        this.处理同步错误(error instanceof Error ? error : new Error(`${error}`));
      })
      .finally((): void => { this.mediaStart = null; });
  }

  // ========================================================
  // @块ID COMP-SYNC-PANEL-006
  // @名称 媒体轮询与完成判定
  //
  // @作用
  // 每 1s 调 媒体同步状态 轮询进度，active=false 即判定完成。
  //
  // @输入
  // 无（读 this.是否请求中止 / this.轮询定时器 等内部状态）。
  //
  // @输出
  // 更新 this.媒体进度文案 / this.状态文案 / this.当前阶段；完成时调 同步完成回调。
  //
  // @业务规则
  // get_media_sync_status 在 task finished 时会 join 拿结果：正常完成返回 Ok
  // （active=false，走 then 分支），出错抛 Err（走 catch 分支）。因此进入轮询后
  // 只要 active=false 即算成功——涵盖有传输（everActive=true）与无变化快速完成
  // （everActive=false，rslib sync_inner actions_performed=false）两种场景。
  // 后端 rslib 已通过 i18n 模板格式化进度文本，原样展示不再替换符号。
  //
  // @副作用
  // setInterval 注册定时器；调 媒体同步状态 RPC；调 同步完成回调；调 处理同步错误。
  // ========================================================

  /**
   * 1s 轮询媒体进度。完成判定：
   * - active=false → 正常成功（get_media_sync_status 在 task 结束时 join，
   *   正常完成返回 Ok 走本分支，出错抛 Err 走 catch）
   * - active=true → 继续轮询，更新进度文案
   * syncMedia RPC 失败会走 catch 不会进轮询，故进轮询即说明任务已派发。
   */
  private 开始媒体轮询(): void {
    this.清理轮询定时器();
    this.媒体检查次数 = 0;
    this.媒体曾进入活跃 = false;
    const 轮询开始时间: number = Date.now();
    hilog.info(同步日志域, 同步日志标签, 'sync: mediaPoll START at %{public}d', 轮询开始时间);
    this.轮询定时器 = setInterval((): void => {
      if (this.disposed || this.mediaPollInFlight) return;
      this.mediaPollInFlight = true;
      this.同步服务实例.媒体同步状态()
        .then((状态: MediaSyncStatusResponse): void => {
          if (this.disposed) return;
          if (this.是否请求中止) {
            this.完成中止();
            return;
          }
          this.媒体检查次数++;
          if (状态.active) {
            this.媒体曾进入活跃 = true;
          }
          // 后端 rslib 已通过 i18n 模板格式化为「已检查：N / 已新增：N↑ N↓ / 已删除：N↑ N↓」，
          // ↑=上传方向（本地→云端），↓=下载方向（云端→本地）。直接原样展示，不再替换符号。
          this.媒体进度文案 = `${this.取本地化文案($r('app.string.sync_syncing_media'))} ` +
            `${状态.progress.checked}  ${状态.progress.added}  ${状态.progress.removed}`;
          this.publishStatus();
          hilog.info(同步日志域, 同步日志标签,
            'sync: mediaPoll check#%{public}d elapsed=%{public}dms active=%{public}s everActive=%{public}s checked=%{public}s added=%{public}s removed=%{public}s',
            this.媒体检查次数, Date.now() - 轮询开始时间, 状态.active ? 'true' : 'false',
            this.媒体曾进入活跃 ? 'true' : 'false',
            状态.progress.checked, 状态.progress.added, 状态.progress.removed);
          // 完成判定：active=false 即算成功。
          // get_media_sync_status 在 task finished 时会 join 拿结果——正常完成返回 Ok
          // （走到本 then 分支），出错抛 Err（走 catch）。所以 active=false 且无异常 = 正常结束：
          // - everActive=true：有传输的正常完成
          // - everActive=false：rslib sync_inner 中 actions_performed=false（本地与远端一致，
          //   register_changes 后 client_usn==server_usn 且无 pending）的无变化快速完成。
          // syncMedia RPC 失败会走 catch 不会进轮询，故进轮询即说明任务已派发。
          if (!状态.active) {
            hilog.info(同步日志域, 同步日志标签,
              'sync: mediaPoll DONE (everActive=%{public}s, checkCount=%{public}d, elapsed=%{public}dms)',
              this.媒体曾进入活跃 ? 'true' : 'false', this.媒体检查次数, Date.now() - 轮询开始时间);
            this.是否在媒体阶段 = false;
            this.清理轮询定时器();
            this.媒体进度文案 = '';
            this.状态文案 = this.取本地化文案($r('app.string.sync_success'));
            this.setSyncPhase('done');
            // 媒体同步成功，清除待完成标志。
            设置媒体待同步(false);
            this.notifySyncResult();
          }
        })
        .catch((error: Error): void => {
          if (this.disposed) return;
          this.处理同步错误(error instanceof Error ? error : new Error(`${error}`));
        })
        .finally((): void => {
          this.mediaPollInFlight = false;
        });
    }, 1000);
  }

  // ========================================================
  // @块ID COMP-SYNC-PANEL-007
  // @名称 同步弹窗 UI 构建器与主构建
  //
  // @作用
  // 渲染弹窗：磨砂遮罩 + 居中浮卡。浮卡内按 当前阶段 切换三种内容：
  // - syncing：LoadingProgress + 同步文案 + 媒体进度（用户决策 2026-07-23 移除中止按钮）；
  // - conflict：冲突说明 + 上传/下载按钮（无取消，强制选方向）；
  // - done：状态/错误文案 + 关闭按钮。
  // 头部行：标题 + × 关闭按钮（仅 done 阶段显示 ×，避免误触）。
  //
  // @输入
  // 读 this.当前阶段 / this.状态文案 / this.错误文案 / this.媒体进度文案 / this.当前冲突类型 / this.账号名 等。
  //
  // @输出
  // 一个全屏 Stack：磨砂遮罩层 + 居中浮卡（88% 宽，maxWidth 480）。
  //
  // @业务规则
  // canClose=false 时遮罩不响应点击（避免 syncing/conflict 期间误关）。
  // conflict 阶段：fullDownload 不展示上传按钮；fullUpload 不展示下载按钮。
  //
  // @副作用
  // 无（仅渲染；按钮点击通过回调上抛）。
  // ========================================================

  @Builder
  private 头部行() {
    DialogHeader({
      title: this.取本地化文案($r('app.string.settings_sync_group')),
      actionLabel: $r('app.string.close'),
      actionEnabled: true,
      showClose: false,
      onAction: (): void => {
        this.dismissPresentation();
      }
    })
  }

  /** syncing 阶段：LoadingProgress + 文案 + 媒体进度（用户决策 2026-07-23：移除中止按钮）。 */
  @Builder
  private 同步中内容() {
    Row({ space: 8 }) {
      LoadingProgress()
        .width(18)
        .height(18)
        .color(this.取色板().主色)
      Text($r('app.string.sync_syncing'))
        .fontSize(应用尺寸.字号_正文)
        .fontColor(this.取色板().主文字)
    }
    .width('100%')
    .height(40)

    if (this.媒体进度文案 !== '') {
      Text(this.媒体进度文案)
        .fontSize(应用尺寸.字号_正文_小)
        .fontColor(this.取色板().次文字)
        .width('100%')
        .maxLines(2)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
    }
  }

  /** 冲突详情只在用户主动展开后显示，方向选择执行前再次检查。 */
  @Builder
  private 冲突内容() {
    Text($r('app.string.sync_conflict_title'))
      .fontSize(应用尺寸.字号_正文_中)
      .fontWeight(FontWeight.Medium)
      .fontColor(this.取色板().主文字)
      .width('100%')
    Text(this.当前冲突类型 === 'fullDownload' ? $r('app.string.sync_download_only_message')
      : this.当前冲突类型 === 'fullUpload' ? $r('app.string.sync_upload_only_message')
      : $r('app.string.sync_conflict_message'))
      .fontSize(应用尺寸.字号_正文_小)
      .fontColor(this.取色板().次文字)
      .width('100%')

    Row({ space: 应用尺寸.间距_10 }) {
      // 上传按钮：fullDownload 场景不展示
      if (this.当前冲突类型 !== 'fullDownload') {
        Button() {
          Text() { ThemeTextSpans($r('app.string.sync_conflict_upload'), this.themeAccentColors, this.getUIContext()) }.fontSize(应用尺寸.字号_按钮).fontColor(this.dialogActionColor)
        }
          .layoutWeight(1)
          .height(44)
          .fontSize(应用尺寸.字号_按钮)
          .fontColor(this.dialogActionColor)
          .backgroundColor(Color.Transparent)
          .borderRadius(22)
          .onClick((): void => {
            this.冲突确认(true);
          })
      }
      // 下载按钮：fullUpload 场景不展示
      if (this.当前冲突类型 !== 'fullUpload') {
        Button() {
          Text() { ThemeTextSpans($r('app.string.sync_conflict_download'), this.themeAccentColors, this.getUIContext()) }.fontSize(应用尺寸.字号_按钮).fontColor(this.dialogActionColor)
        }
          .layoutWeight(1)
          .height(44)
          .fontSize(应用尺寸.字号_按钮)
          .fontColor(this.dialogActionColor)
          .backgroundColor(Color.Transparent)
          .borderRadius(22)
          .onClick((): void => {
            this.冲突确认(false);
          })
      }
    }
    .width('100%')
  }

  /** done 阶段：状态/错误文案 + 关闭按钮。 */
  @Builder
  private 完成内容() {
    if (this.状态文案 !== '') {
      Text() { ThemeTextSpans(this.状态文案, this.themeAccentColors, this.getUIContext()) }
        .fontSize(应用尺寸.字号_正文_小)
        .fontColor(this.取色板().主色)
        .width('100%')
    }
    if (this.错误文案 !== '') {
      Text(this.错误文案)
        .fontSize(应用尺寸.字号_正文_小)
        .fontColor(this.取色板().错误色)
        .width('100%')
        .maxLines(8)
      Button($r('app.string.sync_retry'))
        .onClick((): void => { this.onRetry(); })
    }

  }

  @Builder
  private syncDialog() {
    Stack() {
      // 磨砂玻璃遮罩：canClose=false 时不响应点击
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor(this.取色板().遮罩)
        .backgroundBlurStyle(BlurStyle.Thin, {
          colorMode: this.是否深色 ? ThemeColorMode.DARK : ThemeColorMode.LIGHT,
          adaptiveColor: AdaptiveColor.DEFAULT
        })
        .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
        .onClick((): void => {
          this.dismissPresentation();
        })
        .transition(TransitionEffect.OPACITY.animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }))

      Column({ space: 应用尺寸.间距_12 }) {
        this.头部行()

        if (this.账号名 !== '') {
          Text(this.账号名)
            .fontSize(应用尺寸.字号_正文)
            .fontColor(this.取色板().次文字)
            .width('100%')
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }

        if (this.当前阶段 === 'syncing') {
          this.同步中内容()
        } else if (this.当前阶段 === 'conflict') {
          this.冲突内容()
        } else {
          this.完成内容()
        }
      }
      .width('88%')
      .constraintSize({ maxWidth: 480, maxHeight: '88%' })
      .padding(20)
      .backgroundColor(this.取色板().背景)
      .borderRadius(应用尺寸.圆角_卡片)
      .transition(TransitionEffect.asymmetric(
        TransitionEffect.opacity(0)
          .combine(TransitionEffect.scale({ x: 0.96, y: 0.96 }))
          .animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }),
        TransitionEffect.opacity(0)
          .animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() })
      ))
    }
    .width('100%')
    .height('100%')
  }

  build() {
    Stack({ alignContent: Alignment.Top }) {
      if (this.detailsVisible) {
        this.syncDialog()
      }
    }
    .width('100%')
    .height('100%')
    .hitTestBehavior(!this.detailsVisible ?
      HitTestMode.Transparent : HitTestMode.Default)
  }
}
