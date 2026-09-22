// SPDX-License-Identifier: AGPL-3.0-or-later
import { ThemeTextSpans } from './common/ThemeText';
import { SettingsEntry, filterSettingsEntries, SETTINGS_ENTRIES } from '../model/SettingsNavigation';
import { PAGE_SURFACE_KEY } from '../model/ThemeCatalog';

import { common, Want } from '@kit.AbilityKit';
import { pasteboard, BusinessError } from '@kit.BasicServicesKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { commentManager } from '@kit.AppGalleryKit';
import { 主题模式 } from '../model/主题设置';
import { 颜色主题, 颜色键 } from '../model/颜色主题';
import { 集合服务 } from '../backend/集合服务';
import { 标签服务 } from '../backend/标签服务';
import { 链接服务 } from '../backend/链接服务';
import { HelpPage } from '../proto/messages/LinksMessages';
import { 设置面板色板_取 } from '../utils/设置面板配色';
import type { SyncAuth } from '../proto/messages/SyncMessages';
import { RedemptionPanel } from './settings/RedemptionPanel';
import { GeneralSettings } from './settings/GeneralSettings';
import { ReviewControlsSettings } from './settings/ReviewControlsSettings';
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
import {
  TapZones开关AppStorage键,
  加载TapZones开关
} from '../model/实验性功能存储';
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
// 数据库检查分组与关于分组保留在主壳中：
//   - 数据库检查：契约测试 check-database-contract 要求主壳直接持有 集合服务 并调 检查数据库；
//   - 关于分组：契约测试要求 feedback_email / sponsor_qrcode 资源引用留在主壳。
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
  @Link activeSection: string;
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
  // AnkiWeb 共享牌组网址（与 AnkiWeb引导对话框.ets 同款字面量，作为外部网址保留原文）
  private readonly AnkiWeb网址: string = 'https://ankiweb.net/shared/decks';
  // Anki 官方文档 URL（后端 LinksService.HelpPageLink 不可用时的兜底常量，与 docs.ankiweb.net 一致）
  private readonly Anki文档网址: string = 'https://docs.ankiweb.net';
  // 官方 QQ 群号（关于分组入口点击复制到剪贴板，与 欢迎弹窗 中 QQ群号 保持一致）
  private readonly QQ群号: string = '726837065';
  // 本应用 bundleName，用于拼接应用市场 DeepLink 跳转本应用详情页（好评回退路径）
  private readonly 本应用包名: string = 'com.jide.kapian';
  导入数据回调: () => void = (): void => {
  };
  导出数据回调: () => void = (): void => {
  };
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
  // 不在契约要求中但保持父组件统一管理，便于后续按分组排序。
  @State private 反馈子项展开: boolean = false;
  @State private 赞助子项展开: boolean = false;
  // 数据库检查状态：契约测试 check-database-contract 要求主壳持有这些字段。
  @State private 数据库检查中: boolean = false;
  @State private 数据库检查完成: boolean = false;
  @State private 数据库问题列表: string[] = [];
  @State private 数据库错误信息: string = '';
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
  // 清除未用标签状态：数据管理分组入口 → 确认对话框 → 调后端
  @State private 清除标签忙碌: boolean = false;
  // 内容 List 滚动器：openAiSettings 跳转进来时无动画直接定位到 AI 智能体分组
  private readonly 内容滚动器: Scroller = new Scroller();

  private readonly 集合服务实例: 集合服务 = new 集合服务();
  private readonly 标签服务实例: 标签服务 = new 标签服务();
  private readonly 链接服务实例: 链接服务 = new 链接服务();

  async aboutToAppear(): Promise<void> {
    if (this.openAiSettings) { this.openSection('ai'); }
    // 加载持久化的简洁模式值到 AppStorage，让 @StorageLink 跨重启保持一致
    const 持久化值: boolean = await 加载简洁模式();
    AppStorage.setOrCreate<boolean>(简洁模式AppStorage键, 持久化值);
    // 实验性功能开关同样加载持久化值，让 @StorageLink 跨重启保持一致
    const TapZones值: boolean = await 加载TapZones开关();
    AppStorage.setOrCreate<boolean>(TapZones开关AppStorage键, TapZones值);
    // 未配置 AI 从制卡/改卡跳转进来：悬浮 Toast 提示 + 直接定位到 AI 智能体分组
    if (this.openAiSettings) {
      this.getUIContext().getPromptAction().showToast({
        message: this.取本地化文本($r('app.string.ai_agent_config_required'))
      });
      // 等简洁模式恢复与内容 List 首帧布局完成后无动画定位；转场动画内完成，打开即在分组处
      setTimeout((): void => {
        this.内容滚动器.scrollToIndex(0);
      }, 50);
    }
  }

  /** 目录导航只改变展示位置，设置的保存仍交给原有组件。 */
  private openSection(id: string): void {
    this.activeSection = id;

    this.内容滚动器.scrollToIndex(0);
  }

  private sectionText(key: string): string {
    return this.getUIContext().getHostContext()!.resourceManager.getStringByNameSync(key);
  }

  private directoryEntries(): SettingsEntry[] {
    return filterSettingsEntries(this.settingsQuery, this.简洁模式, this.Agent入口已启用,
      (key: string): string => this.sectionText(key));
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

  @Builder
  private settingsDirectory() {
    Column({ space: 12 }) {
      TextInput({ text: this.settingsQuery, placeholder: $r('app.string.settings_search_placeholder') })
        .height(44)
        .fontSize(应用尺寸.字号_正文)
        .backgroundColor($r('app.color.surface_card'))
        .onChange((value: string): void => { this.settingsQuery = value; })
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
              Text('›').fontSize(22).fontColor($r('app.color.text_secondary'))
            }.width('100%').padding({ left: 16, right: 16, top: 14, bottom: 14 })
          }
          .type(ButtonType.Normal).width('100%').backgroundColor(Color.Transparent)
          .onClick((): void => { this.openSection(entry.id); })
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
    return this.getUIContext().getHostContext()!.resourceManager.getStringSync(资源.id);
  }

  // ========================================================
  // @块ID UI-SETTINGS-PANEL-002
  // @名称 执行数据库检查
  //
  // @作用
  // 调 集合服务实例.检查数据库 拉数据库问题列表；数据库检查中 防重入；
  // 完成后填充 数据库问题列表 与 数据库检查完成；失败时透传错误信息到 数据库错误信息。
  //
  // @输入
  // 无（直接读 @State 与 集合服务实例）。
  //
  // @输出
  // 更新 数据库检查中 / 数据库检查完成 / 数据库问题列表 / 数据库错误信息。
  //
  // @业务规则
  // 契约测试 check-database-contract 要求此方法保留在主壳内联，不可抽到子组件。
  // problems 为空 = 通过，非空 = 列出条数与内容摘要；失败透传错误信息。
  //
  // @副作用
  // 调用 集合服务.检查数据库 触发后端数据库巡检。
  // ========================================================
  private async 执行数据库检查(): Promise<void> {
    if (this.数据库检查中) {
      return;
    }
    this.数据库检查中 = true;
    this.数据库检查完成 = false;
    this.数据库问题列表 = [];
    this.数据库错误信息 = '';
    try {
      const 问题列表: string[] = await this.集合服务实例.检查数据库();
      this.数据库问题列表 = 问题列表;
      this.数据库检查完成 = true;
    } catch (error) {
      this.数据库错误信息 = error instanceof Error ? error.message : `${error}`;
    } finally {
      this.数据库检查中 = false;
    }
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
    if (this.清除标签忙碌) {
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
    this.清除标签忙碌 = true;
    try {
      const count: number = await this.标签服务实例.清除未用标签();
      if (count > 0) {
        this.getUIContext().getPromptAction().showToast({
          message: this.取本地化文本($r('app.string.settings_clear_unused_tags_success'))
            .replace('%d', String(count))
        });
      } else {
        this.getUIContext().getPromptAction().showToast({
          message: this.取本地化文本($r('app.string.settings_clear_unused_tags_empty'))
        });
      }
    } catch (错误) {
      console.info(`SettingsPanel: 清除未用标签失败 错误=${错误}`);
      this.getUIContext().getPromptAction().showToast({
        message: this.取本地化文本($r('app.string.settings_clear_unused_tags_error'))
      });
    }
    this.清除标签忙碌 = false;
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
  // @块ID UI-SETTINGS-PANEL-004
  // @名称 关于分组内容构建器
  //
  // @作用
  // + AnkiWeb 资源入口 + 许可证入口 + Anki 官方文档入口。
  // 反馈子项含 app.string.feedback_email 资源引用；赞助子项含 app.media.sponsor_qrcode 资源引用。
  //
  // @输入
  // 直接读 @State 反馈子项展开 / 赞助子项展开 与 打开许可证回调。
  //
  // @输出
  // 点 AnkiWeb 资源入口时调 打开AnkiWeb网址 方法；点许可证入口时上抛 打开许可证回调。
  //
  // @业务规则
  // 契约测试要求 feedback_email / sponsor_qrcode 资源引用留在主壳（不可抽到子组件）。
  //
  // @副作用
  // 无（仅切换本组件 @State 与触发外部回调）。
  // ========================================================

  // ========================================================
  // @块ID UI-SETTINGS-PANEL-006
  // @名称 打开 AnkiWeb 网址
  //
  // @作用
  // 点击「关于 → AnkiWeb 共享牌组」入口行：用系统浏览器打开 AnkiWeb 共享牌组页面。
  // 若系统无可用浏览器（startAbility 失败），兜底把网址复制到剪贴板并 toast 提示。
  //
  // @输入
  // 无（读 this.AnkiWeb网址）
  //
  // @输出
  // 调系统 startAbility 打开网址；失败时写系统剪贴板 + 弹 toast。
  //
  // @业务规则
  // 不在 app 内嵌 Web 组件打开 AnkiWeb（避免登录态/cookie 与本应用混淆），
  // 一律交给系统浏览器处理。
  //
  // @副作用
  // 调系统 startAbility（可能拉起系统浏览器）；
  // 失败时写系统剪贴板（pasteboard）+ 弹 toast。
  // ========================================================
  private 打开AnkiWeb网址(): void {
    const 上下文: common.UIAbilityContext =
      this.getUIContext().getHostContext() as common.UIAbilityContext;
    上下文.startAbility({
      action: 'ohos.want.action.viewData',
      uri: this.AnkiWeb网址
    }).catch((错误: Error): void => {
      // 兜底：复制网址到剪贴板 + toast 提示用户手动打开
      this.复制AnkiWeb网址到剪贴板();
    });
  }

  private async 复制AnkiWeb网址到剪贴板(): Promise<void> {
    try {
      const 剪贴数据: pasteboard.PasteData =
        pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, this.AnkiWeb网址);
      const 系统剪贴板: pasteboard.SystemPasteboard = pasteboard.getSystemPasteboard();
      await 系统剪贴板.setData(剪贴数据);
      this.getUIContext().getPromptAction().showToast({
        message: $r('app.string.about_ankiweb_open_failed')
      });
    } catch (错误) {
      // 复制失败静默；用户仍可在关于分组看到网址文本手动抄录
    }
  }

  // ========================================================
  // @块ID UI-SETTINGS-PANEL-007
  // @名称 打开 Anki 官方文档
  //
  // @作用
  // 点击设置页底部「查看 Anki 官方文档」入口行：
  // 优先调后端 LinksService.HelpPageLink(INDEX) 取官方文档 URL（按 locale 选站点），
  // 后端不可用或返回空串时兜底用本地常量 Anki文档网址；再用系统浏览器打开。
  // 若系统无可用浏览器（startAbility 失败），兜底把网址复制到剪贴板并 toast 提示。
  //
  // @输入
  // 无（读 this.Anki文档网址 / this.链接服务实例）
  //
  // @输出
  // 调系统 startAbility 打开网址；失败时写系统剪贴板 + 弹 toast。
  //
  // @业务规则
  // 不在 app 内嵌 Web 组件打开文档（与 打开AnkiWeb网址 一致，交给系统浏览器处理）。
  //
  // @副作用
  // 调后端 链接服务.获取帮助页链接（NAPI 桥）；
  // 调系统 startAbility（可能拉起系统浏览器）；
  // 失败时写系统剪贴板（pasteboard）+ 弹 toast。
  // ========================================================
  private async 打开Anki官方文档(): Promise<void> {
    let 网址: string = this.Anki文档网址;
    try {
      const 后端网址: string = await this.链接服务实例.获取帮助页链接(HelpPage.INDEX);
      if (后端网址 !== '') {
        网址 = 后端网址;
      }
    } catch (错误) {
      // 后端不可用：兜底用本地常量网址，确保用户仍能打开文档
    }
    const 上下文: common.UIAbilityContext =
      this.getUIContext().getHostContext() as common.UIAbilityContext;
    上下文.startAbility({
      action: 'ohos.want.action.viewData',
      uri: 网址
    }).catch((错误: Error): void => {
      // 兜底：复制网址到剪贴板 + toast 提示用户手动打开
      this.复制Anki文档网址到剪贴板(网址);
    });
  }

  private async 复制Anki文档网址到剪贴板(网址: string): Promise<void> {
    try {
      const 剪贴数据: pasteboard.PasteData =
        pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, 网址);
      const 系统剪贴板: pasteboard.SystemPasteboard = pasteboard.getSystemPasteboard();
      await 系统剪贴板.setData(剪贴数据);
      this.getUIContext().getPromptAction().showToast({
        message: $r('app.string.about_anki_docs_open_failed')
      });
    } catch (错误) {
      // 复制失败静默；用户仍可在关于分组看到网址文本手动抄录
    }
  }

  // 点击「关于 → QQ 群」入口行：把 QQ 群号写入系统剪贴板并 toast 提示。
  // 不跳转 QQ 应用（避免未装 QQ 时 startAbility 失败的复杂降级链路），统一走复制 + 用户自行打开 QQ 加群。
  private async 复制QQ群号到剪贴板(): Promise<void> {
    try {
      const 剪贴数据: pasteboard.PasteData =
        pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, this.QQ群号);
      const 系统剪贴板: pasteboard.SystemPasteboard = pasteboard.getSystemPasteboard();
      await 系统剪贴板.setData(剪贴数据);
      this.getUIContext().getPromptAction().showToast({
        message: $r('app.string.about_qq_group_copied')
      });
    } catch (错误) {
      // 复制失败静默；用户仍可在关于分组看到群号文本手动抄录
    }
  }

  // ========================================================
  // @块ID UI-SETTINGS-PANEL-006
  // @名称 打开好评弹窗
  //
  // @作用
  // 点击「关于 → 给我好评」入口：优先调 commentManager.showCommentDialog 弹系统好评弹窗；
  // 失败回退 跳转应用市场详情页（DeepLink）拉起华为应用市场本应用详情页。
  //
  // @输入
  // 无（内部用 getUIContext().getHostContext() 取 UIAbilityContext）
  //
  // @输出
  // 无返回值；调 commentManager.showCommentDialog，失败时调 跳转应用市场详情页。
  //
  // @副作用
  // 调 commentManager.showCommentDialog（系统弹窗）；失败时调 跳转应用市场详情页（startAbility）。
  // ========================================================
  private 打开好评弹窗(): void {
    const 上下文: common.UIAbilityContext =
      this.getUIContext().getHostContext() as common.UIAbilityContext;
    try {
      commentManager.showCommentDialog(上下文).then(() => {
        hilog.info(0x0001, '设置面板', 'showCommentDialog 成功');
      }).catch((错误: BusinessError) => {
        this.处理好评失败(错误);
      });
    } catch (错误) {
      this.处理好评失败(错误);
    }
  }

  private 处理好评失败(错误: BusinessError): void {
    hilog.error(0x0001, '设置面板', `showCommentDialog 失败 code=${错误.code} msg=${错误.message}`);
    this.跳转应用市场详情页();
  }

  // ========================================================
  // @块ID UI-SETTINGS-PANEL-008
  // @名称 跳转应用市场详情页
  //
  // @作用
  // 好评弹窗失败时的回退路径：用 DeepLink store://appgallery.huawei.com/app/detail?id=<本应用包名>
  // 拉起华为应用市场本应用详情页，用户可在详情页内查看评分并写评论。
  // DeepLink 拉起失败时 toast 提示用户。
  //
  // @输入
  // 无（读 this.本应用包名）
  //
  // @输出
  // 调系统 startAbility 拉起应用市场详情页；失败时弹 toast。
  //
  // @副作用
  // 调系统 startAbility（拉起华为应用市场）；失败时弹 toast 提示。
  // ========================================================
  private 跳转应用市场详情页(): void {
    const 上下文: common.UIAbilityContext =
      this.getUIContext().getHostContext() as common.UIAbilityContext;
    const want: Want = {
      uri: `store://appgallery.huawei.com/app/detail?id=${this.本应用包名}`
    };
    上下文.startAbility(want).then(() => {
      hilog.info(0x0001, '设置面板', '回退 DeepLink 拉起应用市场成功');
    }).catch((错误: BusinessError) => {
      hilog.error(0x0001, '设置面板', `回退 DeepLink 失败 code=${错误.code} msg=${错误.message}`);
      this.getUIContext().getPromptAction().showToast({
        message: $r('app.string.about_rate_failed_fallback'),
        duration: 3000
      });
    });
  }

  @Builder
  private 关于分组内容() {
    Column() {
      Column({ space: 9 }) {
        Text($r('app.string.app_about_title'))
          .fontSize(18)
          .fontWeight(FontWeight.Bold)
          .fontColor(设置面板色板_取(this.是否深色).主文字)
          .width('100%')
        Text($r('app.string.app_about_copyright'))
          .fontSize(12)
          .fontColor(设置面板色板_取(this.是否深色).三级文字)
          .width('100%')
      }
      .width('100%')
      .alignItems(HorizontalAlign.Start)
      .padding({ bottom: 12 })

      Divider().color(设置面板色板_取(this.是否深色).分隔线).strokeWidth(1)

      // 反馈子项
      Column() {
        Row() {
          Text($r('app.string.feedback_title'))
            .fontSize(15)
            .fontColor(设置面板色板_取(this.是否深色).主文字)
          Blank()
          Text('▼')
            .fontSize(11)
            .fontColor(设置面板色板_取(this.是否深色).弱化文字)
            .rotate({ angle: this.反馈子项展开 ? 0 : -90 })
            .animation({ duration: 150, curve: Curve.EaseOut })
        }
        .width('100%')
        .height(48)
        .onClick(() => {
          this.反馈子项展开 = !this.反馈子项展开;
        })

        if (this.反馈子项展开) {
          Column({ space: 8 }) {
            Text($r('app.string.feedback_hint'))
              .fontSize(12)
              .fontColor(设置面板色板_取(this.是否深色).次文字)
            Text($r('app.string.feedback_email'))
              .fontSize(14)
              .fontColor(设置面板色板_取(this.是否深色).主文字)
              .fontWeight(FontWeight.Medium)
              .maxLines(2)
              .textOverflow({ overflow: TextOverflow.Clip })
              .width('100%')
          }
          .width('100%')
          .padding({ top: 0, bottom: 12 })
          .alignItems(HorizontalAlign.Start)
        }
      }
      .width('100%')

      Divider().color(设置面板色板_取(this.是否深色).分隔线).strokeWidth(1)

      // 赞助子项
      Column() {
        Row() {
          Text($r('app.string.sponsor_title'))
            .fontSize(15)
            .fontColor(设置面板色板_取(this.是否深色).主文字)
          Blank()
          Text('▼')
            .fontSize(11)
            .fontColor(设置面板色板_取(this.是否深色).弱化文字)
            .rotate({ angle: this.赞助子项展开 ? 0 : -90 })
            .animation({ duration: 150, curve: Curve.EaseOut })
        }
        .width('100%')
        .height(48)
        .onClick(() => {
          this.赞助子项展开 = !this.赞助子项展开;
        })

        if (this.赞助子项展开) {
          Column({ space: 8 }) {
            Text($r('app.string.sponsor_hint'))
              .fontSize(12)
              .fontColor(设置面板色板_取(this.是否深色).次文字)
            Image($r('app.media.sponsor_qrcode'))
              .width(180)
              .height(180)
              .objectFit(ImageFit.Contain)
              .borderRadius(8)
            Text($r('app.string.sponsor_qrcode_hint'))
              .fontSize(12)
              .fontColor(设置面板色板_取(this.是否深色).三级文字)
          }
          .width('100%')
          .alignItems(HorizontalAlign.Center)
          .padding({ top: 0, bottom: 12 })
        }
      }
      .width('100%')

      Divider().color(设置面板色板_取(this.是否深色).分隔线).strokeWidth(1)

      // 好评入口行：点击直接跳应用市场详情页（DeepLink）
      // 失败时回退到 DeepLink 跳应用市场详情页（见 打开好评弹窗 / 跳转应用市场详情页）
      Row() {
        Column({ space: 2 }) {
          Text($r('app.string.about_rate_title'))
            .fontSize(15)
            .fontColor(设置面板色板_取(this.是否深色).主文字)
          Text($r('app.string.about_rate_summary'))
            .fontSize(12)
            .fontColor(设置面板色板_取(this.是否深色).弱化文字)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        .alignItems(HorizontalAlign.Start)
        .layoutWeight(1)
        Blank()
        Text('›')
          .fontSize(20)
          .fontColor(设置面板色板_取(this.是否深色).弱化文字)
      }
      .width('100%')
      .height(58)
      .onClick(() => {
        this.打开好评弹窗();
      })

      Divider().color(设置面板色板_取(this.是否深色).分隔线).strokeWidth(1)

      // AnkiWeb 资源入口行：点击用系统浏览器打开 AnkiWeb 共享牌组页面
      Row() {
        Column({ space: 2 }) {
          Text($r('app.string.about_ankiweb_title'))
            .fontSize(15)
            .fontColor(设置面板色板_取(this.是否深色).主文字)
          Text(this.AnkiWeb网址)
            .fontSize(12)
            .fontColor(设置面板色板_取(this.是否深色).弱化文字)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        .alignItems(HorizontalAlign.Start)
        .layoutWeight(1)
        Blank()
        Text('›')
          .fontSize(20)
          .fontColor(设置面板色板_取(this.是否深色).弱化文字)
      }
      .width('100%')
      .height(58)
      .onClick(() => {
        this.打开AnkiWeb网址();
      })

      Divider().color(设置面板色板_取(this.是否深色).分隔线).strokeWidth(1)

      // QQ 群入口行：点击复制群号到剪贴板（不跳转 QQ 应用，避免未装 QQ 时降级链路复杂）
      Row() {
        Column({ space: 2 }) {
          Text($r('app.string.about_qq_group_title'))
            .fontSize(15)
            .fontColor(设置面板色板_取(this.是否深色).主文字)
          Row({ space: 4 }) {
            Text($r('app.string.about_qq_group_summary'))
              .fontSize(12)
              .fontColor(设置面板色板_取(this.是否深色).弱化文字)
              .maxLines(1)
              .textOverflow({ overflow: TextOverflow.Ellipsis })
            Text($r('app.string.about_qq_group_number_label'))
              .fontSize(12)
              .fontColor(设置面板色板_取(this.是否深色).弱化文字)
            Text() { ThemeTextSpans(this.QQ群号, [], this.getUIContext()) }
              .fontSize(12)
              .fontColor(this.解析主色())
              .fontWeight(FontWeight.Medium)
              .copyOption(CopyOptions.LocalDevice)
          }
          .width('100%')
        }
        .alignItems(HorizontalAlign.Start)
        .layoutWeight(1)
        Blank()
        Text('›')
          .fontSize(20)
          .fontColor(设置面板色板_取(this.是否深色).弱化文字)
      }
      .width('100%')
      .height(58)
      .onClick(() => {
        this.复制QQ群号到剪贴板();
      })

      Divider().color(设置面板色板_取(this.是否深色).分隔线).strokeWidth(1)

      // 许可证入口行
      Row() {
        Column({ space: 2 }) {
          Text($r('app.string.licenses_title'))
            .fontSize(15)
            .fontColor(设置面板色板_取(this.是否深色).主文字)
          Text($r('app.string.licenses_summary'))
            .fontSize(12)
            .fontColor(设置面板色板_取(this.是否深色).弱化文字)
        }
        .alignItems(HorizontalAlign.Start)
        Blank()
        Text('›')
          .fontSize(20)
          .fontColor(设置面板色板_取(this.是否深色).弱化文字)
      }
      .width('100%')
      .height(58)
      .onClick(() => {
        this.打开许可证回调();
      })

      Divider().color(设置面板色板_取(this.是否深色).分隔线).strokeWidth(1)

      // Anki 官方文档入口行（设置页底部）：点击用系统浏览器打开 docs.ankiweb.net
      // 优先调后端 LinksService.HelpPageLink 取 URL（按 locale 选站点），失败兜底本地常量
      Row() {
        Column({ space: 2 }) {
          Text($r('app.string.about_anki_docs_title'))
            .fontSize(15)
            .fontColor(设置面板色板_取(this.是否深色).主文字)
          Text(this.Anki文档网址)
            .fontSize(12)
            .fontColor(设置面板色板_取(this.是否深色).弱化文字)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        .alignItems(HorizontalAlign.Start)
        .layoutWeight(1)
        Blank()
        Text('›')
          .fontSize(20)
          .fontColor(设置面板色板_取(this.是否深色).弱化文字)
      }
      .width('100%')
      .height(58)
      .onClick(() => {
        this.打开Anki官方文档();
      })
    }
    .width('100%')
  }

  // ========================================================
  // @块ID UI-SETTINGS-PANEL-005
  // @名称 设置面板主构建
  //
  // @作用
  // 设置目录及详情共用主壳；状态和说明浮层在页面级保留。
  // 分组顺序：标题栏 → 外观 → 调度器 → 布局 → 同步 → 数据库检查 → 术语表 → 数据管理 → 关于。
  // 数据库检查与关于分组内联在主壳（见 UI-SETTINGS-PANEL-001 / UI-SETTINGS-PANEL-002 / UI-SETTINGS-PANEL-004）。
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
        .height(应用尺寸.工具栏高度 + this.状态栏高度)
        .padding({
          top: this.状态栏高度 + 应用尺寸.toolbarVerticalInset,
          bottom: 应用尺寸.toolbarVerticalInset
        })
        .backgroundColor(this.页面底色微染值)
        .alignContent(Alignment.Center)

        // 内容区
        List({ space: 应用尺寸.pageSectionGap, scroller: this.内容滚动器 }) {
          if (this.activeSection === '') {
            ListItem() { this.settingsDirectory() }
          }
          if (this.activeSection === 'general') {
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
          if (this.activeSection === 'controls') {
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
          // 1. 外观与语言分组
          if (this.activeSection === 'appearance') {
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
          // 2. FSRS 调度器分组（简洁模式下隐藏）
          if (!this.简洁模式) {
            if (this.activeSection === 'scheduler') {
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
          }
          // 两种模式都可选择答题工具栏位置，切换模式不改已保存的布局。
          if (this.activeSection === 'appearance') {
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
          // 4. AnkiWeb 云同步分组（M10-T14：登录/同步/冲突全在 同步分组 内部状态机完成）
          // 2026-07-22 上移两格：用户反馈云同步常用，原位于数据管理之后太靠下
          // 2026-07-28：语音朗读分组已删除（用户决策），同步分组从原 5 号位上移到 4 号位
          if (this.activeSection === 'sync') {
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
          if (this.Agent入口已启用) {
            if (this.activeSection === 'ai') {
              ListItem() {
                AIAgent设置分组({
                  是否深色: this.是否深色,
                })
              }
            }
          }
          // 新手帮助在两种模式下都可访问。
            if (this.activeSection === 'help') {
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
          // 数据管理：维护入口合并在同一列表，检查状态仍由主壳管理。
          if (this.activeSection === 'data') {
            ListItem() {
              数据分组({
                是否深色: this.是否深色,
                简洁模式: this.简洁模式,
                databaseBusy: this.数据库检查中,
                databaseChecked: this.数据库检查完成,
                databaseError: this.数据库错误信息,
                databaseProblems: this.数据库问题列表,
                onCheckDatabase: (): void => { this.执行数据库检查(); },
                onDatabaseHelp: (): void => {
                  this.说明标题 = $r('app.string.check_db_title');
                  this.说明正文 = $r('app.string.check_db_help');
                  this.显示说明浮层 = true;
                },
                点击导出导入回调: (): void => { this.导出数据回调(); },
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
          // 8. 关于分组（保留内联：含 feedback_email / sponsor_qrcode 资源引用）
          if (this.activeSection === 'about') {
            ListItem() {
              设置分组卡片({
                标题: $r('app.string.settings_about'),
                是否深色: this.是否深色,
              }) {
                this.关于分组内容();
              }
            }
          }
          // 开发者调试始终可见；正确密钥只持久化布尔解锁状态，不保存输入内容。
          if (this.activeSection === 'advanced') {
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
          if (this.activeSection === 'redemption') {
            ListItem() {
              RedemptionPanel({
                developerGroup: this.QQ群号,
                onUseTheme: (theme: 颜色主题): void => { this.颜色主题切换回调(theme); }
              })
            }
          }
        }
        .layoutWeight(1)
        .width('100%')
        .padding({
          left: 应用尺寸.页面内边距_水平,
          right: 应用尺寸.页面内边距_水平,
          top: 应用尺寸.pageContentTopInset,
          bottom: 应用尺寸.pageBottomInset + this.导航条高度
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
          顶部偏移: 应用尺寸.工具栏高度 + this.状态栏高度 + 应用尺寸.pageContentTopInset,
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
          isDark: this.是否深色,
          onClose: (): void => { this.显示备份管理 = false; }
        })
          .transition(TransitionEffect.OPACITY.animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }))
      }

      // 媒体管理面板：数据管理分组入口打开，挂在根 Stack 顶层
      if (this.显示媒体管理) {
        媒体管理面板({
          isDark: this.是否深色,
          onClose: (): void => { this.显示媒体管理 = false; }
        })
          .transition(TransitionEffect.OPACITY.animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }))
      }

      if (this.显示空卡列表) {
        空卡列表面板({
          isDark: this.是否深色,
          onClose: (): void => { this.显示空卡列表 = false; }
        })
          .transition(TransitionEffect.OPACITY.animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }))
      }

      // 查找重复对话框：数据管理分组入口打开，挂在根 Stack 顶层
      if (this.显示查找重复) {
        查找重复对话框({
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
