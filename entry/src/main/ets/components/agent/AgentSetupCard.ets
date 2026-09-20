// SPDX-License-Identifier: AGPL-3.0-or-later
import { SelectStyle } from '../../utils/SelectStyle';

import type { AgentMode } from '../../model/agent/AgentTypes';
import type { AgentTaskSetup } from '../../model/agent/AgentTaskContext';
import { 应用尺寸 } from '../../utils/应用尺寸';

export interface AgentSetupChoice {
  id: number;
  name: string;
}

interface AgentSelectOption { value: string; }

@Component
export struct AgentSetupCard {
  @Prop mode: AgentMode = 'create';
  @Prop setup: AgentTaskSetup;
  @Prop deckOptions: AgentSetupChoice[] = [];
  @Prop notetypeOptions: AgentSetupChoice[] = [];
  @Prop editContext: string = '';
  @Prop allDecksLabel: string = '';
  @Prop allNotetypesLabel: string = '';
  @Prop disabled: boolean = false;
  onDeckSelected: (id: number) => void = (_id: number): void => {};
  onNotetypeSelected: (id: number) => void = (_id: number): void => {};

  private editDeckOptions(): AgentSelectOption[] {
    const output: AgentSelectOption[] = [{ value: this.allDecksLabel }];
    for (const item of this.deckOptions) { output.push({ value: item.name }); }
    return output;
  }

  private editNotetypeOptions(): AgentSelectOption[] {
    const output: AgentSelectOption[] = [{ value: this.allNotetypesLabel }];
    for (const item of this.notetypeOptions) { output.push({ value: item.name }); }
    return output;
  }

  @Builder
  private setupContent(): void {
    if (this.mode === 'create') {
      Row() {
        Text($r('app.string.ai_card_target_deck')).layoutWeight(1)
        Select(this.deckOptions.map((item: AgentSetupChoice): AgentSelectOption => ({ value: item.name })))
          .selected(this.deckOptions.findIndex((item: AgentSetupChoice): boolean =>
            item.id === this.setup.deckId))
          .value(this.setup.deckName)
          .enabled(!this.disabled)
          .attributeModifier(new SelectStyle())
          .font(SelectStyle.controlFont)
          .borderRadius(SelectStyle.controlRadius)
          .onSelect((index: number): void => {
            if (index >= 0 && index < this.deckOptions.length) {
              this.onDeckSelected(this.deckOptions[index].id);
            }
          })
      }.width('100%')
      Row() {
        Text($r('app.string.add_note_notetype')).layoutWeight(1)
        Select(this.notetypeOptions.map((item: AgentSetupChoice): AgentSelectOption => ({ value: item.name })))
          .selected(this.notetypeOptions.findIndex((item: AgentSetupChoice): boolean =>
            item.id === this.setup.notetypeId))
          .value(this.setup.notetypeName)
          .enabled(!this.disabled)
          .attributeModifier(new SelectStyle())
          .font(SelectStyle.controlFont)
          .borderRadius(SelectStyle.controlRadius)
          .onSelect((index: number): void => {
            if (index >= 0 && index < this.notetypeOptions.length) {
              this.onNotetypeSelected(this.notetypeOptions[index].id);
            }
          })
      }.width('100%')
    } else {
      Row() {
        Text($r('app.string.ai_card_target_deck')).layoutWeight(1)
        Select(this.editDeckOptions())
          .selected(this.setup.deckId <= 0 ? 0 : 1 + this.deckOptions.findIndex(
            (item: AgentSetupChoice): boolean => item.id === this.setup.deckId))
          .value(this.setup.deckId <= 0 ? this.allDecksLabel : this.setup.deckName)
          .enabled(!this.disabled)
          .attributeModifier(new SelectStyle())
          .font(SelectStyle.controlFont)
          .borderRadius(SelectStyle.controlRadius)
          .onSelect((index: number): void => {
            if (index === 0) { this.onDeckSelected(0); }
            else if (index > 0 && index <= this.deckOptions.length) {
              this.onDeckSelected(this.deckOptions[index - 1].id);
            }
          })
      }.width('100%')
      Row() {
        Text($r('app.string.add_note_notetype')).layoutWeight(1)
        Select(this.editNotetypeOptions())
          .selected(this.setup.notetypeId <= 0 ? 0 : 1 + this.notetypeOptions.findIndex(
            (item: AgentSetupChoice): boolean => item.id === this.setup.notetypeId))
          .value(this.setup.notetypeId <= 0 ? this.allNotetypesLabel : this.setup.notetypeName)
          .enabled(!this.disabled)
          .attributeModifier(new SelectStyle())
          .font(SelectStyle.controlFont)
          .borderRadius(SelectStyle.controlRadius)
          .onSelect((index: number): void => {
            if (index === 0) { this.onNotetypeSelected(0); }
            else if (index > 0 && index <= this.notetypeOptions.length) {
              this.onNotetypeSelected(this.notetypeOptions[index - 1].id);
            }
          })
      }.width('100%')
      Text(this.editContext)
        .fontSize(应用尺寸.字号_正文_小)
        .fontColor($r('app.color.text_secondary'))
        .width('100%')
    }
  }

  build() {
    Column({ space: 应用尺寸.间距_10 }) {
      this.setupContent()
    }
    .alignItems(HorizontalAlign.Start)
    .backgroundColor($r('app.color.surface_card'))
    .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
    .borderRadius(应用尺寸.圆角_面板)
    .padding(应用尺寸.卡片内边距)
    .width('100%')
  }
}
