import { PressFeedback } from '../utils/PressFeedback';
import { SurfaceBorder } from '../utils/SurfaceBorder';
import { EditNotePageParams } from '../model/navigation/PageParams';
import { CollectionHistoryDialog } from '../components/CollectionHistoryDialog';
import { BrowserResetDialog } from '../components/browser/BrowserResetDialog';
import type { ScheduleCardsAsNewOptions } from '../proto/messages/SchedulerMessages';
import { BrowserMoreMenu } from '../components/browser/BrowserMoreMenu';
import { appInterface } from '../backend/AppInterfaceService';
import { BrowserNotetypeFeature } from '../components/browser/BrowserNotetypeFeature';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { DialogBackdrop } from '../components/common/DialogBackdrop';
import { showToastSafely, localizedNamedResourceText, namedResourceText } from '../utils/UiFeedback';
import { loadBrowserSidebar, parseBrowserSavedSearches, removeBrowserSavedSearch, serializeBrowserSavedSearches, upsertBrowserSavedSearch } from '../model/BrowserSidebar';
import type { BrowserSavedSearch } from '../model/BrowserSidebar';
import { AnkiBrowserSidebar } from '../backend/AnkiBrowserSidebar';
import { BrowserSearchSession } from '../model/BrowserSearchSession';
import { AnkiBrowserSearch } from '../backend/AnkiBrowserSearch';
import { resolveBrowserCardIds, resolveBrowserNoteIds } from '../model/BrowserSelection';
import type { 变更笔记类型请求 } from '../proto/messages/NotetypeMessages';
import { SelectStyle } from '../utils/SelectStyle';
import { BrowserOperationContext, BrowserOperationController } from '../model/BrowserOperationController';
import { BrowserCardStateBackend, toggleBrowserCardState } from '../model/BrowserCardState';
import { autoSyncScheduler } from '../model/AutoSyncScheduler';
import { PAGE_SURFACE_KEY } from '../model/ThemeCatalog';
import { PAGE_COMPACT_LAYOUT_KEY } from '../model/AppLayoutState';

import { BrowserDueDialog } from '../components/browser/BrowserDueDialog';
import { BrowserRenameTagDialog } from '../components/browser/BrowserRenameTagDialog';
import { BrowserTagsDialog } from '../components/browser/BrowserTagsDialog';
import { TagSelectionChange, TagRow, flattenTagTree, newTagName, tagSearchNode, updateSelectedNoteTags } from '../model/NoteTags';
import { EditableNote } from '../proto/messages/NoteMessages';
import { BrowserSavedSearchDialog } from '../components/browser/BrowserSavedSearchDialog';
import { BrowserDeckDialog } from '../components/browser/BrowserDeckDialog';
import { FlagNamesDialog } from '../components/browser/FlagNamesDialog';
import { AnkiCardMarking } from '../backend/AnkiCardMarking';
import { FlagLabels, parseFlagLabels, customFlagLabel, setMarkedNotes, setCardFlags } from '../model/CardMarking';
import { syncActivity } from '../model/SyncSettings';
import { BrowserBatchConfirm } from '../components/browser/BrowserBatchConfirm';
import { BrowserRepositionDialog, BrowserRepositionInput } from '../components/browser/BrowserRepositionDialog';
// 页面负责导航、表单和 UI 事件；搜索/行读取、侧栏、编辑器读取各有独立模型。
// 集合写入统一经过 BrowserOperationController，迟到读取按所属操作代次失效。

import { common } from '@kit.AbilityKit';

import { BROWSER_QUICK_FILTERS, BrowserQuickFilter } from '../model/BrowserQuickFilter';
import { 搜索服务 } from '../backend/搜索服务';
import { 笔记服务 } from '../backend/笔记服务';
import { 笔记类型服务 } from '../backend/笔记类型服务';
import { 卡片服务 } from '../backend/卡片服务';
import { 牌组服务 } from '../backend/牌组服务';
import { 调度器服务 } from '../backend/调度器服务';
import { 标签服务 } from '../backend/标签服务';
import { 配置服务 } from '../backend/配置服务';
import type { BrowserColumn, BrowserRow, FindAndReplaceRequest } from '../proto/messages/SearchMessages';
import { BrowserColumnSorting } from '../proto/messages/SearchMessages';

import type { Card } from '../proto/messages/CardsMessages';
import type { DeckTreeNode } from '../proto/messages/DeckMessages';
import type { TagTreeNode } from '../proto/messages/TagsMessages';

import { ConfigKeyBool } from '../proto/messages/ConfigMessages';
import { 应用尺寸 } from '../utils/应用尺寸';
import { CustomTransition } from '../utils/自定义转场';
import { 统一加载态 } from '../components/common/统一加载态';
import { 统一错误态 } from '../components/common/统一错误态';
import { DialogHeader } from '../components/common/DialogHeader';
import { 搜索框 } from '../components/browser/搜索框';
import { BrowserViewMenu } from '../components/browser/BrowserViewMenu';
import { 卡片表格, 浏览行数据 } from '../components/browser/卡片表格';
import { 批量操作栏 } from '../components/browser/批量操作栏';
import { 字段帮助面板 } from '../components/字段帮助面板';
import { 按下态按钮 } from '../components/common/按下态按钮';
import { 卡片信息 } from '../components/browser/卡片信息';
import { 查找替换对话框 } from '../components/browser/查找替换对话框';
import { 浏览侧边栏, 已保存搜索项 } from '../components/browser/浏览侧边栏';
import { 卡片预览页 } from '../components/browser/卡片预览页';
import { 颜色键 } from '../model/颜色主题';
import { 加载主题模式 } from '../model/主题存储';
import { 解析是否深色, 主题模式 } from '../model/主题设置';
import type { AI制卡页参数 } from './AI制卡页';
import { 设置页参数 } from '../model/navigation/PageParams';
import {
  AgentSettings,
  isAgentProviderConfigured,
  loadAgentSettings
} from '../backend/agent/AgentSettingsStore';
import { loadAgentSecret } from '../backend/agent/AgentSecretStore';

/** 浏览页阶段状态机：loading=加载中，list=列表展示，error=出错 */
type 浏览阶段 = 'loading' | 'list' | 'error';

/** 浏览模式：cards=卡片列表，notes=笔记列表 */
type 浏览模式 = 'cards' | 'notes';
interface MarkingReadToken { version: number; }

/** T8 改牌组选择器列表项（扁平化后的牌组树节点）。 */

@Component
export struct 浏览页 {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @State private flagLabels: FlagLabels = {};
  @State private flagNamesOpen: boolean = false;
  @State private flagNamesBackRequest: number = 0;
  private readonly markingBackend: AnkiCardMarking = new AnkiCardMarking();
  private flagLabelsVersion: number = 0;
  @State private batchBackRequest: number = 0;
  @StorageProp(PAGE_COMPACT_LAYOUT_KEY) private narrowDeckLayout: boolean = false;
  /** Navigation 入栈参数：牌组 ID（空=全库） */
  pageDeckId: string = '';
  /** Navigation 入栈参数：初始搜索串（空=默认搜索；查找重复对话框跳转时传入） */
  pageInitialSearch: string = '';
  pageInitialNotesMode: boolean = false;
  /** 进入后复用浏览预览；只匹配本次初始搜索的真实结果。 */
  pageInitialPreviewCardId: number = 0;
  /** Navigation 入栈参数：是否为 Agent 改卡直接进入多选。 */
  pageSelectForAgentEdit: boolean = false;
  /** 页面栈：返回主页时 pop */
  pathStack: NavPathStack = new NavPathStack();
  private readonly 搜索服务实例: 搜索服务 = new 搜索服务();
  private readonly 笔记服务实例: 笔记服务 = new 笔记服务();
  private readonly 笔记类型服务实例: 笔记类型服务 = new 笔记类型服务();
  private readonly 卡片服务实例: 卡片服务 = new 卡片服务();
  private readonly 牌组服务实例: 牌组服务 = new 牌组服务();
  private readonly 调度器服务实例: 调度器服务 = new 调度器服务();
  private readonly 标签服务实例: 标签服务 = new 标签服务();
  private readonly 配置服务实例: 配置服务 = new 配置服务();

  private interfaceMounted: boolean = false;
  @State @Watch('publishInterface') private 阶段: 浏览阶段 = 'loading';
  @State private 错误详情: string = '';
  @State private 搜索文本: string = '';
  @State @Watch('publishInterface') private quickFilter: string = 'all';
  @State @Watch('publishInterface') private 浏览模式值: 浏览模式 = 'cards';
  @State @Watch('publishInterface') private 结果ID列表: number[] = [];
  @State private 行列表: 浏览行数据[] = [];
  @State private 列定义: BrowserColumn[] = [];
  @State private subtitleIndex: number = 1;
  @State private collectionHistoryOpen: boolean = false;
  @State private collectionHistoryBackRequest: number = 0;
  private resetSelection: BrowserOperationContext | null = null;
  @State private showMoreMenu: boolean = false;
  @State private showBatchMenu: boolean = false;
  @State private showViewMenu: boolean = false;
  @State private viewMenuGroup: string = 'mode';
  @State private viewMenuWidth: number = 240;
  @State private sortColumn: string = '';
  @State private sortReverse: boolean = false;
  private readonly searchSession: BrowserSearchSession = new BrowserSearchSession(new AnkiBrowserSearch());
  @State private editingPageOpen: boolean = false;
  private editingChangedTick: number = 0;
  private readonly sidebarBackend: AnkiBrowserSidebar = new AnkiBrowserSidebar();
  private sidebarVersion: number = 0;
  private searchVersion: number = 0;
  private selectionVersion: number = 0;
  private consumedRowCount: number = 0;
  private refreshingSearch: boolean = false;
  private readonly operations: BrowserOperationController = new BrowserOperationController();
  @State @Watch('publishInterface') private mutationBusy: boolean = false;
  /** NavDestination 透明度（由 customNavContentTransition 回调控制，实现淡入淡出转场）。 */
  @State private 转场透明度: number = 1;

  // 字段帮助浮层（与设置面板同模式：子组件上抛 → 父组件根 Stack 统一渲染）
  @State private 显示说明浮层: boolean = false;
  @State private 说明标题: Resource = $r('app.string.browser_help_sidebar_title');
  @State private 说明正文: Resource = $r('app.string.browser_help_sidebar_body');

  // T11 卡片信息状态：非多选模式下点击行右侧 info 按钮 → 懒加载该卡 CardStatsView
  @State private 显示卡片信息: boolean = false;
  @State private infoCardId: number = 0;

  // T8 批量操作栏状态：多选模式 + 选中ID + 4 个操作弹层 + 牌组树（改牌组选择器用）
  @State private 多选模式值: boolean = false;
  @State @Watch('publishInterface') private 选中ID列表: number[] = [];
  // 退出多选信号：每次退出多选 +1，经 @Watch 触发 卡片表格 清内部选中（组件内部状态不可外部直改）
  @State private batchDialog: string = 'none';
  @State private batchNoteTags: string[][] = [];
  private batchTagSelection: BrowserOperationContext | null = null;
  @State private 批量忙碌: boolean = false;
  @State private 批量错误: string = '';
  @State private 牌组树: DeckTreeNode | null = null;

