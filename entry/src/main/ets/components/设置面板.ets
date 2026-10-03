// SPDX-License-Identifier: AGPL-3.0-or-later
import { PressFeedback } from '../utils/PressFeedback';
import { DisclosureChevron } from './common/DisclosureChevron';
import { namedResourceText, resourceText, showToastSafely } from '../utils/UiFeedback';
import { ThemeTextSpans } from './common/ThemeText';
import { SettingsGroup, visibleSettingsGroups } from '../model/SettingsStructure';
import { appInterface } from '../backend/AppInterfaceService';
import { SettingsEntry, filterSettingsEntries, SETTINGS_ENTRIES } from '../model/SettingsNavigation';
import { syncActivity } from '../model/SyncSettings';
import { OFFICIAL_QQ_GROUP } from '../model/OfficialCommunity';
import { PAGE_SURFACE_KEY } from '../model/ThemeCatalog';
import { DECK_LIST_NARROW_KEY } from '../model/DeckListAppearance';

import { common } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { 主题模式 } from '../model/主题设置';
import { 颜色主题, 颜色键 } from '../model/颜色主题';
import { 集合服务 } from '../backend/集合服务';
import { CollectionMaintenanceSession, CollectionMaintenanceState } from '../model/settings/CollectionMaintenanceSession';
import { 标签服务 } from '../backend/标签服务';
import { 设置面板色板_取 } from '../utils/设置面板配色';
import type { SyncAuth } from '../proto/messages/SyncMessages';
import { RedemptionPanel } from './settings/RedemptionPanel';
import { AboutSettings } from './settings/AboutSettings';
import { GeneralSettings } from './settings/GeneralSettings';
import { ReviewControlsSettings } from './settings/ReviewControlsSettings';
import { ReviewPreferencesSettings } from './settings/ReviewPreferencesSettings';
import { 外观分组 } from './settings/外观分组';
import { 调度器分组 } from './settings/调度器分组';
import { 布局分组 } from './settings/布局分组';
import { 数据分组 } from './settings/数据分组';
import { 模式切换菜单 } from './settings/模式切换菜单';
import { 同步分组 } from './settings/同步分组';
import { 术语分组 } from './settings/术语分组';
import { 媒体管理面板 } from './settings/媒体管理面板';
import { 备份管理面板 } from './settings/备份管理面板';
import { 空卡列表面板 } from './settings/空卡列表面板';
import { 查找重复对话框 } from './settings/查找重复对话框';
import { 笔记类型管理面板 } from './settings/笔记类型管理面板';
import { 笔记类型编辑器 } from './settings/笔记类型编辑器';
import { AIAgent设置分组 } from './settings/AIAgent设置分组';
import { 开发者调试分组 } from './settings/开发者调试分组';
import { 设置分组卡片 } from './settings/设置分组卡片';
import { 简洁模式AppStorage键, 加载简洁模式, 保存简洁模式 } from '../model/简洁模式存储';
import { 字段帮助面板 } from './字段帮助面板';
import { 取全屏转场时长, 取全屏转场曲线 } from '../utils/转场时长';
import { 应用尺寸 } from '../utils/应用尺寸';
import { 按下态按钮 } from './common/按下态按钮';
import { AI_AGENT_CHANNELS_APP_STORAGE_KEY } from '../model/ReleaseFeatures';

