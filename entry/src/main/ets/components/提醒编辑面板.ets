import { LengthMetrics } from '@kit.ArkUI';
import { 按下态按钮 } from './common/按下态按钮';
import { DialogFrame } from './common/DialogFrame';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { SurfaceBorder } from '../utils/SurfaceBorder';
import { localizedNamedResourceText, resourceText, namedResourceText } from '../utils/UiFeedback';
import { SelectStyle } from '../utils/SelectStyle';

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
import { appInterface } from '../backend/AppInterfaceService';
import { reminderEditorControls, reminderEditorTitle, AppInterfaceMenuItem, AppInterfaceControl } from '../model/AppInterface';
import { interfaceControlText } from '../utils/AppInterfaceText';

@Component
export struct 提醒编辑面板 {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop isDark: boolean = false;
  @Prop @Watch('publishInterface') busy: boolean = false;
  @Prop @Watch('publishInterface') errorMessage: string = '';
  @Prop @Watch('publishInterface') 是否新建: boolean = true;
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
  private interfaceMounted: boolean = false;
  @State @Watch('publishInterface') private 小时: number = 6;
  @State @Watch('publishInterface') private 分钟: number = 0;
  @State @Watch('publishInterface') private 标题: string = '';
  @State @Watch('publishInterface') private 内容: string = '';

  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景: string = '#2F5FD0';

  aboutToAppear(): void {
    this.小时 = this.初始小时;
    this.分钟 = this.初始分钟;
    this.标题 = this.初始标题;
    this.内容 = this.初始内容;
    this.interfaceMounted = true;
    this.publishInterface();
  }

  aboutToDisappear(): void { this.interfaceMounted = false; appInterface.leave('reminder_editor'); }

