// SPDX-License-Identifier: AGPL-3.0-or-later
import { resourceText, showToastSafely } from '../utils/UiFeedback';
import { DataTransferSession, DataTransferState, initialTransferState } from '../model/home/DataTransferSession';
import { AnkiDataTransfer } from '../backend/AnkiDataTransfer';
import { reconcileHomeExpansion, HomeDeckExpansion } from '../model/HomeDeckExpansion';
import { HomeRefreshQueue } from '../model/HomeRefreshQueue';
import { HomeDataRepository, HomeDataResult } from '../backend/HomeDataRepository';
import { HomeWorkCoordinator, HomeWorkHost } from '../model/HomeWorkCoordinator';
import { HomeStartupSequence, HomeStartupHost } from '../model/HomeStartupSequence';
import { AutoSyncScheduler, autoSyncScheduler } from '../model/AutoSyncScheduler';
import { HomeSyncController, HomeSyncHost } from '../model/HomeSyncController';
import { ThemeTextSpans } from '../components/common/ThemeText';
import { 按下态按钮 } from '../components/common/按下态按钮';
import { THEME_TEXT_COLORS_KEY } from '../model/ThemeCatalog';
import { PAGE_SURFACE_KEY } from '../model/ThemeCatalog';

import { bundleManager, common } from '@kit.AbilityKit';
import { promptAction } from '@kit.ArkUI';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { 后端会话 } from '../backend/后端会话';
import { 牌组服务 } from '../backend/牌组服务';

import { 搜索服务 } from '../backend/搜索服务';
import { 卡片预览页 } from '../components/browser/卡片预览页';
import { deckHistorySearch } from '../model/DeckStudyHistory';
import { makeParsableTextNode } from '../proto/messages/SearchMessages';
import type { SearchRequest, SortOrder } from '../proto/messages/SearchMessages';
import { initializeRedemption } from '../utils/RedemptionStore';
import { UNLOCKED_CONTENTS_KEY, isThemeAvailable } from '../model/ThemeCatalog';
import { ThemeBackground } from '../components/common/ThemeBackground';

import { 牌组详情面板 } from '../components/牌组详情面板';

import { 主页操作面板 } from '../components/主页操作面板';
import { CloudDeckFeature } from '../components/home/CloudDeckFeature';
import { HomeActivityState, canPresentHomePrompt, canStartHomeAutoSync } from '../model/HomeActivityPolicy';
import { BackupBackend } from '../model/BackupCoordinator';
import { HomeBackupController, HomeBackupHost } from '../model/HomeBackupController';
import { LocalBackups, loadAutomaticBackup } from '../backend/LocalBackups.ets';
import { HomeAnnouncementController } from '../model/HomeAnnouncementController';
import { externalDeckOpens, EXTERNAL_DECK_OPEN_REVISION_KEY } from '../model/ExternalDeckOpen';
import { 官方公告弹窗 } from '../components/官方公告弹窗';
import { 官方公告服务 } from '../backend/官方公告服务';
import { 官方公告检查延迟毫秒 } from '../model/官方公告模型';
import type { 官方公告展示项 } from '../model/官方公告模型';
import { 是否已确认官方公告, 标记已确认官方公告 } from '../model/官方公告存储';
import { DeckCustomizationFeature } from '../components/home/DeckCustomizationFeature';
import { 添加笔记页, 添加笔记页参数, 添加笔记牌组选项 } from './添加笔记页';
import { AI制卡页, AI制卡页参数 } from './AI制卡页';
import type { 数据迁移模式, 导出牌组选项 } from '../model/DataTransferIntent';
import { 同步面板 } from '../components/同步面板';
import { syncActivity } from '../model/SyncSettings';
import { 加载同步凭证, 同步凭证信息, loadAutoSyncEnabled } from '../model/同步凭证存储';
import { APP_FOREGROUND_KEY } from '../model/Redemption';
import { 主页顶部工具栏 } from '../components/home/主页顶部工具栏';
import { 主页更多面板 } from '../components/home/主页更多面板';
import { 学习提醒页 } from './学习提醒页';
import { 设置页 } from './设置页';
import { 设置页参数, 浏览页参数 } from '../model/navigation/PageParams';
import { 主页摘要分页 } from '../components/home/主页摘要分页';
import { 主页牌组列表 } from '../components/home/主页牌组列表';
import { DeckOptionsFeature } from '../components/home/DeckOptionsFeature';
import { DataTransferFeature } from '../components/home/DataTransferFeature';
import { CreateDeckFeature } from '../components/home/CreateDeckFeature';
import { 自定义学习对话框 } from '../components/home/自定义学习对话框';
import { 创建过滤牌组面板 } from '../components/home/创建过滤牌组面板';
import type { SyncAuth } from '../proto/messages/SyncMessages';

import { 学习页, 学习页参数 } from './学习页';
import { 浏览页 } from './浏览页';
import { 统计页, 统计页参数 } from './统计页';

import {
  牌组列表数据源,
  牌组汇总,
  牌组色调,
  空牌组汇总,
  空主页快照,
  主页加载状态,
  主页快照,
  牌组显示名
} from '../model/主页模型';
import { 解析是否深色, 主题模式 } from '../model/主题设置';
import { 加载主题模式, 保存主题模式 } from '../model/主题存储';
import { 颜色主题, 颜色键, 默认颜色主题 } from '../model/颜色主题';
import { 加载颜色主题, 保存颜色主题 } from '../model/颜色主题存储';
import { 应用颜色主题 } from '../utils/颜色主题管理器';
import { 保存牌组色调 } from '../model/牌组元数据存储';
import { 保存牌组顺序 } from '../model/牌组顺序存储';
import { 隐藏牌组, 取消隐藏全部牌组 } from '../model/隐藏牌组存储';
import { 加载上次牌组ID, 保存上次牌组ID, 清除上次牌组ID } from '../model/上次牌组存储';
import { 加载FSRS开启状态, 设置FSRS开启状态, 刷新桌面卡片数据 } from '../model/FSRS控制器';
import { 加载显示今日进度卡, 主页今日进度卡AppStorage键 } from '../model/主页偏好';
import { 桌面卡片数据 } from '../model/桌面卡片数据存储';
import { 应用主题 } from '../utils/主题控制器';
import { 应用尺寸 } from '../utils/应用尺寸';
import { 可见牌组行 } from '../model/牌组层级';
import { 检查节流标记, 获取节流奖励 } from '../utils/操作节流';
import { HomeIntroPanel } from '../components/HomeIntroPanel';
import { isHomeIntroCompleted, completeHomeIntro } from '../utils/HomeIntroStore';
import { DeckMediaCleanup } from '../model/DeckMediaCleanup';
import { 媒体服务 } from '../backend/媒体服务';
import { 同步服务 } from '../backend/同步服务';
import {
  是否已完成云端牌组引导,
  是否已用尽云端牌组下载配额
} from '../model/云端牌组引导存储';
import { 取全屏转场时长, 取全屏转场曲线 } from '../utils/转场时长';
import { CustomTransition } from '../utils/自定义转场';
import { 当前语言模式 } from '../model/语言存储';
import {
  AgentSettings,
  isAgentProviderConfigured,
  loadAgentSettings
} from '../backend/agent/AgentSettingsStore';
import { loadAgentSecret } from '../backend/agent/AgentSecretStore';

/** 窄屏详情页推栈参数：牌组 id 经 param 传递，页面内按 id 取最新快照数据 */
interface 牌组详情页参数 {
  deckId?: string;
}

@Entry
@Component
struct 首页 {
  @State @Watch('homeActivityChanged') private transfer: DataTransferState = initialTransferState();
  private readonly transferSession: DataTransferSession = new DataTransferSession(new AnkiDataTransfer(),
    (state: DataTransferState): void => { this.transfer = state; },
    async (): Promise<void> => {
      const before: Set<string> = new Set(this.主页快照数据.decks.map((deck: 牌组汇总): string => deck.id));
      await this.加载主页数据();
      if (!this.homeDisposed) this.展开新导入牌组(before);
    }, (): void => { this.显示提示($r('app.string.transfer_done')); });

  private 从选择器导入牌组(): void {
    if (this.deferForSync((): void => this.从选择器导入牌组())) return;
    this.transferSession.open('importDeck', 0, false);
    this.transferSession.execute({ kind: 'importDeck' });
  }

  private importDeckUri(uri: string): Promise<void> { return this.transferSession.importUri(uri); }

  private 打开数据迁移(mode: 数据迁移模式, deckId: number, allowDeckSelection: boolean): void {
    if (this.deferForSync((): void => this.打开数据迁移(mode, deckId, allowDeckSelection))) return;
    this.transferSession.open(mode, deckId, allowDeckSelection);
  }

  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  private readonly 牌组列表滚动器: Scroller = new Scroller();
  private readonly 页面栈: NavPathStack = new NavPathStack();
  private readonly 牌组数据源: 牌组列表数据源 = new 牌组列表数据源([]);
  private readonly 牌组服务实例: 牌组服务 = new 牌组服务();
  private readonly homeData: HomeDataRepository = new HomeDataRepository();
  private readonly 搜索服务实例: 搜索服务 = new 搜索服务();
  private readonly 官方公告服务实例: 官方公告服务 = new 官方公告服务();
  @State @Watch('homeActivityChanged') private 显示官方公告: boolean = false;
  @State private 官方公告数据: 官方公告展示项 | null = null;
  @State private 官方公告确认中: boolean = false;
  private 主页公告检查已激活: boolean = false;
  private 主页允许公告检查: boolean = true;
  private 上次官方公告检查开始时间: number = 0;
  private 官方公告检查中: boolean = false;
  private 官方公告延迟检查任务: number = -1;
  private readonly announcementController: HomeAnnouncementController = new HomeAnnouncementController();
  private homeDisposed: boolean = false;
  private readonly homeWork: HomeWorkCoordinator = new HomeWorkCoordinator(externalDeckOpens, {
    schedule: (work: () => void): number => setTimeout(work, 0),
    cancel: (id: number): void => clearTimeout(id)
  });
  private readonly startupSequence: HomeStartupSequence = new HomeStartupSequence();
  @State @Watch('homeActivityChanged') private nativeDialogOpen: boolean = false;
  @StorageLink('systemDarkMode') private 系统暗黑模式: boolean = false;
  // 笔记添加广播：添加笔记页保存成功后写 noteAddedTick = Date.now()，
  // 这里 @Watch 监听变化触发 加载主页数据，绕开 NavPathStack.onPop 偶发不触发的问题，
  // 让 牌组详情面板 的统计计数（总卡数/新卡/学习中/待复习）立即刷新。
  // 与 打开添加笔记 的 onPop 回调并存：两者都触发时 加载主页数据 多跑一次（幂等，无副作用）。
  @StorageLink('noteAddedTick') @Watch('笔记添加广播_回调') private 笔记添加标记: number = 0;
  // 桌面卡片 DeepLink 信号：EntryAbility 处理DeepLink 收到 jidecards://stats 时写时间戳，
  // @Watch 监听变化触发 桌面卡片跳转_回调 调 打开统计页。0 = 无跳转请求。
  @StorageLink('navigateToStats') @Watch('桌面卡片跳转_回调') private 桌面卡片跳转信号: number = 0;
  @StorageLink(EXTERNAL_DECK_OPEN_REVISION_KEY) @Watch('homeActivityChanged')
  private externalDeckOpenRevision: number = 0;
  // 设置页数据迁移/同步/取消隐藏完成后写时间戳，@Watch 监听变化触发 加载主页数据 刷新
  @StorageLink('需要刷新主页') @Watch('需要刷新主页_回调') private 需要刷新主页信号: number = 0;
  // 主页今日进度卡开关：用户在设置页「复习页布局」分组末尾切换，
  // 写 AppStorage 触发本 @StorageLink 自动重渲染，包裹 主页摘要分页 的 if 直接控制显示。
  // 默认 true 保持新用户开箱即见；aboutToAppear 时调 加载显示今日进度卡 同步 preferences 持久化值。
  @StorageLink(主页今日进度卡AppStorage键) private 显示今日进度卡: boolean = true;
  // 用 @Provide 暴露给宽屏 GridCol 路径下的 牌组详情面板：
  // 改用 @Provide/@Consume 让 牌组详情面板 内部根据 选中的牌组ID 自查 主页快照，
  @Provide('selectedDeckId') private 选中的牌组ID: string = '';
  @Provide('snapshot') private 主页快照数据: 主页快照 = 空主页快照;
  @State private historyRefreshToken: number = 0;
  @State private backgroundTransitionActive: boolean = false;
  private backgroundTransitionGeneration: number = 0;
  // 图表快照：静默加载图表 后用 提取卡片数据 转成纯基础类型，传给 主页摘要分页 渲染 Swiper 多页统计
  @State private 图表快照: 桌面卡片数据 | null = null;
  private statsSnapshot: 统计页参数 = { graphs: null, days: 365 };
  @State @Watch('homeActivityChanged') private 加载状态: 主页加载状态 = 'loading';
  @State private 当前断点: string = 'xs';
  @State private 主题模式值: 主题模式 = 'system';
  @StorageLink('colorTheme') private 颜色主题值: 颜色主题 = 默认颜色主题;
  // 跟随用户选择的颜色主题（极光蓝/仙野绿/暗夜紫/碧涛青/活力橙/柠檬金）
  @StorageProp(颜色键.动作主色) private 动作主色: string = '#2F5FD0';
  // 2.1.4.1 对比度：按钮背景专用档（配 #FFFFFF 文字 ≥ 4.5:1）
  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景色: string = '#2F5FD0';
  @StorageProp(颜色键.主色容器) private 主色容器色: string = '#E8EEFC';
  @StorageProp(PAGE_SURFACE_KEY) private 页面底色微染值: string = '#F5F7FA';
  // 状态栏高度（沉浸式全屏下，牌组详情覆盖层顶部条需让出状态栏区域，避免按钮叠在状态栏上）
  @StorageProp('状态栏高度') private 状态栏高度: number = 0;
  // 顶部 设置/创建牌组 两按钮共用一个 pressed 状态：0=无，1=设置，2=创建牌组
  @State private 工具栏按下状态: number = 0;
  @State @Watch('homeActivityChanged') private 显示许可证: boolean = false;
  @State @Watch('homeActivityChanged') private 显示创建牌组: boolean = false;
  @State private 创建父牌组ID: string = '';
  @State @Watch('homeActivityChanged') private 显示主页操作: boolean = false;
  // 更多下拉菜单（设置/浏览/统计/提醒收纳）：左上角"更多"按钮触发
  @State @Watch('homeActivityChanged') private 显示更多菜单: boolean = false;
  @State @Watch('homeActivityChanged') private 创建牌组中: boolean = false;
  @State private 展开的牌组ID集合: Set<string> = new Set<string>();
  @State private 牌组展开已初始化: boolean = false;
  // 已知牌组 id 集合：用于区分「用户手动折叠的牌组」与「同步/导入新出现的牌组」。
  // 加载主页数据 时，新出现的 hasChildren 牌组默认展开（加入 展开的牌组ID集合），
  // 已知牌组保持用户之前的展开/折叠状态不变。
  private 已知牌组ID集合: Set<string> = new Set<string>();
  // 用户主动隐藏的牌组 id 集合：加载主页数据 时从 preferences 加载，可见牌组行 过滤掉这些 id。
  // 隐藏入口在 牌组列表项 长按菜单「隐藏牌组」；恢复入口在设置页「已隐藏牌组」。
  @State private 隐藏的牌组ID集合: Set<string> = new Set<string>();
  // 同步面板弹窗（B14 2026-07-22）：从 同步分组 点「立即同步」后挂载
  // 根宿主持有同步任务；首页状态条与详情显示不决定任务生命周期。
  @State private 显示同步面板: boolean = false;
  @State private 同步面板认证: SyncAuth | null = null;
  @State private 同步面板账号名: string = '';
  @State private syncAutomatic: boolean = true;
  @State private syncStatusText: string = '';
  @State private syncIndicator: string = 'hidden';
  @State private syncDetailsRequest: number = 0;
  @StorageProp(APP_FOREGROUND_KEY) @Watch('syncForegroundChanged') private syncForeground: boolean = false;
  private readonly syncScheduler: AutoSyncScheduler = autoSyncScheduler;
  private readonly syncController: HomeSyncController = new HomeSyncController(
    this.syncScheduler, syncActivity, (): HomeSyncHost => this.homeSyncHost());
  private readonly backupController: HomeBackupController = new HomeBackupController(
    (): HomeBackupHost => this.homeBackupHost(), (filesDir: string): BackupBackend => new LocalBackups(filesDir));
  private autoSyncStartupReady: boolean = false;
  @State private deckDeletionBusy: boolean = false;
  @State private deckDeletionStatus: Resource = $r('app.string.deck_media_checking');
  private readonly deckMediaCleanup: DeckMediaCleanup = new DeckMediaCleanup({
    isSyncing: async (): Promise<boolean> => (await new 同步服务().媒体同步状态()).active,
    unused: async (): Promise<string[]> => (await new 媒体服务().检查媒体()).unused,
    trash: async (files: string[]): Promise<void> => { await new 媒体服务().媒体文件进回收站(files); }
  });
  @State @Watch('homeActivityChanged') private autoSyncCollectionBusy: boolean = false;
  @State @Watch('homeActivityChanged') private autoSyncModal: boolean = false;
  @State private syncBackRequest: number = 0;