  // T8 设置到期日弹层状态：TextInput 输入 days 字符串（"0"/"5"/"1-3" 等）

  // T8 重新定位弹层状态：起始位置/步长/随机/顺移已有

  // T8 更改笔记类型弹层状态：旧/新笔记类型 + 字段/模板映射

  // T9 查找替换状态：顶部条按钮触发弹层，支持仅选中笔记或全部笔记两种范围
  @State private 显示查找替换: boolean = false;
  @State private 查找替换忙碌: boolean = false;
  @State private 查找替换错误: string = '';

  // T6 侧边栏状态：顶部条按钮触发抽屉，含牌组/标签/已保存搜索三区
  // 牌组树复用 this.牌组树（T8 改牌组弹层已加载）；标签树 + 已保存搜索 + 分区折叠状态独立加载
  @State private 显示侧边栏: boolean = false;
  @State private 侧边栏忙碌: boolean = false;
  @State private 侧边栏错误: string = '';
  @State private 标签树: TagTreeNode | null = null;
  @State private 已保存搜索列表: 已保存搜索项[] = [];
  @State private 侧边栏牌组折叠: boolean = false;
  @State private 侧边栏标签折叠: boolean = false;
  @State private 侧边栏已保存搜索折叠: boolean = false;
  @State private 显示保存搜索: boolean = false;
  @State private 保存搜索编辑项: BrowserSavedSearch | null = null;
  @State private 保存搜索初始查询: string = '';
  @State private 保存搜索错误: string = '';
  @State private 保存搜索忙碌: boolean = false;

  // T6 标签管理状态：侧边栏长按标签 → 弹操作菜单 → 重命名/删除/补全
  @State private 显示标签重命名: boolean = false;
  @State private 标签重命名忙碌: boolean = false;
  @State private 标签重命名错误: string = '';
  @State private 重命名原标签名: string = '';
  @State private 标签操作忙碌: boolean = false;

  // T5 卡片预览状态：Cards 模式下点击行 → 弹全屏预览；底部「编辑字段」→ 在预览上方打开 浏览编辑区
  @State private 显示预览: boolean = false;
  private previewBackHandler: (() => boolean) | null = null;
  @State private previewCardIds: number[] = [];
  @State private 预览初始索引: number = 0;
  @State private 预览媒体目录: string = '';
  @State private 预览刷新版本: number = 0;

  // 主题模式：编辑区 isDark 判断用（与 学习页/添加笔记页 同语义）
  @StorageLink('themeMode') private 主题模式值: 主题模式 = 'system';
  @StorageLink('systemDarkMode') private 系统暗黑模式: boolean = false;

  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景色: string = '#2F5FD0';
  @StorageProp(颜色键.主色容器) private 主色容器色: string = '#E8EEFC';
  @StorageProp(PAGE_SURFACE_KEY) private 页面底色微染值: string = '#F5F7FA';
  @StorageProp('状态栏高度') private 状态栏高度: number = 0;

  async aboutToAppear(): Promise<void> {
    this.interfaceMounted = true;
    this.publishInterface();
    this.loadFlagLabels();
    this.多选模式值 = this.pageSelectForAgentEdit;
    // 注册自定义转场回调：首页 Navigation.customNavContentTransition 通过此 name 查找回调，
    // 在 animateTo 内调用起点/终点回调修改 转场透明度，实现淡入淡出（替代系统默认左右平移）。
    // key 用 'BrowserPage'（NavPathStack pushPath 时传的 name，与 from.name / to.name 一致）。
    CustomTransition.getInstance().注册NavParam('BrowserPage',
      (isPush: boolean, isExit: boolean): void => {
        this.转场透明度 = isExit ? 1 : 0;
      },
      (isPush: boolean, isExit: boolean): void => {
        this.转场透明度 = isExit ? 0 : 1;
      }
    );
    // 加载主题模式用于编辑区深色判断；失败回退 'system'，不阻塞浏览流程
    try {
      this.主题模式值 = await 加载主题模式();
    } catch (_错误) {
      this.主题模式值 = 'system';
    }
    if (!this.operations.isAlive()) return;
    // 应用入栈传入的初始搜索串（如查找重复对话框跳转时），再触发搜索
    if (this.pageInitialSearch !== '') {
      this.搜索文本 = this.pageInitialSearch;
    }
    if (this.pageInitialNotesMode) this.浏览模式值 = 'notes';
    if (this.pageSelectForAgentEdit) {
      this.多选模式值 = true;
    }
    const initialSearchVersion: number = this.searchVersion + 1;
    await this.执行搜索();
    if (!this.operations.isAlive()) return;
    if (this.pageInitialPreviewCardId > 0 && this.searchVersion === initialSearchVersion &&
      this.阶段 === 'list' && this.浏览模式值 === 'cards' && this.结果ID列表.includes(this.pageInitialPreviewCardId)) {
      this.打开预览(this.pageInitialPreviewCardId);
    }
    // 顶部牌组选择器：加载牌组树（失败不阻塞搜索，Select 仅显示"全部"）
    this.加载牌组树().catch((错误: ESObject): void => {
      console.info(`BrowserPage: aboutToAppear 加载牌组树失败 错误=${错误}`);
    });
  }

  /** 加载牌组树供顶部选择器 + T8 改牌组弹层共用。失败抛出由调用方处理。 */
  private async 加载牌组树(): Promise<void> {
    try {
      this.牌组树 = await this.牌组服务实例.获取牌组树();
    } catch (错误) {
      console.info(`BrowserPage: 加载牌组树失败 错误=${错误}`);
      throw new Error(`${错误}`);
    }
  }

  /** 暗色模式判断：主题模式值=system 时跟随系统，否则按显式选择。与 学习页/添加笔记页 同语义。 */
  private 是否深色(): boolean {
    return 解析是否深色(this.主题模式值, this.系统暗黑模式);
  }

  /** 读取本地化文案，context 不可用时回退空串。 */
  private 取本地化文案(资源: Resource, _locale: string = this.uiLanguage): string {
    const 上下文: common.UIAbilityContext | null = this.取能力上下文();
    if (上下文 === null) {
      return '';
    }
    try {
      return 上下文.resourceManager.getStringSync(资源.id);
    } catch (_错误) {
      return '';
    }
  }

  /**
   * 构建更改笔记类型弹层里「字段/模板映射」下拉的选项列表。
   * 第 0 项固定为「不映射」，其余为旧字段/模板名。
   * 抽成方法是为了避免在 build() 里写字面量数组 + concat，
   * 触发 ArkTS 严格模式的 arkts-no-noninferrable-arr-literals / arkts-no-untyped-obj-literals。
   */

  aboutToDisappear(): void {
    this.interfaceMounted = false;
    appInterface.hidePage('browser');
    appInterface.leave('browser');
    this.operations.dispose();
    this.searchVersion++;
    CustomTransition.getInstance().注销NavParam('BrowserPage');
    // 通知首页刷新牌组计数：页内删除/改牌组/挂起/重置到期等写操作分散在多个方法，
    // 统一在离页时广播（幂等，纯浏览未改数据时多刷一次无副作用）；onPop 偶发不触发时仍能刷新。
    AppStorage.setOrCreate<number>('需要刷新主页', Date.now());
  }

  private publishInterface(): void {
    if (!this.interfaceMounted) return;
    appInterface.observe({ surface: 'browser', sectionId: this.阶段, selectedId: this.浏览模式值,
      optionIds: this.结果ID列表.slice(0, 100).map((id: number): string => String(id)), optionLabels: [],
      optionsTotal: this.结果ID列表.length, busy: this.mutationBusy || this.阶段 === 'loading',
      values: [{ id: 'mode', value: this.浏览模式值 }, { id: 'filter', value: this.quickFilter },
        { id: 'selected_count', value: String(this.选中ID列表.length) }] });
  }

  /**
   * 系统返回键 / 屏幕边缘滑动返回：弹窗优先消费，否则走 NavPathStack 默认 pop 回首页。
   * Invariants: 按层级逆序消费——先二次确认类（删除/挂起可能丢数据）→ 对话框 → 抽屉 →
   * 全屏预览 → 行内弹层 → 浮层；任一命中即关对应弹窗并 return true；都不命中 return false。
   * Extension Points: 新增弹窗时在此链中按层级插入对应 @State 判断。
   */
  onBackPress(): boolean {
    if (this.collectionHistoryOpen) { this.collectionHistoryBackRequest++; return true; }
    if (this.flagNamesOpen) { this.flagNamesBackRequest++; return true; }
    if (this.显示说明浮层) { this.显示说明浮层 = false; return true; }
    if (this.showViewMenu) { this.showViewMenu = false; return true; }
    if (this.showMoreMenu) { this.showMoreMenu = false; return true; }
    if (this.showBatchMenu) { this.batchBackRequest++; return true; }
    if (this.batchDialog !== 'none') { if (!this.mutationBusy) this.batchBackRequest++; return true; }
    if (this.显示标签重命名) { if (!this.标签重命名忙碌 && !this.mutationBusy) this.显示标签重命名 = false; return true; }
    if (this.显示保存搜索) { if (!this.保存搜索忙碌) this.显示保存搜索 = false; return true; }
    if (this.显示侧边栏) { this.显示侧边栏 = false; return true; }
    if (this.显示查找替换) { if (!this.查找替换忙碌 && !this.mutationBusy) this.显示查找替换 = false; return true; }
    if (this.显示卡片信息) { this.关闭卡片信息(); return true; }
    if (this.显示预览) {
      if (this.previewBackHandler?.()) return true;
      this.显示预览 = false;
      return true;
    }
    if (this.多选模式值) { this.退出多选(); return true; }
    return false;
  }



  private 取能力上下文(): common.UIAbilityContext | null {
    const context: common.UIAbilityContext | undefined =
      AppStorage.get<common.UIAbilityContext>('abilityContext');
    return context === undefined ? null : context;
  }

  /** 将查询快照交给搜索会话；一次性发布完整首屏，旧请求不修改 UI。 */
  private async loadFlagLabels(): Promise<void> {
    const version: number = ++this.flagLabelsVersion;
    const owner: MarkingReadToken = { version: version };
    autoSyncScheduler.beginOperation(owner);
    try {
      await syncActivity.waitForCollection();
      if (!this.interfaceMounted || version !== this.flagLabelsVersion) return;
      const labels: FlagLabels = parseFlagLabels(await this.markingBackend.labels());
      if (this.interfaceMounted && version === this.flagLabelsVersion) this.flagLabels = labels;
    } catch (error) {
      if (this.interfaceMounted && version === this.flagLabelsVersion)
        showToastSafely(this.getUIContext(), { message: this.取本地化文案($r('app.string.card_mark_load_error')) });
    } finally { autoSyncScheduler.endOperation(owner); }
  }

  private async 执行批量标星(marked: boolean): Promise<void> {
    await this.runBatchOperation(async (context: BrowserOperationContext): Promise<void> => {
      const ids: number[] = await this.解析选中为笔记ID(context);
      await setMarkedNotes(this.markingBackend, ids, marked);
    }, $r('app.string.card_mark_save_error'));
  }

