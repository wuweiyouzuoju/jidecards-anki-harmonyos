// SPDX-License-Identifier: AGPL-3.0-or-later
import { SelectStyle } from '../utils/SelectStyle';
import { ThemeTextSpans } from './common/ThemeText';
import { THEME_TEXT_COLORS_KEY } from '../model/ThemeCatalog';

import { DialogHeader } from './common/DialogHeader';
// ========================================================
// @块ID UI-ADD-NOTE-001
// @名称 添加笔记面板
//
// @作用
// 纯展示层添加笔记弹层：父级拥有全部后端调用，仅在 Anki 接受笔记
// 后返回 note id。本面板负责字段输入、牌组/笔记类型选择、标签编辑
// 与草稿管理（保存失败时草稿保留）。
//
// @输入
// isDark: 是否深色主题
// busy: 父级是否正在落盘
// errorMessage: 父级下发的错误文案
// selectedDeckId: 当前选中牌组 ID
// deckOptions: 牌组候选列表
// selectedNotetypeId: 当前选中笔记类型 ID
// notetypeOptions: 笔记类型候选列表
// fieldNames: 笔记类型字段名列表（@Watch 触发重建草稿）
//
// @输出
// onCancel: 取消回调
// onSelectDeck: 切换牌组回调
// onSelectNotetype: 切换笔记类型回调
// onSave: 保存回调，返回 noteId
// onSaved: 保存成功回调
//
// @业务规则
// 测试断言保留：fieldNames / fieldValues / tags / onSave / onSaved
// 及 onSave 签名中的参数名 fields / tags / notetypeId 不改名。
//
// @副作用
// 仅通过外部回调引发后端写入；本组件不直接落盘。
// ========================================================

import { 应用尺寸 } from '../utils/应用尺寸';
import { 字段帮助面板 } from './字段帮助面板';
import { 颜色键 } from '../model/颜色主题';

export interface 添加笔记牌组选项 {
  id: number;
  name: string;
}

export interface 添加笔记笔记类型选项 {
  id: number;
  name: string;
}

interface 添加笔记下拉选项 {
  value: string;
}

@Component
export struct 添加笔记面板 {
  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  @Prop isDark: boolean = false;
  @Prop busy: boolean = false;
  @Prop errorMessage: string = '';
  @Prop selectedDeckId: number = 0;
  @Prop deckOptions: 添加笔记牌组选项[] = [];
  @Prop selectedNotetypeId: number = 0;
  @Prop notetypeOptions: 添加笔记笔记类型选项[] = [];
  @Watch('onFieldNamesChanged')
  @Prop fieldNames: string[] = [];
  onCancel: () => void = (): void => {
  };
  onSelectDeck: (deckId: number) => void = (_牌组ID: number): void => {
  };
  onSelectNotetype: (notetypeId: number) => void = (_笔记类型ID: number): void => {
  };
  onSave: (fields: string[], tags: string[], notetypeId: number) => Promise<number> =
    async (_fields: string[], _tags: string[], _notetypeId: number): Promise<number> => 0;
  onSaved: (noteId: number) => void = (_noteId: number): void => {
  };

  @State private fieldValues: string[] = [];
  @State private tags: string = '';
  @State private 高级已展开: boolean = false;
  @State private 本地错误: string = '';
  @State private 显示帮助: boolean = false;
  @State private 帮助标题: Resource = $r('app.string.add_note_deck');
  @State private 帮助正文: Resource = $r('app.string.add_note_deck_help');

  @StorageProp(颜色键.动作主色) private 动作主色: string = '#2F5FD0';
  @StorageProp(颜色键.动作主色按下) private 动作主色按下: string = '#1E4FB8';
  // 2.1.4.1 对比度：按钮背景专用档（配 #FFFFFF 文字 ≥ 4.5:1）
  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景: string = '#2F5FD0';
  @StorageProp(颜色键.主色按钮按下) private 主色按钮按下: string = '#1E4FB8';

