// SPDX-License-Identifier: AGPL-3.0-or-later
import { ThemeTextSpans } from '../common/ThemeText';
import { DialogHeader } from '../common/DialogHeader';
import { THEME_TEXT_COLORS_KEY } from '../../model/ThemeCatalog';

import { common } from '@kit.AbilityKit';
import { pasteboard } from '@kit.BasicServicesKit';
import { 同步服务 } from '../../backend/同步服务';
import { 后端错误 } from '../../backend/错误类型';
import type { SyncAuth } from '../../proto/messages/SyncMessages';
import {
  清除同步凭证,
  加载同步凭证,
  保存同步凭证,
  加载媒体同步开关,
  设置媒体同步开关,
  loadCustomSyncServer,
  saveCustomSyncServer,
  loadAutoSyncEnabled,
  saveAutoSyncEnabled
} from '../../model/同步凭证存储';
import type { 同步凭证信息 } from '../../model/同步凭证存储';
import { 分类同步错误 } from '../../model/同步流程';
import { normalizeSyncServer, syncActivity } from '../../model/SyncSettings';
import { 设置面板色板, 设置面板色板_取 } from '../../utils/设置面板配色';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 颜色键 } from '../../model/颜色主题';
import { 设置分组卡片 } from './设置分组卡片';

// ========================================================
// @块ID UI-SYNC-GROUP-001
// @名称 AnkiWeb 云同步分组
//
// @作用
// 仅负责登录/注销状态机，同步流程已抽到独立弹窗 SyncPanel。
// 三态简化为两态：未登录（登录表单）/ 已登录（账号 + 立即同步/注销）。
// 点「立即同步」时 加载同步凭证 拿最新凭证（端点可能被 SyncPanel 更新过），
// 上抛 打开同步弹窗回调(凭证, 账号名) 给 Index，Index 挂载 SyncPanel 弹窗。
//
// 同步流程不再放在本组件的原因：
// - 之前在 SettingsPanel 内 syncing 中关闭会导致定时器泄漏、错误被吞、冲突中断；
// - SyncPanel 作为独立弹窗，关闭守卫确保 syncing/conflict/abortRequested 期间不可关闭。
//
// @输入
// 是否深色：当前是否深色模式（影响色板取值）。
// 打开同步弹窗回调 / 点击导出数据回调 / 打开说明回调：父组件注入。
//
// @输出
// 渲染同步分组卡片；用户登录/注销/同步时分别上抛对应回调。
//
// @副作用
// 调用 加载同步凭证 / 保存同步凭证 / 清除同步凭证 读写本地凭证；
// 调用 同步服务.同步登录 与 AnkiWeb 通信。
// ========================================================
@Component
export struct 同步分组 {
  @Prop 简洁模式: boolean = true;
  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  @Prop 是否深色: boolean = false;
  // 用户点「立即同步」：上抛当前凭证 + 账号名给 Index，Index 挂载 SyncPanel 弹窗
  打开同步弹窗回调: (凭证: SyncAuth, 账号名: string) => void = (_凭证: SyncAuth, _账号名: string): void => {};
  // 用户选「先备份后同步」：上抛给 Index 打开 DataTransferPanel 导出 collection
  // 备份完成用户自己回到设置页再点「立即同步」—— 备份与同步是两步分离操作
  点击导出数据回调: () => void = (): void => {};
  // ⓘ 按钮上抛：由父组件 SettingsPanel 统一渲染 FieldHelpPanel 浮层（与其他分组一致）
  打开说明回调: (标题: Resource, 正文: Resource) => void = (_标题: Resource, _正文: Resource): void => {};

  // @StorageLink 让本组件在 主色按钮背景 变化时立即重渲染；解析主色按钮背景() 直接引用此字段，
  // 让登录按钮主色在颜色主题切换瞬间同步更新（与 外观分组 同款机制）。
  @StorageLink(颜色键.主色按钮背景) private 主色按钮背景链接: string = '';
  // B12-Y5 2026-07-29 修复 Bug 1：@StorageProp('themeMode') 让主题模式切换直接触发重 build，
  // 不依赖 @Prop 是否深色 传播（aurora 主题 主色按钮背景 深浅色相同，@StorageLink 可能不触发）。
  @StorageProp('themeMode') private 主题模式监听: string = 'system';

