// SPDX-License-Identifier: AGPL-3.0-or-later
import { ThemeTextSpans } from './common/ThemeText';
import { THEME_TEXT_COLORS_KEY } from '../model/ThemeCatalog';

import { DialogHeader } from './common/DialogHeader';
// ========================================================
// @块ID UI-ANKIWEB-GUIDE-001
// @名称 AnkiWeb 资源引导对话框
//
// @作用
// AnkiWeb 资源引导弹窗（首次启动展示一次，由首页.aboutToAppear 触发）。
// 用自定义 Panel 而非 AlertDialog：
//   - 网址行用 Text.copyOption(CopyOptions.LocalDevice) 支持长按选中复制
//   - 提供「前往获取」按钮调系统浏览器打开 AnkiWeb 共享牌组页面；
//     若系统无可用浏览器（startAbility 失败），兜底复制网址到剪贴板 + toast 提示
//   - 「我已了解」按钮关闭弹窗
//   - 遮罩点击不关闭：强制用户点按钮确认，避免误触跳过引导
// 样式与创建牌组面板/添加笔记面板等弹窗一致：磨砂遮罩 + surface_card 卡片。
// 跳转逻辑与设置面板 打开AnkiWeb网址 保持一致：不在 app 内嵌 Web 组件打开 AnkiWeb
// （避免登录态/cookie 与本应用混淆），一律交给系统浏览器处理。
//
// @输入
// isDark: 是否深色主题（控制遮罩色与磨砂风格）
//
// @输出
// onClose: 用户点「我已了解」时回调（点遮罩不触发）
//
// @业务规则
// AnkiWeb 保留英文名（产品品牌词，不中文化）。
// 资源 key（ankiweb_guide_title / ankiweb_guide_message / ankiweb_guide_url_label
// / ankiweb_guide_notice / ankiweb_guide_button_open / ankiweb_guide_button_ok）
// 作为 i18n 键保留英文。
// url 字面量 'https://ankiweb.net/shared/decks' 为外部网址，保留原文。
// pasteboard / startAbility 为 HarmonyOS 系统能力 API，保留英文。
//
// @副作用
// 点「前往获取」按钮调系统 startAbility 拉起浏览器（系统级副作用）；
// 失败时写系统剪贴板（pasteboard）+ 弹 toast。
// 用户仍可长按网址行手动选中复制。
// ========================================================

import { common } from '@kit.AbilityKit';
import { pasteboard } from '@kit.BasicServicesKit';
import { 应用尺寸 } from '../utils/应用尺寸';
import { 颜色键 } from '../model/颜色主题';
import { 取全屏转场时长, 取全屏转场曲线 } from '../utils/转场时长';

@Component
export struct AnkiWeb引导对话框 {
  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  isDark: boolean = false;
  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景: string = '#2F5FD0';
  onClose: () => void = (): void => {};
  private readonly 网址: string = 'https://ankiweb.net/shared/decks';

  // 点「前往获取」按钮：用系统浏览器打开 AnkiWeb 共享牌组页面。
  // 若系统无可用浏览器（startAbility 失败），兜底把网址复制到剪贴板并 toast 提示。
  // 与设置面板 打开AnkiWeb网址 行为一致，避免双入口行为分叉。
  private 前往AnkiWeb(): void {
    const 上下文: common.UIAbilityContext =
      this.getUIContext().getHostContext() as common.UIAbilityContext;
    上下文.startAbility({
      action: 'ohos.want.action.viewData',
      uri: this.网址
    }).catch(async (错误: Error): Promise<void> => {
      // 兜底：复制网址到剪贴板 + toast 提示用户手动打开
      try {
        const 剪贴数据: pasteboard.PasteData =
          pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, this.网址);
        const 系统剪贴板: pasteboard.SystemPasteboard = pasteboard.getSystemPasteboard();
        await 系统剪贴板.setData(剪贴数据);
        this.getUIContext().getPromptAction().showToast({
          message: $r('app.string.about_ankiweb_open_failed')
        });
      } catch (复制错误) {
        // 复制也失败：静默；用户仍可长按网址行手动选中复制
      }
    });
  }

  build() {
    Stack() {
      // 遮罩 + 磨砂（与创建牌组面板等弹窗一致）
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor(this.isDark ? 'rgba(0,0,0,0.40)' : 'rgba(0,0,0,0.15)')
        .backgroundBlurStyle(BlurStyle.Thin, {
          colorMode: this.isDark ? ThemeColorMode.DARK : ThemeColorMode.LIGHT,
          adaptiveColor: AdaptiveColor.DEFAULT
        })
        .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
        .onClick(() => {
          // 点遮罩不关闭：强制用户点「我已了解」确认
        })
        .transition(TransitionEffect.OPACITY.animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }))

      Column({ space: 应用尺寸.间距_12 }) {
        DialogHeader({
          title: $r('app.string.ankiweb_guide_title'),
          actionLabel: $r('app.string.ankiweb_guide_button_ok'),
          actionEnabled: true,
          showClose: false,
          onAction: () => { this.onClose(); }
        })

        Text($r('app.string.ankiweb_guide_message'))
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_secondary'))
          .width('100%')
          .lineHeight(20)

        Text($r('app.string.ankiweb_guide_url_label'))
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_secondary'))
          .width('100%')
          .margin({ top: 应用尺寸.间距_4 })

        // 网址：可长按选中复制（Text.copyOption）
        Text() { ThemeTextSpans(this.网址, this.themeAccentColors, this.getUIContext()) }
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.action_primary'))
          .width('100%')
          .copyOption(CopyOptions.LocalDevice)

        Text($r('app.string.ankiweb_guide_notice'))
          .fontSize(应用尺寸.字号_说明)
          .fontColor($r('app.color.text_tertiary'))
          .width('100%')
          .margin({ top: 应用尺寸.间距_4 })

        Row({ space: 应用尺寸.间距_12 }) {
          Button() {
            Text() { ThemeTextSpans($r('app.string.ankiweb_guide_button_open'), this.themeAccentColors, this.getUIContext()) }.fontSize(应用尺寸.字号_正文).fontColor($r('app.color.action_primary'))
          }
            .type(ButtonType.Normal)
            .layoutWeight(1)
            .height(应用尺寸.按钮高度)
            .fontSize(应用尺寸.字号_正文)
            .fontColor($r('app.color.action_primary'))
            .backgroundColor(Color.Transparent)
            .borderRadius(应用尺寸.圆角_面板)
            .onClick(() => { this.前往AnkiWeb(); })

        }
        .width('100%')
        .margin({ top: 应用尺寸.间距_8 })
      }
      .width('88%')
      .constraintSize({ maxWidth: 480, maxHeight: '88%' })
      .padding(应用尺寸.间距_16)
      .backgroundColor($r('app.color.surface_card'))
      .borderRadius(应用尺寸.圆角_卡片)
      .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
      .transition(TransitionEffect.asymmetric(
        TransitionEffect.opacity(0).combine(TransitionEffect.scale({ x: 0.96, y: 0.96 }))
          .animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }),
        TransitionEffect.opacity(0)
          .animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() })
      ))
    }
    .width('100%')
    .height('100%')
    .alignContent(Alignment.Center)
  }
}
