// SPDX-License-Identifier: AGPL-3.0-or-later

import { 加载FSRS开启状态, 设置FSRS开启状态, FSRS_STATE_REVISION_KEY } from '../../model/FSRS控制器';
import { 设置面板色板_取, 设置面板色板 } from '../../utils/设置面板配色';
import { 颜色键 } from '../../model/颜色主题';
import { 设置分组卡片 } from './设置分组卡片';

// ========================================================
// @块ID UI-SCHEDULER-001
// @名称 FSRS 调度器分组
//
// @作用
// 提供 FSRS 调度器开关 + 说明小字 + 错误提示。
// 状态自管：是否启用FSRS / FSRS操作中 / FSRS错误信息；aboutToAppear 拉取后端当前值。
// 乐观更新 UI，失败回滚并提示（与原 SettingsPanel 同语义）。
//
// @输入
// 是否深色：当前是否深色模式（影响色板取值）。
// 打开说明回调：父组件注入；打开说明回调 上抛 标题 + 正文 Resource。
//
// @输出
// 渲染 FSRS 调度器分组卡片；用户切换开关时持久化并更新状态。
//
// @副作用
// 调用 加载FSRS开启状态 / 设置FSRS开启状态 读写后端；
// 切换失败时回滚 UI 并显示错误信息。
// ========================================================
@Component
export struct 调度器分组 {
  @Prop 是否深色: boolean = false;
  // ⓘ 按钮上抛：由父组件 SettingsPanel 统一渲染 FieldHelpPanel 浮层，避免嵌在分组卡片内
  打开说明回调: (标题: Resource, 正文: Resource) => void = (_标题: Resource, _正文: Resource): void => {};

  // @StorageLink 让本组件在 主色按钮背景 变化时立即重渲染；解析主色按钮背景() 直接引用此字段，
  // 让 FSRS 选中态主色在颜色主题切换瞬间同步更新（与 外观分组 同款机制）。
  @StorageLink(颜色键.主色按钮背景) private 主色按钮背景链接: string = '';
  // B12-Y5 2026-07-29 修复 Bug 1：@StorageProp('themeMode') 让主题模式切换直接触发重 build，
  // 不依赖 @Prop 是否深色 传播（aurora 主题 主色按钮背景 深浅色相同，@StorageLink 可能不触发）。
  @StorageProp('themeMode') private 主题模式监听: string = 'system';

  @State private 是否启用FSRS: boolean | null = null;
  @State private FSRS操作中: boolean = false;
  @State private FSRS错误信息: string = '';
  @StorageProp(FSRS_STATE_REVISION_KEY) @Watch('onFsrsStateChanged') private fsrsRevision: number = 0;
  private fsrsReadSequence: number = 0;
  private disposed: boolean = false;

  /** 面板打开时拉取 FSRS 当前状态与后端同步。失败时保留 null，UI 显示"读取失败"。 */
  async aboutToAppear(): Promise<void> {
    this.disposed = false;
    await this.刷新FSRS状态();
  }

  aboutToDisappear(): void {
    this.disposed = true;
    this.fsrsReadSequence++;
  }

  /** 同步或其他入口写入后重新读取；当前保存完成后会补一次读取。 */
  private onFsrsStateChanged(): void {
    if (!this.disposed && !this.FSRS操作中) this.刷新FSRS状态();
  }

  private async 刷新FSRS状态(clearError: boolean = true): Promise<void> {
    const sequence: number = ++this.fsrsReadSequence;
    if (clearError) this.FSRS错误信息 = '';
    const 值: boolean | null = await 加载FSRS开启状态();
    if (this.disposed || sequence !== this.fsrsReadSequence) return;
    this.是否启用FSRS = 值;
    if (值 === null && this.FSRS错误信息 === '') {
      this.FSRS错误信息 = this.取本地化文本($r('app.string.settings_fsrs_load_error'));
    }
  }

  // ========================================================
  // @块ID UI-SCHEDULER-002
  // @名称 切换 FSRS 开关
  //
  // @作用
  // 切换 FSRS 开关：乐观更新 UI，失败时回滚并提示。防重入避免快速连击。
  //
  // @输入
  // 值：用户切换后的目标开关状态。
  //
  // @输出
  // 更新 是否启用FSRS / FSRS操作中 / FSRS错误信息；失败时回滚到先前状态。
  //
  // @副作用
  // 调用 设置FSRS开启状态 持久化到后端。
  // ========================================================
  private async 切换FSRS开关(值: boolean): Promise<void> {
    if (this.FSRS操作中 || this.是否启用FSRS === null) {
      return;
    }
    const 先前值: boolean = this.是否启用FSRS;
    this.fsrsReadSequence++;
    this.FSRS操作中 = true;
    this.是否启用FSRS = 值;
    this.FSRS错误信息 = '';
    try {
      await 设置FSRS开启状态(值);
    } catch (error) {
      this.是否启用FSRS = 先前值;
      this.FSRS错误信息 = error instanceof Error ? error.message : `${error}`;
    } finally {
      this.FSRS操作中 = false;
      if (!this.disposed) await this.刷新FSRS状态(false);
    }
  }

  private 取本地化文本(资源: Resource): string {
    return this.getUIContext().getHostContext()!.resourceManager.getStringSync(资源.id);
  }

  /** 按钮背景专用主色（配 #FFFFFF 文字 ≥ 4.5:1）。2.1.4.1 深色模式修复。 */
  private 解析主色按钮背景(): string {
    return this.主色按钮背景链接 !== '' ? this.主色按钮背景链接 : 设置面板色板_取(this.是否深色).主色按钮背景;
  }

  build() {
    设置分组卡片({
      标题: $r('app.string.settings_scheduler'),
      是否深色: this.是否深色,

      帮助标题: $r('app.string.settings_fsrs_label'),
      帮助正文: $r('app.string.settings_fsrs_help'),

      打开说明回调: this.打开说明回调
    }) {
      Column({ space: 8 }) {
          Text($r('app.string.settings_algorithm_scope'))
            .fontSize(13).fontColor(设置面板色板_取(this.是否深色).次文字).width('100%')
          Text($r('app.string.settings_algorithm_deck_options'))
            .fontSize(13).fontColor(设置面板色板_取(this.是否深色).次文字).width('100%')
          // FSRS 开关行：label + Toggle。说明文字已移到 分组头部 的 ⓘ 按钮弹层中。
          // 注意：Toggle 的 isOn 必须用 $$ 双向绑定到 @State，否则开关不响应点击。
          // 但本场景需要乐观更新 + 失败回滚，所以改用单向绑定 + onChange 手动控制。
          Row() {
            Text($r('app.string.settings_fsrs_label'))
              .fontSize(15)
              .fontColor(设置面板色板_取(this.是否深色).主文字)
              .layoutWeight(1)
            Blank()
            if (this.是否启用FSRS === null) {
              Text($r('app.string.settings_fsrs_loading'))
                .fontSize(13)
                .fontColor(设置面板色板_取(this.是否深色).三级文字)
            } else {
              Toggle({ type: ToggleType.Switch, isOn: this.是否启用FSRS })
                .selectedColor(this.解析主色按钮背景())
                .enabled(!this.FSRS操作中)
                .onChange((值: boolean): void => {
                  this.切换FSRS开关(值);
                })
            }
          }
          .width('100%')
          .padding({ top: 8, bottom: 8 })

          if (this.FSRS错误信息 !== '') {
            Text(this.FSRS错误信息)
              .fontSize(12)
              .fontColor(设置面板色板_取(this.是否深色).错误色)
              .width('100%')
          }
      }
      .width('100%')
    }
  }
}