  private async 执行搜索(keepRows: boolean = false): Promise<void> {
    if (!this.operations.isAlive()) return;
    const version: number = ++this.searchVersion;
    const notesMode: boolean = this.浏览模式值 === 'notes';
    const text: string = this.搜索文本;
    const filter: string = this.quickFilter;
    const sortColumn: string = this.sortColumn;
    const sortReverse: boolean = this.sortReverse;
    this.refreshingSearch = true;
    const retainedCount: number = keepRows ? this.consumedRowCount : 0;
    if (!keepRows) { this.consumedRowCount = 0; this.阶段 = 'loading'; }
    try {
      const context: common.UIAbilityContext | null = this.取能力上下文();
      if (context === null) {
        this.阶段 = 'error';
        this.错误详情 = this.getUIContext().getHostContext()!.resourceManager
          .getStringSync($r('app.string.ability_context_unavailable').id);
        return;
      }
      const result = await this.searchSession.search({ filesDir: context.filesDir, notes: notesMode,
        text: text, filter: filter, sortColumn: sortColumn, sortReverse: sortReverse },
        (): boolean => this.operations.isAlive() && version === this.searchVersion);
      if (result === null || version !== this.searchVersion) return;
      let rows: 浏览行数据[] = result.rows;
      let consumed: number = result.consumed;
      while (consumed < Math.min(retainedCount, result.ids.length)) {
        const more = await this.searchSession.more((): boolean => this.operations.isAlive() && version === this.searchVersion);
        if (more === null || version !== this.searchVersion) return;
        if (more.consumed <= consumed) break;
        rows = more.rows; consumed = more.consumed;
      }
      this.列定义 = result.columns;
      this.结果ID列表 = result.ids;
      this.行列表 = rows;
      this.consumedRowCount = consumed;
      this.阶段 = 'list';
    } catch (error) {
      if (version !== this.searchVersion) { return; }
      this.阶段 = 'error';
      this.错误详情 = error instanceof Error ? error.message : `${error}`;
    } finally { if (version === this.searchVersion) this.refreshingSearch = false; }
  }

  /**
   * 加载更多行：取下一批未加载的 ID，预加载后追加到 行列表。
   * 由 卡片表格.onReachEnd 触发；批次大小 100，并发上限由 BrowserSearchSession 管理。
   */
  private async 加载更多(): Promise<void> {
    if (this.阶段 !== 'list' || this.refreshingSearch) return;
    const version: number = this.searchVersion;
    const result = await this.searchSession.more(
      (): boolean => this.operations.isAlive() && version === this.searchVersion);
    if (result === null || version !== this.searchVersion) return;
    this.行列表 = result.rows;
    this.consumedRowCount = result.consumed;
  }

  /** 切换浏览模式（cards/notes），切换后自动重新搜索。 */
  private 切换模式(模式: 浏览模式): void {
    if (this.浏览模式值 === 模式) {
      return;
    }
    this.batchDialog = 'none';
    this.关闭卡片信息();
    this.浏览模式值 = 模式;
    if (!this.sortableColumns().some((column: BrowserColumn): boolean => column.key === this.sortColumn)) {
      this.sortColumn = '';
      this.sortReverse = false;
    }
    this.退出多选();
    this.执行搜索();
  }

  /** 提交搜索（搜索框 onSubmit 触发）。 */
  private 提交搜索(文本: string): void {
    this.搜索文本 = 文本;
    this.执行搜索();
  }

  // 来源只传身份，独立编辑页负责读取、重试与保存。
  private async 行点击(行ID: number): Promise<void> {
    this.openEditPage(行ID, this.浏览模式值 === 'notes');
  }

  private openEditPage(id: number, isNote: boolean): void {
    if (!this.operations.isAlive() || this.mutationBusy || this.editingPageOpen) return;
    this.editingPageOpen = true;
    this.editingChangedTick = AppStorage.get<number>('cardContentChangedTick') ?? 0;
    const params: EditNotePageParams = { targetId: id, isNote: isNote };
    this.pathStack.pushPath({ name: 'EditNotePage', param: params });
  }

  private returnFromEditor(): void {
    if (!this.editingPageOpen) return;
    this.editingPageOpen = false;
    if ((AppStorage.get<number>('cardContentChangedTick') ?? 0) === this.editingChangedTick) return;
    this.预览刷新版本 += 1;
    this.执行搜索(true);
  }

  // T5 行点击路由
  // - Cards 模式单击行不直接进编辑区，先弹预览让用户看正反面
  // - Notes 模式无卡片预览概念，维持原行为直接进编辑区
  private 行点击处理(行ID: number): void {
    if (this.浏览模式值 === 'cards') {
      this.打开预览(行ID);
    } else {
      this.行点击(行ID);
    }
  }

  // T5 打开预览
  // - 索引未命中（行ID 不在 结果ID列表）时静默返回（不应发生，兜底）
  // - 媒体目录从 abilityContext.filesDir 拼接（与 学习页 同语义）
  private 打开预览(行ID: number): void {
    const 索引: number = this.结果ID列表.indexOf(行ID);
    if (索引 < 0) {
      console.info(`BrowserPage: 打开预览失败 行ID=${行ID} 不在结果列表`);
      return;
    }
    const 上下文: common.UIAbilityContext | null = this.取能力上下文();
    if (上下文 === null) {
      return;
    }
    this.previewCardIds = this.结果ID列表.slice();
    this.预览初始索引 = 索引;
    this.预览媒体目录 = `${上下文.filesDir}/collection.media`;
    this.显示预览 = true;
  }

  /** T5 预览页「编辑字段」回调：保留预览并在其上方打开编辑区（Cards 模式下 行ID 即 cardId）。 */
  private 打开编辑区For(卡片ID: number): void {
    this.openEditPage(卡片ID, false);
  }

  // T8 批量操作
  // - 选中ID列表在 cards 模式下是 cardId，notes 模式下是 noteId
  // - 删除：cards 模式直接 删除卡片(选中ID)；notes 模式需先查每条笔记的所有卡片再删（级联）
  // - 挂起：仅 cards 模式有意义（notes 模式无卡片ID），调 批量埋藏或暂停卡片(SUSPEND)
  // - 改牌组/设置标志：cards 模式直接用；notes 模式需先查笔记的所有卡片再操作

  /** 扁平化牌组树为列表（改牌组选择器渲染用，跳过根节点 deckId=0）。 */

  /** 扁平化牌组树为列表的无参包装（弹层 ForEach 直接调用）。 */

  /** 标志文案：0=无/1=红/2=橙/3=绿/4=蓝。 */

  /** 标志色块颜色：0=无（透明）/1=红/2=橙/3=绿/4=蓝。色值与 Anki 桌面端 flag 色对齐。 */

  /** 打开改牌组弹层：先加载牌组树再显示。 */
  private async 打开改牌组弹层(): Promise<void> {
    if (this.operations.isBusy() || this.批量忙碌 || this.选中ID列表.length === 0) {
      return;
    }
    const selection: BrowserOperationContext = this.captureBrowserSelection();
    this.批量忙碌 = true;
    this.批量错误 = '';
    try {
      const tree: DeckTreeNode = await this.牌组服务实例.获取牌组树();
      if (!this.isBrowserSelectionCurrent(selection)) return;
      this.牌组树 = tree;
      this.batchDialog = 'deck';
    } catch (错误) {
      if (!this.isBrowserSelectionCurrent(selection)) return;
      this.批量错误 = this.取本地化文案($r('app.string.browser_action_deck_load_error'));
      console.info(`BrowserPage: 加载牌组树失败 错误=${错误}`);
    } finally {
      if (this.operations.isAlive()) this.批量忙碌 = false;
    }
  }



  private isBrowserSelectionCurrent(selection: BrowserOperationContext): boolean {
    return this.operations.isAlive() && selection.mode === this.浏览模式值 &&
      selection.viewVersion === this.searchVersion && selection.selectionVersion === this.selectionVersion &&
      selection.ids.length === this.选中ID列表.length &&
      selection.ids.every((id: number, index: number): boolean => id === this.选中ID列表[index]);
  }

  private captureBrowserSelection(): BrowserOperationContext {
    return { mode: this.浏览模式值, ids: this.选中ID列表.slice(),
      viewVersion: this.searchVersion, selectionVersion: this.selectionVersion };
  }

  /** 写入占用一直保持到刷新结束；退出页面后只广播数据变化，不回写旧组件。 */
  private async runBrowserOperation(action: (selection: BrowserOperationContext) => Promise<void>,
    onFailure: (error: Error) => void, clearSelection: boolean): Promise<boolean> {
    const selection: BrowserOperationContext | null = this.operations.begin(
      this.浏览模式值, this.选中ID列表, this.searchVersion, this.selectionVersion);
    if (selection === null) return false;
    this.mutationBusy = true;
    try {
      return await this.operations.execute(selection, action, {
        afterCommit: async (): Promise<void> => {
          if (clearSelection && this.operations.isCurrent(selection, this.浏览模式值, this.选中ID列表,
            this.searchVersion, this.selectionVersion)) this.退出多选();
          await this.执行搜索();
        },
        changed: (): void => { AppStorage.setOrCreate<number>('需要刷新主页', Date.now()); },
        failed: onFailure,
        refreshFailed: (error: Error): void => { this.阶段 = 'error'; this.错误详情 = error.message; }
      }, autoSyncScheduler);
    } finally {
      if (this.operations.isAlive()) this.mutationBusy = false;
    }
  }

  private async runBatchOperation(action: (selection: BrowserOperationContext) => Promise<void>,
    errorResource: Resource): Promise<void> {
    if (this.operations.isBusy() || this.选中ID列表.length === 0) return;
    const initial: BrowserOperationContext = this.captureBrowserSelection();
    this.批量忙碌 = true;
    this.批量错误 = '';
    try {
      await this.runBrowserOperation(action, (error: Error): void => {
        if (this.isBrowserSelectionCurrent(initial)) this.批量错误 = this.取本地化文案(errorResource);
        console.info(`BrowserPage: batch failed: ${error.message}`);
      }, true);
    } finally {
      if (this.operations.isAlive()) this.批量忙碌 = false;
    }
  }

  /** 执行批量改牌组：cards 模式直接用选中ID，notes 模式先查每条笔记的所有卡片。 */
  private async 执行批量改牌组(牌组ID: number): Promise<void> {
    this.batchDialog = 'none';
    await this.runBatchOperation(async (selection: BrowserOperationContext): Promise<void> => {
      const 卡片IDs: number[] = await this.解析选中为卡片ID(selection);
      if (卡片IDs.length > 0) await this.卡片服务实例.设置牌组(卡片IDs, 牌组ID);
    }, $r('app.string.browser_action_deck_error'));
  }

  /** 批量设置七色旗标或清除；笔记模式展开全部兄弟卡。 */
  private async 执行批量设置标志(标志: number): Promise<void> {
    this.batchDialog = 'none';
    await this.runBatchOperation(async (selection: BrowserOperationContext): Promise<void> => {
      const 卡片IDs: number[] = await this.解析选中为卡片ID(selection);
      await setCardFlags(this.markingBackend, 卡片IDs, 标志);
    }, $r('app.string.browser_action_flag_error'));
  }

