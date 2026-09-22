// SPDX-License-Identifier: AGPL-3.0-or-later
import { resourceText, showToastSafely } from '../../utils/UiFeedback';
import { ThemeTextSpans } from '../common/ThemeText';
import { THEME_TEXT_COLORS_KEY } from '../../model/ThemeCatalog';

import { DialogHeader } from '../common/DialogHeader';
// ========================================================
// @块ID UI-CUSTOM-STUDY-001
// @名称 自定义学习对话框
//
// @作用
// 提供 Anki Custom Study 的 5 个预设选项：
// 1. 新卡上限增量 — 调整当前牌组今日新卡上限（不创建过滤牌组）
// 2. 复习上限增量 — 调整当前牌组今日复习上限（不创建过滤牌组）
// 3. 复习遗忘天数 — 复习过去 N 天遗忘的卡片（创建过滤牌组）
// 4. 提前复习天数 — 提前复习未来 N 天到期的卡片（创建过滤牌组）
// 5. 预览新卡天数 — 预览未来 N 天的新卡（创建过滤牌组）
// 调用 SchedulerService.CustomStudy RPC 落库。
//
// @输入
// isDark: 是否深色主题
// deckId: 目标牌组 ID（字符串形式，由父组件传入）
// deckName: 牌组名（用于标题展示）
// onClose: 关闭回调
// onSuccess: 成功后回调（刷新首页等）
//
// @输出
// 渲染自定义学习浮卡面板；用户选择预设 + 输入数值后调后端 RPC。
//
// @业务规则
// - 预设 1-2 传 int32（可负），预设 3-5 传 uint32（正数）
// - 后端 CustomStudy 返回 void，失败以 BackendError 抛出
// - 所有用户可见文案走 $r('app.string.custom_study_*')
//
// @副作用
// 持有 调度器服务 实例；点击确定时调后端 RPC。
// ========================================================

import { 调度器服务 } from '../../backend/调度器服务';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 设置面板色板_取 } from '../../utils/设置面板配色';
import { 颜色键 } from '../../model/颜色主题';
import { 取全屏转场时长, 取全屏转场曲线 } from '../../utils/转场时长';
import { 自定义学习预设 } from '../../proto/messages/SchedulerMessages';
import type { 自定义学习默认值 } from '../../proto/messages/SchedulerMessages';

interface 预设选项 {
  字段号: number;
  标题资源: Resource;
  说明资源: Resource;
  /** true=天数（uint32 正数），false=增量（int32 可负） */
  是天数: boolean;
  默认值: number;
}

@Component
export struct 自定义学习对话框 {
  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  @Prop isDark: boolean = false;
  @Prop deckId: string = '';
  @Prop deckName: string = '';
  onClose: () => void = (): void => {};
  onSuccess: () => void = (): void => {};

  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景: string = '#2F5FD0';
  @State private 选中预设: number = 0;
  @State private 输入值: string = '';
  @State private 处理中: boolean = false;
  @State private 错误信息: string = '';
  @State private 默认值: 自定义学习默认值 | null = null;
  @State private 加载默认值中: boolean = false;

  private readonly 调度器: 调度器服务 = new 调度器服务();

  private readonly 预设列表: 预设选项[] = [
    {
      字段号: 自定义学习预设.新卡上限增量,
      标题资源: $r('app.string.custom_study_preset_new_limit'),
      说明资源: $r('app.string.custom_study_preset_new_limit_hint'),
      是天数: false,
      默认值: 10
    },
    {
      字段号: 自定义学习预设.复习上限增量,
      标题资源: $r('app.string.custom_study_preset_review_limit'),
      说明资源: $r('app.string.custom_study_preset_review_limit_hint'),
      是天数: false,
      默认值: 10
    },
    {
      字段号: 自定义学习预设.复习遗忘天数,
      标题资源: $r('app.string.custom_study_preset_forgotten'),
      说明资源: $r('app.string.custom_study_preset_forgotten_hint'),
      是天数: true,
      默认值: 1
    },
    {
      字段号: 自定义学习预设.提前复习天数,
      标题资源: $r('app.string.custom_study_preset_ahead'),
      说明资源: $r('app.string.custom_study_preset_ahead_hint'),
      是天数: true,
      默认值: 1
    },
    {
      字段号: 自定义学习预设.预览新卡天数,
      标题资源: $r('app.string.custom_study_preset_preview'),
      说明资源: $r('app.string.custom_study_preset_preview_hint'),
      是天数: true,
      默认值: 1
    }
  ];

