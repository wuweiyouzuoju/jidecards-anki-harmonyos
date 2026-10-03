// SPDX-License-Identifier: AGPL-3.0-or-later
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 设置面板色板_取 } from '../../utils/设置面板配色';
import { HelpLabel } from './HelpLabel';
import { resourceText } from '../../utils/UiFeedback';

/** 标题和说明共享剩余宽度，开关保留独立槽位；长说明自然换行，不挤入开关。 */
@Component
export struct SettingsToggleRow {
  @Prop title: ResourceStr = '';
  @Prop hint: ResourceStr = '';
  @Prop isOn: boolean = false;
  @Prop isInteractive: boolean = true;
  @Prop isDark: boolean = false;
  @Prop tint: ResourceColor = $r('app.color.text_primary');
  @Prop showHelp: boolean = false;
  @Prop isHelpEnabled: boolean = true;
  onHelp: () => void = (): void => {};
  onChange: (value: boolean) => void = (_value: boolean): void => {};

  private change(value: boolean): void {
    if (this.isInteractive) this.onChange(value);
  }

  build() {
    Row({ space: 应用尺寸.间距_16 }) {
      Column({ space: 应用尺寸.间距_4 }) {
        if (this.showHelp) {
          HelpLabel({ title: this.title, textSize: 应用尺寸.字号_按钮,
            textColor: 设置面板色板_取(this.isDark).主文字,
            isHelpEnabled: this.isHelpEnabled, onHelp: this.onHelp })
        } else {
          Text(this.title)
            .fontSize(应用尺寸.字号_按钮)
            .fontColor(设置面板色板_取(this.isDark).主文字)
            .width('100%')
        }
        if (this.hint !== '') {
          Text(this.hint)
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor(设置面板色板_取(this.isDark).次文字)
            .width('100%')
        }
      }
      .alignItems(HorizontalAlign.Start)
      .layoutWeight(1)
      Toggle({ type: ToggleType.Switch, isOn: this.isOn })
        .width(40)
        .height(24)
        .flexShrink(0)
        .selectedColor(this.tint)
        .enabled(this.isInteractive)
        .accessibilityText(typeof this.title === 'string' ? this.title : resourceText(this.getUIContext(), this.title))
        .onChange((value: boolean): void => { this.change(value); })
    }
    .width('100%')
    .alignItems(this.hint === '' ? VerticalAlign.Center : VerticalAlign.Top)
    .constraintSize({ minHeight: 48 })
    .padding({ top: this.hint === '' ? 0 : 应用尺寸.间距_12,
      bottom: this.hint === '' ? 0 : 应用尺寸.间距_12 })
  }
}