// ========================================================
// @块ID UI-SETTINGS-PANEL-001
// @名称 设置面板主壳
//
// @作用
// 设置面板主壳：Stack 遮罩 + List 列出各分组 ListItem + 根 Stack 顶层浮层。
// 顶栏布局：左「返回」（关闭设置页）+ 右「当前模式名」（弹出 模式切换菜单 选 简洁版/实验版），
// 替代原底部「当前模式」分组，该分组已于 2026-08-29 删除）。
// 5 个分组（外观/调度器/布局/数据/术语表）+ 模式切换菜单 已抽到 components/settings/ 子组件；
// 维护会话与各设置分组独立持有业务状态；主壳负责目录和弹层接线。
//
// @输入
// 当前主题模式 / 是否深色 / 当前颜色主题：父页面注入；
// 主题模式切换回调 / 颜色主题切换回调 / 打开许可证回调 / 导入数据回调 / 导出数据回调 /
// 点击已隐藏牌组回调 / 打开同步弹窗回调 / 先备份后同步回调 / 关闭回调：父页面注入。
//
// @输出
// 渲染整页设置面板；用户在各分组内交互时上抛对应回调给父页面。
//
// @副作用
// 持有 集合服务实例；点数据库检查时调 集合服务.检查数据库。
// ========================================================
@Component
export struct 设置面板 {
  @Prop @Watch('handleBackRequest') backRequest: number = 0;
  @State private notetypeEditorBackRequest: number = 0;
  @State private notetypeManagerBackRequest: number = 0;
  @State private duplicatesBackRequest: number = 0;
  @State private emptyCardsBackRequest: number = 0;
  @State private mediaBackRequest: number = 0;
  @State private backupBackRequest: number = 0;

  private handleBackRequest(): void {
    if (this.显示笔记类型编辑器) { this.notetypeEditorBackRequest++; return; }
    if (this.显示笔记类型管理) { this.notetypeManagerBackRequest++; return; }
    if (this.显示查找重复) { this.duplicatesBackRequest++; return; }
    if (this.显示空卡列表) { this.emptyCardsBackRequest++; return; }
    if (this.显示媒体管理) { this.mediaBackRequest++; return; }
    if (this.显示备份管理) { this.backupBackRequest++; return; }
    if (this.显示模式菜单) { this.显示模式菜单 = false; return; }
    if (this.显示说明浮层) { this.显示说明浮层 = false; return; }
    this.navigateBack();
  }

  @StorageProp(DECK_LIST_NARROW_KEY) private narrowDeckLayout: boolean = false;
  @Link @Watch('publishInterface') activeSection: string;
  @State private settingsQuery: string = '';
  @Prop openAiSettings: boolean = false;
  @Prop 当前主题模式: 主题模式 = 'system';
  @Prop 是否深色: boolean = false;
  @Prop 当前颜色主题: 颜色主题 = 'aurora';
  // @StorageLink 让主壳在 动作主色 变化时立即重 build；解析主色() 直接引用此字段，
  // 让 @Builder 内的主色按钮（右上角完成、数据库检查）在颜色主题切换瞬间同步更新（与 外观分组 同款机制）。
  @StorageLink(颜色键.动作主色) private 动作主色链接: string = '';
  @StorageLink(颜色键.主色按钮背景) private 主色按钮背景链接: string = '';
  @StorageProp(PAGE_SURFACE_KEY) private 页面底色微染值: string = '#F5F7FA';
  @StorageProp(颜色键.主色容器) private 主色容器色: string = '#E8EEFC';
  @StorageProp('状态栏高度') private 状态栏高度: number = 0;
  // 手势导航条高度（列表滚到底时最后分组需完整滚出导航条区域）
  @StorageProp('导航条高度') private 导航条高度: number = 0;
  主题模式切换回调: (模式: 主题模式) => void = (模式: 主题模式): void => {
  };
  颜色主题切换回调: (主题: 颜色主题) => void = (主题: 颜色主题): void => {
  };
  打开许可证回调: () => void = (): void => {
  };
  导入数据回调: () => void = (): void => {
  };
  导出数据回调: () => void = (): void => {
  };
  创建完整备份回调: () => void = (): void => {};
  恢复完整备份回调: () => void = (): void => {};
  // 用户在数据管理分组点「隐藏牌组管理」：上抛给 Index 弹出隐藏牌组对话框
  点击已隐藏牌组回调: () => void = (): void => {
  };
  // 用户在查找重复对话框点重复组：上抛搜索串给 Index，由 Index 走 NavPathStack 推栈浏览页
  跳转浏览页回调: (initialSearch: string) => void = (initialSearch: string): void => {};
  // 用户在 同步分组 点「立即同步」：上抛 凭证 + 账号名 给 Index，Index 挂载 同步面板 弹窗
  打开同步弹窗回调: (凭证: SyncAuth, 账号名: string) => void = (_凭证: SyncAuth, _账号名: string): void => {};
  // 用户在 同步分组 点「先备份后同步」：上抛给 Index.ets 打开 数据迁移面板
  // 走 exportPersonalData 模式（导出整个 collection 为 .colpkg），与 数据分组 的 导出数据回调
  // 走 exportDeck 模式区分；备份与同步是两步分离操作，用户备份完自己回设置页点立即同步
  先备份后同步回调: () => void = (): void => {
  };
  关闭回调: () => void = (): void => {
  };

