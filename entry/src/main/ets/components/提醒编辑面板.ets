// SPDX-License-Identifier: AGPL-3.0-or-later
import { SelectStyle } from '../utils/SelectStyle';
import { ThemeTextSpans } from './common/ThemeText';
import { THEME_TEXT_COLORS_KEY } from '../model/ThemeCatalog';

import { DialogHeader } from './common/DialogHeader';
// ========================================================
// @块ID UI-REMINDER-EDIT-001
// @名称 提醒编辑弹层（新建/编辑共用）
//
// @作用
// 纯 UI 积木：在磨砂遮罩上方弹出居中浮卡，承载提醒的全部编辑字段——
// 时间（时/分选择器）、通知标题、通知内容（含占位符快捷插入）。
// 新建/编辑两种模式共用，编辑模式多一个删除按钮。
// 通过回调上抛结果，不直接接触后端；样式与创建牌组面板同款。
//
// @输入
// isDark: 是否深色主题
// busy: 父级是否正在保存（禁用所有交互）
// errorMessage: 父级下发的错误文案（空则不显示）
// 是否新建: true=新建模式（标题"新建提醒"，无删除按钮），false=编辑模式
// 初始小时/初始分钟/初始标题/初始内容: 编辑模式回填的初始值
//
// @输出
// onCancel: 取消回调（点遮罩 / 取消按钮）
// onConfirm: 提交回调，参数为 小时/分钟/标题/内容
// onDelete: 删除回调（仅编辑模式显示按钮）
//
// @业务规则
// 新建默认时间 06:00；标题/内容留空走服务层默认文案；
// 占位符 token 中文 {{待学}}/{{待复习}}、英文 {{new}}/{{review}}，服务层两种都识别。
//
// @副作用
// 无。本组件不写后端、不写存储；仅触发外部回调。
// ========================================================

import { 应用尺寸 } from '../utils/应用尺寸';
import { 颜色键 } from '../model/颜色主题';
import { 取全屏转场时长, 取全屏转场曲线 } from '../utils/转场时长';

@Component
export struct 提醒编辑面板 {
  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  @Prop isDark: boolean = false;
  @Prop busy: boolean = false;
  @Prop errorMessage: string = '';
  @Prop 是否新建: boolean = true;
  @Prop 初始小时: number = 6;
  @Prop 初始分钟: number = 0;
  @Prop 初始标题: string = '';
  @Prop 初始内容: string = '';
  onCancel: () => void = (): void => {
  };
  onConfirm: (小时: number, 分钟: number, 标题: string, 内容: string) => void =
    (小时: number, 分钟: number, 标题: string, 内容: string): void => {
    };
  onDelete: () => void = (): void => {
  };

  // 新建默认早上 6 点（用户指定），编辑模式回填原值
  @State private 小时: number = 6;
  @State private 分钟: number = 0;
  @State private 标题: string = '';
  @State private 内容: string = '';

  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景: string = '#2F5FD0';
  @StorageProp(颜色键.主色按钮按下) private 主色按钮按下: string = '#1E4FB8';
  @State private 已按下确认: boolean = false;

  // 表单滚动区上限（vp）：屏高×88% 减去固定区（标题/错误/删除/按钮行/内边距，编辑模式最坏约 272vp）。
  // 必须是数字——Scroll 用 constraintSize({ maxHeight: 数字 }) 才有"内容少随内容、超限封顶滚动"语义
  // （华为官方 FAQ 弹窗动态高度方案）；百分比在高度自适应的父容器里解析不可靠，flexShrink/无约束
  // 时 Scroll 测量倾向占满父容器给的最大空间，两种写法实测都会把弹窗撑满不自适应。
  @State private 表单滚动上限: number = 400;

  /** 全屏 Stack onAreaChange：按实际屏高（vp）重算表单滚动上限，横竖屏切换自动适配 */
  private 重算表单滚动上限(屏高vp: number): void {
    this.表单滚动上限 = Math.max(200, 屏高vp * 0.88 - 272);
  }

  aboutToAppear(): void {
    this.小时 = this.初始小时;
    this.分钟 = this.初始分钟;
    this.标题 = this.初始标题;
    this.内容 = this.初始内容;
  }

