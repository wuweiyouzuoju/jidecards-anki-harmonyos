import { DialogFrame } from '../common/DialogFrame';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { FormInputStyle } from '../../utils/FormInputStyle';
import { HelpLabel } from '../common/HelpLabel';
import { resourceText } from '../../utils/UiFeedback';
import { SelectStyle } from '../../utils/SelectStyle';
import { appInterface } from '../../backend/AppInterfaceService';
import { visibleInterfaceItems, AppInterfaceControl } from '../../model/AppInterface';
import { namedResourceText } from '../../utils/UiFeedback';
import { PressFeedback } from '../../utils/PressFeedback';

import { DialogHeader } from '../common/DialogHeader';
// ========================================================
// @名称 查找替换对话框
//
// @作用
// 浏览页 T9 查找替换弹层：纯展示层组件，用于在笔记字段或标签中批量替换文本。
// 父级（浏览页）拥有全部后端调用，本组件仅负责输入收集与校验提示。
// DialogFrame 统一标题、可滚动表单和键盘安全区；查找替换仍由原会话拥有。
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
// 字段目录来自真实作用范围；标签目标单独标识，不能把名为 Tags 的普通字段当作标签。
//
// @副作用
// 仅通过外部回调引发后端写入；本组件不直接落盘。
// ========================================================

import { 应用尺寸 } from '../../utils/应用尺寸';
import { 颜色键 } from '../../model/颜色主题';

@Component
export struct 查找替换对话框 {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop isDark: boolean = false;
  @Prop @Watch('publishInterface') busy: boolean = false;
  @Prop errorMessage: string = '';
  @Prop 有选中笔记: boolean = false;
  onLoadFields: (selectedOnly: boolean) => Promise<string[]> = async (_selectedOnly: boolean): Promise<string[]> => [];
  onCancel: () => void = (): void => {};
  onExecute: (
    查找: string,
    替换: string,
    字段名: string,
    正则: boolean,
    区分大小写: boolean,
    仅选中: boolean,
    tags: boolean
  ) => Promise<boolean> =
    async (
      _查找: string,
      _替换: string,
      _字段名: string,
      _正则: boolean,
      _区分大小写: boolean,
      _仅选中: boolean,
      _tags: boolean
    ): Promise<boolean> => false;
  // ⓘ 帮助回调：上抛给父组件（浏览页）统一渲染 字段帮助面板 浮层，与批量操作栏 ⓘ 同模式
  onHelp: () => void = (): void => {};
  // 正则表达式 ⓘ 回调：上抛给父组件显示正则语法说明（browser_find_regex_help）
  onRegexHelp: () => void = (): void => {};

  @State @Watch('publishInterface') private 查找文本: string = '';
  @State private 替换文本: string = '';
  @State @Watch('publishInterface') private 字段名: string = '';
  @State @Watch('publishInterface') private 是否正则: boolean = false;
  @State @Watch('publishInterface') private 是否区分大小写: boolean = false;
  @State @Watch('loadFields') private 仅选中: boolean = true;
  @State private 本地错误: string = '';
  @State private fieldNames: string[] = [];
  @State @Watch('publishInterface') private targetIndex: number = 0;
  @State @Watch('publishInterface') private fieldsLoading: boolean = false;
  @State @Watch('publishInterface') private fieldsError: boolean = false;
  private fieldsVersion: number = 0;
  private disposed: boolean = false;
  private interfaceMounted: boolean = false;
  aboutToDisappear(): void { this.interfaceMounted = false; this.disposed = true; this.fieldsVersion++; appInterface.leave('browser_find_replace'); }
  private publishInterface(): void {
    if (!this.interfaceMounted) return;
    appInterface.observe({ surface: 'browser_find_replace', sectionId: this.fieldsError ? 'error' : this.fieldsLoading ? 'loading' : 'form',
      selectedId: this.targetIndex === 0 ? 'all_fields' : this.targetIndex === 1 ? 'tags' : `field:${this.字段名}`,
      optionIds: ['all_fields', 'tags'].concat(this.fieldNames.map((name: string): string => `field:${name}`)), optionLabels: [], busy: this.busy || this.fieldsLoading,
      controlsComplete: true, items: visibleInterfaceItems('browser_find_replace', { simple: false, agent: false, cloudDeck: false, themeHasTextures: false })
        .map((item): AppInterfaceControl => ({ id: item.id, titleKey: item.titleKey, title: namedResourceText(this.getUIContext(), item.titleKey),
          selected: item.id === 'regex' ? this.是否正则 : item.id === 'match_case' ? this.是否区分大小写 :
            item.id === 'selected' ? this.仅选中 : item.id === 'results' && !this.仅选中,
          enabled: !this.busy && (item.id !== 'selected' || this.有选中笔记) &&
            (item.id !== 'execute' || (!this.fieldsLoading && !this.fieldsError && this.查找文本 !== '')) })),
      values: [{ id: 'scope', value: this.仅选中 && this.有选中笔记 ? 'selection' : 'search_results' }] });
  }
  private async loadFields(): Promise<void> {
    const version: number = ++this.fieldsVersion;
    this.fieldsLoading = true; this.fieldsError = false;
    try {
      const names: string[] = await this.onLoadFields(this.仅选中 && this.有选中笔记);
      if (this.disposed || version !== this.fieldsVersion) return;
      this.fieldNames = names; this.targetIndex = 0; this.字段名 = '';
    } catch (error) {
      if (!this.disposed && version === this.fieldsVersion) this.fieldsError = true;
    } finally { if (!this.disposed && version === this.fieldsVersion) this.fieldsLoading = false; }
  }
  private targetOptions(): SelectOption[] {
    const options: SelectOption[] = [{ value: resourceText(this.getUIContext(), $r('app.string.browser_find_all_fields')) },
      { value: resourceText(this.getUIContext(), $r('app.string.browser_find_tags')) }];
    return options.concat(this.fieldNames.map((name: string): SelectOption => ({ value: name })));
  }

