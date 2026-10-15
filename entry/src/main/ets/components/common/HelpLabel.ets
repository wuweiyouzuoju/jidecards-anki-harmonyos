// SPDX-License-Identifier: AGPL-3.0-or-later
import { HelpButton } from './HelpButton';
import { ThemeHighlightedTextSpans, themeTextKey } from './ThemeText';
import { HelpLayout } from '../../utils/HelpLayout';
import { IconActionButton } from './IconActionButton';
import { 颜色键 } from '../../model/颜色主题';

/** 标题决定布局；帮助绝对定位在文字旁，热区不挤偏标题或撑高标题行。 */
@Component
export struct HelpLabel {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @StorageProp(颜色键.动作主色) private actionColor: string = '#2F5FD0';
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
  @Prop actionIcon: ResourceStr | undefined = undefined;
  @Prop actionLabel: ResourceStr = '';
  @Prop isActionEnabled: boolean = true;
  @Prop minRowHeight: number = 0;
  @State private titleWidth: number = 0;
  @State private titleHeight: number = 0;
  onHelp: () => void = (): void => {};
  onAction: () => void = (): void => {};

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
        if (this.actionIcon !== undefined) {
          IconActionButton({ source: this.actionIcon, label: this.actionLabel, glyphColor: this.actionColor,
            controlSize: HelpLayout.touchSize, controlGlyphSize: HelpLayout.iconSize,
            isInteractive: this.isActionEnabled, onAction: this.onAction })
            .position(HelpLayout.titleActionPosition(this.titleWidth, this.titleHeight))
        }
        if (this.showHelp) {
          Row() {
            HelpButton({ label: this.title, isHelpEnabled: this.isHelpEnabled, onHelp: this.onHelp })
          }
          .width(HelpLayout.iconSize).height(HelpLayout.iconSize)
          .position(HelpLayout.titleHelpPosition(this.titleWidth, this.titleHeight, this.actionIcon !== undefined))
        }
      }
      .constraintSize({ maxWidth: HelpLayout.titleMaxWidth(this.centered, this.showHelp, this.actionIcon !== undefined) }).flexShrink(1)
    }
    // 分配给自定义组件的宽度必须传到实际 Row，左对齐与居中都由这层负责。
    .width('100%')
    .constraintSize({ minHeight: this.minRowHeight })
    .alignItems(VerticalAlign.Center)
    .justifyContent(this.centered ? FlexAlign.Center : FlexAlign.Start)
  }
}
