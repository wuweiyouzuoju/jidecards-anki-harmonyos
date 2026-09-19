// SPDX-License-Identifier: AGPL-3.0-or-later
import { BrowserOperationContext, BrowserOperationController } from '../model/BrowserOperationController';
import { autoSyncScheduler } from '../model/AutoSyncScheduler';
import { PAGE_SURFACE_KEY } from '../model/ThemeCatalog';

import { DialogHeader } from '../components/common/DialogHeader';
// ========================================================
// @块ID UI-PAGE-BROWSER-001
// @名称 浏览页
//
// @作用
// 卡片/笔记浏览器（对标 Anki Browser）。手机端单栏布局：
// 顶部条（返回 + 标题 + Cards/Notes 切换）+ 搜索框 + 结果列表。
// 阶段 1 MVP：可搜索 + 查看只读列表。
// 阶段 2：列表行点击后用 Stack+if 弹层打开 浏览编辑区 编辑笔记字段/标签。
//
// @输入
// pageDeckId：可选牌组 ID（空=全库浏览）
// pathStack：Navigation 页面栈，用于返回主页
//
// @输出
// 渲染浏览页 NavDestination
//
// @业务规则
// 进入页面即拉取全部卡片（空搜索串）。搜索串由后端构建（前端不拼字符串），
// 保证与 Anki 桌面端搜索语法一致。行数据按需懒加载（浏览器行按ID）。
//
// @Invariants
// - 搜索串必须经 搜索服务.构建搜索串 构建，不前端拼接
// - 浏览模式切换后自动重新搜索
// - 行缓存与 结果ID列表 按索引对齐
//
// @Extension Points
// - T4 搜索框组件将替换内联 TextInput
// - T5 卡片表格组件将替换内联 List
// - T7 详情编辑区已接入（Stack+if 弹层），后续可扩展批量操作栏（T8）
//
// @副作用
// 通过 搜索服务 调用后端 RPC，读取 Anki collection。
// ========================================================

import { common } from '@kit.AbilityKit';
import { 后端会话 } from '../backend/后端会话';
import { BROWSER_QUICK_FILTERS, BrowserQuickFilter, browserFilterNode } from '../model/BrowserQuickFilter';
import { 搜索服务 } from '../backend/搜索服务';
import { 笔记服务 } from '../backend/笔记服务';
import { 笔记类型服务 } from '../backend/笔记类型服务';
import { 卡片服务 } from '../backend/卡片服务';
import { 牌组服务 } from '../backend/牌组服务';
import { 调度器服务 } from '../backend/调度器服务';
import { 统计服务 } from '../backend/统计服务';
import { 标签服务 } from '../backend/标签服务';
import { 配置服务 } from '../backend/配置服务';
import type {
  BrowserColumn,
  BrowserRow,
  FindAndReplaceRequest,
  SearchRequest,
  SortOrder
} from '../proto/messages/SearchMessages';
import { BrowserColumnSorting, SearchNodeCardState, makeCardStateNode } from '../proto/messages/SearchMessages';
import {
  makeParsableTextNode
} from '../proto/messages/SearchMessages';
import type { EditableNote } from '../proto/messages/NoteMessages';
import type { Card } from '../proto/messages/CardsMessages';
import type { CardStatsView } from '../proto/messages/StatsMessages';
import type { DeckTreeNode } from '../proto/messages/DeckMessages';
import type { TagTreeNode } from '../proto/messages/TagsMessages';
import type { NotetypeNameId, 变更笔记类型信息 } from '../proto/messages/NotetypeMessages';
import { ConfigKeyBool } from '../proto/messages/ConfigMessages';
import { BURY_SUSPEND_MODE_SUSPEND } from '../proto/messages/SchedulerMessages';
import { 应用尺寸 } from '../utils/应用尺寸';
import { CustomTransition } from '../utils/自定义转场';
import { 统一加载态 } from '../components/common/统一加载态';
import { 统一错误态 } from '../components/common/统一错误态';
import { 搜索框 } from '../components/browser/搜索框';
import { 卡片表格, 浏览行数据 } from '../components/browser/卡片表格';
import { 浏览编辑区 } from '../components/browser/浏览编辑区';
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
import type { 设置页参数 } from './设置页';
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

/** 浏览页入栈参数 */
export interface 浏览页参数 {
  /** 可选：限定牌组 ID（空=全库浏览） */
  deckId?: string;
  /** 可选：初始搜索串（如查找重复对话框跳转时传入 `note:"Basic" "字段值"`） */
  initialSearch?: string;
  /** 可选：从主页 Agent 改卡进入时，列表加载后直接进入多选。 */
  selectForAgentEdit?: boolean;
  /** 可选：打开搜索结果后直接进入指定卡片的浏览编辑区。 */
  editCardId?: number;
}

/** T8 改牌组选择器列表项（扁平化后的牌组树节点）。 */
interface 牌组项 {
  id: number;
  名: string;
}

@Component
export struct 浏览页 {
  /** Navigation 入栈参数：牌组 ID（空=全库） */
  pageDeckId: string = '';
  /** Navigation 入栈参数：初始搜索串（空=默认搜索；查找重复对话框跳转时传入） */
  pageInitialSearch: string = '';
  /** Navigation 入栈参数：是否为 Agent 改卡直接进入多选。 */
  pageSelectForAgentEdit: boolean = false;
  /** Navigation 入栈参数：搜索完成后直接进入指定卡片的编辑区（-1=不自动打开）。 */
  pageEditCardId: number = -1;
  /** 页面栈：返回主页时 pop */
  pathStack: NavPathStack = new NavPathStack();
  private readonly 搜索服务实例: 搜索服务 = new 搜索服务();
  private readonly 笔记服务实例: 笔记服务 = new 笔记服务();
  private readonly 笔记类型服务实例: 笔记类型服务 = new 笔记类型服务();
  private readonly 卡片服务实例: 卡片服务 = new 卡片服务();
  private readonly 牌组服务实例: 牌组服务 = new 牌组服务();
  private readonly 调度器服务实例: 调度器服务 = new 调度器服务();
  private readonly 统计服务实例: 统计服务 = new 统计服务();
  private readonly 标签服务实例: 标签服务 = new 标签服务();
  private readonly 配置服务实例: 配置服务 = new 配置服务();

  @State private 阶段: 浏览阶段 = 'loading';
  @State private 错误详情: string = '';
  @State private 搜索文本: string = '';
  @State private quickFilter: string = 'all';
  @State private 浏览模式值: 浏览模式 = 'cards';
  @State private 结果ID列表: number[] = [];
  @State private 行列表: 浏览行数据[] = [];
  @State private 列定义: BrowserColumn[] = [];
  @State private subtitleIndex: number = 1;
  @State private sortColumn: string = '';
  @State private sortReverse: boolean = false;
  private suspendedRowIds: Set<number> = new Set<number>();
  private searchVersion: number = 0;
  private selectionVersion: number = 0;
  private editorVersion: number = 0;
  private infoVersion: number = 0;
  private mappingVersion: number = 0;
  private consumedRowCount: number = 0;
  private readonly operations: BrowserOperationController = new BrowserOperationController();
  @State private mutationBusy: boolean = false;
  private loadingMore: boolean = false;
  /** NavDestination 透明度（由 customNavContentTransition 回调控制，实现淡入淡出转场）。 */
  @State private 转场透明度: number = 1;

  // 字段帮助浮层（与设置面板同模式：子组件上抛 → 父组件根 Stack 统一渲染）
  @State private 显示说明浮层: boolean = false;
  @State private 说明标题: Resource = $r('app.string.browser_help_sidebar_title');
  @State private 说明正文: Resource = $r('app.string.browser_help_sidebar_body');

  // T7 浏览编辑区状态：行点击后懒加载笔记 + 字段名，弹层内编辑字段/标签，保存调 更新笔记
  @State @Watch('editorVisibilityChanged') private 显示编辑区: boolean = false;
  @State private 编辑区字段名列表: string[] = [];
  @State private 编辑区初始字段值: string[] = [];
  @State private 编辑区初始标签: string = '';
  @State private 编辑区错误: string = '';
  @State private 编辑区忙碌: boolean = false;
  // 当前正在编辑的笔记（保存时复用 id/guid/notetypeId/mtime/usn，仅 fields/tags 来自弹层）
  @State private 编辑区当前笔记: EditableNote | null = null;

  // T11 卡片信息状态：非多选模式下点击行右侧 info 按钮 → 懒加载该卡 CardStatsView
  @State private 显示卡片信息: boolean = false;
  @State private 卡片信息数据: CardStatsView | null = null;
  @State private 卡片信息错误: string = '';
  @State private 卡片信息忙碌: boolean = false;

  // T8 批量操作栏状态：多选模式 + 选中ID + 4 个操作弹层 + 牌组树（改牌组选择器用）
  @State private 多选模式值: boolean = false;
  @State private 选中ID列表: number[] = [];
  // 退出多选信号：每次退出多选 +1，经 @Watch 触发 卡片表格 清内部选中（组件内部状态不可外部直改）
  @State private 退出多选信号: number = 0;
  @State private 批量忙碌: boolean = false;
  @State private 批量错误: string = '';
  @State private 显示改牌组弹层: boolean = false;
  @State private 显示标志弹层: boolean = false;
  @State private 显示挂起确认: boolean = false;
  @State private 显示删除确认: boolean = false;
  @State private 牌组树: DeckTreeNode | null = null;

  // T8 设置到期日弹层状态：TextInput 输入 days 字符串（"0"/"5"/"1-3" 等）
  @State private 显示到期日弹层: boolean = false;
  @State private 到期日输入: string = '';

  // T8 重新定位弹层状态：起始位置/步长/随机/顺移已有
  @State private 显示重新定位弹层: boolean = false;
  @State private 重新定位起始: number = 1;
  @State private 重新定位步长: number = 1;
  @State private 重新定位随机: boolean = false;
  @State private 重新定位顺移: boolean = false;

  // T8 更改笔记类型弹层状态：旧/新笔记类型 + 字段/模板映射
  @State @Watch('mappingVisibilityChanged') private 显示笔记类型弹层: boolean = false;
  @State private 笔记类型列表: NotetypeNameId[] = [];
  @State private 选中新笔记类型ID: number = 0;
  @State private 变更笔记类型信息数据: 变更笔记类型信息 | null = null;
  @State private 字段映射: number[] = [];
  @State private 模板映射: number[] = [];
  @State private 笔记类型弹层忙碌: boolean = false;
  @State private 旧笔记类型ID缓存: number = 0;

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

  // T6 标签管理状态：侧边栏长按标签 → 弹操作菜单 → 重命名/删除/补全
  @State private 显示标签重命名: boolean = false;
  @State private 标签重命名忙碌: boolean = false;
  @State private 标签重命名错误: string = '';
  @State private 重命名原标签名: string = '';
  @State private 重命名新标签名: string = '';
  @State private 标签操作忙碌: boolean = false;

  // T5 卡片预览状态：Cards 模式下点击行 → 弹全屏预览；底部「编辑字段」→ 在预览上方打开 浏览编辑区
  @State private 显示预览: boolean = false;
  @State private previewCardIds: number[] = [];
  @State private 预览初始索引: number = 0;
  @State private 预览媒体目录: string = '';
  @State private 预览刷新版本: number = 0;

