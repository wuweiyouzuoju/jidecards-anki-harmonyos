// SPDX-License-Identifier: AGPL-3.0-or-later
import { resourceText } from '../../utils/UiFeedback';
import { ThemeTextSpans } from '../common/ThemeText';
import { THEME_TEXT_COLORS_KEY } from '../../model/ThemeCatalog';

import { DialogHeader } from '../common/DialogHeader';
// ========================================================
// @块ID UI-MEDIA-MGMT-001
// @名称 媒体管理面板
//
// @作用
// 媒体管理弹层面板：检查 unused/missing 媒体 + 回收站操作（进回收站/清空/恢复）。
// 持有 媒体服务 实例直接调后端，与 设置面板 持有 集合服务 调 检查数据库 同款模式。
// 不上抛数据意图；操作结果在本面板内实时呈现。
//
// @输入
// isDark: 是否深色主题
// onClose: 关闭回调
//
// @输出
// 渲染媒体管理面板；用户操作时调 媒体服务 并更新本地 @State。
//
// @业务规则
// 检查媒体返回 Core 报告 + unused/missing 计数 + have_trash 标记；unused 可一次性进回收站；
// 清空回收站需二次确认（不可撤销）；恢复回收站将文件移回 collection.media。
// 所有用户可见文案走 $r('app.string.media_*')，禁止硬编码中文。
// 失败时错误信息显示在面板内（红字），不弹 toast。
//
// @副作用
// 持有 媒体服务实例；点击按钮时调后端媒体服务 RPC（经 后端会话 → NAPI 桥）。
// ========================================================

import { 媒体服务 } from '../../backend/媒体服务';
import { 同步服务 } from '../../backend/同步服务';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 设置面板色板_取 } from '../../utils/设置面板配色';
import { 颜色键 } from '../../model/颜色主题';
import { 取全屏转场时长, 取全屏转场曲线 } from '../../utils/转场时长';
import type { CheckMediaSummary } from '../../proto/messages/MediaMessages';

@Component
export struct 媒体管理面板 {
  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  @StorageProp(颜色键.动作主色) private dialogActionColor: string = '#2F5FD0';
  @Prop isDark: boolean = false;
  onClose: () => void = (): void => {};

  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景: string = '#2F5FD0';
  @State private 检查中: boolean = false;
  @State private 处理中: boolean = false;
  @State private 已检查: boolean = false;
  @State private 未使用总数: number = 0;
  @State private 缺失总数: number = 0;
  @State private 检查报告: string = '';
  @State private 回收站有内容: boolean = false;
  @State private 错误信息: string = '';
  @State private 媒体同步中: boolean = false;

  private readonly 媒体服务实例: 媒体服务 = new 媒体服务();
  private readonly 同步服务实例: 同步服务 = new 同步服务();
  // 完整文件名只用于一次性清理，不逐项进入 ArkUI 状态树。
  private 未使用全部: string[] = [];

  aboutToAppear(): void {
    this.检查媒体同步状态();
  }

  /**
   * 查询后端媒体同步是否进行中；active=true 时面板顶部显示警告条。
   * 媒体同步是后台异步任务（关闭同步弹窗不会中止），同步中检查 unused 会得到不稳定结果
   * （新落地的文件还未被笔记引用前临时算 unused，或引用关系还在更新）。
   */
  private async 检查媒体同步状态(): Promise<void> {
    try {
      const 状态 = await this.同步服务实例.媒体同步状态();
      this.媒体同步中 = 状态.active;
    } catch {
      this.媒体同步中 = false;
    }
  }

  private 取本地化文本(资源: Resource): string {
    return resourceText(this.getUIContext(), 资源);
  }

  private 取本地化带参文本(资源: Resource, 参数: Array<string | number>): string {
    return resourceText(this.getUIContext(), 资源, ...参数);
  }

