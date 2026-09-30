// SPDX-License-Identifier: AGPL-3.0-or-later
import { PressFeedback } from '../../utils/PressFeedback';

import type { AgentClarificationOption, AgentClarificationView } from '../../model/agent/AgentClarification';
import { canAnswerClarification } from '../../model/agent/AgentClarification';
import { 应用尺寸 } from '../../utils/应用尺寸';
import { 颜色键 } from '../../model/颜色主题';
import { parseAgentBoldRuns, AgentTextRun } from '../../model/agent/AgentTextFormatting';

/** 澄清以普通问题呈现；提交后只保留问题，回答由独立用户消息承载。 */
@Component
export struct AgentClarificationCard {
  @Prop clarification: AgentClarificationView;
  @Prop noticeText: string = '';
  @StorageProp(颜色键.主色按钮背景) private primaryBackground: string = '#2F5FD0';
  onOptionSelected: (id: string) => void = (_id: string): void => {};
  onSupplementChanged: (value: string) => void = (_value: string): void => {};
  onContinue: () => void = (): void => {};

  private isEditable(): boolean {
    return this.clarification.state === 'pending' ||
      this.clarification.state === 'submit_failed';
  }

  @Builder
  private answerControls(): void {
    ForEach(this.clarification.request.options, (option: AgentClarificationOption) => {
      Row({ space: 应用尺寸.间距_5 }) {
        Button(option.label)
          .enabled(this.isEditable())
          .backgroundColor(option.id === this.clarification.selectedOptionId ?
            this.primaryBackground : $r('app.color.surface_card'))
          .fontColor(option.id === this.clarification.selectedOptionId ?
            $r('app.color.action_on_primary') : $r('app.color.text_primary'))
          .attributeModifier(new PressFeedback())
          .stateEffect(false)
          .onClick((): void => { this.onOptionSelected(option.id); })
        if (option.id === this.clarification.request.recommendedOptionId) {
          Text($r('app.string.ai_agent_clarification_recommended'))
            .fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.text_secondary'))
        }
      }.width('100%')
      if (option.description.length > 0) {
        Text(option.description)
          .fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.text_secondary'))
          .width('100%')
      }
    }, (option: AgentClarificationOption): string => option.id)
    if (this.clarification.request.allowFreeText) {
      TextArea({
        text: this.clarification.supplementalText,
        placeholder: $r('app.string.ai_agent_clarification_supplement_hint')
      })
        .enabled(this.isEditable())
        .onChange((value: string): void => { this.onSupplementChanged(value); })
    }
    if (this.clarification.state === 'submit_failed') {
      Text($r('app.string.ai_agent_clarification_submit_failed'))
        .fontSize(应用尺寸.字号_正文_小)
        .fontColor($r('app.color.error_text'))
        .width('100%')
    }
    if (this.isEditable()) {
      Button($r('app.string.ai_agent_clarification_continue'))
        .width('100%')
        .enabled(canAnswerClarification(this.clarification))
        .height(应用尺寸.按钮高度).fontSize(应用尺寸.字号_按钮)
        .backgroundColor(this.primaryBackground).fontColor($r('app.color.action_on_primary'))
        .borderRadius(应用尺寸.圆角_胶囊)
        .attributeModifier(new PressFeedback())
        .stateEffect(false)
        .onClick((): void => { this.onContinue(); })
    }
  }

  build() {
    Column({ space: 应用尺寸.间距_10 }) {
      Text() {
        ForEach(parseAgentBoldRuns(this.clarification.request.question), (run: AgentTextRun) => {
          Span(run.text).fontWeight(run.bold ? FontWeight.Bold : FontWeight.Normal)
        })
      }
        .fontSize(应用尺寸.字号_正文)
        .fontColor($r('app.color.text_primary'))
        .width('100%')
      if (this.isEditable()) { this.answerControls(); }
      if (this.noticeText.length > 0) {
        Text(this.noticeText).fontSize(应用尺寸.字号_正文_小)
          .fontColor($r('app.color.error_text')).width('100%')
      }
    }
    .width('100%').alignItems(HorizontalAlign.Start)
    .padding(应用尺寸.卡片内边距)
    .backgroundColor($r('app.color.surface_card'))
    .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
    .borderRadius(应用尺寸.圆角_面板)
  }
}