  // ---- @State 全部集中声明在 struct 顶部（ArkTS 约束） ----
  /** 状态机：未登录 / 已登录（同步流程在 SyncPanel 弹窗，不占 当前状态） */
  @State private 当前状态: '未登录' | '已登录' = '未登录';
  /** 登录表单输入 */
  @State private 用户名输入: string = '';
  @State private 密码输入: string = '';
  /** 登录请求进行中（按钮 busy 态显示 sync_logging_in） */
  @State private 登录中: boolean = false;
  /** 已登录账号名（仅展示用） */
  @State private 账号名: string = '';
  /** 错误提示（面板内红字） */
  @State private 错误文本: string = '';
  /** 媒体同步开关（对齐 Anki 桌面端 Preferences → Sync → "Sync media"）。 */
  @State private 媒体同步开启: boolean = true;
  @State private serverInput: string = '';
  @State private savedServer: string = '';
  @State private settingsSaving: boolean = false;
  @State private autoSyncEnabled: boolean = true;
  @State private serverError: string = '';

  // ---- 内部（非 @State，不参与 UI 刷新） ----
  /** 登录成功后持有的会话凭证（hkey + endpoint） */
  private 鉴权凭证: SyncAuth | null = null;

  private readonly 同步服务实例: 同步服务 = new 同步服务();
  /** 居中弹窗控制器：手机窗口宽度 < 600vp 时 bindSheet 只能底部弹出，改用 CustomDialog 保证居中。 */
  private serverDialogController: CustomDialogController = new CustomDialogController({
    builder: 自定义服务器弹窗({
      serverInput: this.serverInput,
      serverError: this.serverError,
      当前状态: this.当前状态,
      登录中: this.登录中,
      settingsSaving: this.settingsSaving,
      是否深色: this.是否深色,
      onSave: (): void => { this.saveServer(); },
      onClose: (): void => { this.closeServerDialog(); }
    }),
    autoCancel: false,
    alignment: DialogAlignment.Center,
    customStyle: true,
    onWillDismiss: (dismiss: DismissDialogAction): void => {
      if (this.settingsSaving) {
        return;
      }
      this.serverInput = this.savedServer;
      this.serverError = '';
      dismiss.dismiss();
    }
  });
  // AnkiWeb 注册页（外部网址保留原文，与 设置面板.AnkiWeb网址 同款约定）
  private readonly 注册网址: string = 'https://ankiweb.net/account/signup';

  aboutToAppear(): void {
    // 启动读取本地凭证：有 hkey 直接进 已登录（重启免登录）
    const 信息: 同步凭证信息 | null = 加载同步凭证();
    if (信息 !== null) {
      const 凭证: SyncAuth = {
        hkey: 信息.hkey,
        endpoint: 信息.endpoint,
        ioTimeoutSecs: 0
      };
      this.鉴权凭证 = 凭证;
      this.账号名 = 信息.username;
      this.当前状态 = '已登录';
    } else {
      this.当前状态 = '未登录';
    }
    // 读取媒体同步开关（默认 true）
    this.媒体同步开启 = 加载媒体同步开关();
    this.savedServer = loadCustomSyncServer();
    this.serverInput = this.savedServer;
    this.autoSyncEnabled = loadAutoSyncEnabled();
  }

  /** 后台媒体仍使用当前账户，完成前不接受凭证或服务器变更。 */
  private syncSettingsBusy(): boolean {
    if (!syncActivity.isActive()) return false;
    this.错误文本 = this.取本地化文本($r('app.string.sync_already_running'));
    return true;
  }