  /**
   * 刷新媒体状态：调 CheckMedia RPC 并更新本地 @State（报告、计数、have_trash、已检查）。
   * 无防重入；调用方负责防重入（检查中/处理中）。
   * Invariants: 报告文本由 Core 生成，页面不展开逐文件 ArkUI 节点。
   * 失败时错误信息写入 @State 错误信息，不抛出。
   */
  private async 刷新媒体状态(): Promise<void> {
    this.错误信息 = '';
    try {
      const 响应: CheckMediaSummary = await this.媒体服务实例.checkMediaSummary();
      this.未使用总数 = 响应.unusedCount;
      this.缺失总数 = 响应.missingCount;
      this.未使用全部 = 响应.unused;
      this.检查报告 = 响应.report;
      this.回收站有内容 = 响应.haveTrash;
      this.已检查 = true;
    } catch (error) {
      this.错误信息 = error instanceof Error ? error.message : `${error}`;
    }
  }

  /**
   * 执行检查媒体：检查中/处理中防重入壳，内部委托 刷新媒体状态。
   * 同时刷新媒体同步状态（用户可能在面板开着时同步开始/结束）。
   */
  private async 执行检查媒体(): Promise<void> {
    if (this.检查中 || this.处理中) {
      return;
    }
    this.检查中 = true;
    this.检查媒体同步状态();
    await this.刷新媒体状态();
    this.检查中 = false;
  }

  private async 执行进回收站(): Promise<void> {
    if (this.检查中 || this.处理中) { return; }
    if (this.未使用全部.length === 0 || this.处理中) {
      return;
    }
    this.处理中 = true;
    this.错误信息 = '';
    try {
      await this.媒体服务实例.媒体文件进回收站(this.未使用全部);
      await this.刷新媒体状态();
    } catch (error) {
      this.错误信息 = error instanceof Error ? error.message : `${error}`;
    } finally {
      this.处理中 = false;
    }
  }

  private 确认清空回收站(): void {
    if (this.检查中 || this.处理中 || !this.回收站有内容) {
      return;
    }
    this.getUIContext().showAlertDialog({
      title: this.取本地化文本($r('app.string.media_empty_trash')),
      message: this.取本地化文本($r('app.string.media_confirm_empty_trash')),
      autoCancel: true,
      alignment: DialogAlignment.Center,
      primaryButton: {
        value: this.取本地化文本($r('app.string.cancel')),
        action: (): void => {}
      },
      secondaryButton: {
        value: this.取本地化文本($r('app.string.media_empty_trash')),
        fontColor: $r('app.color.error_text'),
        action: (): void => { this.执行清空回收站(); }
      }
    });
  }

  private async 执行清空回收站(): Promise<void> {
    if (this.检查中 || this.处理中) {
      return;
    }
    this.处理中 = true;
    this.错误信息 = '';
    try {
      await this.媒体服务实例.清空回收站();
      this.回收站有内容 = false;
    } catch (error) {
      this.错误信息 = error instanceof Error ? error.message : `${error}`;
    } finally {
      this.处理中 = false;
    }
  }

  private async 执行恢复回收站(): Promise<void> {
    if (this.检查中 || this.处理中 || !this.回收站有内容) {
      return;
    }
    this.处理中 = true;
    this.错误信息 = '';
    try {
      await this.媒体服务实例.恢复回收站();
      await this.刷新媒体状态();
    } catch (error) {
      this.错误信息 = error instanceof Error ? error.message : `${error}`;
    } finally {
      this.处理中 = false;
    }
  }

