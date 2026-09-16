// SPDX-License-Identifier: AGPL-3.0-or-later

import { 应用尺寸 } from '../utils/应用尺寸';
import { AI_AGENT_CHANNELS_APP_STORAGE_KEY } from '../model/ReleaseFeatures';

// ========================================================
// @块ID COMP-HOME-ACTION-001
// @名称 主页操作面板
//
// @作用
// 首页动作菜单（顶部弹出形态，纯 UI 积木）。
// 触发按钮在右上角，菜单锚定其下方弹出，手指零移动；
// 普通下拉式打开：不加 dim/磨砂遮罩，透明层承接外部点击关闭。
//
// @输入
// 创建牌组回调 / 导入牌组回调 / 关闭回调（均由父级 Index 注入）。
//
// @输出
// 渲染一个全屏 Stack：透明承接层 + 右上角下拉的五个动作条目（末项「获取直链牌组」可按配额隐藏）。
//
// @业务规则
// 不加遮罩：透明层仅承接点击关闭，不遮暗不模糊。
// 入场只使用轻微缩放与淡入，不位移、不阻塞菜单操作。
//
// @副作用
// 无。点击事件通过回调上抛，由父级处理实际跳转。
// ========================================================

@Component
export struct 主页操作面板 {
  创建牌组回调: () => void = (): void => {};
  导入牌组回调: () => void = (): void => {};
  AI制卡回调: () => void = (): void => {};
  AI改卡回调: () => void = (): void => {};
  /** 第 5 项「获取直链牌组」；由父级按下载配额决定是否注入，配额用尽时父级不渲染本面板的该项。 */
  @Prop 显示获取直链牌组: boolean = true;
  获取直链牌组回调: () => void = (): void => {};
  关闭回调: () => void = (): void => {};
  @StorageProp('状态栏高度') private 状态栏高度: number = 0;
  @StorageLink(AI_AGENT_CHANNELS_APP_STORAGE_KEY) private Agent入口已启用: boolean = false;

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
        Text($r('app.string.create_deck_title'))
          .fontSize(应用尺寸.字号_正文)
          .fontColor($r('app.color.text_primary'))
          .width('100%')
          .constraintSize({ minHeight: 应用尺寸.menuItemHeight })
          .padding({ left: 应用尺寸.menuHorizontalPadding, right: 应用尺寸.menuHorizontalPadding })
          .textAlign(TextAlign.Center)
          .onClick((): void => this.创建牌组回调())
        Divider()
          .color($r('app.color.border_subtle'))
          .strokeWidth(0.5)
          .margin({ left: 应用尺寸.面板内边距, right: 应用尺寸.面板内边距 })
        Text($r('app.string.transfer_import_deck'))
          .fontSize(应用尺寸.字号_正文)
          .fontColor($r('app.color.text_primary'))
          .width('100%')
          .constraintSize({ minHeight: 应用尺寸.menuItemHeight })
          .padding({ left: 应用尺寸.menuHorizontalPadding, right: 应用尺寸.menuHorizontalPadding })
          .textAlign(TextAlign.Center)
          .onClick((): void => this.导入牌组回调())
        if (this.Agent入口已启用) {
          Divider()
            .color($r('app.color.border_subtle'))
            .strokeWidth(0.5)
            .margin({ left: 应用尺寸.面板内边距, right: 应用尺寸.面板内边距 })
          Text($r('app.string.ai_card_title'))
            .fontSize(应用尺寸.字号_正文)
            .fontColor($r('app.color.text_primary'))
            .width('100%')
            .constraintSize({ minHeight: 应用尺寸.menuItemHeight })
            .padding({ left: 应用尺寸.menuHorizontalPadding, right: 应用尺寸.menuHorizontalPadding })
            .textAlign(TextAlign.Center)
            .onClick((): void => this.AI制卡回调())
          Divider()
            .color($r('app.color.border_subtle'))
            .strokeWidth(0.5)
            .margin({ left: 应用尺寸.面板内边距, right: 应用尺寸.面板内边距 })
          Text($r('app.string.ai_card_edit'))
            .fontSize(应用尺寸.字号_正文)
            .fontColor($r('app.color.text_primary'))
            .width('100%')
            .constraintSize({ minHeight: 应用尺寸.menuItemHeight })
            .padding({ left: 应用尺寸.menuHorizontalPadding, right: 应用尺寸.menuHorizontalPadding })
            .textAlign(TextAlign.Center)
            .onClick((): void => this.AI改卡回调())
        }
        if (this.显示获取直链牌组) {
          Divider()
            .color($r('app.color.border_subtle'))
            .strokeWidth(0.5)
            .margin({ left: 应用尺寸.面板内边距, right: 应用尺寸.面板内边距 })
          Text($r('app.string.cloud_deck_menu_entry'))
            .fontSize(应用尺寸.字号_正文)
            .fontColor($r('app.color.text_primary'))
            .width('100%')
            .constraintSize({ minHeight: 应用尺寸.menuItemHeight })
            .padding({ left: 应用尺寸.menuHorizontalPadding, right: 应用尺寸.menuHorizontalPadding })
            .textAlign(TextAlign.Center)
            .onClick((): void => this.获取直链牌组回调())
        }
      }
      .width(this.Agent入口已启用 || this.显示获取直链牌组
        ? 应用尺寸.extendedMenuWidth : 应用尺寸.compactMenuWidth)
      .backgroundColor($r('app.color.surface_card'))
      .borderRadius(应用尺寸.圆角_指标卡)
      .border({ width: 0.5, color: $r('app.color.border_subtle') })
      .shadow({ radius: 12, color: 'rgba(0,0,0,0.10)', offsetX: 0, offsetY: 4 })
      .margin({
        top: 应用尺寸.工具栏高度 + this.状态栏高度 + 应用尺寸.pageContentTopInset,
        right: 应用尺寸.页面内边距_水平
      })
      .onClick(() => {
        // 阻断点击穿透到遮罩
      })
      // 小菜单统一使用 150ms EaseOut：入场轻缩放，退场只淡出，保持克制稳定。
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
