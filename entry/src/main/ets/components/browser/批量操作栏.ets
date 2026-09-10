// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @名称 批量操作栏
//
// @作用
// 浏览页 T8 批量操作栏：多选模式下固定在底部的按钮组。
// 阶段 3 实现 5 个已有后端能力的操作：改牌组 / 设置标志 / 挂起 / 恢复 / 删除。
// 阶段 4 扩展 3 个对齐 AnkiDroid 的操作：设置到期日 / 重新定位 / 更改笔记类型。
//
// @输入
// isDark: 是否深色主题（预留，当前按钮配色走 color 资源）
// busy: 父级是否正在执行批量操作（禁用所有按钮）
// 选中数: 当前选中行数（按钮文案展示用）
//
// @输出
// on改牌组 / on设置标志 / on挂起 / on恢复 / on删除: 五个核心操作回调
// on设置到期日 / on重新定位 / on更改笔记类型: 三个 AnkiDroid 对齐操作回调
// 父级负责弹层确认与落盘
//
// @Invariants
// - 本组件不直接调后端，所有操作经回调上抛
// - busy=true 时所有按钮禁用，防止重复点击
// - 选中数 === 0 时不应显示本组件（由父级 if 控制）
//
// @Extension Points
// - 后续可继续扩展（如 添加/移除标签 等需要独立弹层的操作）
// - 按钮文案走 i18n，新增按钮只需加 browser_action_* key
//
// @副作用
// 仅通过外部回调引发后端写入；本组件不直接落盘。
// ========================================================

import { 应用尺寸 } from '../../utils/应用尺寸';
import { 颜色键 } from '../../model/颜色主题';
import { AI_AGENT_CHANNELS_APP_STORAGE_KEY } from '../../model/ReleaseFeatures';

@Component
export struct 批量操作栏 {
  @StorageLink(AI_AGENT_CHANNELS_APP_STORAGE_KEY) private Agent入口已启用: boolean = false;
  @Prop isDark: boolean = false;
  @Prop busy: boolean = false;
  @Prop 选中数: number = 0;
  on改牌组: () => void = (): void => {};
  on设置标志: () => void = (): void => {};
  on挂起: () => void = (): void => {};
  on恢复: () => void = (): void => {};
  on删除: () => void = (): void => {};
  on设置到期日: () => void = (): void => {};
  on重新定位: () => void = (): void => {};
  on更改笔记类型: () => void = (): void => {};
  onAI改卡: () => void = (): void => {};
  // 帮助按钮上抛：由父组件（浏览页）统一渲染 字段帮助面板
  onHelp: () => void = (): void => {};

  // 按钮按下态背景色（走主题系统，与 首页/学习页 主色容器同源）
  @StorageProp(颜色键.主色容器) private 主色容器色: string = '#E8EEFC';
  // 手势导航条高度（沉浸式全屏下底部固定控件需抬高避让，EntryAbility 动态写入）
  @StorageProp('导航条高度') private 导航条高度: number = 0;
  @State private 已按下: number = -1;

  /** 生成按钮按下态背景色（按下时用主色容器，否则用 surface_card）。 */
  private 按钮背景(tag: number): ResourceColor {
    if (this.已按下 === tag) {
      return this.主色容器色;
    }
    return $r('app.color.surface_card');
  }