  // 右上角模式切换菜单：顶栏「当前模式」按钮触发，弹出 简洁版/实验版 选择
  @State private 显示模式菜单: boolean = false;
  @State private maintenance: CollectionMaintenanceState = new CollectionMaintenanceState();
  private readonly maintenanceSession: CollectionMaintenanceSession = new CollectionMaintenanceSession();
  // 子分组（FSRS / 语音朗读）ⓘ 按钮上抛的说明请求：统一在本面板根 Stack 浮层显示，
  // 避免在子分组卡片内嵌套 字段帮助面板 导致其被压在分组卡片内呈现为「新界面」。
  @State private 显示说明浮层: boolean = false;
  @State private 说明标题: Resource = $r('app.string.settings_fsrs_label');
  @State private 说明正文: Resource = $r('app.string.settings_fsrs_help');
  // 媒体管理面板：从数据管理分组入口打开，挂在根 Stack 顶层
  @State private 显示媒体管理: boolean = false;
  @State private 显示备份管理: boolean = false;
  // 空卡列表面板：从数据管理分组入口打开，挂在根 Stack 顶层
  @State private 显示空卡列表: boolean = false;
  // 查找重复对话框：从数据管理分组入口打开，挂在根 Stack 顶层
  @State private 显示查找重复: boolean = false;
  // 笔记类型管理面板（T3）：从数据管理分组入口打开
  @State private 显示笔记类型管理: boolean = false;
  // 笔记类型编辑器（T3）：从管理面板点击编辑后打开
  @State private 显示笔记类型编辑器: boolean = false;
  @State private 编辑笔记类型ID: number = 0;
  @State private 编辑笔记类型名: string = '';
  // 简洁模式：默认 true，隐藏调度分组/术语分组等高级功能
  @StorageLink(简洁模式AppStorage键) private 简洁模式: boolean = true;
  // 输入开发者密钥后即时显示隐藏的 Agent 设置与各页面入口。
  @StorageLink(AI_AGENT_CHANNELS_APP_STORAGE_KEY) private Agent入口已启用: boolean = false;
  // 内容 List 滚动器：openAiSettings 跳转进来时无动画直接定位到 AI 智能体分组
  private readonly 内容滚动器: Scroller = new Scroller();
  private disposed: boolean = false;
  private lifecycleVersion: number = 0;

  private readonly 集合服务实例: 集合服务 = new 集合服务();
  private readonly 标签服务实例: 标签服务 = new 标签服务();

  async aboutToAppear(): Promise<void> {
    this.publishInterface();
    this.disposed = false;
    const lifecycleVersion: number = ++this.lifecycleVersion;
    this.maintenanceSession.attach((state: CollectionMaintenanceState): void => { this.maintenance = state; });
    if (this.openAiSettings) { this.openSection('ai'); }
    // 加载持久化的简洁模式值到 AppStorage，让 @StorageLink 跨重启保持一致
    const 持久化值: boolean = await 加载简洁模式();
    if (this.disposed || lifecycleVersion !== this.lifecycleVersion) return;
    AppStorage.setOrCreate<boolean>(简洁模式AppStorage键, 持久化值);
    // 学习控制偏好由 ReviewControlsSettings 自行恢复，并展示读取失败。
    // 未配置 AI 从制卡/改卡跳转进来：悬浮 Toast 提示 + 直接定位到 AI 智能体分组
    if (this.openAiSettings) {
      showToastSafely(this.getUIContext(), {
        message: this.取本地化文本($r('app.string.ai_agent_config_required'))
      });
      // 等简洁模式恢复与内容 List 首帧布局完成后无动画定位；转场动画内完成，打开即在分组处
      setTimeout((): void => {
        if (!this.disposed && lifecycleVersion === this.lifecycleVersion) {
          this.内容滚动器.scrollToIndex(0);
        }
      }, 50);
    }
  }

