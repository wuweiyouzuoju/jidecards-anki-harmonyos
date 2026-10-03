// SPDX-License-Identifier: AGPL-3.0-or-later
import { appInterface } from '../backend/AppInterfaceService';
import { statsInterfaceSections, visibleInterfaceItems, AppInterfaceItem, AppInterfaceControl } from '../model/AppInterface';
import { namedResourceText, resourceText } from '../utils/UiFeedback';
import { interfaceItemText } from '../utils/AppInterfaceText';
import { StatsSession, StatsSnapshot, StatsRequest } from '../model/StatsSession';
import { AnkiStatsSession } from '../backend/AnkiStatsSession';
import { SelectStyle } from '../utils/SelectStyle';
import { PAGE_SURFACE_KEY } from '../model/ThemeCatalog';
import { DECK_LIST_NARROW_KEY } from '../model/DeckListAppearance';

// 页面保留范围、布局和交互；StatsSession 拥有查询代次、偏好写入及快照发布。

import { common } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { 应用尺寸 } from '../utils/应用尺寸';
import { 颜色键 } from '../model/颜色主题';
import { 解析是否深色, 主题模式 } from '../model/主题设置';
import { 加载主题模式 } from '../model/主题存储';
import { CustomTransition } from '../utils/自定义转场';
import { 按下态按钮 } from '../components/common/按下态按钮';
import { 统计图表分区 } from '../components/stats/统计图表分区';
import { 范围切换条 } from '../components/stats/范围切换条';
import { 今日计数卡 } from '../components/stats/今日计数卡';
import { 预测卡 } from '../components/stats/预测卡';
import { 日历卡 } from '../components/stats/日历卡';
import { 复习卡 } from '../components/stats/复习卡';
import { 卡片状态分布 } from '../components/stats/卡片状态分布';
import { 小时分布卡 } from '../components/stats/小时分布卡';
import { 难度分布卡 } from '../components/stats/难度分布卡';
import { 间隔分布卡 } from '../components/stats/间隔分布卡';
import { 稳定度分布卡 } from '../components/stats/稳定度分布卡';
import { 真实保留率卡 } from '../components/stats/真实保留率卡';
import { 记忆率卡 } from '../components/stats/记忆率卡';
import { 回答按钮卡 } from '../components/stats/回答按钮卡';
import { 新增卡 } from '../components/stats/新增卡';

import { 字段帮助面板 } from '../components/字段帮助面板';
import { 加载小时分布窗口, 保存小时分布窗口, 加载统计天数, 保存统计天数 } from '../model/桌面卡片数据存储';
import { 牌组服务 } from '../backend/牌组服务';
import { 平铺牌组树 } from '../model/牌组层级';
import type { 牌组汇总 } from '../model/主页模型';
import type { DeckTreeNode } from '../proto/messages/DeckMessages';
import type { GraphsView, GraphPreferences, ReviewKindCounts } from '../proto/messages/StatsMessages';
import { Weekday } from '../proto/messages/StatsMessages';
import { FSRS_STATE_REVISION_KEY } from '../model/FSRS控制器';
import { syncActivity } from '../model/SyncSettings';

/** 统计页阶段状态机：loading=加载中，content=展示数据，error=出错 */
type 统计阶段 = 'loading' | 'content' | 'error';

/** 图表偏好默认值（后端首次无偏好时回退用）。 */
function 默认偏好(): GraphPreferences {
  return {
    calendarFirstDayOfWeek: Weekday.SUNDAY,
    cardCountsSeparateInactive: false,
    browserLinksSupported: false,
    futureDueShowBacklog: false
  };
}

@Component
export struct 统计页 {
  @StorageProp(DECK_LIST_NARROW_KEY) private narrowDeckLayout: boolean = false;
  /** 页面栈：返回主页时 pop */
  pathStack: NavPathStack = new NavPathStack();
  initialSnapshot: 统计页参数 = { graphs: null, days: 365 };
  private pageActive: boolean = false;
  private statsSession: StatsSession | null = null;

