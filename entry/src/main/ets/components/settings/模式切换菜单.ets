// SPDX-License-Identifier: AGPL-3.0-or-later
import { ThemeTextSpans } from '../common/ThemeText';
import { THEME_TEXT_COLORS_KEY } from '../../model/ThemeCatalog';

import { 应用尺寸 } from '../../utils/应用尺寸';

// ========================================================
// @名称 模式切换菜单
//
// @作用
// 设置页顶栏右上角「当前模式」按钮触发的下拉选择菜单（顶部弹出形态，纯 UI 积木）。
// 与 主页操作面板 同模式：透明承接层 + 右上角下拉的 2 个模式条目（简洁版/实验版）；
// 当前模式条目左侧带 ✓ 并高亮主色；不加 dim/磨砂遮罩，透明层承接外部点击关闭。
//
// @输入
// 当前简洁模式：bool，true=简洁版选中，false=实验版选中；
// 主色：当前模式条目文字与 ✓ 的高亮色；
// 顶部偏移：菜单卡片距面板顶部的距离（顶栏高度 + 间距，由 设置面板 传入）；
// 选择回调(简洁: boolean) / 关闭回调（均由 设置面板 注入）。
//
// @输出
// 渲染一个全屏 Stack：透明承接层 + 右上角下拉的 2 个模式条目。
//
// @Invariants
// - 与 主页操作面板/主页更多面板 同布局/同过渡：150ms 淡入 + 0.98 轻缩放，禁止位移
// - 锚定 TopEnd（右上角），与触发按钮（顶栏右侧）对齐
// - 条目为居中文字（用户裁定 2026-08-29 去掉 ✓ 标记），当前项仅文字高亮主色
//
// @副作用
// 无。选择与关闭事件通过回调上抛，由 设置面板 落库并关闭菜单。
// ========================================================

@Component
export struct 模式切换菜单 {
  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  @Prop 当前简洁模式: boolean = true;
  @Prop 主色: ResourceColor = $r('app.color.action_primary');
  @Prop 顶部偏移: number = 68;
  选择回调: (简洁: boolean) => void = (_简洁: boolean): void => {};
  关闭回调: () => void = (): void => {};

  build() {
    Stack() {
      // 透明承接层：不遮暗不模糊，仅让菜单外点击可关闭
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor(Color.Transparent)
        .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
        .onClick((): void => this.关闭回调())

      Column() {
        // 简洁版（当前项文字高亮主色，无勾选标记）
        Text() { ThemeTextSpans($r('app.string.settings_simple_mode_simple'), (this.当前简洁模式) ? this.themeAccentColors : [], this.getUIContext()) }
          .fontSize(应用尺寸.字号_正文)
          .fontColor(this.当前简洁模式 ? this.主色 : $r('app.color.text_primary'))
          .width('100%')
          .constraintSize({ minHeight: 应用尺寸.menuItemHeight })
          .padding({ left: 应用尺寸.menuHorizontalPadding, right: 应用尺寸.menuHorizontalPadding })
          .textAlign(TextAlign.Center)
          .onClick((): void => this.选择回调(true))

        Divider()
          .color($r('app.color.border_subtle'))
          .strokeWidth(0.5)
          .margin({ left: 应用尺寸.面板内边距, right: 应用尺寸.面板内边距 })

        // 实验版（当前项文字高亮主色，无勾选标记）
        Text() { ThemeTextSpans($r('app.string.settings_simple_mode_full'), (!this.当前简洁模式) ? this.themeAccentColors : [], this.getUIContext()) }
          .fontSize(应用尺寸.字号_正文)
          .fontColor(!this.当前简洁模式 ? this.主色 : $r('app.color.text_primary'))
          .width('100%')
          .constraintSize({ minHeight: 应用尺寸.menuItemHeight })
          .padding({ left: 应用尺寸.menuHorizontalPadding, right: 应用尺寸.menuHorizontalPadding })
          .textAlign(TextAlign.Center)
          .onClick((): void => this.选择回调(false))
      }
      .width(应用尺寸.compactMenuWidth)
      .backgroundColor($r('app.color.surface_card'))
      .borderRadius(应用尺寸.圆角_指标卡)
      .border({ width: 0.5, color: $r('app.color.border_subtle') })
      .shadow({ radius: 12, color: 'rgba(0,0,0,0.10)', offsetX: 0, offsetY: 4 })
      .margin({ top: this.顶部偏移, right: 应用尺寸.页面内边距_水平 })
      .onClick(() => {
        // 阻断点击穿透到遮罩
      })
      // 小菜单统一使用 150ms EaseOut：入场轻缩放，退场只淡出。
      .transition(TransitionEffect.asymmetric(
        TransitionEffect.opacity(0)
          .combine(TransitionEffect.scale({ x: 0.98, y: 0.98 }))
          .animation({ curve: Curve.EaseOut, duration: 150 }),
        TransitionEffect.opacity(0)
          .animation({ curve: Curve.EaseOut, duration: 150 })
      ))
    }
    .width('100%')
    .height('100%')
    .alignContent(Alignment.TopEnd)
  }
}