  aboutToDisappear(): void {
    appInterface.leave('settings');
    this.disposed = true;
    this.lifecycleVersion++;
    this.maintenanceSession.detach();
  }

  /** 目录导航只改变展示位置，设置的保存仍交给原有组件。 */
  private openSection(id: string): void {
    if (((id === 'scheduler' && !this.简洁模式) || id === 'data' || id === 'advanced') && syncActivity.isCollectionBusy()) {
      showToastSafely(this.getUIContext(), { message: this.取本地化文本($r('app.string.sync_wait_operation')) });
      return;
    }
    this.activeSection = id;

    this.内容滚动器.scrollToIndex(0);
  }

  private sectionText(key: string): string {
    return namedResourceText(this.getUIContext(), key);
  }

  private directoryEntries(): SettingsEntry[] {
    return filterSettingsEntries(this.settingsQuery, this.简洁模式, this.Agent入口已启用,
      (key: string): string => this.sectionText(key));
  }

  private sectionGroups(): SettingsGroup[] {
    return visibleSettingsGroups(this.activeSection, this.简洁模式, this.Agent入口已启用);
  }

  private publishInterface(): void {
    appInterface.observe({ surface: 'settings', sectionId: this.activeSection, selectedId: '',
      optionIds: [], optionLabels: [], busy: false });
  }

  private pageTitle(): string {
    const entry: SettingsEntry | undefined = SETTINGS_ENTRIES.find((item: SettingsEntry): boolean =>
      item.id === this.activeSection);
    return this.sectionText(entry === undefined ? 'settings_title' : entry.titleKey);
  }

  private navigateBack(): void {
    if (this.activeSection !== '') { this.activeSection = ''; }
    else { this.关闭回调(); }
  }

  private onSettingsSearchChange(value: string): void {
    this.settingsQuery = value;
    // 全局搜索框在详情页也保持可见；开始新的搜索时回到目录展示结果。
    if (value.trim() !== '' && this.activeSection !== '') {
      this.activeSection = '';
      this.内容滚动器.scrollToIndex(0);
    }
  }

  @Builder
  private settingsSearchField(): void {
    TextInput({ text: this.settingsQuery, placeholder: $r('app.string.settings_search_placeholder') })
      .width('100%')
      .height(应用尺寸.searchFieldHeight)
      .fontSize(应用尺寸.字号_正文)
      .backgroundColor($r('app.color.surface_card'))
      .borderRadius(应用尺寸.searchFieldRadius)
      .onChange((value: string): void => { this.onSettingsSearchChange(value); })
  }

  @Builder
  private settingsDirectory() {
    Column() {
      Column() {
        ForEach(this.directoryEntries(), (entry: SettingsEntry) => {
          Button() {
            Row({ space: 12 }) {
              Column({ space: 4 }) {
                Text(this.sectionText(entry.titleKey))
                  .fontSize(应用尺寸.字号_正文).fontWeight(FontWeight.Medium)
                  .fontColor($r('app.color.text_primary')).width('100%')
                Text(this.sectionText(this.简洁模式 ? (entry.simpleDescriptionKey ?? entry.descriptionKey) : entry.descriptionKey))
                  .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary'))
                  .width('100%')
              }.layoutWeight(1).alignItems(HorizontalAlign.Start)
              DisclosureChevron({ tint: $r('app.color.text_secondary') })
            }.width('100%').padding({ left: 16, right: 16, top: 14, bottom: 14 })
          }
          .type(ButtonType.Normal).width('100%').backgroundColor(Color.Transparent)
          .attributeModifier(new PressFeedback())
          .stateEffect(false).onClick((): void => { this.openSection(entry.id); })
          Divider().color($r('app.color.border_subtle')).margin({ left: 16, right: 16 })
        }, (entry: SettingsEntry): string => entry.id)
        if (this.directoryEntries().length === 0) {
          Text($r('app.string.settings_search_empty')).fontSize(应用尺寸.字号_正文)
            .fontColor($r('app.color.text_secondary')).padding(20)
        }
      }.width('100%').backgroundColor($r('app.color.surface_card')).borderRadius(16).clip(true)
    }.width('100%')
  }

