// SPDX-License-Identifier: AGPL-3.0-or-later
import { filteredDeckPatch } from '../FilteredDeckCommands';
import { updateBrowserPreferences } from '../BrowserPreferences';
import type { BrowserPreferencesAction } from './AgentMaintenanceActions';
import type { FilteredDeckProposal } from '../FilteredDeckCommands';
import { filteredDeckOrderTitleKey } from '../FilteredDeckOptions';
import { decode过滤牌组更新 } from '../../proto/messages/DeckMessages';
import type { 搜索条件 } from '../../proto/messages/DeckMessages';
import type { AgentAction } from './AgentAction';
import type { CollectionPreferencesAction, StudyControlsAction, ExportSubsetAction } from './AgentMaintenanceActions';
import type { StudyCommandMapping } from '../StudyControls';
import type { FsrsSimulationAction } from './AgentFsrsTools';
import type { AgentDeckOptionsAction } from './AgentDeckOptionsTools';
import { agentWritableDeckOptionFields } from './AgentDeckOptionsTools';
import { deckOptionChoices, easyDayValues, percentageText, parseDeckOptionSteps, deckOptionStepsText } from '../DeckOptionsCatalog';
export interface MaintenancePreviewRow { title: string; before: string; after: string; }
function filteredSearchPreviewRows(before: 搜索条件[], after: 搜索条件[], text: (key: string) => string): MaintenancePreviewRow[] {
  const rows: MaintenancePreviewRow[] = [];
  const count: number = Math.max(before.length, after.length);
  const unset: string = text('deck_option_unset');
  const orderText = (term: 搜索条件 | undefined): string => {
    if (term === undefined) return unset;
    const key: string = filteredDeckOrderTitleKey(term.order);
    return key === '' ? String(term.order) : text(key);
  };
  for (let index: number = 0; index < count; index++) {
    const oldTerm: 搜索条件 | undefined = before[index];
    const newTerm: 搜索条件 | undefined = after[index];
    const suffix: string = count > 1 ? ' ' + String(index + 1) : '';
    const terms: MaintenancePreviewRow[] = [
      { title: text('filtered_deck_search_label') + suffix,
        before: oldTerm === undefined ? unset : oldTerm.search.trim() === '' ? text('deck_scope_collection') : oldTerm.search,
        after: newTerm === undefined ? unset : newTerm.search.trim() === '' ? text('deck_scope_collection') : newTerm.search },
      { title: text('filtered_deck_limit_label') + suffix,
        before: oldTerm === undefined ? unset : String(oldTerm.limit), after: newTerm === undefined ? unset : String(newTerm.limit) },
      { title: text('filtered_deck_order_label') + suffix, before: orderText(oldTerm), after: orderText(newTerm) }
    ];
    for (const row of terms) {
      if (row.before === row.after) row.before = '';
      rows.push(row);
    }
  }
  return rows;
}
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
  if (action.kind === 'browser_preferences') {
    const payload: BrowserPreferencesAction = JSON.parse(action.payloadJson) as BrowserPreferencesAction;
    const after = updateBrowserPreferences(payload.before, payload.patch);
    const columnLabel = (key: string, notes: boolean): string => {
      const column = payload.columns.find((item): boolean => item.key === key);
      return column === undefined ? key : notes ? column.notesModeLabel : column.cardsModeLabel;
    };
    const columns = (keys: string[], notes: boolean): string => keys.length === 0 ? text('browser_sort_default') : keys.map((key: string): string => columnLabel(key, notes)).join(' → ');
    rows.push({ title: text('browser_title'), before: text(payload.before.mode === 'notes' ? 'browser_mode_notes' : 'browser_mode_cards'), after: text(after.mode === 'notes' ? 'browser_mode_notes' : 'browser_mode_cards') });
    rows.push({ title: text('browser_sort_default'), before: payload.before.sortColumn === '' ? text('browser_sort_default') : columnLabel(payload.before.sortColumn, payload.before.mode === 'notes'),
      after: after.sortColumn === '' ? text('browser_sort_default') : columnLabel(after.sortColumn, after.mode === 'notes') });
    rows.push({ title: text('browser_sort_direction'), before: boolean(payload.before.sortReverse), after: boolean(after.sortReverse) });
    rows.push({ title: text('browser_subtitle_deck'), before: text(payload.before.subtitleIndex === 4 ? 'browser_subtitle_answer' : payload.before.subtitleIndex === 2 ? 'browser_subtitle_due' : 'browser_subtitle_deck'),
      after: text(after.subtitleIndex === 4 ? 'browser_subtitle_answer' : after.subtitleIndex === 2 ? 'browser_subtitle_due' : 'browser_subtitle_deck') });
    rows.push({ title: text('browser_mode_cards') + ' · ' + text('browser_display_columns'), before: columns(payload.before.cardsColumns, false), after: columns(after.cardsColumns, false) });
    rows.push({ title: text('browser_mode_notes') + ' · ' + text('browser_display_columns'), before: columns(payload.before.notesColumns, true), after: columns(after.notesColumns, true) });
  } else if (action.kind === 'filtered_deck_change') {
    const payload: FilteredDeckProposal = JSON.parse(action.payloadJson) as FilteredDeckProposal;
    const before = decode过滤牌组更新(new Uint8Array(payload.before));
    const after = filteredDeckPatch(before, payload.changesJson);
    rows.push({ title: text('deck_scope_deck'), before: '', after: before.name });
    const changes: Record<string, Object> = JSON.parse(payload.changesJson) as Record<string, Object>;
    const oldValues: Record<string, Object> = JSON.parse(JSON.stringify(before.config)) as Record<string, Object>;
    const newValues: Record<string, Object> = JSON.parse(JSON.stringify(after.config)) as Record<string, Object>;
    for (const key of Object.keys(changes)) {
      if (key === 'searchTerms') {
        rows.push(...filteredSearchPreviewRows(before.config.searchTerms, after.config.searchTerms, text));
        continue;
      }
      const value = (item: Object): string => typeof item === 'boolean' ? boolean(item as boolean) :
        Array.isArray(item) ? JSON.stringify(item) : String(item);
      rows.push({ title: text('filtered_deck_' + key), before: value(oldValues[key]), after: value(newValues[key]) });
    }
  } else if (action.kind === 'deck_options_change') {
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