  build() {
    // 两行布局：每行 4 个按钮，对称美观且窄屏能塞下中文文案。
    // 字号统一用 字号_正文_小（12vp）+ padding 左右 4vp 压缩内边距，
    // 保证「设置标志」「更改笔记类型」等 4-6 字文案在 360vp 窄屏不被省略。
    Column({ space: 应用尺寸.间距_4 }) {
      Row({ space: 应用尺寸.间距_8 }) {
        // 帮助按钮：点击上抛到父组件弹出批量操作说明（统一入口）
        Text($r('app.string.field_help_button'))
          .fontSize(应用尺寸.字号_正文)
          .fontColor($r('app.color.text_secondary'))
          .padding({ left: 应用尺寸.间距_4, right: 应用尺寸.间距_4 })
          .onClick((): void => { this.onHelp(); })

        Button($r('app.string.browser_action_change_deck'))
          .layoutWeight(1)
          .height(应用尺寸.按钮高度)
          .padding({ left: 应用尺寸.间距_4, right: 应用尺寸.间距_4 })
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_primary'))
          .backgroundColor(this.按钮背景(0))
          .borderRadius(应用尺寸.圆角_胶囊)
          .animation({ duration: 80, curve: Curve.EaseOut })
          .enabled(!this.busy)
          .onTouch((e: TouchEvent): void => {
            if (e.type === TouchType.Down) { this.已按下 = 0; }
            else if (e.type === TouchType.Up || e.type === TouchType.Cancel) { this.已按下 = -1; }
          })
          .onClick((): void => { this.on改牌组(); })

        Button($r('app.string.browser_action_set_flag'))
          .layoutWeight(1)
          .height(应用尺寸.按钮高度)
          .padding({ left: 应用尺寸.间距_4, right: 应用尺寸.间距_4 })
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_primary'))
          .backgroundColor(this.按钮背景(1))
          .borderRadius(应用尺寸.圆角_胶囊)
          .animation({ duration: 80, curve: Curve.EaseOut })
          .enabled(!this.busy)
          .onTouch((e: TouchEvent): void => {
            if (e.type === TouchType.Down) { this.已按下 = 1; }
            else if (e.type === TouchType.Up || e.type === TouchType.Cancel) { this.已按下 = -1; }
          })
          .onClick((): void => { this.on设置标志(); })

        Button($r('app.string.browser_action_suspend'))
          .layoutWeight(1)
          .height(应用尺寸.按钮高度)
          .padding({ left: 应用尺寸.间距_4, right: 应用尺寸.间距_4 })
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_primary'))
          .backgroundColor(this.按钮背景(2))
          .borderRadius(应用尺寸.圆角_胶囊)
          .animation({ duration: 80, curve: Curve.EaseOut })
          .enabled(!this.busy)
          .onTouch((e: TouchEvent): void => {
            if (e.type === TouchType.Down) { this.已按下 = 2; }
            else if (e.type === TouchType.Up || e.type === TouchType.Cancel) { this.已按下 = -1; }
          })
          .onClick((): void => { this.on挂起(); })

        Button($r('app.string.browser_action_restore'))
          .layoutWeight(1)
          .height(应用尺寸.按钮高度)
          .padding({ left: 应用尺寸.间距_4, right: 应用尺寸.间距_4 })
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_primary'))
          .backgroundColor(this.按钮背景(3))
          .borderRadius(应用尺寸.圆角_胶囊)
          .animation({ duration: 80, curve: Curve.EaseOut })
          .enabled(!this.busy)
          .onTouch((e: TouchEvent): void => {
            if (e.type === TouchType.Down) { this.已按下 = 3; }
            else if (e.type === TouchType.Up || e.type === TouchType.Cancel) { this.已按下 = -1; }
          })
          .onClick((): void => { this.on恢复(); })
      }
      .width('100%')

      Row({ space: 应用尺寸.间距_8 }) {
        // 第二行 4 按钮：删除 + 3 个 AnkiDroid 对齐操作，与第一行 4 按钮列对齐
        // （第一行最左是帮助 Text 占自然宽度，第二行最左是删除按钮 layoutWeight(1)，
        // 视觉上两行 4 按钮宽度一致，帮助 Text 占位 ≈ 删除按钮留白）
        Button($r('app.string.browser_action_delete'))
          .layoutWeight(1)
          .height(应用尺寸.按钮高度)
          .padding({ left: 应用尺寸.间距_4, right: 应用尺寸.间距_4 })
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.error_text'))
          .backgroundColor(this.按钮背景(4))
          .borderRadius(应用尺寸.圆角_胶囊)
          .animation({ duration: 80, curve: Curve.EaseOut })
          .enabled(!this.busy)
          .onTouch((e: TouchEvent): void => {
            if (e.type === TouchType.Down) { this.已按下 = 4; }
            else if (e.type === TouchType.Up || e.type === TouchType.Cancel) { this.已按下 = -1; }
          })
          .onClick((): void => { this.on删除(); })

        Button($r('app.string.browser_action_set_due'))
          .layoutWeight(1)
          .height(应用尺寸.按钮高度)
          .padding({ left: 应用尺寸.间距_4, right: 应用尺寸.间距_4 })
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_primary'))
          .backgroundColor(this.按钮背景(5))
          .borderRadius(应用尺寸.圆角_胶囊)
          .animation({ duration: 80, curve: Curve.EaseOut })
          .enabled(!this.busy)
          .onTouch((e: TouchEvent): void => {
            if (e.type === TouchType.Down) { this.已按下 = 5; }
            else if (e.type === TouchType.Up || e.type === TouchType.Cancel) { this.已按下 = -1; }
          })
          .onClick((): void => { this.on设置到期日(); })

        Button($r('app.string.browser_action_reposition'))
          .layoutWeight(1)
          .height(应用尺寸.按钮高度)
          .padding({ left: 应用尺寸.间距_4, right: 应用尺寸.间距_4 })
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_primary'))
          .backgroundColor(this.按钮背景(6))
          .borderRadius(应用尺寸.圆角_胶囊)
          .animation({ duration: 80, curve: Curve.EaseOut })
          .enabled(!this.busy)
          .onTouch((e: TouchEvent): void => {
            if (e.type === TouchType.Down) { this.已按下 = 6; }
            else if (e.type === TouchType.Up || e.type === TouchType.Cancel) { this.已按下 = -1; }
          })
          .onClick((): void => { this.on重新定位(); })

        Button($r('app.string.browser_action_change_notetype'))
          .layoutWeight(1)
          .height(应用尺寸.按钮高度)
          .padding({ left: 应用尺寸.间距_4, right: 应用尺寸.间距_4 })
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_primary'))
          .backgroundColor(this.按钮背景(7))
          .borderRadius(应用尺寸.圆角_胶囊)
          .animation({ duration: 80, curve: Curve.EaseOut })
          .enabled(!this.busy)
          .onTouch((e: TouchEvent): void => {
            if (e.type === TouchType.Down) { this.已按下 = 7; }
            else if (e.type === TouchType.Up || e.type === TouchType.Cancel) { this.已按下 = -1; }
          })
          .onClick((): void => { this.on更改笔记类型(); })
      }
      .width('100%')

      if (this.Agent入口已启用) {
        Button($r('app.string.ai_card_edit'))
          .width('100%')
          .height(应用尺寸.按钮高度)
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_primary'))
          .backgroundColor($r('app.color.surface_card'))
          .opacity(this.已按下 === 8 ? 0.82 : 1)
          .borderRadius(应用尺寸.圆角_胶囊)
          .animation({ duration: 80, curve: Curve.EaseOut })
          .enabled(!this.busy)
          .onTouch((e: TouchEvent): void => {
            if (e.type === TouchType.Down) { this.已按下 = 8; }
            else if (e.type === TouchType.Up || e.type === TouchType.Cancel) { this.已按下 = -1; }
          })
          .onClick((): void => { this.onAI改卡(); })
      }
    }
    .width('100%')
    .padding({
      left: 应用尺寸.间距_16,
      right: 应用尺寸.间距_16,
      top: 应用尺寸.间距_8,
      // 抬高避让手势导航条（AppGallery 导航栏适配要求）
      bottom: 应用尺寸.间距_8 + this.导航条高度
    })
    .backgroundColor($r('app.color.surface_page'))
    .border({ width: 0.5, color: $r('app.color.divider') })
  }
}
