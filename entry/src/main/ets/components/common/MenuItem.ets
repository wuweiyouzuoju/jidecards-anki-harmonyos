// SPDX-License-Identifier: AGPL-3.0-or-later
import { PressFeedback } from '../../utils/PressFeedback';
import { DisclosureChevron } from './DisclosureChevron';
import { ActionIcon } from './ActionIcon';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { SurfaceBorder } from '../../utils/SurfaceBorder';
import { 颜色键 } from '../../model/颜色主题';
import { THEME_TEXT_COLORS_KEY } from '../../model/ThemeCatalog';
import { ThemeLabelGlyph, themeLabelGlyphs } from './ThemeText';

/** 菜单图标与标题成组对齐；表单展开行共用尺寸、箭头及选中主题色。 */
@Component
export struct AnchoredMenuItem {
  @StorageProp('系统语言') private uiLanguage: string = 'zh-Hans';
  @Prop label: ResourceStr = '';
  @Prop labelAlignment: TextAlign = TextAlign.Center;
  @Prop selected: boolean = false;
  @Prop selectionUsesAccent: boolean = true;
  @Prop available: boolean = true;
  @Prop divider: boolean = false;
  @Prop disclosure: boolean = false;
  @Prop expanded: boolean = false;
  @Prop disclosureAngle: number | undefined = undefined;
  @Prop icon: ResourceStr | undefined = undefined;
  @Prop iconTint: ResourceColor | undefined = undefined;
  @Prop destructive: boolean = false;
  @StorageProp(颜色键.动作主色) private accent: string = '#2F5FD0';
  @StorageProp(THEME_TEXT_COLORS_KEY) private accentColors: string[] = [];
  onSelect: () => void = (): void => {};

  private usesAccent(): boolean { return this.selected && this.selectionUsesAccent; }

  private resolvedIconTint(): ResourceColor {
    return this.iconTint ?? (this.usesAccent() ? `#40${this.accent.slice(-6)}` : $r('app.color.menu_icon_fill'));
  }

  private hasCenteredIcon(): boolean { return this.labelAlignment === TextAlign.Center && this.icon !== undefined; }

  private trailingInset(): number {
    return 应用尺寸.menuHorizontalPadding + (this.disclosure ? 24 + 应用尺寸.间距_8 : 0);
  }

  private iconRowPadding(): Padding {
    const right: number = this.trailingInset();
    return { left: this.hasCenteredIcon() ? right : 应用尺寸.menuHorizontalPadding, right: right };
  }

  private labelPadding(): Padding {
    if (this.icon !== undefined) return { left: 0, right: 0, top: 8, bottom: 8 };
    return { left: this.labelAlignment === TextAlign.Start ? 0 : this.trailingInset(),
      right: this.trailingInset(), top: 8, bottom: 8 };
  }

  @Builder
  private labelText() {
    Text() {
      if (this.usesAccent() && this.accentColors.length > 0) {
        ForEach(themeLabelGlyphs(this.label, this.accentColors, this.getUIContext(), this.uiLanguage), (glyph: ThemeLabelGlyph) => {
          Span(glyph.letter).fontColor(glyph.color)
        }, (glyph: ThemeLabelGlyph, index: number): string => `${index}-${glyph.letter}-${glyph.color}`)
      } else {
        Span(this.label)
      }
    }
    .fontSize(应用尺寸.字号_正文)
    .fontColor(this.usesAccent() ? this.accent : this.destructive ? $r('app.color.error_text') : $r('app.color.text_primary'))
    .width(this.icon !== undefined ? undefined : '100%')
    .constraintSize({ minHeight: 应用尺寸.menuItemHeight, minWidth: 0 })
    .padding(this.labelPadding())
    .textAlign(this.labelAlignment)
    .flexShrink(this.icon !== undefined ? 1 : 0)
  }

  build() {
    Column() {
      if (this.divider) {
        Divider().color(SurfaceBorder.color()).strokeWidth(0.5)
          .margin({ left: 应用尺寸.面板内边距, right: 应用尺寸.面板内边距 })
      }
      Stack({ alignContent: Alignment.End }) {
        if (this.icon !== undefined) {
          Row({ space: 应用尺寸.间距_8 }) {
            ActionIcon({ source: this.icon, tint: this.resolvedIconTint() }).flexShrink(0)
            this.labelText()
          }
          .width('100%')
          .alignItems(VerticalAlign.Center)
          .justifyContent(this.labelAlignment === TextAlign.Center ? FlexAlign.Center : FlexAlign.Start)
          .padding(this.iconRowPadding())
        } else {
          this.labelText()
        }
        if (this.disclosure) {
          DisclosureChevron({ tint: $r('app.color.text_secondary') })
            .rotate({ angle: this.disclosureAngle ?? (this.expanded ? 90 : 0), centerX: '50%', centerY: '50%' })
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
