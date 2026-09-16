// SPDX-License-Identifier: AGPL-3.0-or-later
import { ThemeTextSpans } from './common/ThemeText';
import { THEME_TEXT_COLORS_KEY } from '../model/ThemeCatalog';

import { DialogHeader } from './common/DialogHeader';
import type { 官方公告展示项 } from '../model/官方公告模型';
import { 颜色键 } from '../model/颜色主题';
import { 应用尺寸 } from '../utils/应用尺寸';
import { 取全屏转场时长, 取全屏转场曲线 } from '../utils/转场时长';

/** 官方启动公告弹窗：纯展示层；确认与详情动作经回调上抛，返回键与遮罩点击不关闭。 */
@Component
export struct 官方公告弹窗 {
  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  @Prop announcement: 官方公告展示项;
  @Prop isDark: boolean = false;
  @Prop acknowledging: boolean = false;
  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景: string = '#2F5FD0';
  onAcknowledge: () => void = (): void => {};
  onOpenDetails: () => void = (): void => {};

  private 发布日期(): string {
    return this.announcement.publishedAt.substring(0, 10);
  }

  private 本地化发布时间(): string {
    return this.getUIContext().getHostContext()!.resourceManager.getStringSync(
      $r('app.string.official_announcement_published_at').id, this.发布日期());
  }

  build() {
    Stack() {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor(this.isDark ? 'rgba(0,0,0,0.40)' : 'rgba(0,0,0,0.15)')
        .backgroundBlurStyle(BlurStyle.Thin, {
          colorMode: this.isDark ? ThemeColorMode.DARK : ThemeColorMode.LIGHT,
          adaptiveColor: AdaptiveColor.DEFAULT
        })
        .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
        .onClick((): void => {})
        .transition(TransitionEffect.OPACITY.animation({
          curve: 取全屏转场曲线(), duration: 取全屏转场时长()
        }))

      Column({ space: 应用尺寸.间距_12 }) {
        DialogHeader({
          title: this.announcement.title,
          actionLabel: $r('app.string.official_announcement_acknowledge'),
          actionEnabled: !this.acknowledging,
          showClose: false,
          onAction: (): void => { this.onAcknowledge(); }
        })

        Text(this.本地化发布时间())
          .fontSize(应用尺寸.字号_说明)
          .fontColor($r('app.color.text_tertiary'))
          .width('100%')

        Scroll() {
          Text(this.announcement.content)
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.text_secondary'))
            .lineHeight(22)
            .width('100%')
        }
        .constraintSize({ maxHeight: 360 })
        .edgeEffect(EdgeEffect.Spring)
        .width('100%')

        Row({ space: 应用尺寸.间距_12 }) {
          if (this.announcement.actionUrl.length > 0) {
            Button() {
              Text() { ThemeTextSpans($r('app.string.official_announcement_details'), this.themeAccentColors, this.getUIContext()) }.fontColor($r('app.color.action_primary'))
            }
              .type(ButtonType.Normal)
              .layoutWeight(1)
              .height(应用尺寸.按钮高度)
              .fontColor($r('app.color.action_primary'))
              .backgroundColor(Color.Transparent)
              .borderRadius(应用尺寸.圆角_面板)
              .onClick((): void => { this.onOpenDetails(); })
          }

        }
        .width('100%')
      }
      .width('88%')
      .constraintSize({ maxWidth: 480, maxHeight: '80%' })
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