  /** 先校验并保存目标，再允许登录，避免未保存地址和实际登录目标不一致。 */
  private async saveServer(): Promise<void> {
    if (this.syncSettingsBusy()) return;
    if (this.登录中 || this.settingsSaving || this.当前状态 === '已登录') return;
    this.serverError = '';
    try {
      normalizeSyncServer(this.serverInput);
    } catch (error) {
      this.serverError = this.取本地化文本($r('app.string.sync_server_invalid'));
      return;
    }
    this.settingsSaving = true;
    try {
      this.savedServer = await saveCustomSyncServer(this.serverInput);
      this.serverInput = this.savedServer;
      this.密码输入 = '';
      this.serverDialogController.close();
    } catch (error) {
      this.serverError = this.取本地化文本($r('app.string.sync_settings_save_failed'));
    } finally {
      this.settingsSaving = false;
    }
  }

  /** 每次打开都从已保存地址开始，取消的草稿不会影响账号登录。 */
  private openServerDialog(): void {
    if (this.登录中 || this.settingsSaving) return;
    this.serverInput = this.savedServer;
    this.serverError = '';
    this.serverDialogController.open();
  }

  /** 保存中不可关闭；取消时丢弃草稿和表单错误。 */
  private closeServerDialog(): void {
    if (this.settingsSaving) return;
    this.serverInput = this.savedServer;
    this.serverError = '';
    this.serverDialogController.close();
  }

  /** 只有持久化成功才接受自动同步开关；失败可在面板内重试。 */
  private async changeAutoSync(enabled: boolean): Promise<void> {
    if (this.settingsSaving) return;
    this.settingsSaving = true;
    this.错误文本 = '';
    const previous: boolean = this.autoSyncEnabled;
    this.autoSyncEnabled = enabled;
    try {
      await saveAutoSyncEnabled(enabled);
    } catch (error) {
      this.autoSyncEnabled = previous;
      this.错误文本 = this.取本地化文本($r('app.string.sync_settings_save_failed'));
    } finally {
      this.settingsSaving = false;
    }
  }

  private 取本地化文本(资源: Resource): string {
    return this.getUIContext().getHostContext()!.resourceManager.getStringSync(资源.id);
  }

  /** 按钮背景专用主色（配 #FFFFFF 文字 ≥ 4.5:1）。2.1.4.1 深色模式修复。 */
  private 解析主色按钮背景(): string {
    return this.主色按钮背景链接 !== '' ? this.主色按钮背景链接 : 设置面板色板_取(this.是否深色).主色按钮背景;
  }