  private interfaceControls(): AppInterfaceMenuItem[] { return reminderEditorControls(this.是否新建, this.busy); }
  private interfaceLabel(id: string): string {
    return interfaceControlText(this.getUIContext(), this.interfaceControls(), id, this.uiLanguage);
  }
  private interfaceEnabled(id: string): boolean {
    return this.interfaceControls().find((item): boolean => item.id === id)?.enabled ?? false;
  }
  private publishInterface(_locale: string = this.uiLanguage): void {
    if (!this.interfaceMounted) return;
    const controls: AppInterfaceControl[] = this.interfaceControls().map((item): AppInterfaceControl =>
      ({ id: item.id, title: namedResourceText(this.getUIContext(), item.titleKey), titleKey: item.titleKey,
        enabled: item.enabled, selected: item.selected }));
    const ids: string[] = [];
    const labels: string[] = [];
    const hours: SelectOption[] = this.小时选项();
    const minutes: SelectOption[] = this.分钟选项();
    for (const group of ['hour', 'minute']) {
      const options: SelectOption[] = group === 'hour' ? hours : minutes;
      for (let index: number = 0; index < options.length; index++) {
        const id: string = group + '-' + index;
        const value: ResourceStr = options[index].value;
        const title: string = typeof value === 'string' ? value : resourceText(this.getUIContext(), value);
        ids.push(id); labels.push(title);
        controls.push({ id: id, title: title, enabled: !this.busy,
          selected: index === (group === 'hour' ? this.小时 : this.分钟) });
      }
    }
    appInterface.observe({ surface: 'reminder_editor', titleKey: reminderEditorTitle(this.是否新建),
      sectionId: this.是否新建 ? 'create' : 'edit', selectedId: '', optionIds: ids, optionLabels: labels,
      busy: this.busy, items: controls, controlsComplete: true,
      values: [{ id: 'hour', value: String(this.小时) }, { id: 'minute', value: String(this.分钟) },
        { id: 'title_length', value: String(this.标题.length) }, { id: 'content_length', value: String(this.内容.length) },
        { id: 'has_error', value: String(this.errorMessage.length > 0) }] });
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

  private 取本地化文本(resource: Resource, _locale: string = this.uiLanguage): string {
    return resourceText(this.getUIContext(), resource);
  }

  /** 点标签把占位符追加到内容末尾，免手打花括号 */
  private 插入占位符(token资源: Resource): void {
    if (this.busy || !this.interfaceMounted) return;
    this.内容 = this.内容 + this.取本地化文本(token资源);
  }

  @Builder
  private panelHeader() {
    DialogHeader({
      title: localizedNamedResourceText(this.getUIContext(), this.uiLanguage, reminderEditorTitle(this.是否新建)),
      actionLabel: this.interfaceLabel('confirm'),
      actionEnabled: this.interfaceEnabled('confirm'),
      closeLabel: this.interfaceLabel('cancel'),
      closeEnabled: this.interfaceEnabled('cancel'),
      onClose: () => {
        this.onCancel();
      },
      onAction: () => {
        this.onConfirm(this.小时, this.分钟, this.标题, this.内容);
      }
    })
  }

  @Builder
  private panelContent() {
    Column({ space: 应用尺寸.间距_16 }) {
      Column({ space: 应用尺寸.间距_8 }) {
        Text(this.interfaceLabel('time')).fontSize(应用尺寸.字号_正文)
          .fontColor($r('app.color.text_primary')).width('100%')
        Row() {
        Select(this.小时选项())
          .selected(this.小时)
          .value(this.小时 < 10 ? `0${this.小时}` : `${this.小时}`)
          .layoutWeight(1)
          .enabled(!this.busy)
          .attributeModifier(new SelectStyle())
          .height(SelectStyle.controlHeight)
          .padding(SelectStyle.controlPadding)
          .space(SelectStyle.controlSpace)
          .font(SelectStyle.controlFont)
          .optionFont(SelectStyle.optionFont)
          .selectedOptionFont(SelectStyle.selectedOptionFont)
          .textModifier(SelectStyle.labelText())
          .border(SelectStyle.controlBorder).borderRadius(SelectStyle.controlRadius)
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
          .layoutWeight(1)
          .enabled(!this.busy)
          .attributeModifier(new SelectStyle())
          .height(SelectStyle.controlHeight)
          .padding(SelectStyle.controlPadding)
          .space(SelectStyle.controlSpace)
          .font(SelectStyle.controlFont)
          .optionFont(SelectStyle.optionFont)
          .selectedOptionFont(SelectStyle.selectedOptionFont)
          .textModifier(SelectStyle.labelText())
          .border(SelectStyle.controlBorder).borderRadius(SelectStyle.controlRadius)
          .onSelect((index: number): void => {
            this.分钟 = index;
          })
        }.width('100%').alignItems(VerticalAlign.Center)
      }.width('100%')

      Text(this.interfaceLabel('title'))
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
        .border(SurfaceBorder.options())
        .borderRadius(应用尺寸.圆角_面板)
        .padding({ left: 应用尺寸.卡片内边距, right: 应用尺寸.卡片内边距 })
          .enabled(this.interfaceEnabled('title'))
        .onChange((value: string) => {
          this.标题 = value;
        })

      Text(this.interfaceLabel('content'))
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
        .border(SurfaceBorder.options())
        .borderRadius(应用尺寸.圆角_面板)
        .padding(应用尺寸.间距_8)
        .enabled(this.interfaceEnabled('content'))
        .onChange((value: string) => {
          this.内容 = value;
        })

      // 快捷插入与其他输入遵循同一 busy 条件。
      Flex({ wrap: FlexWrap.Wrap, space: { main: LengthMetrics.vp(8), cross: LengthMetrics.vp(8) } }) {
        按下态按钮({ 文案: this.interfaceLabel('insert_new'), themeText: true, 字色: this.主色按钮背景,
          是否启用: this.interfaceEnabled('insert_new'), preserveInputFocus: true,
          点击回调: (): void => { this.插入占位符($r('app.string.reminder_edit_token_new')); } })
        按下态按钮({ 文案: this.interfaceLabel('insert_review'), themeText: true, 字色: this.主色按钮背景,
          是否启用: this.interfaceEnabled('insert_review'), preserveInputFocus: true,
          点击回调: (): void => { this.插入占位符($r('app.string.reminder_edit_token_review')); } })
      }.width('100%')

      Text($r('app.string.reminder_edit_placeholder_hint'))
        .fontSize(11)
        .fontColor($r('app.color.text_tertiary'))
        .width('100%')
      if (this.errorMessage !== '') {
        Text(this.errorMessage)
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.error_text'))
          .width('100%')
          .maxLines(3)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }

      if (!this.是否新建) {
        按下态按钮({ 文案: this.interfaceLabel('delete'), 图标: $r('app.media.ic_study_delete'),
          字色: $r('app.color.error_text'), 是否启用: this.interfaceEnabled('delete'),
          点击回调: (): void => { if (this.interfaceEnabled('delete')) this.onDelete(); } })
          .alignSelf(ItemAlign.End)
      }
    }.width('100%')
  }

  build() {
    DialogFrame({ header: () => { this.panelHeader(); }, content: () => { this.panelContent(); },
      canDismiss: !this.busy, onDismiss: (): void => { this.onCancel(); } })
  }
}
