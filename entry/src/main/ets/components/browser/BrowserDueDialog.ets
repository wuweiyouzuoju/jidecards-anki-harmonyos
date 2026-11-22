// SPDX-License-Identifier: AGPL-3.0-or-later
import { appearanceElementRadius, appearanceElementColor } from '../../utils/AppearanceElements';
import { insetMaterialFill } from '../../utils/GlassMaterial';
import { DialogFrame } from '../common/DialogFrame';
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { DialogHeader } from '../common/DialogHeader';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { resourceText, namedResourceText } from '../../utils/UiFeedback';

@Component
export struct BrowserDueDialog {
  @StorageProp('appearance_elements_active') private appearanceElements: string = '';
  @Prop @Watch('handleBackRequest') backRequest: number = 0;

  private handleBackRequest(): void {
    if (!this.busy) this.onClose();
  }

  @Prop isDark: boolean = false;
  @Prop busy: boolean = false;
  onClose: () => void = (): void => {};
  @State private days: string = '';
  onSubmit: (days: string) => void = (_days: string): void => {};

  @Builder
  private dialogHeader() {
    DialogHeader({
      title: $r('app.string.browser_action_set_due'),
      closeLabel: $r('app.string.browser_detail_cancel'),
      closeEnabled: !this.busy,
      onClose: (): void => { this.onClose(); },
      actionLabel: $r('app.string.browser_detail_confirm'),
      actionEnabled: !this.busy && this.days.trim() !== '',
      onAction: (): void => { this.onSubmit(this.days); }
    })
  }

  @Builder
  private dialogContent() {
    Text($r('app.string.browser_action_set_due_hint'))
      .fontSize(应用尺寸.字号_正文_小)
      .fontColor(appearanceElementColor(this.appearanceElements, 'text_secondary', $r('app.color.text_secondary')))
      .width('100%')

    TextInput({ text: this.days, placeholder: $r('app.string.browser_action_set_due_placeholder') })
      .border(SurfaceBorder.options( undefined, undefined, this.appearanceElements))
      .width('100%')
      .height(应用尺寸.按钮高度)
      .fontSize(应用尺寸.字号_正文)
      .fontColor(appearanceElementColor(this.appearanceElements, 'text_primary', $r('app.color.text_primary')))
      .backgroundColor(insetMaterialFill(appearanceElementColor(this.appearanceElements, 'surface_page', $r('app.color.surface_page'))))
      .borderRadius(appearanceElementRadius(this.appearanceElements, 应用尺寸.圆角_面板))
      .enabled(!this.busy)
      .onChange((值: string): void => { this.days = 值; })
  }

  build() {
    DialogFrame({ maximumWidth: 应用尺寸.dialogCompactMaxWidth, canDismiss: !this.busy,
      header: () => { this.dialogHeader(); }, content: () => { this.dialogContent(); },
      onDismiss: (): void => { this.onClose(); } })
  }
}