  @State @Watch('homeActivityChanged') private 显示牌组定制: boolean = false;
  @State private 定制牌组ID: string = '';
  @State @Watch('homeActivityChanged') private 定制牌组中: boolean = false;
  // 自定义学习对话框（T2）：牌组长按菜单「自定义学习…」触发，对该牌组临时调增新卡/复习上限或抽取卡片
  @State @Watch('homeActivityChanged') private 显示自定义学习: boolean = false;
  @State private 自定义学习牌组ID: string = '';
  @State private 自定义学习牌组名: string = '';
  // 创建过滤牌组面板（T2）：牌组长按菜单「创建过滤牌组」触发，按搜索条件抽取卡片到临时牌组
  @State @Watch('homeActivityChanged') private 显示过滤牌组面板: boolean = false;
  @State @Watch('homeActivityChanged') private deckOptionsBusy: boolean = false;
  // 牌组选项：在根 Stack 中挂载以实现平板下的全局磨砂覆盖（与 创建牌组面板 同款）
  @State @Watch('homeActivityChanged') private 显示牌组选项: boolean = false;
  @State private 牌组选项牌组ID: number = 0;
  @State private 牌组选项牌组名: string = '';
  /** 下拉刷新状态：与 Refresh 组件双向绑定；加载主页数据 完成后置回 false 收起指示器。 */
  @State @Watch('homeActivityChanged') private 刷新中: boolean = false;
  // 同级子牌组拖拽排序模式：true 时所有 牌组列表项 进入可拖态、顶部显示「完成排序」Bar、onClick 不选牌。
  // 通过长按某 牌组列表项 弹菜单 → 选「拖动排序」进入；点「完成」按钮退出并重新拉取数据。
  @State @Watch('homeActivityChanged') private 排序模式中: boolean = false;
  // 上次选中牌组恢复标志：仅在首次 加载主页数据 完成后恢复一次，避免 onPop 刷新时反复覆盖用户主动取消的选中态
  private 上次牌组已恢复: boolean = false;
  // 入门弹窗与启动序列共用展示槽位，由独立本机修订标记控制一次展示。
  @State @Watch('homeActivityChanged') private 显示欢迎弹窗: boolean = false;
  @State @Watch('homeActivityChanged') private 云端牌组忙碌: boolean = false;
  @State private cloudBackRequest: number = 0;
  private 打开云端牌组弹窗(从菜单打开: boolean): void {
    if (this.deferForSync((): void => this.打开云端牌组弹窗(从菜单打开))) return;
    this.云端牌组从菜单打开 = 从菜单打开;
    this.显示云端牌组弹窗 = true;
  }
  @State @Watch('homeActivityChanged') private 显示云端牌组弹窗: boolean = false;
  // 打开来源：true 表示从右上角菜单进入，关闭即回首页；false 表示开机引导，关闭需二次确认。
  @State private 云端牌组从菜单打开: boolean = false;
  // 本机直链牌组下载配额是否已用尽；用尽后菜单第 5 项隐藏，冷启动也不再弹引导。
  @State private 云端牌组配额已用尽: boolean = false;
  @State @Watch('homeActivityChanged') private 显示节流奖励: boolean = false;
  @State private 节流奖励文案: string = '';
  // 窄屏详情显隐（方案 C 2026-07-25）：点牌组后 true，根 Stack 内 牌组详情面板 盖住列表，替代推栈 NavDestination
  @State @Watch('homeActivityChanged') private 显示牌组详情: boolean = false;
  @State @Watch('homeActivityChanged') private 显示卡片预览: boolean = false;
  @State private 预览卡片ID列表: number[] = [];
  @State private 预览初始索引: number = 0;
  @State private 预览媒体目录: string = '';
  private 预览加载中: boolean = false;

  private homeSyncHost(): HomeSyncHost {
    return {
      activity: (): HomeActivityState => this.homeActivity(),
      syncCollectionBusy: (): boolean => this.autoSyncCollectionBusy,
      isDisposed: (): boolean => this.homeDisposed,
      isForeground: (): boolean => this.syncForeground && !this.homeDisposed,
      isPanelOpen: (): boolean => this.显示同步面板,
      pageDepth: (): number => this.页面栈.size(),
      pathNames: (): string[] => this.页面栈.getAllPathName(),
      loadState: (): string => this.加载状态,
      startupReady: (): boolean => this.autoSyncStartupReady,
      externalImportPending: (): boolean => externalDeckOpens.hasPending(),
      autoSyncEnabled: (): boolean => loadAutoSyncEnabled(),
      auth: (): SyncAuth | null => {
        const info: 同步凭证信息 | null = 加载同步凭证();
        return info === null ? null : { hkey: info.hkey, endpoint: info.endpoint, ioTimeoutSecs: 0 };
      },
      username: (): string => {
        const info: 同步凭证信息 | null = 加载同步凭证();
        return info === null ? '' : info.username;
      },
      setStatus: (resourceKey: string | null): void => { this.设置同步状态(resourceKey); },
      notifyWait: (): void => { this.显示提示($r('app.string.sync_collection_wait')); },
      popPage: (): void => { this.页面栈.pop(); },
      requestPanelDetails: (): void => { this.syncDetailsRequest++; },
      openPanel: (auth: SyncAuth, automatic: boolean, username: string): void => {
        this.同步面板认证 = auth;
        this.syncAutomatic = automatic;
        this.同步面板账号名 = username;
        this.显示同步面板 = true;
      },
      closePanel: (): void => {
        this.显示同步面板 = false;
        this.同步面板认证 = null;
        this.同步面板账号名 = '';
      },
      setCollectionBusy: (busy: boolean): void => { this.autoSyncCollectionBusy = busy; },
      setPanelModal: (modal: boolean): void => { this.autoSyncModal = modal; },
      refreshAfterCollection: async (): Promise<void> => {
        AppStorage.setOrCreate<number>('cardContentChangedTick',
          (AppStorage.get<number>('cardContentChangedTick') ?? 0) + 1);
        await this.加载主页数据();
      },
      presentFsrsWarning: (): Promise<void> => this.同步后检查FSRS(true),
      activityChanged: (): void => { this.homeActivityChanged(); }
    };
  }

  private 设置同步状态(resourceKey: string | null): void {
    if (resourceKey === null) {
      this.syncStatusText = '';
      this.syncIndicator = 'hidden';
      return;
    }
    const resources: Record<string, Resource> = {
      'sync_pending': $r('app.string.sync_pending'),
      'sync_wait_study': $r('app.string.sync_wait_study'),
      'sync_wait_home': $r('app.string.sync_wait_home'),
      'sync_wait_import': $r('app.string.sync_wait_import'),
      'sync_wait_load_failed': $r('app.string.sync_wait_load_failed'),
      'sync_wait_load': $r('app.string.sync_wait_load'),
      'sync_wait_dialog': $r('app.string.sync_wait_dialog'),
      'sync_wait_operation': $r('app.string.sync_wait_operation'),
      'sync_wait_transfer': $r('app.string.sync_wait_transfer')
    };
    const resource: Resource | undefined = resources[resourceKey];
    if (resource !== undefined) {
      this.syncStatusText = resourceText(this.getUIContext(), resource);
      this.syncIndicator = resourceKey === 'sync_wait_load_failed' ? 'attention' : 'waiting';
    }
  }

  aboutToAppear(): void {
    this.syncScheduler.setListener((): void => { this.scheduleAutoSyncCheck(); });
    this.requestAutoSync();
    this.恢复主题();
    this.恢复颜色主题();
    this.恢复今日进度卡开关();
    // 首次进入先完成云端牌组选择与导入，再展示版本欢迎内容，避免两个全屏弹窗叠加。
    this.显示首次弹窗序列().finally((): void => { this.autoSyncStartupReady = true; });
    this.刷新云端牌组配额状态();
    this.homeActivityChanged();
  }

  aboutToDisappear(): void {
    this.transferSession.dispose();
    this.homeDisposed = true;
    this.暂停主页官方公告检查();
    this.announcementController.dispose();
    this.homeWork.dispose();
    this.refreshQueue.dispose();
    this.startupSequence.dispose();
    this.syncScheduler.setListener(null);
    this.stopAutoSyncTimer();
    this.backupController.dispose();
    this.syncController.dispose();
    syncActivity.cancelReservation();
  }

  /** 前台恢复时排队；在编辑或学习中恢复时，等待真正返回首页。 */
  private syncForegroundChanged(): void {
    this.syncController.foregroundChanged();
    if (this.syncForeground) this.backupController.schedule();
    else this.backupController.stop();
  }

  /** 生命周期只记录意图；学习提交与此入口共用同一队列。 */
  private requestAutoSync(): void {
    this.syncController.request();
  }

  /** 答题中不轮询；会话完成/销毁或返回前台时再唤醒。 */
  private scheduleAutoSyncCheck(): void {
    this.syncController.schedule();
  }

  private isAutoSyncLocationSafe(): boolean {
    return this.syncController.isLocationSafe();
  }

  /** 停止待执行检查；后台不轮询，也不在后台新建同步任务。 */
  private stopAutoSyncTimer(): void {
    this.syncController.stopTimer();
  }
  private scheduleAutomaticBackup(): void {
    this.backupController.schedule();
  }