  private 取本地化文本(资源: Resource): string {
    return resourceText(this.getUIContext(), 资源);
  }

  private async 执行数据库检查(): Promise<void> {
    await this.maintenanceSession.checkDatabase((): Promise<string[]> => this.集合服务实例.检查数据库());
  }

  // 契约测试要求保留 this.遮罩色() 调用形式；色板统一来自 设置面板色板。
  private 遮罩色(): string {
    return 设置面板色板_取(this.是否深色).遮罩;
  }

  // ========================================================
  // @名称 清除未用标签
  //
  // @作用
  // 数据管理分组「清除未用标签」入口 → AlertDialog 二次确认 → 调 标签服务.清除未用标签。
  // 成功 toast 显示清除数量，失败 toast 显示错误。
  //
  // @副作用
  // 调后端 标签服务.清除未用标签，修改 Anki collection（可撤销）。
  // ========================================================
  private 请求清除未用标签(): void {
    if (this.disposed || this.maintenance.clearingTags) {
      return;
    }
    this.getUIContext().showAlertDialog({
      title: this.取本地化文本($r('app.string.settings_clear_unused_tags')),
      message: this.取本地化文本($r('app.string.settings_clear_unused_tags_confirm')),
      autoCancel: true,
      alignment: DialogAlignment.Center,
      primaryButton: {
        value: $r('app.string.cancel'),
        action: (): void => {}
      },
      secondaryButton: {
        value: $r('app.string.settings_clear_unused_tags'),
        fontColor: $r('app.color.error_text'),
        action: (): void => { this.执行清除未用标签(); }
      }
    });
  }

  private async 执行清除未用标签(): Promise<void> {
    if (this.disposed) return;
    const lifecycleVersion: number = this.lifecycleVersion;
    try {
      const count: number | null = await this.maintenanceSession.clearUnusedTags(
        (): Promise<number> => this.标签服务实例.清除未用标签());
      if (count === null || this.disposed || lifecycleVersion !== this.lifecycleVersion) return;
      if (count > 0) {
        showToastSafely(this.getUIContext(), {
          message: this.取本地化文本($r('app.string.settings_clear_unused_tags_success'))
            .replace('%d', String(count))
        });
      } else {
        showToastSafely(this.getUIContext(), {
          message: this.取本地化文本($r('app.string.settings_clear_unused_tags_empty'))
        });
      }
    } catch (错误) {
      if (this.disposed || lifecycleVersion !== this.lifecycleVersion) return;
      console.info(`SettingsPanel: 清除未用标签失败 错误=${错误}`);
      showToastSafely(this.getUIContext(), {
        message: this.取本地化文本($r('app.string.settings_clear_unused_tags_error'))
      });
    }
  }

  /** 选中态主色：直接引用 @StorageLink 动作主色链接 让颜色主题切换时 @Builder 重执行（与 外观分组 同款）。 */
  private 解析主色(): string {
    return this.动作主色链接 !== '' ? this.动作主色链接 : 设置面板色板_取(this.是否深色).主色;
  }

  /** 按钮背景专用主色（配 #FFFFFF 文字 ≥ 4.5:1）。2.1.4.1 深色模式修复。 */
  private 解析主色按钮背景(): string {
    return this.主色按钮背景链接 !== '' ? this.主色按钮背景链接 : 设置面板色板_取(this.是否深色).主色按钮背景;
  }

