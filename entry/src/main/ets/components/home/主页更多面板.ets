// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @名称 主页更多面板
//
// @作用
// 首页"更多"按钮触发的下拉动作菜单（顶部弹出形态，纯 UI 积木）。
// 与 主页操作面板 同模式：透明承接层 + 左上角下拉的 4 个条目（设置/浏览/统计/提醒）。
// 触发按钮在左上角，菜单锚定其下方弹出，手指零移动；
// 不加 dim/磨砂遮罩，透明层承接外部点击关闭。
//
// @输入
// 设置回调 / 浏览回调 / 统计回调 / 关闭回调（均由父级 Index 注入）。
//
// @输出
// 渲染一个全屏 Stack：透明承接层 + 左上角下拉的 3 个动作条目。
//
// @Invariants
// - 与 主页操作面板 同布局/同过渡：150ms 淡入 + 0.98 轻缩放，禁止位移
// - 锚定 TopStart（左上角），与 主页操作面板 的 TopEnd（右上角）对称
//
// @Extension Points
// - 条目数量可扩展（如未来加"导出数据"等）
//
// @副作用
// 无。点击事件通过回调上抛，由父级处理实际跳转。
// ========================================================

import { 应用尺寸 } from '../../utils/应用尺寸';

@Component
export struct 主页更多面板 {
  设置回调: () => void = (): void => {};
  浏览回调: () => void = (): void => {};
  统计回调: () => void = (): void => {};
  提醒回调: () => void = (): void => {};
  onIntro: () => void = (): void => {};
  关闭回调: () => void = (): void => {};
  @StorageProp('状态栏高度') private 状态栏高度: number = 0;

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
        Text($r('app.string.top_settings'))
          .fontSize(应用尺寸.字号_正文)
          .fontColor($r('app.color.text_primary'))
          .width('100%')
          .constraintSize({ minHeight: 应用尺寸.menuItemHeight })
          .padding({ left: 应用尺寸.menuHorizontalPadding, right: 应用尺寸.menuHorizontalPadding })
          .textAlign(TextAlign.Center)
          .onClick((): void => this.设置回调())
        Divider()
          .color($r('app.color.border_subtle'))
          .strokeWidth(0.5)
          .margin({ left: 应用尺寸.面板内边距, right: 应用尺寸.面板内边距 })
        Text($r('app.string.browser_title'))
          .fontSize(应用尺寸.字号_正文)
          .fontColor($r('app.color.text_primary'))
          .width('100%')
          .constraintSize({ minHeight: 应用尺寸.menuItemHeight })
          .padding({ left: 应用尺寸.menuHorizontalPadding, right: 应用尺寸.menuHorizontalPadding })
          .textAlign(TextAlign.Center)
          .onClick((): void => this.浏览回调())
        Divider()
          .color($r('app.color.border_subtle'))
          .strokeWidth(0.5)
          .margin({ left: 应用尺寸.面板内边距, right: 应用尺寸.面板内边距 })
        Text($r('app.string.stats_page_title'))
          .fontSize(应用尺寸.字号_正文)
          .fontColor($r('app.color.text_primary'))
          .width('100%')
          .constraintSize({ minHeight: 应用尺寸.menuItemHeight })
          .padding({ left: 应用尺寸.menuHorizontalPadding, right: 应用尺寸.menuHorizontalPadding })
          .textAlign(TextAlign.Center)
          .onClick((): void => this.统计回调())
        Divider()
          .color($r('app.color.border_subtle'))
          .strokeWidth(0.5)
          .margin({ left: 应用尺寸.面板内边距, right: 应用尺寸.面板内边距 })
        Text($r('app.string.reminder_list_title'))
          .fontSize(应用尺寸.字号_正文)
          .fontColor($r('app.color.text_primary'))
          .width('100%')
          .constraintSize({ minHeight: 应用尺寸.menuItemHeight })
          .padding({ left: 应用尺寸.menuHorizontalPadding, right: 应用尺寸.menuHorizontalPadding })
          .textAlign(TextAlign.Center)
          .onClick((): void => this.提醒回调())
        Divider().color($r('app.color.border_subtle')).strokeWidth(0.5)
          .margin({ left: 应用尺寸.面板内边距, right: 应用尺寸.面板内边距 })
        Text($r('app.string.home_intro_menu_title'))
          .fontSize(应用尺寸.字号_正文)
          .fontColor($r('app.color.text_primary'))
          .width('100%')
          .constraintSize({ minHeight: 应用尺寸.menuItemHeight })
          .padding({ left: 应用尺寸.menuHorizontalPadding, right: 应用尺寸.menuHorizontalPadding })
          .textAlign(TextAlign.Center)
          .onClick((): void => this.onIntro())
      }
      .width(应用尺寸.compactMenuWidth)
      .backgroundColor($r('app.color.surface_card'))
      .borderRadius(应用尺寸.圆角_指标卡)
      .border({ width: 0.5, color: $r('app.color.border_subtle') })
      .shadow({ radius: 12, color: 'rgba(0,0,0,0.10)', offsetX: 0, offsetY: 4 })
      .margin({
        top: 应用尺寸.工具栏高度 + this.状态栏高度 + 应用尺寸.pageContentTopInset,
        left: 应用尺寸.页面内边距_水平
      })
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
    .alignContent(Alignment.TopStart)
  }
}