  // 主题模式：编辑区 isDark 判断用（与 学习页/添加笔记页 同语义）
  @State private 主题模式值: 主题模式 = 'system';
  @StorageLink('systemDarkMode') private 系统暗黑模式: boolean = false;

  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景色: string = '#2F5FD0';
  @StorageProp(颜色键.主色容器) private 主色容器色: string = '#E8EEFC';
  @StorageProp(PAGE_SURFACE_KEY) private 页面底色微染值: string = '#F5F7FA';
  @StorageProp('状态栏高度') private 状态栏高度: number = 0;

  async aboutToAppear(): Promise<void> {
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
    if (this.pageSelectForAgentEdit) {
      this.多选模式值 = true;
    }
    await this.执行搜索();
    if (!this.operations.isAlive()) return;
    if (this.pageEditCardId > 0) {
      this.打开编辑区For(this.pageEditCardId);
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
  private 取本地化文案(资源: Resource): string {
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
  private 构建映射选项列表(旧名列表: string[]): SelectOption[] {
    const 选项: SelectOption[] = [];
    选项.push({
      value: this.取本地化文案($r('app.string.browser_action_change_notetype_no_map'))
    });
    for (let i = 0; i < 旧名列表.length; i++) {
      选项.push({ value: 旧名列表[i] });
    }
    return 选项;
  }

  aboutToDisappear(): void {
    this.operations.dispose();
    this.searchVersion++;
    this.editorVersion++;
    this.infoVersion++;
    this.mappingVersion++;
    CustomTransition.getInstance().注销NavParam('BrowserPage');
    // 通知首页刷新牌组计数：页内删除/改牌组/挂起/重置到期等写操作分散在多个方法，
    // 统一在离页时广播（幂等，纯浏览未改数据时多刷一次无副作用）；onPop 偶发不触发时仍能刷新。
    AppStorage.setOrCreate<number>('需要刷新主页', Date.now());
  }

  /**
   * 系统返回键 / 屏幕边缘滑动返回：弹窗优先消费，否则走 NavPathStack 默认 pop 回首页。
   * Invariants: 按层级逆序消费——先二次确认类（删除/挂起可能丢数据）→ 对话框 → 抽屉 →
   * 全屏预览 → 行内弹层 → 浮层；任一命中即关对应弹窗并 return true；都不命中 return false。
   * Extension Points: 新增弹窗时在此链中按层级插入对应 @State 判断。
   */
  onBackPress(): boolean {
    if (this.显示删除确认) { this.显示删除确认 = false; return true; }
    if (this.显示挂起确认) { this.显示挂起确认 = false; return true; }
    if (this.显示笔记类型弹层) { this.显示笔记类型弹层 = false; return true; }
    if (this.显示重新定位弹层) { this.显示重新定位弹层 = false; return true; }
    if (this.显示到期日弹层) { this.显示到期日弹层 = false; return true; }
    if (this.显示标签重命名) { this.显示标签重命名 = false; return true; }
    if (this.显示查找替换) { this.显示查找替换 = false; return true; }
    if (this.显示侧边栏) { this.显示侧边栏 = false; return true; }
    if (this.显示预览) { this.显示预览 = false; return true; }
    if (this.显示改牌组弹层) { this.显示改牌组弹层 = false; return true; }
    if (this.显示标志弹层) { this.显示标志弹层 = false; return true; }
    if (this.显示编辑区) { this.显示编辑区 = false; return true; }
    if (this.显示卡片信息) { this.关闭卡片信息(); return true; }
    if (this.显示说明浮层) { this.显示说明浮层 = false; return true; }
    if (this.多选模式值) { this.退出多选(); return true; }
    return false;
  }

  private 取能力上下文(): common.UIAbilityContext | null {
    const context: common.UIAbilityContext | undefined =
      AppStorage.get<common.UIAbilityContext>('abilityContext');
    return context === undefined ? null : context;
  }

  // ========================================================
  // @块ID UI-PAGE-BROWSER-002
  // @名称 执行搜索
  //
  // @作用
  // 根据当前搜索文本和浏览模式，调后端搜索卡片/笔记 ID，并预加载前 50 行数据。
  //
  // @输入
  // 搜索文本 + 浏览模式值
  //
  // @输出
  // 更新 阶段 / 结果ID列表 / 行列表 / 列定义
  //
  // @业务规则
  // 搜索串由后端构建搜索串生成（前端不拼字符串）。
  // 首次搜索时拉取列定义（全部浏览器列），后续复用。
  // 行数据按需懒加载，MVP 预加载前 50 行避免首屏空白。
  //
  // @副作用
  // 调后端 构建搜索串 / 搜索卡片 / 搜索笔记 / 全部浏览器列 / 浏览器行按ID
  // ========================================================
  private async 执行搜索(): Promise<void> {
    if (!this.operations.isAlive()) return;
    const version: number = ++this.searchVersion;
    const notesMode: boolean = this.浏览模式值 === 'notes';
    const text: string = this.搜索文本;
    const filter: string = this.quickFilter;
    const sortColumn: string = this.sortColumn;
    const sortReverse: boolean = this.sortReverse;
    this.loadingMore = false;
    this.consumedRowCount = 0;
    this.阶段 = 'loading';
    try {
      const context: common.UIAbilityContext | null = this.取能力上下文();
      if (context === null) {
        this.阶段 = 'error';
        this.错误详情 = this.getUIContext().getHostContext()!.resourceManager
          .getStringSync($r('app.string.ability_context_unavailable').id);
        return;
      }
      await 后端会话.获取实例().确保已打开(context.filesDir);
      if (version !== this.searchVersion) { return; }
      await this.配置服务实例.设置配置布尔({
        key: ConfigKeyBool.BROWSER_TABLE_SHOW_NOTES_MODE, value: notesMode, undoable: false
      });
      if (version !== this.searchVersion) { return; }

      // 首次搜索时拉取列定义并设置激活列（后端 browser_row_for_id 要求 active_browser_columns 已设置）
      if (this.列定义.length === 0) {
        const cols = await this.搜索服务实例.全部浏览器列();
        if (version !== this.searchVersion) { return; }
        // 单元格顺序固定；副标题选择只切换展示，不反复请求整批行。
        // 列 key 来自 Anki 后端 strum camelCase 序列化（browser_table.rs）：Question→"question" 等
        // 未设置则 browser_row_for_id 报 "Active browser columns not set."
        const 默认列键: string[] = ['question', 'deck', 'cardDue', 'flags', 'answer'];
        await this.搜索服务实例.设置激活浏览器列(默认列键);
        if (version !== this.searchVersion) { return; }
        this.列定义 = cols.columns;
        console.info(`BrowserPage: 列定义=${cols.columns.length} 列，激活列=${默认列键.join(',')}`);
      }
      if (version !== this.searchVersion) { return; }

      // 构建搜索串（后端构建，前端不拼字符串）
      const searchNode = browserFilterNode(text, filter);
      const searchStr = await this.搜索服务实例.构建搜索串(searchNode);
      if (version !== this.searchVersion) { return; }
      console.info(`BrowserPage: 搜索文本="${this.搜索文本}" 搜索串="${searchStr}"`);

      // 按模式搜索卡片或笔记
      const order: SortOrder = sortColumn === '' ? { kind: 'none' } :
        { kind: 'builtin', column: sortColumn, reverse: sortReverse };
      const request: SearchRequest = { search: searchStr, order };
      const ids = notesMode ? await this.搜索服务实例.搜索笔记(request) :
        await this.搜索服务实例.搜索卡片(request);
      if (version !== this.searchVersion) { return; }
      // 行颜色优先显示旗标/标记，不能据此判断暂停；笔记搜索返回含暂停卡的笔记 ID。
      const suspendedSearch: string = await this.搜索服务实例.构建搜索串(
        makeCardStateNode(SearchNodeCardState.CARD_STATE_SUSPENDED));
      if (version !== this.searchVersion) { return; }
      const suspendedRequest: SearchRequest = { search: suspendedSearch, order: { kind: 'none' } };
      const suspendedIds: number[] = notesMode ? await this.搜索服务实例.搜索笔记(suspendedRequest) :
        await this.搜索服务实例.搜索卡片(suspendedRequest);
      if (version !== this.searchVersion) { return; }
      this.suspendedRowIds = new Set<number>(suspendedIds);
      console.info(`BrowserPage: 模式=${this.浏览模式值} 搜索返回 ${ids.length} 个 ID`);

      this.结果ID列表 = ids;
      this.行列表 = [];

      // 预加载前 200 行（避免首屏空白；后端 browser_row_for_id 是单 ID 查询，无批量接口）
      await this.预加载行(ids.slice(0, 200), version);
      if (version !== this.searchVersion) { return; }
      console.info(`BrowserPage: 预加载完成 行列表=${this.行列表.length} 行`);

      this.consumedRowCount = Math.min(200, ids.length);
      this.阶段 = 'list';
    } catch (error) {
      if (version !== this.searchVersion) { return; }
      this.阶段 = 'error';
      this.错误详情 = error instanceof Error ? error.message : `${error}`;
    }
  }

  /**
   * 加载更多行：取下一批未加载的 ID，预加载后追加到 行列表。
   * 由 卡片表格.onReachEnd 触发；批次大小 100，并发 10。
   */
  private async 加载更多(): Promise<void> {
    if (this.loadingMore || this.阶段 !== 'list') { return; }
    const 已加载数: number = this.consumedRowCount;
    if (已加载数 >= this.结果ID列表.length) {
      return;
    }
    const 下一批: number[] = this.结果ID列表.slice(已加载数, 已加载数 + 100);
    console.info(`BrowserPage: 加载更多 已加载=${已加载数} 本批=${下一批.length} 总=${this.结果ID列表.length}`);
    const version: number = this.searchVersion;
    this.loadingMore = true;
    try {
      await this.预加载行(下一批, version);
      if (version === this.searchVersion) this.consumedRowCount += 下一批.length;
    } finally {
      if (version === this.searchVersion) this.loadingMore = false;
    }
    console.info(`BrowserPage: 加载更多完成 行列表=${this.行列表.length} 行`);
  }

  /** 预加载行数据：并行拉取（每批 20 个），累积后一次性赋值触发 UI 刷新。 */
  private async 预加载行(ids: number[], version: number): Promise<void> {
    const 批次大小: number = 20;
    let 成功数: number = 0;
    let 失败数: number = 0;
    const 累积新增: 浏览行数据[] = [];
    for (let i = 0; i < ids.length; i += 批次大小) {
      if (version !== this.searchVersion) { return; }
      const 批次: number[] = ids.slice(i, i + 批次大小);
      const 行们: (BrowserRow | null)[] = await Promise.all(
        批次.map((id: number): Promise<BrowserRow | null> => {
          return this.搜索服务实例.浏览器行按ID(id)
            .then((row: BrowserRow): BrowserRow => {
              成功数++;
              return row;
            })
            .catch((err: ESObject): BrowserRow | null => {
              失败数++;
              console.info(`BrowserPage: 浏览器行按ID(${id}) 失败: ${err}`);
              return null;
            });
        })
      );
      批次.forEach((id: number, idx: number): void => {
        const row: BrowserRow | null = 行们[idx];
        if (row !== null) {
          累积新增.push({ id, cells: row.cells, color: row.color,
            hasSuspendedCards: this.suspendedRowIds.has(id) });
        }
      });
    }
    // 累积所有批次后一次性赋值，避免循环内多次 concat 导致 @State 更新丢失
    if (version === this.searchVersion && 累积新增.length > 0) {
      this.行列表 = this.行列表.concat(累积新增);
    }
    console.info(`BrowserPage: 预加载统计 成功=${成功数} 失败=${失败数}`);
  }

  /** 切换浏览模式（cards/notes），切换后自动重新搜索。 */
  private 切换模式(模式: 浏览模式): void {
    if (this.浏览模式值 === 模式) {
      return;
    }
    this.显示改牌组弹层 = false;
    this.显示标志弹层 = false;
    this.显示删除确认 = false;
    this.显示挂起确认 = false;
    this.显示到期日弹层 = false;
    this.显示重新定位弹层 = false;
    this.显示编辑区 = false;
    this.editorVersion++;
    this.mappingVersion++;
    this.显示笔记类型弹层 = false;
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

  // ========================================================
  // @块ID UI-PAGE-BROWSER-003
  // @名称 行点击
  //
  // @作用
  // 行点击后懒加载笔记 + 笔记类型字段名，弹出 浏览编辑区 进行字段/标签编辑。
  // - Notes 模式：行ID 即 noteId，直接调 笔记服务.获取笔记
  // - Cards 模式：行ID 是 cardId，先调 卡片服务.获取卡片 拿 noteId，再调 笔记服务.获取笔记
  //
  // @输入
  // 行ID: 当前行 ID（语义随 浏览模式值 变化）
  //
  // @输出
  // 成功 → 设置 编辑区当前笔记 / 字段名列表 / 初始字段值 / 初始标签 / 显示编辑区=true
  // 失败 → 在 编辑区错误 显示加载失败文案并打开弹层（让用户感知错误）
  //
  // @业务规则
  // Cards 模式下需多一跳卡片查询，但 UI 仍只展示笔记字段（与 Anki 桌面端一致）。
  // 加载期间不禁用列表（只设 编辑区忙碌），用户可关闭弹层或重试。
  //
  // @副作用
  // 调后端 获取卡片 / 获取笔记 / 获取笔记类型；读 Anki collection。
  // ========================================================
  private async 行点击(行ID: number): Promise<void> {
    if (!this.operations.isAlive() || this.mutationBusy) return;
    const version: number = ++this.editorVersion;
    const mode: 浏览模式 = this.浏览模式值;
    this.编辑区忙碌 = true;
    this.编辑区错误 = '';
    this.编辑区当前笔记 = null;
    this.编辑区字段名列表 = [];
    this.编辑区初始字段值 = [];
    this.编辑区初始标签 = '';
    this.显示编辑区 = true;
    try {
      // 1. 拿到 noteId：Notes 模式直接用，Cards 模式经卡片查询
      let noteId: number = 行ID;
      if (mode === 'cards') {
        const card: Card = await this.卡片服务实例.获取卡片(行ID);
        noteId = card.noteId;
      }
      // 2. 拉笔记（必须先拿到 notetypeId 才能查字段名）
      const note: EditableNote = await this.笔记服务实例.获取笔记(noteId);
      const notetypeView = await this.笔记类型服务实例.获取笔记类型(note.notetypeId);
      if (!this.operations.isAlive() || version !== this.editorVersion || !this.显示编辑区) return;
      this.编辑区当前笔记 = note;
      this.编辑区字段名列表 = notetypeView.fieldNames;
      this.编辑区初始字段值 = note.fields.slice();
      this.编辑区初始标签 = note.tags.join(' ');
    } catch (错误) {
      if (!this.operations.isAlive() || version !== this.editorVersion) return;
      this.编辑区错误 = this.取本地化文案($r('app.string.browser_detail_load_error'));
      console.info(`BrowserPage: 行点击加载笔记失败 行ID=${行ID} 模式=${this.浏览模式值} 错误=${错误}`);
    } finally {
      if (this.operations.isAlive() && version === this.editorVersion) this.编辑区忙碌 = false;
    }
  }

  // ========================================================
  // @名称 T5 行点击路由
  //
  // @作用
  // 行点击分发：Cards 模式 → 弹全屏预览（T5）；Notes 模式 → 直接打开 浏览编辑区（T7）。
  // Cards 模式下，预览页底部「编辑字段」按钮再经 打开编辑区For 进入编辑区。
  //
  // @输入
  // 行ID: 当前行 ID（cards 模式=cardId，notes 模式=noteId）
  //
  // @输出
  // 无（按模式触发 预览弹层 或 编辑区弹层）
  //
  // @业务规则
  // - Cards 模式单击行不直接进编辑区，先弹预览让用户看正反面
  // - Notes 模式无卡片预览概念，维持原行为直接进编辑区
  // ========================================================
  private 行点击处理(行ID: number): void {
    if (this.浏览模式值 === 'cards') {
      this.打开预览(行ID);
    } else {
      this.行点击(行ID);
    }
  }

  // ========================================================
  // @名称 T5 打开预览
  //
  // @作用
  // 在 结果ID列表 中定位行ID索引，设置预览初始索引和媒体目录，弹全屏预览。
  //
  // @输入
  // 行ID: cardId（待预览的卡片 ID）
  //
  // @输出
  // 设 预览初始索引 / 预览媒体目录 / 显示预览=true
  //
  // @业务规则
  // - 索引未命中（行ID 不在 结果ID列表）时静默返回（不应发生，兜底）
  // - 媒体目录从 abilityContext.filesDir 拼接（与 学习页 同语义）
  // ========================================================
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
    this.行点击(卡片ID);
  }

  // ========================================================
  // @块ID UI-PAGE-BROWSER-004
  // @名称 保存编辑
  //
  // @作用
  // 浏览编辑区 onSave 回调：用 编辑区当前笔记 的 id/guid/notetypeId/mtime/usn + 弹层传入的
  // fields/tags 构造 EditableNote，调 笔记服务.更新笔记 落盘。成功后关闭弹层并刷新当前行。
  //
  // @输入
  // fields: 编辑后的字段值数组
  // tags: 编辑后的标签数组
  //
  // @输出
  // 成功 → 返回 true，关闭弹层，触发 执行搜索 刷新列表
  // 失败 → 返回 false，在 编辑区错误 显示保存失败文案（草稿保留）
  //
  // @业务规则
  // - skipUndoEntry=false 保留撤销栈（与 Anki 桌面端默认一致）
  // - 编辑区当前笔记 为 null 时直接返回 false（不应发生，兜底）
  // - 字段值数组长度不足 字段名列表 时用空串补齐（防御性）
  //
  // @副作用
  // 调后端 更新笔记；成功后调 执行搜索 重新加载列表。
  // ========================================================
  private async 保存编辑(fields: string[], tags: string[]): Promise<boolean> {
    const note: EditableNote | null = this.编辑区当前笔记;
    if (note === null || this.operations.isBusy()) return false;
    const version: number = this.editorVersion;
    const values: string[] = fields.slice();
    while (values.length < this.编辑区字段名列表.length) values.push('');
    const updated: EditableNote = { id: note.id, guid: note.guid, notetypeId: note.notetypeId,
      mtimeSecs: note.mtimeSecs, usn: note.usn, tags: tags.slice(), fields: values };
    this.编辑区忙碌 = true;
    this.编辑区错误 = '';
    const saved: boolean = await this.runBrowserOperation(async (_selection: BrowserOperationContext): Promise<void> => {
      await this.笔记服务实例.更新笔记([updated], false);
      if (this.operations.isAlive() && version === this.editorVersion) {
        this.显示编辑区 = false;
        this.编辑区当前笔记 = null;
        if (this.显示预览) this.预览刷新版本 += 1;
      }
    }, (_error: Error): void => {
      if (version === this.editorVersion) this.编辑区错误 = this.取本地化文案($r('app.string.browser_detail_save_error'));
    }, false);
    if (this.operations.isAlive() && version === this.editorVersion) this.编辑区忙碌 = false;
    return saved;
  }

  // ========================================================
  // @名称 T8 批量操作
  //
  // @作用
  // 多选模式下 4 个批量操作：改牌组 / 设置标志 / 挂起 / 删除。
  // 每个操作先弹层确认/选择，再调对应 service 落盘，成功后退出多选 + 刷新列表。
  //
  // @业务规则
  // - 选中ID列表在 cards 模式下是 cardId，notes 模式下是 noteId
  // - 删除：cards 模式直接 删除卡片(选中ID)；notes 模式需先查每条笔记的所有卡片再删（级联）
  // - 挂起：仅 cards 模式有意义（notes 模式无卡片ID），调 批量埋藏或暂停卡片(SUSPEND)
  // - 改牌组/设置标志：cards 模式直接用；notes 模式需先查笔记的所有卡片再操作
  //
  // @副作用
  // 调后端 设置牌组 / 设置标志 / 批量埋藏或暂停 / 删除卡片；成功后调 执行搜索 刷新列表。
  // ========================================================

  /** 扁平化牌组树为列表（改牌组选择器渲染用，跳过根节点 deckId=0）。 */
  private 扁平化牌组树(节点: DeckTreeNode, 前缀: string, 输出: 牌组项[]): void {
    if (节点.deckId !== 0) {
      const 项: 牌组项 = { id: 节点.deckId, 名: 前缀 + 节点.name };
      输出.push(项);
    }
    for (const 子 of 节点.children) {
      const 子前缀: string = 节点.deckId === 0 ? '' : 前缀 + 节点.name + '::';
      this.扁平化牌组树(子, 子前缀, 输出);
    }
  }

  /** 扁平化牌组树为列表的无参包装（弹层 ForEach 直接调用）。 */
  private 扁平化牌组树为列表(): 牌组项[] {
    const 输出: 牌组项[] = [];
    if (this.牌组树 !== null) {
      this.扁平化牌组树(this.牌组树, '', 输出);
    }
    return 输出;
  }

  /** 标志文案：0=无/1=红/2=橙/3=绿/4=蓝。 */
  private 标志文案(flag: number): string {
    const 上下文: common.UIAbilityContext | null = this.取能力上下文();
    if (上下文 === null) {
      return '';
    }
    const keyMap: Record<number, string> = {
      0: 'browser_action_flag_none',
      1: 'browser_action_flag_red',
      2: 'browser_action_flag_orange',
      3: 'browser_action_flag_green',
      4: 'browser_action_flag_blue'
    };
    const key: string = keyMap[flag] ?? 'browser_action_flag_none';
    try {
      // 用 getStringByNameSync 按名字直取（$r 是编译期宏，模板字符串拼 key 运行时拿不到 id）
      return 上下文.resourceManager.getStringByNameSync(key);
    } catch (_错误) {
      return '';
    }
  }

  /** 标志色块颜色：0=无（透明）/1=红/2=橙/3=绿/4=蓝。色值与 Anki 桌面端 flag 色对齐。 */
  private 标志颜色(flag: number): string {
    const 色表: Record<number, string> = {
      0: 'transparent',
      1: '#D92D20',
      2: '#D97A1C',
      3: '#238463',
      4: '#2F5FD0'
    };
    return 色表[flag] ?? 'transparent';
  }

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
      this.显示改牌组弹层 = true;
    } catch (错误) {
      if (!this.isBrowserSelectionCurrent(selection)) return;
      this.批量错误 = this.取本地化文案($r('app.string.browser_action_deck_load_error'));
      console.info(`BrowserPage: 加载牌组树失败 错误=${错误}`);
    } finally {
      if (this.operations.isAlive()) this.批量忙碌 = false;
    }
  }

  private editorVisibilityChanged(): void {
    if (!this.显示编辑区) { this.editorVersion++; this.编辑区忙碌 = false; }
  }

  private mappingVisibilityChanged(): void {
    if (!this.显示笔记类型弹层) { this.mappingVersion++; this.笔记类型弹层忙碌 = false; }
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
    autoSyncScheduler.beginOperation(selection);
    let committed: boolean = false;
    try {
      await action(selection);
      committed = true;
      if (!this.operations.isAlive()) return true;
      if (clearSelection && this.operations.isCurrent(selection, this.浏览模式值, this.选中ID列表,
        this.searchVersion, this.selectionVersion)) this.退出多选();
      await this.执行搜索();
      return true;
    } catch (error) {
      if (this.operations.isAlive()) onFailure(error instanceof Error ? error : new Error(`${error}`));
      return false;
    } finally {
      if (committed) {
        AppStorage.setOrCreate<number>('需要刷新主页', Date.now());
        autoSyncScheduler.request();
      }
      this.operations.finish(selection);
      if (this.operations.isAlive()) this.mutationBusy = false;
      autoSyncScheduler.endOperation(selection);
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
    this.显示改牌组弹层 = false;
    await this.runBatchOperation(async (selection: BrowserOperationContext): Promise<void> => {
      const 卡片IDs: number[] = await this.解析选中为卡片ID(selection);
      if (卡片IDs.length > 0) await this.卡片服务实例.设置牌组(卡片IDs, 牌组ID);
    }, $r('app.string.browser_action_deck_error'));
  }

  /** 执行批量设置标志：flag 取值 0=无/1=红/2=橙/3=绿/4=蓝。 */
  private async 执行批量设置标志(标志: number): Promise<void> {
    this.显示标志弹层 = false;
    await this.runBatchOperation(async (selection: BrowserOperationContext): Promise<void> => {
      const 卡片IDs: number[] = await this.解析选中为卡片ID(selection);
      if (卡片IDs.length > 0) await this.卡片服务实例.设置标志(卡片IDs, 标志);
    }, $r('app.string.browser_action_flag_error'));
  }

  /** Cards 模式暂停所选卡片；Notes 模式由 Anki Core 暂停所选笔记生成的全部卡片。 */
  private async 执行批量挂起(): Promise<void> {
    this.显示挂起确认 = false;
    await this.runBatchOperation(async (selection: BrowserOperationContext): Promise<void> => {
      if (selection.mode === 'notes') await this.调度器服务实例.批量埋藏或暂停笔记(selection.ids, BURY_SUSPEND_MODE_SUSPEND);
      else await this.调度器服务实例.批量埋藏或暂停卡片(selection.ids, BURY_SUSPEND_MODE_SUSPEND);
    }, $r('app.string.browser_action_suspend_error'));
  }

  /** 恢复所选卡片；Notes 模式先解析每条笔记实际生成的全部卡片。 */
  private async 执行批量恢复(): Promise<void> {
    await this.runBatchOperation(async (selection: BrowserOperationContext): Promise<void> => {
      const ids: number[] = await this.解析选中为卡片ID(selection);
      if (ids.length > 0) await this.调度器服务实例.恢复埋藏与暂停的卡片(ids);
    }, $r('app.string.browser_action_restore_error'));
  }

  /** 将所选笔记展开为全部兄弟卡 ID，并去重供批量操作使用。 */
  private async 解析选中笔记的卡片ID(selection: BrowserOperationContext = this.captureBrowserSelection()): Promise<number[]> {
    const 结果: number[] = [];
    const 已添加: Set<number> = new Set<number>();
    for (const 笔记ID of selection.ids.slice()) {
      const 卡片IDs: number[] = await this.笔记服务实例.获取笔记的卡片(笔记ID);
      for (const 卡片ID of 卡片IDs) {
        if (!已添加.has(卡片ID)) {
          已添加.add(卡片ID);
          结果.push(卡片ID);
        }
      }
    }
    return 结果;
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
    this.到期日输入 = '';
    this.显示到期日弹层 = true;
  }

  /** 执行批量设置到期日：days 字符串格式与 Anki 桌面端一致（"0"/"5"/"1-3"）。 */
  private async 执行批量设置到期日(): Promise<void> {
    const days: string = this.到期日输入.trim();
    if (days === '') return;
    this.显示到期日弹层 = false;
    await this.runBatchOperation(async (selection: BrowserOperationContext): Promise<void> => {
      const ids: number[] = await this.解析选中为卡片ID(selection);
      if (ids.length > 0) await this.调度器服务实例.设置到期日(ids, days);
    }, $r('app.string.browser_action_set_due_error'));
  }

  /**
   * 打开重新定位弹层：从后端获取 random/shift 默认值后显示。仅 cards 模式可用。
   * Anki collection 配置中保存了用户上次使用的 random/shift 状态，用作弹层初始值。
   */
  private async 打开重新定位弹层(): Promise<void> {
    if (this.operations.isBusy() || this.批量忙碌) return;
    const selection: BrowserOperationContext = this.captureBrowserSelection();
    if (this.浏览模式值 !== 'cards') {
      this.批量错误 = this.取本地化文案($r('app.string.browser_action_notes_mode_hint'));
      return;
    }
    this.批量错误 = '';
    this.重新定位起始 = 1;
    this.重新定位步长 = 1;
    this.显示重新定位弹层 = true;
    this.批量忙碌 = true;
    try {
      const 默认值 = await this.调度器服务实例.获取重新定位默认值();
      if (!this.isBrowserSelectionCurrent(selection) || !this.显示重新定位弹层) return;
      this.重新定位随机 = 默认值.random;
      this.重新定位顺移 = 默认值.shift;
    } catch (错误) {
      if (!this.isBrowserSelectionCurrent(selection) || !this.显示重新定位弹层) return;
      // 取默认值失败时用 false 兜底，不阻塞弹层
      this.重新定位随机 = false;
      this.重新定位顺移 = false;
      console.info(`BrowserPage: 获取重新定位默认值失败 错误=${错误}`);
    } finally {
      if (this.operations.isAlive()) this.批量忙碌 = false;
    }
  }

  /** 执行批量重新定位：调 排序卡片(选中ID, 起始, 步长, 随机, 顺移)。 */
  private async 执行批量重新定位(): Promise<void> {
    const start: number = this.重新定位起始;
    const step: number = this.重新定位步长;
    const random: boolean = this.重新定位随机;
    const shift: boolean = this.重新定位顺移;
    this.显示重新定位弹层 = false;
    await this.runBatchOperation(async (selection: BrowserOperationContext): Promise<void> => {
      const ids: number[] = await this.解析选中为卡片ID(selection);
      if (ids.length > 0) await this.调度器服务实例.排序卡片(ids, start, step, random, shift);
    }, $r('app.string.browser_action_reposition_error'));
  }

  /**
   * 打开更改笔记类型弹层：先取第一条选中笔记/卡片的旧笔记类型 ID + 加载笔记类型名列表，再显示。
   * cards 模式：先取第一张卡片的 noteId → 取该笔记的 notetypeId
   * notes 模式：直接取第一条选中笔记的 notetypeId
   * Invariants: 同一批选中必须同属一个笔记类型（Anki 后端 GetChangeNotetypeInfo 入参只接受单个 old_notetype_id）。
   */
  private async 打开更改笔记类型弹层(): Promise<void> {
    if (this.operations.isBusy()) return;
    const version: number = ++this.mappingVersion;
    const selection: BrowserOperationContext = this.captureBrowserSelection();
    if (this.选中ID列表.length === 0) {
      return;
    }
    this.批量错误 = '';
    this.笔记类型弹层忙碌 = true;
    this.显示笔记类型弹层 = true;
    this.笔记类型列表 = [];
    this.选中新笔记类型ID = 0;
    this.变更笔记类型信息数据 = null;
    this.字段映射 = [];
    this.模板映射 = [];
    try {
      // 取第一条选中对应的 noteId
      let 首个笔记ID: number;
      if (this.浏览模式值 === 'notes') {
        首个笔记ID = this.选中ID列表[0];
      } else {
        const 首张卡片: Card = await this.卡片服务实例.获取卡片(this.选中ID列表[0]);
        首个笔记ID = 首张卡片.noteId;
      }
      const 首条笔记: EditableNote = await this.笔记服务实例.获取笔记(首个笔记ID);
      const names: NotetypeNameId[] = await this.笔记类型服务实例.获取笔记类型名列表();
      if (version !== this.mappingVersion || !this.isBrowserSelectionCurrent(selection) || !this.显示笔记类型弹层) return;
      this.旧笔记类型ID缓存 = 首条笔记.notetypeId;
      this.笔记类型列表 = names;
    } catch (错误) {
      if (version !== this.mappingVersion || !this.isBrowserSelectionCurrent(selection)) return;
      this.批量错误 = this.取本地化文案($r('app.string.browser_action_change_notetype_error'));
      console.info(`BrowserPage: 加载笔记类型列表失败 错误=${错误}`);
      this.显示笔记类型弹层 = false;
    } finally {
      if (this.operations.isAlive() && version === this.mappingVersion) this.笔记类型弹层忙碌 = false;
    }
  }

  /**
   * 选中新笔记类型后加载字段/模板映射信息。
   * 调 获取变更笔记类型信息(旧ID, 新ID)，把后端给的 input.newFields / newTemplates 复制到可编辑的 字段映射 / 模板映射。
   */
  private async 加载变更笔记类型信息(新笔记类型ID: number): Promise<void> {
    const version: number = ++this.mappingVersion;
    const selection: BrowserOperationContext = this.captureBrowserSelection();
    if (新笔记类型ID === 0 || this.旧笔记类型ID缓存 === 0) {
      this.笔记类型弹层忙碌 = false;
      this.变更笔记类型信息数据 = null;
      this.字段映射 = [];
      this.模板映射 = [];
      return;
    }
    this.笔记类型弹层忙碌 = true;
    try {
      const 信息 = await this.笔记类型服务实例.获取变更笔记类型信息(
        this.旧笔记类型ID缓存, 新笔记类型ID);
      if (version !== this.mappingVersion || !this.isBrowserSelectionCurrent(selection) || !this.显示笔记类型弹层) return;
      this.变更笔记类型信息数据 = 信息;
      this.字段映射 = 信息.input.newFields.slice();
      this.模板映射 = 信息.input.newTemplates.slice();
    } catch (错误) {
      if (version !== this.mappingVersion || !this.isBrowserSelectionCurrent(selection)) return;
      this.批量错误 = this.取本地化文案($r('app.string.browser_action_change_notetype_error'));
      console.info(`BrowserPage: 加载变更笔记类型信息失败 错误=${错误}`);
      this.变更笔记类型信息数据 = null;
      this.字段映射 = [];
      this.模板映射 = [];
    } finally {
      if (this.operations.isAlive() && version === this.mappingVersion) this.笔记类型弹层忙碌 = false;
    }
  }

  /**
   * 执行批量更改笔记类型：把 字段映射 / 模板映射 回写到 input，再调 变更笔记类型。
   * noteIds 在 cards 模式需把 cardId→noteId 转换（每张卡都查 noteId），notes 模式直接用选中ID。
   */
  private async 执行批量更改笔记类型(): Promise<void> {
    const info: 变更笔记类型信息 | null = this.变更笔记类型信息数据;
    if (info === null || this.选中新笔记类型ID === 0 || this.笔记类型弹层忙碌 || this.operations.isBusy()) return;
    const fields: number[] = this.字段映射.slice();
    const templates: number[] = this.模板映射.slice();
    this.显示笔记类型弹层 = false;
    await this.runBatchOperation(async (selection: BrowserOperationContext): Promise<void> => {
      info.input.noteIds = await this.解析选中为笔记ID(selection);
      info.input.newFields = fields;
      info.input.newTemplates = templates;
      await this.笔记类型服务实例.变更笔记类型(info.input);
    }, $r('app.string.browser_action_change_notetype_error'));
  }

  /** 执行批量删除：cards 模式直接 删除卡片(选中ID)；notes 模式先查每条笔记的所有卡片再删。 */
  private async 执行批量删除(): Promise<void> {
    this.显示删除确认 = false;
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
    if (selection.mode === 'cards') {
      return selection.ids.slice();
    }
    return this.解析选中笔记的卡片ID(selection);
  }

  /** 退出多选模式：清空选中 + 多选模式值 + 翻转信号触发 卡片表格 清内部状态。 */
  private 退出多选(): void {
    this.selectionVersion++;
    this.选中ID列表 = [];
    this.多选模式值 = false;
    this.pageSelectForAgentEdit = false;
    this.退出多选信号 += 1;
  }

  /** 打开卡片信息弹层：调 统计服务.获取卡片统计 懒加载该卡的 CardStatsView。 */
  private async 打开卡片信息(卡片ID: number): Promise<void> {
    if (!this.operations.isAlive()) return;
    const version: number = ++this.infoVersion;
    this.卡片信息数据 = null;
    this.卡片信息错误 = '';
    this.卡片信息忙碌 = true;
    this.显示卡片信息 = true;
    try {
      const stats: CardStatsView = await this.统计服务实例.获取卡片统计(卡片ID);
      if (!this.operations.isAlive() || version !== this.infoVersion) return;
      this.卡片信息数据 = stats;
    } catch (错误) {
      if (!this.operations.isAlive() || version !== this.infoVersion) return;
      this.卡片信息错误 = this.取本地化文案($r('app.string.browser_info_load_error'));
      console.info(`BrowserPage: 加载卡片信息失败 cid=${卡片ID} 错误=${错误}`);
    } finally {
      if (this.operations.isAlive() && version === this.infoVersion) this.卡片信息忙碌 = false;
    }
  }

  /** 关闭卡片信息弹层。 */
  private 关闭卡片信息(): void {
    this.infoVersion++;
    this.卡片信息忙碌 = false;
    this.显示卡片信息 = false;
    this.卡片信息数据 = null;
    this.卡片信息错误 = '';
  }

  /**
   * T9 执行查找替换：调 搜索服务.查找并替换。
   * nids 解析：
   * - 仅选中=true：cards 模式经 卡片服务.获取卡片 把 cardId 转 noteId 后去重；notes 模式直接用选中ID
   * - 仅选中=false：nids 留空，后端对全部笔记生效
   * 成功后关闭弹层 + toast 提示替换数 + 重新搜索刷新列表。
   */
  private async 执行查找替换(
    查找: string, 替换: string, 字段名: string, 正则: boolean, 区分大小写: boolean, 仅选中: boolean
  ): Promise<boolean> {
    if (this.operations.isBusy()) return false;
    this.查找替换忙碌 = true;
    this.查找替换错误 = '';
    let count: number = 0;
    const done: boolean = await this.runBrowserOperation(async (selection: BrowserOperationContext): Promise<void> => {
      const nids: number[] = 仅选中 ? await this.解析选中为笔记ID(selection) : [];
      if (仅选中 && nids.length === 0) throw new Error(this.取本地化文案($r('app.string.browser_find_no_notes_error')));
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
      if (done) this.getUIContext().getPromptAction().showToast({
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
    if (selection.mode === 'notes') {
      return selection.ids.slice();
    }
    // cards 模式：逐个 cardId → card.noteId，去重
    const noteIdSet: Set<number> = new Set<number>();
    for (const 卡片ID of selection.ids) {
      try {
        const card: Card = await this.卡片服务实例.获取卡片(卡片ID);
        noteIdSet.add(card.noteId);
      } catch (错误) {
        throw new Error(`Cannot resolve selected card ${卡片ID}: ${错误}`);
      }
    }
    return Array.from(noteIdSet);
  }

  // ========================================================
  // @名称 T6 侧边栏
  //
  // @作用
  // 顶部条按钮触发抽屉式侧边栏，含牌组/标签/已保存搜索三区。
  // 点击节点替换搜索文本（deck:"xxx" / tag:"xxx" / 已保存搜索串）；
  // 长按节点追加 AND 条件到搜索文本。
  // 分区折叠状态持久化到 Anki 配置表（COLLAPSE_DECKS/TAGS/SAVED_SEARCHES）。
  //
  // @业务规则
  // - 牌组树复用 this.牌组树（T8 已加载），首次打开侧边栏时若为 null 再加载一次
  // - 标签树 + 已保存搜索 + 折叠状态在打开侧边栏时一次性加载（失败不阻塞，分区显示空提示）
  // - 已保存搜索 JSON 格式：[{ name, search }, ...]，空串或非数组视为无已保存搜索
  //
  // @副作用
  // 调后端 标签服务.标签树 / 配置服务.获取配置JSON / 获取配置布尔 / 设置配置布尔；
  // 读 Anki collection 配置表，折叠状态变更会写配置表。
  // ========================================================

  /** 打开侧边栏：并行加载牌组树（若 null）+ 标签树 + 已保存搜索 + 分区折叠状态。失败收集到错误条。 */
  private async 打开侧边栏(): Promise<void> {
    this.显示侧边栏 = true;
    this.侧边栏忙碌 = true;
    this.侧边栏错误 = '';
    const 错误列表: string[] = [];
    // 并行加载；已保存搜索 + 折叠状态失败时容错（key 不存在是正常的），不加入错误列表
    const 牌组任务: Promise<void> = this.牌组树 === null
      ? this.加载牌组树().catch((e: ESObject): void => {
        错误列表.push(`牌组(${this.取错误摘要(e)})`);
      })
      : Promise.resolve();
    const 标签任务: Promise<void> = this.加载标签树().catch((e: ESObject): void => {
      错误列表.push(`标签(${this.取错误摘要(e)})`);
    });
    const 搜索任务: Promise<void> = this.加载已保存搜索();
    const 折叠任务: Promise<void> = this.加载侧边栏折叠状态();
    await Promise.all([牌组任务, 标签任务, 搜索任务, 折叠任务]);
    if (错误列表.length > 0) {
      this.侧边栏错误 = `${this.取本地化文案($r('app.string.browser_sidebar_load_error'))}：${错误列表.join('、')}`;
    }
    this.侧边栏忙碌 = false;
  }

  /** 从后端错误或通用 Error 中提取简短摘要，用于错误条显示。 */
  private 取错误摘要(错误: ESObject): string {
    try {
      const msg: string = 错误?.message ?? `${错误}`;
      // 后端错误 message 可能很长，截取前 40 字符
      return msg.length > 40 ? msg.substring(0, 40) + '…' : msg;
    } catch {
      return '未知';
    }
  }

  /** 加载标签树（失败置 null 并抛出，由 打开侧边栏 收集到错误条）。 */
  private async 加载标签树(): Promise<void> {
    try {
      this.标签树 = await this.标签服务实例.标签树();
    } catch (错误) {
      console.info(`BrowserPage: 加载标签树失败 错误=${错误}`);
      this.标签树 = null;
      throw new Error(`${错误}`);
    }
  }

  /** 加载已保存搜索（Anki 桌面端存在 config 表 savedSearches key 下，JSON 数组）。
   *  key 不存在时后端返回错误，视为无已保存搜索（容错不抛出）。 */
  private async 加载已保存搜索(): Promise<void> {
    try {
      const json: string = await this.配置服务实例.获取配置JSON('savedSearches');
      if (json === '' || json === 'null') {
        this.已保存搜索列表 = [];
        return;
      }
      const 解析结果: object = JSON.parse(json);
      if (!Array.isArray(解析结果)) {
        this.已保存搜索列表 = [];
        return;
      }
      // 仅保留 name + search 字段（防御性，忽略其他字段）
      const 列表: 已保存搜索项[] = [];
      for (let i: number = 0; i < 解析结果.length; i++) {
        const 项: 已保存搜索项 = 解析结果[i] as 已保存搜索项;
        const name: string = 项.name;
        const search: string = 项.search;
        if (name !== '' && search !== '') {
          列表.push({ name, search });
        }
      }
      this.已保存搜索列表 = 列表;
    } catch (错误) {
      // savedSearches key 不存在时后端返回错误，视为无已保存搜索（容错不抛出）
      console.info(`BrowserPage: 加载已保存搜索失败（可能 key 不存在）错误=${错误}`);
      this.已保存搜索列表 = [];
    }
  }

  /** 加载三区折叠状态（COLLAPSE_DECKS/TAGS/SAVED_SEARCHES）。失败保持默认 false。 */
  private async 加载侧边栏折叠状态(): Promise<void> {
    try {
      // ArkTS 禁止解构声明，改用数组索引访问
      const 折叠状态: boolean[] = await Promise.all([
        this.配置服务实例.获取配置布尔(ConfigKeyBool.COLLAPSE_DECKS),
        this.配置服务实例.获取配置布尔(ConfigKeyBool.COLLAPSE_TAGS),
        this.配置服务实例.获取配置布尔(ConfigKeyBool.COLLAPSE_SAVED_SEARCHES)
      ]);
      this.侧边栏牌组折叠 = 折叠状态[0];
      this.侧边栏标签折叠 = 折叠状态[1];
      this.侧边栏已保存搜索折叠 = 折叠状态[2];
    } catch (错误) {
      console.info(`BrowserPage: 加载侧边栏折叠状态失败 错误=${错误}`);
    }
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
    this.搜索文本 = `tag:"${标签名}"`;
    this.显示侧边栏 = false;
    this.执行搜索();
  }

  /** 侧边栏点已保存搜索 → 替换搜索文本为已保存的搜索串。 */
  private 选已保存搜索(搜索串: string): void {
    this.搜索文本 = 搜索串;
    this.显示侧边栏 = false;
    this.执行搜索();
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
    const 条件: string = `tag:"${标签名}"`;
    this.搜索文本 = this.搜索文本 === '' ? 条件 : `${this.搜索文本} ${条件}`;
    this.显示侧边栏 = false;
    this.执行搜索();
  }

  // ========================================================
  // @名称 T6 标签管理
  //
  // @作用
  // 侧边栏长按标签弹操作菜单（追加搜索/重命名/删除/补全），
  // 重命名弹自定义对话框收集新名，删除弹 AlertDialog 二次确认，
  // 补全直接调用后端。操作后刷新标签树。
  //
  // @业务规则
  // - 重命名：currentPrefix=原标签名，newPrefix=用户输入
  // - 删除：按前缀删除标签及子标签，返回受影响笔记数
  // - 补全：input=标签名，matchLimit=20，返回匹配列表（当前仅 toast 结果）
  // - 操作成功后刷新标签树，失败在标签重命名错误条或 toast 显示
  //
  // @副作用
  // 调后端 标签服务.重命名标签 / 移除标签 / 补全标签；修改 Anki collection。
  // ========================================================

  /** 标签菜单「重命名」→ 打开重命名对话框。 */
  private 请求重命名标签(标签名: string): void {
    if (this.operations.isBusy()) return;
    this.重命名原标签名 = 标签名;
    this.重命名新标签名 = 标签名;
    this.标签重命名错误 = '';
    this.标签重命名忙碌 = false;
    this.显示标签重命名 = true;
  }

  /** 执行重命名标签：调后端 RenameTags，成功后刷新标签树。 */
  private async 执行重命名标签(): Promise<void> {
    if (this.operations.isBusy()) return;
    const original: string = this.重命名原标签名;
    const name: string = this.重命名新标签名;
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
        this.显示侧边栏 = false;
        this.标签树 = null;
      }
    }, (_error: Error): void => {
      this.标签重命名错误 = this.取本地化文案($r('app.string.browser_tag_rename_error'));
    }, false);
    if (!this.operations.isAlive()) return;
    this.标签重命名忙碌 = false;
    if (done) this.getUIContext().getPromptAction().showToast({
      message: this.取本地化文案($r('app.string.browser_tag_rename_success')).replace('%d', String(count))
    });
  }

  /** 标签菜单「删除」→ 弹 AlertDialog 二次确认。 */
  private 请求删除标签(标签名: string): void {
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
    this.标签操作忙碌 = true;
    let count: number = 0;
    const done: boolean = await this.runBrowserOperation(async (_selection: BrowserOperationContext): Promise<void> => {
      count = await this.标签服务实例.移除标签(标签名);
      if (this.operations.isAlive()) { this.显示侧边栏 = false; this.标签树 = null; }
    }, (_error: Error): void => {
      this.getUIContext().getPromptAction().showToast({
        message: this.取本地化文案($r('app.string.browser_tag_delete_error'))
      });
    }, false);
    if (!this.operations.isAlive()) return;
    this.标签操作忙碌 = false;
    if (done) this.getUIContext().getPromptAction().showToast({
      message: this.取本地化文案($r('app.string.browser_tag_delete_success')).replace('%d', String(count))
    });
  }

  /** 标签菜单「补全」→ 调后端 CompleteTag，toast 显示匹配结果。 */
  private async 执行补全标签(标签名: string): Promise<void> {
    this.标签操作忙碌 = true;
    try {
      const 响应 = await this.标签服务实例.补全标签({ input: 标签名, matchLimit: 20 });
      const count: number = 响应.tags.length;
      this.getUIContext().getPromptAction().showToast({
        message: this.取本地化文案($r('app.string.browser_tag_complete_success')).replace('%d', String(count))
      });
    } catch (错误) {
      console.info(`BrowserPage: 补全标签失败 错误=${错误}`);
      this.getUIContext().getPromptAction().showToast({
        message: this.取本地化文案($r('app.string.browser_tag_complete_error'))
      });
    }
    this.标签操作忙碌 = false;
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

  /** 顶栏选中计数：使用可变长字符串，让两位及以上数量自然撑宽同款按钮。 */
  private 取选中计数文案(): string {
    const 模板: string = this.取本地化文案($r('app.string.browser_select_count'));
    return `${模板.replace('%d', `${this.选中ID列表.length}`)} ×`;
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

  /** 选择框直接列出两个方向，避免二级菜单向侧边展开。 */
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

  /** 复用查找替换入口，并提供三种副标题显示方式。 */
  private browserMoreMenu(): MenuElement[] {
    const items: MenuElement[] = [{
      value: this.取本地化文案(this.搜索文本.trim() === '' ? $r('app.string.browser_action_sidebar') :
        $r('app.string.browser_filter_active')),
      enabled: this.阶段 === 'list',
      action: (): void => {
        if (this.阶段 !== 'list') { return; }
        this.侧边栏错误 = '';
        this.打开侧边栏();
      }
    }, {
      value: this.取本地化文案($r('app.string.browser_action_find_replace')),
      enabled: this.阶段 === 'list',
      action: (): void => { if (this.operations.isBusy()) return; this.查找替换错误 = ''; this.显示查找替换 = true; }
    }];
    const indices: number[] = [1, 4, 2];
    const labels: Resource[] = [$r('app.string.browser_subtitle_deck'),
      $r('app.string.browser_subtitle_answer'), $r('app.string.browser_subtitle_due')];
    for (let index = 0; index < indices.length; index++) {
      const cellIndex: number = indices[index];
      items.push({
        value: `${this.取本地化文案(labels[index])}${this.subtitleIndex === cellIndex ? ' ✓' : ''}`,
        action: (): void => { this.subtitleIndex = cellIndex; }
      });
    }
    return items;
  }

  /** 数量使用完整 ID 结果，区分卡片与笔记。 */
  private resultCountLabel(): string {
    const resource: Resource = this.浏览模式值 === 'cards' ? $r('app.string.browser_result_cards') :
      $r('app.string.browser_result_notes');
    return this.取本地化文案(resource).replace('%d', `${this.结果ID列表.length}`);
  }

  @Builder
  private 顶部条() {
    // 普通模式提供返回和更多；多选模式沿用选中计数退出按钮。
    Stack({ alignContent: Alignment.Center }) {
      Text($r('app.string.browser_title'))
        .fontSize(应用尺寸.字号_标题).fontWeight(FontWeight.Medium)
        .fontColor($r('app.color.text_primary')).width('44%').textAlign(TextAlign.Center)
        .maxLines(1).hitTestBehavior(HitTestMode.None)
      Row() {
      按下态按钮({
        文案: $r('app.string.study_back'),
        字色: $r('app.color.text_primary'),
        点击回调: (): void => this.返回()
      })

      Blank()
      if (this.多选模式值) {

        按下态按钮({
          文案: this.取选中计数文案(),
          字色: $r('app.color.text_primary'),
          点击回调: (): void => this.退出多选()
        })
      } else {


        Button($r('app.string.study_more'))
          .height(应用尺寸.按钮高度)
          .padding({ left: 应用尺寸.卡片内边距, right: 应用尺寸.卡片内边距 })
          .fontSize(应用尺寸.字号_按钮)
          .fontColor($r('app.color.text_primary'))
          .backgroundColor($r('app.color.surface_card'))
          .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
          .borderRadius(应用尺寸.圆角_胶囊)
          .bindMenu(this.browserMoreMenu())
      }
      }.width('100%').height('100%').alignItems(VerticalAlign.Center)
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
    .alignContent(Alignment.Center)
  }

  /** 状态筛选保留原始搜索，放入选择框以留出列表空间。 */
  private quickFilterOptions(): SelectOption[] {
    return BROWSER_QUICK_FILTERS.map((filter: BrowserQuickFilter): SelectOption => ({
      value: this.getUIContext().getHostContext()!.resourceManager.getStringByNameSync(filter.labelKey)
    }));
  }

  private quickFilterIndex(): number {
    return Math.max(0, BROWSER_QUICK_FILTERS.findIndex((filter: BrowserQuickFilter): boolean =>
      filter.id === this.quickFilter));
  }

  @Builder
  private browserControls() {
    Row({ space: 8 }) {
      Select(this.quickFilterOptions())
        .selected(this.quickFilterIndex()).value(this.quickFilterOptions()[this.quickFilterIndex()].value)
        .controlSize(ControlSize.SMALL).font({ size: 应用尺寸.字号_正文 })
        .menuAlign(MenuAlignType.START)
        .height(40).enabled(!this.多选模式值)
        .onSelect((index: number): void => {
          this.quickFilter = BROWSER_QUICK_FILTERS[index].id;
          this.执行搜索();
        })
      Text(this.阶段 === 'loading' ? $r('app.string.browser_loading') : this.resultCountLabel())
        .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary'))
        .layoutWeight(1).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
      Select(this.sortOptions())
        .selected(this.sortIndex()).value(this.sortLabel())
        .controlSize(ControlSize.SMALL).font({ size: 应用尺寸.字号_正文 })
        .menuAlign(MenuAlignType.END)
        .height(40).constraintSize({ maxWidth: '42%' })
        .enabled(!this.多选模式值 && this.阶段 === 'list')
        .onSelect((index: number): void => { this.selectSort(index); })
    }.width('100%')
      .padding({ left: 应用尺寸.页面内边距_水平, right: 应用尺寸.页面内边距_水平, bottom: 6 })
  }

  build() {
    NavDestination() {
      Stack() {
        Column() {
          this.顶部条()

          // 搜索框组件（TextInput + Cards/Notes 模式切换）
          搜索框({
            搜索文本: this.搜索文本,
            浏览模式值: this.浏览模式值,
            onSearch: (文本: string): void => { this.提交搜索(文本); },
            onModeChange: (模式: string): void => { this.切换模式(模式 as 浏览模式); }
          })
            .padding({ left: 应用尺寸.页面内边距_水平, right: 应用尺寸.页面内边距_水平,
              top: 应用尺寸.pageContentTopInset,
              bottom: 应用尺寸.间距_8 })

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
              结果总数: this.结果ID列表.length,
              已加载行数: this.consumedRowCount,
              初始多选模式: this.pageSelectForAgentEdit,
              onRowClick: (行ID: number): void => { this.行点击处理(行ID); },
              onLongPress: (): void => {},
              onLoadMore: (): void => { this.加载更多(); },
              onInfoClick: (行ID: number): void => { this.打开卡片信息(行ID); },
              onSelectionChange: (选中IDs: number[]): void => { this.selectionVersion++; this.选中ID列表 = 选中IDs.slice(); },
              onMultiSelectChange: (多选: boolean): void => { this.多选模式值 = 多选; },
              退出多选信号: this.退出多选信号
            })
          }

          // T8 批量操作栏：多选模式下固定在底部
          if (this.多选模式值 && this.选中ID列表.length > 0) {
            批量操作栏({
              isDark: this.是否深色(),
              busy: this.批量忙碌 || this.mutationBusy,
              选中数: this.选中ID列表.length,
              on改牌组: (): void => { this.打开改牌组弹层(); },
              on设置标志: (): void => {
                this.批量错误 = '';
                this.显示标志弹层 = true;
              },
              on挂起: (): void => {
                this.批量错误 = '';
                this.显示挂起确认 = true;
              },
              on恢复: (): void => {
                this.批量错误 = '';
                this.执行批量恢复();
              },
              on删除: (): void => {
                this.批量错误 = '';
                this.显示删除确认 = true;
              },
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

        // T5 卡片预览弹层：Cards 模式下点击行 → 全屏预览正反面；底部「编辑字段」→ 打开编辑区
        if (this.显示预览) {
          卡片预览页({
            isDark: this.是否深色(),
            卡片ID列表: this.previewCardIds,
            初始索引: this.预览初始索引,
            媒体目录: this.预览媒体目录,
            刷新版本: this.预览刷新版本,
            interactionEnabled: !this.显示编辑区 && !this.编辑区忙碌,
            onClose: (): void => {
              this.显示预览 = false;
            },
            onEditField: (卡片ID: number): void => {
              this.打开编辑区For(卡片ID);
            }
          })
        }

        // T7 浏览编辑区弹层：Stack + if 控制挂载/卸载（与 添加笔记页.ets 的 字段帮助面板/图片遮罩编辑器 同机制）
        if (this.显示编辑区) {
          浏览编辑区({
            isDark: this.是否深色(),
            busy: this.编辑区忙碌 || this.mutationBusy,
            errorMessage: this.编辑区错误,
            fieldNames: this.编辑区字段名列表,
            initialFieldValues: this.编辑区初始字段值,
            initialTags: this.编辑区初始标签,
            onCancel: (): void => {
              this.显示编辑区 = false;
              this.编辑区当前笔记 = null;
            },
            onSave: (fields: string[], tags: string[]): Promise<boolean> => {
              return this.保存编辑(fields, tags);
            }
          })
        }

        // T11 卡片信息弹层：非多选模式下点击行右侧 info 按钮 → 懒加载 CardStatsView
        if (this.显示卡片信息) {
          卡片信息({
            isDark: this.是否深色(),
            stats: this.卡片信息数据,
            errorMessage: this.卡片信息忙碌 && this.卡片信息错误 === ''
              ? this.取本地化文案($r('app.string.browser_info_loading'))
              : this.卡片信息错误,
            onClose: (): void => {
              this.关闭卡片信息();
            }
          })
        }

        // T9 查找替换弹层：顶部条按钮触发，支持仅选中笔记或全部笔记两种范围
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
            onAppendDeck: (牌组名: string): void => { this.追加牌组条件(牌组名); },
            onAppendTag: (标签名: string): void => { this.追加标签条件(标签名); },
            onRenameTag: (标签名: string): void => { this.请求重命名标签(标签名); },
            onDeleteTag: (标签名: string): void => { this.请求删除标签(标签名); },
            onCompleteTag: (标签名: string): void => { this.执行补全标签(标签名); },
            onToggle折叠: (分区: 'decks' | 'tags' | 'saved_searches'): void => {
              this.切换侧边栏折叠(分区);
            }
          })
        }

        // T6 标签重命名对话框：侧边栏长按标签 → 重命名 → 弹此对话框
        if (this.显示标签重命名) {
          Stack() {
            Column()
              .width('100%')
              .height('100%')
              .backgroundColor(this.是否深色() ? 'rgba(0,0,0,0.40)' : 'rgba(0,0,0,0.15)')
              .onClick((): void => {
                if (!this.标签重命名忙碌) { this.显示标签重命名 = false; }
              })

            Column({ space: 应用尺寸.间距_14 }) {
              DialogHeader({
                title: $r('app.string.browser_tag_rename_title'),
                closeLabel: $r('app.string.browser_detail_cancel'),
                closeEnabled: !this.标签重命名忙碌,
                onClose: (): void => {
                  this.显示标签重命名 = false;
                },
                actionLabel: this.标签重命名忙碌 ? $r('app.string.browser_tag_rename_running') : $r('app.string.browser_detail_confirm'),
                actionEnabled: !this.标签重命名忙碌,
                onAction: (): void => {
                  this.执行重命名标签();
                }
              })

              Column({ space: 应用尺寸.间距_4 }) {
                Text($r('app.string.browser_tag_rename_current'))
                  .fontSize(应用尺寸.字号_正文_小)
                  .fontColor($r('app.color.text_secondary'))
                Text(this.重命名原标签名)
                  .fontSize(应用尺寸.字号_正文)
                  .fontColor($r('app.color.text_primary'))
                  .width('100%')
              }
              .width('100%')
              .alignItems(HorizontalAlign.Start)

              Column({ space: 应用尺寸.间距_4 }) {
                Text($r('app.string.browser_tag_rename_new'))
                  .fontSize(应用尺寸.字号_正文_小)
                  .fontColor($r('app.color.text_secondary'))
                TextInput({ text: this.重命名新标签名, placeholder: this.取本地化文案($r('app.string.browser_tag_rename_placeholder')) })
                  .fontSize(应用尺寸.字号_正文)
                  .fontColor($r('app.color.text_primary'))
                  .backgroundColor($r('app.color.surface_page'))
                  .borderRadius(应用尺寸.圆角_面板)
                  .height(应用尺寸.按钮高度)
                  .width('100%')
                  .enabled(!this.标签重命名忙碌)
                  .onChange((值: string): void => {
                    this.重命名新标签名 = 值;
                  })
              }
              .width('100%')
              .alignItems(HorizontalAlign.Start)

              if (this.标签重命名错误 !== '') {
                Text(this.标签重命名错误)
                  .fontSize(应用尺寸.字号_正文_小)
                  .fontColor($r('app.color.error_text'))
                  .width('100%')
              }

            }
            .width('85%')
            .constraintSize({ maxWidth: 460 })
            .padding(应用尺寸.卡片内边距)
            .backgroundColor($r('app.color.surface_card'))
            .borderRadius(应用尺寸.圆角_卡片)
          }
        }

        // T8 改牌组选择器弹层
        if (this.显示改牌组弹层) {
          Stack() {
            Column()
              .width('100%')
              .height('100%')
              .backgroundColor(this.是否深色() ? 'rgba(0,0,0,0.40)' : 'rgba(0,0,0,0.15)')
              .onClick((): void => {
                if (!this.批量忙碌) { this.显示改牌组弹层 = false; }
              })

            Column({ space: 应用尺寸.间距_14 }) {
              DialogHeader({
                title: $r('app.string.browser_action_change_deck'),
                showClose: false,
                actionLabel: $r('app.string.browser_detail_cancel'),
                actionEnabled: !this.批量忙碌,
                onAction: (): void => { this.显示改牌组弹层 = false; }
              })

              Scroll() {
                Column({ space: 应用尺寸.间距_4 }) {
                  if (this.牌组树 !== null) {
                    ForEach(this.扁平化牌组树为列表(), (项: 牌组项) => {
                      Text(项.名)
                        .fontSize(应用尺寸.字号_正文)
                        .fontColor($r('app.color.text_primary'))
                        .padding({ left: 应用尺寸.间距_16, right: 应用尺寸.间距_16,
                          top: 应用尺寸.间距_12, bottom: 应用尺寸.间距_12 })
                        .width('100%')
                        .borderRadius(应用尺寸.圆角_面板)
                        .backgroundColor($r('app.color.surface_page'))
                        .onClick((): void => { this.执行批量改牌组(项.id); })
                    }, (项: 牌组项): string => `${项.id}`)
                  }
                }
                .width('100%')
              }
              .width('100%')
              .layoutWeight(1)
              .scrollBar(BarState.Auto)
              .edgeEffect(EdgeEffect.Spring)

            }
            .width('88%')
            .constraintSize({ maxWidth: 520, maxHeight: '80%' })
            .padding(应用尺寸.卡片内边距)
            .backgroundColor($r('app.color.surface_card'))
            .borderRadius(应用尺寸.圆角_卡片)
          }
        }

        // T8 标志选择器弹层（无/红/橙/绿/蓝）
        if (this.显示标志弹层) {
          Stack() {
            Column()
              .width('100%')
              .height('100%')
              .backgroundColor(this.是否深色() ? 'rgba(0,0,0,0.40)' : 'rgba(0,0,0,0.15)')
              .onClick((): void => {
                if (!this.批量忙碌) { this.显示标志弹层 = false; }
              })

            Column({ space: 应用尺寸.间距_14 }) {
              DialogHeader({
                title: $r('app.string.browser_action_set_flag'),
                showClose: false,
                actionLabel: $r('app.string.browser_detail_cancel'),
                actionEnabled: !this.批量忙碌,
                onAction: (): void => { this.显示标志弹层 = false; }
              })

              ForEach([0, 1, 2, 3, 4], (flag: number) => {
                Row({ space: 应用尺寸.间距_12 }) {
                  // 标志色块：0=无（透明圆环）/1=红/2=橙/3=绿/4=蓝
                  Row()
                    .width(16)
                    .height(16)
                    .borderRadius(8)
                    .backgroundColor(this.标志颜色(flag))
                    .border({ width: flag === 0 ? 1 : 0, color: $r('app.color.border_input') })
                  Text(this.标志文案(flag))
                    .fontSize(应用尺寸.字号_按钮)
                    .fontColor($r('app.color.text_primary'))
                    .layoutWeight(1)
                }
                .width('100%')
                .height(应用尺寸.按钮高度)
                .padding({ left: 应用尺寸.间距_16, right: 应用尺寸.间距_16 })
                .borderRadius(应用尺寸.圆角_胶囊)
                .backgroundColor($r('app.color.surface_page'))
                .enabled(!this.批量忙碌)
                .onClick((): void => { this.执行批量设置标志(flag); })
              }, (flag: number): string => `${flag}`)

            }
            .width('78%')
            .constraintSize({ maxWidth: 420 })
            .padding(应用尺寸.卡片内边距)
            .backgroundColor($r('app.color.surface_card'))
            .borderRadius(应用尺寸.圆角_卡片)
          }
        }

        // T8 挂起确认弹层
        if (this.显示挂起确认) {
          Stack() {
            Column()
              .width('100%')
              .height('100%')
              .backgroundColor(this.是否深色() ? 'rgba(0,0,0,0.40)' : 'rgba(0,0,0,0.15)')
              .onClick((): void => {
                if (!this.批量忙碌) { this.显示挂起确认 = false; }
              })

            Column({ space: 应用尺寸.间距_14 }) {
              DialogHeader({
                title: $r('app.string.browser_action_suspend'),
                closeLabel: $r('app.string.browser_detail_cancel'),
                closeEnabled: !this.批量忙碌,
                onClose: (): void => { this.显示挂起确认 = false; },
                actionLabel: $r('app.string.browser_detail_confirm'),
                actionEnabled: !this.批量忙碌,
                onAction: (): void => { this.执行批量挂起(); },
                destructive: false
              })
              Text($r('app.string.browser_action_suspend_confirm'))
                .fontSize(应用尺寸.字号_正文)
                .fontColor($r('app.color.text_primary'))
                .width('100%')

            }
            .width('78%')
            .constraintSize({ maxWidth: 420 })
            .padding(应用尺寸.卡片内边距)
            .backgroundColor($r('app.color.surface_card'))
            .borderRadius(应用尺寸.圆角_卡片)
          }
        }

        // T8 删除确认弹层
        if (this.显示删除确认) {
          Stack() {
            Column()
              .width('100%')
              .height('100%')
              .backgroundColor(this.是否深色() ? 'rgba(0,0,0,0.40)' : 'rgba(0,0,0,0.15)')
              .onClick((): void => {
                if (!this.批量忙碌) { this.显示删除确认 = false; }
              })

            Column({ space: 应用尺寸.间距_14 }) {
              DialogHeader({
                title: $r('app.string.browser_action_delete'),
                closeLabel: $r('app.string.browser_detail_cancel'),
                closeEnabled: !this.批量忙碌,
                onClose: (): void => { this.显示删除确认 = false; },
                actionLabel: $r('app.string.browser_detail_confirm'),
                actionEnabled: !this.批量忙碌,
                onAction: (): void => { this.执行批量删除(); },
                destructive: true
              })
              Text($r('app.string.browser_action_delete_confirm'))
                .fontSize(应用尺寸.字号_正文)
                .fontColor($r('app.color.text_primary'))
                .width('100%')

            }
            .width('78%')
            .constraintSize({ maxWidth: 420 })
            .padding(应用尺寸.卡片内边距)
            .backgroundColor($r('app.color.surface_card'))
            .borderRadius(应用尺寸.圆角_卡片)
          }
        }

        // T8 设置到期日弹层：TextInput 输入 days 字符串
        if (this.显示到期日弹层) {
          Stack() {
            Column()
              .width('100%')
              .height('100%')
              .backgroundColor(this.是否深色() ? 'rgba(0,0,0,0.40)' : 'rgba(0,0,0,0.15)')
              .onClick((): void => {
                if (!this.批量忙碌) { this.显示到期日弹层 = false; }
              })

            Column({ space: 应用尺寸.间距_14 }) {
              DialogHeader({
                title: $r('app.string.browser_action_set_due'),
                closeLabel: $r('app.string.browser_detail_cancel'),
                closeEnabled: !this.批量忙碌,
                onClose: (): void => { this.显示到期日弹层 = false; },
                actionLabel: $r('app.string.browser_detail_confirm'),
                actionEnabled: !this.批量忙碌 && this.到期日输入.trim() !== '',
                onAction: (): void => { this.执行批量设置到期日(); }
              })

              Text($r('app.string.browser_action_set_due_hint'))
                .fontSize(应用尺寸.字号_正文_小)
                .fontColor($r('app.color.text_secondary'))
                .width('100%')

              TextInput({ text: this.到期日输入, placeholder: $r('app.string.browser_action_set_due_placeholder') })
                .width('100%')
                .height(应用尺寸.按钮高度)
                .fontSize(应用尺寸.字号_正文)
                .fontColor($r('app.color.text_primary'))
                .backgroundColor($r('app.color.surface_page'))
                .borderRadius(应用尺寸.圆角_面板)
                .enabled(!this.批量忙碌)
                .onChange((值: string): void => { this.到期日输入 = 值; })

            }
            .width('78%')
            .constraintSize({ maxWidth: 420 })
            .padding(应用尺寸.卡片内边距)
            .backgroundColor($r('app.color.surface_card'))
            .borderRadius(应用尺寸.圆角_卡片)
          }
        }

        // T8 重新定位弹层：起始位置/步长/随机/顺移已有
        if (this.显示重新定位弹层) {
          Stack() {
            Column()
              .width('100%')
              .height('100%')
              .backgroundColor(this.是否深色() ? 'rgba(0,0,0,0.40)' : 'rgba(0,0,0,0.15)')
              .onClick((): void => {
                if (!this.批量忙碌) { this.显示重新定位弹层 = false; }
              })

            Column({ space: 应用尺寸.间距_14 }) {
              DialogHeader({
                title: $r('app.string.browser_action_reposition'),
                closeLabel: $r('app.string.browser_detail_cancel'),
                closeEnabled: !this.批量忙碌,
                onClose: (): void => { this.显示重新定位弹层 = false; },
                actionLabel: $r('app.string.browser_detail_confirm'),
                actionEnabled: !this.批量忙碌,
                onAction: (): void => { this.执行批量重新定位(); }
              })

              Row({ space: 应用尺寸.间距_12 }) {
                Text($r('app.string.browser_action_reposition_start'))
                  .fontSize(应用尺寸.字号_正文)
                  .fontColor($r('app.color.text_primary'))
                  .layoutWeight(1)
                TextInput({ text: this.重新定位起始.toString() })
                  .width(80)
                  .height(应用尺寸.按钮高度)
                  .fontSize(应用尺寸.字号_正文)
                  .fontColor($r('app.color.text_primary'))
                  .backgroundColor($r('app.color.surface_page'))
                  .borderRadius(应用尺寸.圆角_面板)
                  .enabled(!this.批量忙碌)
                  .type(InputType.Number)
                  .onChange((值: string): void => {
                    const n: number = Number.parseInt(值, 10);
                    if (Number.isFinite(n) && n >= 0) { this.重新定位起始 = n; }
                  })
              }
              .width('100%')

              Row({ space: 应用尺寸.间距_12 }) {
                Text($r('app.string.browser_action_reposition_step'))
                  .fontSize(应用尺寸.字号_正文)
                  .fontColor($r('app.color.text_primary'))
                  .layoutWeight(1)
                TextInput({ text: this.重新定位步长.toString() })
                  .width(80)
                  .height(应用尺寸.按钮高度)
                  .fontSize(应用尺寸.字号_正文)
                  .fontColor($r('app.color.text_primary'))
                  .backgroundColor($r('app.color.surface_page'))
                  .borderRadius(应用尺寸.圆角_面板)
                  .enabled(!this.批量忙碌)
                  .type(InputType.Number)
                  .onChange((值: string): void => {
                    const n: number = Number.parseInt(值, 10);
                    if (Number.isFinite(n) && n >= 0) { this.重新定位步长 = n; }
                  })
              }
              .width('100%')

              Row({ space: 应用尺寸.间距_12 }) {
                Text($r('app.string.browser_action_reposition_random'))
                  .fontSize(应用尺寸.字号_正文)
                  .fontColor($r('app.color.text_primary'))
                  .layoutWeight(1)
                Toggle({ type: ToggleType.Switch, isOn: this.重新定位随机 })
                  .enabled(!this.批量忙碌)
                  .onChange((开: boolean): void => { this.重新定位随机 = 开; })
              }
              .width('100%')

              Row({ space: 应用尺寸.间距_12 }) {
                Text($r('app.string.browser_action_reposition_shift'))
                  .fontSize(应用尺寸.字号_正文)
                  .fontColor($r('app.color.text_primary'))
                  .layoutWeight(1)
                Toggle({ type: ToggleType.Switch, isOn: this.重新定位顺移 })
                  .enabled(!this.批量忙碌)
                  .onChange((开: boolean): void => { this.重新定位顺移 = 开; })
              }
              .width('100%')

            }
            .width('78%')
            .constraintSize({ maxWidth: 420 })
            .padding(应用尺寸.卡片内边距)
            .backgroundColor($r('app.color.surface_card'))
            .borderRadius(应用尺寸.圆角_卡片)
          }
        }

        // T8 更改笔记类型弹层：选新类型 + 字段/模板映射
        if (this.显示笔记类型弹层) {
          Stack() {
            Column()
              .width('100%')
              .height('100%')
              .backgroundColor(this.是否深色() ? 'rgba(0,0,0,0.40)' : 'rgba(0,0,0,0.15)')
              .onClick((): void => {
                if (!this.笔记类型弹层忙碌 && !this.批量忙碌) { this.显示笔记类型弹层 = false; }
              })

            Column({ space: 应用尺寸.间距_14 }) {
              DialogHeader({
                title: $r('app.string.browser_action_change_notetype'),
                closeLabel: $r('app.string.browser_detail_cancel'),
                closeEnabled: !this.批量忙碌 && !this.笔记类型弹层忙碌,
                onClose: (): void => { this.显示笔记类型弹层 = false; },
                actionLabel: $r('app.string.browser_detail_confirm'),
                actionEnabled: !this.批量忙碌 && !this.笔记类型弹层忙碌 && this.变更笔记类型信息数据 !== null,
                onAction: (): void => { this.执行批量更改笔记类型(); }
              })

              if (this.笔记类型弹层忙碌) {
                Text($r('app.string.browser_action_change_notetype_loading'))
                  .fontSize(应用尺寸.字号_正文)
                  .fontColor($r('app.color.text_secondary'))
                  .width('100%')
              } else {
                // 选择新笔记类型
                Text($r('app.string.browser_action_change_notetype_new'))
                  .fontSize(应用尺寸.字号_正文)
                  .fontColor($r('app.color.text_primary'))
                  .width('100%')
                Select(this.笔记类型列表.map((项: NotetypeNameId): SelectOption => {
                  return { value: 项.name };
                }))
                  .selected(this.选中新笔记类型ID === 0 ? -1 : this.笔记类型列表.findIndex(
                    (项: NotetypeNameId): boolean => 项.id === this.选中新笔记类型ID))
                  .value(this.选中新笔记类型ID === 0 ? '' :
                    this.笔记类型列表.find((项: NotetypeNameId): boolean => 项.id === this.选中新笔记类型ID)?.name ?? '')
                  .width('100%')
                  .height(应用尺寸.按钮高度)
                  .fontColor($r('app.color.text_primary'))
                  .selectedOptionFontColor($r('app.color.action_on_primary'))
                  .selectedOptionBgColor(this.主色容器色)
                  .onSelect((索引: number): void => {
                    const 项: NotetypeNameId = this.笔记类型列表[索引];
                    this.选中新笔记类型ID = 项.id;
                    this.加载变更笔记类型信息(项.id);
                  })

                // 字段/模板映射表（仅在加载完变更信息后显示）
                if (this.变更笔记类型信息数据 !== null) {
                  Text($r('app.string.browser_action_change_notetype_field_map'))
                    .fontSize(应用尺寸.字号_正文)
                    .fontColor($r('app.color.text_primary'))
                    .fontWeight(FontWeight.Medium)
                    .width('100%')
                  ForEach(this.变更笔记类型信息数据.newFieldNames, (字段名: string, 索引: number) => {
                    Row({ space: 应用尺寸.间距_8 }) {
                      Text(字段名)
                        .fontSize(应用尺寸.字号_正文_小)
                        .fontColor($r('app.color.text_primary'))
                        .layoutWeight(1)
                      Select(this.构建映射选项列表(this.变更笔记类型信息数据!.oldFieldNames))
                        .selected(this.字段映射[索引] === -1 ? 0 : this.字段映射[索引] + 1)
                        .value(this.字段映射[索引] === -1 ?
                          this.取本地化文案($r('app.string.browser_action_change_notetype_no_map')) :
                          this.变更笔记类型信息数据!.oldFieldNames[this.字段映射[索引]])
                        .width('50%')
                        .height(应用尺寸.按钮高度)
                        .fontColor($r('app.color.text_primary'))
                        .onSelect((选索引: number): void => {
                          // 选索引 0=不映射(-1)，1..N=旧字段 ord
                          const 新值: number = 选索引 === 0 ? -1 : 选索引 - 1;
                          const 新映射: number[] = this.字段映射.slice();
                          新映射[索引] = 新值;
                          this.字段映射 = 新映射;
                        })
                    }
                    .width('100%')
                  }, (字段名: string, 索引: number): string => `${字段名}-${索引}`)

                  // 模板映射（仅当新笔记类型有模板时显示）
                  if (this.变更笔记类型信息数据!.newTemplateNames.length > 0) {
                    Text($r('app.string.browser_action_change_notetype_template_map'))
                      .fontSize(应用尺寸.字号_正文)
                      .fontColor($r('app.color.text_primary'))
                      .fontWeight(FontWeight.Medium)
                      .width('100%')
                    ForEach(this.变更笔记类型信息数据!.newTemplateNames, (模板名: string, 索引: number) => {
                      Row({ space: 应用尺寸.间距_8 }) {
                        Text(模板名)
                          .fontSize(应用尺寸.字号_正文_小)
                          .fontColor($r('app.color.text_primary'))
                          .layoutWeight(1)
                        Select(this.构建映射选项列表(this.变更笔记类型信息数据!.oldTemplateNames))
                          .selected(this.模板映射[索引] === -1 ? 0 : this.模板映射[索引] + 1)
                          .value(this.模板映射[索引] === -1 ?
                            this.取本地化文案($r('app.string.browser_action_change_notetype_no_map')) :
                            this.变更笔记类型信息数据!.oldTemplateNames[this.模板映射[索引]])
                          .width('50%')
                          .height(应用尺寸.按钮高度)
                          .fontColor($r('app.color.text_primary'))
                          .onSelect((选索引: number): void => {
                            const 新值: number = 选索引 === 0 ? -1 : 选索引 - 1;
                            const 新映射: number[] = this.模板映射.slice();
                            新映射[索引] = 新值;
                            this.模板映射 = 新映射;
                          })
                      }
                      .width('100%')
                    }, (模板名: string, 索引: number): string => `${模板名}-${索引}`)
                  }
                }
              }

            }
            .width('88%')
            .constraintSize({ maxWidth: 520, maxHeight: '80%' })
            .padding(应用尺寸.卡片内边距)
            .backgroundColor($r('app.color.surface_card'))
            .borderRadius(应用尺寸.圆角_卡片)
          }
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
    .opacity(this.转场透明度)
  }
}