  aboutToAppear(): void {
    this.选中预设 = 自定义学习预设.新卡上限增量;
    this.输入值 = '10';
    this.加载默认值();
  }

  private 取本地化文本(资源: Resource): string {
    return resourceText(this.getUIContext(), 资源);
  }

  private 取本地化带参文本(资源: Resource, 参数: Array<string | number>): string {
    return resourceText(this.getUIContext(), 资源, ...参数);
  }

  private async 加载默认值(): Promise<void> {
    const id: number = Number(this.deckId);
    if (id === 0) {
      return;
    }
    this.加载默认值中 = true;
    try {
      this.默认值 = await this.调度器.获取自定义学习默认值(id);
    } catch (error) {
      // 默认值加载失败不阻塞面板使用，仅无可用数量提示
      this.默认值 = null;
    } finally {
      this.加载默认值中 = false;
    }
  }

  private 当前预设(): 预设选项 {
    for (const 预设 of this.预设列表) {
      if (预设.字段号 === this.选中预设) {
        return 预设;
      }
    }
    return this.预设列表[0];
  }

  private 切换预设(字段号: number): void {
    if (this.处理中) {
      return;
    }
    this.选中预设 = 字段号;
    // 切换预设时重置输入值为默认值
    const 预设 = this.当前预设();
    this.输入值 = 预设.默认值.toString();
    this.错误信息 = '';
  }

  private 可提交(): boolean {
    if (this.处理中) {
      return false;
    }
    const 文本 = this.输入值.trim();
    if (文本 === '') {
      return false;
    }
    const 值 = Number(文本);
    if (isNaN(值)) {
      return false;
    }
    // 天数预设要求正整数
    const 预设 = this.当前预设();
    if (预设.是天数 && (值 <= 0 || !Number.isInteger(值))) {
      return false;
    }
    return true;
  }

  private async 执行提交(): Promise<void> {
    if (!this.可提交()) {
      return;
    }
    const id: number = Number(this.deckId);
    if (id === 0) {
      this.错误信息 = this.取本地化文本($r('app.string.custom_study_error'));
      return;
    }
    const 预设 = this.当前预设();
    const 值: number = Number(this.输入值.trim());
    this.处理中 = true;
    this.错误信息 = '';
    try {
      await this.调度器.自定义学习(id, 预设.字段号, 值);
      showToastSafely(this.getUIContext(), {
        message: this.取本地化文本($r('app.string.custom_study_success')),
        duration: 2000
      });
      this.onSuccess();
      this.onClose();
    } catch (error) {
      this.错误信息 = error instanceof Error ? error.message : `${error}`;
    } finally {
      this.处理中 = false;
    }
  }