  // ========================================================
  // @块ID UI-ADD-NOTE-002
  // @名称 打开帮助
  //
  // @作用
  // 设置帮助标题/正文并打开帮助浮层。
  //
  // @输入
  // title: 帮助标题资源
  // body: 帮助正文资源
  //
  // @输出
  // 写 帮助标题 / 帮助正文 / 显示帮助
  //
  // @副作用
  // 无（仅触发自身状态变化）。
  // ========================================================
  private 打开帮助(title: Resource, body: Resource): void {
    this.帮助标题 = title;
    this.帮助正文 = body;
    this.显示帮助 = true;
  }

  aboutToAppear(): void {
    this.确保字段值数组();
  }

  // ========================================================
  // @块ID UI-ADD-NOTE-003
  // @名称 字段名变更回调
  //
  // @作用
  // @Watch 回调：fieldNames 变化时重置 fieldValues 为等长空串数组。
  //
  // @输入
  // 无
  //
  // @输出
  // 写 fieldValues
  //
  // @副作用
  // 无。
  // ========================================================
  private onFieldNamesChanged(): void {
    this.fieldValues = this.fieldNames.map((_name: string): string => '');
  }

  // ========================================================
  // @块ID UI-ADD-NOTE-004
  // @名称 确保字段值数组
  //
  // @作用
  // 当 fieldValues 长度与 fieldNames 不一致时重建草稿数组。
  //
  // @输入
  // 无
  //
  // @输出
  // 可能写 fieldValues
  //
  // @副作用
  // 无。
  // ========================================================
  private 确保字段值数组(): void {
    if (this.fieldValues.length !== this.fieldNames.length) {
      this.fieldValues = this.fieldNames.map((_name: string): string => '');
    }
  }

  // ========================================================
  // @块ID UI-ADD-NOTE-005
  // @名称 当前选中牌组索引
  //
  // @作用
  // 在 deckOptions 中查找 selectedDeckId 对应索引；未命中返回 0。
  //
  // @输入
  // 无
  //
  // @输出
  // 索引 number
  //
  // @副作用
  // 无。
  // ========================================================
  private 选中牌组索引(): number {
    const 索引 = this.deckOptions.findIndex((牌组: 添加笔记牌组选项): boolean => 牌组.id === this.selectedDeckId);
    return 索引 < 0 ? 0 : 索引;
  }

  // ========================================================
  // @块ID UI-ADD-NOTE-006
  // @名称 当前选中牌组名
  //
  // @作用
  // 官方 Select 文档：selected 只控制菜单初始高亮，按钮文本需由 value
  // 提供，否则框内空白。本方法返回当前选中牌组的显示名。
  //
  // @输入
  // 无
  //
  // @输出
  // 牌组名或空串
  //
  // @副作用
  // 无。
  // ========================================================
  private 选中牌组名(): string {
    for (const 牌组 of this.deckOptions) {
      if (牌组.id === this.selectedDeckId) {
        return 牌组.name;
      }
    }
    return '';
  }

  private 牌组下拉选项(): 添加笔记下拉选项[] {
    const 选项: 添加笔记下拉选项[] = [];
    for (const 牌组 of this.deckOptions) {
      选项.push({ value: 牌组.name });
    }
    return 选项;
  }

  private 选中笔记类型索引(): number {
    const 索引 = this.notetypeOptions.findIndex(
      (笔记类型: 添加笔记笔记类型选项): boolean => 笔记类型.id === this.selectedNotetypeId);
    return 索引 < 0 ? 0 : 索引;
  }

  private 选中笔记类型名(): string {
    for (const 笔记类型 of this.notetypeOptions) {
      if (笔记类型.id === this.selectedNotetypeId) {
        return 笔记类型.name;
      }
    }
    return '';
  }

  private 笔记类型下拉选项(): 添加笔记下拉选项[] {
    const 选项: 添加笔记下拉选项[] = [];
    for (const 笔记类型 of this.notetypeOptions) {
      选项.push({ value: 笔记类型.name });
    }
    return 选项;
  }