  /** AnkiDroid 切换规则读取全部所选卡片，混合选择统一暂停。 */
  private async 执行批量挂起(): Promise<void> {
    await this.runBatchOperation(async (selection: BrowserOperationContext): Promise<void> => {
      const ids: number[] = await this.解析选中为卡片ID(selection);
      await toggleBrowserCardState(this.cardStateBackend(), ids, 'suspend');
    }, $r('app.string.browser_action_suspend_error'));
  }

  /** 全部已今日跳过才解除；混合选择统一今日跳过，Core 不会解除暂停卡。 */
  private async 执行批量搁置(): Promise<void> {
    await this.runBatchOperation(async (selection: BrowserOperationContext): Promise<void> => {
      const ids: number[] = await this.解析选中为卡片ID(selection);
      await toggleBrowserCardState(this.cardStateBackend(), ids, 'bury');
    }, $r('app.string.browser_action_bury_error'));
  }

  private async refreshAfterHistory(): Promise<void> {
    if (!this.operations.isAlive()) return;
    this.退出多选(); this.显示预览 = false; this.显示卡片信息 = false;
    this.牌组树 = null; this.标签树 = null;
    await this.执行搜索();
    if (!this.operations.isAlive()) return;
    const version: number = this.searchVersion;
    const decks: DeckTreeNode = await this.牌组服务实例.获取牌组树();
    const tags: TagTreeNode = await this.标签服务实例.标签树();
    if (!this.operations.isAlive() || version !== this.searchVersion) return;
    this.牌组树 = decks; this.标签树 = tags;
    await this.loadFlagLabels();
    if (this.阶段 === 'error') throw new Error('Browser refresh failed');
  }

  private async resetCards(options: ScheduleCardsAsNewOptions): Promise<void> {
    const selection: BrowserOperationContext | null = this.resetSelection;
    if (selection === null || !this.isBrowserSelectionCurrent(selection) || this.operations.isBusy()) return;
    this.batchDialog = 'none';
    const frozen: ScheduleCardsAsNewOptions = { restorePosition: options.restorePosition, resetCounts: options.resetCounts };
    await this.runBatchOperation(async (context: BrowserOperationContext): Promise<void> => {
      const ids: number[] = await this.解析选中为卡片ID(context);
      await this.调度器服务实例.scheduleCardsAsNew(ids, frozen);
    }, $r('app.string.browser_reset_error'));
  }

  private cardStateBackend(): BrowserCardStateBackend {
    return {
      queue: async (id: number): Promise<number> => (await this.卡片服务实例.获取卡片(id)).queue,
      buryOrSuspend: (ids: number[], mode: number): Promise<void> => this.调度器服务实例.批量埋藏或暂停卡片(ids, mode),
      restore: (ids: number[]): Promise<void> => this.调度器服务实例.恢复埋藏与暂停的卡片(ids)
    };
  }

  /** 将所选笔记展开为全部兄弟卡 ID，并去重供批量操作使用。 */
  private async 解析选中笔记的卡片ID(selection: BrowserOperationContext = this.captureBrowserSelection()): Promise<number[]> {
    return resolveBrowserCardIds(selection,
      (noteId: number): Promise<number[]> => this.笔记服务实例.获取笔记的卡片(noteId));
  }

  /**
   * 打开设置到期日弹层：清空输入并显示。仅 cards 模式可用（notes 模式无 cardId）。
   * 校验在 执行批量设置到期日 里完成（空输入 → 错误提示）。
   */
  private 打开设置到期日弹层(): void {
    if (this.浏览模式值 !== 'cards') {
      this.批量错误 = this.取本地化文案($r('app.string.browser_action_notes_mode_hint'));
      return;
    }
    this.批量错误 = '';
    this.batchDialog = 'due';
  }

  /** 执行批量设置到期日：days 字符串格式与 Anki 桌面端一致（"0"/"5"/"1-3"）。 */
  private async 执行批量设置到期日(value: string): Promise<void> {
    const days: string = value.trim();
    if (days === '') return;
    this.batchDialog = 'none';
    await this.runBatchOperation(async (selection: BrowserOperationContext): Promise<void> => {
      const ids: number[] = await this.解析选中为卡片ID(selection);
      if (ids.length > 0) await this.调度器服务实例.设置到期日(ids, days);
    }, $r('app.string.browser_action_set_due_error'));
  }

  /**
   * 打开重新定位弹层；默认值由弹层加载。仅 cards 模式可用。
   * Anki collection 配置中保存了用户上次使用的 random/shift 状态，用作弹层初始值。
   */
  private 打开重新定位弹层(): void {
    if (this.operations.isBusy() || this.批量忙碌) return;
    if (this.浏览模式值 !== 'cards') {
      this.批量错误 = this.取本地化文案($r('app.string.browser_action_notes_mode_hint'));
      return;
    }
    this.批量错误 = '';
    this.batchDialog = 'reposition';
  }

  /** 执行批量重新定位：调 排序卡片(选中ID, 起始, 步长, 随机, 顺移)。 */
  private async 执行批量重新定位(input: BrowserRepositionInput): Promise<void> {
    const start: number = input.start;
    const step: number = input.step;
    const random: boolean = input.random;
    const shift: boolean = input.shift;
    this.batchDialog = 'none';
    await this.runBatchOperation(async (selection: BrowserOperationContext): Promise<void> => {
      const ids: number[] = await this.解析选中为卡片ID(selection);
      if (ids.length > 0) await this.调度器服务实例.排序卡片(ids, start, step, random, shift);
    }, $r('app.string.browser_action_reposition_error'));
  }

  /** 映射读取和编辑由弹层会话持有，页面只接收提交快照。 */
  private 打开更改笔记类型弹层(): void {
    if (this.operations.isBusy() || this.选中ID列表.length === 0) return;
    this.批量错误 = '';
    this.batchDialog = 'notetype';
  }

  private async 执行批量更改笔记类型(input: 变更笔记类型请求): Promise<void> {
    if (this.operations.isBusy()) return;
    this.batchDialog = 'none';
    await this.runBatchOperation(async (selection: BrowserOperationContext): Promise<void> => {
      input.noteIds = await this.解析选中为笔记ID(selection);
      if (input.noteIds.length > 0) await this.笔记类型服务实例.变更笔记类型(input);
    }, $r('app.string.browser_action_change_notetype_error'));
  }

  /** 执行批量删除：cards 模式直接 删除卡片(选中ID)；notes 模式先查每条笔记的所有卡片再删。 */
  private async 执行批量删除(): Promise<void> {
    this.batchDialog = 'none';
    await this.runBatchOperation(async (selection: BrowserOperationContext): Promise<void> => {
      const 卡片IDs: number[] = await this.解析选中为卡片ID(selection);
      if (卡片IDs.length > 0) await this.卡片服务实例.删除卡片(卡片IDs);
    }, $r('app.string.browser_action_delete_error'));
  }

  /**
   * 解析选中ID为卡片ID：cards 模式直接返回，notes 模式需查每条笔记的所有卡片。
   * notes 模式下一条笔记可能有多张卡片，全部删除/改牌组/设标志。
   * 暂停/恢复有独立的 Anki Core 语义，不经此方法。
   */
  private async 解析选中为卡片ID(selection: BrowserOperationContext = this.captureBrowserSelection()): Promise<number[]> {
    return resolveBrowserCardIds(selection,
      (noteId: number): Promise<number[]> => this.笔记服务实例.获取笔记的卡片(noteId));
  }

  /** 退出多选模式：清空选中 + 多选模式值 + 翻转信号触发 卡片表格 清内部状态。 */
  private 退出多选(): void {
    this.showBatchMenu = false;
    this.selectionVersion++;
    this.选中ID列表 = [];
    this.多选模式值 = false;
    this.pageSelectForAgentEdit = false;
  }

  /** 打开卡片信息弹层：调 统计服务.获取卡片统计 懒加载该卡的 CardStatsView。 */
  private 打开卡片信息(卡片ID: number): void {
    if (!this.operations.isAlive()) return;
    this.infoCardId = 卡片ID;
    this.显示卡片信息 = true;
  }

  /** 关闭卡片信息弹层。 */
  private 关闭卡片信息(): void {
    this.显示卡片信息 = false;
    this.infoCardId = 0;
  }

  /**
   * T9 执行查找替换：调 搜索服务.查找并替换。
   * nids 解析：
   * - 仅选中=true：cards 模式经 卡片服务.获取卡片 把 cardId 转 noteId 后去重；notes 模式直接用选中ID
   * - 仅选中=false：固定当前完整搜索结果，包含筛选及尚未加载的分页行
   * 空结果必须中止：Core 将空 nids 解释为全库。
   * 成功后关闭弹层 + toast 提示替换数 + 重新搜索刷新列表。
   */
  private async 执行查找替换(
    查找: string, 替换: string, 字段名: string, 正则: boolean, 区分大小写: boolean, 仅选中: boolean
  ): Promise<boolean> {
    if (this.operations.isBusy()) return false;
    if (this.阶段 !== 'list') {
      this.查找替换错误 = this.取本地化文案($r('app.string.browser_find_results_not_ready'));
      return false;
    }
    const scope: BrowserOperationContext = this.captureBrowserSelection();
    if (!仅选中) scope.ids = this.结果ID列表.slice();
    this.查找替换忙碌 = true;
    this.查找替换错误 = '';
    let count: number = 0;
    const done: boolean = await this.runBrowserOperation(async (_selection: BrowserOperationContext): Promise<void> => {
      const nids: number[] = await this.解析选中为笔记ID(scope);
      if (nids.length === 0) throw new Error(this.取本地化文案($r('app.string.browser_find_no_notes_error')));
      const request: FindAndReplaceRequest = {
        nids, search: 查找, replacement: 替换, regex: 正则, matchCase: 区分大小写, fieldName: 字段名
      };
      count = await this.搜索服务实例.查找并替换(request);
      if (this.operations.isAlive()) this.显示查找替换 = false;
    }, (_error: Error): void => {
      this.查找替换错误 = this.取本地化文案($r('app.string.browser_find_error'));
    }, false);
    if (this.operations.isAlive()) {
      this.查找替换忙碌 = false;
      if (done) showToastSafely(this.getUIContext(), {
        message: this.取本地化文案($r('app.string.browser_find_success')).replace('%d', String(count))
      });
    }
    return done;
  }

  /**
   * 解析选中ID为笔记ID：notes 模式直接返回，cards 模式逐个调 卡片服务.获取卡片 取 noteId 后去重。
   * 供 T9 查找替换"仅选中笔记"范围使用。
   */
  private async 解析选中为笔记ID(selection: BrowserOperationContext = this.captureBrowserSelection()): Promise<number[]> {
    return resolveBrowserNoteIds(selection, async (cardId: number): Promise<number> => {
      const card: Card = await this.卡片服务实例.获取卡片(cardId);
      return card.noteId;
    });
  }

  // T6 侧边栏
  // - 牌组树复用 this.牌组树（T8 已加载），首次打开侧边栏时若为 null 再加载一次
  // - 标签树 + 已保存搜索 + 折叠状态在打开侧边栏时一次性加载（失败不阻塞，分区显示空提示）
  // - 已保存搜索 JSON 格式：[{ name, search }, ...]，空串或非数组视为无已保存搜索