  build() {
    Stack() {
      // 磨砂玻璃遮罩层
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
          if (!this.检查中 && !this.处理中) {
            this.onClose();
          }
        })
        .transition(TransitionEffect.OPACITY.animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }))

      Column({ space: 应用尺寸.间距_16 }) {
        // 固定标题操作栏
        DialogHeader({
          title: $r('app.string.settings_media_management'),
          actionLabel: this.检查中 ? $r('app.string.media_checking') : $r('app.string.media_check'),
          actionEnabled: !this.检查中 && !this.处理中,
          closeLabel: $r('app.string.close'),
          closeEnabled: !this.检查中 && !this.处理中,
          onClose: () => { this.onClose(); },
          onAction: () => { this.执行检查媒体(); }
        })

        // 媒体同步进行中警告条
        if (this.媒体同步中) {
          Row({ space: 应用尺寸.间距_8 }) {
            LoadingProgress()
              .width(16)
              .height(16)
              .color($r('app.color.warning_text'))
            Text($r('app.string.media_sync_in_progress'))
              .fontSize(应用尺寸.字号_正文_小)
              .fontColor($r('app.color.warning_text'))
              .layoutWeight(1)
          }
          .width('100%')
          .padding({
            left: 应用尺寸.间距_12,
            right: 应用尺寸.间距_12,
            top: 应用尺寸.间距_8,
            bottom: 应用尺寸.间距_8
          })
          .backgroundColor(this.isDark ? 'rgba(230, 81, 0, 0.15)' : 'rgba(230, 81, 0, 0.08)')
          .borderRadius(应用尺寸.圆角_卡片)
        }

        // 检查按钮

        // busy 指示
        if (this.检查中) {
          Row({ space: 应用尺寸.间距_8 }) {
            LoadingProgress()
              .width(20)
              .height(20)
              .color($r('app.color.action_primary'))
            Text($r('app.string.media_checking'))
              .fontSize(应用尺寸.字号_正文_中)
              .fontColor($r('app.color.text_secondary'))
          }
          .width('100%')
          .justifyContent(FlexAlign.Center)
        }

        // 错误信息
        if (this.错误信息 !== '') {
          Text(this.错误信息)
            .fontSize(应用尺寸.字号_正文_中)
            .fontColor($r('app.color.error_text'))
            .width('100%')
        }

        // 检查结果
        if (this.已检查) {
          Scroll() {
            Column({ space: 应用尺寸.间距_12 }) {
              // 未使用媒体区
              Column({ space: 应用尺寸.间距_4 }) {
                Row() {
                  Text(this.取本地化带参文本($r('app.string.media_unused_count'), [this.未使用总数]))
                    .fontSize(应用尺寸.字号_正文)
                    .fontColor($r('app.color.text_primary'))
                    .fontWeight(FontWeight.Medium)
                    .layoutWeight(1)
                }
                .width('100%')
                if (this.未使用总数 === 0) {
                  Text($r('app.string.media_no_unused'))
                    .fontSize(应用尺寸.字号_正文_小)
                    .fontColor($r('app.color.text_secondary'))
                    .width('100%')
                }

                Button($r('app.string.media_trash_all_unused'))
                  .type(ButtonType.Normal)
                  .alignSelf(ItemAlign.End)
                  .height(40)
                  .fontSize(14)
                  .fontColor(this.未使用总数 > 0 && !this.处理中 ?
                    $r('app.color.error_text') : $r('app.color.text_secondary'))
                  .backgroundColor($r('app.color.surface_card'))
                  .border({ width: 0.5, color: $r('app.color.border_input') })
                  .borderRadius(10)
                  .enabled(this.未使用总数 > 0 && !this.检查中 && !this.处理中)
                  .stateStyles({ disabled: { .opacity(1) } })
                  .margin({ top: 8 })
                  .onClick(() => { this.执行进回收站(); })
              }
              .width('100%')
              .alignItems(HorizontalAlign.Start)
              .padding(12)
              .backgroundColor($r('app.color.surface_page'))
              .borderRadius(12)

              // 缺失媒体区
              Column({ space: 应用尺寸.间距_4 }) {
                Text(this.取本地化带参文本($r('app.string.media_missing_count'), [this.缺失总数]))
                  .fontSize(应用尺寸.字号_正文)
                  .fontColor($r('app.color.text_primary'))
                  .fontWeight(FontWeight.Medium)
                  .width('100%')
                if (this.缺失总数 === 0) {
                  Text($r('app.string.media_no_missing'))
                    .fontSize(应用尺寸.字号_正文_小)
                    .fontColor($r('app.color.text_secondary'))
                    .width('100%')
                }
              }
              .width('100%')
              .alignItems(HorizontalAlign.Start)
              .padding(12)
              .backgroundColor($r('app.color.surface_page'))
              .borderRadius(12)

              // Core 已生成完整报告；单个 Text 节点避免为每个文件创建 ArkUI 行。
              Column({ space: 应用尺寸.间距_4 }) {
                Text($r('app.string.media_check_report'))
                  .fontSize(应用尺寸.字号_正文)
                  .fontColor($r('app.color.text_primary'))
                  .fontWeight(FontWeight.Medium)
                  .width('100%')
                Text(this.检查报告)
                  .fontSize(应用尺寸.字号_正文_小)
                  .fontColor(设置面板色板_取(this.isDark).主文字)
                  .width('100%')
                  .textAlign(TextAlign.Start)
              }
              .width('100%')
              .padding(12)
              .backgroundColor($r('app.color.surface_page'))
              .borderRadius(12)

              // 回收站状态
              Column({ space: 12 }) {
                Row() {
                  Text($r('app.string.media_trash_status'))
                    .fontSize(应用尺寸.字号_正文)
                    .fontColor($r('app.color.text_primary'))
                    .layoutWeight(1)
                  Text(this.回收站有内容 ? $r('app.string.media_trash_has_items') : $r('app.string.media_trash_empty'))
                    .fontSize(应用尺寸.字号_正文_小)
                    .fontColor(this.回收站有内容 ? $r('app.color.error_text') : $r('app.color.text_secondary'))
                }
                .width('100%')
                Row({ space: 8 }) {
                  Button() {
                    Text() { ThemeTextSpans($r('app.string.media_restore_trash'), (this.回收站有内容 && !this.处理中) ? this.themeAccentColors : [], this.getUIContext()) }.fontSize(14).fontColor(this.回收站有内容 && !this.处理中 ?
                      this.dialogActionColor : $r('app.color.text_secondary'))
                  }
                    .type(ButtonType.Normal)
                    .layoutWeight(1)
                    .height(40)
                    .fontSize(14)
                    .fontColor(this.回收站有内容 && !this.处理中 ?
                      this.dialogActionColor : $r('app.color.text_secondary'))
                    .backgroundColor($r('app.color.surface_card'))
                    .border({ width: 0.5, color: $r('app.color.border_input') })
                    .borderRadius(10)
                    .enabled(this.回收站有内容 && !this.检查中 && !this.处理中)
                    .stateStyles({ disabled: { .opacity(1) } })
                    .onClick(() => { this.执行恢复回收站(); })

                  Button($r('app.string.media_empty_trash'))
                    .type(ButtonType.Normal)
                    .layoutWeight(1)
                    .height(40)
                    .fontSize(14)
                    .fontColor(this.回收站有内容 && !this.处理中 ?
                      $r('app.color.error_text') : $r('app.color.text_secondary'))
                    .backgroundColor($r('app.color.surface_card'))
                    .border({ width: 0.5, color: $r('app.color.border_input') })
                    .borderRadius(10)
                    .enabled(this.回收站有内容 && !this.检查中 && !this.处理中)
                    .stateStyles({ disabled: { .opacity(1) } })
                    .onClick(() => { this.确认清空回收站(); })
                }
                .width('100%')
              }
              .width('100%')
              .padding(12)
              .backgroundColor($r('app.color.surface_page'))
              .borderRadius(12)
            }
            .width('100%')
          }
          .width('100%')
          .constraintSize({ maxHeight: 420 })
          .scrollBar(BarState.Auto)
          .edgeEffect(EdgeEffect.Spring)

          // 处理中指示
          if (this.处理中) {
            Row({ space: 应用尺寸.间距_8 }) {
              LoadingProgress()
                .width(20)
                .height(20)
                .color($r('app.color.action_primary'))
              Text($r('app.string.media_processing'))
                .fontSize(应用尺寸.字号_正文_中)
                .fontColor($r('app.color.text_secondary'))
            }
            .width('100%')
            .justifyContent(FlexAlign.Center)
          }
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