  @State @Watch('publishInterface') private 阶段: 统计阶段 = 'loading';
  @State @Watch('publishInterface') private 错误详情: string = '';
  @State @Watch('publishInterface') private 图表数据: GraphsView | null = null;
  @State private 图表偏好: GraphPreferences = 默认偏好();
  @State @Watch('normalizeTimeRanges') private 统计天数: number = 365;
  @State private forecastRange: number = 0;
  @State private todayDetailsOpen: boolean = false;
  @State private reviewsRange: number = 0;
  @State private intervalRange: number = 2;
  @State private stabilityRange: number = 2;
  @State private difficultyRange: number = 0;
  @State private retrievabilityRange: number = 0;
  @State private retentionView: number = 2;
  @State private buttonsRange: number = 2;
  @State private addedRange: number = 0;
  private readonly forecastLabels: Resource[] = [
    $r('app.string.stats_forecast_range_month'),
    $r('app.string.stats_forecast_range_quarter'),
    $r('app.string.stats_forecast_range_year'),
    $r('app.string.stats_hours_range_all')
  ];
  private readonly historyLabels: Resource[] = [
    $r('app.string.stats_hours_range_1m'),
    $r('app.string.stats_hours_range_3m'),
    $r('app.string.stats_hours_range_1y'),
    $r('app.string.stats_hours_range_all')
  ];
  private readonly intervalLabels: Resource[] = [
    $r('app.string.stats_hours_range_1m'),
    $r('app.string.stats_range_p50'),
    $r('app.string.stats_range_p95'),
    $r('app.string.stats_hours_range_all')
  ];
  private readonly percentageLabels: Resource[] = [
    $r('app.string.stats_hours_range_all'),
    $r('app.string.stats_range_p100'),
    $r('app.string.stats_range_p95'),
    $r('app.string.stats_range_p50')
  ];
  private readonly retentionLabels: Resource[] = [
    $r('app.string.stats_retention_view_young'),
    $r('app.string.stats_retention_view_mature'),
    $r('app.string.stats_retention_view_summary')
  ];
  // 牌组选择（统计内容首行左侧下拉）：索引 0 = 全部牌组（搜索串空），>0 对应 牌组名列表[索引-1]
  @State @Watch('publishInterface') private 牌组选项: SelectOption[] = [];
  @State @Watch('publishInterface') private 选中牌组索引: number = 0;
  private 牌组名列表: string[] = [];
  @StorageProp(FSRS_STATE_REVISION_KEY) @Watch('onFsrsStateChanged') private fsrsRevision: number = 0;
  private fsrsRefreshReady: boolean = false;
  // 小时分布时间段（0=近1月 1=近3月 2=近1年 3=全部）：与首页卡片/桌面卡片共用同一偏好
  @State private 小时分布窗口: number = 0;
  // 分区帮助浮层：点击各分区 i 时由 onHelp 回调设置标题/正文，页面级 Stack 统一弹字段帮助面板
  @State @Watch('publishInterface') private 显示分区帮助: boolean = false;
  @State private 分区帮助标题: Resource = $r('app.string.stats_no_data');
  @State private 分区帮助正文: Resource = $r('app.string.stats_no_data');
  /** NavDestination 透明度（由 customNavContentTransition 回调控制，实现淡入淡出转场）。 */
  @State private 转场透明度: number = 1;

  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景色: string = '#2F5FD0';
  @StorageProp(颜色键.主色容器) private 主色容器色: string = '#E8EEFC';
  @StorageProp(PAGE_SURFACE_KEY) private 页面底色微染值: string = '#F5F7FA';
  @StorageProp('状态栏高度') private 状态栏高度: number = 0;
  // 手势导航条高度（统计内容滚到底时需完整滚出导航条区域）
  @StorageProp('导航条高度') private 导航条高度: number = 0;
  @StorageLink('systemDarkMode') private 系统暗黑模式: boolean = false;
  @StorageLink('themeMode') private 主题模式值: 主题模式 = 'system';

  /** 是否深色（与浏览页同款：解析主题模式 + 系统暗黑模式） */
  private 是否深色(): boolean {
    return 解析是否深色(this.主题模式值, this.系统暗黑模式);
  }

  async aboutToAppear(): Promise<void> {
    this.pageActive = true;
    this.图表数据 = this.initialSnapshot.graphs;
    this.统计天数 = this.initialSnapshot.days;
    this.主题模式值 = AppStorage.get<主题模式>('themeMode') ?? 'system';
    // 注册自定义转场回调：首页 Navigation.customNavContentTransition 通过此 name 查找回调，
    // 在 animateTo 内调用起点/终点回调修改 转场透明度，实现淡入淡出（替代系统默认左右平移）。
    // key 用 'StatsPage'（NavPathStack pushPath 时传的 name，与 from.name / to.name 一致）。
    CustomTransition.getInstance().注册NavParam('StatsPage',
      (isPush: boolean, isExit: boolean): void => {
        this.转场透明度 = isExit ? 1 : 0;
      },
      (isPush: boolean, isExit: boolean): void => {
        this.转场透明度 = isExit ? 0 : 1;
      }
    );
    // 恢复主题模式（与浏览页同款，供 是否深色() 判断）
    this.主题模式值 = await 加载主题模式();
    // 恢复小时分布窗口选择（首页卡片/桌面卡片跟随同一偏好）
    this.小时分布窗口 = await 加载小时分布窗口();
    // 恢复统计天数（近 1 年/全部两档，首页/FSRS控制器拉 GraphsView 前加载同一偏好）
    const days: number = await 加载统计天数();
    if (!this.pageActive) return;
    if (days !== this.统计天数) this.图表数据 = null;
    this.统计天数 = days;
    this.加载牌组列表();
    this.fsrsRefreshReady = true;
    await this.加载统计数据();
  }

