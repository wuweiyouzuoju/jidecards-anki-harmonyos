// SPDX-License-Identifier: AGPL-3.0-or-later
import { PressFeedback } from '../../utils/PressFeedback';
import { FormTextAreaStyle } from '../../utils/FormTextAreaStyle';
import { PrimaryActionButton } from '../common/PrimaryActionButton';

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

  private selectOption(id: string): void {
    if (!this.isEditable() || this.clarification.selectedOptionId === id) { return; }
    this.onOptionSelected(id);
  }

  private changeSupplement(value: string): void {
    if (this.isEditable()) { this.onSupplementChanged(value); }
  }

  private continueAnswer(): void {
    if (this.isEditable() && canAnswerClarification(this.clarification)) { this.onContinue(); }
  }

  @Builder
  private answerControls(): void {
    ForEach(this.clarification.request.options, (option: AgentClarificationOption) => {
      Row({ space: 应用尺寸.间距_10 }) {
        Radio({ value: option.id, group: this.clarification.request.id })
          .checked(option.id === this.clarification.selectedOptionId)
          .width(20).height(20).margin(0).flexShrink(0)
          .radioStyle({
            checkedBackgroundColor: this.primaryBackground,
            uncheckedBorderColor: $r('app.color.text_secondary'),
            indicatorColor: $r('app.color.action_on_primary')
          })
          .accessibilityText(option.label)
          .enabled(this.isEditable())
          .onChange((checked: boolean): void => {
            if (checked) { this.selectOption(option.id); }
          })
        Column({ space: 应用尺寸.间距_4 }) {
          Row({ space: 应用尺寸.间距_8 }) {
            Text(option.label)
              .fontSize(应用尺寸.字号_正文).fontWeight(FontWeight.Medium)
              .fontColor($r('app.color.text_primary')).layoutWeight(1)
            if (option.id === this.clarification.request.recommendedOptionId) {
              Text($r('app.string.ai_agent_clarification_recommended'))
                .fontSize(应用尺寸.字号_正文_小)
                .fontColor($r('app.color.text_secondary')).flexShrink(0)
            }
          }.width('100%')
          if (option.description.length > 0) {
            Text(option.description)
              .fontSize(应用尺寸.字号_正文_小)
              .fontColor($r('app.color.text_secondary')).width('100%')
          }
        }
        .layoutWeight(1).alignItems(HorizontalAlign.Start)
      }
      .width('100%').constraintSize({ minHeight: 应用尺寸.按钮高度 })
      .padding(应用尺寸.间距_10)
      .backgroundColor(option.id === this.clarification.selectedOptionId ?
        $r('app.color.surface_page') : $r('app.color.surface_card'))
      .border({ width: 2, color: option.id === this.clarification.selectedOptionId ?
        this.primaryBackground : $r('app.color.border_input') })
      .borderRadius(应用尺寸.圆角_卡片)
      .enabled(this.isEditable())
      .attributeModifier(new PressFeedback())
      .onClick((): void => { this.selectOption(option.id); })
    }, (option: AgentClarificationOption): string => option.id)
    if (this.clarification.request.allowFreeText) {
      TextArea({
        text: this.clarification.supplementalText,
        placeholder: $r('app.string.ai_agent_clarification_supplement_hint')
      })
        .attributeModifier(new FormTextAreaStyle())
        .height(72)
        .enabled(this.isEditable())
        .onChange((value: string): void => { this.changeSupplement(value); })
    }
    if (this.clarification.state === 'submit_failed') {
      Text($r('app.string.ai_agent_clarification_submit_failed'))
        .fontSize(应用尺寸.字号_正文_小)
        .fontColor($r('app.color.error_text'))
        .width('100%')
    }
    if (this.isEditable()) {
      PrimaryActionButton({
        label: $r('app.string.ai_agent_clarification_continue'),
        tint: this.primaryBackground,
        isInteractive: this.isEditable() && canAnswerClarification(this.clarification),
        onAction: (): void => { this.continueAnswer(); }
      })
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
