// SPDX-License-Identifier: AGPL-3.0-or-later
import { ThemeTextSpans } from './common/ThemeText';
import { THEME_TEXT_COLORS_KEY } from '../model/ThemeCatalog';

// ========================================================
// @块ID UI-LICENSES-001
// @名称 许可证面板
//
// @作用
// 开源许可与第三方声明面板：应用许可、源码获取、用户权利、第三方组件与免责。
// 磨砂玻璃遮罩 + 88% 卡片，可滚动浏览，点遮罩或右上角「完成」关闭。
//
// @输入
// isDark: 是否深色主题（控制遮罩色与磨砂风格）
//
// @输出
// onClose: 用户关闭时回调（点遮罩 / 完成按钮）
//
// @业务规则
// 资源 key（licenses_title / licenses_confirm / licenses_overview_section /
// licenses_overview_body / licenses_app_section / licenses_app_body /
// licenses_source_section / licenses_source_body / licenses_rights_section /
// licenses_rights_body / licenses_third_section / licenses_third_anki /
// licenses_third_rust / licenses_third_ibestui / licenses_trademark_section /
// licenses_trademark_body / licenses_disclaimer_section / licenses_disclaimer_body）
// 作为 i18n 键保留英文。
// licenseSection / licenseBody 为 @Builder 方法，已中文化（许可证段落 / 许可证正文）。
// 2026-07-28：原关于页的 app_about_summary / data_notice / license_notice / anki_notice
// 已迁移到本面板（overview 段落放 summary，其余内容被现有段落覆盖或合并）。
//
// @副作用
// 无。本组件不写后端、不写存储；仅触发外部回调。
// ========================================================

import { 应用尺寸 } from '../utils/应用尺寸';
import { 颜色键 } from '../model/颜色主题';
import { 取全屏转场时长, 取全屏转场曲线 } from '../utils/转场时长';

@Component
export struct 许可证面板 {
  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  @Prop isDark: boolean = false;
  onClose: () => void = (): void => {
  };
  @StorageProp(颜色键.动作主色) private 动作主色: string = '#2F5FD0';

  @Builder
  private 许可证段落(标题: Resource, 正文: Resource) {
    Column({ space: 应用尺寸.间距_4 }) {
      Text(标题)
        .fontSize(应用尺寸.字号_按钮)
        .fontWeight(FontWeight.Medium)
        .fontColor($r('app.color.text_primary'))
        .width('100%')
      Text(正文)
        .fontSize(应用尺寸.字号_正文_中)
        .fontColor($r('app.color.text_secondary'))
        .width('100%')
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
  }

  @Builder
  private 许可证正文(正文: Resource) {
    Text(正文)
      .fontSize(应用尺寸.字号_正文_中)
      .fontColor($r('app.color.text_secondary'))
      .width('100%')
  }

  build() {
    Stack() {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor(this.isDark ? 'rgba(0,0,0,0.40)' : 'rgba(0,0,0,0.15)')
        // 磨砂玻璃质感：模糊下层内容避免叠字，材质着色跟随应用内主题（思路参考：华为开发者文档 backgroundBlurStyle）
        .backgroundBlurStyle(BlurStyle.Thin, {
          colorMode: this.isDark ? ThemeColorMode.DARK : ThemeColorMode.LIGHT,
          adaptiveColor: AdaptiveColor.DEFAULT
        })
        // 遮罩扩展进安全区，否则状态栏/导航条区域露出下层背景
        .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
        .onClick(() => {
          this.onClose();
        })
        // 过渡仅动 opacity/translate/scale 合成属性，不触发布局（思路参考：华为官方 TransitionEffect 示例）
        .transition(TransitionEffect.OPACITY.animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }))

      Column({ space: 应用尺寸.间距_12 }) {
        Row() {
          Text($r('app.string.licenses_title'))
            .fontSize(应用尺寸.字号_面板标题)
            .fontWeight(FontWeight.Bold)
            .fontColor($r('app.color.text_primary'))
          Blank()
          Text() { ThemeTextSpans($r('app.string.licenses_confirm'), this.themeAccentColors, this.getUIContext()) }
            .fontSize(应用尺寸.字号_强调)
            .fontWeight(FontWeight.Medium)
            .fontColor(this.动作主色)
            .padding({
              left: 应用尺寸.页面内边距_水平,
              right: 应用尺寸.间距_4,
              top: 应用尺寸.间距_8,
              bottom: 应用尺寸.间距_8
            })
            .onClick(() => {
              this.onClose();
            })
        }
        .width('100%')

        Scroll() {
          Column({ space: 应用尺寸.间距_16 }) {
            this.许可证段落($r('app.string.licenses_overview_section'),
              $r('app.string.licenses_overview_body'))
            this.许可证段落($r('app.string.licenses_app_section'),
              $r('app.string.licenses_app_body'))
            this.许可证段落($r('app.string.licenses_source_section'),
              $r('app.string.licenses_source_body'))
            this.许可证段落($r('app.string.licenses_rights_section'),
              $r('app.string.licenses_rights_body'))
            this.许可证段落($r('app.string.licenses_third_section'),
              $r('app.string.licenses_third_anki'))
            this.许可证正文($r('app.string.licenses_third_rust'))
            this.许可证正文($r('app.string.licenses_third_ibestui'))
            this.许可证段落($r('app.string.licenses_trademark_section'),
              $r('app.string.licenses_trademark_body'))
            this.许可证段落($r('app.string.licenses_disclaimer_section'),
              $r('app.string.licenses_disclaimer_body'))
          }
          .width('100%')
          .alignItems(HorizontalAlign.Start)
        }
        .layoutWeight(1)
        .scrollBar(BarState.Off)
        .edgeEffect(EdgeEffect.Spring)
        .align(Alignment.Top)
      }
      .width('88%')
      .constraintSize({ maxWidth: 480, maxHeight: '88%' })
      .height('88%')
      .padding(应用尺寸.卡片内边距)
      .backgroundColor($r('app.color.surface_card'))
      .borderRadius(应用尺寸.圆角_卡片)
      .onClick(() => {
      })
      .transition(TransitionEffect.asymmetric(
        TransitionEffect.opacity(0)
          .combine(TransitionEffect.scale({ x: 0.96, y: 0.96 }))
          .animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }),
        TransitionEffect.opacity(0)
          .animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() })
      ))
    }
    .width('100%')
    .height('100%')
  }
}
