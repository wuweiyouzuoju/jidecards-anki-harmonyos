// SPDX-License-Identifier: AGPL-3.0-or-later

import { 加载学习布局模式, 保存学习布局模式, 学习布局模式 } from '../../model/学习布局存储';
import { 保存显示今日进度卡, 主页今日进度卡AppStorage键 } from '../../model/主页偏好';
import { 设置面板色板, 设置面板色板_取 } from '../../utils/设置面板配色';
import { 颜色键 } from '../../model/颜色主题';
import { 设置分组卡片 } from './设置分组卡片';
import { STUDY_HAPTICS_KEY, saveStudyHaptics } from '../../utils/StudyHaptics';

// ========================================================
// @块ID UI-LAYOUT-001
// @名称 学习页布局分组
//
// @作用
// 提供底部固定 / 浮动可拖 两种学习页布局模式切换，
// 以及主页「今日进度卡片」显示开关（B12-Y3 2026-07-25）。
// 当前布局模式 = null 表示加载中；加载失败回退 'bottom'。
// 切换后立即生效（下次进入学习页）。
//
// @输入
// 是否深色：当前是否深色模式（影响色板取值）。
// 是否展开：本分组是否展开。
// 切换展开回调：父组件注入。
//
// @输出
// 渲染布局分组卡片；用户选择模式时持久化并更新当前布局模式；
// 用户切换今日进度卡开关时持久化 + 同步写 AppStorage 触发首页 @StorageLink 重渲染。
//
// @副作用
// 调用 加载学习布局模式 / 保存学习布局模式 读写本地持久化；
// 调用 保存显示今日进度卡 读写本地持久化 + 写 AppStorage 触发首页重渲染；
// 持久化失败仅丢失下次启动后的值，不回滚 UI。
// ========================================================
@Component
export struct 布局分组 {
  @Prop 是否深色: boolean = false;
  @Prop 是否展开: boolean = false;
  切换展开回调: () => void = (): void => {};
  // ⓘ 上抛：点击今日进度卡片行的 ⓘ 时，由父级（设置面板）弹出 字段帮助面板
  打开说明回调: (标题: Resource, 正文: Resource) => void = (标题: Resource, 正文: Resource): void => {};

  // @StorageLink 让本组件在 主色按钮背景 变化时立即重渲染；解析主色按钮背景() 直接引用此字段，
  // 让布局选中态主色在颜色主题切换瞬间同步更新（与 外观分组 同款机制）。
  @StorageLink(颜色键.主色按钮背景) private 主色按钮背景链接: string = '';
  // 主页今日进度卡开关：与 首页.ets 同款 @StorageLink，
  // 用户切 Toggle 后由 切换今日进度卡 写 AppStorage 触发首页重渲染。
  @StorageLink(主页今日进度卡AppStorage键) private 显示今日进度卡: boolean = true;
  // B12-Y5 2026-07-29 修复 Bug 1：@StorageProp('themeMode') 让主题模式切换直接触发重 build，
  // 不依赖 @Prop 是否深色 传播（aurora 主题 主色按钮背景 深浅色相同，@StorageLink 可能不触发）。
  @StorageProp('themeMode') private 主题模式监听: string = 'system';

  @State private 当前布局模式: 学习布局模式 | null = null;
  @StorageProp(STUDY_HAPTICS_KEY) @Watch('syncHapticsToggle') private hapticsEnabled: boolean = true;
  @State private hapticsToggle: boolean = true;
  @State private hapticsSaving: boolean = false;
  @State private hapticsSaveFailed: boolean = false;

  async aboutToAppear(): Promise<void> {
    this.hapticsToggle = this.hapticsEnabled;
    // 失败回退到 'bottom'（默认），保证 chip 一直可选。
    try {
      this.当前布局模式 = await 加载学习布局模式();
    } catch (error) {
      this.当前布局模式 = 'bottom';
    }
  }

