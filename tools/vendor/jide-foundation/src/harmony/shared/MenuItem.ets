// SPDX-License-Identifier: AGPL-3.0-or-later
import { SharedMenuTheme, sharedMenuTheme, SharedMenuTokens, SharedMenuScope, sharedMenuScope, SharedMenuTarget, SharedMenuRouter, SharedMenuGlyph } from './MenuTypes';
import { SharedActionIcon } from './ActionIcon';
import { SharedDisclosureChevron } from './DisclosureChevron';
import { SharedPressFeedback } from './PressFeedback';

/** 菜单图标与标题成组对齐；表单展开行共用尺寸、箭头及选中主题色。 */
@Component
export struct SharedMenuItem {
  @Prop theme: SharedMenuTheme = sharedMenuTheme();
  @Prop labelGlyphs: SharedMenuGlyph[] = [];
  @Prop disclosureMotion: AnimateParam = { duration: 160, curve: Curve.EaseOut };
  menuRouter: SharedMenuRouter | undefined = undefined;
  onTrigger: (area: Area) => void = (_area: Area): void => {};
  readPressScale: () => number = (): number => 1;

  slideScope: SharedMenuScope = sharedMenuScope();
  @Prop slideLayer: number = 0;
  @State private slideHighlighted: boolean = false;
  private slideTarget: SharedMenuTarget | null = null;
  private triggerArea: Area | undefined = undefined;
  private activate(): void {
    if (!this.available) return;
    if (this.triggerArea !== undefined) this.onTrigger(this.triggerArea);
    this.onSelect();
  }
  private slideArea(area: Area): void {
    this.triggerArea = area;
    if (this.slideTarget === null) {
      this.slideTarget = { scope: this.slideScope, rect: { left: 0, top: 0, width: 0, height: 0 },
        offset: 0, layer: this.slideLayer, available: (): boolean => this.available,
        highlight: (active: boolean): void => { this.slideHighlighted = active; },
        select: (): void => { if (this.available && (!this.disclosure || !this.expanded)) this.activate(); },
        enter: (): void => { if (this.available && this.disclosure && !this.expanded) this.activate(); }, branch: this.disclosure };
      this.menuRouter?.register(this.slideTarget);
    }
    this.slideTarget.rect = { left: Number(area.globalPosition.x), top: Number(area.globalPosition.y),
      width: Number(area.width), height: Number(area.height) };
    this.slideTarget.offset = this.slideScope.offset;
    this.slideTarget.layer = this.slideLayer;
    this.slideTarget.branch = this.disclosure;
  }
  aboutToDisappear(): void { if (this.slideTarget !== null) this.menuRouter?.remove(this.slideTarget); this.slideTarget = null; }
  @Prop label: ResourceStr = '';
  @Prop labelAlignment: TextAlign = TextAlign.Start;
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
  onSelect: () => void = (): void => {};

  private usesAccent(): boolean { return this.selected && this.selectionUsesAccent; }

  private resolvedIconTint(): ResourceColor {
    return this.iconTint ?? (this.usesAccent() ? `#40${this.theme.accent.slice(-6)}` : this.theme.iconFill);
  }

  private hasCenteredIcon(): boolean { return this.labelAlignment === TextAlign.Center && this.icon !== undefined; }

  private trailingInset(): number {
    return SharedMenuTokens.horizontalPadding + (this.disclosure ? 24 + SharedMenuTokens.gap : 0);
  }

  private iconRowPadding(): Padding {
    // 居中图文不为贴边箭头让出单侧空槽，避免整组标题偏移。
    const right: number = this.hasCenteredIcon() ? SharedMenuTokens.horizontalPadding : this.trailingInset();
    return { left: SharedMenuTokens.horizontalPadding, right: right };
  }

  private labelPadding(): Padding {
    if (this.icon !== undefined) return { left: 0, right: 0, top: 8, bottom: 8 };
    return { left: this.labelAlignment === TextAlign.Start ? SharedMenuTokens.horizontalPadding : this.trailingInset(),
      right: this.trailingInset(), top: 8, bottom: 8 };
  }

  @Builder
  private labelText() {
    Text() {
      if (this.usesAccent() && this.labelGlyphs.length > 0) {
        ForEach(this.labelGlyphs, (glyph: SharedMenuGlyph) => {
          Span(glyph.letter).fontColor(glyph.color)
        }, (glyph: SharedMenuGlyph, index: number): string => `${index}-${glyph.letter}-${glyph.color}`)
      } else {
        Span(this.label)
      }
    }
    .fontSize(SharedMenuTokens.textSize)
    .fontColor(this.usesAccent() ? this.theme.accent : this.destructive ? this.theme.danger : this.theme.text)
    .width(this.icon !== undefined ? undefined : '100%')
    .constraintSize({ minHeight: SharedMenuTokens.itemHeight, minWidth: 0 })
    .padding(this.labelPadding())
    .textAlign(this.labelAlignment)
    .flexShrink(this.icon !== undefined ? 1 : 0)
  }

  build() {
    Column() {
      if (this.divider) {
        Divider().color(this.theme.lineColor).strokeWidth(0.5)
          .margin({ left: SharedMenuTokens.panelInset, right: SharedMenuTokens.panelInset })
      }
      Stack({ alignContent: Alignment.End }) {
        if (this.icon !== undefined) {
          Row({ space: SharedMenuTokens.gap }) {
            SharedActionIcon({ outlineOnly: this.theme.material === 'glass', source: this.icon, tint: this.resolvedIconTint(), semanticStrokeColor: this.iconTint }).flexShrink(0)
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
          SharedDisclosureChevron({ tint: this.theme.secondaryText })
            .rotate({ angle: this.disclosureAngle ?? (this.expanded ? 90 : 0), centerX: '50%', centerY: '50%' })
            .animation(this.disclosureMotion)
            .margin({ right: this.hasCenteredIcon() ? 0 : SharedMenuTokens.horizontalPadding })
            .hitTestBehavior(HitTestMode.None)
        }
      }
      .width('100%')
      .backgroundColor(this.slideHighlighted ? this.theme.hover : Color.Transparent)
      .borderRadius(SharedMenuTokens.radius)
      .attributeModifier(new SharedPressFeedback(1, 0.4, this.readPressScale))
      .enabled(this.available)
      .onClick((): void => { if (this.available) this.activate(); })
      .onAreaChange((_old: Area, area: Area): void => { this.slideArea(area); })
    }.width('100%')
  }
}