  aboutToDisappear(): void {
    this.pageActive = false;
    appInterface.hidePage('stats');
    appInterface.leave('stats');
    appInterface.leave('stats_sections');
    this.fsrsRefreshReady = false;
    this.statsSession?.dispose();
    CustomTransition.getInstance().注销NavParam('StatsPage');
  }

  /** 全局开关变化后重取统计快照，使状态标签和图表使用同一次后端结果。 */
  private onFsrsStateChanged(): void {
    if (this.fsrsRefreshReady) this.加载统计数据();
  }

  /** 顶部条牌组下拉选项：全部牌组 + 全库牌组全名（平铺牌组树前序） */
  private async 加载牌组列表(): Promise<void> {
    await syncActivity.waitForCollection();
    if (!this.pageActive) return;
    const 牌组服务实例 = new 牌组服务();
    牌组服务实例.获取牌组树().then((tree: DeckTreeNode) => {
      if (!this.pageActive) return;
      const 名列表: string[] = [];
      平铺牌组树(tree).forEach((行: 牌组汇总) => {
        名列表.push(行.fullName);
      });
      this.牌组名列表 = 名列表;
      const 选项: SelectOption[] = [];
      选项.push({ value: this.getUIContext().getHostContext()!.resourceManager
        .getStringSync($r('app.string.stats_deck_all').id) });
      for (let i = 0; i < 名列表.length; i++) {
        选项.push({ value: 名列表[i] } as SelectOption);
      }
      this.牌组选项 = 选项;
    }).catch((_错误: Object): void => {
      // 牌组列表加载失败时仅保留"全部牌组"，不阻塞统计
    });
  }

  /** 当前统计搜索串：全部牌组 = 空串（全库）；选中牌组 = deck:"全名" */
  private 取搜索串(): string {
    if (this.选中牌组索引 <= 0 || this.选中牌组索引 > this.牌组名列表.length) {
      return '';
    }
    const 名: string = this.牌组名列表[this.选中牌组索引 - 1];
    return `deck:"${名}"`;
  }

  /** 牌组下拉切换：重选牌组后重新加载统计 */
  private on牌组切换(索引: number): void {
    hilog.info(0xFFFE, '统计页', `牌组切换请求 索引=${索引} 旧=${this.选中牌组索引}`);
    if (索引 === this.选中牌组索引) {
      return;
    }
    this.选中牌组索引 = 索引;
    this.加载统计数据();
  }

  /** 图内偏好变更：本地即时生效 + 异步写后端（对齐 Anki autoSavingPrefs 行为） */
  private async 更新偏好(change: (old: GraphPreferences) => GraphPreferences): Promise<void> {
    await this.getStatsSession()?.updatePreferences(change);
  }

  /** 预测卡积压复选框切换（图内控件，即时落库） */
  private on积压变更(值: boolean): void {
    this.更新偏好((旧: GraphPreferences): GraphPreferences => {
      return {
        calendarFirstDayOfWeek: 旧.calendarFirstDayOfWeek,
        cardCountsSeparateInactive: 旧.cardCountsSeparateInactive,
        browserLinksSupported: 旧.browserLinksSupported,
        futureDueShowBacklog: 值
      };
    });
  }

  /** 卡片数量图分离暂停复选框切换（图内控件，即时落库） */
  private async on分离变更(值: boolean): Promise<void> {
    await this.更新偏好((旧: GraphPreferences): GraphPreferences => {
      return {
        calendarFirstDayOfWeek: 旧.calendarFirstDayOfWeek,
        cardCountsSeparateInactive: 值,
        browserLinksSupported: 旧.browserLinksSupported,
        futureDueShowBacklog: 旧.futureDueShowBacklog
      };
    });
    // 分离偏好改变卡片数量口径：立即重提卡片快照，首页摘要/桌面卡片跟随。
    // 仅全库口径推送：选中单牌组时 图表数据 为单牌组口径，推送会污染首页/桌面卡片（跳过）。
    if (this.取搜索串() === '') {
      this.刷新卡片快照().catch((): void => {});
    }
  }

  /** 日历图星期标签点击切换周首日（图内控件，即时落库） */
  private on首日变更(首日: Weekday): void {
    this.更新偏好((旧: GraphPreferences): GraphPreferences => {
      return {
        calendarFirstDayOfWeek: 首日,
        cardCountsSeparateInactive: 旧.cardCountsSeparateInactive,
        browserLinksSupported: 旧.browserLinksSupported,
        futureDueShowBacklog: 旧.futureDueShowBacklog
      };
    });
  }