  /**
   * 前往注册：用系统浏览器打开 AnkiWeb 注册页（与 设置面板.打开AnkiWeb网址 同款约定，
   * 不在 app 内嵌 Web 打开，避免登录态与本应用混淆）。无可用浏览器时兜底复制网址到剪贴板 + toast。
   */
  private 打开注册页(): void {
    const 上下文: common.UIAbilityContext =
      this.getUIContext().getHostContext() as common.UIAbilityContext;
    上下文.startAbility({
      action: 'ohos.want.action.viewData',
      uri: this.注册网址
    }).catch(async (错误: Error): Promise<void> => {
      try {
        const 剪贴数据: pasteboard.PasteData =
          pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, this.注册网址);
        await pasteboard.getSystemPasteboard().setData(剪贴数据);
        this.getUIContext().getPromptAction().showToast({
          message: $r('app.string.about_ankiweb_open_failed')
        });
      } catch (剪贴错误) {
        // 复制失败静默；用户仍可按说明文字手动搜索 AnkiWeb 注册
      }
    });
  }

  // ========================================================
  // @块ID UI-SYNC-GROUP-002
  // @名称 登录处理
  //
  // @作用
  // 登录：成功持久化 hkey（密码绝不落盘）；失败按 分类同步错误 归类提示，停留 未登录。
  //
  // @输入
  // 用户名输入 / 密码输入：当前表单输入值（来自 @State）。
  //
  // @输出
  // 成功 → 鉴权凭证 / 账号名 / 当前状态 更新；失败 → 错误文本 填充分类后的提示。
  //
  // @副作用
  // 调用 同步服务实例.同步登录 与 AnkiWeb 通信；
  // 成功后调用 保存同步凭证 持久化凭证（密码绝不落盘）。
  // ========================================================
  private async 点击登录(): Promise<void> {
    if (this.syncSettingsBusy()) return;
    if (this.登录中 || this.settingsSaving || this.serverInput !== this.savedServer) {
      return;
    }
    this.登录中 = true;
    this.错误文本 = '';
    try {
      const 凭证: SyncAuth = await this.同步服务实例.同步登录(
        this.用户名输入, this.密码输入, this.savedServer);
      const 信息: 同步凭证信息 = {
        hkey: 凭证.hkey,
        username: this.用户名输入,
        endpoint: 凭证.endpoint
      };
      保存同步凭证(信息);
      this.鉴权凭证 = 凭证;
      this.账号名 = this.用户名输入;
      this.密码输入 = '';
      this.错误文本 = '';
      this.当前状态 = '已登录';
    } catch (error) {
      const 错误对象: Error = error instanceof Error ? error : new Error(`${error}`);
      const 后端错误类别编号: number | undefined = 错误对象 instanceof 后端错误 ? 错误对象.kind : undefined;
      const 类别 = 分类同步错误(错误对象, 后端错误类别编号);
      if (类别 === 'auth') {
        // 诊断阶段：附带 kind 与实际错误信息，定位"原本可以现在不行"的真实原因
        this.错误文本 = `${this.取本地化文本($r('app.string.sync_error_auth'))} [kind=${后端错误类别编号 ?? -1}]：${错误对象.message}`;
      } else if (类别 === 'network') {
        // 诊断阶段：附带 kind 与实际错误信息
        this.错误文本 = `${this.取本地化文本($r('app.string.sync_error_network'))} [kind=${后端错误类别编号 ?? -1}]：${错误对象.message}`;
      } else {
        this.错误文本 = `${this.取本地化文本($r('app.string.sync_error_generic'))} [kind=${后端错误类别编号 ?? -1}]：${错误对象.message}`;
      }
    } finally {
      this.登录中 = false;
    }
  }

  /** 注销：弹 AlertDialog 二次确认后清空本地凭证与面板状态，回登录表单。 */
  private 点击注销(): void {
    if (this.syncSettingsBusy()) return;
    this.getUIContext().showAlertDialog({
      title: this.取本地化文本($r('app.string.sync_logout')),
      message: this.取本地化文本($r('app.string.sync_logout_confirm_message')),
      autoCancel: false,
      alignment: DialogAlignment.Center,
      primaryButton: {
        value: $r('app.string.cancel'),
        action: (): void => {}
      },
      secondaryButton: {
        value: $r('app.string.sync_logout'),
        fontColor: $r('app.color.error_text'),
        action: (): void => {
          this.确认注销();
        }
      }
    });
  }

  /** 真正执行注销：清凭证 + 清状态 + 回 未登录。 */
  private 确认注销(): void {
    if (this.syncSettingsBusy()) return;
    清除同步凭证();
    this.鉴权凭证 = null;
    this.账号名 = '';
    this.错误文本 = '';
    this.用户名输入 = '';
    this.密码输入 = '';
    this.当前状态 = '未登录';
  }

  /**
   * 立即同步：加载同步凭证 拿最新凭证（端点可能被上次 SyncPanel 更新过），
   * 上抛 打开同步弹窗回调 给 Index 挂载 SyncPanel 弹窗。
   */
  private 点击立即同步(): void {
    if (this.syncSettingsBusy()) return;
    const 信息: 同步凭证信息 | null = 加载同步凭证();
    if (信息 === null) {
      this.错误文本 = this.取本地化文本($r('app.string.sync_error_session_expired'));
      this.当前状态 = '未登录';
      return;
    }
    const 凭证: SyncAuth = {
      hkey: 信息.hkey,
      endpoint: 信息.endpoint,
      ioTimeoutSecs: 0
    };
    this.鉴权凭证 = 凭证;
    this.错误文本 = '';
    this.打开同步弹窗回调(凭证, this.账号名);
  }

  // ========================================================
  // @块ID UI-SYNC-GROUP-003
  // @名称 未登录内容
  //
  // @作用
  // 渲染未登录态：副标题 + 用户名/密码输入 + 登录按钮 + 错误红字。
  //
  // @输入
  // 色板：当前色板。
  //
  // @输出
  // 渲染登录表单；点击登录时调用 点击登录。
  //
  // @副作用
  // 无（点击登录的副作用见 UI-SYNC-GROUP-002）。
  // ========================================================
  @Builder
  private 未登录内容(色板: 设置面板色板) {
    Text(this.savedServer === '' ? $r('app.string.sync_subtitle_logged_out') : $r('app.string.sync_custom_account_hint'))
      .fontSize(12)
      .fontColor(色板.次文字)
      .width('100%')
    // 账号前置说明：同步需先有 Anki 账号，右侧「前往注册」拉起系统浏览器打开 AnkiWeb 注册页
    if (this.savedServer === '') {
      Row({ space: 6 }) {
        Text($r('app.string.sync_account_required_hint'))
          .fontSize(12)
          .fontColor(色板.三级文字)
          .layoutWeight(1)
        Text() { ThemeTextSpans($r('app.string.sync_register_link'), this.themeAccentColors, this.getUIContext()) }
          .fontSize(12)
          .fontWeight(FontWeight.Medium)
          .fontColor(this.解析主色按钮背景())
          .onClick((): void => {
            this.打开注册页();
          })
      }
      .width('100%')
    }
    TextInput({ placeholder: this.savedServer === '' ? $r('app.string.sync_username_hint') :
      $r('app.string.sync_custom_username_hint'), text: this.用户名输入 })
      .width('100%')
      .height(44)
      .fontSize(14)
      .fontColor(色板.主文字)
      .placeholderColor(色板.弱化文字)
      .backgroundColor(色板.标签背景)
      .borderRadius(应用尺寸.圆角_面板)
      .padding({ left: 12, right: 12 })
      .enabled(!this.登录中)
      .onChange((值: string) => {
        this.用户名输入 = 值;
      })
    TextInput({ placeholder: $r('app.string.sync_password_hint'), text: this.密码输入 })
      .width('100%')
      .height(44)
      .fontSize(14)
      .fontColor(色板.主文字)
      .placeholderColor(色板.弱化文字)
      .backgroundColor(色板.标签背景)
      .borderRadius(应用尺寸.圆角_面板)
      .padding({ left: 12, right: 12 })
      .type(InputType.Password)
      .enabled(!this.登录中)
      .onChange((值: string) => {
        this.密码输入 = 值;
      })
      .onSubmit((): void => {
        this.点击登录();
      })
    Button(this.登录中 ? $r('app.string.sync_logging_in') : $r('app.string.sync_login'))
      .width('100%')
      .height(44)
      .fontSize(15)
      .fontColor('#FFFFFF')
      .backgroundColor(this.解析主色按钮背景())
      .borderRadius(22)
      .enabled(!this.登录中 && !this.settingsSaving && this.serverInput === this.savedServer)
      .opacity(this.登录中 || this.settingsSaving || this.serverInput !== this.savedServer ? 0.6 : 1)
      .onClick((): void => {
        this.点击登录();
      })
    if (this.错误文本 !== '') {
      Text(this.错误文本)
        .fontSize(12)
        .fontColor(色板.错误色)
        .width('100%')
        .maxLines(8)
    }
  }

  // ========================================================
  // @块ID UI-SYNC-GROUP-004
  // @名称 已登录内容
  //
  // @作用
  // 渲染已登录态：账号名 + 先备份后同步/立即同步/注销 三按钮 + 错误提示。
  // B12-Y2 2026-07-22：三按钮都用中性底（标签背景），无主色按钮。
  // 用户决策：三个按钮不需要颜色，因「立即同步」与「先备份后同步」都是用户主动选的操作，
  // 无主次关系；注销按钮本就是次按钮，统一风格更协调。
  //
  // @输入
  // 色板：当前色板。
  //
  // @输出
  // 渲染已登录面板；点击各按钮时上抛对应回调。
  //
  // @副作用
  // 无（点击立即同步/注销的副作用见对应方法）。
  // ========================================================
  @Builder
  private 已登录内容(色板: 设置面板色板) {
    Text(this.账号名)
      .fontSize(15)
      .fontColor(色板.主文字)
      .width('100%')
      .maxLines(1)
      .textOverflow({ overflow: TextOverflow.Ellipsis })
    // 媒体同步开关（对齐 Anki 桌面端 Preferences → Sync → "Sync media"）。
    // 关闭后 syncCollection 传 syncMedia=false，跳过媒体阶段。
    Row() {
      Column({ space: 2 }) {
        Text($r('app.string.settings_sync_media_toggle'))
          .fontSize(15)
          .fontColor(色板.主文字)
        Text($r('app.string.settings_sync_media_toggle_hint'))
          .fontSize(12)
          .fontColor(色板.三级文字)
      }
      .alignItems(HorizontalAlign.Start)
      .layoutWeight(1)

      Toggle({ type: ToggleType.Switch, isOn: this.媒体同步开启 })
        .selectedColor(this.解析主色按钮背景())
        .onChange((值: boolean): void => {
          this.媒体同步开启 = 值;
          设置媒体同步开关(值);
        })
    }
    .width('100%')
    .padding({ top: 4, bottom: 4 })
    Row({ space: 8 }) {
      Button($r('app.string.sync_backup_first'))
        .layoutWeight(1)
        .height(40)
        .fontSize(12)
        .padding({ left: 4, right: 4 })
        .fontColor(色板.主文字)
        .backgroundColor(色板.标签背景)
        .borderRadius(20)
        .onClick((): void => {
          this.点击导出数据回调();
        })
      Button($r('app.string.sync_now'))
        .layoutWeight(1)
        .height(40)
        .fontSize(12)
        .padding({ left: 4, right: 4 })
        .fontColor(色板.主文字)
        .backgroundColor(色板.标签背景)
        .borderRadius(20)
        .onClick((): void => {
          this.点击立即同步();
        })
      Button($r('app.string.sync_logout'))
        .layoutWeight(1)
        .height(40)
        .fontSize(12)
        .padding({ left: 4, right: 4 })
        .fontColor(色板.主文字)
        .backgroundColor(色板.标签背景)
        .borderRadius(20)
        .onClick((): void => {
          this.点击注销();
        })
    }
    .width('100%')
    if (this.错误文本 !== '') {
      Text(this.错误文本)
        .fontSize(12)
        .fontColor(色板.错误色)
        .width('100%')
        .maxLines(8)
    }
  }

  build() {
    Column({ space: 2 }) {
      设置分组卡片({
        标题: $r('app.string.settings_sync_group'),
        是否深色: this.是否深色,

        帮助标题: $r('app.string.settings_sync_group'),
        帮助正文: $r('app.string.sync_help_text'),

        打开说明回调: this.打开说明回调
      }) {
        Column({ space: 10 }) {
          this.autoSyncSetting(设置面板色板_取(this.是否深色))
          if (this.当前状态 === '未登录') {
            this.未登录内容(设置面板色板_取(this.是否深色))
          } else {
            this.已登录内容(设置面板色板_取(this.是否深色))
          }
          Row() {
            Button() {
              Text($r('app.string.sync_custom_server_entry'))
                .fontSize(12)
                .fontColor(设置面板色板_取(this.是否深色).次文字)
            }
            .type(ButtonType.Normal)
            .backgroundColor(Color.Transparent)
            .height(32)
            .padding(0)
            .enabled(!this.登录中 && !this.settingsSaving)
            .onClick((): void => { this.openServerDialog(); })
          }
          .width('100%')
          .justifyContent(FlexAlign.Start)
        }
        .width('100%')
      }
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
  }

  /** 自动同步开关保留在同步分组内，不随服务器弹窗隐藏。 */
  @Builder
  private autoSyncSetting(色板: 设置面板色板) {
    Row({ space: 10 }) {
      Column({ space: 2 }) {
        Text($r('app.string.sync_auto_label')).fontSize(15).fontColor(色板.主文字)
        Text($r('app.string.sync_auto_hint')).fontSize(12).fontColor(色板.次文字)
      }
      .alignItems(HorizontalAlign.Start)
      .layoutWeight(1)
      Toggle({ type: ToggleType.Switch, isOn: this.autoSyncEnabled })
        .selectedColor(this.解析主色按钮背景())
        .enabled(!this.settingsSaving && !this.登录中)
        .onChange((enabled: boolean): void => { this.changeAutoSync(enabled); })
    }
    .width('100%')
  }
}

