// SPDX-License-Identifier: AGPL-3.0-or-later

import { DialogHeader } from './common/DialogHeader';
// ========================================================
// @块ID UI-FIELD-HELP-001
// @名称 字段帮助面板
//
// @作用
// 通用字段帮助浮层：磨砂遮罩 + 居中卡片，承载单条字段帮助文案的
// 弹层展示。父级通过 @Prop 下发 title / body 资源引用，本面板只
// 负责呈现与关闭交互，不做业务计算。
//
// @输入
// title: 帮助标题资源（Resource）
// body: 帮助正文资源（Resource）
//
// @输出
// onClose: 用户关闭时回调（点遮罩 / 完成 按钮）
//
// @业务规则
// 字段帮助是 opt-in（仅点 ⓘ 触发），不做主动弹出。
// 资源 key（app.string.deck_options_title / deck_learn_steps_help / done 等）
// 作为 i18n 键保留英文，由父级传入 Resource 引用。
//
// @副作用
// 无。本组件不写后端、不写存储；仅触发外部回调。
// ========================================================

import { 应用尺寸 } from '../utils/应用尺寸';
import { 颜色键 } from '../model/颜色主题';
import { 取全屏转场时长, 取全屏转场曲线 } from '../utils/转场时长';

@Component
export struct 字段帮助面板 {
  @Prop 标题: ResourceStr = $r('app.string.deck_options_title');
  @Prop 正文: ResourceStr = $r('app.string.deck_learn_steps_help');
  @Prop 是否深色: boolean = false;
  // 主题色按钮背景（与创建牌组面板等主色按钮同款 @StorageProp 机制，跟随 ColorTheme 切换）
  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景: string = '#2F5FD0';
  onClose: () => void = (): void => {};

  build() {
    Stack() {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor(this.是否深色 ? 'rgba(0,0,0,0.40)' : 'rgba(0,0,0,0.15)')
        .backgroundBlurStyle(BlurStyle.Thin, {
          colorMode: this.是否深色 ? ThemeColorMode.DARK : ThemeColorMode.LIGHT,
          adaptiveColor: AdaptiveColor.DEFAULT
        })
        .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
        .transition(TransitionEffect.OPACITY.animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }))
        .onClick(() => this.onClose())
      Column({ space: 应用尺寸.间距_12 }) {
        DialogHeader({
          title: this.标题,
          actionLabel: $r('app.string.done'),
          actionEnabled: true,
          showClose: false,
          onAction: () => this.onClose()
        })
        Scroll() {
          Text(this.正文).fontSize(应用尺寸.字号_正文).fontColor($r('app.color.text_secondary')).width('100%')
        }
        .width('100%')
        .constraintSize({ maxHeight: '55%' })
        .scrollBar(BarState.Auto)
        .edgeEffect(EdgeEffect.Spring)

      }
      .width('88%').constraintSize({ maxWidth: 480, maxHeight: '75%' }).padding(应用尺寸.卡片内边距)
      .backgroundColor($r('app.color.surface_card')).borderRadius(应用尺寸.圆角_卡片)
      .transition(TransitionEffect.asymmetric(
        TransitionEffect.opacity(0)
          .combine(TransitionEffect.scale({ x: 0.96, y: 0.96 }))
          .animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }),
        TransitionEffect.opacity(0)
          .animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() })
      ))
      .onClick(() => {})
    }
    .width('100%')
    .height('100%')
    // 显式 Center 对齐：浮层卡片在 Stack（铺满屏幕）中央对齐，即屏幕中央。
    // Invariants: 不写 alignContent 时 ArkUI 默认 Center，但显式声明防止版本差异
    // 及可读性（曾出现：嵌套层级 + 默认对齐导致浮层居中在遮罩局部中而非屏幕中央）。
    .alignContent(Alignment.Center)
  }
}