  @Builder
  private 预设行(预设: 预设选项) {
    Row({ space: 应用尺寸.间距_8 }) {
      Row() {
        Column({ space: 2 }) {
          Text() { ThemeTextSpans(预设.标题资源, (this.选中预设 === 预设.字段号) ? this.themeAccentColors : [], this.getUIContext()) }
            .fontSize(应用尺寸.字号_正文)
            .fontColor(this.选中预设 === 预设.字段号 ?
              设置面板色板_取(this.isDark).主色 : 设置面板色板_取(this.isDark).主文字)
            .fontWeight(this.选中预设 === 预设.字段号 ? FontWeight.Bold : FontWeight.Medium)
          Text(预设.说明资源)
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor(设置面板色板_取(this.isDark).弱化文字)
            .maxLines(2)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        .alignItems(HorizontalAlign.Start)
        .layoutWeight(1)
      }
      .width('100%')
      .padding({
        left: 应用尺寸.间距_14,
        right: 应用尺寸.间距_14,
        top: 应用尺寸.间距_12,
        bottom: 应用尺寸.间距_12
      })
      .backgroundColor(this.选中预设 === 预设.字段号 ?
        设置面板色板_取(this.isDark).标签背景 : 设置面板色板_取(this.isDark).背景)
      .border({
        width: 应用尺寸.卡片边框,
        color: this.选中预设 === 预设.字段号 ?
          设置面板色板_取(this.isDark).主色 : Color.Transparent
      })
      .borderRadius(应用尺寸.圆角_面板)
      .onClick(() => { this.切换预设(预设.字段号); })
    }
    .width('100%')
  }

  build() {
    Stack() {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor(设置面板色板_取(this.isDark).遮罩)
        .backgroundBlurStyle(BlurStyle.Thin, {
          colorMode: this.isDark ? ThemeColorMode.DARK : ThemeColorMode.LIGHT,
          adaptiveColor: AdaptiveColor.DEFAULT
        })
        .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
        .onClick(() => {
          if (!this.处理中) {
            this.onClose();
          }
        })
        .transition(TransitionEffect.OPACITY.animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }))

      Column({ space: 应用尺寸.间距_16 }) {
        DialogHeader({
          title: $r('app.string.custom_study_title'),
          actionLabel: this.处理中 ?
            $r('app.string.custom_study_running') : $r('app.string.custom_study_confirm'),
          actionEnabled: this.可提交(),
          closeLabel: $r('app.string.custom_study_cancel'),
          closeEnabled: !this.处理中,
          onClose: () => { this.onClose(); },
          onAction: () => { this.执行提交(); }
        })

        if (this.deckName !== '') {
          Text(this.deckName)
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.text_secondary'))
            .width('100%')
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }

        // 可用卡片数提示
        if (this.默认值 !== null) {
          Row({ space: 应用尺寸.间距_12 }) {
            Text(this.取本地化带参文本($r('app.string.custom_study_available_new'),
              [this.默认值.availableNew + this.默认值.availableNewInChildren]))
              .fontSize(应用尺寸.字号_正文_小)
              .fontColor(设置面板色板_取(this.isDark).次文字)
            Text(this.取本地化带参文本($r('app.string.custom_study_available_review'),
              [this.默认值.availableReview + this.默认值.availableReviewInChildren]))
              .fontSize(应用尺寸.字号_正文_小)
              .fontColor(设置面板色板_取(this.isDark).次文字)
          }
          .width('100%')
        }

        // 预设列表
        Scroll() {
          Column({ space: 应用尺寸.间距_8 }) {
            ForEach(this.预设列表, (预设: 预设选项) => {
              this.预设行(预设)
            }, (预设: 预设选项): string => 预设.字段号.toString())
          }
          .width('100%')
        }
        .width('100%')
        .layoutWeight(1)
        .scrollBar(BarState.Auto)
        .edgeEffect(EdgeEffect.Spring)

        // 数值输入
        Column({ space: 应用尺寸.间距_5 }) {
          Text(this.当前预设().是天数 ?
            $r('app.string.custom_study_days_label') : $r('app.string.custom_study_value_label'))
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.text_secondary'))
            .width('100%')
          TextInput({ text: this.输入值 })
            .width('100%')
            .height(应用尺寸.按钮高度)
            .fontSize(应用尺寸.字号_正文)
            .fontColor($r('app.color.text_primary'))
            .placeholderColor($r('app.color.text_tertiary'))
            .backgroundColor($r('app.color.surface_card'))
            .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
            .borderRadius(应用尺寸.圆角_面板)
            .padding({ left: 应用尺寸.卡片内边距, right: 应用尺寸.卡片内边距 })
            .type(this.当前预设().是天数 ? InputType.Number : InputType.Number)
            .enabled(!this.处理中)
            .onChange((value: string) => {
              this.输入值 = value;
            })
            .onSubmit((): void => {
              this.执行提交();
            })
        }
        .width('100%')

        if (this.错误信息 !== '') {
          Text(this.错误信息)
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.error_text'))
            .width('100%')
            .maxLines(3)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }

      }
      .width('88%')
      .constraintSize({ maxWidth: 480, maxHeight: '88%' })
      .padding(应用尺寸.面板内边距)
      .backgroundColor($r('app.color.surface_card'))
      .borderRadius(应用尺寸.圆角_卡片)
      .onClick(() => {})
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
