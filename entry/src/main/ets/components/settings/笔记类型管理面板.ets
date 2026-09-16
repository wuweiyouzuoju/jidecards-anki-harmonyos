// SPDX-License-Identifier: AGPL-3.0-or-later
import { ThemeTextSpans } from '../common/ThemeText';
import { THEME_TEXT_COLORS_KEY } from '../../model/ThemeCatalog';

import { DialogHeader } from '../common/DialogHeader';
// ========================================================
// @块ID UI-NOTETYPE-MGMT-001
// @名称 笔记类型管理面板
//
// @作用
// 列出所有笔记类型，支持新建（从标准类型克隆）、删除、点击进入编辑器。
// 对应 Anki 桌面端「管理笔记类型」对话框。
//
// @输入
// isDark: 是否深色主题
// onClose: 关闭回调
// onEdit: (id: number, name: string) => void  打开编辑器回调
//
// @输出
// 渲染笔记类型列表浮卡面板；用户操作时调后端 RPC。
//
// @业务规则
// - 列表来自 笔记类型服务.获取笔记类型名列表()
// - 新建从 标准笔记类型种类 BASIC 克隆（GetStockNotetypeLegacy → AddNotetypeLegacy）
// - 删除走 笔记类型服务.移除笔记类型，至少保留一个类型
// - 所有用户可见文案走 $r('app.string.notetype_mgmt_*')
//
// @副作用
// 持有 笔记类型服务 实例；点击按钮时调后端 RPC。
// ========================================================

import { 笔记类型服务 } from '../../backend/笔记类型服务';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 设置面板色板_取 } from '../../utils/设置面板配色';
import { 颜色键 } from '../../model/颜色主题';
import { 取全屏转场时长, 取全屏转场曲线 } from '../../utils/转场时长';
import { 标准笔记类型种类 } from '../../proto/messages/NotetypeMessages';
import type { NotetypeNameId } from '../../proto/messages/NotetypeMessages';
import { promptAction } from '@kit.ArkUI';

@Component
export struct 笔记类型管理面板 {
  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  @Prop isDark: boolean = false;
  onClose: () => void = (): void => {};
  onEdit: (id: number, name: string) => void = (id: number, name: string): void => {};

  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景: string = '#2F5FD0';
  @State private 加载中: boolean = false;
  @State private 处理中: boolean = false;
  @State private 类型列表: NotetypeNameId[] = [];
  @State private 错误信息: string = '';

  private readonly 服务: 笔记类型服务 = new 笔记类型服务();

  aboutToAppear(): void {
    this.刷新列表();
  }

  private 取本地化文本(资源: Resource): string {
    return this.getUIContext().getHostContext()!.resourceManager.getStringSync(资源.id);
  }

  private async 刷新列表(): Promise<void> {
    this.加载中 = true;
    this.错误信息 = '';
    try {
      this.类型列表 = await this.服务.获取笔记类型名列表();
    } catch (error) {
      this.错误信息 = error instanceof Error ? error.message : `${error}`;
    } finally {
      this.加载中 = false;
    }
  }

  private async 新建笔记类型(): Promise<void> {
    if (this.处理中) {
      return;
    }
    this.处理中 = true;
    this.错误信息 = '';
    try {
      const json: string = await this.服务.获取标准笔记类型JSON(标准笔记类型种类.BASIC);
      const newId: number = await this.服务.添加笔记类型旧版(json);
      if (newId > 0) {
        promptAction.showToast({
          message: this.取本地化文本($r('app.string.notetype_mgmt_created')),
          duration: 2000
        });
        const types: NotetypeNameId[] = await this.服务.获取笔记类型名列表();
        this.类型列表 = types;
        const created: NotetypeNameId | undefined = types.find((type: NotetypeNameId): boolean => type.id === newId);
        this.onEdit(newId, created === undefined ? '' : created.name);
      }
    } catch (error) {
      this.错误信息 = error instanceof Error ? error.message : `${error}`;
    } finally {
      this.处理中 = false;
    }
  }