  /** 打开侧边栏：并行加载牌组树（若 null）+ 标签树 + 已保存搜索 + 分区折叠状态。失败收集到错误条。 */
  private async 打开侧边栏(): Promise<void> {
    if (!this.operations.isAlive()) return;
    const version: number = ++this.sidebarVersion;
    this.显示侧边栏 = true;
    this.侧边栏忙碌 = true;
    this.侧边栏错误 = '';
    const snapshot = await loadBrowserSidebar(this.sidebarBackend, this.牌组树);
    if (!this.operations.isAlive() || version !== this.sidebarVersion || !this.显示侧边栏) return;
    this.牌组树 = snapshot.decks;
    this.标签树 = snapshot.tags;
    this.已保存搜索列表 = snapshot.saved;
    this.侧边栏牌组折叠 = snapshot.collapsed[0];
    this.侧边栏标签折叠 = snapshot.collapsed[1];
    this.侧边栏已保存搜索折叠 = snapshot.collapsed[2];
    if (snapshot.errors.length > 0) {
      this.侧边栏错误 = `${this.取本地化文案($r('app.string.browser_sidebar_load_error'))}：${snapshot.errors.join('、')}`;
    }
    this.侧边栏忙碌 = false;
  }

  /** 切换分区折叠状态并持久化（undoable=false 不进撤销栈，与 Anki 桌面端一致）。 */
  private async 切换侧边栏折叠(分区: 'decks' | 'tags' | 'saved_searches'): Promise<void> {
    let key: ConfigKeyBool;
    let 新值: boolean;
    if (分区 === 'decks') {
      key = ConfigKeyBool.COLLAPSE_DECKS;
      新值 = !this.侧边栏牌组折叠;
      this.侧边栏牌组折叠 = 新值;
    } else if (分区 === 'tags') {
      key = ConfigKeyBool.COLLAPSE_TAGS;
      新值 = !this.侧边栏标签折叠;
      this.侧边栏标签折叠 = 新值;
    } else {
      key = ConfigKeyBool.COLLAPSE_SAVED_SEARCHES;
      新值 = !this.侧边栏已保存搜索折叠;
      this.侧边栏已保存搜索折叠 = 新值;
    }
    try {
      await this.配置服务实例.设置配置布尔({ key, value: 新值, undoable: false });
    } catch (错误) {
      console.info(`BrowserPage: 持久化折叠状态失败 分区=${分区} 错误=${错误}`);
    }
  }

  /** 侧边栏点牌组 → 替换搜索为 deck:"xxx"。 */
  private 选牌组节点(牌组名: string): void {
    this.搜索文本 = `deck:"${牌组名}"`;
    this.显示侧边栏 = false;
    this.执行搜索();
  }

  /** 侧边栏点标签 → 替换搜索为 tag:"xxx"。 */
  private 选标签节点(标签名: string): void {
    this.应用标签搜索(标签名, false);
  }

  /** 侧边栏点已保存搜索 → 替换搜索文本为已保存的搜索串。 */
  private 选已保存搜索(搜索串: string): void {
    this.搜索文本 = 搜索串;
    this.quickFilter = 'all';
    this.显示侧边栏 = false;
    this.执行搜索();
  }

  private 当前保存搜索串(): string {
    const filter: BrowserQuickFilter | undefined = BROWSER_QUICK_FILTERS.find((item: BrowserQuickFilter): boolean => item.id === this.quickFilter);
    const extra: string = filter === undefined ? '' : filter.query;
    const base: string = this.搜索文本.trim();
    return base === '' ? extra : extra === '' ? base : `${base} ${extra}`;
  }

  private 打开保存搜索(编辑项: BrowserSavedSearch | null): void {
    if (this.阶段 !== 'list' || this.operations.isBusy()) return;
    this.保存搜索编辑项 = 编辑项 === null ? null : { name: 编辑项.name, search: 编辑项.search };
    this.保存搜索初始查询 = 编辑项 === null ? this.当前保存搜索串() : 编辑项.search;
    this.保存搜索错误 = '';
    this.显示保存搜索 = true;
  }

  private async 提交保存搜索(name: string): Promise<void> {
    if (this.保存搜索忙碌 || !this.显示保存搜索) return;
    const original: BrowserSavedSearch | null = this.保存搜索编辑项;
    const query: string = this.保存搜索初始查询;
    this.保存搜索忙碌 = true;
    this.保存搜索错误 = '';
    try {
      const current: BrowserSavedSearch[] = parseBrowserSavedSearches(await this.sidebarBackend.savedSearches());
      const result = original === null ? upsertBrowserSavedSearch(current, name, query) :
        upsertBrowserSavedSearch(current, name, query, original.name);
      if (!result.ok) {
        if (result.reason === 'duplicate_name') this.保存搜索错误 = this.取本地化文案($r('app.string.browser_saved_search_duplicate'));
        else if (result.reason === 'missing') this.保存搜索错误 = this.取本地化文案($r('app.string.browser_saved_search_missing'));
        else this.保存搜索错误 = this.取本地化文案($r('app.string.browser_saved_search_empty'));
        return;
      }
      await this.sidebarBackend.saveSavedSearches(serializeBrowserSavedSearches(result.items));
      if (!this.operations.isAlive()) return;
      this.已保存搜索列表 = result.items;
      this.显示保存搜索 = false;
      showToastSafely(this.getUIContext(), { message: this.取本地化文案($r('app.string.done')) });
    } catch (error) {
      this.保存搜索错误 = this.取本地化文案($r('app.string.browser_saved_search_save_error'));
    } finally {
      this.保存搜索忙碌 = false;
    }
  }

  private 请求删除保存搜索(item: BrowserSavedSearch): void {
    this.getUIContext().showAlertDialog({
      title: $r('app.string.browser_saved_search_delete'),
      message: item.name,
      autoCancel: true,
      primaryButton: { value: $r('app.string.cancel'), action: (): void => {} },
      secondaryButton: { value: $r('app.string.browser_saved_search_delete'), fontColor: $r('app.color.error_text'),
        action: (): void => { this.删除保存搜索(item); } }
    });
  }

  private async 删除保存搜索(item: BrowserSavedSearch): Promise<void> {
    if (this.保存搜索忙碌 || this.operations.isBusy()) return;
    this.保存搜索忙碌 = true;
    try {
      const current: BrowserSavedSearch[] = parseBrowserSavedSearches(await this.sidebarBackend.savedSearches());
      const result = removeBrowserSavedSearch(current, item.name);
      if (!result.ok) { this.侧边栏错误 = this.取本地化文案($r('app.string.browser_saved_search_missing')); return; }
      await this.sidebarBackend.saveSavedSearches(serializeBrowserSavedSearches(result.items));
      if (this.operations.isAlive()) this.已保存搜索列表 = result.items;
    } catch (error) {
      this.侧边栏错误 = this.取本地化文案($r('app.string.browser_saved_search_save_error'));
    } finally { this.保存搜索忙碌 = false; }
  }

  /** 侧边栏长按牌组 → 追加 AND deck:"xxx" 到搜索文本。 */
  private 追加牌组条件(牌组名: string): void {
    const 条件: string = `deck:"${牌组名}"`;
    this.搜索文本 = this.搜索文本 === '' ? 条件 : `${this.搜索文本} ${条件}`;
    this.显示侧边栏 = false;
    this.执行搜索();
  }

  /** 侧边栏长按标签 → 追加 AND tag:"xxx" 到搜索文本。 */
  private 追加标签条件(标签名: string): void {
    this.应用标签搜索(标签名, true);
  }

  private async 应用标签搜索(name: string, append: boolean): Promise<void> {
    const original: string = this.搜索文本;
    const version: number = ++this.sidebarVersion;
    try {
      const query: string = await this.搜索服务实例.构建搜索串(tagSearchNode(name, append ? original : ''));
      if (!this.operations.isAlive() || !this.显示侧边栏 || version !== this.sidebarVersion || original !== this.搜索文本) return;
      this.搜索文本 = query; this.显示侧边栏 = false; this.执行搜索();
    } catch (error) {
      if (this.operations.isAlive() && version === this.sidebarVersion) {
        this.侧边栏错误 = this.取本地化文案($r('app.string.tags_search_error'));
      }
    }
  }

  private async 打开批量标签(): Promise<void> {
    if (this.operations.isBusy() || this.批量忙碌 || this.选中ID列表.length === 0) return;
    const selection: BrowserOperationContext = this.captureBrowserSelection();
    this.批量忙碌 = true; this.批量错误 = '';
    try {
      await syncActivity.waitForCollection();
      const ids: number[] = await this.解析选中为笔记ID(selection);
      const tags: string[][] = [];
      for (const id of new Set<number>(ids)) tags.push((await this.笔记服务实例.获取笔记(id)).tags.slice());
      if (!this.isBrowserSelectionCurrent(selection)) return;
      this.batchTagSelection = selection; this.batchNoteTags = tags; this.batchDialog = 'tags';
    } catch (error) {
      if (this.isBrowserSelectionCurrent(selection)) this.批量错误 = this.取本地化文案($r('app.string.tags_load_error'));
    } finally {
      if (this.operations.isAlive()) this.批量忙碌 = false;
    }
  }

  private async 提交批量标签(changes: TagSelectionChange[]): Promise<void> {
    const selection: BrowserOperationContext | null = this.batchTagSelection;
    if (this.operations.isBusy() || selection === null || !this.isBrowserSelectionCurrent(selection) || changes.length === 0) return;
    const snapshot: TagSelectionChange[] = changes.map((change: TagSelectionChange): TagSelectionChange =>
      ({ name: change.name, selected: change.selected }));
    this.批量忙碌 = true; this.批量错误 = '';
    try {
      await this.runBrowserOperation(async (context: BrowserOperationContext): Promise<void> => {
        const ids: number[] = await this.解析选中为笔记ID(context);
        await updateSelectedNoteTags(ids, snapshot,
          (id: number): Promise<EditableNote> => this.笔记服务实例.获取笔记(id),
          async (notes: EditableNote[]): Promise<void> => { await this.笔记服务实例.更新笔记(notes, false); });
        if (this.isBrowserSelectionCurrent(selection) && this.batchDialog === 'tags') this.batchDialog = 'none';
      }, (_error: Error): void => {
        if (this.isBrowserSelectionCurrent(selection)) this.批量错误 = this.取本地化文案($r('app.string.tags_save_error'));
      }, true);
    } finally { if (this.operations.isAlive()) this.批量忙碌 = false; }
  }

  private async 切换标签折叠(name: string): Promise<void> {
    if (this.operations.isBusy() || this.标签树 === null) return;
    const version: number = this.sidebarVersion;
    const row = flattenTagTree(this.标签树).find((item: TagRow): boolean => item.fullName === name);
    if (row === undefined || !row.hasChildren) return;
    await this.runBrowserOperation(async (): Promise<void> => {
      await this.标签服务实例.设置标签折叠({ name, collapsed: !row.collapsed });
    }, (_error: Error): void => {
      this.侧边栏错误 = this.取本地化文案($r('app.string.tags_collapse_error'));
    }, false);
    await this.刷新侧栏标签(version);
  }