  /** 全局缩为近一年时，不让已隐藏的“全部”档位残留在选择框和图表中。 */
  private normalizeTimeRanges(): void {
    if (this.统计天数 === 0) { this.publishInterface(); return; }
    if (this.forecastRange > 2) this.forecastRange = 2;
    if (this.reviewsRange > 2) this.reviewsRange = 2;
    if (this.buttonsRange > 2) this.buttonsRange = 2;
    if (this.addedRange > 2) this.addedRange = 2;
    this.publishInterface();
  }

  private interfaceSections(): AppInterfaceItem[] {
    return this.图表数据 === null ? [] : statsInterfaceSections(this.图表数据.fsrs);
  }

  private publishInterface(): void {
    if (!this.pageActive) return;
    const hasCharts: boolean = this.图表数据 !== null;
    const controls: AppInterfaceControl[] = visibleInterfaceItems('stats',
      { simple: false, agent: false, cloudDeck: false, themeHasTextures: false })
      .filter((item): boolean => item.id === 'back' || (hasCharts && (item.id !== 'deck' || this.牌组选项.length > 1)))
      .map((item): AppInterfaceControl => ({ id: item.id, title: namedResourceText(this.getUIContext(), item.titleKey),
        titleKey: item.titleKey, enabled: item.id === 'back' || this.阶段 === 'content',
        selected: item.id === 'year' ? this.统计天数 !== 0 : item.id === 'all' && this.统计天数 === 0 }));
    const options: SelectOption[] = hasCharts && this.牌组选项.length > 1 ? this.牌组选项.slice(0, 100) : [];
    const labels: string[] = options.map((option): string => typeof option.value === 'string' ? option.value.slice(0, 160) : resourceText(this.getUIContext(), option.value));
    appInterface.observe({ surface: 'stats', sectionId: '', selectedId: 'deck-' + this.选中牌组索引,
      optionIds: labels.map((_label, index): string => 'deck-' + index), optionLabels: labels,
      optionsTotal: options.length > 0 ? this.牌组选项.length : 0, busy: this.阶段 === 'loading',
      items: controls, controlsComplete: true,
      values: [{ id: 'phase', value: this.阶段 }, { id: 'days', value: String(this.统计天数) },
        { id: 'fsrs', value: hasCharts ? String(this.图表数据?.fsrs) : 'unknown' },
        { id: 'section_count', value: String(this.interfaceSections().length) },
        { id: 'help_open', value: String(this.显示分区帮助) }, { id: 'has_error', value: String(this.错误详情 !== '') }] });
    if (!hasCharts) { appInterface.leave('stats_sections'); return; }
    const sections: AppInterfaceItem[] = this.interfaceSections();
    appInterface.observe({ surface: 'stats_sections', sectionId: '', selectedId: '',
      optionIds: sections.map((item): string => item.id), optionLabels: sections.map((item): string => namedResourceText(this.getUIContext(), item.titleKey)),
      busy: this.阶段 !== 'content', controlsComplete: true, items: sections.map((item): AppInterfaceControl =>
        ({ id: item.id, title: namedResourceText(this.getUIContext(), item.titleKey), titleKey: item.titleKey,
          enabled: this.阶段 === 'content', selected: false })) });
  }

  /** 顶栏统计天数切换（对齐 Anki RangeBox：1 年=365 / 全部=0 两档，切换重新请求后端） */
  private on天数切换(天数: number): void {
    if (天数 === this.统计天数) {
      return;
    }
    this.统计天数 = 天数;
    // 本地持久化：首页/FSRS控制器拉 GraphsView 前加载同一偏好，摘要卡/桌面卡片口径一致
    保存统计天数(天数).catch((): void => {});
    this.加载统计数据();
  }

  private 取能力上下文(): common.UIAbilityContext | null {
    const context: common.UIAbilityContext | undefined =
      AppStorage.get<common.UIAbilityContext>('abilityContext');
    return context === undefined ? null : context;
  }

  private async 刷新卡片快照(): Promise<void> {
    await this.getStatsSession()?.refreshWidget(this.statsRequest());
  }

  private statsRequest(): StatsRequest {
    return { days: this.统计天数, search: this.取搜索串(), hours: this.小时分布窗口 };
  }

  private getStatsSession(): StatsSession | null {
    if (!this.pageActive) return null;
    if (this.statsSession !== null) return this.statsSession;
    const context = this.取能力上下文();
    if (context === null) { this.阶段 = 'error'; return null; }
    this.statsSession = new StatsSession(new AnkiStatsSession(context.filesDir), this.图表数据, 默认偏好(),
      (state: StatsSnapshot): void => {
        this.图表数据 = state.graphs;
        this.图表偏好 = state.preferences;
        this.阶段 = state.phase;
        this.错误详情 = state.error;
      });
    return this.statsSession;
  }

  private async 加载统计数据(): Promise<void> {
    await this.getStatsSession()?.load(this.statsRequest());
  }

  /** 返回主页。 */
  private 返回(): void {
    this.pathStack.pop();
  }