  private homeBackupHost(): HomeBackupHost {
    return {
      isDisposed: (): boolean => this.homeDisposed,
      isForeground: (): boolean => this.syncForeground,
      canRun: (): boolean => this.页面栈.size() === 0 && this.加载状态 === 'ready' &&
        canStartHomeAutoSync(this.homeActivity()),
      canReschedule: (): boolean => this.页面栈.size() === 0 && this.加载状态 === 'ready',
      filesDir: (): string | null => this.取能力上下文()?.filesDir ?? null,
      loadEnabled: async (): Promise<boolean> => {
        const context: common.UIAbilityContext | null = this.取能力上下文();
        return context !== null && await loadAutomaticBackup(context);
      },
      warn: (error: Error): void => { hilog.warn(0x4342, '首页', `自动备份失败: ${error}`); }
    };
  }

  /**
   * 仅在首页或学习完成页安全空闲时挂载既有同步流程。
   * Invariants: 集合已打开、前台、无活动学习/编辑、无导入/启动弹窗；手动自动共用互斥。
   */
  private tryAutoSync(): void {
    this.syncController.tryStart();
  }

  /** 集合独占期间合并点击意图，避免把页面 RPC 排在网络请求后无提示等待。 */
  private deferForSync(action: () => void, study: boolean = false): boolean {
    return this.syncController.defer(action, study);
  }

  /** 设置页仅提交意图并返回首页，由根宿主执行，页面销毁不影响传输。 */
  private requestManualSync(): void {
    this.syncController.requestManual();
  }

  /** 排队提示反映实际阻挡原因，避免把所有状态都称为“空闲”。 */
  private updatePendingSyncStatus(): void {
    this.syncController.updateStatus();
  }

  private syncYielded(automatic: boolean): void {
    this.syncController.yielded(automatic);
  }

  private syncHostClosed(): void {
    this.syncController.closePanel();
  }

  /** 刷新完成且仍停留首页时只执行最后一次意图；返回或退后台会取消它。 */
  private flushSyncAction(): void {
    this.syncController.flush();
  }

  /** 数据与界面刷新均完成后再进入学习，媒体不参与此门禁。 */
  private async autoSyncCollectionFinished(fsrsDisabledBySync: boolean): Promise<void> {
    await this.syncController.collectionFinished(fsrsDisabledBySync);
  }

  /** 同步产生的设置提醒等待用户回到空闲首页，不打断开始或继续学习。 */
  private async presentPendingSyncWarning(): Promise<void> {
    await this.syncController.presentPendingWarning();
  }

  /** 同步宿主只上报数据库占用和详情显隐，不把媒体同步当作导航锁。 */
  private autoSyncStateChanged(busy: boolean, modal: boolean): void {
    this.syncController.panelStateChanged(busy, modal);
  }

  /** 新增集合任务或弹层只在此登记；公告和自动同步共用同一份占用事实。 */
  private homeActivity(): HomeActivityState {
    return {
      foreground: this.syncForeground && !this.homeDisposed,
      atHome: this.页面栈.size() === 0 && this.主页允许公告检查 && !this.显示牌组详情,
      collectionReady: 后端会话.获取实例().是否就绪() && this.加载状态 !== 'loading' && this.加载状态 !== 'error',
      collectionBusy: this.autoSyncCollectionBusy || this.syncController.isRefreshing() || this.刷新中 || this.deckDeletionBusy ||
        (this.transfer.phase !== 'idle') || this.创建牌组中 || this.deckOptionsBusy || this.云端牌组忙碌,
      dialogOpen: this.显示官方公告 || this.显示欢迎弹窗 || this.显示云端牌组弹窗 || this.transfer.visible ||
        this.显示牌组定制 || this.显示自定义学习 || this.显示过滤牌组面板 || this.显示牌组选项 ||
        this.显示创建牌组 || this.显示主页操作 || this.显示更多菜单 || this.显示节流奖励 || this.显示许可证 ||
        this.显示卡片预览 || this.autoSyncModal || this.fsrsPromptActive || this.nativeDialogOpen,
      interactionBusy: this.排序模式中 || this.预览加载中 || this.定制牌组中,
      startupChecking: this.官方公告检查中 || this.announcementController.hasPending() ||
        this.startupSequence.hasPending()
    };
  }

  private canPresentStartupPrompt(): boolean {
    return !externalDeckOpens.hasPending() && canPresentHomePrompt(this.homeActivity());
  }

  /** 页面映射当前占用与效果，任务优先级由 HomeWorkCoordinator 统一管理。 */
  private homeActivityChanged(): void {
    if (this.homeDisposed) return;
    const host: HomeWorkHost = {
      activity: (): HomeActivityState => this.homeActivity(),
      hasDeferredNavigation: (): boolean => this.syncController.hasDeferredNavigation(),
      importDeck: (uri: string): Promise<void> => this.importDeckUri(uri),
      importFailed: (error: Error): void => {
        showToastSafely(this.getUIContext(), { message: error.message });
      },
      flushNavigation: (): void => this.flushSyncAction(),
      manualSyncPending: (): boolean => this.syncScheduler.isManualPending(),
      startManualSync: (): void => this.tryAutoSync(),
      presentAnnouncement: (): boolean => this.尝试展示待展示官方公告(),
      continueStartup: (): void => {
        if (this.startupSequence.hasPending()) {
          this.startupSequence.resume(this.startupHost()).catch((error: Error): void => {
            showToastSafely(this.getUIContext(), { message: error.message });
          });
        } else this.请求主页官方公告检查();
      },
      scheduleSync: (): void => this.scheduleAutoSyncCheck()
    };
    this.homeWork.wake(host);
  }

  private startupHost(): HomeStartupHost {
    return {
      canPresent: (): boolean => this.canPresentStartupPrompt() && !this.announcementController.hasPending(),
      checkAnnouncement: (): Promise<boolean> => this.尝试显示官方公告(),
      activateAnnouncementChecks: (): void => { this.主页公告检查已激活 = true; },
      cloudCompleted: (): Promise<boolean> => 是否已完成云端牌组引导(),
      introCompleted: (): Promise<boolean> => isHomeIntroCompleted(),
      showCloud: (): void => this.打开云端牌组弹窗(false),
      showIntro: (): void => { this.显示欢迎弹窗 = true; }
    };
  }

  /** 创建入口先等待集合，避免表单持有同步前的牌组快照。 */
  private openCreateDeck(parentId: string): void {
    if (this.deferForSync((): void => { this.openCreateDeck(parentId); })) return;
    this.创建父牌组ID = parentId;
    this.显示创建牌组 = true;
  }

  /** 设置页会读取/修改集合，和学习入口共用等待规则。 */
  private openSettings(): void {
    if (this.deferForSync((): void => { this.openSettings(); })) return;
    this.暂停主页官方公告检查();
    const params: 设置页参数 = { openAiSettings: false };
    this.页面栈.pushPath({ name: 'SettingsPage', param: params,
      onPop: (): void => { this.返回主页后刷新(); } });
  }

  /** 提醒页也使用集合数据，切页前统一等待。 */
  private openReminders(): void {
    if (this.deferForSync((): void => { this.openReminders(); })) return;
    this.暂停主页官方公告检查();
    this.页面栈.pushPath({ name: 'ReminderPage',
      onPop: (): void => { this.返回主页后刷新(); } });
  }

  /** 官方公告优先于首次云端牌组引导，云端牌组引导优先于版本欢迎弹窗。 */
  private async 显示首次弹窗序列(): Promise<void> {
    await this.startupSequence.start(this.startupHost());
  }

  /** 执行一次真实网络检查；所有入口共用本方法，禁止并发。 */
  private async 尝试显示官方公告(): Promise<boolean> {
    if (this.homeDisposed || this.官方公告检查中) return false;
    this.官方公告检查中 = true;
    this.上次官方公告检查开始时间 = Date.now();
    try {
      const found: boolean = await this.announcementController.check(async (): Promise<官方公告展示项 | null> => {
        const info: bundleManager.BundleInfo = await bundleManager.getBundleInfoForSelf(
          bundleManager.BundleFlag.GET_BUNDLE_INFO_WITH_APPLICATION);
        return this.官方公告服务实例.加载公告(info.versionName, 当前语言模式(), Date.now());
      }, 是否已确认官方公告);
      if (found) this.尝试展示待展示官方公告();
      return found;
    } catch (error) {
      return false;
    } finally {
      this.官方公告检查中 = false;
      this.homeActivityChanged();
    }
  }

  /** 请求结束时若主页不可安全展示，返回主页后先消费这个待展示结果。 */
  private 尝试展示待展示官方公告(): boolean {
    const item: 官方公告展示项 | null = this.announcementController.takePending(this.canPresentStartupPrompt());
    if (item === null) return false;
    this.官方公告数据 = item;
    this.显示官方公告 = true;
    return true;
  }

  /** 返回主页时按十分钟窗口立即检查或只安排一个延迟检查。 */
  private 请求主页官方公告检查(): void {
    if (this.尝试展示待展示官方公告()) return;
    if (!this.主页公告检查已激活 || !this.canPresentStartupPrompt() || this.官方公告检查中 ||
      this.announcementController.hasPending()) return;
    if (this.官方公告延迟检查任务 >= 0) return;
    const delayMs: number = 官方公告检查延迟毫秒(this.上次官方公告检查开始时间, Date.now());
    if (delayMs === 0) {
      this.尝试显示官方公告().catch((): void => {});
      return;
    }
    this.官方公告延迟检查任务 = setTimeout((): void => {
      this.官方公告延迟检查任务 = -1;
      if (!this.canPresentStartupPrompt()) return;
      this.尝试显示官方公告().catch((): void => {});
    }, delayMs);
  }

  /** 离开主页或进入后台时取消尚未执行的延迟检查。 */
  private 暂停主页官方公告检查(): void {
    this.主页允许公告检查 = false;
    if (this.官方公告延迟检查任务 >= 0) {
      clearTimeout(this.官方公告延迟检查任务);
      this.官方公告延迟检查任务 = -1;
    }
  }

  /** 所有真正返回主页的入口都调用这里，避免遗漏公告检查。 */
  private 返回主页后刷新(): void {
    this.主页允许公告检查 = true;
    this.加载主页数据().then((): void => { this.presentPendingSyncWarning(); });
    this.homeActivityChanged();
    this.requestAutoSync();
  }

  private async 继续首次弹窗序列(): Promise<void> {
    await this.startupSequence.continue(this.startupHost());
  }

  /** 同步本机下载配额；读取失败按未用尽处理，避免用户平白丢失菜单入口。 */
  private async 刷新云端牌组配额状态(): Promise<void> {
    this.云端牌组配额已用尽 = await 是否已用尽云端牌组下载配额();
  }

  /** 只有「我知道了」写入已读并关闭；先在当前进程内存抑制该 ID，持久化失败仅提示，仍关闭并继续原启动序列。 */
  private async 确认官方公告(): Promise<void> {
    if (this.官方公告确认中 || this.官方公告数据 === null) return;
    this.官方公告确认中 = true;
    const id: string = this.官方公告数据.id;
    this.announcementController.confirm(id);
    const saved: boolean = await 标记已确认官方公告(id);
    if (!saved) {
      showToastSafely(this.getUIContext(), {
        message: $r('app.string.official_announcement_save_failed')
      });
    }
    this.显示官方公告 = false;
    this.官方公告数据 = null;
    this.官方公告确认中 = false;
    this.主页公告检查已激活 = true;
    await this.继续首次弹窗序列();
  }

  /** 详情地址只经系统浏览器打开，不渲染远端 HTML；打开失败保持公告打开。 */
  private 打开官方公告详情(): void {
    if (this.官方公告数据 === null || this.官方公告数据.actionUrl.length === 0) return;
    const context: common.UIAbilityContext = this.getUIContext().getHostContext() as common.UIAbilityContext;
    context.startAbility({
      action: 'ohos.want.action.viewData',
      uri: this.官方公告数据.actionUrl
    }).catch((_error: Error): void => {
      showToastSafely(this.getUIContext(), {
        message: $r('app.string.official_announcement_open_failed')
      });
    });
  }

  // 显示欢迎弹窗一次
  // 只有用户确认才记录已读，避免表单占用或进程退出提前消耗入门机会。
  private async 显示欢迎弹窗一次(): Promise<void> {
    await this.startupSequence.welcome(this.startupHost());
  }

  /** 用户确认后才记录入门已读，失败提示但不阻止进入应用。 */
  private closeHomeIntro(): void {
    this.显示欢迎弹窗 = false;
    completeHomeIntro().catch((): void => { this.显示提示($r('app.string.home_intro_save_failed')); });
  }

  /** 页面每次可见都刷新（含从复习页返回），保证今日计数与队列状态同步。 */
  onPageShow(): void {
    this.返回主页后刷新();
  }

  /** 进入后台：取消尚未执行的公告延迟检查，返回前台由 onPageShow 重新协调。 */
  onPageHide(): void {
    this.暂停主页官方公告检查();
    this.stopAutoSyncTimer();
  }

