// SPDX-License-Identifier: AGPL-3.0-or-later
import { PressFeedback } from '../../utils/PressFeedback';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { ActionIcon } from './ActionIcon';
import { DisclosureChevron } from './DisclosureChevron';
import { HelpLabel } from './HelpLabel';

/** 目录、维护和关于入口共用几何；水平边距和分隔线归宿主。 */
@Component
export struct SettingsActionRow {
  @Prop title: ResourceStr = '';
  @Prop hint: ResourceStr = '';
  @Prop icon: ResourceStr | undefined = undefined;
  @Prop trailingIcon: ResourceStr | undefined = undefined;
  @Prop isInteractive: boolean = true;
  @Prop showHelp: boolean = false;
  onHelp: () => void = (): void => {};
  onAction: () => void = (): void => {};
  @BuilderParam hintContent: () => void = this.defaultHint;

  private activate(): void {
    if (this.isInteractive) this.onAction();
  }

  @Builder
  private defaultHint(): void {
    if (this.hint !== '') {
      Text(this.hint).fontSize(应用尺寸.字号_正文_小)
        .fontColor($r('app.color.text_secondary')).width('100%').textAlign(TextAlign.Start)
    }
  }

  build() {
    Row({ space: 应用尺寸.间距_12 }) {
      if (this.icon !== undefined) { ActionIcon({ source: this.icon }).flexShrink(0) }
      Column({ space: 应用尺寸.间距_4 }) {
        if (this.showHelp) {
          HelpLabel({ title: this.title, onHelp: this.onHelp })
        } else {
          Text(this.title).fontSize(应用尺寸.字号_按钮)
            .fontColor($r('app.color.text_primary')).width('100%').textAlign(TextAlign.Start)
        }
        this.hintContent()
      }.alignItems(HorizontalAlign.Start).layoutWeight(1)
      if (this.trailingIcon === undefined) {
        DisclosureChevron({ tint: $r('app.color.text_secondary') })
      } else {
        ActionIcon({ source: this.trailingIcon, glyphSize: 24 })
      }
    }.width('100%').constraintSize({ minHeight: this.hint === '' ? 48 : 58 })
    .padding({ top: this.hint === '' ? 0 : 应用尺寸.间距_8,
      bottom: this.hint === '' ? 0 : 应用尺寸.间距_8 })
    .attributeModifier(new PressFeedback()).enabled(this.isInteractive)
    .onClick((): void => { this.activate(); })
  }
}
