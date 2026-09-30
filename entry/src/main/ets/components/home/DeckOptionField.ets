// SPDX-License-Identifier: AGPL-3.0-or-later
import { PressFeedback } from '../../utils/PressFeedback';
import { 字段帮助对话框 } from '../字段帮助面板';
import { DeckOptionRow } from './DeckOptionRow';
import { DialogHeader } from '../common/DialogHeader';
import { 应用尺寸 } from '../../utils/应用尺寸';

export interface DeckOptionChoice {
  label: ResourceStr;
  value: string;
}

/** 单项弹窗只持有本地草稿，确认并通过调用方校验后才更新牌组选项表单。 */
@CustomDialog
export struct DeckOptionEditor {
  controller?: CustomDialogController;
  title: ResourceStr = '';
  help: ResourceStr = '';
  initialValue: string = '';
  choices: DeckOptionChoice[] = [];
  validate: (value: string) => string = (_value: string): string => '';
  onConfirm: (value: string) => void = (_value: string): void => {};
  @State private draft: string = '';
  @State private error: string = '';
  onHelp: () => void = (): void => {};

  aboutToAppear(): void { this.draft = this.initialValue; }

  private confirm(): void {
    this.error = this.validate(this.draft);
    if (this.error !== '') return;
    this.onConfirm(this.draft);
    this.controller?.close();
  }

  build() {
    Column() {
      Column({ space: 应用尺寸.间距_12 }) {
        DialogHeader({ title: this.title, actionLabel: $r('app.string.done'), showHelp: true,
          onHelp: (): void => { this.onHelp(); },
          onClose: (): void => { this.controller?.close(); }, onAction: (): void => { this.confirm(); } })
        Scroll() {
          Column({ space: 应用尺寸.间距_12 }) {
            if (this.choices.length === 0) {
              TextInput({ text: this.draft })
                .width('100%').height(应用尺寸.按钮高度).fontSize(应用尺寸.字号_正文)
                .backgroundColor($r('app.color.surface_card'))
                .border({ width: 1, color: $r('app.color.border_input') }).borderRadius(应用尺寸.圆角_面板)
                .onChange((value: string): void => { this.draft = value; this.error = ''; })
            } else {
              ForEach(this.choices, (choice: DeckOptionChoice) => {
                Row({ space: 12 }) {
                  Text(choice.label).fontSize(15).fontColor($r('app.color.text_primary')).layoutWeight(1)
                }
                .width('100%').constraintSize({ minHeight: 48 }).padding({ left: 8, right: 8 })
                .backgroundColor(this.draft === choice.value ? $r('app.color.surface_page') : Color.Transparent)
                .borderRadius(10)
                .attributeModifier(new PressFeedback())
                .onClick((): void => { this.draft = choice.value; this.error = ''; })
              }, (choice: DeckOptionChoice): string => choice.value)
            }
            if (this.error !== '') {
              Text(this.error).fontSize(14).fontColor($r('app.color.error_text')).width('100%')
            }
          }.width('100%')
        }.width('100%').constraintSize({ maxHeight: 360 }).scrollBar(BarState.Auto)
      }
      .width('88%').constraintSize({ maxWidth: 480, maxHeight: '85%' })
      .padding(应用尺寸.卡片内边距).backgroundColor($r('app.color.surface_card')).borderRadius(应用尺寸.圆角_卡片)
    }.width('100%').alignItems(HorizontalAlign.Center)
  }
}

/** 与设置页相同的入口行：名称、当前值、右箭头；整行可点击。 */
@Component
export struct DeckOptionField {
  @Prop title: ResourceStr = '';
  @Prop help: ResourceStr = '';
  @Prop @Watch('syncValue') value: string = '';
  @Prop choices: DeckOptionChoice[] = [];
  @Prop busy: boolean = false;
  @Prop error: string = '';
  validate: (value: string) => string = (_value: string): string => '';
  onChange: (value: string) => void = (_value: string): void => {};
  @State private displayValue: string = '';
  private dialog: CustomDialogController | null = null;
  private helpDialog: CustomDialogController | null = null;

  aboutToAppear(): void { this.syncValue(); }
  aboutToDisappear(): void {
    this.helpDialog?.close(); this.helpDialog = null;
    this.dialog?.close(); this.dialog = null;
  }

  private openHelp(): void {
    this.helpDialog = new CustomDialogController({
      builder: 字段帮助对话框({ 标题: this.title, 正文: this.help }),
      customStyle: true, autoCancel: true, alignment: DialogAlignment.Center,
      width: '100%', height: '100%', maskColor: Color.Transparent
    });
    this.helpDialog.open();
  }
  private syncValue(): void { this.displayValue = this.value; }
  private summary(): ResourceStr {
    const choice: DeckOptionChoice | undefined = this.choices.find((item: DeckOptionChoice): boolean =>
      item.value === this.displayValue);
    return choice === undefined ? (this.displayValue === '' ? $r('app.string.deck_option_unset') : this.displayValue) : choice.label;
  }

  private open(): void {
    if (this.busy) return;
    this.dialog = new CustomDialogController({
      builder: DeckOptionEditor({ title: this.title, help: this.help, initialValue: this.displayValue,
        onHelp: (): void => { this.openHelp(); },
        choices: this.choices, validate: (value: string): string => this.validate(value),
        onConfirm: (value: string): void => {
          if (this.busy) return;
          this.onChange(value);
          this.displayValue = value;
        } }),
      autoCancel: true, customStyle: true, alignment: DialogAlignment.Center
    });
    this.dialog.open();
  }

  build() {
    DeckOptionRow({ title: this.title, summary: this.summary(), error: this.error, busy: this.busy,
      onOpen: (): void => { this.open(); } })
  }
}