  /**
   * 分区帮助回调：统一由本页页面级 Stack 渲染字段帮助面板。
   * Invariants:
   * - 字段帮助面板必须在本页 build() Stack 顶层渲染，避免嵌套层级导致遮罩
   *   expandSafeArea 失效（曾出现：嵌套弹层时遮罩仅覆盖安全区内局部，
   *   浮层居中在遮罩中而非屏幕中央）
   * - 任何子组件（统计图表分区）的 ⓘ 按钮均通过此回调上抛，
   *   不在子组件内部渲染字段帮助面板
   */
  private on分区帮助(标题: Resource, 正文: Resource): void {
    this.分区帮助标题 = 标题;
    this.分区帮助正文 = 正文;
    this.显示分区帮助 = true;
  }

  @Builder
  private 顶部条() {
    // 与浏览页顶部条同款：左返回按钮（按下态胶囊样式 + 淡色边框）。
    // FSRS 状态位于右上角，牌组和历史范围位于内容首行。
    Stack({ alignContent: Alignment.Center }) {
      Text($r('app.string.stats_page_title'))
        .fontSize(应用尺寸.字号_标题).fontWeight(FontWeight.Medium)
        .fontColor($r('app.color.text_primary')).width('38%').textAlign(TextAlign.Center)
        .maxLines(1).hitTestBehavior(HitTestMode.None)
      Row() {
        按下态按钮({
          文案: interfaceItemText(this.getUIContext(), 'stats', 'back'),
          字色: $r('app.color.text_primary'),
          点击回调: (): void => this.返回()
        })

        Blank()

        if (this.图表数据 !== null) {
          Row() {
            Text(this.图表数据.fsrs
              ? $r('app.string.stats_fsrs_enabled')
              : $r('app.string.stats_fsrs_disabled'))
              .fontSize(应用尺寸.字号_正文_小)
              .fontColor($r('app.color.text_primary'))
          }
          .height(应用尺寸.紧凑控件高度)
          .alignItems(VerticalAlign.Center)
        }
      }
      .width('100%')
      .height('100%')
      .alignItems(VerticalAlign.Center)

    }
    .width('100%')
    .height(应用尺寸.pageToolbarHeight(this.状态栏高度, this.narrowDeckLayout))
    .alignContent(Alignment.Center)
    .padding({
      left: 应用尺寸.页面内边距_水平,
      right: 应用尺寸.页面内边距_水平,
      top: 应用尺寸.pageToolbarTop(this.状态栏高度, this.narrowDeckLayout),
      bottom: 0
    })
    .backgroundColor(this.页面底色微染值)
  }