  private 更新字段(索引: number, 值: string): void {
    const 新值 = this.fieldValues.slice();
    新值[索引] = 值;
    this.fieldValues = 新值;
  }

  // ========================================================
  // @块ID UI-ADD-NOTE-007
  // @名称 解析标签
  //
  // @作用
  // 把 tags 输入串按空白拆分、去空、去重，返回标签数组。
  //
  // @输入
  // 无（读 this.tags）
  //
  // @输出
  // 标签 string[]
  //
  // @副作用
  // 无。
  // ========================================================
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

  // ========================================================
  // @块ID UI-ADD-NOTE-008
  // @名称 提交
  //
  // @作用
  // 调用 onSave 提交字段/标签/笔记类型；成功后清空草稿并回调 onSaved。
  // 失败时草稿保留，由父级通过 errorMessage 提示。
  //
  // @输入
  // 无
  //
  // @输出
  // 触发 onSave / onSaved
  //
  // @副作用
  // 通过外部回调引发后端写入。
  // ========================================================
  private async 提交(): Promise<void> {
    if (this.busy || this.selectedDeckId === 0 || this.selectedNotetypeId === 0) {
      return;
    }
    this.本地错误 = '';
    try {
      const noteId = await this.onSave(this.fieldValues.slice(), this.解析标签(), this.selectedNotetypeId);
      this.fieldValues = this.fieldNames.map((_name: string): string => '');
      this.tags = '';
      this.onSaved(noteId);
    } catch (_错误) {
      // The parent provides a localized message. Draft state intentionally remains unchanged.
    }
  }

  // ========================================================
  // @块ID UI-ADD-NOTE-009
  // @名称 标签+帮助行
  //
  // @作用
  // 渲染一行带帮助按钮的字段标签：左侧标签 layoutWeight(1) 撑满，
  // 右侧帮助按钮触发 打开帮助。
  //
  // @输入
  // label: 标签资源
  // help: 帮助正文资源
  //
  // @输出
  // Row 子树
  //
  // @副作用
  // 无。
  // ========================================================
  @Builder
  private 带帮助的标签(label: Resource, help: Resource) {
    Row() {
      Text(label)
        .fontSize(应用尺寸.字号_正文_小)
        .fontColor($r('app.color.text_secondary'))
        .layoutWeight(1)
      Button() {
        Text() { ThemeTextSpans($r('app.string.field_help_button'), this.themeAccentColors, this.getUIContext()) }.fontColor(this.动作主色)
      }
        .type(ButtonType.Normal)
        .backgroundColor(Color.Transparent)
        .fontColor(this.动作主色)
        .enabled(!this.busy)
        .onClick((): void => {
          this.打开帮助(label, help);
        })
    }
    .width('100%')
  }

