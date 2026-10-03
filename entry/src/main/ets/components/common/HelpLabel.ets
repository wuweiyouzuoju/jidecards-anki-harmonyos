// SPDX-License-Identifier: AGPL-3.0-or-later
import { HelpButton } from './HelpButton';
import { ThemeHighlightedTextSpans } from './ThemeText';

/** 帮助紧随标题；仅标题收缩，剩余行宽由调用方分配给右侧业务控件。 */
@Component
export struct HelpLabel {
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
      Text() { ThemeHighlightedTextSpans(this.title, this.highlightLabel, this.highlightColors, this.getUIContext()) }
        .fontSize(this.textSize).fontColor(this.textColor).fontWeight(this.textWeight)
        .textAlign(this.centered ? TextAlign.Center : TextAlign.Start)
        .maxLines(2).textOverflow({ overflow: TextOverflow.Ellipsis }).flexShrink(1)
      if (this.showHelp) {
        HelpButton({ label: this.title, isHelpEnabled: this.isHelpEnabled, onHelp: this.onHelp })
      }
    }
    // 调用方宽度属于自定义组件的隐形容器；居中标题的实际 Row 也必须占满它。
    .width(this.centered ? '100%' : undefined)
    .constraintSize({ minHeight: this.minRowHeight })
    .alignItems(VerticalAlign.Center)
    .justifyContent(this.centered ? FlexAlign.Center : FlexAlign.Start)
  }
}