  /**
   * 系统返回键 / 屏幕边缘滑动返回：弹窗优先消费，主界面才走系统默认（退到后台）。
   * Invariants: 按层级逆序消费——先二次确认类（数据迁移可能含未完成事务）→ 普通弹层 →
   * 引导弹窗 → 牌组详情浮层；任一命中即关对应弹窗并 return true；都不命中 return false。
   * Extension Points: 新增弹窗时在此链中按层级插入对应 @State 判断。
   */
  onBackPress(): boolean {
    if ((this.transfer.phase !== 'idle') || this.创建牌组中 || this.定制牌组中 || this.deckOptionsBusy || this.deckDeletionBusy) return true;
    if (this.显示卡片预览) { this.显示卡片预览 = false; return true; }
    this.syncController.cancel();
    if (this.autoSyncModal) { this.syncBackRequest++; return true; }
    if (this.显示官方公告) {
      return true;
    }
    if (this.transfer.visible) { this.transferSession.close(); return true; }
    if (this.显示牌组定制) { this.显示牌组定制 = false; return true; }
    if (this.显示自定义学习) { this.显示自定义学习 = false; return true; }
    if (this.显示过滤牌组面板) { this.显示过滤牌组面板 = false; return true; }
    if (this.显示牌组选项) { this.显示牌组选项 = false; return true; }
    if (this.显示创建牌组) { this.显示创建牌组 = false; return true; }
    if (this.显示云端牌组弹窗) {
      this.cloudBackRequest++;
      return true;
    }
    if (this.显示主页操作) { this.显示主页操作 = false; return true; }
    if (this.显示更多菜单) { this.显示更多菜单 = false; return true; }
    if (this.显示节流奖励) { this.显示节流奖励 = false; return true; }
    if (this.显示欢迎弹窗) { this.closeHomeIntro(); return true; }
    if (this.显示牌组详情) { this.显示牌组详情 = false; return true; }
    return false;
  }

  // 笔记添加广播回调
  private 笔记添加广播_回调(): void {
    this.加载主页数据();
  }

  // 桌面卡片跳转回调
  private 桌面卡片跳转_回调(): void {
    if (this.桌面卡片跳转信号 > 0) {
      this.打开统计页();
    }
  }

  // 设置页数据迁移/同步/取消隐藏完成后触发首页刷新
  private 需要刷新主页_回调(): void {
    if (this.需要刷新主页信号 > 0) {
      this.加载主页数据();
    }
  }

  // 加载主页数据
  // 首次启动自动开启 FSRS（用户决策：默认开启可关闭）。
  // 首次加载默认展开所有含子节点的父牌组；
  // 后续刷新：新出现的 hasChildren 牌组默认展开，已知牌组保持用户之前状态。
  // 首次加载完成且宽屏：恢复上次选中的牌组。
  // 所有触发严格串行（链式追加，不允许并发）：
  // 学习页退出时「需要刷新主页 广播 + onPop」双触发、用户连续两次学习会话退出等场景下，
  // 并发加载会竞态覆盖——先发起的慢请求后完成，用旧 graphs 覆盖新快照，
  // 主页摘要卡片停留旧数据且无新触发器纠正（用户报告的“内部卡片高延迟”根因之一）。
  private readonly refreshQueue: HomeRefreshQueue = new HomeRefreshQueue();

  private 加载主页数据(): Promise<void> {
    if (this.autoSyncCollectionBusy) {
      this.刷新中 = false;
      return Promise.resolve();
    }
    return this.refreshQueue.run((): Promise<void> => this.执行加载主页数据());
  }

  private async 执行加载主页数据(): Promise<void> {
    this.加载状态 = 'loading';
    const context: common.UIAbilityContext | null = this.取能力上下文();
    if (context === null) {
      this.加载状态 = 'error';
      return;
    }
    try {
      const data: HomeDataResult = await this.homeData.load(context.filesDir,
        context.resourceManager.getStringSync($r('app.string.default_deck_name').id));
      if (this.homeDisposed) return;
      const snapshot: 主页快照 = data.snapshot;
      this.隐藏的牌组ID集合 = new Set<string>(data.hiddenIds);
      if (data.cardData !== null) this.图表快照 = data.cardData;
      if (data.graphs !== null) this.statsSnapshot = { graphs: data.graphs, days: data.days };
      this.主页快照数据 = snapshot;
      this.historyRefreshToken++;
      if (!await this.reconcileDeckSelection(snapshot.decks)) {
        this.显示提示($r('app.string.home_selection_save_failed'));
      }
      if (this.homeDisposed) return;
      const expansion: HomeDeckExpansion = reconcileHomeExpansion(snapshot.decks, this.展开的牌组ID集合,
        this.已知牌组ID集合, this.牌组展开已初始化);
      this.牌组展开已初始化 = true;
      this.展开的牌组ID集合 = expansion.expanded;
      this.已知牌组ID集合 = expansion.known;
      this.牌组数据源.replaceAll(可见牌组行(snapshot.decks, this.展开的牌组ID集合, this.隐藏的牌组ID集合));
      this.加载状态 = snapshot.decks.length > 0 ? 'ready' : 'empty';
      if (this.加载状态 === 'ready') this.scheduleAutomaticBackup();
      // 首次加载完成且宽屏：恢复上次选中的牌组（牌组详情面板 显示详情）。
      // 窄屏不恢复 选中的牌组ID——用户决策 2026-07-22：手机不高亮上次牌组。
      // 旋转到宽屏时由 onBreakpointChange 再触发一次恢复。
      if (!this.上次牌组已恢复 && this.当前断点 !== 'xs') {
        await this.尝试恢复上次牌组();
      }
    } catch (error) {
      if (this.homeDisposed) return;
      this.加载状态 = 'error';
      this.显示提示($r('app.string.home_load_error'));
    } finally {
      // 无论成功或失败都收起下拉刷新指示器；onPageShow 触发时本来即为 false，无副作用。
      if (!this.homeDisposed) this.刷新中 = false;
    }
  }

  // 尝试恢复上次牌组
  // 窄屏不调用——用户决策 2026-07-22：手机不高亮上次牌组，仅平板宽屏恢复。
  // 上次牌组已恢复 保证只恢复一次；snapshot 未加载时跳过等下次触发。
  private async 尝试恢复上次牌组(): Promise<void> {
    if (this.上次牌组已恢复) {
      return;
    }
    if (this.主页快照数据.decks.length === 0) {
      return;
    }
    this.上次牌组已恢复 = true;
    const lastDeckId: string = await 加载上次牌组ID();
    if (lastDeckId !== ''
        && !this.隐藏的牌组ID集合.has(lastDeckId)
        && this.按ID查牌组(lastDeckId).id !== '') {
      this.选中的牌组ID = lastDeckId;
      this.展开牌组路径(this.选中牌组());
      this.牌组数据源.replaceAll(可见牌组行(this.主页快照数据.decks, this.展开的牌组ID集合, this.隐藏的牌组ID集合));
    }
  }

  // 静默加载图表

  // 同步后检查FSRS
  // 触发场景：AnkiWeb 云端在桌面端等关掉了 FSRS，syncCollection/fullDownload 把 fsrs=false
  // 写到本地 collection；本地 确保FSRS已开启一次 因 fsrs_initialized=true 不会自动重开。
  // 弹窗用 promptAction.showDialog（系统原生）：按钮 0 = 重新开启（回写 fsrs=true），
  // 按钮 1 = 保持关闭（不动）。
  private fsrsPromptActive: boolean = false;

  private async 同步后检查FSRS(fsrsDisabledBySync: boolean): Promise<void> {
    if (!fsrsDisabledBySync || this.fsrsPromptActive) return;
    this.fsrsPromptActive = true;
    try {
      const fsrsEnabled: boolean | null = await 加载FSRS开启状态();
      if (fsrsEnabled === false) {
        const result: promptAction.ShowDialogSuccessResponse = await this.getUIContext().getPromptAction().showDialog({
          title: resourceText(this.getUIContext(), $r('app.string.sync_fsrs_disabled_title')),
          message: resourceText(this.getUIContext(), $r('app.string.sync_fsrs_disabled_message')),
          buttons: [
            {
              text: resourceText(this.getUIContext(), $r('app.string.sync_fsrs_disabled_reenable')),
              color: '#2F5FD0'
            },
            {
              text: resourceText(this.getUIContext(), $r('app.string.sync_fsrs_disabled_keep')),
              color: '#666666'
            }
          ]
        });
        if (result.index === 0) {
          try {
            await 设置FSRS开启状态(true);
          } catch (error) {
            showToastSafely(this.getUIContext(), {
              message: resourceText(this.getUIContext(), $r('app.string.sync_fsrs_reenable_error'))
            });
          }
        }
      }
    } catch (error) {
      // 拉取 FSRS 状态失败或弹窗失败都不阻断，静默降级
    } finally {
      this.fsrsPromptActive = false;
      this.homeActivityChanged();
    }
  }

  /**
   * 进入排序模式：用户在 牌组列表项 长按菜单选「拖动排序」时触发。
   * 全局进入 排序模式中=true，所有 牌组列表项 显示≡手柄、行描边高亮、onClick 不选牌、
   * LongPressGesture 等效禁用（duration 改到 99999999），让 List.onMove 接管长按拖动事件。
   * 若父牌组未展开，提示用户先展开父牌组才能拖子牌组。
   */
  private 进入排序模式(): void {
    if (this.deferForSync((): void => { this.进入排序模式(); })) return;
    this.排序模式中 = true;
  }

  /**
   * 退出排序模式：用户点顶部「完成」按钮时触发。
   * 退出后立即 reload，确保 LazyForEach 按 orderOverrides 重新渲染顺序（onMove 期间内存态
   * 已通过 牌组数据源.moveItem 更新，但落盘 保存牌组顺序 后下次 build 仍按 OrderOverrides 重排，
   * 视觉上不会跳动；reload 主要用于把 mode 标志清掉、重新计算 LazyForEach key）。
   */
  private 退出排序模式(): void {
    this.排序模式中 = false;
    this.加载主页数据();
  }

  // 处理牌组移动
  // 跨 parent（不同 depth 或不同 ancestorIds）的拖动直接拒绝，避免破坏树结构。
  // 例如：顶层牌组不能拖到子牌组下面，子牌组不能拖到顶层。
  // onMove 在用户拖动期间会持续触发（from/to 实时更新），每次都立即落盘以保证
  // 用户中途退出排序模式不丢失中间状态。落盘是 async，但 fire-and-forget，不阻塞 UI。
  private 处理牌组移动(from: number, to: number): void {
    if (!this.排序模式中) {
      return;
    }
    if (from === to || from < 0 || to < 0) {
      return;
    }
    const decks: 牌组汇总[] = this.牌组数据源.snapshotDecks();
    if (from >= decks.length || to >= decks.length) {
      return;
    }
    const fromDeck: 牌组汇总 = decks[from];
    const toDeck: 牌组汇总 = decks[to];
    // 同 parent 校验：parentId 相同即可（不同 depth 但同 parentId 不存在，因为 depth 由 parentId 决定）
    if (fromDeck.parentId !== toDeck.parentId) {
      return;
    }
    this.牌组数据源.moveItem(from, to);
    // 计算 parent 下最新子牌组顺序并落盘
    const updatedDecks: 牌组汇总[] = this.牌组数据源.snapshotDecks();
    const childIds: string[] = [];
    for (let i: number = 0; i < updatedDecks.length; i++) {
      if (updatedDecks[i].parentId === fromDeck.parentId) {
        childIds.push(updatedDecks[i].id);
      }
    }
    保存牌组顺序(fromDeck.parentId, childIds);
  }

  private async 恢复主题(): Promise<void> {
    const restored: 主题模式 = await 加载主题模式();
    this.主题模式值 = restored;
    this.应用激活主题(restored);
  }

  /** 加载持久化的颜色主题并应用到 AppStorage；启动时调用一次。 */
  private async 恢复颜色主题(): Promise<void> {
    try { await initializeRedemption(); } catch (error) {
      hilog.warn(0x0000, '首页', 'Redemption initialization unavailable; settings can retry');
    }
    let restored: 颜色主题 = await 加载颜色主题();
    if (!isThemeAvailable(restored, AppStorage.get<string[]>(UNLOCKED_CONTENTS_KEY) ?? [])) restored = 'aurora';
    this.颜色主题值 = restored;
    AppStorage.setOrCreate<颜色主题>('colorTheme', restored);
    应用颜色主题(restored, this.是否深色());
  }

  // 恢复今日进度卡开关
  private async 恢复今日进度卡开关(): Promise<void> {
    const 开启: boolean = await 加载显示今日进度卡();
    AppStorage.setOrCreate<boolean>(主页今日进度卡AppStorage键, 开启);
  }

  private 取能力上下文(): common.UIAbilityContext | null {
    const context: common.UIAbilityContext | undefined =
      AppStorage.get<common.UIAbilityContext>('abilityContext');
    return context === undefined ? null : context;
  }

  private 应用激活主题(mode: 主题模式): void {
    AppStorage.setOrCreate<主题模式>('themeMode', mode);
    const context: common.UIAbilityContext | null = this.取能力上下文();
    if (context !== null) {
      应用主题(context, mode, this.系统暗黑模式);
    }
    // 深浅色变化时颜色主题的浅色/深色套也要同步刷新
    应用颜色主题(this.颜色主题值, this.是否深色());
  }