  build() {
    Stack() {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor(this.isDark ? 'rgba(0,0,0,0.40)' : 'rgba(0,0,0,0.15)')
        .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
        .onClick(() => {
          if (!this.busy) {
            this.onCancel();
          }
        })

      Column({ space: 应用尺寸.间距_14 }) {
        // B12-Y2 2026-07-22：内容用 Scroll 包裹，fieldName 多或高级设置展开时可滚动，按钮固定底部
        // 避免 TextArea 越出面板边界、按钮 Row 被挤出面板外显示成"下面多出一个框"
        DialogHeader({
          title: $r('app.string.add_note_title'),
          actionLabel: this.busy ? $r('app.string.add_note_saving') : $r('app.string.add_note_save'),
          actionEnabled: !this.busy && this.fieldNames.length > 0,
          closeLabel: $r('app.string.add_note_cancel'),
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

            this.带帮助的标签($r('app.string.add_note_deck'), $r('app.string.add_note_deck_help'))
            Select(this.牌组下拉选项())
              .selected(this.选中牌组索引())
              .value(this.选中牌组名())
              .width('100%')
              .enabled(!this.busy && this.deckOptions.length > 0)
              .attributeModifier(new SelectStyle())
              .font(SelectStyle.controlFont)
              .borderRadius(SelectStyle.controlRadius)
              .onSelect((index: number): void => {
                this.onSelectDeck(this.deckOptions[index].id);
              })

            this.带帮助的标签($r('app.string.add_note_notetype'), $r('app.string.add_note_notetype_help'))
            Select(this.笔记类型下拉选项())
              .selected(this.选中笔记类型索引())
              .value(this.选中笔记类型名())
              .width('100%')
              .enabled(!this.busy && this.notetypeOptions.length > 0)
              .attributeModifier(new SelectStyle())
              .font(SelectStyle.controlFont)
              .borderRadius(SelectStyle.controlRadius)
              .onSelect((index: number): void => {
                this.onSelectNotetype(this.notetypeOptions[index].id);
              })

            ForEach(this.fieldNames, (字段名: string, index: number) => {
              Column({ space: 应用尺寸.间距_5 }) {
                Text(字段名)
                  .fontSize(应用尺寸.字号_正文_小)
                  .fontColor($r('app.color.text_secondary'))
                  .width('100%')
                TextArea({ placeholder: 字段名, text: this.fieldValues[index] })
                  .width('100%')
                  // B12-Y2 2026-07-22：height 88 → 56，配合 Scroll 让字段多时可滚动不越界
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

            Button() {
              Text() { ThemeTextSpans(this.高级已展开 ? $r('app.string.add_note_advanced_hide') : $r('app.string.add_note_advanced'), this.themeAccentColors, this.getUIContext()) }.fontSize(应用尺寸.字号_按钮).fontColor(this.动作主色)
            }
              .width('100%')
              .height(应用尺寸.按钮高度)
              .flexShrink(0)
              .fontSize(应用尺寸.字号_按钮)
              .fontColor(this.动作主色)
              .backgroundColor($r('app.color.surface_page'))
              .borderRadius(应用尺寸.圆角_面板)
              .enabled(!this.busy)
              .onClick((): void => {
                this.高级已展开 = !this.高级已展开;
              })

            if (this.高级已展开) {
              Column({ space: 应用尺寸.间距_5 }) {
                this.带帮助的标签($r('app.string.add_note_tags'), $r('app.string.add_note_tags_help'))
                TextInput({ placeholder: $r('app.string.add_note_tags_placeholder'), text: this.tags })
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
                Text($r('app.string.add_note_duplicate_rejected'))
                  .fontSize(应用尺寸.字号_正文_小)
                  .fontColor($r('app.color.text_tertiary'))
                  .width('100%')
              }
              .width('100%')
            }
          }
          .width('100%')
        }
        .width('100%')
        .layoutWeight(1)
        .scrollBar(BarState.Auto)
        .edgeEffect(EdgeEffect.Spring)
        .align(Alignment.TopStart)

        // B12-Y2 2026-07-24：错误信息移出 Scroll 固定显示，避免软键盘弹出或字段较多时
        // 验证错误被裁剪看不到（Cloze 缺 {{c1::}}、ImageOcclusion 字段为空等场景），用户误以为保存按钮无响应
        if (this.errorMessage !== '' || this.本地错误 !== '') {
          Text(this.errorMessage !== '' ? this.errorMessage : this.本地错误)
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.error_text'))
            .width('100%')
            .maxLines(3)
        }

      }
      .width('88%')
      // B12-Y2 2026-07-22：maxHeight 88% + Scroll 让内容可滚动，按钮固定底部
      .constraintSize({ maxWidth: 520, maxHeight: '88%' })
      .padding(应用尺寸.卡片内边距)
      .backgroundColor($r('app.color.surface_card'))
      .borderRadius(应用尺寸.圆角_卡片)
      .onClick(() => {
      })

      if (this.显示帮助) {
        字段帮助面板({
          title: this.帮助标题,
          body: this.帮助正文,
          onClose: (): void => {
            this.显示帮助 = false;
          }
        })
      }
    }
    .width('100%')
    .height('100%')
  }
}