  // ArkTS 严格模式：Select 选项数组需显式 SelectOption[] 类型 + push，不能字面量拼接
  private 小时选项(): SelectOption[] {
    const 选项: SelectOption[] = [];
    for (let i: number = 0; i < 24; i++) {
      选项.push({ value: i < 10 ? `0${i}` : `${i}` });
    }
    return 选项;
  }

  private 分钟选项(): SelectOption[] {
    const 选项: SelectOption[] = [];
    for (let i: number = 0; i < 60; i++) {
      选项.push({ value: i < 10 ? `0${i}` : `${i}` });
    }
    return 选项;
  }

  private 取本地化文本(resource: Resource): string {
    return this.getUIContext().getHostContext()!.resourceManager.getStringSync(resource.id);
  }

  /** 点标签把占位符追加到内容末尾，免手打花括号 */
  private 插入占位符(token资源: Resource): void {
    this.内容 = this.内容 + this.取本地化文本(token资源);
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
        .onClick(() => {
          if (!this.busy) {
            this.onCancel();
          }
        })
        .transition(TransitionEffect.OPACITY.animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }))

      Column({ space: 应用尺寸.间距_16 }) {
        DialogHeader({
          title: this.是否新建 ? $r('app.string.reminder_edit_title_create') : $r('app.string.reminder_edit_title_edit'),
          actionLabel: this.是否新建 ? $r('app.string.create_deck_confirm') : $r('app.string.deck_customize_save'),
          actionEnabled: !this.busy,
          closeLabel: $r('app.string.create_deck_cancel'),
          closeEnabled: !this.busy,
          onClose: () => {
            this.onCancel();
          },
          onAction: () => {
            this.onConfirm(this.小时, this.分钟, this.标题, this.内容);
          }
        })

        // 表单主体：高度随内容自适应；超过上限（屏高 88% - 固定区）时封顶并在内部滚动。
        // constraintSize 必须传数字（见字段声明处注释）。
        Scroll() {
          Column({ space: 应用尺寸.间距_16 }) {
            Text($r('app.string.reminder_edit_time_label'))
              .fontSize(应用尺寸.字号_正文_小)
              .fontColor($r('app.color.text_secondary'))
              .width('100%')

            Row() {
              Select(this.小时选项())
                .selected(this.小时)
                .value(this.小时 < 10 ? `0${this.小时}` : `${this.小时}`)
                .width(100)
                .enabled(!this.busy)
                .attributeModifier(new SelectStyle())
                .font(SelectStyle.controlFont)
                .borderRadius(SelectStyle.controlRadius)
                .onSelect((index: number): void => {
                  this.小时 = index;
                })
              Text($r('app.string.reminder_edit_time_colon'))
                .fontSize(应用尺寸.字号_面板标题)
                .fontColor($r('app.color.text_primary'))
                .margin({ left: 应用尺寸.间距_8, right: 应用尺寸.间距_8 })
              Select(this.分钟选项())
                .selected(this.分钟)
                .value(this.分钟 < 10 ? `0${this.分钟}` : `${this.分钟}`)
                .width(100)
                .enabled(!this.busy)
                .attributeModifier(new SelectStyle())
                .font(SelectStyle.controlFont)
                .borderRadius(SelectStyle.controlRadius)
                .onSelect((index: number): void => {
                  this.分钟 = index;
                })
            }
            .width('100%')
            .justifyContent(FlexAlign.Center)

            Text($r('app.string.reminder_edit_notification_title'))
              .fontSize(应用尺寸.字号_正文_小)
              .fontColor($r('app.color.text_secondary'))
              .width('100%')

            TextInput({ placeholder: $r('app.string.reminder_edit_title_placeholder'), text: this.标题 })
              .width('100%')
              .height(应用尺寸.按钮高度)
              .fontSize(应用尺寸.字号_正文)
              .fontColor($r('app.color.text_primary'))
              .placeholderColor($r('app.color.text_tertiary'))
              .backgroundColor($r('app.color.surface_page'))
              .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
              .borderRadius(应用尺寸.圆角_面板)
              .padding({ left: 应用尺寸.卡片内边距, right: 应用尺寸.卡片内边距 })
              .enabled(!this.busy)
              .onChange((value: string) => {
                this.标题 = value;
              })

            Text($r('app.string.reminder_edit_notification_content'))
              .fontSize(应用尺寸.字号_正文_小)
              .fontColor($r('app.color.text_secondary'))
              .width('100%')

            TextArea({ placeholder: $r('app.string.reminder_edit_content_placeholder'), text: this.内容 })
              .width('100%')
              .height(80)
              .fontSize(应用尺寸.字号_正文)
              .fontColor($r('app.color.text_primary'))
              .placeholderColor($r('app.color.text_tertiary'))
              .backgroundColor($r('app.color.surface_page'))
              .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
              .borderRadius(应用尺寸.圆角_面板)
              .padding(应用尺寸.间距_8)
              .enabled(!this.busy)
              .onChange((value: string) => {
                this.内容 = value;
              })

            // 快捷插入标签：点一下把占位符追加到内容末尾
            Row({ space: 应用尺寸.间距_8 }) {
              Text() { ThemeTextSpans($r('app.string.reminder_edit_insert_new'), this.themeAccentColors, this.getUIContext()) }
                .fontSize(应用尺寸.字号_正文_小)
                .fontColor(this.主色按钮背景)
                .padding({ left: 应用尺寸.间距_12, right: 应用尺寸.间距_12, top: 6, bottom: 6 })
                .border({ width: 1, color: this.主色按钮背景 })
                .borderRadius(14)
                .onClick((): void => {
                  this.插入占位符($r('app.string.reminder_edit_token_new'));
                })
              Text() { ThemeTextSpans($r('app.string.reminder_edit_insert_review'), this.themeAccentColors, this.getUIContext()) }
                .fontSize(应用尺寸.字号_正文_小)
                .fontColor(this.主色按钮背景)
                .padding({ left: 应用尺寸.间距_12, right: 应用尺寸.间距_12, top: 6, bottom: 6 })
                .border({ width: 1, color: this.主色按钮背景 })
                .borderRadius(14)
                .onClick((): void => {
                  this.插入占位符($r('app.string.reminder_edit_token_review'));
                })
            }
            .width('100%')

            Text($r('app.string.reminder_edit_placeholder_hint'))
              .fontSize(11)
              .fontColor($r('app.color.text_tertiary'))
              .width('100%')
          }
          .width('100%')
        }
        .width('100%')
        .constraintSize({ maxHeight: this.表单滚动上限 })
        .scrollBar(BarState.Auto)
        .edgeEffect(EdgeEffect.Spring)

        if (this.errorMessage !== '') {
          Text(this.errorMessage)
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.error_text'))
            .width('100%')
            .maxLines(3)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }

        if (!this.是否新建) {
          Button($r('app.string.reminder_edit_delete'))
            .type(ButtonType.Normal)
            .alignSelf(ItemAlign.End)
            .height(应用尺寸.按钮高度)
            .fontSize(应用尺寸.字号_按钮)
            .fontColor($r('app.color.error_text'))
            .backgroundColor(Color.Transparent)
            .borderRadius(应用尺寸.圆角_胶囊)
            .enabled(!this.busy)
            .onClick(() => {
              this.onDelete();
            })
        }

      }
      .width('88%')
      // 高度完全自适应：Scroll 已按数字上限封顶（88% 屏高 - 固定区），卡片无需再设
      // maxHeight 百分比（百分比约束在自适应父容器里解析不可靠，见字段声明处注释）
      .constraintSize({ maxWidth: 480 })
      .padding(应用尺寸.面板内边距)
      .backgroundColor($r('app.color.surface_card'))
      .borderRadius(应用尺寸.圆角_卡片)
      .onClick(() => {
        // 阻断点击穿透到遮罩
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
    .alignContent(Alignment.Center)
    .onAreaChange((_旧区域: Area, 新区域: Area): void => {
      // Area 尺寸单位为 vp，类型为 Length，按项目惯例转 number 后重算表单滚动上限
      const 屏高vp: number = typeof 新区域.height === 'number'
        ? 新区域.height : parseInt(新区域.height as string, 10);
      if (!Number.isNaN(屏高vp)) {
        this.重算表单滚动上限(屏高vp);
      }
    })
  }
}