  @StorageProp(颜色键.主色按钮背景) private 主色按钮背景: string = '#2F5FD0';
  @StorageProp(颜色键.主色按钮按下) private 主色按钮按下: string = '#1E4FB8';
  @State private 已按下执行: boolean = false;

  aboutToAppear(): void {
    this.interfaceMounted = true;
    // 无选中笔记时强制"全部笔记"范围
    if (!this.有选中笔记) {
      this.仅选中 = false;
    }
    this.loadFields();
  }

  /** 提交：校验查找非空后调 onExecute；失败时草稿保留，由父级 errorMessage 提示。 */
  private async 提交(): Promise<void> {
    if (this.busy || this.fieldsLoading || this.fieldsError) {
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
        this.仅选中 && this.有选中笔记,
        this.targetIndex === 1
      );
      if (成功) {
        this.onCancel();
      }
    } catch (_错误) {
      // 父级通过 errorMessage 提供本地化错误文案；草稿保留
    }
  }

  /** 读取本地化文案，context 不可用时回退空串。 */
  private 取本地化文案(资源: Resource, _locale: string = this.uiLanguage): string {
    try {
      return resourceText(this.getUIContext(), 资源);
    } catch (_错误) {
      return '';
    }
  }

  /** 正则帮助回调触发：直接调 onRegexHelp，由父组件统一弹浮层 */
  private 正则帮助回调(): void {
    this.onRegexHelp();
  }

  @Builder
  private panelHeader() {
    DialogHeader({
      title: $r('app.string.browser_find_title'),
      showHelp: true,
      helpEnabled: !this.busy,
      onHelp: (): void => { this.onHelp(); },
      showActionLabel: true, actionLabel: this.busy
        ? $r('app.string.browser_find_running')
        : $r('app.string.browser_find_execute'),
      actionEnabled: !this.busy && !this.fieldsLoading && !this.fieldsError,
      closeLabel: $r('app.string.browser_find_cancel'),
      closeEnabled: !this.busy,
      onClose: (): void => {
        this.onCancel();
      },
      onAction: (): void => {
        this.提交();
      }
    })
  }

  @Builder
  private panelContent() {
    Column({ space: 应用尺寸.间距_14 }) {

        // 查找内容
        Column({ space: 应用尺寸.间距_5 }) {
          Text($r('app.string.browser_find_find'))
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.text_secondary'))
            .width('100%')
          TextInput({ placeholder: $r('app.string.browser_find_find_placeholder'), text: this.查找文本 })
            .attributeModifier(new FormInputStyle())
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
            .attributeModifier(new FormInputStyle())
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
          Select(this.targetOptions()).selected(this.targetIndex).value(this.targetOptions()[this.targetIndex]?.value ?? '')
            .height(SelectStyle.controlHeight).padding(SelectStyle.controlPadding).space(SelectStyle.controlSpace)
      .font(SelectStyle.controlFont).border(SelectStyle.controlBorder).borderRadius(SelectStyle.controlRadius)
      .optionFont(SelectStyle.optionFont).selectedOptionFont(SelectStyle.selectedOptionFont)
      .textModifier(SelectStyle.labelText()).width('100%').attributeModifier(new SelectStyle())
            .enabled(!this.busy && !this.fieldsLoading && !this.fieldsError)
            .onSelect((index: number): void => {
              this.targetIndex = index; this.字段名 = index >= 2 ? this.fieldNames[index - 2] : '';
            })
          if (this.fieldsLoading) { Text($r('app.string.browser_loading')).fontColor($r('app.color.text_secondary')) }
          if (this.fieldsError) {
            Text($r('app.string.browser_field_names_error')).fontColor($r('app.color.error_text'))
            Button($r('app.string.common_retry')).attributeModifier(new PressFeedback()).stateEffect(false)
              .enabled(!this.busy).onClick((): void => { this.loadFields(); })
          }
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
            HelpLabel({ title: $r('app.string.browser_find_regex'), textSize: 应用尺寸.字号_正文,
              isHelpEnabled: !this.busy, onHelp: (): void => { this.正则帮助回调(); }
            }).layoutWeight(1)
          }.layoutWeight(1)

          Row({ space: 应用尺寸.间距_5 }) {
            Checkbox()
              .select(this.是否区分大小写)
              .selectedColor(this.主色按钮背景)
              .enabled(!this.busy)
              .onChange((值: boolean): void => {
                this.是否区分大小写 = 值;
              })
            Text($r('app.string.browser_find_match_case')).flexShrink(1)
              .fontSize(应用尺寸.字号_正文)
              .fontColor($r('app.color.text_primary'))
          }.layoutWeight(1)
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

        // 错误信息随表单滚动，键盘打开时仍可访问。
        if (this.errorMessage !== '' || this.本地错误 !== '') {
          Text(this.errorMessage !== '' ? this.errorMessage : this.本地错误)
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.error_text'))
            .width('100%')
            .maxLines(3)
        }
    }.width('100%')
  }

  build() {
    DialogFrame({ header: () => { this.panelHeader(); }, content: () => { this.panelContent(); },
      canDismiss: !this.busy, onDismiss: (): void => { this.onCancel(); } })
  }
}
