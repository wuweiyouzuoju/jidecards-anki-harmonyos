// SPDX-License-Identifier: AGPL-3.0-or-later

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
  加载自定义同步配置,
  保存自定义同步配置,
  生效同步端点
} from '../../model/同步凭证存储';
import type { 同步凭证信息, 自定义同步配置 } from '../../model/同步凭证存储';
import { 分类同步错误, 校验同步服务器地址 } from '../../model/同步流程';
import { 设置面板色板, 设置面板色板_取 } from '../../utils/设置面板配色';
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
// 是否展开：本分组是否展开。
// 切换展开回调 / 打开同步弹窗回调 / 点击导出数据回调 / 打开说明回调：父组件注入。
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
  @Prop 是否深色: boolean = false;
  @Prop 是否展开: boolean = false;
  切换展开回调: () => void = (): void => {};
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
  /** 自定义同步服务器（对齐 AnkiDroid Custom Sync Server：开关 + 地址 + 根证书）。 */
  @State private 自定义同步启用: boolean = false;
  @State private 自定义同步地址: string = '';
  @State private 自定义地址错误: string = '';
  @State private 自定义证书输入: string = '';
  @State private 自定义证书状态: string = '';
  @State private 证书应用中: boolean = false;

  // ---- 内部（非 @State，不参与 UI 刷新） ----
  /** 登录成功后持有的会话凭证（hkey + endpoint） */
  private 鉴权凭证: SyncAuth | null = null;

  private readonly 同步服务实例: 同步服务 = new 同步服务();
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
    // 读取自定义同步服务器配置（对齐 AnkiDroid：syncBaseUrl + 开关 + 证书）
    const 自定义: 自定义同步配置 = 加载自定义同步配置();
    this.自定义同步启用 = 自定义.启用;
    this.自定义同步地址 = 自定义.地址;
    this.自定义证书输入 = 自定义.证书;
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
    if (this.登录中) {
      return;
    }
    this.登录中 = true;
    this.错误文本 = '';
    try {
      // 登录前应用自定义根证书（对齐 AnkiDroid syncAuth() 先 updateCustomCertificate；
      // 空串 = 取消自定义证书，自签名服务器登录同样需要证书校验通过）。
      await this.应用自定义证书();
      // 端点解析对齐 AnkiDroid LoginFragment：getEndpoint() 结果传给 syncLogin
      const 端点: string = 生效同步端点();
      const 凭证: SyncAuth = await this.同步服务实例.同步登录(this.用户名输入, this.密码输入, 端点);
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
   * 端点经 生效同步端点 解析（服务器下发端点 > 自定义服务器地址 > 官方），
   * 同步前应用自定义根证书（对齐 AnkiDroid syncAuth() 的 updateCustomCertificate）。
   */
  private async 点击立即同步(): Promise<void> {
    const 信息: 同步凭证信息 | null = 加载同步凭证();
    if (信息 === null) {
      this.错误文本 = this.取本地化文本($r('app.string.sync_error_session_expired'));
      this.当前状态 = '未登录';
      return;
    }
    await this.应用自定义证书();
    const 凭证: SyncAuth = {
      hkey: 信息.hkey,
      endpoint: 生效同步端点(),
      ioTimeoutSecs: 0
    };
    this.鉴权凭证 = 凭证;
    this.错误文本 = '';
    this.打开同步弹窗回调(凭证, this.账号名);
  }

  // ========================================================
  // @块ID UI-SYNC-GROUP-005
  // @名称 自定义同步服务器内容
  //
  // @作用
  // 渲染自定义同步服务器配置（对齐 AnkiDroid Custom Sync Server 设置屏：
  // 启用开关 + 同步地址 + 自定义根证书 PEM）。自建 ankisyncd 等兼容服务器时使用。
  //
  // @输入
  // 色板：当前色板。
  //
  // @输出
  // 渲染配置区；开关/地址/证书变化即时持久化（地址非法时不落盘并红字提示）。
  //
  // @业务规则
  // 地址校验用 同步流程.校验同步服务器地址（空串合法 = 未设置）。
  // 保存自定义配置会清除服务器下发端点（对齐 AnkiDroid：切换服务器后旧迁移端点失效）。
  // 证书经后端 设置自定义证书 校验生效；空串 = 取消自定义证书。
  //
  // @副作用
  // 调用 保存自定义同步配置 写偏好；点击应用证书调用 同步服务.设置自定义证书。
  // ========================================================

  /** 持久化当前自定义同步服务器配置（三键一次落盘）。 */
  private 保存当前自定义配置(): void {
    保存自定义同步配置({
      启用: this.自定义同步启用,
      地址: this.自定义同步地址,
      证书: this.自定义证书输入.trim()
    });
  }

  /** 地址输入变化：trim 后校验，合法（或空）才落盘，非法只提示不落盘。 */
  private 校验并保存地址(原始输入: string): void {
    const 地址: string = 原始输入.trim();
    this.自定义同步地址 = 地址;
    if (!校验同步服务器地址(地址)) {
      this.自定义地址错误 = this.取本地化文本($r('app.string.settings_sync_custom_server_url_invalid'));
      return;
    }
    this.自定义地址错误 = '';
    this.保存当前自定义配置();
  }

  /** 证书输入变化：文本总是可保存（是否可用由后端校验决定），立即落盘。 */
  private 更新自定义证书(值: string): void {
    this.自定义证书输入 = 值;
    this.保存当前自定义配置();
  }

  /**
   * 把当前证书文本注入后端（空串 = 取消自定义证书）。
   * 后端不可用或证书无法解析时返回 false；调用方决定是否提示。
   */
  private async 应用自定义证书(): Promise<boolean> {
    try {
      return await this.同步服务实例.设置自定义证书(this.自定义证书输入.trim());
    } catch (错误) {
      // 后端异常静默：登录/同步流程自身会报出更具体的错误
      return false;
    }
  }

  /** 手动应用证书：展示后端校验结果（生效 / 无法解析）。 */
  private async 点击应用证书(): Promise<void> {
    if (this.证书应用中) {
      return;
    }
    this.证书应用中 = true;
    const 生效: boolean = await this.应用自定义证书();
    this.自定义证书状态 = this.取本地化文本(生效
      ? $r('app.string.settings_sync_custom_certificate_updated')
      : $r('app.string.settings_sync_custom_certificate_invalid'));
    this.证书应用中 = false;
  }

  @Builder
  private 自定义同步服务器内容(色板: 设置面板色板) {
    Divider()
      .color(色板.分隔线)
      .strokeWidth(1)
      .margin({ top: 4, bottom: 4 })
    Text($r('app.string.settings_sync_custom_server_title'))
      .fontSize(13)
      .fontWeight(FontWeight.Medium)
      .fontColor(色板.次文字)
      .width('100%')
    Text($r('app.string.settings_sync_custom_server_toggle_hint'))
      .fontSize(12)
      .fontColor(色板.三级文字)
      .width('100%')
    Row() {
      Text($r('app.string.settings_sync_custom_server_toggle'))
        .fontSize(15)
        .fontColor(色板.主文字)
        .layoutWeight(1)
      Toggle({ type: ToggleType.Switch, isOn: this.自定义同步启用 })
        .selectedColor(this.解析主色按钮背景())
        .onChange((值: boolean): void => {
          this.自定义同步启用 = 值;
          this.保存当前自定义配置();
        })
    }
    .width('100%')
    .padding({ top: 2, bottom: 2 })
    TextInput({ placeholder: $r('app.string.settings_sync_custom_server_url_hint'), text: this.自定义同步地址 })
      .width('100%')
      .height(44)
      .fontSize(14)
      .fontColor(色板.主文字)
      .placeholderColor(色板.弱化文字)
      .backgroundColor(色板.输入框背景)
      .borderRadius(8)
      .padding({ left: 12, right: 12 })
      .onChange((值: string) => {
        this.校验并保存地址(值);
      })
    if (this.自定义地址错误 !== '') {
      Text(this.自定义地址错误)
        .fontSize(12)
        .fontColor(色板.错误色)
        .width('100%')
    }
    Text($r('app.string.settings_sync_custom_certificate_label'))
      .fontSize(13)
      .fontWeight(FontWeight.Medium)
      .fontColor(色板.次文字)
      .width('100%')
    Text($r('app.string.settings_sync_custom_certificate_hint'))
      .fontSize(12)
      .fontColor(色板.三级文字)
      .width('100%')
    TextArea({ placeholder: $r('app.string.settings_sync_custom_certificate_hint'), text: this.自定义证书输入 })
      .width('100%')
      .height(72)
      .fontSize(12)
      .fontColor(色板.主文字)
      .placeholderColor(色板.弱化文字)
      .backgroundColor(色板.输入框背景)
      .borderRadius(8)
      .padding(8)
      .onChange((值: string) => {
        this.更新自定义证书(值);
      })
    Row({ space: 8 }) {
      Button($r('app.string.settings_sync_custom_certificate_apply'))
        .height(32)
        .fontSize(12)
        .padding({ left: 12, right: 12 })
        .fontColor(色板.主文字)
        .backgroundColor(色板.标签背景)
        .borderRadius(16)
        .enabled(!this.证书应用中)
        .onClick((): void => {
          this.点击应用证书();
        })
      if (this.自定义证书状态 !== '') {
        Text(this.自定义证书状态)
          .fontSize(12)
          .fontColor(色板.三级文字)
          .layoutWeight(1)
          .maxLines(2)
      }
    }
    .width('100%')
    Text($r('app.string.settings_sync_custom_server_section_hint'))
      .fontSize(12)
      .fontColor(色板.弱化文字)
      .width('100%')
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
    Text($r('app.string.sync_subtitle_logged_out'))
      .fontSize(12)
      .fontColor(色板.次文字)
      .width('100%')
    // 账号前置说明：同步需先有 Anki 账号，右侧「前往注册」拉起系统浏览器打开 AnkiWeb 注册页
    Row({ space: 6 }) {
      Text($r('app.string.sync_account_required_hint'))
        .fontSize(12)
        .fontColor(色板.三级文字)
        .layoutWeight(1)
      Text($r('app.string.sync_register_link'))
        .fontSize(12)
        .fontWeight(FontWeight.Medium)
        .fontColor(this.解析主色按钮背景())
        .onClick((): void => {
          this.打开注册页();
        })
    }
    .width('100%')
    TextInput({ placeholder: $r('app.string.sync_username_hint'), text: this.用户名输入 })
      .width('100%')
      .height(44)
      .fontSize(14)
      .fontColor(色板.主文字)
      .placeholderColor(色板.弱化文字)
      .backgroundColor(色板.标签背景)
      .borderRadius(8)
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
      .borderRadius(8)
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
      .enabled(!this.登录中)
      .opacity(this.登录中 ? 0.6 : 1)
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
    设置分组卡片({
      标题: $r('app.string.settings_sync_group'),
      是否深色: this.是否深色,
      是否展开: this.是否展开,
      帮助标题: $r('app.string.settings_sync_group'),
      帮助正文: $r('app.string.sync_help_text'),
      切换展开回调: this.切换展开回调,
      打开说明回调: this.打开说明回调
    }) {
      Column({ space: 10 }) {
        if (this.当前状态 === '未登录') {
          this.未登录内容(设置面板色板_取(this.是否深色))
        } else {
          this.已登录内容(设置面板色板_取(this.是否深色))
        }
        this.自定义同步服务器内容(设置面板色板_取(this.是否深色))
      }
      .width('100%')
    }
  }
}