  /** 切换主题：写 AppStorage + 应用 + 持久化。 */
  private 切换主题(mode: 主题模式): void {
    this.主题模式值 = mode;
    this.应用激活主题(mode);
    保存主题模式(mode);
    // 桌面卡片运行在独立进程，无法访问 AppStorage，必须显式推送最新主题色
    刷新桌面卡片数据().catch((错误: Object): void => {
      hilog.error(0x0000, '首页', `切换主题后刷新桌面卡片数据失败: ${错误}`);
    });
  }

  /** 切换颜色主题：写入 AppStorage 触发全局 @StorageProp 重渲染 + 持久化。 */
  private 切换颜色主题(theme: 颜色主题): void {
    if (!isThemeAvailable(theme, AppStorage.get<string[]>(UNLOCKED_CONTENTS_KEY) ?? [])) return;
    this.颜色主题值 = theme;
    AppStorage.setOrCreate<颜色主题>('colorTheme', theme);
    应用颜色主题(theme, this.是否深色());
    保存颜色主题(theme);
    // 桌面卡片运行在独立进程，无法访问 AppStorage，必须显式推送最新主题色
    刷新桌面卡片数据().catch((错误: Object): void => {
      hilog.error(0x0000, '首页', `切换颜色主题后刷新桌面卡片数据失败: ${错误}`);
    });
  }

  private 是否深色(): boolean {
    return 解析是否深色(this.主题模式值, this.系统暗黑模式);
  }

  private 按ID查牌组(deckId: string): 牌组汇总 {
    for (let index: number = 0; index < this.主页快照数据.decks.length; index++) {
      const deck: 牌组汇总 = this.主页快照数据.decks[index];
      if (deck.id === deckId) {
        return deck;
      }
    }
    return 空牌组汇总;
  }

  private 选中牌组(): 牌组汇总 {
    return this.按ID查牌组(this.选中的牌组ID);
  }

  private 已选中牌组(): boolean {
    return this.选中的牌组ID !== '' && this.选中牌组().id !== '';
  }

  private 显示提示(message: Resource): void {
    try {
      showToastSafely(this.getUIContext(), { message: message });
    } catch (error) {
      // 页面销毁或系统提示服务不可用时，不影响主界面的连续操作。
    }
  }

  // 进入复习页
  // 仅当前选中牌组有效时入栈。
  // 'StudyPage' 字符串是 NavPathStack 跨页面寻址协议，保留英文。
  private 开始学习(): void {
    this.stopAutoSyncTimer();
    if (this.deferForSync((): void => { this.开始学习(); }, true)) return;
    if (!this.已选中牌组()) {
      return;
    }
    const params: 学习页参数 = {
      deckId: this.选中的牌组ID,
      deckName: 牌组显示名(this.选中牌组())
    };
    this.暂停主页官方公告检查();
    this.页面栈.pushPath({
      name: 'StudyPage',
      param: params,
      onPop: (): void => {
        this.返回主页后刷新();
      }
    });
  }

  /**
   * 打开当前牌组全部卡片的只读预览。
   * 只做搜索与渲染，不调用调度器，不写学习记录。
   */
  private async 打开牌组预览(): Promise<void> {
    if (this.deferForSync((): void => { this.打开牌组预览(); })) return;
    const deck: 牌组汇总 = this.选中牌组();
    if (deck.id === '' || this.预览加载中) return;
    const context: common.UIAbilityContext | null = this.取能力上下文();
    if (context === null) return;
    const scope: string = deckHistorySearch(deck.id, this.主页快照数据.decks);
    if (scope === '') {
      this.显示提示($r('app.string.deck_preview_empty'));
      return;
    }
    this.预览加载中 = true;
    try {
      await 后端会话.获取实例().确保已打开(context.filesDir);
      const search: string = await this.搜索服务实例.构建搜索串(makeParsableTextNode(scope));
      const order: SortOrder = { kind: 'none' };
      const request: SearchRequest = { search: search, order: order };
      const ids: number[] = await this.搜索服务实例.搜索卡片(request);
      if (ids.length === 0) {
        this.显示提示($r('app.string.deck_preview_empty'));
        return;
      }
      if (this.homeDisposed || this.页面栈.size() > 0 || this.选中的牌组ID !== deck.id) return;
      ids.sort((a: number, b: number): number => a - b);
      this.预览卡片ID列表 = ids;
      this.预览初始索引 = 0;
      this.预览媒体目录 = `${context.filesDir}/collection.media`;
      this.显示卡片预览 = true;
    } catch (error) {
      console.info(`首页: 打开牌组预览失败 deck=${deck.id} 错误=${error}`);
      this.显示提示($r('app.string.deck_preview_error'));
    } finally {
      this.预览加载中 = false;
      this.homeActivityChanged();
    }
  }

  /** 打开浏览页（全库浏览，不限定牌组）。浏览页可改卡/删卡/改到期，pop 回主页必须刷新。 */
  private 打开浏览页(): void {
    if (this.deferForSync((): void => { this.打开浏览页(); })) return;
    const params: 浏览页参数 = {};
    this.暂停主页官方公告检查();
    this.页面栈.pushPath({
      name: 'BrowserPage',
      param: params,
      onPop: (): void => {
        this.返回主页后刷新();
      }
    });
  }

  /** 预览更多菜单“编辑”：关闭预览并打开浏览页编辑当前卡片。 */
  private 关闭预览并编辑(卡片ID: number): void {
    this.显示卡片预览 = false;
    this.暂停主页官方公告检查();
    const params: 浏览页参数 = {
      initialSearch: `cid:${卡片ID}`,
      editCardId: 卡片ID
    };
    this.页面栈.pushPath({
      name: 'BrowserPage',
      param: params,
      onPop: (): void => {
        this.返回主页后刷新();
        this.显示卡片预览 = true;
      }
    });
  }

  /** 预览更多菜单“Agent 制卡”：关闭预览并进入 AI 制卡页。 */
  private 关闭预览并进入Agent制卡(): void {
    this.显示卡片预览 = false;
    this.打开AI制卡();
  }

  /** 打开浏览页并预填搜索串（查找重复对话框跳转用）。 */
  private 打开带搜索浏览页(搜索串: string): void {
    if (this.deferForSync((): void => { this.打开带搜索浏览页(搜索串); })) return;
    const params: 浏览页参数 = { initialSearch: 搜索串 };
    this.暂停主页官方公告检查();
    this.页面栈.pushPath({
      name: 'BrowserPage',
      param: params,
      onPop: (): void => {
        this.返回主页后刷新();
      }
    });
  }

  /** 打开统计页（全库统计图表）。'StatsPage' 是 NavPathStack 跨页面寻址协议，保留英文。 */
  private 打开统计页(): void {
    // 先展示首页已加载的统计；集合忙碌时由统计页延后数据库查询。
    this.syncController.cancel();
    const params: 统计页参数 = this.statsSnapshot;
    this.暂停主页官方公告检查();
    this.页面栈.pushPath({
      name: 'StatsPage',
      param: params,
      // Navigation push/pop 不触发 @Entry 的 onPageShow，不挂 onPop 的话
      // 从统计页返回主页永远不刷新（用户报告的“打开统计不能主动刷新”根因）。
      onPop: (): void => {
        this.返回主页后刷新();
      }
    });
  }

  /** 新建牌组全链路：确保已打开 → NewDeck → AddDeck → 刷新主页并选中新牌组。 */
  private 展开牌组路径(deck: 牌组汇总): void {
    const next: Set<string> = new Set<string>(this.展开的牌组ID集合);
    for (const ancestorId of deck.ancestorIds) next.add(ancestorId);
    this.展开的牌组ID集合 = next;
  }

  private 选择牌组(deckId: string): void {
    this.syncController.cancel();
    this.选中的牌组ID = deckId;
    const deck: 牌组汇总 = this.选中牌组();
    if (deck.id === '') {
      return;
    }
    this.展开牌组路径(deck);
    // 记忆上次选中的牌组，下次进入应用恢复选中（fire-and-forget，持久化失败不阻塞 UI）
    保存上次牌组ID(deckId).catch((): void => {});
    // 窄屏（手机）：点牌组后 显示牌组详情=true，根 Stack 内渲染 牌组详情面板 盖住列表。
    // 不再推栈 NavDestination——@Consume 在 NavDestination 内找不到 @Provide 导致空白。
    if (this.当前断点 === 'xs') {
      this.显示牌组详情 = true;
    }
  }

  private 切换牌组展开(deckId: string): void {
    const next: Set<string> = new Set<string>(this.展开的牌组ID集合);
    if (next.has(deckId)) next.delete(deckId); else next.add(deckId);
    this.展开的牌组ID集合 = next;
    this.牌组数据源.replaceAll(可见牌组行(this.主页快照数据.decks, this.展开的牌组ID集合, this.隐藏的牌组ID集合));
  }

  // 递归切换牌组
  // 当前折叠 → 展开本牌组 + 所有子孙牌组
  // 当前展开 → 折叠本牌组 + 所有子孙牌组
  // 通过 ancestorIds 包含 deckId 来判定子孙关系。
  private 递归切换牌组(deckId: string): void {
    const isExpanded: boolean = this.展开的牌组ID集合.has(deckId);
    const next: Set<string> = new Set<string>(this.展开的牌组ID集合);
    for (const deck of this.主页快照数据.decks) {
      // 匹配本牌组（deckId）或其子孙（ancestorIds 含 deckId）
      if (deck.id === deckId || deck.ancestorIds.includes(deckId)) {
        if (deck.hasChildren) {
          if (isExpanded) {
            next.delete(deck.id);
          } else {
            next.add(deck.id);
          }
        }
      }
    }
    this.展开的牌组ID集合 = next;
    this.牌组数据源.replaceAll(可见牌组行(this.主页快照数据.decks, this.展开的牌组ID集合, this.隐藏的牌组ID集合));
  }

  /** 长按牌组色条切换 tone：先持久化、再就地替换当前 主页快照数据 中对应行的 tone 并刷新列表，避免重拉后端数据。 */
  private async 更改牌组色调(deckId: string, tone: 牌组色调): Promise<void> {
    if (this.deferForSync((): void => { this.更改牌组色调(deckId, tone); })) return;
    await 保存牌组色调(deckId, tone);
    const oldDecks: 牌组汇总[] = this.主页快照数据.decks;
    const newDecks: 牌组汇总[] = oldDecks.map((deck: 牌组汇总): 牌组汇总 => {
      if (deck.id !== deckId) {
        return deck;
      }
      return {
        id: deck.id,
        name: deck.name,
        fullName: deck.fullName,
        depth: deck.depth,
        parentId: deck.parentId,
        hasChildren: deck.hasChildren,
        ancestorIds: deck.ancestorIds,
        description: deck.description,
        newCount: deck.newCount,
        learningCount: deck.learningCount,
        reviewCount: deck.reviewCount,
        totalCards: deck.totalCards,
        tone: tone,
        displayName: deck.displayName,
        backgroundImage: deck.backgroundImage
      };
    });
    this.主页快照数据 = {
      today: this.主页快照数据.today,
      decks: newDecks,
      memory: this.主页快照数据.memory
    };
    this.牌组数据源.replaceAll(可见牌组行(newDecks, this.展开的牌组ID集合));
  }

  /** 长按牌组 → 自定义牌组：打开改名面板。 */
  private 打开牌组定制(deckId: string): void {
    if (this.deferForSync((): void => { this.打开牌组定制(deckId); })) return;
    const deck: 牌组汇总 = this.按ID查牌组(deckId);
    if (deck.id === '') {
      return;
    }
    this.定制牌组ID = deckId;
    this.显示牌组定制 = true;
  }

  /** 长按牌组 → 自定义学习：对该牌组临时调增新卡/复习上限或按条件抽取卡片。 */
  private 打开自定义学习(deckId: string): void {
    if (this.deferForSync((): void => { this.打开自定义学习(deckId); })) return;
    const deck: 牌组汇总 = this.按ID查牌组(deckId);
    if (deck.id === '') {
      return;
    }
    this.自定义学习牌组ID = deckId;
    this.自定义学习牌组名 = deck.displayName;
    this.显示自定义学习 = true;
  }

  /** 长按牌组 → 创建过滤牌组：按搜索条件抽取卡片到临时牌组。 */
  private 打开创建过滤牌组(): void {
    if (this.deferForSync((): void => { this.打开创建过滤牌组(); })) return;
    this.显示过滤牌组面板 = true;
  }

  // 删除牌组
  // 后端语义（rslib/src/decks/remove.rs:remove_decks_and_child_decks）：递归处理子牌组，
  // 普通牌组删除卡片，筛选牌组归还卡片；Core 记录撤销，但首页没有通用撤销入口。
  private 请求删除牌组(deckId: string): void {
    if (this.deckDeletionBusy) return;
    if (this.deferForSync((): void => { this.请求删除牌组(deckId); })) return;
    const deck: 牌组汇总 = this.按ID查牌组(deckId);
    if (deck.id === '') {
      return;
    }
    const displayName: string = 牌组显示名(deck);
    const title: string = resourceText(this.getUIContext(),
      $r('app.string.deck_delete_confirm_title')).replace('%s', displayName);
    const message: string = resourceText(this.getUIContext(),
      $r('app.string.deck_delete_confirm_message'));
    this.nativeDialogOpen = true;
    this.getUIContext().showAlertDialog({
      title: title,
      message: message,
      autoCancel: false,
      cancel: (): void => { this.nativeDialogOpen = false; },
      alignment: DialogAlignment.Center,
      primaryButton: {
        value: $r('app.string.cancel'),
        action: (): void => { this.nativeDialogOpen = false; }
      },
      secondaryButton: {
        value: $r('app.string.deck_menu_delete'),
        fontColor: $r('app.color.error_text'),
        action: (): void => {
          this.nativeDialogOpen = false;
          this.确认删除牌组(deckId);
        }
      }
    });
  }