// ========================================================
// @块ID UI-SYNC-GROUP-005
// @名称 自定义同步服务器居中弹窗
//
// @作用
// 编辑自建同步服务器基础地址。手机窗口宽度 < 600vp 时 bindSheet 只支持底部弹出
// （SheetType.CENTER 被忽略），改用 CustomDialogController 保证屏幕居中，
// 且不受设置页滚动容器裁剪。
//
// @输入
// serverInput / serverError：地址草稿与校验错误（与父组件 @State 双向同步）。
// 当前状态 / 登录中 / settingsSaving：控制表单可编辑性与关闭守卫。
// 是否深色：AppStorage 未就绪时的色板兜底值。
// onSave / onClose：父组件的保存与取消回调。
//
// @输出
// 渲染「同步服务器」弹窗；保存/取消时回调父组件。
//
// @业务规则
// 保存中不可关闭；取消时草稿回滚由父组件 closeServerDialog 完成。
//
// @副作用
// 无（偏好持久化由父组件完成）。
// ========================================================
@CustomDialog
struct 自定义服务器弹窗 {
  controller?: CustomDialogController;
  @Link serverInput: string;
  @Link serverError: string;
  @Link 当前状态: '未登录' | '已登录';
  @Link 登录中: boolean;
  @Link settingsSaving: boolean;
  @Prop 是否深色: boolean = false;
  // 主题模式变化时重渲染，让 设置面板色板_取 重新读 AppStorage（与 同步分组 同款机制）。
  @StorageProp('themeMode') private 主题模式监听: string = 'system';
  onSave: () => void = (): void => {};
  onClose: () => void = (): void => {};