  @Builder
  private 统计内容() {
    Scroll() {
      Column({ space: 应用尺寸.页面分组间距(this.narrowDeckLayout) }) {
        // 统计口径行：牌组选择在左，历史范围选择在右。
        Row({ space: 应用尺寸.间距_8 }) {
          if (this.牌组选项.length > 1) {
            Select(this.牌组选项)
              .selected(this.选中牌组索引)
              .value(this.牌组选项[this.选中牌组索引]?.value ?? '')
              .layoutWeight(1)
              .attributeModifier(new SelectStyle($r('app.color.surface_card')))
              .height(SelectStyle.controlHeight)
              .padding(SelectStyle.controlPadding)
              .space(SelectStyle.controlSpace)
              .font(SelectStyle.controlFont)
              .optionFont(SelectStyle.optionFont)
              .selectedOptionFont(SelectStyle.selectedOptionFont)
              .textModifier(SelectStyle.labelText())
              .borderRadius(SelectStyle.controlRadius)
              .onSelect((索引: number) => {
                this.on牌组切换(索引);
              })
          } else {
            Blank()
          }

          范围切换条({
            surfaceColor: $r('app.color.surface_card'),
            当前索引: this.统计天数 === 0 ? 1 : 0,
            标签集: [$r('app.string.stats_history_range_year'), $r('app.string.stats_history_range_all')],
            onRangeChange: (index: number): void => { this.on天数切换(index === 1 ? 0 : 365); }
          })
        }
        .width('100%')
        .alignItems(VerticalAlign.Center)

        ForEach(this.interfaceSections(), (section: AppInterfaceItem) => {
          if (section.id === 'today') {
            统计图表分区({
              interfaceId: section.id, interfaceTitleKey: section.titleKey, isInteractive: this.阶段 === 'content',

              有数据: this.图表数据 !== null && this.图表数据.today !== null,
              帮助标题: $r('app.string.stats_section_today'),
              帮助正文: $r('app.string.stats_help_today'),
              actionTitleKey: this.图表数据 !== null && this.图表数据.today !== null && this.图表数据.today.answerCount > 0
                ? 'stats_today_details' : '', actionSelected: this.todayDetailsOpen,
              onAction: (): void => { if (this.阶段 === 'content') this.todayDetailsOpen = !this.todayDetailsOpen; },
              onHelp: (title: Resource, body: Resource): void => { this.on分区帮助(title, body); }
            }) {
              今日计数卡({
                showDetails: this.todayDetailsOpen,
                今日数据: this.图表数据 !== null ? this.图表数据.today : null,
                预测数据: this.图表数据 !== null ? this.图表数据.futureDue : null
              })
            }
          }
          else if (section.id === 'forecast') {
            统计图表分区({
              interfaceId: section.id, interfaceTitleKey: section.titleKey, isInteractive: this.阶段 === 'content',
              rangeLabels: this.统计天数 === 0 ? this.forecastLabels : this.forecastLabels.slice(0, 3),
              rangeIndex: this.forecastRange,
              onRangeChange: (index: number): void => { this.forecastRange = index; },

              有数据: this.图表数据 !== null && this.图表数据.futureDue !== null,
              帮助标题: $r('app.string.stats_section_forecast'),
              帮助正文: $r('app.string.stats_help_forecast'),
              onHelp: (title: Resource, body: Resource): void => { this.on分区帮助(title, body); }
            }) {
              预测卡({
                范围索引: this.forecastRange,
                预测数据: this.图表数据 !== null ? this.图表数据.futureDue : null,
                显示积压: this.图表偏好.futureDueShowBacklog,
                是否显示全部: this.统计天数 === 0,
                on积压变更: (值: boolean): void => {
                  this.on积压变更(值);
                }
              })
            }
          }
          else if (section.id === 'calendar') {
            统计图表分区({
              interfaceId: section.id, interfaceTitleKey: section.titleKey, isInteractive: this.阶段 === 'content',

              有数据: this.图表数据 !== null && this.图表数据.reviewCountsByDaysAgo !== null,
              帮助标题: $r('app.string.stats_section_calendar'),
              帮助正文: $r('app.string.stats_help_calendar'),
              onHelp: (title: Resource, body: Resource): void => { this.on分区帮助(title, body); }
            }) {
              日历卡({
                复习计数: this.图表数据 !== null ? this.图表数据.reviewCountsByDaysAgo : null,
                周首日: this.图表偏好.calendarFirstDayOfWeek,
                统计天数: this.统计天数,
                是否深色: this.是否深色(),
                on首日变更: (首日: Weekday): void => {
                  this.on首日变更(首日);
                }
              })
            }
          }
          else if (section.id === 'reviews') {
            统计图表分区({
              interfaceId: section.id, interfaceTitleKey: section.titleKey, isInteractive: this.阶段 === 'content',
              rangeLabels: this.统计天数 === 0 ? this.historyLabels : this.historyLabels.slice(0, 3),
              rangeIndex: this.reviewsRange,
              onRangeChange: (index: number): void => { this.reviewsRange = index; },

              有数据: this.图表数据 !== null && this.图表数据.reviewCountsByDaysAgo !== null,
              帮助标题: $r('app.string.stats_section_reviews'),
              帮助正文: $r('app.string.stats_help_reviews'),
              onHelp: (title: Resource, body: Resource): void => { this.on分区帮助(title, body); }
            }) {
              复习卡({
                范围索引: this.reviewsRange,
                复习计数: this.图表数据 !== null ? this.图表数据.reviewCountsByDaysAgo : null,
                复习时间: this.图表数据 !== null ? this.图表数据.reviewTimesByDaysAgo : null,
                是否显示全部: this.统计天数 === 0
              })
            }
          }
          else if (section.id === 'card_counts') {
            统计图表分区({
              interfaceId: section.id, interfaceTitleKey: section.titleKey, isInteractive: this.阶段 === 'content',

              有数据: this.图表数据 !== null && this.图表数据.cardCounts !== null,
              帮助标题: $r('app.string.stats_section_card_counts'),
              帮助正文: $r('app.string.stats_help_card_counts'),
              onHelp: (title: Resource, body: Resource): void => { this.on分区帮助(title, body); }
            }) {
              卡片状态分布({
                卡片计数: this.图表数据 !== null ? this.图表数据.cardCounts : null,
                分离暂停: this.图表偏好.cardCountsSeparateInactive,
                on分离变更: (值: boolean): void => {
                  this.on分离变更(值);
                }
              })
            }
          }
          else if (section.id === 'interval') {
            统计图表分区({
              interfaceId: section.id, interfaceTitleKey: section.titleKey, isInteractive: this.阶段 === 'content',
              rangeLabels: this.intervalLabels,
              rangeIndex: this.intervalRange,
              onRangeChange: (index: number): void => { this.intervalRange = index; },

              有数据: this.图表数据 !== null && this.图表数据.intervals !== null,
              帮助标题: $r('app.string.stats_section_interval'),
              帮助正文: $r('app.string.stats_help_interval'),
              onHelp: (title: Resource, body: Resource): void => { this.on分区帮助(title, body); }
            }) {
              间隔分布卡({
                范围索引: this.intervalRange,
                间隔数据: this.图表数据 !== null ? this.图表数据.intervals : null
              })
            }
          }
          else if (section.id === 'stability') {
            统计图表分区({
              interfaceId: section.id, interfaceTitleKey: section.titleKey, isInteractive: this.阶段 === 'content',
              rangeLabels: this.intervalLabels,
              rangeIndex: this.stabilityRange,
              onRangeChange: (index: number): void => { this.stabilityRange = index; },

              有数据: (this.图表数据?.stability ?? null) !== null,
              帮助标题: $r('app.string.stats_section_stability'),
              帮助正文: $r('app.string.stats_help_stability'),
              onHelp: (title: Resource, body: Resource): void => { this.on分区帮助(title, body); }
            }) {
              稳定度分布卡({
                范围索引: this.stabilityRange,
                稳定度数据: this.图表数据?.stability ?? null
              })
            }
          }
          else if (section.id === 'ease') {
            统计图表分区({
              interfaceId: section.id, interfaceTitleKey: section.titleKey, isInteractive: this.阶段 === 'content',
              rangeLabels: this.图表数据 !== null && this.图表数据.fsrs ? this.percentageLabels : [],
              rangeIndex: this.difficultyRange,
              onRangeChange: (index: number): void => { this.difficultyRange = index; },

              有数据: this.图表数据 !== null
                && (this.图表数据.eases !== null || this.图表数据.difficulty !== null),
              帮助标题: $r('app.string.stats_section_ease'),
              帮助正文: $r('app.string.stats_help_ease'),
              onHelp: (title: Resource, body: Resource): void => { this.on分区帮助(title, body); }
            }) {
              难度分布卡({
                范围索引: this.difficultyRange,
                难度数据: this.图表数据 !== null ? this.图表数据.eases : null,
                FSRS难度: this.图表数据 !== null ? this.图表数据.difficulty : null,
                是否FSRS: this.图表数据 !== null ? this.图表数据.fsrs : false
              })
            }
          }
          else if (section.id === 'retrievability') {
            统计图表分区({
              interfaceId: section.id, interfaceTitleKey: section.titleKey, isInteractive: this.阶段 === 'content',
              rangeLabels: this.percentageLabels,
              rangeIndex: this.retrievabilityRange,
              onRangeChange: (index: number): void => { this.retrievabilityRange = index; },

              有数据: (this.图表数据?.retrievability ?? null) !== null,
              帮助标题: $r('app.string.stats_section_retrievability'),
              帮助正文: $r('app.string.stats_help_retrievability'),
              onHelp: (title: Resource, body: Resource): void => { this.on分区帮助(title, body); }
            }) {
              记忆率卡({
                范围索引: this.retrievabilityRange,
                记忆率数据: this.图表数据?.retrievability ?? null
              })
            }
          }
          else if (section.id === 'retention') {
            统计图表分区({
              interfaceId: section.id, interfaceTitleKey: section.titleKey, isInteractive: this.阶段 === 'content',
              rangeLabels: this.retentionLabels,
              rangeIndex: this.retentionView,
              onRangeChange: (index: number): void => { this.retentionView = index; },

              有数据: this.图表数据 !== null && this.图表数据.trueRetention !== null,
              帮助标题: $r('app.string.stats_section_retention'),
              帮助正文: $r('app.string.stats_help_retention'),
              onHelp: (title: Resource, body: Resource): void => { this.on分区帮助(title, body); }
            }) {
              真实保留率卡({
                视图索引: this.retentionView,
                保留率数据: this.图表数据 !== null ? this.图表数据.trueRetention : null,
                是否显示全部: this.统计天数 === 0
              })
            }
          }
          else if (section.id === 'hours') {
            统计图表分区({
              interfaceId: section.id, interfaceTitleKey: section.titleKey, isInteractive: this.阶段 === 'content',
              rangeLabels: this.historyLabels,
              rangeIndex: this.小时分布窗口,
              onRangeChange: (索引: number): void => {
                  this.小时分布窗口 = 索引;
                  保存小时分布窗口(索引).catch((): void => {});
                  // 切换窗口后立即把对应窗口数据推送到首页/桌面卡片
                  this.刷新卡片快照();
                },

              有数据: this.图表数据 !== null && this.图表数据.hours !== null,
              帮助标题: $r('app.string.stats_section_hours'),
              帮助正文: $r('app.string.stats_help_hours'),
              onHelp: (title: Resource, body: Resource): void => { this.on分区帮助(title, body); }
            }) {
              小时分布卡({
                小时数据: this.图表数据 !== null ? this.图表数据.hours : null,
                时间段索引: this.小时分布窗口,
                是否深色: this.是否深色()
              })
            }
          }
          else if (section.id === 'buttons') {
            统计图表分区({
              interfaceId: section.id, interfaceTitleKey: section.titleKey, isInteractive: this.阶段 === 'content',
              rangeLabels: this.统计天数 === 0 ? this.historyLabels : this.historyLabels.slice(0, 3),
              rangeIndex: this.buttonsRange,
              onRangeChange: (index: number): void => { this.buttonsRange = index; },

              有数据: this.图表数据 !== null && this.图表数据.buttons !== null,
              帮助标题: $r('app.string.stats_section_buttons'),
              帮助正文: $r('app.string.stats_help_buttons'),
              onHelp: (title: Resource, body: Resource): void => { this.on分区帮助(title, body); }
            }) {
              回答按钮卡({
                范围索引: this.buttonsRange,
                按钮数据: this.图表数据 !== null ? this.图表数据.buttons : null,
                是否显示全部: this.统计天数 === 0
              })
            }
          }
          else if (section.id === 'added') {
            统计图表分区({
              interfaceId: section.id, interfaceTitleKey: section.titleKey, isInteractive: this.阶段 === 'content',
              rangeLabels: this.统计天数 === 0 ? this.historyLabels : this.historyLabels.slice(0, 3),
              rangeIndex: this.addedRange,
              onRangeChange: (index: number): void => { this.addedRange = index; },

              有数据: this.图表数据 !== null && this.图表数据.added !== null,
              帮助标题: $r('app.string.stats_section_added'),
              帮助正文: $r('app.string.stats_help_added'),
              onHelp: (title: Resource, body: Resource): void => { this.on分区帮助(title, body); }
            }) {
              新增卡({
                范围索引: this.addedRange,
                新增数据: this.图表数据 !== null ? this.图表数据.added : null,
                是否显示全部: this.统计天数 === 0
              })
            }
          }
        }, (section: AppInterfaceItem): string => section.id)
      }
      .width('100%')
      .enabled(this.阶段 === 'content')
      .padding({
        left: 应用尺寸.页面内边距_水平,
        right: 应用尺寸.页面内边距_水平,
        top: 应用尺寸.页面内容顶部间距(this.narrowDeckLayout),
        // 抬高避让手势导航条（AppGallery 导航栏适配要求）
        bottom: 应用尺寸.页面底部间距(this.narrowDeckLayout) + this.导航条高度
      })
    }
    .width('100%')
    .layoutWeight(1)
    .backgroundColor(this.页面底色微染值)
    .scrollBar(BarState.Auto)
    .edgeEffect(EdgeEffect.Spring)
  }

