// SPDX-License-Identifier: AGPL-3.0-or-later
import { PressFeedback } from '../../utils/PressFeedback';
import { HelpLabel } from './HelpLabel';
import { ThemeLabelGlyph, themeLabelGlyphs } from './ThemeText';
import { THEME_TEXT_COLORS_KEY } from '../../model/ThemeCatalog';

import { 颜色键 } from '../../model/颜色主题';

/** 弹窗的固定操作栏：退出在左，标题居中，主操作在右；业务校验由调用方传入。 */
@Component
export struct DialogHeader {
  @StorageProp(THEME_TEXT_COLORS_KEY) private themeAccentColors: string[] = [];
  @Prop title: ResourceStr = '';
  @Prop actionLabel: ResourceStr = $r('app.string.done');
  @Prop closeLabel: ResourceStr = $r('app.string.create_deck_cancel');
  @Prop actionEnabled: boolean = true;
  @Prop closeEnabled: boolean = true;
  @Prop showClose: boolean = true;
  @Prop showAction: boolean = true;
  @Prop showHelp: boolean = false;
  @Prop helpEnabled: boolean = true;
  @Prop destructive: boolean = false;
  @Prop showDivider: boolean = true;
  onHelp: () => void = (): void => {};
  onAction: () => void = (): void => {};
  onClose: () => void = (): void => {};
  @StorageProp(颜色键.动作主色) private actionColor: string = '#2F5FD0';

  build() {
    Stack({ alignContent: Alignment.Center }) {
      Row() {
      Row() {
      if (this.showClose) {
        Button(this.closeLabel)
          .type(ButtonType.Normal)
          .height(44)
          .constraintSize({ maxWidth: '100%' })
          .padding({ left: 4, right: 4 })
          .fontSize(14)
          .fontColor($r('app.color.text_secondary'))
          .backgroundColor(Color.Transparent)
          .borderRadius(10)
          .attributeModifier(new PressFeedback())
          .stateEffect(false)
          .enabled(this.closeEnabled)
          .onClick((): void => {
            if (this.closeEnabled) { this.onClose(); }
          })
      }
      }
      .width('28%')
      .justifyContent(FlexAlign.Start)
      Blank().layoutWeight(1)
      Row() {
      Button() {
        Text() {
          if (!this.destructive && this.themeAccentColors.length > 0) {
            ForEach(themeLabelGlyphs(this.actionLabel, this.themeAccentColors, this.getUIContext()), (glyph: ThemeLabelGlyph) => {
              Span(glyph.letter).fontColor(glyph.color)
            }, (glyph: ThemeLabelGlyph, index: number): string => `${index}-${glyph.letter}-${glyph.color}`)
          } else {
            Span(this.actionLabel)
          }
        }.fontSize(14).fontWeight(FontWeight.Medium).fontColor(this.destructive ? $r('app.color.error_text') : this.actionColor)
      }
        .type(ButtonType.Normal)
        .height(44)
        .padding({ left: 4, right: 4 })
        .constraintSize({ maxWidth: '100%' })
        .fontSize(14)
        .fontWeight(FontWeight.Medium)
        .fontColor(this.destructive ? $r('app.color.error_text') : this.actionColor)
        .backgroundColor(Color.Transparent)
        .borderRadius(12)
        .visibility(this.showAction ? Visibility.Visible : Visibility.Hidden)
        .attributeModifier(new PressFeedback())
        .stateEffect(false)
        .enabled(this.actionEnabled)
        .onClick((): void => {
          if (this.actionEnabled) { this.onAction(); }
        })
      }
      .width('28%')
      .justifyContent(FlexAlign.End)
      }.width('100%')
      HelpLabel({ title: this.title, textSize: 18, textWeight: FontWeight.Bold,
        centered: true, showHelp: this.showHelp, isHelpEnabled: this.helpEnabled, onHelp: this.onHelp })
        .width('44%')
    }
    .width('100%')
    .constraintSize({ minHeight: 48 })
    .padding({ bottom: 8 })
    .border({ width: { bottom: this.showDivider ? 0.5 : 0 }, color: $r('app.color.border_input') })
  }
}