  build() {
    // 外层占满窗口，卡片再取 88%：与 AnkiWeb引导对话框 / 云端牌组弹窗 同结构，
    // 百分比宽度才有确定的参照物。
    Column() {
      Column({ space: 应用尺寸.间距_12 }) {
        DialogHeader({
          title: $r('app.string.sync_server_label'),
          actionLabel: $r('app.string.sync_server_save'),
          actionEnabled: this.当前状态 === '未登录' && !this.登录中 && !this.settingsSaving,
          closeEnabled: !this.settingsSaving,
          onAction: (): void => { this.onSave(); },
          onClose: (): void => { this.onClose(); }
        })
        this.服务器表单(设置面板色板_取(this.是否深色))
        if (this.serverError !== '') {
          Text(this.serverError)
            .fontSize(12)
            .fontColor(设置面板色板_取(this.是否深色).错误色)
            .width('100%')
        }
      }
      .width('88%')
      .constraintSize({ maxWidth: 480, maxHeight: '88%' })
      .padding(应用尺寸.间距_16)
      .backgroundColor($r('app.color.surface_card'))
      .borderRadius(应用尺寸.圆角_卡片)
      .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
    }
    .width('100%')
    .alignItems(HorizontalAlign.Center)
  }

  @Builder
  private 服务器表单(色板: 设置面板色板) {
    Text(this.当前状态 === '已登录' ? $r('app.string.sync_server_logout_hint') : $r('app.string.sync_server_hint'))
      .fontSize(12)
      .fontColor(色板.次文字)
      .width('100%')
    TextInput({ text: this.serverInput, placeholder: $r('app.string.sync_server_placeholder') })
      .fontSize(14)
      .fontColor(色板.主文字)
      .placeholderColor(色板.弱化文字)
      .backgroundColor(色板.标签背景)
      .borderRadius(应用尺寸.圆角_面板)
      .height(44)
      .enabled(this.当前状态 === '未登录' && !this.登录中 && !this.settingsSaving)
      .onChange((value: string): void => { this.serverInput = value; })
  }
}