  // ========================================================
  // @块ID UI-SETTINGS-PANEL-005
  // @名称 设置面板主构建
  //
  // @作用
  // 设置目录及详情共用主壳；状态和说明浮层在页面级保留。
  // 分组顺序：标题栏 → 外观 → 调度器 → 布局 → 同步 → 数据库检查 → 术语表 → 数据管理 → 关于。
  //
  // @输入
  // 直接读所有 @Prop / @State / @StorageLink 与外部回调。
  //
  // @输出
  // 渲染设置面板完整 UI。
  //
  // @副作用
  // 无（构建器只负责渲染；副作用由用户交互触发对应回调）。
  // ========================================================
  build() {
    Stack() {
      Column() {
        // 返回先退回目录，模式切换入口保留在右侧。
        Stack({ alignContent: Alignment.Center }) {
          Text(this.pageTitle())
            .fontSize(应用尺寸.字号_标题).fontWeight(FontWeight.Medium)
            .fontColor($r('app.color.text_primary')).width('44%')
            .maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis }).textAlign(TextAlign.Center)
            .hitTestBehavior(HitTestMode.None)
          Row() {
            按下态按钮({
              文案: $r('app.string.study_back'),
              字色: $r('app.color.text_primary'),
              点击回调: (): void => { this.navigateBack(); }
            })
            Blank()
            按下态按钮({
              文案: this.简洁模式 ? $r('app.string.settings_simple_mode_simple')
                : $r('app.string.settings_simple_mode_full'),
              字色: $r('app.color.text_primary'),
              点击回调: (): void => { this.显示模式菜单 = true; }
            })
          }
          .width('100%')
          .height('100%')
          .padding({ left: 应用尺寸.页面内边距_水平, right: 应用尺寸.页面内边距_水平 })
          .hitTestBehavior(HitTestMode.Transparent)
        }
        .width('100%')
        .height(应用尺寸.pageToolbarHeight(this.状态栏高度, this.narrowDeckLayout))
        .padding({
          top: 应用尺寸.pageToolbarTop(this.状态栏高度, this.narrowDeckLayout),
          bottom: 0
        })
        .backgroundColor(this.页面底色微染值)
        .alignContent(Alignment.Center)

        // 搜索框属于设置面板公共壳，进入二级/三级设置仍保持在顶栏下方。
        Column() {
          this.settingsSearchField()
        }
        .width('100%')
        .padding({
          left: 应用尺寸.页面内边距_水平,
          right: 应用尺寸.页面内边距_水平,
          top: 应用尺寸.页面内容顶部间距(this.narrowDeckLayout),
          bottom: 应用尺寸.页面分组间距(this.narrowDeckLayout)
        })

        // 内容区
        List({ space: 应用尺寸.页面分组间距(this.narrowDeckLayout), scroller: this.内容滚动器 }) {
          if (this.activeSection === '') {
            ListItem() { this.settingsDirectory() }
          }
          ForEach(this.sectionGroups(), (group: SettingsGroup) => {
            if (group.id === 'general_display') {
              ListItem() {
                GeneralSettings({
                  是否深色: this.是否深色,
                  打开说明回调: (标题: Resource, 正文: Resource): void => {
                    this.说明标题 = 标题;
                    this.说明正文 = 正文;
                    this.显示说明浮层 = true;
                  }
                })
              }
            }
            else if (group.id === 'review_controls') {
              ListItem() {
                ReviewControlsSettings({
                  是否深色: this.是否深色,
                  简洁模式: this.简洁模式,
                  打开说明回调: (标题: Resource, 正文: Resource): void => {
                    this.说明标题 = 标题;
                    this.说明正文 = 正文;
                    this.显示说明浮层 = true;
                  }
                })
              }
            }
            else if (group.id === 'global_review' || group.id === 'study_display') {
              ListItem() {
                ReviewPreferencesSettings({ 是否深色: this.是否深色, displayOptions: group.id === 'study_display' })
              }
            }
            else if (group.id === 'study_layout') {
              ListItem() {
                布局分组({
                  是否深色: this.是否深色,
                  打开说明回调: (标题: Resource, 正文: Resource): void => {
                    this.说明标题 = 标题;
                    this.说明正文 = 正文;
                    this.显示说明浮层 = true;
                  }
                })
              }
            }
            else if (group.id === 'algorithm') {
              ListItem() {
                调度器分组({
                  是否深色: this.是否深色,
                  打开说明回调: (标题: Resource, 正文: Resource): void => {
                    this.说明标题 = 标题;
                    this.说明正文 = 正文;
                    this.显示说明浮层 = true;
                  }
                })
              }
            }
            else if (group.id === 'appearance') {
              ListItem() {
                外观分组({
                  是否深色: this.是否深色,
                  简洁模式: this.简洁模式,
                  当前主题模式: this.当前主题模式,
                  当前颜色主题: this.当前颜色主题,
                  主题模式切换回调: (模式: 主题模式): void => { this.主题模式切换回调(模式); },
                  颜色主题切换回调: (主题: 颜色主题): void => { this.颜色主题切换回调(主题); }
                })
              }
            }
            else if (group.id === 'sync') {
              ListItem() {
                同步分组({
                  是否深色: this.是否深色,
                  简洁模式: this.简洁模式,
                  打开同步弹窗回调: (凭证: SyncAuth, 账号名: string): void => { this.打开同步弹窗回调(凭证, 账号名); },
                  点击导出数据回调: (): void => { this.先备份后同步回调(); },
                  打开说明回调: (标题: Resource, 正文: Resource): void => {
                    this.说明标题 = 标题;
                    this.说明正文 = 正文;
                    this.显示说明浮层 = true;
                  }
                })
              }
            }
            else if (group.id === 'ai') {
              ListItem() {
                AIAgent设置分组({
                  是否深色: this.是否深色,
                })
              }
            }
            else if (group.id === 'help') {
              ListItem() {
                术语分组({
                  是否深色: this.是否深色,
                  打开说明回调: (标题: Resource, 正文: Resource): void => {
                    this.说明标题 = 标题;
                    this.说明正文 = 正文;
                    this.显示说明浮层 = true;
                  }
                })
              }
            }
            else if (group.id === 'data') {
              ListItem() {
                数据分组({
                  是否深色: this.是否深色,
                  简洁模式: this.简洁模式,
                  databaseBusy: this.maintenance.checking,
                  databaseChecked: this.maintenance.checked,
                  databaseError: this.maintenance.error,
                  databaseProblems: this.maintenance.problems,
                  onCheckDatabase: (): void => { this.执行数据库检查(); },
                  onDatabaseHelp: (): void => {
                    this.说明标题 = $r('app.string.check_db_title');
                    this.说明正文 = $r('app.string.check_db_help');
                    this.显示说明浮层 = true;
                  },
                  点击导入回调: (): void => { this.导入数据回调(); },
                  点击导出回调: (): void => { this.导出数据回调(); },
                  点击笔记类型回调: (): void => { this.显示笔记类型管理 = true; },
                  点击已隐藏牌组回调: (): void => { this.点击已隐藏牌组回调(); },
                  点击媒体管理回调: (): void => { this.显示媒体管理 = true; },
                  点击备份管理回调: (): void => { this.显示备份管理 = true; },
                  点击空卡回调: (): void => { this.显示空卡列表 = true; },
                  点击查找重复回调: (): void => { this.显示查找重复 = true; },
                  点击清除未用标签回调: (): void => { this.请求清除未用标签(); }
                })
              }
            }
            else if (group.id === 'about') {
              ListItem() {
                设置分组卡片({
                  groupId: 'about',
                  是否深色: this.是否深色,
                }) {
                  AboutSettings({
                    是否深色: this.是否深色,
                    打开许可证回调: (): void => { this.打开许可证回调(); }
                  })
                }
              }
            }
            else if (group.id === 'advanced') {
              ListItem() {
                开发者调试分组({
                  是否深色: this.是否深色,
                  启用成功回调: (): void => {
                    this.openSection('ai');
                    setTimeout((): void => {
                      this.内容滚动器.scrollToIndex(0);
                    }, 50);
                  }
                })
              }
            }
            else if (group.id === 'redemption') {
              ListItem() {
                RedemptionPanel({
                  developerGroup: OFFICIAL_QQ_GROUP,
                  onUseTheme: (theme: 颜色主题): void => { this.颜色主题切换回调(theme); }
                })
              }
            }
          }, (group: SettingsGroup): string => group.id)
        }
        .layoutWeight(1)
        .width('100%')
        .padding({
          left: 应用尺寸.页面内边距_水平,
          right: 应用尺寸.页面内边距_水平,
          top: 0,
          bottom: 应用尺寸.页面底部间距(this.narrowDeckLayout) + this.导航条高度
        })
        .backgroundColor(this.页面底色微染值)
        .scrollBar(BarState.Off)
        .edgeEffect(EdgeEffect.Spring)
        .alignListItem(ListItemAlign.Center)
      }
      .width('100%')
      .height('100%')
      .backgroundColor(this.页面底色微染值)

