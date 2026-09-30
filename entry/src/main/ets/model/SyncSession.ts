// SPDX-License-Identifier: AGPL-3.0-or-later
import type { MediaSyncStatusResponse, SyncAuth, SyncCollectionResponse } from '../proto/messages/SyncMessages';
import { 应用新端点, 分类同步错误, 判定集合同步走向, 提取新端点 } from './同步流程';
import type { 集合同步结果走向 } from './同步流程';
import { SyncActivity } from './SyncSettings';
import { AutoSyncScheduler } from './AutoSyncScheduler';

const 同步日志域: number = 0x4342;
const 同步日志标签: string = 'jidecards';
type 冲突类型 = 'fullSync' | 'fullDownload' | 'fullUpload';

export interface SyncBackend {
  同步集合(auth: SyncAuth, media: boolean): Promise<SyncCollectionResponse>;
  全量上传或下载(auth: SyncAuth, upload: boolean, usn: number | null): Promise<void>;
  同步媒体(auth: SyncAuth): Promise<void>;
  中止同步(): Promise<void>;
  中止媒体同步(): Promise<void>;
  媒体同步状态(): Promise<MediaSyncStatusResponse>;
}
export interface SyncSessionSnapshot {
  当前阶段: 'syncing' | 'conflict' | 'done';
  状态文案: string;
  错误文案: string;
  媒体进度文案: string;
  当前冲突类型: 冲突类型;
  是否请求中止: boolean;
  是否在媒体阶段: boolean;
  detailsVisible: boolean;
}
export interface SyncSessionLog {
  info(domain: number, tag: string, message: string, ...args: Array<string | number>): void;
  warn(domain: number, tag: string, message: string, ...args: Array<string | number>): void;
  error(domain: number, tag: string, message: string, ...args: Array<string | number>): void;
}
export interface SyncSessionEnvironment {
  text(key: string): string;
  toast(message: string): void;
  changed(state: SyncSessionSnapshot): void;
  activityChanged(busy: boolean, modal: boolean): void;
  statusChanged(text: string, indicator: string): void;
  collectionCompleted(fsrsDisabled: boolean): void;
  close(): void;
  yielded(automatic: boolean): void;
  加载FSRS开启状态(): Promise<boolean | null>;
  notifyFsrsStateChanged(): void;
  加载媒体同步开关(): boolean;
  设置媒体待同步(value: boolean): void;
  保存同步端点(value: string): void;
  清除同步凭证(): void;
  errorKind(error: Error): number | undefined;
  requestBackgroundTime(expired: () => void): number;
  releaseBackgroundTime(id: number): void;
  setInterval(callback: () => void, delay: number): number;
  clearInterval(id: number): void;
  setTimeout(callback: () => void, delay: number): number;
  clearTimeout(id: number): void;
  log: SyncSessionLog;
}

/** 根宿主的一次同步任务。展示销毁只禁止通知，已接受 IO 落定后才归还租约。
 * 此会话是媒体终态的唯一消费者；设置、学习和清理仅观察 SyncActivity。
 */
export class SyncSession {
  private environment: SyncSessionEnvironment;
  private activity: SyncActivity;
  private scheduler: AutoSyncScheduler;
  private automatic: boolean;
  private 初始鉴权: SyncAuth | null;
  private detailsVisible: boolean = false;
  private syncForeground: boolean = true;
  private 状态变化回调: (busy: boolean, modal: boolean) => void;
  private statusChanged: (text: string, indicator: string) => void;
  private 同步完成回调: (disabled: boolean) => void;
  private 关闭回调: () => void;
  private onYield: (automatic: boolean) => void;
  private 当前阶段: 'syncing' | 'conflict' | 'done' = 'syncing';
  private 状态文案: string = '';
  private 错误文案: string = '';
  private 媒体进度文案: string = '';
  private 当前冲突类型: 冲突类型 = 'fullSync';
  private 是否请求中止: boolean = false;