  private async 刷新侧栏标签(version: number): Promise<void> {
    if (!this.operations.isAlive() || !this.显示侧边栏 || version !== this.sidebarVersion) return;
    try {
      const tree: TagTreeNode = await this.标签服务实例.标签树();
      if (this.operations.isAlive() && this.显示侧边栏 && version === this.sidebarVersion) this.标签树 = tree;
    } catch (error) {
      if (this.operations.isAlive() && version === this.sidebarVersion) this.侧边栏错误 = this.取本地化文案($r('app.string.tags_load_error'));
    }
  }

  private 请求清除未用标签(): void {
    if (this.operations.isBusy()) return;
    this.getUIContext().showAlertDialog({ title: this.取本地化文案($r('app.string.settings_clear_unused_tags')),
      message: this.取本地化文案($r('app.string.settings_clear_unused_tags_confirm')),
      primaryButton: { value: $r('app.string.cancel'), action: (): void => {} },
      secondaryButton: { value: $r('app.string.browser_detail_confirm'), action: (): void => { this.清除侧栏未用标签(); } } });
  }

  private async 清除侧栏未用标签(): Promise<void> {
    const version: number = this.sidebarVersion;
    let count: number = 0;
    const done: boolean = await this.runBrowserOperation(async (): Promise<void> => {
      count = await this.标签服务实例.清除未用标签();
    }, (_error: Error): void => {
      this.侧边栏错误 = this.取本地化文案($r('app.string.settings_clear_unused_tags_error'));
    }, false);
    if (!this.operations.isAlive()) return;
    if (done) showToastSafely(this.getUIContext(), { message:
      this.取本地化文案($r('app.string.settings_clear_unused_tags_success')).replace('%d', String(count)) });
    await this.刷新侧栏标签(version);
  }

  // T6 标签管理
  // - 重命名：currentPrefix=原标签名，newPrefix=用户输入
  // - 删除：按前缀删除标签及子标签，返回受影响笔记数
  // - 选择/新建由公共 TagPicker 回写草稿，管理操作仍由统一写入边界提交
  // - 操作成功后刷新标签树，失败在标签重命名错误条或 toast 显示

  /** 标签菜单「重命名」→ 打开重命名对话框。 */
  private 请求重命名标签(标签名: string): void {
    if (this.operations.isBusy()) return;
    this.重命名原标签名 = 标签名;
    this.标签重命名错误 = '';
    this.标签重命名忙碌 = false;
    this.显示标签重命名 = true;
  }

  /** 执行重命名标签：调后端 RenameTags，成功后刷新标签树。 */
  private async 执行重命名标签(name: string): Promise<void> {
    if (this.operations.isBusy()) return;
    const sidebarVersion: number = this.sidebarVersion;
    const original: string = this.重命名原标签名;
    name = newTagName(name);
    if (name === '' || name === original) {
      this.标签重命名错误 = this.取本地化文案($r('app.string.browser_tag_rename_empty'));
      return;
    }
    this.标签重命名忙碌 = true;
    this.标签重命名错误 = '';
    let count: number = 0;
    const done: boolean = await this.runBrowserOperation(async (_selection: BrowserOperationContext): Promise<void> => {
      count = await this.标签服务实例.重命名标签({ currentPrefix: original, newPrefix: name });
      if (this.operations.isAlive()) {
        this.显示标签重命名 = false;
      }
    }, (_error: Error): void => {
      this.标签重命名错误 = this.取本地化文案($r('app.string.browser_tag_rename_error'));
    }, false);
    if (!this.operations.isAlive()) return;
    this.标签重命名忙碌 = false;
    if (done) showToastSafely(this.getUIContext(), {
      message: this.取本地化文案($r('app.string.browser_tag_rename_success')).replace('%d', String(count))
    });
    if (done) await this.刷新侧栏标签(sidebarVersion);
  }

  /** 标签菜单「删除」→ 弹 AlertDialog 二次确认。 */
  private 请求删除标签(标签名: string): void {
    if (this.operations.isBusy() || !this.operations.isAlive()) return;
    const message: string = this.取本地化文案($r('app.string.browser_tag_delete_confirm'))
      .replace('%s', 标签名);
    this.getUIContext().showAlertDialog({
      title: this.取本地化文案($r('app.string.browser_tag_delete')),
      message: message,
      autoCancel: true,
      alignment: DialogAlignment.Center,
      primaryButton: {
        value: $r('app.string.cancel'),
        action: (): void => {}
      },
      secondaryButton: {
        value: $r('app.string.browser_tag_delete'),
        fontColor: $r('app.color.error_text'),
        action: (): void => { this.执行删除标签(标签名); }
      }
    });
  }

  /** 执行删除标签：调后端 RemoveTags，成功后刷新标签树。 */
  private async 执行删除标签(标签名: string): Promise<void> {
    if (this.operations.isBusy()) return;
    const sidebarVersion: number = this.sidebarVersion;
    this.标签操作忙碌 = true;
    let count: number = 0;
    const done: boolean = await this.runBrowserOperation(async (_selection: BrowserOperationContext): Promise<void> => {
      count = await this.标签服务实例.移除标签(标签名);
    }, (_error: Error): void => {
      showToastSafely(this.getUIContext(), {
        message: this.取本地化文案($r('app.string.browser_tag_delete_error'))
      });
    }, false);
    if (!this.operations.isAlive()) return;
    this.标签操作忙碌 = false;
    if (done) showToastSafely(this.getUIContext(), {
      message: this.取本地化文案($r('app.string.browser_tag_delete_success')).replace('%d', String(count))
    });
    if (done) await this.刷新侧栏标签(sidebarVersion);
  }

  /** 顶栏返回：多选态优先退出多选，普通浏览态才返回主页。 */
  private 返回(): void {
    if (this.多选模式值) {
      this.退出多选();
      return;
    }
    this.pathStack.pop();
  }

  /** 把当前浏览模式下的稳定 ID 交给共享 AI 改卡页；打开本身不请求模型。
   *  未配置 AI 时与首页同款跳转：直接进入设置并展开 AI 智能体分组；
   *  不退出多选，配置完成返回后可原样再点 AI 改卡。 */
  private async 打开AI改卡(): Promise<void> {
    if (this.operations.isBusy() || this.选中ID列表.length === 0) { return; }
    const selection: BrowserOperationContext = this.captureBrowserSelection();
    const configured: boolean = await this.isAIConfigured();
    if (!this.isBrowserSelectionCurrent(selection)) return;
    if (!configured) {
      this.openAISettings();
      return;
    }
    const params: AI制卡页参数 = {
      mode: 'edit', deckId: this.pageDeckId, deckName: '', deckOptions: [], templateIdx: -1,
      cardIds: selection.mode === 'cards' ? selection.ids : [],
      noteIds: selection.mode === 'cards' ? [] : selection.ids
    };
    this.退出多选();
    this.pathStack.pushPath({
      name: 'AiCardPage', param: params,
      onPop: (): void => { this.执行搜索(); }
    });
  }

