// SPDX-License-Identifier: AGPL-3.0-or-later
import { HelpButton } from './HelpButton';
import { ThemeHighlightedTextSpans } from './ThemeText';

/** 帮助紧随标题；仅标题收缩，剩余行宽由调用方分配给右侧业务控件。 */
@Component
export struct HelpLabel {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop title: ResourceStr = '';
  @Prop highlightLabel: ResourceStr = '';
  @Prop highlightColors: string[] = [];
  @Prop textSize: number = 15;
  @Prop textColor: ResourceColor = $r('app.color.text_primary');
  @Prop textWeight: FontWeight = FontWeight.Normal;
  @Prop centered: boolean = false;
  @Prop showHelp: boolean = true;
  @Prop isHelpEnabled: boolean = true;
  @Prop minRowHeight: number = 0;
  onHelp: () => void = (): void => {};

  build() {
    Row() {
      Text() { ForEach([this.uiLanguage], (_locale: string) => { ThemeHighlightedTextSpans(this.title, this.highlightLabel, this.highlightColors, this.getUIContext()) }, (_locale: string): string => _locale) }
        .fontSize(this.textSize).fontColor(this.textColor).fontWeight(this.textWeight)
        .textAlign(this.centered ? TextAlign.Center : TextAlign.Start)
        .maxLines(2).textOverflow({ overflow: TextOverflow.Ellipsis }).flexShrink(1)
      if (this.showHelp) {
        HelpButton({ label: this.title, isHelpEnabled: this.isHelpEnabled, onHelp: this.onHelp })
      }
    }
    // 分配给自定义组件的宽度必须传到实际 Row，左对齐与居中都由这层负责。
    .width('100%')
    .constraintSize({ minHeight: this.minRowHeight })
    .alignItems(VerticalAlign.Center)
    .justifyContent(this.centered ? FlexAlign.Center : FlexAlign.Start)
  }
}