      // FSRS 子分组 ⓘ 上抛的说明浮层：放在根 Stack 顶层，
      // 与 高级牌组选项面板 的 字段帮助面板 渲染位置一致。
      if (this.显示说明浮层) {
        字段帮助面板({
          标题: this.说明标题,
          正文: this.说明正文,
          onClose: (): void => { this.显示说明浮层 = false; }
        })
      }

      // 右上角模式切换菜单：顶栏「当前模式」按钮触发，挂在根 Stack 顶层
      if (this.显示模式菜单) {
        模式切换菜单({
          当前简洁模式: this.简洁模式,
          主色: this.解析主色(),
          顶部偏移: 应用尺寸.pageContentTop(this.状态栏高度, this.narrowDeckLayout),
          选择回调: (简洁: boolean): void => {
            this.显示模式菜单 = false;
            if (简洁 !== this.简洁模式) {
              保存简洁模式(简洁);
              this.activeSection = '';
            }
          },
          关闭回调: (): void => { this.显示模式菜单 = false; }
        })
      }

      if (this.显示备份管理) {
        备份管理面板({
          backRequest: this.backupBackRequest,
          isDark: this.是否深色,
          onExportCollection: (): void => { this.创建完整备份回调(); },
          onImportCollection: (): void => { this.恢复完整备份回调(); },
          onClose: (): void => { this.显示备份管理 = false; }
        })
          .transition(TransitionEffect.OPACITY.animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }))
      }

      // 媒体管理面板：数据管理分组入口打开，挂在根 Stack 顶层
      if (this.显示媒体管理) {
        媒体管理面板({
          backRequest: this.mediaBackRequest,
          isDark: this.是否深色,
          onClose: (): void => { this.显示媒体管理 = false; }
        })
          .transition(TransitionEffect.OPACITY.animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }))
      }

      if (this.显示空卡列表) {
        空卡列表面板({
          backRequest: this.emptyCardsBackRequest,
          isDark: this.是否深色,
          onClose: (): void => { this.显示空卡列表 = false; }
        })
          .transition(TransitionEffect.OPACITY.animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }))
      }

      // 查找重复对话框：数据管理分组入口打开，挂在根 Stack 顶层
      if (this.显示查找重复) {
        查找重复对话框({
          backRequest: this.duplicatesBackRequest,
          isDark: this.是否深色,
          onClose: (): void => { this.显示查找重复 = false; },
          onJumpToBrowser: (searchText: string): void => {
            this.显示查找重复 = false;
            this.跳转浏览页回调(searchText);
          }
        })
          .transition(TransitionEffect.OPACITY.animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }))
      }

      // 笔记类型管理面板（T3）：数据管理分组入口打开
      if (this.显示笔记类型管理) {
        笔记类型管理面板({
          backRequest: this.notetypeManagerBackRequest,
          isDark: this.是否深色,
          onClose: (): void => { this.显示笔记类型管理 = false; },
          onEdit: (id: number, name: string): void => {
            this.编辑笔记类型ID = id;
            this.编辑笔记类型名 = name;
            this.显示笔记类型管理 = false;
            this.显示笔记类型编辑器 = true;
          }
        })
          .transition(TransitionEffect.OPACITY.animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }))
      }

      // 笔记类型编辑器（T3）：从管理面板点击编辑后打开
      if (this.显示笔记类型编辑器) {
        笔记类型编辑器({
          backRequest: this.notetypeEditorBackRequest,
          isDark: this.是否深色,
          notetypeId: this.编辑笔记类型ID,
          notetypeName: this.编辑笔记类型名,
          onClose: (): void => {
            this.显示笔记类型编辑器 = false;
            this.显示笔记类型管理 = true;
          },
          onSaved: (): void => {}
        })
          .transition(TransitionEffect.OPACITY.animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }))
      }
    }
    .width('100%')
    .height('100%')
  }
}