  /** 预览改卡只传当前卡，不使用浏览页的批量选择。 */
  private async 打开预览AI改卡(cardId: number): Promise<void> {
    if (!this.显示预览 || this.previewCardIds[this.预览初始索引] !== cardId || this.editingPageOpen) return;
    const configured: boolean = await this.isAIConfigured();
    if (!this.显示预览 || this.previewCardIds[this.预览初始索引] !== cardId || this.editingPageOpen) return;
    this.显示预览 = false;
    const restorePreview = (): void => {
      this.预览刷新版本 += 1;
      this.显示预览 = true;
      this.执行搜索();
    };
    if (!configured) {
      const settings: 设置页参数 = { openAiSettings: true };
      this.pathStack.pushPath({ name: 'SettingsPage', param: settings, onPop: restorePreview });
      return;
    }
    const params: AI制卡页参数 = { mode: 'edit', cardIds: [cardId], noteIds: [], templateIdx: -1 };
    this.pathStack.pushPath({ name: 'AiCardPage', param: params, onPop: restorePreview });
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

  /** 未配置时从浏览页直接进入设置，并展开 AI 智能体分组。 */
  private openAISettings(): void {
    const params: 设置页参数 = { openAiSettings: true };
    this.pathStack.pushPath({ name: 'SettingsPage', param: params });
  }

  /** 多选标题随当前选择数量更新，中英沿用同一计数资源。 */
  private 取选中计数文案(): string {
    const 模板: string = this.取本地化文案($r('app.string.browser_select_count'));
    return 模板.replace('%d', `${this.选中ID列表.length}`);
  }

  /** 只提供当前卡片/笔记模式下后端支持的排序。 */
  private sortableColumns(): BrowserColumn[] {
    return this.列定义.filter((column: BrowserColumn): boolean =>
      (this.浏览模式值 === 'notes' ? column.sortingNotes : column.sortingCards) !==
        BrowserColumnSorting.SORTING_NONE);
  }

  /** 排序列名随模式切换，箭头反映后端默认方向及反转状态。 */
  private sortLabel(): string {
    const column: BrowserColumn | undefined = this.sortableColumns().find(
      (item: BrowserColumn): boolean => item.key === this.sortColumn);
    if (column === undefined) { return this.取本地化文案($r('app.string.browser_sort_default')); }
    const direction: BrowserColumnSorting = this.浏览模式值 === 'notes' ? column.sortingNotes : column.sortingCards;
    const descending: boolean = (direction === BrowserColumnSorting.SORTING_DESCENDING) !== this.sortReverse;
    return `${this.浏览模式值 === 'notes' ? column.notesModeLabel : column.cardsModeLabel} ${descending ? '↓' : '↑'}`;
  }

  /** 排序组只列选项值；默认与各列升降序同级，不夹带类别标题。 */
  private sortOptions(): SelectOption[] {
    const items: SelectOption[] = [{ value: this.取本地化文案($r('app.string.browser_sort_default')) }];
    for (const column of this.sortableColumns()) {
      const label: string = this.浏览模式值 === 'notes' ? column.notesModeLabel : column.cardsModeLabel;
      items.push({ value: `${label} ↑` });
      items.push({ value: `${label} ↓` });
    }
    return items;
  }

  private sortIndex(): number {
    const columns: BrowserColumn[] = this.sortableColumns();
    const index: number = columns.findIndex((column: BrowserColumn): boolean => column.key === this.sortColumn);
    if (index < 0) { return 0; }
    const direction: BrowserColumnSorting = this.浏览模式值 === 'notes' ? columns[index].sortingNotes : columns[index].sortingCards;
    const descending: boolean = (direction === BrowserColumnSorting.SORTING_DESCENDING) !== this.sortReverse;
    return 1 + index * 2 + (descending ? 1 : 0);
  }

  /** 把用户选择的升降序转换成 Core 列默认方向的反转标志。 */
  private selectSort(index: number): void {
    if (index === 0) {
      this.sortColumn = '';
      this.sortReverse = false;
    } else {
      const column: BrowserColumn | undefined = this.sortableColumns()[Math.floor((index - 1) / 2)];
      if (column === undefined) { return; }
      const direction: BrowserColumnSorting = this.浏览模式值 === 'notes' ? column.sortingNotes : column.sortingCards;
      this.sortColumn = column.key;
      this.sortReverse = (direction === BrowserColumnSorting.SORTING_DESCENDING) !== (index % 2 === 0);
    }
    this.执行搜索();
  }

  @Builder
  private browserMoreMenu() {
    if (this.showMoreMenu) {
      BrowserMoreMenu({ filterActive: this.搜索文本.trim() !== '' || this.quickFilter !== 'all', available: !this.mutationBusy && this.阶段 === 'list',
        subtitleIndex: this.subtitleIndex,
        topOffset: 应用尺寸.pageContentTop(this.状态栏高度, this.narrowDeckLayout),
        onClose: (): void => { this.showMoreMenu = false; },
        onHistory: (): void => {
          if (this.mutationBusy || this.operations.isBusy()) return;
          this.showMoreMenu = false; this.collectionHistoryOpen = true;
        },
        onFilter: (): void => {
          if (this.阶段 !== 'list') return;
          this.showMoreMenu = false;
          this.侧边栏错误 = '';
          this.打开侧边栏();
        },
        onFindReplace: (): void => {
          if (this.阶段 !== 'list' || this.operations.isBusy()) return;
          this.showMoreMenu = false;
          this.查找替换错误 = '';
          this.显示查找替换 = true;
        },
        onSaveSearch: (): void => { this.showMoreMenu = false; this.打开保存搜索(null); },
        onFlagNames: (): void => { this.showMoreMenu = false; this.flagNamesOpen = true; },
        onSubtitle: (index: number): void => { this.subtitleIndex = index; this.showMoreMenu = false; }
      })
    }
  }

  /** 数量使用完整 ID 结果，区分卡片与笔记。 */
  private resultCountLabel(): string {
    const resource: Resource = this.浏览模式值 === 'cards' ? $r('app.string.browser_result_cards') :
      $r('app.string.browser_result_notes');
    return this.取本地化文案(resource).replace('%d', `${this.结果ID列表.length}`);
  }

  @Builder
  private 顶部条() {
    // 多选时标题显示计数，右侧保留明确的手动操作入口。
    Stack({ alignContent: Alignment.Center }) {
      Text(this.多选模式值 ? this.取选中计数文案() : $r('app.string.browser_title'))
        .fontSize(应用尺寸.字号_标题).fontWeight(FontWeight.Medium)
        .fontColor($r('app.color.text_primary')).width('44%').textAlign(TextAlign.Center)
        .maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).hitTestBehavior(HitTestMode.None)
      Row() {
      按下态按钮({
        文案: $r('app.string.study_back'),
        字色: $r('app.color.text_primary'),
        点击回调: (): void => this.返回()
      })

      Blank()
      if (this.多选模式值) {

        按下态按钮({
          文案: $r('app.string.browser_selection_actions'),
          字色: $r('app.color.text_primary'),
          是否启用: !this.批量忙碌 && !this.mutationBusy && this.选中ID列表.length > 0,
          点击回调: (): void => { this.showBatchMenu = !this.showBatchMenu; }
        })
      } else {

        按下态按钮({
          文案: $r('app.string.study_more'),
          字色: $r('app.color.text_primary'),
          点击回调: (): void => { this.showMoreMenu = !this.showMoreMenu; }
        })
      }
      }.width('100%').height('100%').alignItems(VerticalAlign.Center)
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
    .alignContent(Alignment.Center)
  }

  /** 状态筛选保留原始搜索，由合并选择框的状态区域打开。 */
  private quickFilterOptions(_locale: string = this.uiLanguage): SelectOption[] {
    return BROWSER_QUICK_FILTERS.map((filter: BrowserQuickFilter): SelectOption => ({
      value: (filter.id.startsWith('flag_') ? customFlagLabel(this.flagLabels, Number(filter.id.substring(5))) : '') ||
        namedResourceText(this.getUIContext(), filter.labelKey)
    }));
  }

  private quickFilterIndex(): number {
    return Math.max(0, BROWSER_QUICK_FILTERS.findIndex((filter: BrowserQuickFilter): boolean =>
      filter.id === this.quickFilter));
  }

  /** 单一外框中的三个选值区：只打开被点击的那一组，不套第二层分类。 */
  private openViewMenu(group: string): void {
    if (this.多选模式值 || this.阶段 !== 'list') return;
    this.showMoreMenu = false;
    this.viewMenuGroup = group;
    this.showViewMenu = true;
  }

  @Builder
  private viewChoice(label: string, group: string) {
    Button() {
      Row({ space: 4 }) {
        Text(label).fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_primary'))
          .layoutWeight(1).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
          .textAlign(TextAlign.Center)
        Polygon().width(8).height(5).points([[0, 0], [8, 0], [4, 5]])
          .fill($r('app.color.text_secondary'))
      }.width('100%').height('100%').alignItems(VerticalAlign.Center)
    }
    .id('browser-view-' + group)
    .type(ButtonType.Normal).backgroundColor(Color.Transparent)
    .height(SelectStyle.controlHeight).padding({ left: 6, right: 6 }).borderRadius(0)
    .layoutWeight(1).enabled(!this.多选模式值 && this.阶段 === 'list')
    .accessibilityText(label)
    .attributeModifier(new PressFeedback())
    .stateEffect(false)
    .onClick((): void => { this.openViewMenu(group); })
  }

  @Builder
  private browserControls() {
    Row({ space: 应用尺寸.间距_8 }) {
      Row() {
        this.viewChoice(this.浏览模式值 === 'cards' ? this.取本地化文案($r('app.string.browser_mode_cards')) :
          this.取本地化文案($r('app.string.browser_mode_notes')), 'mode')
        Divider().vertical(true).height(16).strokeWidth(0.5).color(SurfaceBorder.color())
        this.viewChoice(localizedNamedResourceText(this.getUIContext(), this.uiLanguage, BROWSER_QUICK_FILTERS[this.quickFilterIndex()].labelKey), 'filter')
        Divider().vertical(true).height(16).strokeWidth(0.5).color(SurfaceBorder.color())
        this.viewChoice(this.sortLabel(), 'sort')
      }
      .id('browser-view-selector')
      .layoutWeight(7).height(SelectStyle.controlHeight)
      .backgroundColor($r('app.color.surface_card')).borderRadius(SelectStyle.controlRadius).border(SelectStyle.controlBorder).clip(true)
      .onAreaChange((_oldArea: Area, area: Area): void => { this.viewMenuWidth = Number(area.width); })
      Text(this.阶段 === 'loading' ? $r('app.string.browser_loading') : this.resultCountLabel())
        .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary'))
        .layoutWeight(3).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).textAlign(TextAlign.End)
    }.width('100%')
      // 首张结果卡由列表的 contentStartOffset 贡献唯一的区块间距。
      .padding({ left: 应用尺寸.页面内边距_水平, right: 应用尺寸.页面内边距_水平, bottom: 0 })
  }

