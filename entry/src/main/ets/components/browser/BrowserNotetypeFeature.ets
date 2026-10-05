// SPDX-License-Identifier: AGPL-3.0-or-later
import { noteTypeText } from '../../utils/NoteTypeText';
import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { SelectStyle } from '../../utils/SelectStyle';
import { FormSelectRow } from '../common/FormSelectRow';
import { localizedResourceText, resourceText } from '../../utils/UiFeedback';
import type { NotetypeNameId, 变更笔记类型请求 } from '../../proto/messages/NotetypeMessages';
import { BrowserNotetypeSession, BrowserNotetypeState, initialNotetypeState } from '../../model/browser/BrowserNotetypeSession';
import { AnkiBrowserNotetype } from '../../backend/AnkiBrowserNotetype';

@Component
export struct BrowserNotetypeFeature {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop @Watch('handleBackRequest') backRequest: number = 0;

  private handleBackRequest(): void {
    if (!(this.busy || this.state.busy)) this.onClose();
  }

  firstId: number = 0;
  notes: boolean = false;
  @Prop isDark: boolean = false;
  @Prop busy: boolean = false;
  onClose: () => void = (): void => {};
  onSubmit: (input: 变更笔记类型请求) => void = (_input: 变更笔记类型请求): void => {};
  @State private state: BrowserNotetypeState = initialNotetypeState();
  private session: BrowserNotetypeSession | null = null;
  aboutToAppear(): void {
    this.session = new BrowserNotetypeSession(new AnkiBrowserNotetype(),
      (state: BrowserNotetypeState): void => { this.state = state; });
    this.session.load(this.firstId, this.notes);
  }
  aboutToDisappear(): void { this.session?.dispose(); }
  private submit(): void {
    const input = this.session?.request();
    if (input !== null && input !== undefined) this.onSubmit(input);
  }
  private selectType(index: number): void {
    if (this.busy || this.state.busy || index < 0 || index >= this.state.names.length) return;
    this.session?.select(this.state.names[index].id);
  }
  private 构建映射选项列表(旧名列表: string[], _locale: string = this.uiLanguage): SelectOption[] {
    const 选项: SelectOption[] = [];
    选项.push({
      value: resourceText(this.getUIContext(), $r('app.string.browser_action_change_notetype_no_map'))
    });
    for (let i = 0; i < 旧名列表.length; i++) {
      选项.push({ value: 旧名列表[i] });
    }
    return 选项;
  }
  @Builder
  private dialogHeader() {
    DialogHeader({
      title: $r('app.string.browser_action_change_notetype'),
      closeLabel: $r('app.string.browser_detail_cancel'),
      closeEnabled: !this.busy && !this.state.busy,
      onClose: (): void => { this.onClose(); },
      actionLabel: $r('app.string.browser_detail_confirm'),
      actionEnabled: !this.busy && !this.state.busy && this.state.info !== null,
      onAction: (): void => { this.submit(); }
    })
  }