  private async 确认删除牌组(deckId: string): Promise<void> {
    if (this.deckDeletionBusy || this.deferForSync((): void => { this.确认删除牌组(deckId); })) return;
    this.deckDeletionBusy = true;
    try {
      this.deckDeletionStatus = $r('app.string.deck_media_checking');
      let before: string[] | null = null;
      try { before = await this.deckMediaCleanup.snapshot(); } catch {
        // 不可靠的基线不能用于清理；牌组删除本身仍按已确认的意图进行。
      }
      this.deckDeletionStatus = $r('app.string.deck_deleting');
      let count: number;
      try {
        count = await this.牌组服务实例.删除牌组([Number(deckId)]);
      } catch (error) {
        const reason: string = error instanceof Error ? error.message : `${error}`;
        const failMsg: string = resourceText(this.getUIContext(),
          $r('app.string.deck_delete_failed')).replace('%s', reason);
        showToastSafely(this.getUIContext(), { message: failMsg });
        return;
      }
      this.requestAutoSync();
      // 用已知层级立即清除级联删除的选择；默认牌组 1 本身由 Core 保留。
      const remaining: 牌组汇总[] = this.主页快照数据.decks.filter((deck: 牌组汇总): boolean =>
        deck.id === '1' || (deck.id !== deckId && deck.ancestorIds.indexOf(deckId) < 0));
      const selectionSaved: boolean = await this.reconcileDeckSelection(remaining);
      await this.加载主页数据();
      let successMsg: string = resourceText(this.getUIContext(),
        $r('app.string.deck_delete_success')).replace('%d', count.toString());
      if (!selectionSaved) successMsg += '\n' + resourceText(this.getUIContext(),
        $r('app.string.home_selection_save_failed'));
      showToastSafely(this.getUIContext(), { message: successMsg });
      await this.offerDeletedDeckMediaCleanup(before);
    } finally {
      this.deckDeletionBusy = false;
      this.homeActivityChanged();
      this.scheduleAutoSyncCheck();
    }
  }

  /** 删除已提交后独立检查并二次确认，失败不得报成牌组删除失败。 */
  private async offerDeletedDeckMediaCleanup(before: string[] | null): Promise<void> {
    if (this.homeDisposed || !this.syncForeground) return;
    if (before === null) {
      this.显示提示($r('app.string.deck_media_check_failed'));
      return;
    }
    try {
      this.deckDeletionStatus = $r('app.string.deck_media_checking');
      const candidates: string[] = await this.deckMediaCleanup.candidates(before);
      if (this.homeDisposed || !this.syncForeground) return;
      if (candidates.length === 0) {
        this.显示提示($r('app.string.deck_media_none'));
        return;
      }
      this.deckDeletionStatus = $r('app.string.deck_media_waiting');
      const confirmed: boolean = await this.confirmDeletedDeckMedia(candidates.length);
      if (!confirmed || this.homeDisposed || !this.syncForeground) return;
      this.deckDeletionStatus = $r('app.string.deck_media_checking');
      const removed: number = await this.deckMediaCleanup.cleanup(candidates);
      const message: string = resourceText(this.getUIContext(),
        $r('app.string.deck_media_cleaned')).replace('%d', removed.toString());
      showToastSafely(this.getUIContext(), { message: message });
    } catch {
      this.显示提示($r('app.string.deck_media_cleanup_failed'));
    }
  }

  /** 确认窗口始终处于删除忙碌期，阻止其他写入和自动同步改变引用关系。 */
  private confirmDeletedDeckMedia(count: number): Promise<boolean> {
    const message: string = resourceText(this.getUIContext(),
      $r('app.string.deck_media_confirm_message')).replace('%d', count.toString());
    return new Promise<boolean>((resolve): void => {
      this.getUIContext().showAlertDialog({
        title: $r('app.string.deck_media_confirm_title'),
        message: message,
        autoCancel: false,
        alignment: DialogAlignment.Center,
        cancel: (): void => { resolve(false); },
        primaryButton: {
          value: $r('app.string.deck_media_keep'),
          action: (): void => { resolve(false); }
        },
        secondaryButton: {
          value: $r('app.string.deck_media_remove'),
          fontColor: $r('app.color.error_text'),
          action: (): void => { resolve(true); }
        }
      });
    });
  }

  /** 数据变更后校验选择；偏好写入失败不改变已经提交的数据库操作结果。 */
  private async reconcileDeckSelection(decks: 牌组汇总[]): Promise<boolean> {
    const invalidSelection: boolean = this.选中的牌组ID !== '' &&
      !decks.some((deck: 牌组汇总): boolean => deck.id === this.选中的牌组ID);
    if (invalidSelection) this.选中的牌组ID = '';
    try {
      const saved: string = await 加载上次牌组ID();
      if (invalidSelection || (saved !== '' && !decks.some((deck: 牌组汇总): boolean => deck.id === saved))) {
        return await 清除上次牌组ID();
      }
      return true;
    } catch (error) {
      console.info(`Home selection persistence: ${error}`);
      return false;
    }
  }

  // 隐藏牌组
  // 与删除不同：隐藏只在前端列表里过滤掉，不动后端数据；可在设置页「已隐藏牌组」恢复。
  // 选中态/详情页若指向已隐藏牌组，清空避免悬空引用。
  private async 隐藏牌组(deckId: string): Promise<void> {
    if (this.deferForSync((): void => { this.隐藏牌组(deckId); })) return;
    try {
      await 隐藏牌组(deckId);
      if (this.选中的牌组ID === deckId) {
        this.选中的牌组ID = '';
        await 清除上次牌组ID();
      }
      const next: Set<string> = new Set<string>(this.隐藏的牌组ID集合);
      next.add(deckId);
      this.隐藏的牌组ID集合 = next;
      this.牌组数据源.replaceAll(可见牌组行(this.主页快照数据.decks, this.展开的牌组ID集合, this.隐藏的牌组ID集合));
      showToastSafely(this.getUIContext(), {
        message: resourceText(this.getUIContext(), $r('app.string.deck_hide_success'))
      });
    } catch (error) {
      // 持久化失败仅 Toast 提示，不阻断
      showToastSafely(this.getUIContext(), {
        message: resourceText(this.getUIContext(), $r('app.string.deck_hide_failed'))
      });
    }
  }

  /** 设置页「已隐藏牌组」入口：弹 AlertDialog 展示数量 + 全部恢复。
   *  简版方案（AlertDialog 只支持两个按钮）：全部恢复 / 取消。
   *  逐个恢复需 CustomDialog，后续按需升级。 */
  private 显示隐藏牌组对话框(): void {
    if (this.deferForSync((): void => { this.显示隐藏牌组对话框(); })) return;
    const count: number = this.隐藏的牌组ID集合.size;
    if (count === 0) {
      showToastSafely(this.getUIContext(), {
        message: resourceText(this.getUIContext(), $r('app.string.hidden_decks_empty'))
      });
      return;
    }
    const title: string = resourceText(this.getUIContext(), $r('app.string.hidden_decks_title'));
    const message: string = `${count}`;
    this.nativeDialogOpen = true;
    this.getUIContext().showAlertDialog({
      title: title,
      message: message,
      autoCancel: false,
      cancel: (): void => { this.nativeDialogOpen = false; },
      alignment: DialogAlignment.Center,
      primaryButton: {
        value: $r('app.string.cancel'),
        action: (): void => { this.nativeDialogOpen = false; }
      },
      secondaryButton: {
        value: $r('app.string.hidden_decks_unhide'),
        fontColor: $r('app.color.action_primary'),
        action: (): void => {
          this.nativeDialogOpen = false;
          this.确认全部取消隐藏();
        }
      }
    });
  }

  private async 确认全部取消隐藏(): Promise<void> {
    try {
      await 取消隐藏全部牌组();
      this.隐藏的牌组ID集合 = new Set<string>();
      this.牌组数据源.replaceAll(可见牌组行(this.主页快照数据.decks, this.展开的牌组ID集合, this.隐藏的牌组ID集合));
    } catch (error) {
      // 恢复失败静默降级，下次 加载主页数据 会重新加载
    }
  }

  // 应用牌组定制
  // 走 UI 覆盖路线（不动后端 rename_deck）：避免重名/层级冲突 BackendError、避免子牌组前缀级联改名、
  // 避免 LazyForKey 不含 name 导致 UI 不刷新。代价：导出 apkg/同步到其他设备时仍显示后端原名。
  // 背景图动作：keep 不动；remove 删沙盒文件 + preferences 键；replace 编码 PixelMap 写入沙盒 + preferences。
  private async deckCustomized(): Promise<void> {
    await this.加载主页数据();
    if (!this.homeDisposed) this.显示提示($r('app.string.deck_customize_save_done'));
  }

  // 数据迁移处理
  // 导入后展开新导入的含子牌组的父牌组。
  // 个人数据替换需二次确认（个人数据替换步骤 控制）。

  /**
   * 打开云端牌组弹窗，并重置上一次临时任务状态。
   * Invariants: 从菜单打开与开机引导共用同一份目录与下载逻辑，只有关闭语义不同——
   * 前者直接回首页，后者要二次确认且后续还要接欢迎弹窗。
   */

  /** 加载目录；未配置和网络错误都只留在弹窗中，不阻断首页。 */

  /**
   * 至少一个牌组成功导入且完成标记落盘后，才允许关闭弹窗。
   * Invariants: 关闭后两态都刷新首页让新牌组立刻可见；欢迎弹窗只在开机引导序列里衔接，
   * 菜单态用户已在正常使用中，突然弹版本欢迎页时机不合理。
   */

  /**
   * 返回键在云端牌组弹窗上的出口：完全复用右下角主按钮的行为，保证两条退出路径语义一致。
   * Invariants: busy 期间主按钮不可点，返回键同样静默；引导态有成功牌组时等于「进入软件」，
   * 其余情况等于「稍后再说」（菜单态即「关闭」）。
   */

  /**
   * 「稍后再说」/ 菜单态「关闭」的统一出口。
   * Invariants: 开机引导态必须二次确认并持久化完成标记，后续冷启动不再自动弹出；
   * 跳过不消耗下载配额，菜单里的「获取直链牌组」仍保持可见。
   */

  /** 把 Resource 取成本地化字符串；showDialog 只收 string，不收 Resource。 */
  private 取本地化文本(resource: Resource): string {
    return resourceText(this.getUIContext(), resource);
  }

  /** 点击首次引导中的 QQ 群提示时复制群号；复制结果通过本地化提示反馈。 */

  /** 刷新导入后的主页，并展开这次新出现且含子牌组的父节点。 */
  private 展开新导入牌组(oldDeckIds: Set<string>): void {
    const nextExpanded: Set<string> = new Set(this.展开的牌组ID集合);
    for (const deck of this.主页快照数据.decks) {
      if (deck.hasChildren && !oldDeckIds.has(deck.id)) {
        nextExpanded.add(deck.id);
      }
    }
    if (nextExpanded.size > this.展开的牌组ID集合.size) {
      this.展开的牌组ID集合 = nextExpanded;
      this.牌组数据源.replaceAll(可见牌组行(this.主页快照数据.decks,
        this.展开的牌组ID集合, this.隐藏的牌组ID集合));
    }
  }

  /** 按选择顺序串行下载并导入，单项失败不阻断后续牌组。 */

  /** 系统打开与选择器共用暂存、导入、错误提示及列表刷新。 */

  private 添加笔记的牌组选项(): 添加笔记牌组选项[] {
    return this.主页快照数据.decks.map((deck: 牌组汇总): 添加笔记牌组选项 => ({ id: Number(deck.id), name: deck.fullName }));
  }

  private 导出牌组选项列表(): 导出牌组选项[] {
    return this.主页快照数据.decks.map((deck: 牌组汇总): 导出牌组选项 => ({
      id: Number(deck.id), name: deck.fullName
    }));
  }

  // 进入建卡页
  // 仅当前选中牌组有效时入栈。
  // 'AddNotePage' 字符串是 NavPathStack 跨页面寻址协议，保留英文。
  private 打开添加笔记(): void {
    if (this.deferForSync((): void => { this.打开添加笔记(); })) return;
    if (!this.已选中牌组()) {
      return;
    }
    const params: 添加笔记页参数 = {
      deckId: this.选中的牌组ID,
      deckName: 牌组显示名(this.选中牌组()),
      deckOptions: this.添加笔记的牌组选项()
    };
    this.暂停主页官方公告检查();
    this.页面栈.pushPath({
      name: 'AddNotePage',
      param: params,
      onPop: (): void => {
        this.返回主页后刷新();
      }
    });
  }

