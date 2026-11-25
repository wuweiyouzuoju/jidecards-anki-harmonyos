// SPDX-License-Identifier: AGPL-3.0-or-later
import { UiTokens } from '../core/UiTokens';
import { activateAction } from '../core/Motion';
import { themePalette } from '../core/Theme';
import { FoundationPressFeedback } from './PressFeedback';

@Component
export struct ActionButton {
  @Prop label: string = '';
  @Prop isEnabled: boolean = true;
  @Prop busy: boolean = false;
  @Prop isDark: boolean = false;
  @Prop motionStyle: string = 'restrained';
  onAction: (() => void) | undefined = undefined;

  build() {
    Button({ type: ButtonType.Normal }) {
      Text(this.label).fontSize(UiTokens.controlSize)
        .fontColor(themePalette(this.isDark).action).textAlign(TextAlign.Center)
    }
    .constraintSize({ minHeight: UiTokens.controlHeight, maxWidth: '100%' })
    .padding({ left: UiTokens.surfaceInset, right: UiTokens.surfaceInset, top: 8, bottom: 8 })
    .backgroundColor(themePalette(this.isDark).surface)
    .border({ width: 1, color: themePalette(this.isDark).border })
    .borderRadius(UiTokens.controlRadius)
    .stateEffect(false)
    .attributeModifier(new FoundationPressFeedback(this.motionStyle))
    .enabled(this.isEnabled && !this.busy)
    .accessibilityText(this.label)
    .onClick((): void => { activateAction(this.isEnabled, this.busy, this.onAction); })
  }
}
