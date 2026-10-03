// SPDX-License-Identifier: AGPL-3.0-or-later

import type { AgentCardStyle } from '../../model/agent/AgentCardStyle';
import { 应用尺寸 } from '../../utils/应用尺寸';

/** Appearance samples only: imported templates may have their own inner element styles. */
@Component
export struct AgentStylePreview {
  @Prop style: AgentCardStyle = {};
  @Prop sampleText: ResourceStr = $r('app.string.ai_agent_style_sample');
  @Prop showHint: boolean = true;

  private alignment(): TextAlign {
    if (this.style.textAlign === 'left') { return TextAlign.Start; }
    if (this.style.textAlign === 'right') { return TextAlign.End; }
    return TextAlign.Center;
  }

  @Builder
  private sample(dark: boolean) {
    Text(this.sampleText)
      .fontSize(this.style.fontSize ?? 应用尺寸.字号_正文)
      .lineHeight((this.style.fontSize ?? 应用尺寸.字号_正文) * (this.style.lineHeight ?? 1.5))
      .textAlign(this.alignment())
      .fontColor(dark ? (this.style.darkTextColor ?? this.style.textColor ?? '#E6E6E6') :
        (this.style.textColor ?? '#1A1A1A'))
      .width('100%').padding(应用尺寸.卡片内边距)
      .backgroundColor(dark ? (this.style.darkBackgroundColor ?? this.style.backgroundColor ?? '#18202B') :
        (this.style.backgroundColor ?? '#FFFFFF'))
      .borderRadius(应用尺寸.圆角_卡片)
  }

  build() {
    Column({ space: 应用尺寸.间距_8 }) {
      if (this.showHint) {
        Text($r('app.string.ai_agent_style_preview_hint'))
          .fontSize(应用尺寸.字号_正文_小).fontColor($r('app.color.text_secondary')).width('100%')
      }
      this.sample(false)
      if (this.style.darkBackgroundColor !== undefined || this.style.darkTextColor !== undefined) {
        Text($r('app.string.ai_agent_style_dark')).fontSize(应用尺寸.字号_正文_小).width('100%')
        this.sample(true)
      }
    }.width('100%')
  }
}