  build() {
    NavDestination() {
      Stack() {
        Column() {
          this.顶部条()

          if (this.阶段 === 'loading' && this.图表数据 === null) {
            Text($r('app.string.stats_loading'))
              .fontSize(应用尺寸.字号_正文)
              .fontColor($r('app.color.text_secondary'))
              .width('100%')
              .textAlign(TextAlign.Center)
              .padding(40)
          }

          if (this.阶段 === 'error') {
            Text(this.错误详情)
              .fontSize(应用尺寸.字号_正文_小)
              .fontColor($r('app.color.error_text'))
              .width('100%')
              .textAlign(TextAlign.Center)
              .padding(40)
          }

          // 切换牌组重载时保留旧图表（Anki 数据不闪空行为）
          if (this.图表数据 !== null) {
            this.统计内容()
          }
        }
        .width('100%')
        .height('100%')
        .backgroundColor(this.页面底色微染值)

        // 页面级字段帮助浮层：所有子组件（统计图表分区）的 ⓘ
        // 按钮均通过 onHelp 回调上抛，由本页 Stack 顶层统一渲染。
        // Invariants: 必须在 NavDestination 直接子 Stack 顶层渲染，避免嵌套层级
        // 导致遮罩 expandSafeArea 失效（遮罩仅覆盖局部 + 浮层居中在遮罩中而非屏幕中央）。
        if (this.显示分区帮助) {
          字段帮助面板({
            标题: this.分区帮助标题,
            正文: this.分区帮助正文,
            onClose: (): void => {
              this.显示分区帮助 = false;
            }
          })
        }


      }
      .width('100%')
      .height('100%')
    }
    .hideTitleBar(true)
    .backgroundColor(Color.Transparent)
    .onBackPressed((): boolean => {
      if (!this.显示分区帮助) return false;
      this.显示分区帮助 = false;
      return true;
    })
    .opacity(this.转场透明度)
    .onShown((): void => { appInterface.showPage('stats'); this.publishInterface(); })
    .onHidden((): void => { appInterface.hidePage('stats'); })
  }
}

/** 首屏复用首页完整统计快照，天数随数据传递，避免显示错误的统计范围。 */
export interface 统计页参数 {
  graphs: GraphsView | null;
  days: number;
}