  // 任务资源只由本会话持有，不作为展示快照传给组件。
  private 鉴权: SyncAuth | null = null;
  private 轮询定时器: number = -1;
  private 媒体检查次数: number = 0;
  /** 仅用于进度诊断；inactive 的终态由 Core 判定。 */
  private 媒体曾进入活跃: boolean = false;
  private 待定服务器USN: number | null = null;
  private 是否在媒体阶段: boolean = false;
  /** syncCollection 已完成（数据已写入本地 DB）；中止后据此决定是否刷新牌组列表。 */
  private 集合已同步: boolean = false;
  private readonly 同步服务实例: SyncBackend;
  private readonly syncOwner: Object = new Object();
  private ownsSync: boolean = false;
  private disposed: boolean = false;
  private mediaPollInFlight: boolean = false;
  private fsrsBeforeSync: boolean | null = null;
  private fsrsDisabledBySync: boolean = false;
  private collectionResultNotified: boolean = false;
  private lastCompletionToast: string = '';
  private suspendDelayId: number = -1;
  private yieldingForStudy: boolean = false;
  private syncAborted: boolean = false;
  private fullSyncInFlight: boolean = false;
  private collectionCallInFlight: boolean = false;
  private abortTimer: number = -1;
  private abortCall: Promise<void> | null = null;
  private syncTask: Promise<void> | null = null;
  private mediaStart: Promise<void> | null = null;
  private mediaMayBeRunning: boolean = false;
  private disposalStarted: boolean = false;


  constructor(auth: SyncAuth | null, automatic: boolean, backend: SyncBackend,
    environment: SyncSessionEnvironment, activity: SyncActivity, scheduler: AutoSyncScheduler) {
    this.初始鉴权 = auth;
    this.automatic = automatic;
    this.同步服务实例 = backend;
    this.environment = environment;
    this.activity = activity;
    this.scheduler = scheduler;
    this.状态变化回调 = environment.activityChanged;
    this.statusChanged = environment.statusChanged;
    this.同步完成回调 = environment.collectionCompleted;
    this.关闭回调 = environment.close;
    this.onYield = environment.yielded;
  }

  snapshot(): SyncSessionSnapshot {
    return { 当前阶段: this.当前阶段, 状态文案: this.状态文案, 错误文案: this.错误文案, 媒体进度文案: this.媒体进度文案, 当前冲突类型: this.当前冲突类型, 是否请求中止: this.是否请求中止, 是否在媒体阶段: this.是否在媒体阶段, detailsVisible: this.detailsVisible };
  }
  aboutToAppear(): void {
    this.disposed = false;
    this.ownsSync = this.activity.acquire(this.syncOwner, (): void => { this.requestBackgroundTime(); });
    if (!this.ownsSync) {
      this.错误文案 = this.取本地化文案('sync_already_running');
      this.setSyncPhase('done');
      return;
    }
    this.publishSyncState();
    this.鉴权 = this.初始鉴权;
    this.activity.setStudyYieldHandler(this.syncOwner, (): boolean => this.requestStudyYield());
    this.启动同步();
  }