  @Builder
  private dialogContent() {
    if (this.state.error !== '') {
      Text(this.state.error).fontColor($r('app.color.error_text'))
    }
    if (this.state.busy) {
      Text($r('app.string.browser_action_change_notetype_loading'))
        .fontSize(应用尺寸.字号_正文)
        .fontColor($r('app.color.text_secondary'))
        .width('100%')
    } else {
      // 选择新笔记类型
      FormSelectRow({ label: $r('app.string.browser_action_change_notetype_new'),
        options: this.state.names.map((项: NotetypeNameId): SelectOption => {
          return { value: noteTypeText(this.getUIContext(), 项.name) };
        }), selectedIndex: this.state.selectedId === 0 ? -1 : this.state.names.findIndex(
          (项: NotetypeNameId): boolean => 项.id === this.state.selectedId),
        value: this.state.selectedId === 0 ? '' : noteTypeText(this.getUIContext(),
          this.state.names.find((项: NotetypeNameId): boolean => 项.id === this.state.selectedId)?.name ?? ''),
        isInteractive: !this.busy && !this.state.busy,
        onSelect: (index: number): void => { this.selectType(index); } })

      // 字段/模板映射表（仅在加载完变更信息后显示）
      if (this.state.info !== null) {
        Text($r('app.string.browser_action_change_notetype_field_map'))
          .fontSize(应用尺寸.字号_正文)
          .fontColor($r('app.color.text_primary'))
          .fontWeight(FontWeight.Medium)
          .width('100%')
        ForEach(this.state.info.newFieldNames, (字段名: string, 索引: number) => {
          Row({ space: 应用尺寸.间距_8 }) {
            Text(字段名)
              .fontSize(应用尺寸.字号_正文_小)
              .fontColor($r('app.color.text_primary'))
              .layoutWeight(1)
            Select(this.构建映射选项列表(this.state.info!.oldFieldNames))
              .selected(this.state.fields[索引] === -1 ? 0 : this.state.fields[索引] + 1)
              .value(this.state.fields[索引] === -1 ?
                localizedResourceText(this.getUIContext(), this.uiLanguage, $r('app.string.browser_action_change_notetype_no_map')) :
                this.state.info!.oldFieldNames[this.state.fields[索引]])
              .width('50%')
              .attributeModifier(new SelectStyle())
              .height(SelectStyle.controlHeight)
              .padding(SelectStyle.controlPadding)
              .space(SelectStyle.controlSpace)
              .font(SelectStyle.controlFont)
              .optionFont(SelectStyle.optionFont)
              .selectedOptionFont(SelectStyle.selectedOptionFont)
              .textModifier(SelectStyle.labelText())
              .borderRadius(SelectStyle.controlRadius).border(SelectStyle.controlBorder)
              .enabled(!this.busy && !this.state.busy)
              .onSelect((选索引: number): void => {
                if (this.busy || this.state.busy) return;
                // 选索引 0=不映射(-1)，1..N=旧字段 ord
                const 新值: number = 选索引 === 0 ? -1 : 选索引 - 1;
                this.session?.setField(索引, 新值);
              })
          }
          .width('100%')
        }, (字段名: string, 索引: number): string => `${字段名}-${索引}`)

        // 模板映射（仅当新笔记类型有模板时显示）
        if (this.state.info!.newTemplateNames.length > 0) {
          Text($r('app.string.browser_action_change_notetype_template_map'))
            .fontSize(应用尺寸.字号_正文)
            .fontColor($r('app.color.text_primary'))
            .fontWeight(FontWeight.Medium)
            .width('100%')
          ForEach(this.state.info!.newTemplateNames, (模板名: string, 索引: number) => {
            Row({ space: 应用尺寸.间距_8 }) {
              Text(模板名)
                .fontSize(应用尺寸.字号_正文_小)
                .fontColor($r('app.color.text_primary'))
                .layoutWeight(1)
              Select(this.构建映射选项列表(this.state.info!.oldTemplateNames))
                .selected(this.state.templates[索引] === -1 ? 0 : this.state.templates[索引] + 1)
                .value(this.state.templates[索引] === -1 ?
                  localizedResourceText(this.getUIContext(), this.uiLanguage, $r('app.string.browser_action_change_notetype_no_map')) :
                  this.state.info!.oldTemplateNames[this.state.templates[索引]])
                .width('50%')
                .attributeModifier(new SelectStyle())
                .height(SelectStyle.controlHeight)
                .padding(SelectStyle.controlPadding)
                .space(SelectStyle.controlSpace)
                .font(SelectStyle.controlFont)
                .optionFont(SelectStyle.optionFont)
                .selectedOptionFont(SelectStyle.selectedOptionFont)
                .textModifier(SelectStyle.labelText())
                .borderRadius(SelectStyle.controlRadius).border(SelectStyle.controlBorder)
                .enabled(!this.busy && !this.state.busy)
                .onSelect((选索引: number): void => {
                  if (this.busy || this.state.busy) return;
                  const 新值: number = 选索引 === 0 ? -1 : 选索引 - 1;
                  this.session?.setTemplate(索引, 新值);
                })
            }
            .width('100%')
          }, (模板名: string, 索引: number): string => `${模板名}-${索引}`)
        }
      }
    }
  }

  build() {
    DialogFrame({ maximumWidth: 应用尺寸.dialogWideMaxWidth, canDismiss: !this.busy && !this.state.busy,
      header: () => { this.dialogHeader(); }, content: () => { this.dialogContent(); },
      onDismiss: (): void => { this.onClose(); } })
  }
}
