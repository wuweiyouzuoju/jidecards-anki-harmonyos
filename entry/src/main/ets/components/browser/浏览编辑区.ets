// SPDX-License-Identifier: AGPL-3.0-or-later

import { DialogHeader } from '../common/DialogHeader';
// ========================================================
// @块ID UI-BROWSER-EDIT-001
// @名称 浏览编辑区
//
// @作用
// 浏览页 T7 详情编辑区：纯展示层弹层，用于编辑既有笔记的字段与标签。
// 父级（浏览页）拥有全部后端调用，本组件仅负责字段输入与草稿管理。
// 复用 添加笔记面板.ets 的字段编辑 UI 模式，但去掉牌组/笔记类型选择
// （编辑既有笔记时笔记类型固定，字段名由父级加载笔记类型时取）。
//
// @输入
// isDark: 是否深色主题
// busy: 父级是否正在落盘
// errorMessage: 父级下发的错误文案
// fieldNames: 笔记类型字段名列表
// initialFieldValues: 笔记字段初始值（父级加载笔记后预填）
// initialTags: 标签初始值（空格分隔串）
//
// @输出
// onCancel: 取消回调
// onSave: 保存回调，返回是否成功（父级负责落盘）
//
// @Invariants
// - 本组件不直接调后端，所有写入经 onSave 回调上抛
// - fieldValues 仅在 aboutToAppear 时从 initialFieldValues 初始化；
//   父级用 if 控制组件挂载/卸载，每次打开是新实例
// - 保存成功后由父级关闭弹层（设 显示编辑区=false）
//
// @Extension Points
// - 阶段 3 批量操作栏可复用本组件的字段编辑模式
// - 阶段 4 卡片信息（T11）将复用本组件的弹层骨架
//
// @副作用
// 仅通过外部回调引发后端写入；本组件不直接落盘。
// ========================================================

import { 应用尺寸 } from '../../utils/应用尺寸';
import { 颜色键 } from '../../model/颜色主题';

@Component
export struct 浏览编辑区 {
  @Prop isDark: boolean = false;
  @Prop busy: boolean = false;
  @Prop errorMessage: string = '';
  @Prop fieldNames: string[] = [];
  @Prop initialFieldValues: string[] = [];
  @Prop initialTags: string = '';
  onCancel: () => void = (): void => {};
  onSave: (fields: string[], tags: string[]) => Promise<boolean> =
    async (_fields: string[], _tags: string[]): Promise<boolean> => false;

  @State private fieldValues: string[] = [];
  @State private tags: string = '';
  @State private 本地错误: string = '';

  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景: string = '#2F5FD0';
  @StorageProp(颜色键.主色按钮按下) private 主色按钮按下: string = '#1E4FB8';

  aboutToAppear(): void {
    // 从父级传入的初始值拷贝到内部状态（仅初始化，后续编辑不影响 initialFieldValues）
    this.fieldValues = this.initialFieldValues.slice();
    this.tags = this.initialTags;
  }

  private 更新字段(索引: number, 值: string): void {
    const 新值 = this.fieldValues.slice();
    新值[索引] = 值;
    this.fieldValues = 新值;
  }

  /** 把 tags 输入串按空白拆分、去空、去重，返回标签数组。 */
  private 解析标签(): string[] {
    const 已见: string[] = [];
    for (const 标签 of this.tags.split(/\s+/)) {
      const 修剪后 = 标签.trim();
      if (修剪后 !== '' && 已见.indexOf(修剪后) < 0) {
        已见.push(修剪后);
      }
    }
    return 已见;
  }

  /** 提交：调 onSave 上抛字段/标签；失败时草稿保留，由父级 errorMessage 提示。 */
  private async 提交(): Promise<void> {
    if (this.busy || this.fieldNames.length === 0) {
      return;
    }
    this.本地错误 = '';
    try {
      const 成功 = await this.onSave(this.fieldValues.slice(), this.解析标签());
      if (成功) {
        this.onCancel();
      }
    } catch (_错误) {
      // 父级通过 errorMessage 提供本地化错误文案；草稿保留
    }
  }

  build() {
    Stack() {
      // 遮罩层：点击关闭
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor(this.isDark ? 'rgba(0,0,0,0.40)' : 'rgba(0,0,0,0.15)')
        .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
        .onClick((): void => {
          if (!this.busy) {
            this.onCancel();
          }
        })

      // 主面板
      Column({ space: 应用尺寸.间距_14 }) {
        DialogHeader({
          title: $r('app.string.browser_detail_title'),
          actionLabel: this.busy ? $r('app.string.browser_detail_saving') : $r('app.string.browser_detail_save'),
          actionEnabled: !this.busy && this.fieldNames.length > 0,
          closeLabel: $r('app.string.browser_detail_cancel'),
          closeEnabled: !this.busy,
          onClose: (): void => {
            this.onCancel();
          },
          onAction: (): void => {
            this.提交();
          }
        })
        Scroll() {
          Column({ space: 应用尺寸.间距_14 }) {

            ForEach(this.fieldNames, (字段名: string, index: number) => {
              Column({ space: 应用尺寸.间距_5 }) {
                Text(字段名)
                  .fontSize(应用尺寸.字号_正文_小)
                  .fontColor($r('app.color.text_secondary'))
                  .width('100%')
                TextArea({ placeholder: 字段名, text: this.fieldValues[index] ?? '' })
                  .width('100%')
                  .height(56)
                  .fontSize(应用尺寸.字号_正文)
                  .fontColor($r('app.color.text_primary'))
                  .placeholderColor($r('app.color.text_tertiary'))
                  .backgroundColor($r('app.color.surface_card'))
                  .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_input') })
                  .borderRadius(应用尺寸.圆角_面板)
                  .padding(应用尺寸.间距_10)
                  .enabled(!this.busy)
                  .onChange((value: string): void => {
                    this.更新字段(index, value);
                  })
              }
              .width('100%')
            }, (字段名: string, index: number): string => `${index}-${字段名}`)

            // 标签编辑
            Column({ space: 应用尺寸.间距_5 }) {
              Text($r('app.string.browser_detail_tags'))
                .fontSize(应用尺寸.字号_正文_小)
                .fontColor($r('app.color.text_secondary'))
                .width('100%')
              TextInput({ placeholder: $r('app.string.browser_detail_tags_placeholder'), text: this.tags })
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
                  this.tags = value;
                })
            }
            .width('100%')
          }
          .width('100%')
        }
        .width('100%')
        .layoutWeight(1)
        .scrollBar(BarState.Auto)
        .edgeEffect(EdgeEffect.Spring)
        .align(Alignment.TopStart)

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
      .constraintSize({ maxWidth: 520, maxHeight: '88%' })
      .padding(应用尺寸.卡片内边距)
      .backgroundColor($r('app.color.surface_card'))
      .borderRadius(应用尺寸.圆角_卡片)
      .onClick((): void => {})
    }
    .width('100%')
    .height('100%')
  }
}
