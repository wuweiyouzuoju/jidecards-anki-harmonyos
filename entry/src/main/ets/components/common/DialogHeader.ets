// SPDX-License-Identifier: AGPL-3.0-or-later
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
  onHelp: () => void = (): void => {};
  onAction: () => void = (): void => {};
  onClose: () => void = (): void => {};
  @StorageProp(颜色键.动作主色) private actionColor: string = '#2F5FD0';
  @State private actionPressed: boolean = false;

  build() {
    Row() {
      Row() {
      if (this.showClose) {
        Button(this.closeLabel)
          .type(ButtonType.Normal)
          .height(44)
          .padding({ left: 4, right: 4 })
          .fontSize(14)
          .fontColor($r('app.color.text_secondary'))
          .backgroundColor(Color.Transparent)
          .borderRadius(10)
          .enabled(this.closeEnabled)
          .onClick((): void => {
            if (this.closeEnabled) { this.onClose(); }
          })
      }
      }
      .width('28%')
      .justifyContent(FlexAlign.Start)
      Row() {
        Text(this.title)
        .fontSize(18)
        .fontWeight(FontWeight.Bold)
        .fontColor($r('app.color.text_primary'))
        .textAlign(TextAlign.Center)
        .flexShrink(1)
        .padding({ left: 4, right: 4 })
        .maxLines(2)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
        if (this.showHelp) {
          Button($r('app.string.field_help_button'))
            .type(ButtonType.Normal)
            .width(28)
            .height(40)
            .padding(0)
            .fontSize(18)
            .fontColor($r('app.color.text_secondary'))
            .backgroundColor(Color.Transparent)
            .enabled(this.helpEnabled)
            .onClick((): void => {
              if (this.helpEnabled) { this.onHelp(); }
            })
        }
      }
      .width('44%')
      .justifyContent(FlexAlign.Center)
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
        .height(40)
        .padding({ left: 4, right: 4 })
        .constraintSize({ maxWidth: '100%' })
        .fontSize(14)
        .fontWeight(FontWeight.Medium)
        .fontColor(this.destructive ? $r('app.color.error_text') : this.actionColor)
        .backgroundColor(Color.Transparent)
        .borderRadius(12)
        .visibility(this.showAction ? Visibility.Visible : Visibility.Hidden)
        .enabled(this.actionEnabled)
        .scale({ x: this.actionPressed ? 0.97 : 1, y: this.actionPressed ? 0.97 : 1 })
        .animation({ duration: 80, curve: Curve.EaseOut })
        .onTouch((event: TouchEvent): void => {
          if (event.type === TouchType.Down) {
            this.actionPressed = true;
          } else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
            this.actionPressed = false;
          }
        })
        .onClick((): void => {
          if (this.actionEnabled) { this.onAction(); }
        })
      }
      .width('28%')
      .justifyContent(FlexAlign.End)
    }
    .width('100%')
    .constraintSize({ minHeight: 48 })
    .padding({ bottom: 8 })
    .border({ width: { bottom: 0.5 }, color: $r('app.color.border_input') })
  }
}
