// SPDX-License-Identifier: AGPL-3.0-or-later
import { 应用尺寸 } from '../../utils/应用尺寸';
import { HelpLabel } from './HelpLabel';
import { ActionIcon } from './ActionIcon';
import { localizedResourceText } from '../../utils/UiFeedback';

/** 标题和说明共享剩余宽度，开关保留独立槽位；长说明自然换行，不挤入开关。 */
@Component
export struct SettingsToggleRow {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop title: ResourceStr = '';
  @Prop icon: ResourceStr | undefined = undefined;
  @Prop hint: ResourceStr = '';
  @Prop isOn: boolean = false;
  @Prop isInteractive: boolean = true;
  @Prop isDark: boolean = false;
  @Prop textColor: ResourceColor = $r('app.color.text_primary');
  @Prop hintColor: ResourceColor = $r('app.color.text_secondary');
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
      if (this.icon !== undefined) { ActionIcon({ source: this.icon }).flexShrink(0) }
      Column({ space: 应用尺寸.间距_4 }) {
        if (this.showHelp) {
          HelpLabel({ title: this.title, textSize: 应用尺寸.字号_按钮,
            textColor: this.textColor,
            isHelpEnabled: this.isHelpEnabled, onHelp: this.onHelp })
        } else {
          Text(this.title)
            .fontSize(应用尺寸.字号_按钮)
            .fontColor(this.textColor)
            .width('100%')
            .textAlign(TextAlign.Start)
        }
        if (this.hint !== '') {
          Text(this.hint)
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor(this.hintColor)
            .width('100%')
            .textAlign(TextAlign.Start)
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
        .accessibilityText(typeof this.title === 'string' ? this.title : localizedResourceText(this.getUIContext(), this.uiLanguage, this.title))
        .onChange((value: boolean): void => { this.change(value); })
    }
    .width('100%')
    .alignItems(this.hint === '' ? VerticalAlign.Center : VerticalAlign.Top)
    .constraintSize({ minHeight: 48 })
    .padding({ top: this.hint === '' ? 0 : 应用尺寸.间距_12,
      bottom: this.hint === '' ? 0 : 应用尺寸.间距_12 })
  }
}