  @Builder
  private browserContent() {
    Column() {
      this.顶部条()

      // 搜索独占一行；合并选择框与数量放在下一行。
      搜索框({
        搜索文本: this.搜索文本,
        onSearch: (文本: string): void => { this.提交搜索(文本); }
      })
        .padding({ left: 应用尺寸.页面内边距_水平, right: 应用尺寸.页面内边距_水平,
          top: 应用尺寸.页面内容顶部间距(this.narrowDeckLayout),
          bottom: 应用尺寸.页面分组间距(this.narrowDeckLayout) })

      this.browserControls()

      if (this.阶段 === 'loading') {
        统一加载态({
          文案: $r('app.string.browser_loading')
        })
      }
      if (this.阶段 === 'error') {
        统一错误态({
          文案: this.错误详情 !== '' ? this.错误详情 : $r('app.string.browser_search_error'),
          onRetry: (): void => { this.执行搜索(); }
        })
      }
      if (this.阶段 === 'list') {
        // 卡片表格组件（扁平列表 + 多选 + 空态 + 懒加载）
        卡片表格({
          行列表: this.行列表,
          subtitleIndex: this.subtitleIndex,
          notesMode: this.浏览模式值 === 'notes',
          flagLabels: this.flagLabels,
          结果总数: this.结果ID列表.length,
          已加载行数: this.consumedRowCount,
          多选模式: this.多选模式值,
          选中IDs: this.选中ID列表,
          onRowClick: (行ID: number): void => { this.行点击处理(行ID); },
          onLongPress: (): void => {},
          onLoadMore: (): Promise<void> => this.加载更多(),
          onInfoClick: (行ID: number): void => { this.打开卡片信息(行ID); },
          onSelectionChange: (选中IDs: number[]): void => { this.showBatchMenu = false; this.batchDialog = 'none'; this.selectionVersion++; this.选中ID列表 = 选中IDs.slice(); },
          onMultiSelectChange: (多选: boolean): void => { this.多选模式值 = 多选; }
        })
      }


      // T8 批量操作错误提示（顶部告警条，不遮挡悬浮窗交互）
      if (this.批量错误 !== '') {
        Text(this.批量错误)
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.error_text'))
          .backgroundColor($r('app.color.surface_card'))
          .padding({ left: 应用尺寸.间距_16, right: 应用尺寸.间距_16,
            top: 应用尺寸.间距_8, bottom: 应用尺寸.间距_8 })
          .width('100%')
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor(this.页面底色微染值)
  }

  @Builder
  private browserInspection() {
    if (this.显示预览) {
      卡片预览页({
        isDark: this.是否深色(),
        卡片ID列表: this.previewCardIds,
        初始索引: this.预览初始索引,
        媒体目录: this.预览媒体目录,
        刷新版本: this.预览刷新版本,
        interactionEnabled: !this.editingPageOpen,
        onPositionChanged: (index: number): void => { this.预览初始索引 = index; },
        onEditWithAgent: (cardId: number): void => { this.打开预览AI改卡(cardId); },
        onBackHandlerChange: (handler: (() => boolean) | null): void => { this.previewBackHandler = handler; },
        onClose: (): void => {
          this.显示预览 = false;
        },
        onEditField: (卡片ID: number): void => {
          this.打开编辑区For(卡片ID);
        }
      })
    }

    // T11 卡片信息弹层：非多选模式下点击行右侧 info 按钮 → 懒加载 CardStatsView
    if (this.显示卡片信息) {
      卡片信息({
        isDark: this.是否深色(),
        cardId: this.infoCardId,
        onClose: (): void => {
          this.关闭卡片信息();
        }
      })
    }
  }

  @Builder
  private browserSearchPanels() {
    if (this.显示查找替换) {
      查找替换对话框({
        isDark: this.是否深色(),
        busy: this.查找替换忙碌 || this.mutationBusy,
        errorMessage: this.查找替换错误,
        有选中笔记: this.选中ID列表.length > 0,
        onCancel: (): void => {
          this.显示查找替换 = false;
          this.查找替换错误 = '';
        },
        onExecute: (
          查找: string,
          替换: string,
          字段名: string,
          正则: boolean,
          区分大小写: boolean,
          仅选中: boolean
        ): Promise<boolean> => {
          return this.执行查找替换(查找, 替换, 字段名, 正则, 区分大小写, 仅选中);
        },
        onHelp: (): void => {
          this.说明标题 = $r('app.string.browser_help_find_replace_title');
          this.说明正文 = $r('app.string.browser_help_find_replace_body');
          this.显示说明浮层 = true;
        },
        onRegexHelp: (): void => {
          this.说明标题 = $r('app.string.browser_find_regex');
          this.说明正文 = $r('app.string.browser_find_regex_help');
          this.显示说明浮层 = true;
        }
      })
    }

    // T6 侧边栏抽屉：顶部条按钮触发，含牌组/标签/已保存搜索三区
    if (this.显示侧边栏) {
      浏览侧边栏({
        isDark: this.是否深色(),
        busy: this.侧边栏忙碌,
        errorMessage: this.侧边栏错误,
        牌组树: this.牌组树,
        标签树: this.标签树,
        已保存搜索列表: this.已保存搜索列表,
        牌组折叠: this.侧边栏牌组折叠,
        标签折叠: this.侧边栏标签折叠,
        已保存搜索折叠: this.侧边栏已保存搜索折叠,
        onClose: (): void => {
          this.显示侧边栏 = false;
        },
        onSelectDeck: (牌组名: string): void => { this.选牌组节点(牌组名); },
        onSelectTag: (标签名: string): void => { this.选标签节点(标签名); },
        onSelectSavedSearch: (搜索串: string): void => { this.选已保存搜索(搜索串); },
        onRenameSavedSearch: (项: 已保存搜索项): void => { this.打开保存搜索(项); },
        onDeleteSavedSearch: (项: 已保存搜索项): void => { this.请求删除保存搜索(项); },
        onAppendDeck: (牌组名: string): void => { this.追加牌组条件(牌组名); },
        onAppendTag: (标签名: string): void => { this.追加标签条件(标签名); },
        onRenameTag: (标签名: string): void => { this.请求重命名标签(标签名); },
        onDeleteTag: (标签名: string): void => { this.请求删除标签(标签名); },
        tagWriteBusy: this.mutationBusy,
        onToggleTag: (name: string): void => { this.切换标签折叠(name); },
        onClearUnusedTags: (): void => { this.请求清除未用标签(); },
        onToggle折叠: (分区: 'decks' | 'tags' | 'saved_searches'): void => {
          this.切换侧边栏折叠(分区);
        }
      })
    }
    if (this.显示保存搜索) {
      BrowserSavedSearchDialog({ isDark: this.是否深色(), busy: this.保存搜索忙碌,
        editing: this.保存搜索编辑项 !== null, initialName: this.保存搜索编辑项 === null ? '' : this.保存搜索编辑项.name,
        initialSearch: this.保存搜索初始查询, error: this.保存搜索错误,
        onClose: (): void => { if (!this.保存搜索忙碌) this.显示保存搜索 = false; },
        onSubmit: (name: string): void => { this.提交保存搜索(name); } })
    }
  }

  @Builder
  private browserMutationPanels() {
    if (this.collectionHistoryOpen) {
      CollectionHistoryDialog({ backRequest: this.collectionHistoryBackRequest,
        onBusy: (busy: boolean): void => { this.mutationBusy = busy; },
        onClose: (): void => { this.collectionHistoryOpen = false; },
        onChanged: async (): Promise<void> => {
          await this.refreshAfterHistory();
        } })
    }
    if (this.batchDialog === 'reset') {
      BrowserResetDialog({ backRequest: this.batchBackRequest, busy: this.批量忙碌 || this.mutationBusy,
        notes: this.浏览模式值 === 'notes', onClose: (): void => { this.batchDialog = 'none'; },
        onSubmit: (options: ScheduleCardsAsNewOptions): void => { this.resetCards(options); } })
    }
    if (this.showBatchMenu && this.多选模式值 && this.选中ID列表.length > 0) {
      批量操作栏({
        isDark: this.是否深色(), busy: this.批量忙碌 || this.mutationBusy,
        backRequest: this.batchBackRequest, labels: this.flagLabels,
        选中数: this.选中ID列表.length, notesMode: this.浏览模式值 === 'notes',
        topOffset: 应用尺寸.pageContentTop(this.状态栏高度, this.narrowDeckLayout),
        onClose: (): void => { this.showBatchMenu = false; },
        onExit: (): void => { this.退出多选(); },
        on改牌组: (): void => { this.打开改牌组弹层(); },
        onTags: (): void => { this.打开批量标签(); },
        onMark: (marked: boolean): void => { this.执行批量标星(marked); },
        on设置标志: (): void => { this.loadFlagLabels(); },
        onFlag: (flag: number): void => { this.执行批量设置标志(flag); },
        onFlagNames: (): void => { this.flagNamesOpen = true; },
        on挂起: (): void => { this.执行批量挂起(); },
        onBury: (): void => { this.执行批量搁置(); },
        onReset: (): void => {
          this.resetSelection = this.captureBrowserSelection(); this.批量错误 = ''; this.batchDialog = 'reset';
        },
        on删除: (): void => { this.批量错误 = ''; this.batchDialog = 'delete'; },
        on设置到期日: (): void => { this.打开设置到期日弹层(); },
        on重新定位: (): void => { this.打开重新定位弹层(); },
        on更改笔记类型: (): void => { this.打开更改笔记类型弹层(); },
        onAI改卡: (): void => { this.打开AI改卡(); },
        onHelp: (): void => {
          this.说明标题 = $r('app.string.browser_help_batch_title');
          this.说明正文 = $r('app.string.browser_help_batch_body');
          this.显示说明浮层 = true;
        }
      })
    }
    if (this.batchDialog === 'tags') {
      BrowserTagsDialog({ backRequest: this.batchBackRequest, busy: this.批量忙碌 || this.mutationBusy,
        noteTags: this.batchNoteTags, error: this.批量错误,
        onClose: (): void => { if (!this.mutationBusy) this.batchDialog = 'none'; },
        onSubmit: (changes: TagSelectionChange[]): void => { this.提交批量标签(changes); } })
    }
    if (this.flagNamesOpen) {
      FlagNamesDialog({ backRequest: this.flagNamesBackRequest,
        onClose: (): void => { this.flagNamesOpen = false; },
        onChanged: (): void => { this.loadFlagLabels(); } })
    }
    if (this.显示标签重命名) {
      BrowserRenameTagDialog({ isDark: this.是否深色(), busy: this.标签重命名忙碌, original: this.重命名原标签名, error: this.标签重命名错误,
        onClose: (): void => { this.显示标签重命名 = false; },
        onSubmit: (name: string): void => { this.执行重命名标签(name); } })
    }

    // T8 改牌组选择器弹层
    if (this.batchDialog === 'deck') {
      BrowserDeckDialog({ backRequest: this.batchBackRequest, isDark: this.是否深色(), busy: this.批量忙碌, 牌组树: this.牌组树,
        onClose: (): void => { this.batchDialog = 'none'; },
        onSubmit: (id: number): void => { this.执行批量改牌组(id); } })
    }


    // T8 删除确认弹层
    if (this.batchDialog === 'delete') {
      BrowserBatchConfirm({ backRequest: this.batchBackRequest, isDark: this.是否深色(), busy: this.批量忙碌,
        title: $r('app.string.browser_action_delete'), message: $r('app.string.browser_action_delete_confirm'),
        destructive: true, onClose: (): void => { this.batchDialog = 'none'; },
        onSubmit: (): void => { this.执行批量删除(); } })
    }

    // T8 设置到期日弹层：TextInput 输入 days 字符串
    if (this.batchDialog === 'due') {
      BrowserDueDialog({ backRequest: this.batchBackRequest, isDark: this.是否深色(), busy: this.批量忙碌, onClose: (): void => { this.batchDialog = 'none'; },
        onSubmit: (days: string): void => { this.执行批量设置到期日(days); } })
    }

    // T8 重新定位弹层：起始位置/步长/随机/顺移已有
    if (this.batchDialog === 'reposition') {
      BrowserRepositionDialog({ backRequest: this.batchBackRequest, isDark: this.是否深色(), busy: this.批量忙碌,
        onClose: (): void => { this.batchDialog = 'none'; },
        onSubmit: (input: BrowserRepositionInput): void => { this.执行批量重新定位(input); } })
    }

    // T8 更改笔记类型弹层：选新类型 + 字段/模板映射
    if (this.batchDialog === 'notetype' && this.选中ID列表.length > 0) {
      BrowserNotetypeFeature({ backRequest: this.batchBackRequest, firstId: this.选中ID列表[0], notes: this.浏览模式值 === 'notes',
        isDark: this.是否深色(), busy: this.批量忙碌,
        onClose: (): void => { this.batchDialog = 'none'; },
        onSubmit: (input: 变更笔记类型请求): void => { this.执行批量更改笔记类型(input); } })
    }
  }

  build() {
    NavDestination() {
      Stack() {
        this.browserContent()

        // T5 卡片预览弹层：Cards 模式下点击行 → 全屏预览正反面；底部「编辑字段」→ 打开编辑区
        this.browserInspection()

        // T9 查找替换弹层：顶部条按钮触发，支持仅选中笔记或全部笔记两种范围
        this.browserSearchPanels()

        // T6 标签重命名对话框：侧边栏长按标签 → 重命名 → 弹此对话框
        this.browserMutationPanels()

        this.browserMoreMenu()

        if (this.showViewMenu) {
          BrowserViewMenu({
            notes: this.浏览模式值 === 'notes',
            filterIndex: this.quickFilterIndex(),
            sortIndex: this.sortIndex(),
            group: this.viewMenuGroup,
            menuWidth: this.viewMenuWidth,
            filterOptions: this.quickFilterOptions(),
            sortOptions: this.sortOptions(),
            available: !this.多选模式值 && this.阶段 === 'list',
            topOffset: 应用尺寸.pageContentTop(this.状态栏高度, this.narrowDeckLayout) + SelectStyle.controlHeight * 2 + 应用尺寸.间距_8 * 2,
            onClose: (): void => { this.showViewMenu = false; },
            onModeChange: (notes: boolean): void => {
              this.showViewMenu = false;
              this.切换模式(notes ? 'notes' : 'cards');
            },
            onFilterChange: (index: number): void => {
              this.showViewMenu = false;
              this.quickFilter = BROWSER_QUICK_FILTERS[index].id;
              this.执行搜索();
            },
            onSortChange: (index: number): void => {
              this.showViewMenu = false;
              this.selectSort(index);
            }
          })
        }

      // 字段帮助浮层（与设置面板同模式：根 Stack 顶层统一渲染）
      if (this.显示说明浮层) {
        字段帮助面板({
          标题: this.说明标题,
          正文: this.说明正文,
          onClose: (): void => { this.显示说明浮层 = false; }
        })
      }
      }
      .width('100%')
      .height('100%')
    }
    .hideTitleBar(true)
    .backgroundColor(Color.Transparent)
    .onBackPressed((): boolean => this.onBackPress())
    .onShown((): void => { appInterface.showPage('browser'); this.returnFromEditor(); this.publishInterface();
      if (this.interfaceMounted) this.loadFlagLabels(); })
    .onHidden((): void => { appInterface.hidePage('browser'); })
    .opacity(this.转场透明度)
  }
}