  /**
   * 打开 AI 制卡页。不要求先选中牌组：页面内可自选，
   * 入参传当前选中牌组（若有）与主页快照的牌组候选。
   * 'AiCardPage' 字符串是 NavPathStack 跨页面寻址协议，保留英文。
   */
  private async 打开AI制卡(): Promise<void> {
    if (this.deferForSync((): void => { this.打开AI制卡(); })) return;
    if (!await this.isAIConfigured()) {
      this.openAISettings();
      return;
    }
    const 已有选中: boolean = this.已选中牌组();
    const params: AI制卡页参数 = {
      mode: 'create',
      deckId: 已有选中 ? this.选中的牌组ID : '',
      deckName: 已有选中 ? 牌组显示名(this.选中牌组()) : '',
      deckOptions: this.添加笔记的牌组选项()
    };
    this.暂停主页官方公告检查();
    this.页面栈.pushPath({
      name: 'AiCardPage',
      param: params,
      onPop: (): void => {
        this.返回主页后刷新();
      }
    });
  }

  /** 从首页进入浏览页多选卡片；选定目标后再打开 Agent 改卡。 */
  private async 打开AI改卡(): Promise<void> {
    if (this.deferForSync((): void => { this.打开AI改卡(); })) return;
    if (!await this.isAIConfigured()) {
      this.openAISettings();
      return;
    }
    const params: 浏览页参数 = { selectForAgentEdit: true };
    this.暂停主页官方公告检查();
    this.页面栈.pushPath({
      name: 'BrowserPage', param: params,
      onPop: (): void => { this.返回主页后刷新(); }
    });
  }

  /** 两个主页 AI 入口共用配置预检；读取失败按未配置处理。 */
  private async isAIConfigured(): Promise<boolean> {
    try {
      const settings: AgentSettings = await loadAgentSettings();
      const secret: string = await loadAgentSecret(settings.selectedProvider);
      return isAgentProviderConfigured(settings, secret);
    } catch (error) {
      return false;
    }
  }

  /** 未配置时从主页直接进入设置，并展开 AI 智能体分组。 */
  private openAISettings(): void {
    if (this.deferForSync((): void => { this.openAISettings(); })) return;
    const params: 设置页参数 = { openAiSettings: true };
    this.暂停主页官方公告检查();
    this.页面栈.pushPath({
      name: 'SettingsPage',
      param: params,
      onPop: (): void => { this.返回主页后刷新(); }
    });
  }

  // 创建牌组
  // 创建后立即记忆为新选中的牌组；失败时面板上显示错误。
  private async deckCreated(deckId: string, name: string): Promise<void> {
    this.选中的牌组ID = deckId;
    await this.加载主页数据();
    if (this.homeDisposed) return;
    this.展开牌组路径(this.选中牌组());
    this.牌组数据源.replaceAll(可见牌组行(this.主页快照数据.decks, this.展开的牌组ID集合, this.隐藏的牌组ID集合));
    if (检查节流标记(name)) {
      this.节流奖励文案 = 获取节流奖励();
      this.显示节流奖励 = true;
    } else {
      this.显示提示($r('app.string.create_deck_done'));
    }
  }

  private 打开牌组选项(): void {
    if (this.deferForSync((): void => { this.打开牌组选项(); })) return;
    if (this.deckOptionsBusy || this.显示牌组选项) return;
    const deck: 牌组汇总 = this.选中牌组();
    const deckId: number = Number(deck.id);
    if (!Number.isFinite(deckId) || deckId <= 0) return;
    this.牌组选项牌组ID = deckId;
    this.牌组选项牌组名 = 牌组显示名(deck);
    this.显示牌组选项 = true;
  }

  // Navigation 自定义转场回调
  // 通过 CustomTransition 单例查找 from/to 注册的 opacity 设置回调，
  // 在 animateTo 内调用起点→终点回调，触发淡入淡出。
  // 动画结束后必须调 proxy.finishTransition()，否则 timeout(1200ms) 后系统强制结束。
  // - 首页与各 NavDestination 之间也必须走本回调，禁止回退到系统横向平移
  // - 时长取自 取全屏转场时长，透明度避免弹簧过冲与限幅停顿
  private 自定义转场回调(from: NavContentInfo, to: NavContentInfo,
    operation: NavigationOperation): NavigationAnimatedTransition | undefined {
    const isPush: boolean = operation === NavigationOperation.PUSH;
    const 转场时长: number = 取全屏转场时长();
    const 转场曲线: Curve = Curve.EaseOut;
    const fromName: string = from.name ?? '';
    const toName: string = to.name ?? '';
    let backgroundGeneration: number = 0;
    return {
      timeout: 1200,
      onTransitionEnd: (): void => {
        if (backgroundGeneration === this.backgroundTransitionGeneration) {
          this.backgroundTransitionActive = false;
        }
      },
      transition: (transitionProxy: NavigationTransitionProxy): void => {
        // 转场期间冻结当前彩雾；旧转场结束不能恢复新转场暂停的背景。
        backgroundGeneration = ++this.backgroundTransitionGeneration;
        this.backgroundTransitionActive = true;
        const from起点 = CustomTransition.getInstance().取起点回调(fromName);
        const from终点 = CustomTransition.getInstance().取终点回调(fromName);
        const to起点 = CustomTransition.getInstance().取起点回调(toName);
        const to终点 = CustomTransition.getInstance().取终点回调(toName);
        if (from起点 !== null) {
          from起点(isPush, true);
        }
        if (to起点 !== null) {
          to起点(isPush, false);
        }
        const context: UIContext | undefined = this.getUIContext();
        if (context === undefined) {
          transitionProxy.finishTransition();
          return;
        }
        context.animateTo({
          duration: 转场时长,
          curve: 转场曲线,
          expectedFrameRateRange: { min: 60, max: 120, expected: 60 },
          onFinish: (): void => {
            transitionProxy.finishTransition();
          }
        }, (): void => {
          if (from终点 !== null) {
            from终点(isPush, true);
          }
          if (to终点 !== null) {
            to终点(isPush, false);
          }
        });
      }
    };
  }

  // 页面映射
  // 'StudyPage' / 'BrowserPage' / 'StatsPage' / 'AddNotePage' 字符串是 NavPathStack 跨页面寻址协议，保留英文。
  @Builder
  private 页面映射(name: string, param: ESObject) {
    if (name === 'StudyPage') {
      学习页({
        pageDeckId: (param as 学习页参数).deckId ?? '',
        pageDeckName: (param as 学习页参数).deckName ?? '',
        pathStack: this.页面栈
      })
    } else if (name === 'BrowserPage') {
      浏览页({
        pageDeckId: (param as 浏览页参数).deckId ?? '',
        pageInitialSearch: (param as 浏览页参数).initialSearch ?? '',
        pageSelectForAgentEdit: (param as 浏览页参数).selectForAgentEdit ?? false,
        pageEditCardId: (param as 浏览页参数).editCardId ?? -1,
        pathStack: this.页面栈
      })
    } else if (name === 'StatsPage') {
      统计页({
        pathStack: this.页面栈,
        initialSnapshot: param as 统计页参数
      })
    } else if (name === 'AddNotePage') {
      添加笔记页({
        pageDeckId: (param as 添加笔记页参数).deckId ?? '',
        pageDeckName: (param as 添加笔记页参数).deckName ?? '',
        pageDeckOptions: (param as 添加笔记页参数).deckOptions ?? [],
        pathStack: this.页面栈
      })
    } else if (name === 'AiCardPage') {
      AI制卡页({
        pageMode: (param as AI制卡页参数).mode ?? 'create',
        pageDeckId: (param as AI制卡页参数).deckId ?? '',
        pageDeckName: (param as AI制卡页参数).deckName ?? '',
        pageDeckOptions: (param as AI制卡页参数).deckOptions ?? [],
        pageCardIds: (param as AI制卡页参数).cardIds ?? [],
        pageNoteIds: (param as AI制卡页参数).noteIds ?? [],
        pageTemplateIdx: (param as AI制卡页参数).templateIdx ?? -1,
        pathStack: this.页面栈
      })
    } else if (name === 'ReminderPage') {
      学习提醒页({
        pathStack: this.页面栈
      })
    } else if (name === 'SettingsPage') {
      设置页({
        openAiSettings: (param as 设置页参数).openAiSettings ?? false,
        onManualSync: (): void => { this.requestManualSync(); },
        pathStack: this.页面栈
      })
    }
  }

  @Builder
  private homeLayout() {
    Column() {
      主页顶部工具栏({
        排序模式中: this.排序模式中,
        syncStatusText: this.syncStatusText,
        syncIndicator: this.syncIndicator,
        onSyncDetails: (): void => {
          if (this.显示同步面板) this.syncDetailsRequest++;
          else showToastSafely(this.getUIContext(), { message: this.syncStatusText });
        },
        on更多点击: (): void => {
          this.显示更多菜单 = true;
        },
        on创建牌组点击: (): void => {
          this.显示主页操作 = true;
        },
        on排序退出: (): void => {
          this.退出排序模式();
        },
        on排序完成: (): void => {
          this.退出排序模式();
        },
        主色容器色: this.主色容器色,
        页面底色微染值: this.页面底色微染值,
        动作主色: this.动作主色
      })
      GridRow({
        columns: { xs: 4, sm: 8, md: 12 },
        breakpoints: {
          value: ['600vp', '840vp'],
          reference: BreakpointsReference.WindowSize
        },
        gutter: 0
      }) {
        GridCol({ span: { xs: 4, sm: 5, md: 8 } }) {
          // B12-Y2 2026-07-23：主面板 直接铺满左 GridCol，去掉 Stack(Center) 居中。
          // 牌组列表右端 = 左 GridCol 右端 = 牌组详情面板 左端，紧贴无空白。
          // 用 主页摘要分页 + 主页牌组列表 两个积木组件替代原 主面板 @Builder，
          // 由 首页.ets 保留对数据状态的控制权（业务契约要求）。
          Column({ space: 应用尺寸.pageSectionGap }) {
            if (this.显示今日进度卡) {
              主页摘要分页({
                主页快照数据: this.主页快照数据,
                图表快照: this.图表快照
              })
            }
            主页牌组列表({
              牌组数据源: this.牌组数据源,
              牌组列表滚动器: this.牌组列表滚动器,
              展开的牌组ID集合: this.展开的牌组ID集合,
              选中的牌组ID: this.选中的牌组ID,
              排序模式中: this.排序模式中,
              加载状态: this.加载状态,
              刷新中: this.刷新中,
              动作主色: this.动作主色,
              主色按钮背景色: this.主色按钮背景色,
              onMove: (from: number, to: number): void => {
                this.处理牌组移动(from, to);
              },
              onItemSelect: (deckId: string): void => {
                this.选择牌组(deckId);
              },
              onItemToggle: (deckId: string): void => {
                this.切换牌组展开(deckId);
              },
              onItemToneChange: (deckId: string, tone: 牌组色调): void => {
                this.更改牌组色调(deckId, tone);
              },
              onItemCustomize: (deckId: string): void => {
                this.打开牌组定制(deckId);
              },
              onItemEnterReorder: (deckId: string): void => {
                this.进入排序模式();
              },
              onItemDelete: (deckId: string): void => {
                this.请求删除牌组(deckId);
              },
              onItemHide: (deckId: string): void => {
                this.隐藏牌组(deckId);
              },
              onItemDoubleTap: (deckId: string): void => {
                this.递归切换牌组(deckId);
              },
              onItemCustomStudy: (deckId: string): void => {
                this.打开自定义学习(deckId);
              },
              onItemCreateFilteredDeck: (): void => {
                this.打开创建过滤牌组();
              },
              onRefresh: (): void => {
                // 先置 刷新中=true 触发 @Watch 同步 刷新指示器开关=true（Refresh 内部已置 true，无副作用）；
                // 加载主页数据() 内部 finally 置 刷新中=false（true→false 触发 @Watch 同步 刷新指示器开关=false 收起指示器）。
                // 不显式置 true 会导致 刷新中 一直 false，@Watch 不触发，刷新指示器永远转圈。
                this.刷新中 = true;
                this.加载主页数据();
              },
              onRetry: (): void => {
                this.加载主页数据();
              }
            })
          }
          .width('100%')
          .height('100%')
          .padding({
            left: 应用尺寸.页面内边距_水平,
            right: 应用尺寸.页面内边距_水平,
            top: 应用尺寸.pageContentTopInset,
            bottom: 应用尺寸.pageBottomInset
          })
          .backgroundColor(this.页面底色微染值)
        }
        if (this.当前断点 !== 'xs') {
          GridCol({ span: { xs: 0, sm: 3, md: 4 } }) {
            牌组详情面板({
              historyRefreshToken: this.historyRefreshToken,
              是否深色: this.是否深色(),
              牌组选项加载中: this.deckOptionsBusy,
              开始学习: (): void => {
                this.开始学习();
              },
              预览: (): void => { this.打开牌组预览(); },
              添加卡片: (): void => { this.打开添加笔记(); },
              创建子牌组: (): void => {
                this.openCreateDeck(this.选中的牌组ID);
              },
              导出牌组: (): void => {
                this.打开数据迁移('exportDeck', Number(this.选中的牌组ID), false);
              },
              打开牌组选项: (): void => {
                this.打开牌组选项();
              }
            })
          }
        }
      }
      .layoutWeight(1)
      .onBreakpointChange((breakpoint: string) => {
        this.当前断点 = breakpoint;
        // 旋转/首屏 breakpoint 确定后若尚未恢复且变到宽屏，触发一次上次牌组恢复
        if (!this.上次牌组已恢复 && breakpoint !== 'xs') {
          this.尝试恢复上次牌组();
        }
      })
    }
    .width('100%')
    .constraintSize({ maxWidth: 应用尺寸.内容最大宽度 })
    .height('100%')
    .backgroundColor(this.页面底色微染值)
  }

