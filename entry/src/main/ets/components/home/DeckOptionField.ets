import { DialogFrame } from '../common/DialogFrame';
import { NativeDialogHost, NativeDialogFactory, NativeDialogDismiss, NativeDialogPresentation } from '../common/NativeDialogHost';
import { SurfaceTransition } from '../../utils/SurfaceTransition';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { PressFeedback } from '../../utils/PressFeedback';
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { 字段帮助对话框 } from '../字段帮助面板';
import { DeckOptionRow } from './DeckOptionRow';
import { DialogHeader } from '../common/DialogHeader';
import { 按下态按钮 } from '../common/按下态按钮';
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
  defaultValue: string | undefined = undefined;
  choices: DeckOptionChoice[] = [];
  multiline: boolean = false;
  validate: (value: string) => string = (_value: string): string => '';
  onConfirm: (value: string) => void = (_value: string): void => {};
  @State private draft: string = '';
  @State private error: string = '';
  onHelp: () => void = (): void => {};
  onClose: () => void = (): void => {};

  aboutToAppear(): void { this.draft = this.initialValue; }

  private confirm(): void {
    this.error = this.validate(this.draft);
    if (this.error !== '') return;
    this.onConfirm(this.draft);
    this.onClose();
  }

  build() {
    DialogFrame({ nativeHost: true, maximumWidth: 应用尺寸.dialogMaxWidth,
      onDismiss: (): void => { this.onClose(); },
      header: () => { this.dialogHeader(); }, content: () => { this.dialogContent(); } })
  }

  @Builder
  private dialogHeader() {
    DialogHeader({ title: this.title, actionLabel: $r('app.string.done'), showHelp: true,
      onHelp: (): void => { this.onHelp(); },
      onClose: (): void => { this.onClose(); }, onAction: (): void => { this.confirm(); } })
  }

  @Builder
  private dialogContent() {
    Column({ space: 应用尺寸.间距_12 }) {
      if (this.choices.length === 0) {
        if (this.multiline) {
          TextArea({ text: this.draft })
            .width('100%').height(200).fontSize(应用尺寸.字号_正文)
            .backgroundColor($r('app.color.surface_card'))
            .border(SurfaceBorder.options()).borderRadius(应用尺寸.圆角_面板)
            .onChange((value: string): void => { this.draft = value; this.error = ''; })
        } else {
          TextInput({ text: this.draft })
            .width('100%').height(应用尺寸.按钮高度).fontSize(应用尺寸.字号_正文)
            .backgroundColor($r('app.color.surface_card'))
            .border(SurfaceBorder.options()).borderRadius(应用尺寸.圆角_面板)
            .onChange((value: string): void => { this.draft = value; this.error = ''; })
        }
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
      if (this.defaultValue !== undefined) {
        按下态按钮({ 文案: $r('app.string.deck_option_restore_default'), 点击回调: (): void => {
          this.draft = this.defaultValue!; this.error = '';
        } })
      }
    }.width('100%')
  }
}

/** 与设置页相同的入口行：名称、当前值、右箭头；整行可点击。 */
@Component
export struct DeckOptionField {
  @Prop title: ResourceStr = '';
  @Prop help: ResourceStr = '';
  @Prop @Watch('syncValue') value: string = '';
  @Prop choices: DeckOptionChoice[] = [];
  @Prop multiline: boolean = false;
  @Prop busy: boolean = false;
  @Prop error: string = '';
  @Prop defaultValue: string | undefined = undefined;
  validate: (value: string) => string = (_value: string): string => '';
  onChange: (value: string) => void = (_value: string): void => {};
  @State private displayValue: string = '';
  private readonly dialog: NativeDialogHost = new NativeDialogHost();
  private readonly helpDialog: NativeDialogHost = new NativeDialogHost();

  aboutToAppear(): void { this.dialog.activate(); this.helpDialog.activate(); this.syncValue(); }
  aboutToDisappear(): void {
    this.helpDialog.dispose();
    this.dialog.dispose();
  }

  private readonly createHelpDialog: NativeDialogFactory = (dismiss: NativeDialogDismiss): CustomDialogController => {
    const presentation: NativeDialogPresentation = this.helpDialog.presentation();
    return new CustomDialogController({
      onWillDismiss: dismiss,
      builder: 字段帮助对话框({ 标题: this.title, 正文: this.help,
        onDismiss: this.helpDialog.guard((): void => { this.helpDialog.close(); }) }),
      openAnimation: presentation.openAnimation, closeAnimation: presentation.closeAnimation, customStyle: presentation.customStyle, autoCancel: presentation.autoCancel, alignment: presentation.alignment,
      width: presentation.width, height: presentation.height, maskColor: presentation.maskColor
    });
  };
  private openHelp(): void { this.helpDialog.open(this.createHelpDialog); }
  private syncValue(): void { this.displayValue = this.value; }
  private summary(): ResourceStr {
    const choice: DeckOptionChoice | undefined = this.choices.find((item: DeckOptionChoice): boolean =>
      item.value === this.displayValue);
    return choice === undefined ? (this.displayValue === '' ? $r('app.string.deck_option_unset') : this.displayValue) : choice.label;
  }

  private readonly createDialog: NativeDialogFactory = (dismiss: NativeDialogDismiss): CustomDialogController => {
    const presentation: NativeDialogPresentation = this.dialog.presentation();
    const isCurrent: () => boolean = this.dialog.captureCurrent();
    return new CustomDialogController({
      onWillDismiss: dismiss,
      builder: DeckOptionEditor({ title: this.title, help: this.help, initialValue: this.displayValue,
        onClose: this.dialog.guard((): void => { this.dialog.close(); }),
        multiline: this.multiline,
        defaultValue: this.defaultValue,
        onHelp: this.dialog.guard((): void => { this.openHelp(); }),
        choices: this.choices, validate: (value: string): string => this.validate(value),
        onConfirm: (value: string): void => {
          if (!isCurrent() || this.busy) return;
          this.onChange(value);
          this.displayValue = value;
        } }),
      width: presentation.width, height: presentation.height, maskColor: presentation.maskColor,
      autoCancel: presentation.autoCancel, openAnimation: presentation.openAnimation, closeAnimation: presentation.closeAnimation, customStyle: presentation.customStyle, alignment: presentation.alignment
    });
  };
  private open(): void {
    if (!this.busy) this.dialog.open(this.createDialog);
  }

  build() {
    DeckOptionRow({ title: this.title, summary: this.summary(), error: this.error, busy: this.busy,
      onOpen: (): void => { this.open(); } })
  }
}