  aboutToDisappear(): void {
    this.disposed = true;
    this.releaseSuspendDelay();
    this.stopAbortTimer();
    this.清理轮询定时器();
    if (!this.ownsSync || this.disposalStarted) return;
    this.disposalStarted = true;
    if (this.当前阶段 === 'done' ||
      (this.syncTask === null && this.mediaStart === null && !this.mediaMayBeRunning)) {
      this.activity.release(this.syncOwner, Date.now());
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
      this.environment.log.warn(同步日志域, 同步日志标签, 'sync: detached operation finished with error');
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
          this.environment.log.warn(同步日志域, 同步日志标签, 'sync: waiting for detached media termination');
        }
        await new Promise<void>((resolve: () => void): void => { this.environment.setTimeout(resolve, 1000); });
      }
    }
    this.activity.release(this.syncOwner, Date.now());
  }

  /** 任务生命周期独立于详情显隐；集合阶段只保护数据库入口，不覆盖首页。 */
  private publishSyncState(): void {
    if (this.disposed) return;
    this.activity.setCollectionBusy(this.syncOwner, this.当前阶段 === 'syncing' && !this.是否在媒体阶段);
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
        'sync_background_error' : 'sync_needs_attention');
    } else if (this.当前阶段 === 'done') {
      indicator = this.syncAborted ? 'paused' : 'done';
      text = this.状态文案;
    } else if (this.yieldingForStudy) {
      indicator = 'waiting';
      text = this.取本地化文案('sync_yielding');
    } else {
      text = this.是否在媒体阶段 ?
        this.媒体进度文案 || this.取本地化文案('sync_syncing_media') :
        this.取本地化文案('sync_syncing');
    }
    if (this.disposed) return;
    this.environment.changed(this.snapshot());
    this.statusChanged(text, indicator);
  }

  showDetails(): void {
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
      this.abortTimer = this.environment.setInterval((): void => { this.sendAbort(); }, 50);
    }
    return true;
  }

  /** 覆盖取消早于 Core 注册句柄的竞态；同一时刻只发送一个取消请求。 */
  private sendAbort(): void {
    if (this.disposed || !this.collectionCallInFlight || this.abortCall !== null) return;
    this.abortCall = this.同步服务实例.中止同步()
      .catch((): void => { this.environment.log.warn(同步日志域, 同步日志标签, 'sync: abort signal failed, retrying'); })
      .finally((): void => { this.abortCall = null; });
  }

  private stopAbortTimer(): void {
    if (this.abortTimer >= 0) this.environment.clearInterval(this.abortTimer);
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
    if (phase === 'done') this.activity.release(this.syncOwner, Date.now());
    this.publishSyncState();
  }

  /** 自动详情可以收起，正在执行的任务继续由根宿主持有。 */
  dismissPresentation(): void {
    if (this.当前阶段 !== 'done') {
      this.detailsVisible = false;
      this.publishSyncState();
    } else if (this.是否允许关闭()) {
      this.关闭回调();
    }
  }

  /** 仅给已启动的同步申请退后台收尾时间，不创建后台轮询任务。 */
  syncForegroundChanged(): void {
    if (this.syncForeground) {
      this.releaseSuspendDelay();
    }
  }

  /** 必须由 Ability 退后台回调同步触发，不能等 ArkUI Watch 调度。 */
  private requestBackgroundTime(): void {
    if (this.disposed || this.当前阶段 !== 'syncing' || !this.ownsSync || this.suspendDelayId >= 0) return;
    this.suspendDelayId = this.environment.requestBackgroundTime((): void => { this.releaseSuspendDelay(); });
  }

  /** 完成、恢复前台或超时均归还短时任务配额。 */
  private releaseSuspendDelay(): void {
    if (this.suspendDelayId < 0) return;
    const id: number = this.suspendDelayId;
    this.suspendDelayId = -1;
    this.environment.releaseBackgroundTime(id);
  }

  /** 卡片与媒体分别提示各自完成，重复回调不重复提示同一阶段。 */
  private notifySyncResult(): void {
    if (this.disposed) return;
    this.notifyCollectionResult();
    if (this.当前阶段 === 'done' && this.错误文案 === '' && !this.是否请求中止) {
      this.showCompletionToast();
      this.关闭回调();
    }
  }

  private showCompletionToast(): void {
    if (this.lastCompletionToast === this.状态文案 || (this.automatic && !this.detailsVisible)) return;
    this.lastCompletionToast = this.状态文案;
    this.environment.toast(this.状态文案);
  }

  /** 集合成功提交后立即取样，避免媒体阶段影响变化判定；未知值不推断为关闭。 */
  private async captureFsrsAfterSync(): Promise<void> {
    const after: boolean | null = await this.environment.加载FSRS开启状态();
    this.fsrsDisabledBySync = this.fsrsBeforeSync === true && after === false;
    this.environment.log.info(同步日志域, 同步日志标签, 'sync: FSRS before=%{public}s after=%{public}s disabledBySync=%{public}s',
      `${this.fsrsBeforeSync}`, `${after}`, `${this.fsrsDisabledBySync}`);
    this.environment.notifyFsrsStateChanged();
  }

  /** 集合提交立即通知一次；后续媒体成功、失败或中止不会重复刷新。 */
  private notifyCollectionResult(): void {
    if (this.disposed || this.collectionResultNotified) return;
    this.collectionResultNotified = true;
    this.同步完成回调(this.fsrsDisabledBySync);
  }

  private 取本地化文案(key: string): string { return this.environment.text(key); }



  /** 清理媒体轮询定时器。 */
  private 清理轮询定时器(): void {
    if (this.轮询定时器 >= 0) {
      this.environment.clearInterval(this.轮询定时器);
      this.轮询定时器 = -1;
    }
  }

  /** 终态可以销毁任务；其他阶段只收起详情。 */
  private 是否允许关闭(): boolean {
    return this.当前阶段 === 'done' && !this.是否请求中止;
  }

  /** 中止落定态：清轮询、置 done、显示「已中止」文案。 */
  private 完成中止(): void {
    const 集合是否已同步: boolean = this.集合已同步;
    this.syncAborted = true;
    this.是否请求中止 = false;
    this.集合已同步 = false;
    this.是否在媒体阶段 = false;
    this.清理轮询定时器();
    this.媒体进度文案 = '';
    this.状态文案 = this.取本地化文案('sync_aborted');
    if (this.yieldingForStudy) this.onYield(this.automatic);
    this.setSyncPhase('done');
    // syncCollection 已完成（数据已入 DB）但用户中止了媒体阶段：仍需刷新牌组列表，
    // 否则用户看不到刚同步的牌组，再点同步又显示「已最新」但 UI 不更新。
    if (集合是否已同步) {
      this.environment.log.info(同步日志域, 同步日志标签, 'sync: aborted after collection synced, refreshing deck list');
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
    this.状态文案 = 集合是否已同步 ? this.取本地化文案('sync_collection_complete') : '';
    const 后端错误类别: number | undefined = this.environment.errorKind(error);
    const 错误类别 = 分类同步错误(error, 后端错误类别);
    this.environment.log.error(同步日志域, 同步日志标签, 'sync error: kind=%{public}s backendKind=%{public}d msg=%{public}s',
      错误类别, 后端错误类别 ?? -1, error.message);
    if (错误类别 === 'auth') {
      this.environment.清除同步凭证();
      this.鉴权 = null;
      this.错误文案 = this.取本地化文案('sync_error_session_expired');
    } else if (错误类别 === 'network') {
      this.错误文案 = `${this.取本地化文案('sync_error_network')} [kind=${后端错误类别 ?? -1}]：${error.message}`;
    } else {
      this.错误文案 = `${this.取本地化文案('sync_error_generic')} [kind=${后端错误类别 ?? -1}]：${error.message}`;
    }
    this.setSyncPhase('done');
    // 媒体阶段出错时集合同步已完成（数据已入 DB），仍需刷新牌组列表让用户看到已同步的牌组。
    if (集合是否已同步) {
      this.environment.log.info(同步日志域, 同步日志标签, 'sync: error after collection synced, refreshing deck list');
      this.notifyCollectionResult();
    }
  }

  /** 启动同步：SyncCollection → 媒体阶段。 */
  private 启动同步(): Promise<void> {
    if (this.disposed || this.syncTask !== null) return Promise.resolve();
    this.syncTask = this.runSync().finally((): void => { this.syncTask = null; });
    return this.syncTask;
  }

  private async runSync(): Promise<void> {
    const 当前鉴权: SyncAuth | null = this.鉴权;
    if (当前鉴权 === null) {
      this.错误文案 = this.取本地化文案('sync_error_session_expired');
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
    this.lastCompletionToast = '';
    this.setSyncPhase('syncing');
    try {
      let 鉴权: SyncAuth = 当前鉴权;
      // 媒体同步开关关闭时，中止上次同步可能仍在运行的后台媒体同步线程
      // （rslib 后台线程不会因关闭弹窗而停止，需显式中止）。
      if (!this.environment.加载媒体同步开关()) {
        this.environment.log.info(同步日志域, 同步日志标签, 'sync: media sync disabled, aborting any running background media sync');
        await this.同步服务实例.中止媒体同步();
      }
      // 对齐 Anki：真正同步直接访问 syncCollection，不能被 syncStatus 的五分钟缓存短路。
      // 读取媒体同步开关（对齐 Anki 桌面端 Preferences → Sync → "Sync media"）。
      // 关闭时 syncMedia=false（rslib 不挂起媒体同步任务），同步面板跳过媒体阶段。
      const 媒体同步开启: boolean = this.environment.加载媒体同步开关();
      this.fsrsBeforeSync = await this.environment.加载FSRS开启状态();
      if (this.disposed) return;
      if (this.是否请求中止) {
        this.完成中止();
        return;
      }
      this.environment.log.info(同步日志域, 同步日志标签, 'sync: calling syncCollection syncMedia=%{public}s',
        媒体同步开启 ? 'true' : 'false');
      this.mediaMayBeRunning = 媒体同步开启;
      const 集合响应: SyncCollectionResponse = await this.syncCollectionWithPriority(鉴权, 媒体同步开启);
      if (this.disposed) {
        const endpoint: string = 提取新端点(集合响应);
        if (endpoint !== '') this.environment.保存同步端点(endpoint);
        if (判定集合同步走向(集合响应) === 'done') {
          this.environment.设置媒体待同步(媒体同步开启);
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
        this.environment.保存同步端点(集合端点);
      }
      const 走向: 集合同步结果走向 = 判定集合同步走向(集合响应);
      this.environment.log.info(同步日志域, 同步日志标签,
        'sync: syncCollection done required=%{public}d outcome=%{public}s serverMediaUsn=%{public}d hostNumber=%{public}d serverMsg=%{public}s',
        集合响应.required, 走向, 集合响应.serverMediaUsn, 集合响应.hostNumber, 集合响应.serverMessage);
      if (走向 === 'done') {
        // outcome=done = 集合已原子提交到本地 DB；标记以便后续中止时刷新牌组列表。
        this.environment.设置媒体待同步(媒体同步开启);
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
          this.environment.log.info(同步日志域, 同步日志标签, 'sync: syncCollection done, media sync disabled, skipping media phase');
          // 媒体同步已禁用，清除待完成标志（避免上次中断的媒体同步残留标志干扰）。
          this.environment.设置媒体待同步(false);
          this.状态文案 = this.取本地化文案('sync_success');
          this.setSyncPhase('done');
          this.notifySyncResult();
          return;
        }
        // 集合同步成功，媒体同步待完成——若媒体同步被中断，下次同步凭此标志继续。
        this.environment.设置媒体待同步(true);
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
      this.environment.log.info(同步日志域, 同步日志标签, 'sync: entering conflict phase kind=%{public}s', 走向);
    } catch (error) {
      this.处理同步错误(error instanceof Error ? error : new Error(`${error}`));
    }
  }

  /** 冲突确认：FullUploadOrDownload 成功后进入媒体阶段。 */
  冲突确认(是否上传: boolean): Promise<void> {
    if (this.disposed || this.syncTask !== null) return Promise.resolve();
    this.syncTask = this.runFullSync(是否上传).finally((): void => { this.syncTask = null; });
    return this.syncTask;
  }

  private async runFullSync(是否上传: boolean): Promise<void> {
    if (this.当前阶段 !== 'conflict' || !this.scheduler.canSync()) return;
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
      this.fsrsBeforeSync = await this.environment.加载FSRS开启状态();
      if (this.disposed) return;
      const response: SyncCollectionResponse = await this.同步服务实例.同步集合(鉴权, false);
      const endpoint: string = 提取新端点(response);
      if (this.disposed) {
        if (endpoint !== '') this.environment.保存同步端点(endpoint);
        if (判定集合同步走向(response) === 'done') {
          this.environment.设置媒体待同步(this.environment.加载媒体同步开关());
          await this.captureFsrsAfterSync();
        }
        return;
      }
      if (endpoint !== '') {
        this.鉴权 = 应用新端点(鉴权, endpoint);
        this.environment.保存同步端点(endpoint);
      }
      const outcome: 集合同步结果走向 = 判定集合同步走向(response);
      this.待定服务器USN = response.serverMediaUsn;
      if (outcome === 'done') {
        this.environment.设置媒体待同步(this.environment.加载媒体同步开关());
        this.集合已同步 = true;
        await this.captureFsrsAfterSync();
        if (this.disposed) return;
        this.fullSyncInFlight = false;
        this.notifyCollectionResult();
        if (this.environment.加载媒体同步开关()) {
          this.environment.设置媒体待同步(true);
          this.启动媒体阶段(this.鉴权!, true);
        } else {
          this.状态文案 = this.取本地化文案('sync_success');
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
    const 媒体同步开启: boolean = this.environment.加载媒体同步开关();
    const 服务器USN: number | null = 媒体同步开启 ? this.待定服务器USN : null;
    this.environment.log.info(同步日志域, 同步日志标签,
      'sync: calling fullUploadOrDownload upload=%{public}s serverUsn=%{public}s mediaEnabled=%{public}s',
      是否上传 ? 'true' : 'false', 服务器USN === null ? 'null' : `${服务器USN}`, 媒体同步开启 ? 'true' : 'false');
    this.mediaMayBeRunning = 媒体同步开启;
    await this.同步服务实例.全量上传或下载(this.鉴权!, 是否上传, 服务器USN)
      .then(async (): Promise<void> => {
        this.environment.设置媒体待同步(媒体同步开启);
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
          this.environment.log.info(同步日志域, 同步日志标签, 'sync: fullUploadOrDownload done, media sync disabled, skipping media phase');
          this.environment.设置媒体待同步(false);
          this.状态文案 = this.取本地化文案('sync_success');
          this.setSyncPhase('done');
          this.notifySyncResult();
          return;
        }
        this.environment.log.info(同步日志域, 同步日志标签, 'sync: fullUploadOrDownload done, entering media phase');
        // 集合同步成功，媒体同步待完成——若媒体同步被中断，下次同步凭此标志继续。
        this.environment.设置媒体待同步(true);
        this.启动媒体阶段(this.鉴权!);
      })
      .catch((error: Error): void => {
        this.fullSyncInFlight = false;
        this.处理同步错误(error instanceof Error ? error : new Error(`${error}`));
      });
  }

  /**
   * 常规/全量同步由 Core 启动媒体，此处只监测；重检未启动媒体时才显式启动。
   * rslib 约定：媒体同步出错后下一次 MediaSyncStatus 返回错误（走 catch 分支）。
   */
  private 启动媒体阶段(鉴权: SyncAuth, startMedia: boolean = false): void {
    if (this.是否请求中止) {
      this.完成中止();
      return;
    }
    this.是否在媒体阶段 = true;
    this.状态文案 = this.取本地化文案('sync_collection_complete');
    this.showCompletionToast();
    this.notifyCollectionResult();
    this.setSyncPhase('syncing');
    this.mediaMayBeRunning = true;
    if (!startMedia) {
      this.开始媒体轮询();
      return;
    }
    const RPC开始时间: number = Date.now();
    this.environment.log.info(同步日志域, 同步日志标签,
      'sync: calling syncMedia (background start) at %{public}d', RPC开始时间);
    this.mediaMayBeRunning = true;
    this.mediaStart = this.同步服务实例.同步媒体(鉴权)
      .then((): void => {
        if (this.disposed) return;
        if (this.是否请求中止) {
          this.完成中止();
          return;
        }
        this.environment.log.info(同步日志域, 同步日志标签,
          'sync: syncMedia RPC returned in %{public}dms, starting polling', Date.now() - RPC开始时间);
        this.开始媒体轮询();
      })
      .catch((error: Error): void => {
        this.environment.log.error(同步日志域, 同步日志标签,
          'sync: syncMedia RPC FAILED in %{public}dms: %{public}s',
          Date.now() - RPC开始时间, error instanceof Error ? error.message : `${error}`);
        this.处理同步错误(error instanceof Error ? error : new Error(`${error}`));
      })
      .finally((): void => { this.mediaStart = null; });
  }

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
    this.environment.log.info(同步日志域, 同步日志标签, 'sync: mediaPoll START at %{public}d', 轮询开始时间);
    this.轮询定时器 = this.environment.setInterval((): void => {
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
          this.媒体进度文案 = `${this.取本地化文案('sync_syncing_media')} ` +
            `${状态.progress.checked}  ${状态.progress.added}  ${状态.progress.removed}`;
          this.publishStatus();
          this.environment.log.info(同步日志域, 同步日志标签,
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
            this.environment.log.info(同步日志域, 同步日志标签,
              'sync: mediaPoll DONE (everActive=%{public}s, checkCount=%{public}d, elapsed=%{public}dms)',
              this.媒体曾进入活跃 ? 'true' : 'false', this.媒体检查次数, Date.now() - 轮询开始时间);
            this.是否在媒体阶段 = false;
            this.清理轮询定时器();
            this.媒体进度文案 = '';
            this.状态文案 = this.取本地化文案('sync_media_complete');
            this.setSyncPhase('done');
            // 媒体同步成功，清除待完成标志。
            this.environment.设置媒体待同步(false);
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


}
