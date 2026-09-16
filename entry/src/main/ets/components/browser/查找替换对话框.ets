// SPDX-License-Identifier: AGPL-3.0-or-later

import { DialogHeader } from '../common/DialogHeader';
// ========================================================
// @名称 查找替换对话框
//
// @作用
// 浏览页 T9 查找替换弹层：纯展示层组件，用于在笔记字段或标签中批量替换文本。
// 父级（浏览页）拥有全部后端调用，本组件仅负责输入收集与校验提示。
// 复用 浏览编辑区.ets 的弹层骨架（Stack + 遮罩 + 主面板 + 底部按钮）。
//
// @输入
// isDark: 是否深色主题
// busy: 父级是否正在落盘
// errorMessage: 父级下发的错误文案
// 有选中笔记: 是否有选中行（控制"仅选中笔记"单选项是否可选）
//
// @输出
// onCancel: 取消回调
// onExecute: 执行替换回调，参数为（查找/替换/字段名/正则/区分大小写/仅选中），
//   返回是否成功（父级负责调后端查找并替换 RPC 落盘）
//
// @Invariants
// - 本组件不直接调后端，所有写入经 onExecute 回调上抛
// - busy=true 时所有输入与按钮禁用，防止重复点击
// - 查找内容为空时本地拦截，不发 onExecute
// - 有选中笔记=false 时强制"全部笔记"，仅选中选项禁用
//
// @Extension Points
// - 字段名当前为自由输入（空=所有字段），后续可改为 Select 列出当前笔记类型字段
// - 标签替换可扩展为 fieldName 固定 "Tags" 的特例
//
// @副作用
// 仅通过外部回调引发后端写入；本组件不直接落盘。
// ========================================================

import { 应用尺寸 } from '../../utils/应用尺寸';
import { 颜色键 } from '../../model/颜色主题';
import { 取全屏转场时长, 取全屏转场曲线 } from '../../utils/转场时长';

@Component
export struct 查找替换对话框 {
  @Prop isDark: boolean = false;
  @Prop busy: boolean = false;
  @Prop errorMessage: string = '';
  @Prop 有选中笔记: boolean = false;
  onCancel: () => void = (): void => {};
  onExecute: (
    查找: string,
    替换: string,
    字段名: string,
    正则: boolean,
    区分大小写: boolean,
    仅选中: boolean
  ) => Promise<boolean> =
    async (
      _查找: string,
      _替换: string,
      _字段名: string,
      _正则: boolean,
      _区分大小写: boolean,
      _仅选中: boolean
    ): Promise<boolean> => false;
  // ⓘ 帮助回调：上抛给父组件（浏览页）统一渲染 字段帮助面板 浮层，与批量操作栏 ⓘ 同模式
  onHelp: () => void = (): void => {};
  // 正则表达式 ⓘ 回调：上抛给父组件显示正则语法说明（browser_find_regex_help）
  onRegexHelp: () => void = (): void => {};

  @State private 查找文本: string = '';
  @State private 替换文本: string = '';
  @State private 字段名: string = '';
  @State private 是否正则: boolean = false;
  @State private 是否区分大小写: boolean = false;
  @State private 仅选中: boolean = true;
  @State private 本地错误: string = '';

  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景: string = '#2F5FD0';
  @StorageProp(颜色键.主色按钮按下) private 主色按钮按下: string = '#1E4FB8';
  @State private 已按下执行: boolean = false;

  aboutToAppear(): void {
    // 无选中笔记时强制"全部笔记"范围
    if (!this.有选中笔记) {
      this.仅选中 = false;
    }
  }

  /** 提交：校验查找非空后调 onExecute；失败时草稿保留，由父级 errorMessage 提示。 */
  private async 提交(): Promise<void> {
    if (this.busy) {
      return;
    }
    if (this.查找文本 === '') {
      this.本地错误 = this.取本地化文案($r('app.string.browser_find_empty_error'));
      return;
    }
    this.本地错误 = '';
    try {
      const 成功 = await this.onExecute(
        this.查找文本,
        this.替换文本,
        this.字段名.trim(),
        this.是否正则,
        this.是否区分大小写,
        this.仅选中 && this.有选中笔记
      );
      if (成功) {
        this.onCancel();
      }
    } catch (_错误) {
      // 父级通过 errorMessage 提供本地化错误文案；草稿保留
    }
  }

