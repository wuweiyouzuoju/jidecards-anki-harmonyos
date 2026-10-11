// SPDX-License-Identifier: AGPL-3.0-or-later
import { HelpButton } from './HelpButton';
import { ThemeHighlightedTextSpans, themeTextKey } from './ThemeText';
import { HelpLayout } from '../../utils/HelpLayout';

/** 标题决定布局；帮助绝对定位在文字旁，热区不挤偏标题或撑高标题行。 */
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
  @Prop limitTitleLines: boolean = true;
  @Prop showHelp: boolean = true;
  @Prop isHelpEnabled: boolean = true;
  @Prop minRowHeight: number = 0;
  @State private titleWidth: number = 0;
  @State private titleHeight: number = 0;
  onHelp: () => void = (): void => {};

  private updateTitleArea(area: Area): void {
    const width: number = Number(area.width);
    const height: number = Number(area.height);
    if (Math.abs(this.titleWidth - width) > 0.01) this.titleWidth = width;
    if (Math.abs(this.titleHeight - height) > 0.01) this.titleHeight = height;
  }

  build() {
    Row() {
      Stack() {
        Text() { ForEach([themeTextKey(this.title, this.highlightColors, this.getUIContext(), this.uiLanguage, this.highlightLabel)], (_textKey: string) => { ThemeHighlightedTextSpans(this.title, this.highlightLabel, this.highlightColors, this.getUIContext()) }, (_textKey: string): string => _textKey) }
          .fontSize(this.textSize).fontColor(this.textColor).fontWeight(this.textWeight)
          .textAlign(this.centered ? TextAlign.Center : TextAlign.Start)
          .maxLines(this.limitTitleLines ? 2 : undefined)
          .textOverflow({ overflow: this.limitTitleLines ? TextOverflow.Ellipsis : TextOverflow.Clip })
          .lineBreakStrategy(this.limitTitleLines ? LineBreakStrategy.GREEDY : LineBreakStrategy.BALANCED)
          .onAreaChange((_old: Area, area: Area): void => { this.updateTitleArea(area); })
        if (this.showHelp) {
          Row() {
            HelpButton({ label: this.title, isHelpEnabled: this.isHelpEnabled, onHelp: this.onHelp })
          }
          .width(HelpLayout.iconSize).height(HelpLayout.iconSize)
          .position(HelpLayout.titleHelpPosition(this.titleWidth, this.titleHeight))
        }
      }
      .constraintSize({ maxWidth: HelpLayout.titleMaxWidth(this.centered, this.showHelp) }).flexShrink(1)
    }
    // 分配给自定义组件的宽度必须传到实际 Row，左对齐与居中都由这层负责。
    .width('100%')
    .constraintSize({ minHeight: this.minRowHeight })
    .alignItems(VerticalAlign.Center)
    .justifyContent(this.centered ? FlexAlign.Center : FlexAlign.Start)
  }
}