  @Builder
  private homeMenus() {
    if (this.显示主页操作) {
      主页操作面板({
        创建牌组回调: (): void => {
          this.显示主页操作 = false;
          this.openCreateDeck('');
        },
        导入牌组回调: (): void => {
          this.显示主页操作 = false;
          this.从选择器导入牌组();
        },
        AI制卡回调: (): void => {
          this.显示主页操作 = false;
          this.打开AI制卡();
        },
        AI改卡回调: (): void => {
          this.显示主页操作 = false;
          this.打开AI改卡();
        },
        显示获取直链牌组: !this.云端牌组配额已用尽,
        获取直链牌组回调: (): void => {
          this.显示主页操作 = false;
          this.打开云端牌组弹窗(true);
        },
        关闭回调: (): void => {
          this.显示主页操作 = false;
        }
      })
    }

    // 更多下拉菜单：设置/浏览/统计/提醒 四项收纳
    if (this.显示更多菜单) {
      主页更多面板({
        onIntro: (): void => {
          this.显示更多菜单 = false;
          this.显示欢迎弹窗 = true;
        },
        设置回调: (): void => {
          this.显示更多菜单 = false;
          this.openSettings();
        },
        浏览回调: (): void => {
          this.显示更多菜单 = false;
          this.打开浏览页();
        },
        统计回调: (): void => {
          this.显示更多菜单 = false;
          this.打开统计页();
        },
        提醒回调: (): void => {
          this.显示更多菜单 = false;
          this.openReminders();
        },
        关闭回调: (): void => {
          this.显示更多菜单 = false;
        }
      })
    }
  }

  @Builder
  private compactDeckDetails() {
    if (this.当前断点 === 'xs' && this.显示牌组详情) {
      Column() {
        Row() {
          Button($r('app.string.study_back'))
            .height(应用尺寸.按钮高度)
            .padding({ left: 应用尺寸.卡片内边距, right: 应用尺寸.卡片内边距 })
            .constraintSize({ minWidth: 0 })
            .fontSize(应用尺寸.字号_按钮)
            .fontColor($r('app.color.text_primary'))
            .backgroundColor($r('app.color.surface_card'))
            .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
            .borderRadius(应用尺寸.圆角_胶囊)
            .onClick(() => {
              this.显示牌组详情 = false;
              this.加载主页数据();
            })
          Blank()
          按下态按钮({
            文案: $r('app.string.deck_add_card'),
            字色: this.动作主色,
            themeText: true,
            点击回调: (): void => { this.打开添加笔记(); }
          })
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

        牌组详情面板({
          historyRefreshToken: this.historyRefreshToken,
          showAddCard: false,
          是否深色: this.是否深色(),
          牌组选项加载中: this.deckOptionsBusy,
          开始学习: (): void => {
            this.开始学习();
          },
          预览: (): void => { this.打开牌组预览(); },
          添加卡片: (): void => {
            this.打开添加笔记();
          },
          创建子牌组: (): void => {
            this.openCreateDeck(this.选中的牌组ID);
          },
          导出牌组: (): void => {
            this.打开数据迁移('exportDeck', Number(this.选中的牌组ID), false);
          },
          打开牌组选项: (): void => {
            this.打开牌组选项();
          }
        })
        .layoutWeight(1)
      }
      .width('100%')
      .height('100%')
      .backgroundColor(this.页面底色微染值)
    }
  }

  @Builder
  private homeFeatures() {
    if (this.显示创建牌组) {
      CreateDeckFeature({ isDark: this.是否深色(), parentId: this.创建父牌组ID, decks: this.主页快照数据.decks,
        onBusy: (busy: boolean): void => { this.创建牌组中 = busy; },
        onClose: (): void => { this.创建牌组中 = false; this.显示创建牌组 = false; },
        onCreated: (id: string, name: string): Promise<void> => this.deckCreated(id, name) })
    }

    DataTransferFeature({ state: this.transfer, session: this.transferSession,
      deckOptions: this.导出牌组选项列表(), isDark: this.是否深色() })

    if (this.显示牌组选项) {
      DeckOptionsFeature({
        deckId: this.牌组选项牌组ID,
        deckName: this.牌组选项牌组名,
        isDark: this.是否深色(),
        onBusy: (busy: boolean): void => { this.deckOptionsBusy = busy; },
        onClose: (): void => { this.deckOptionsBusy = false; this.显示牌组选项 = false; }
      })
    }

    if (this.显示牌组定制) {
      DeckCustomizationFeature({ isDark: this.是否深色(), deck: this.按ID查牌组(this.定制牌组ID),
        onBusy: (busy: boolean): void => { this.定制牌组中 = busy; },
        onClose: (): void => { this.定制牌组中 = false; this.显示牌组定制 = false; },
        onSaved: (): Promise<void> => this.deckCustomized() })
    }

    // 自定义学习对话框（T2）：长按牌组 → 自定义学习…，成功后刷新主页
    if (this.显示自定义学习) {
      自定义学习对话框({
        isDark: this.是否深色(),
        deckId: this.自定义学习牌组ID,
        deckName: this.自定义学习牌组名,
        onClose: (): void => {
          this.显示自定义学习 = false;
        },
        onSuccess: (): void => {
          this.加载主页数据();
        }
      })
    }

    // 创建过滤牌组面板（T2）：长按牌组 → 创建过滤牌组，成功后刷新主页
    if (this.显示过滤牌组面板) {
      创建过滤牌组面板({
        isDark: this.是否深色(),
        onClose: (): void => {
          this.显示过滤牌组面板 = false;
        },
        onSuccess: (): void => {
          this.加载主页数据();
        }
      })
    }

    if (this.显示云端牌组弹窗) {
      CloudDeckFeature({ isDark: this.是否深色(), 云端牌组从菜单打开: this.云端牌组从菜单打开,
        backRequest: this.cloudBackRequest,
        onBusy: (busy: boolean): void => { this.云端牌组忙碌 = busy; },
        onQuota: (exhausted: boolean): void => { this.云端牌组配额已用尽 = exhausted; },
        onImported: async (): Promise<void> => {
          const before: Set<string> = new Set(this.主页快照数据.decks.map((deck: 牌组汇总): string => deck.id));
          await this.加载主页数据();
          if (!this.homeDisposed) { this.展开新导入牌组(before); this.requestAutoSync(); }
        },
        onClose: (welcome: boolean): void => {
          this.显示云端牌组弹窗 = false; this.云端牌组忙碌 = false;
          this.返回主页后刷新();
          if (welcome) this.显示欢迎弹窗一次();
        }
      })
    }
  }

  @Builder
  private homePrompts() {
    if (this.显示官方公告 && this.官方公告数据 !== null) {
      官方公告弹窗({
        announcement: this.官方公告数据,
        isDark: this.是否深色(),
        acknowledging: this.官方公告确认中,
        onAcknowledge: (): void => { this.确认官方公告(); },
        onOpenDetails: (): void => { this.打开官方公告详情(); }
      })
    }

    // 首次启动欢迎弹窗：放最顶层，确保覆盖所有浮层
    //   关闭时持久化入门已读标记（不会在展示时提前标记，
    //   这里仅关闭状态；即使弹窗未显示也已标记，保证「只弹一次」语义）
    if (this.显示卡片预览) {
      卡片预览页({
        isDark: this.是否深色(),
        卡片ID列表: this.预览卡片ID列表,
        初始索引: this.预览初始索引,
        媒体目录: this.预览媒体目录,
        onPositionChanged: (index: number): void => {
          this.预览初始索引 = index;
        },
        onEditField: (卡片ID: number): void => { this.关闭预览并编辑(卡片ID); },
        onCreateWithAgent: (): void => { this.关闭预览并进入Agent制卡(); },
        onClose: (): void => { this.显示卡片预览 = false; }
      })
    }

    if (this.显示欢迎弹窗) {
      HomeIntroPanel({
        onClose: (): void => { this.closeHomeIntro(); }
      })
    }

    if (this.deckDeletionBusy) {
      Column({ space: 12 }) {
        LoadingProgress().width(36).height(36)
        Text(this.deckDeletionStatus)
          .fontSize(应用尺寸.字号_正文)
          .fontColor($r('app.color.text_primary'))
      }
      .width('100%')
      .height('100%')
      .justifyContent(FlexAlign.Center)
      .backgroundColor($r('app.color.surface_page'))
      .onClick((): void => {})
    }

    if (this.显示节流奖励) {
      Stack() {
        Column()
          .width('100%')
          .height('100%')
          .backgroundColor('rgba(0,0,0,0.35)')
          .backgroundBlurStyle(BlurStyle.Thin, {
            colorMode: ThemeColorMode.LIGHT,
            adaptiveColor: AdaptiveColor.DEFAULT
          })
          .onClick(() => { this.显示节流奖励 = false; })

        Column() {
          Row() {
            Button() {
              Text() { ThemeTextSpans($r('app.string.easter_egg_got_it'), this.themeAccentColors, this.getUIContext()) }.fontSize(应用尺寸.字号_按钮).fontWeight(FontWeight.Medium).fontColor(this.动作主色)
            }
              .type(ButtonType.Capsule)
              .height(应用尺寸.按钮高度)
              .fontSize(应用尺寸.字号_按钮)
              .fontWeight(FontWeight.Medium)
              .backgroundColor(Color.Transparent)
              .fontColor(this.动作主色)
              .onClick(() => { this.显示节流奖励 = false; })
          }
          .width('100%')
          .justifyContent(FlexAlign.End)
          .padding({ left: 20, right: 20, top: 12 })

          Text(this.节流奖励文案)
            .fontSize(应用尺寸.字号_彩蛋文案)
            .fontWeight(FontWeight.Bold)
            .fontColor($r('app.color.text_primary'))
            .width('100%')
            .textAlign(TextAlign.Center)
            .padding({ top: 24, bottom: 32 })

        }
        .width('88%')
        .constraintSize({ maxWidth: 380 })
        .backgroundColor($r('app.color.surface_page'))
        .borderRadius(应用尺寸.圆角_指标卡)
        .shadow({ radius: 24, color: 'rgba(0,0,0,0.18)', offsetX: 0, offsetY: 4 })
      }
      .width('100%')
      .height('100%')
      .alignContent(Alignment.Center)
      .transition(TransitionEffect.OPACITY.animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }))
    }
  }

  build() {
    Stack() {
      ThemeBackground({ transitionActive: this.backgroundTransitionActive })
    Navigation(this.页面栈) {
      Stack() {
        this.homeLayout()

        this.homeMenus()

        // 窄屏详情显隐（方案 C 2026-07-25）：显示牌组详情=true 时 牌组详情面板 盖住列表。
        // 牌组详情面板 在根 Stack 内，作为 @Entry 后代，@Consume 能找到 @Provide。
        // B12-Y3 2026-07-28：详情面板必须在 3 个协调器弹窗之前渲染，否则弹窗被详情面板遮挡，
        // 用户点「创建子牌组/牌组选项/导出」后弹窗藏在详情面板背后，返回后才看到。
        this.compactDeckDetails()

        // 功能弹层在窄屏详情之后绘制，保持可见和可交互。
        // B12-Y3 2026-07-28：弹层渲染在窄屏详情面板之后，确保弹窗能盖住详情面板。
        this.homeFeatures()

        // 官方启动公告：层级高于云端牌组引导与欢迎弹窗；返回键与遮罩不关闭，仅「我知道了」关闭
        this.homePrompts()

      }
      .width('100%')
      .height('100%')
      .backgroundColor(this.页面底色微染值)
      .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
    }
    .hideTitleBar(true)
    .mode(NavigationMode.Stack)
    .navDestination(this.页面映射)
    // 用箭头函数包裹，避免方法引用丢失 this 绑定后 transition 回调内 this 为 undefined（BUG：从二级页面 push 三级页面时崩溃 "Cannot read property getUIContext of undefined"）。
    .customNavContentTransition((from: NavContentInfo, to: NavContentInfo, op: NavigationOperation): NavigationAnimatedTransition | undefined => this.自定义转场回调(from, to, op))
    .backgroundColor(Color.Transparent)
      // 根宿主跨导航保留，收起详情/进入学习不销毁媒体轮询。
      if (this.显示同步面板) {
        同步面板({
          是否深色: this.是否深色(),
          账号名: this.同步面板账号名,
          初始鉴权: this.同步面板认证,
          automatic: this.syncAutomatic,
          backRequest: this.syncBackRequest,
          detailsRequest: this.syncDetailsRequest,
          statusChanged: (text: string, indicator: string): void => {
            this.syncStatusText = text;
            this.syncIndicator = indicator;
          },
          onYield: (automatic: boolean): void => { this.syncYielded(automatic); },
          onRetry: (): void => {
            this.syncScheduler.requestManual();
            this.syncHostClosed();
          },
          状态变化回调: (busy: boolean, modal: boolean): void => { this.autoSyncStateChanged(busy, modal); },
          同步完成回调: (fsrsDisabledBySync: boolean): void => {
            this.autoSyncCollectionFinished(fsrsDisabledBySync);
          },
          关闭回调: (): void => {
            this.syncHostClosed();
          }
        })
      }
    }
    .width('100%').height('100%')
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }
}