  /** 读取本地化文案，context 不可用时回退空串。 */
  private 取本地化文案(资源: Resource): string {
    try {
      return getContext(this).resourceManager.getStringSync(资源.id);
    } catch (_错误) {
      return '';
    }
  }

  /** 正则帮助回调触发：直接调 onRegexHelp，由父组件统一弹浮层 */
  private 正则帮助回调(): void {
    this.onRegexHelp();
  }

  build() {
    Stack() {
      // 遮罩层：点击关闭
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor(this.isDark ? 'rgba(0,0,0,0.40)' : 'rgba(0,0,0,0.15)')
        // 磨砂玻璃质感：模糊下层内容避免叠字，材质着色跟随应用内主题
        .backgroundBlurStyle(BlurStyle.Thin, {
          colorMode: this.isDark ? ThemeColorMode.DARK : ThemeColorMode.LIGHT,
          adaptiveColor: AdaptiveColor.DEFAULT
        })
        // 遮罩扩展进安全区，否则状态栏/导航条区域露出下层背景
        .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
        .onClick((): void => {
          if (!this.busy) {
            this.onCancel();
          }
        })
        // 过渡仅动 opacity 合成属性，不触发布局
        .transition(TransitionEffect.OPACITY.animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }))

      // 主面板
      Column({ space: 应用尺寸.间距_14 }) {
        // 标题行：标题 + Blank + ⓘ 帮助按钮（点击上抛 onHelp，由父组件统一弹 字段帮助面板）
        DialogHeader({
          title: $r('app.string.browser_find_title'),
          actionLabel: this.busy
            ? $r('app.string.browser_find_running')
            : $r('app.string.browser_find_execute'),
          actionEnabled: !this.busy,
          closeLabel: $r('app.string.browser_find_cancel'),
          closeEnabled: !this.busy,
          onClose: (): void => {
            this.onCancel();
          },
          onAction: (): void => {
            this.提交();
          }
        })
          Text($r('app.string.field_help_button'))
            .fontSize(应用尺寸.字号_面板标题)
            .fontColor($r('app.color.text_secondary'))
            .padding({ left: 应用尺寸.间距_8, right: 应用尺寸.间距_4, top: 应用尺寸.间距_4, bottom: 应用尺寸.间距_4 })
            .onClick((): void => {
              this.onHelp();
            })

        // 查找内容
        Column({ space: 应用尺寸.间距_5 }) {
          Text($r('app.string.browser_find_find'))
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.text_secondary'))
            .width('100%')
          TextInput({ placeholder: $r('app.string.browser_find_find_placeholder'), text: this.查找文本 })
            .width('100%')
            .height(应用尺寸.按钮高度)
            .fontSize(应用尺寸.字号_正文)
            .fontColor($r('app.color.text_primary'))
            .placeholderColor($r('app.color.text_tertiary'))
            .backgroundColor($r('app.color.surface_card'))
            .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
            .borderRadius(应用尺寸.圆角_面板)
            .padding({ left: 应用尺寸.间距_10, right: 应用尺寸.间距_10 })
            .enabled(!this.busy)
            .onChange((value: string): void => {
              this.查找文本 = value;
            })
        }
        .width('100%')

        // 替换为
        Column({ space: 应用尺寸.间距_5 }) {
          Text($r('app.string.browser_find_replace_with'))
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.text_secondary'))
            .width('100%')
          TextInput({ placeholder: $r('app.string.browser_find_replace_placeholder'), text: this.替换文本 })
            .width('100%')
            .height(应用尺寸.按钮高度)
            .fontSize(应用尺寸.字号_正文)
            .fontColor($r('app.color.text_primary'))
            .placeholderColor($r('app.color.text_tertiary'))
            .backgroundColor($r('app.color.surface_card'))
            .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
            .borderRadius(应用尺寸.圆角_面板)
            .padding({ left: 应用尺寸.间距_10, right: 应用尺寸.间距_10 })
            .enabled(!this.busy)
            .onChange((value: string): void => {
              this.替换文本 = value;
            })
        }
        .width('100%')

        // 字段名（空=所有字段）
        Column({ space: 应用尺寸.间距_5 }) {
          Text($r('app.string.browser_find_field'))
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.text_secondary'))
            .width('100%')
          TextInput({ placeholder: $r('app.string.browser_find_field_placeholder'), text: this.字段名 })
            .width('100%')
            .height(应用尺寸.按钮高度)
            .fontSize(应用尺寸.字号_正文)
            .fontColor($r('app.color.text_primary'))
            .placeholderColor($r('app.color.text_tertiary'))
            .backgroundColor($r('app.color.surface_card'))
            .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
            .borderRadius(应用尺寸.圆角_面板)
            .padding({ left: 应用尺寸.间距_10, right: 应用尺寸.间距_10 })
            .enabled(!this.busy)
            .onChange((value: string): void => {
              this.字段名 = value;
            })
        }
        .width('100%')

        // 选项：正则 / 区分大小写
        Row({ space: 应用尺寸.间距_16 }) {
          Row({ space: 应用尺寸.间距_5 }) {
            Checkbox()
              .select(this.是否正则)
              .selectedColor(this.主色按钮背景)
              .enabled(!this.busy)
              .onChange((值: boolean): void => {
                this.是否正则 = 值;
              })
            Text($r('app.string.browser_find_regex'))
              .fontSize(应用尺寸.字号_正文)
              .fontColor($r('app.color.text_primary'))
            // 正则表达式 ⓘ：点击上抛 onHelp，由父组件弹 字段帮助面板 显示正则语法说明
            Text($r('app.string.field_help_button'))
              .fontSize(应用尺寸.字号_正文)
              .fontColor($r('app.color.text_secondary'))
              .padding({ left: 应用尺寸.间距_4, right: 0, top: 应用尺寸.间距_4, bottom: 应用尺寸.间距_4 })
              .onClick((): void => {
                this.正则帮助回调();
              })
          }

          Row({ space: 应用尺寸.间距_5 }) {
            Checkbox()
              .select(this.是否区分大小写)
              .selectedColor(this.主色按钮背景)
              .enabled(!this.busy)
              .onChange((值: boolean): void => {
                this.是否区分大小写 = 值;
              })
            Text($r('app.string.browser_find_match_case'))
              .fontSize(应用尺寸.字号_正文)
              .fontColor($r('app.color.text_primary'))
          }
        }
        .width('100%')

        // 应用范围（横向排列，与正则/区分大小写一致）
        Row({ space: 应用尺寸.间距_16 }) {
          Row({ space: 应用尺寸.间距_5 }) {
            Radio({ value: 'selected', group: 'findReplaceScope' })
              .checked(this.仅选中)
              .radioStyle({ checkedBackgroundColor: this.主色按钮背景 })
              .enabled(!this.busy && this.有选中笔记)
              .onChange((值: boolean): void => {
                if (值) {
                  this.仅选中 = true;
                }
              })
            Text($r('app.string.browser_find_scope_selected'))
              .fontSize(应用尺寸.字号_正文)
              .fontColor(this.有选中笔记
                ? $r('app.color.text_primary')
                : $r('app.color.text_tertiary'))
          }

          Row({ space: 应用尺寸.间距_5 }) {
            Radio({ value: 'all', group: 'findReplaceScope' })
              .checked(!this.仅选中)
              .radioStyle({ checkedBackgroundColor: this.主色按钮背景 })
              .enabled(!this.busy)
              .onChange((值: boolean): void => {
                if (值) {
                  this.仅选中 = false;
                }
              })
            Text($r('app.string.browser_find_scope_all'))
              .fontSize(应用尺寸.字号_正文)
              .fontColor($r('app.color.text_primary'))
          }
        }
        .width('100%')

        // 错误信息固定底部
        if (this.errorMessage !== '' || this.本地错误 !== '') {
          Text(this.errorMessage !== '' ? this.errorMessage : this.本地错误)
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.error_text'))
            .width('100%')
            .maxLines(3)
        }

      }
      .width('88%')
      .constraintSize({ maxWidth: 480, maxHeight: '88%' })
      .padding(应用尺寸.卡片内边距)
      .backgroundColor($r('app.color.surface_card'))
      .borderRadius(应用尺寸.圆角_卡片)
      // 居中浮卡：缩放+淡入过渡（入：opacity(0)+scale(0.96,0.96)，出：opacity(0)）
      .transition(TransitionEffect.asymmetric(
        TransitionEffect.opacity(0)
          .combine(TransitionEffect.scale({ x: 0.96, y: 0.96 }))
          .animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() }),
        TransitionEffect.opacity(0)
          .animation({ curve: 取全屏转场曲线(), duration: 取全屏转场时长() })
      ))
      .onClick((): void => {})
    }
    .width('100%')
    .height('100%')
  }
}
