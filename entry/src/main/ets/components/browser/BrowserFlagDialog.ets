// SPDX-License-Identifier: AGPL-3.0-or-later
import { PressFeedback } from '../../utils/PressFeedback';
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { namedResourceText } from '../../utils/UiFeedback';
import { CARD_FLAGS, CardFlagDefinition, FlagLabels, customFlagLabel } from '../../model/CardMarking';

@Component
export struct BrowserFlagDialog {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop @Watch('handleBackRequest') backRequest: number = 0;

  private handleBackRequest(): void {
    if (!this.busy) this.onClose();
  }

  @Prop isDark: boolean = false;
  @Prop busy: boolean = false;
  @Prop currentFlag: number = -1;
  @Prop labels: FlagLabels = {};
  @Prop noteScope: boolean = false;
  onClose: () => void = (): void => {};
  onSubmit: (flag: number) => void = (_flag: number): void => {};
  private 标志颜色(flag: number): string {
    return CARD_FLAGS[flag]?.color ?? 'transparent';
  }
  private 标志文案(flag: number, _locale: string = this.uiLanguage): string {
    return customFlagLabel(this.labels, flag) || namedResourceText(this.getUIContext(), CARD_FLAGS[flag].labelKey);
  }

  @Builder
  private dialogHeader() {
    DialogHeader({
      title: $r('app.string.browser_action_set_flag'),
      showAction: false,
      closeLabel: $r('app.string.browser_detail_cancel'),
      closeEnabled: !this.busy,
      onClose: (): void => { this.onClose(); }
    })
  }

  @Builder
  private dialogContent() {
    Text(this.noteScope ? $r('app.string.card_mark_flag_note_scope') : $r('app.string.card_mark_flag_scope'))
      .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary')).width('100%')
    ForEach(CARD_FLAGS, (definition: CardFlagDefinition) => {
      Row({ space: 应用尺寸.间距_12 }) {
        // 标志色块：0=无（透明圆环）/1=红/2=橙/3=绿/4=蓝
        Row()
          .width(16)
          .height(16)
          .borderRadius(8)
          .backgroundColor(this.标志颜色(definition.value))
          .border(SurfaceBorder.options(definition.value === 0 ? 1 : 0))
        Text(this.标志文案(definition.value))
          .fontSize(应用尺寸.字号_按钮)
          .fontColor($r('app.color.text_primary'))
          .layoutWeight(1)
        if (this.currentFlag === definition.value) {
          Text($r('app.string.card_mark_selected_symbol'))
            .fontColor(definition.value === 0 ? $r('app.color.text_primary') : $r('app.color.action_primary'))
        }
      }
      .width('100%')
      .height(应用尺寸.按钮高度)
      .padding({ left: 应用尺寸.间距_16, right: 应用尺寸.间距_16 })
      .borderRadius(应用尺寸.圆角_胶囊).border(SurfaceBorder.options())
      .backgroundColor($r('app.color.surface_page'))
      .enabled(!this.busy)
      .attributeModifier(new PressFeedback())
      .onClick((): void => { this.onSubmit(definition.value); })
    }, (definition: CardFlagDefinition): string => `${definition.value}`)
  }

  build() {
    DialogFrame({ maximumWidth: 应用尺寸.dialogCompactMaxWidth, canDismiss: !this.busy,
      header: () => { this.dialogHeader(); }, content: () => { this.dialogContent(); },
      onDismiss: (): void => { this.onClose(); } })
  }
}
