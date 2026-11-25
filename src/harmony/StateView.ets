// SPDX-License-Identifier: AGPL-3.0-or-later
import { UiTokens } from '../core/UiTokens';
import { themePalette } from '../core/Theme';
import { ActionButton } from './ActionButton';

@Component
export struct StateView {
  @Prop loading: boolean = false;
  @Prop title: string = '';
  @Prop description: string = '';
  @Prop actionLabel: string = '';
  @Prop isDark: boolean = false;
  @Prop motionStyle: string = 'restrained';
  onAction: (() => void) | undefined = undefined;

  build() {
    Column({ space: UiTokens.sectionGap }) {
      if (this.loading) { LoadingProgress().width(32).height(32) }
      Text(this.title).fontSize(UiTokens.titleSize).fontColor(themePalette(this.isDark).text)
        .textAlign(TextAlign.Center)
      if (this.description.length > 0) {
        Text(this.description).fontSize(UiTokens.bodySize)
          .fontColor(themePalette(this.isDark).secondaryText).textAlign(TextAlign.Center)
      }
      if (!this.loading && this.actionLabel.length > 0 && this.onAction !== undefined) {
        ActionButton({ label: this.actionLabel, isDark: this.isDark,
          motionStyle: this.motionStyle, onAction: this.onAction })
      }
    }
    .width('100%').padding(UiTokens.surfaceInset)
    .alignItems(HorizontalAlign.Center).justifyContent(FlexAlign.Center)
  }
}
