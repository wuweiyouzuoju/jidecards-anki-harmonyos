import { DirectorySelect } from '../common/DirectorySelect';
import { DirectoryRow, DirectoryView, DirectoryChoice, directoryChoiceRows, directorySpecial } from '../../model/DirectoryTree';
import { appInterface } from '../../backend/AppInterfaceService';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { noteTypeText } from '../../utils/NoteTypeText';
import { SurfaceBorder } from '../../utils/SurfaceBorder';
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

  private deckRows(): DirectoryRow[] {
    const rows: DirectoryRow[] = directoryChoiceRows(this.deckOptions.map((item: AgentSetupChoice): DirectoryChoice =>
      ({ id: String(item.id), path: item.name })), String(this.setup.deckId));
    return this.mode === 'create' ? rows : [directorySpecial('0', this.allDecksLabel, this.setup.deckId <= 0 ? 1 : 0)].concat(rows);
  }
  private selectDeck(id: string): void {
    if (this.disabled) return;
    const value: number = Number(id);
    if (id === '0' && this.mode !== 'create') this.onDeckSelected(0);
    else if (this.deckOptions.some((item: AgentSetupChoice): boolean => String(item.id) === id)) this.onDeckSelected(value);
  }
  @Builder
  private deckSelector() {
    DirectorySelect({ label: $r('app.string.ai_card_target_deck'), rows: this.deckRows(),
      value: this.mode !== 'create' && this.setup.deckId <= 0 ? this.allDecksLabel : this.setup.deckName,
      isInteractive: !this.disabled, onSelect: (id: string): void => { this.selectDeck(id); },
      onViewChanged: (view: DirectoryView | null): void => { appInterface.observeDirectory('agent_target_deck', view); } })
  }

  private editNotetypeOptions(): AgentSelectOption[] {
    const output: AgentSelectOption[] = [{ value: this.allNotetypesLabel }];
    for (const item of this.notetypeOptions) { output.push({ value: noteTypeText(this.getUIContext(), item.name) }); }
    return output;
  }

  @Builder
  private setupContent(): void {
    if (this.mode === 'create') {
      this.deckSelector()
      Row() {
        Text($r('app.string.add_note_notetype')).layoutWeight(1)
        Select(this.notetypeOptions.map((item: AgentSetupChoice): AgentSelectOption => ({ value: noteTypeText(this.getUIContext(), item.name) })))
          .selected(this.notetypeOptions.findIndex((item: AgentSetupChoice): boolean =>
            item.id === this.setup.notetypeId))
          .value(noteTypeText(this.getUIContext(), this.setup.notetypeName))
          .enabled(!this.disabled)
          .attributeModifier(new SelectStyle())
          .height(SelectStyle.controlHeight)
          .padding(SelectStyle.controlPadding)
          .space(SelectStyle.controlSpace)
          .width(SelectStyle.fieldWidth)
          .constraintSize(SelectStyle.fieldConstraint).flexShrink(0)
          .font(SelectStyle.controlFont)
          .optionFont(SelectStyle.optionFont)
          .selectedOptionFont(SelectStyle.selectedOptionFont)
          .textModifier(SelectStyle.labelText())
          .border(SelectStyle.controlBorder).borderRadius(SelectStyle.controlRadius)
          .onSelect((index: number): void => {
            if (index >= 0 && index < this.notetypeOptions.length) {
              this.onNotetypeSelected(this.notetypeOptions[index].id);
            }
          })
      }.width('100%')
    } else {
      this.deckSelector()
      Row() {
        Text($r('app.string.add_note_notetype')).layoutWeight(1)
        Select(this.editNotetypeOptions())
          .selected(this.setup.notetypeId <= 0 ? 0 : 1 + this.notetypeOptions.findIndex(
            (item: AgentSetupChoice): boolean => item.id === this.setup.notetypeId))
          .value(this.setup.notetypeId <= 0 ? this.allNotetypesLabel : noteTypeText(this.getUIContext(), this.setup.notetypeName))
          .enabled(!this.disabled)
          .attributeModifier(new SelectStyle())
          .height(SelectStyle.controlHeight)
          .padding(SelectStyle.controlPadding)
          .space(SelectStyle.controlSpace)
          .width(SelectStyle.fieldWidth)
          .constraintSize(SelectStyle.fieldConstraint).flexShrink(0)
          .font(SelectStyle.controlFont)
          .optionFont(SelectStyle.optionFont)
          .selectedOptionFont(SelectStyle.selectedOptionFont)
          .textModifier(SelectStyle.labelText())
          .border(SelectStyle.controlBorder).borderRadius(SelectStyle.controlRadius)
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
    .border(SurfaceBorder.options())
    .borderRadius(应用尺寸.圆角_面板)
    .padding(应用尺寸.卡片内边距)
    .width('100%')
  }
}
