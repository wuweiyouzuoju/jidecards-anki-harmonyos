// SPDX-License-Identifier: AGPL-3.0-or-later
import { PressFeedback } from '../../utils/PressFeedback';
import { DisclosureChevron } from './DisclosureChevron';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 颜色键 } from '../../model/颜色主题';
import { THEME_TEXT_COLORS_KEY } from '../../model/ThemeCatalog';
import { ThemeLabelGlyph, themeLabelGlyphs } from './ThemeText';

/** 菜单和表单展开行共享尺寸、箭头及选中主题色；表单标题可左对齐。 */
@Component
export struct AnchoredMenuItem {
  @Prop label: ResourceStr = '';
  @Prop labelAlignment: TextAlign = TextAlign.Center;
  @Prop selected: boolean = false;
  @Prop available: boolean = true;
  @Prop divider: boolean = false;
  @Prop disclosure: boolean = false;
  @Prop expanded: boolean = false;
  @StorageProp(颜色键.动作主色) private accent: string = '#2F5FD0';
  @StorageProp(THEME_TEXT_COLORS_KEY) private accentColors: string[] = [];
  onSelect: () => void = (): void => {};

  build() {
    Column() {
      if (this.divider) {
        Divider().color($r('app.color.border_subtle')).strokeWidth(0.5)
          .margin({ left: 应用尺寸.面板内边距, right: 应用尺寸.面板内边距 })
      }
      Stack({ alignContent: Alignment.End }) {
        Text() {
          if (this.selected && this.accentColors.length > 0) {
            ForEach(themeLabelGlyphs(this.label, this.accentColors, this.getUIContext()), (glyph: ThemeLabelGlyph) => {
              Span(glyph.letter).fontColor(glyph.color)
            }, (glyph: ThemeLabelGlyph, index: number): string => `${index}-${glyph.letter}-${glyph.color}`)
          } else {
            Span(this.label)
          }
        }
        .fontSize(应用尺寸.字号_正文)
        .fontColor(this.selected ? this.accent : $r('app.color.text_primary'))
        .width('100%')
        .constraintSize({ minHeight: 应用尺寸.menuItemHeight })
        .padding({ left: this.labelAlignment === TextAlign.Start ? 0 : (this.disclosure ? 28 : 应用尺寸.menuHorizontalPadding),
          right: this.disclosure ? 28 : 应用尺寸.menuHorizontalPadding, top: 8, bottom: 8 })
        .textAlign(this.labelAlignment)
        if (this.disclosure) {
          DisclosureChevron({ tint: $r('app.color.text_secondary') })
            .rotate({ angle: this.expanded ? 90 : 0 })
            .animation({ duration: 150, curve: Curve.EaseOut })
            .margin({ right: 应用尺寸.menuHorizontalPadding })
            .hitTestBehavior(HitTestMode.None)
        }
      }
      .width('100%')
      .attributeModifier(new PressFeedback())
      .enabled(this.available)
      .onClick((): void => { this.onSelect(); })
    }.width('100%')
  }
}