  private 取本地化文本(资源: Resource): string {
    return this.getUIContext().getHostContext()!.resourceManager.getStringSync(资源.id);
  }

  /** 设置广播和保存失败都让开关显示实际生效值。 */
  private syncHapticsToggle(): void {
    this.hapticsToggle = this.hapticsEnabled;
  }

  /** 保存期间防止重复写入，失败恢复开关并显示可重试的提示。 */
  private async changeStudyHaptics(enabled: boolean): Promise<void> {
    if (this.hapticsSaving || enabled === this.hapticsEnabled) { return; }
    this.hapticsSaving = true;
    this.hapticsSaveFailed = false;
    this.hapticsToggle = enabled;
    try {
      await saveStudyHaptics(enabled);
    } catch (error) {
      this.hapticsSaveFailed = true;
    } finally {
      this.hapticsToggle = this.hapticsEnabled;
      this.hapticsSaving = false;
    }
  }

  /** 按钮背景专用主色（配 #FFFFFF 文字 ≥ 4.5:1）。2.1.4.1 深色模式修复。 */
  private 解析主色按钮背景(): string {
    return this.主色按钮背景链接 !== '' ? this.主色按钮背景链接 : 设置面板色板_取(this.是否深色).主色按钮背景;
  }

  /** 学习页布局模式标签：bottom=底部固定；float=浮动可拖。 */
  private 布局模式标签(模式: 学习布局模式): string {
    if (模式 === 'float') {
      return this.取本地化文本($r('app.string.settings_study_layout_float'));
    }
    return this.取本地化文本($r('app.string.settings_study_layout_bottom'));
  }

  /** Select 选项：底部固定 / 浮动可拖 */
  private 布局模式选项(): SelectOption[] {
    return [
      { value: this.取本地化文本($r('app.string.settings_study_layout_bottom')) },
      { value: this.取本地化文本($r('app.string.settings_study_layout_float')) }
    ];
  }

  /** Select 当前选中索引：float=1；bottom=0；null 加载中按 0 */
  private 布局模式索引(): number {
    return this.当前布局模式 === 'float' ? 1 : 0;
  }

  /** 切换布局模式：乐观更新 UI + 异步持久化；持久化失败仅丢失下次启动后的值，不回滚 UI。 */
  private async 切换布局(模式: 学习布局模式): Promise<void> {
    if (this.当前布局模式 === 模式) {
      return;
    }
    this.当前布局模式 = 模式;
    try {
      await 保存学习布局模式(模式);
    } catch (error) {
      // 持久化失败可接受：UI 已切换，下次启动会回退到上次保存的值。
    }
  }

  // ========================================================
  // @块ID UI-LAYOUT-003
  // @名称 切换今日进度卡开关
  //
  // @作用
  // 用户在布局分组末尾切「显示今日进度卡片」Toggle 时持久化新值
  // 并同步写 AppStorage，让首页 @StorageLink(显示今日进度卡) 立即响应：
  // - true → 主页摘要分页 重新渲染显示
  // - false → 主页摘要分页 从 Column 移除
  //
  // @输入
  // 开启: boolean - Toggle 新状态
  //
  // @输出
  // 写 preferences 的 home_show_today_summary；
  // 写 AppStorage 的 'homeShowTodaySummary' 触发首页重渲染。
  //
  // @副作用
  // 调用 保存显示今日进度卡 间接读写 preferences + 写 AppStorage。
  // ========================================================
  private 切换今日进度卡(开启: boolean): void {
    // 乐观更新：@StorageLink 双向绑定已自动写本地字段；
    // 这里只负责持久化 + 显式广播给首页（首页同款 @StorageLink 会自动响应）。
    保存显示今日进度卡(开启);
  }