  private 确认删除(类型: NotetypeNameId): void {
    if (this.类型列表.length <= 1) {
      this.错误信息 = this.取本地化文本($r('app.string.notetype_mgmt_last_one'));
      return;
    }
    this.getUIContext().showAlertDialog({
      title: this.取本地化文本($r('app.string.notetype_mgmt_delete')),
      message: this.取本地化文本($r('app.string.notetype_mgmt_confirm_delete')) + '\n' + 类型.name,
      autoCancel: true,
      alignment: DialogAlignment.Center,
      primaryButton: {
        value: this.取本地化文本($r('app.string.cancel')),
        action: (): void => {}
      },
      secondaryButton: {
        value: this.取本地化文本($r('app.string.notetype_mgmt_delete')),
        fontColor: $r('app.color.error_text'),
        action: (): void => { this.执行删除(类型.id); }
      }
    });
  }

  private async 执行删除(id: number): Promise<void> {
    if (this.处理中) {
      return;
    }
    this.处理中 = true;
    this.错误信息 = '';
    try {
      await this.服务.移除笔记类型(id);
      await this.刷新列表();
    } catch (error) {
      this.错误信息 = error instanceof Error ? error.message : `${error}`;
    } finally {
      this.处理中 = false;
    }
  }

  @Builder
  private 类型行(类型: NotetypeNameId) {
    Row({ space: 应用尺寸.间距_8 }) {
      Column({ space: 2 }) {
        Text(类型.name)
          .fontSize(应用尺寸.字号_正文)
          .fontColor(设置面板色板_取(this.isDark).主文字)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
          .layoutWeight(1)
      }
      .alignItems(HorizontalAlign.Start)
      .layoutWeight(1)

      // 编辑按钮
      Text() { ThemeTextSpans($r('app.string.notetype_mgmt_edit'), this.themeAccentColors, this.getUIContext()) }
        .fontSize(应用尺寸.字号_正文_小)
        .fontColor(this.主色按钮背景)
        .padding({ left: 12, right: 12, top: 6, bottom: 6 })
        .onClick(() => {
          this.onEdit(类型.id, 类型.name);
        })

      // 删除按钮
      Text($r('app.string.notetype_mgmt_delete'))
        .fontSize(应用尺寸.字号_正文_小)
        .fontColor($r('app.color.error_text'))
        .padding({ left: 12, right: 12, top: 6, bottom: 6 })
        .onClick(() => {
          this.确认删除(类型);
        })
    }
    .width('100%')
    .height(56)
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
          if (!this.加载中 && !this.处理中) {
            this.onClose();
          }
        })
        .transition(TransitionEffect.OPACITY.animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }))

      Column({ space: 应用尺寸.间距_16 }) {
        // 固定标题操作栏
        DialogHeader({
          title: $r('app.string.notetype_mgmt_title'),
          actionLabel: $r('app.string.notetype_mgmt_add'),
          actionEnabled: !this.处理中 && !this.加载中,
          closeLabel: $r('app.string.close'),
          closeEnabled: !this.加载中 && !this.处理中,
          onClose: () => { this.onClose(); },
          onAction: () => { this.新建笔记类型(); }
        })

        // 说明文案
        Text($r('app.string.notetype_mgmt_description'))
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_secondary'))
          .width('100%')

        // 新建按钮

        // busy 指示
        if (this.加载中 || this.处理中) {
          Row({ space: 应用尺寸.间距_8 }) {
            LoadingProgress()
              .width(20)
              .height(20)
              .color($r('app.color.action_primary'))
            Text(this.处理中 ? $r('app.string.notetype_mgmt_processing') : $r('app.string.notetype_mgmt_loading'))
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

        // 类型列表
        Scroll() {
          Column({ space: 应用尺寸.间距_4 }) {
            if (this.类型列表.length === 0 && !this.加载中) {
              Text($r('app.string.notetype_mgmt_empty'))
                .fontSize(应用尺寸.字号_正文_小)
                .fontColor($r('app.color.text_secondary'))
                .width('100%')
            }
            ForEach(this.类型列表, (类型: NotetypeNameId) => {
              this.类型行(类型)
            }, (类型: NotetypeNameId): string => `${类型.id}`)
          }
          .width('100%')
        }
        .width('100%')
        .layoutWeight(1)
        .scrollBar(BarState.Auto)
        .align(Alignment.TopStart)
        .edgeEffect(EdgeEffect.Spring)
      }
      .width('88%')
      .height('80%')
      .constraintSize({ maxWidth: 480 })
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
