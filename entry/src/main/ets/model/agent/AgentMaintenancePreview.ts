// SPDX-License-Identifier: AGPL-3.0-or-later
import type { AgentAction } from './AgentAction';
import type { CollectionPreferencesAction, StudyControlsAction, ExportSubsetAction } from './AgentMaintenanceActions';
import type { StudyCommandMapping } from '../StudyControls';
import type { FsrsSimulationAction } from './AgentFsrsTools';
import type { AgentDeckOptionsAction } from './AgentDeckOptionsTools';
import { agentWritableDeckOptionFields } from './AgentDeckOptionsTools';
import { deckOptionChoices, easyDayValues, percentageText, parseDeckOptionSteps, deckOptionStepsText } from '../DeckOptionsCatalog';
export interface MaintenancePreviewRow { title: string; before: string; after: string; }
/** 确认展示使用界面单位和选项名称，Core 参数仍留在登记的原始载荷中。 */
function deckOptionPreviewValue(key: string, value: string, fsrs: boolean, text: (key: string) => string): string {
  if (key === 'easyDaysPercentages') {
    const days = easyDayValues(value.trim() === '' ? [] : value.trim().split(/\s+/).map(Number));
    return days.map((day, index) => text('deck_weekday_' + String(index)) + ': ' +
      text(day === 1 ? 'deck_easy_day_normal' : day === 0 ? 'deck_easy_day_minimum' : 'deck_easy_day_reduced')).join('\n');
  }
  if (value.trim() === '') return text('deck_option_unset');
  if (['desiredRetention', 'historicalRetention', 'desiredRetentionOverride'].includes(key)) return percentageText(value, 4) + '%';
  const field = agentWritableDeckOptionFields().find(item => item.key === key);
  if (field?.kind === 'boolean' || field?.kind === 'global') return text(value === 'true' ? 'deck_option_on' : 'deck_option_off');
  if (field?.kind === 'enum') {
    const choice = deckOptionChoices(key, fsrs).find(item => item.value === Number(value));
    return choice === undefined ? value : text(choice.titleKey);
  }
  if (field?.kind === 'steps') {
    const steps = parseDeckOptionSteps(value);
    return steps === null ? value : deckOptionStepsText(steps);
  }
  return value;
}
export function maintenancePreviewRows(action: AgentAction, text: (key: string) => string): MaintenancePreviewRow[] {
  const rows: MaintenancePreviewRow[] = [];
  const boolean = (value: boolean): string => text(value ? 'agent_value_on' : 'agent_value_off');
  if (action.kind === 'deck_options_change') {
    const payload: AgentDeckOptionsAction = JSON.parse(action.payloadJson) as AgentDeckOptionsAction;
    rows.push({ title: text('deck_scope_deck'), before: '', after: payload.deckName });
    rows.push({ title: text('deck_preset_label'), before: '', after: payload.presetName });
    rows.push({ title: text('deck_scope_label'), before: '', after: text(payload.scope === 'preset' ? 'deck_scope_preset' : 'deck_scope_deck') +
      ' · ' + String(payload.scope === 'preset' ? payload.presetUseCount : 1) });
    for (const row of payload.preview) rows.push({title:text('deck_'+row.key+'_label'),
      before:deckOptionPreviewValue(row.key,row.before,payload.fsrsBefore,text),
      after:deckOptionPreviewValue(row.key,row.after,payload.fsrsAfter,text)});
  } else if (action.kind === 'fsrs_simulation') {
    const payload: FsrsSimulationAction = JSON.parse(action.payloadJson) as FsrsSimulationAction;
    rows.push({ title: text('agent_fsrs_scope'), before: '', after: payload.input.search });
    rows.push({ title: text('agent_fsrs_days'), before: '', after: String(payload.input.daysToSimulate) });
    rows.push({ title: text('agent_fsrs_retention'), before: '', after: String(payload.input.desiredRetention) });
    rows.push({ title: text('agent_fsrs_new_limit'), before: '', after: String(payload.input.newLimit) });
    rows.push({ title: text('agent_fsrs_review_limit'), before: '', after: String(payload.input.reviewLimit) });
  } else if (action.kind === 'collection_preferences') {
    const payload: CollectionPreferencesAction = JSON.parse(action.payloadJson) as CollectionPreferencesAction;
    const changes: Record<string, Object> = JSON.parse(payload.changesJson) as Record<string, Object>;
    const before: Record<string, Object> = JSON.parse(JSON.stringify(payload.before)) as Record<string, Object>;
    for (const key of Object.keys(changes)) {
      rows.push({ title: text('agent_advanced_' + key),
        before: typeof before[key] === 'boolean' ? boolean(before[key] as boolean) : String(before[key]),
        after: typeof changes[key] === 'boolean' ? boolean(changes[key] as boolean) : String(changes[key]) });
    }
  } else if (action.kind === 'study_controls') {
    const payload: StudyControlsAction = JSON.parse(action.payloadJson) as StudyControlsAction;
    const mapped = (items: StudyCommandMapping[]): string => items.length === 0 ? text('agent_controls_default') :
      items.map((item: StudyCommandMapping): string => text('agent_input_' + item.input) + ' → ' +
        text('agent_command_' + item.command)).join('\n');
    rows.push({ title: text('agent_controls_keep_screen'), before: boolean(payload.before.keepScreenOn), after: boolean(payload.after.keepScreenOn) });
    rows.push({ title: text('agent_controls_mode'), before: text('agent_gesture_' + payload.before.gestureMode), after: text('agent_gesture_' + payload.after.gestureMode) });
    rows.push({ title: text('agent_controls_keys'), before: mapped(payload.before.keys), after: mapped(payload.after.keys) });
    rows.push({ title: text('agent_controls_gestures'), before: mapped(payload.before.gestures), after: mapped(payload.after.gestures) });
  } else if (action.kind === 'export_subset') {
    const payload: ExportSubsetAction = JSON.parse(action.payloadJson) as ExportSubsetAction;
    rows.push({ title: text(payload.mode === 'notes' ? 'agent_export_notes' : 'agent_export_cards'), before: '', after: String(payload.ids.length) });
    rows.push({ title: text('agent_export_format'), before: '', after: payload.format === 'apkg' ? 'APKG' : text('agent_export_text') });
    if (payload.format === 'apkg') {
      rows.push({ title: text('agent_export_media'), before: '', after: boolean(payload.withMedia) });
      rows.push({ title: text('agent_export_scheduling'), before: '', after: boolean(payload.withScheduling) });
    }
  }
  return rows;
}