  // ========================================================
  // @块ID UI-LAYOUT-002
  // @名称 分组头部
  //
  // @作用
  // 渲染分组标题行：「学习布局」+ ▼ 展开箭头。
  //
  // @副作用
  // 点击触发 切换展开回调（父级注入）。
  // ========================================================
  build() {
    设置分组卡片({
      标题: $r('app.string.settings_study_layout'),
      是否深色: this.是否深色,
      是否展开: this.是否展开,
      切换展开回调: this.切换展开回调
    }) {
      Column({ space: 8 }) {
          // 第 1 行：学习页布局（左侧标题+ⓘ，右侧 Select 选择框——与「当前模式」行同款对齐）
          Row() {
            Row() {
              Text(this.取本地化文本($r('app.string.settings_study_layout_row')))
                .fontSize(15)
                .fontColor(设置面板色板_取(this.是否深色).主文字)
              Button($r('app.string.field_help_button'))
                .type(ButtonType.Normal)
                .backgroundColor(Color.Transparent)
                .fontSize(14)
                .fontColor(设置面板色板_取(this.是否深色).三级文字)
                .width(28)
                .height(28)
                .padding(0)
                .margin({ left: 4 })
                .onClick(() => {
                  this.打开说明回调(
                    $r('app.string.settings_study_layout_row'),
                    $r('app.string.settings_study_layout_help')
                  );
                })
            }
            .layoutWeight(1)
            Select(this.布局模式选项())
              .selected(this.布局模式索引())
              .value(this.当前布局模式 !== null
                ? this.布局模式标签(this.当前布局模式)
                : this.取本地化文本($r('app.string.settings_study_layout_bottom')))
              .controlSize(ControlSize.SMALL)
              .onSelect((索引: number): void => {
                const 模式列表: 学习布局模式[] = ['bottom', 'float'];
                this.切换布局(模式列表[索引]);
              })
          }
          .width('100%')
          .height(48)

          Divider()
            .color(设置面板色板_取(this.是否深色).分隔线)
            .strokeWidth(1)
            .margin({ top: 4, bottom: 4 })
          Row() {
            Text($r('app.string.settings_study_haptics'))
              .fontSize(15)
              .fontColor(设置面板色板_取(this.是否深色).主文字)
              .layoutWeight(1)
            Toggle({ type: ToggleType.Switch, isOn: this.hapticsToggle })
              .selectedColor(this.解析主色按钮背景())
              .enabled(!this.hapticsSaving)
              .onChange((enabled: boolean): void => { this.changeStudyHaptics(enabled); })
          }
          .width('100%')
          .height(48)
          if (this.hapticsSaveFailed) {
            Text($r('app.string.settings_study_haptics_save_failed'))
              .fontSize(12)
              .fontColor($r('app.color.error_text'))
          }

          // 主页今日进度卡开关：Divider 分隔 + 标题+ⓘ + Toggle。
          // 原小字说明（settings_home_today_summary_hint）从下方移入 ⓘ 浮层。
          Divider()
            .color(设置面板色板_取(this.是否深色).分隔线)
            .strokeWidth(1)
            .margin({ top: 4, bottom: 4 })

          Row() {
            Row() {
              Text($r('app.string.settings_home_today_summary'))
                .fontSize(15)
                .fontColor(设置面板色板_取(this.是否深色).主文字)
              Button($r('app.string.field_help_button'))
                .type(ButtonType.Normal)
                .backgroundColor(Color.Transparent)
                .fontSize(14)
                .fontColor(设置面板色板_取(this.是否深色).三级文字)
                .width(28)
                .height(28)
                .padding(0)
                .margin({ left: 4 })
                .onClick(() => {
                  this.打开说明回调(
                    $r('app.string.settings_home_today_summary'),
                    $r('app.string.settings_home_today_summary_hint')
                  );
                })
            }
            .layoutWeight(1)

            Toggle({ type: ToggleType.Switch, isOn: this.显示今日进度卡 })
              .selectedColor(this.解析主色按钮背景())
              .onChange((值: boolean): void => {
                this.切换今日进度卡(值);
              })
          }
          .width('100%')
          .height(48)
      }
      .width('100%')
    }
  }
}
