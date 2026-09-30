// SPDX-License-Identifier: AGPL-3.0-or-later
import { PressFeedback } from '../../utils/PressFeedback';
import { DialogFrame } from '../common/DialogFrame';
import { DialogHeader } from '../common/DialogHeader';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { resourceText, namedResourceText } from '../../utils/UiFeedback';

@Component
export struct BrowserFlagDialog {
  @Prop @Watch('handleBackRequest') backRequest: number = 0;

  private handleBackRequest(): void {
    if (!this.busy) this.onClose();
  }

  @Prop isDark: boolean = false;
  @Prop busy: boolean = false;
  onClose: () => void = (): void => {};
  onSubmit: (flag: number) => void = (_flag: number): void => {};
  private 标志颜色(flag: number): string {
    const 色表: Record<number, string> = {
      0: 'transparent',
      1: '#D92D20',
      2: '#D97A1C',
      3: '#238463',
      4: '#2F5FD0'
    };
    return 色表[flag] ?? 'transparent';
  }
  private 标志文案(flag: number): string {
    const keys: string[] = ['none', 'red', 'orange', 'green', 'blue'];
    return namedResourceText(this.getUIContext(), 'browser_action_flag_' + keys[flag]);
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
    ForEach([0, 1, 2, 3, 4], (flag: number) => {
      Row({ space: 应用尺寸.间距_12 }) {
        // 标志色块：0=无（透明圆环）/1=红/2=橙/3=绿/4=蓝
        Row()
          .width(16)
          .height(16)
          .borderRadius(8)
          .backgroundColor(this.标志颜色(flag))
          .border({ width: flag === 0 ? 1 : 0, color: $r('app.color.border_input') })
        Text(this.标志文案(flag))
          .fontSize(应用尺寸.字号_按钮)
          .fontColor($r('app.color.text_primary'))
          .layoutWeight(1)
      }
      .width('100%')
      .height(应用尺寸.按钮高度)
      .padding({ left: 应用尺寸.间距_16, right: 应用尺寸.间距_16 })
      .borderRadius(应用尺寸.圆角_胶囊)
      .backgroundColor($r('app.color.surface_page'))
      .enabled(!this.busy)
      .attributeModifier(new PressFeedback())
      .onClick((): void => { this.onSubmit(flag); })
    }, (flag: number): string => `${flag}`)
  }

  build() {
    DialogFrame({ maximumWidth: 应用尺寸.dialogCompactMaxWidth, canDismiss: !this.busy,
      header: () => { this.dialogHeader(); }, content: () => { this.dialogContent(); },
      onDismiss: (): void => { this.onClose(); } })
  }
}
