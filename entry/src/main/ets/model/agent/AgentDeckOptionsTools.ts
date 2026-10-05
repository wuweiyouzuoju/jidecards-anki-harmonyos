// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ProviderFunctionTool } from './ProviderProtocol';
import { DECK_OPTION_GROUPS } from '../DeckOptionsCatalog';
import type { DeckOptionDefinition } from '../DeckOptionsCatalog';
import type { DeckConfigsForUpdateView } from '../../proto/messages/DeckConfigMessages';
import { encodeDeckConfig } from '../../proto/messages/DeckConfigMessages';

export interface AgentDeckOptionEdit { key: string; value: string; }
export interface AgentDeckOptionsArguments { deckId: number; scope: string; changes: AgentDeckOptionEdit[]; }
export interface AgentDeckOptionsPreview { key: string; before: string; after: string; }
export interface AgentDeckOptionsAction extends AgentDeckOptionsArguments {
  before: string;
  deckName: string;
  presetName: string;
  presetUseCount: number;
  fsrsBefore: boolean;
  fsrsAfter: boolean;
  preview: AgentDeckOptionsPreview[];
}
const OVERRIDES: DeckOptionDefinition[] = ['newLimit','reviewLimit','newToday','reviewToday','desiredRetentionOverride']
  .map(key => ({ key, kind:'number', scheduler:'', titleKey:'deck_'+key+'_label', helpKey:'deck_'+key+'_help' }));
export function agentWritableDeckOptionFields(): DeckOptionDefinition[] {
  return DECK_OPTION_GROUPS.flatMap(group => group.fields).filter(field => field.kind !== 'unsupported').concat(OVERRIDES);
}
export function agentDeckOptionsFunctionTools(): ProviderFunctionTool[] {
  return [{ name:'propose_update_deck_options', description:'修改已发现牌组的学习选项，包括轻松日、上限、步幅、FSRS、显示顺序、计时、音频及自动前进。展示前后值和共享范围，确认后直接写入 Anki Core，无需跳转页面手动设置。',
    parametersJson:JSON.stringify({type:'object',properties:{deckId:{type:'integer',minimum:1},scope:{type:'string',enum:['preset','deck']},
      changes:{type:'array',minItems:1,maxItems:50,items:{type:'object',properties:{key:{type:'string',enum:agentWritableDeckOptionFields().map(field=>field.key)},
        value:{type:'string',maxLength:4000}},required:['key','value'],additionalProperties:false}}},required:['deckId','scope','changes'],additionalProperties:false}),
    exampleArgumentsJson:'{"deckId":1,"scope":"preset","changes":[{"key":"easyDaysPercentages","value":"1 1 1 1 1 0.5 0"}]}',
    rules:'Call alone after get_deck_options for a discovered deck ID. This creates an exact change proposal; user confirmation writes through the same deck-option session as the UI. ' +
      'scope=preset updates the shared preset and affects every deck using it; scope=deck clones the preset only when preset values change. Per-deck overrides remain deck-specific; global switches remain collection-wide in both scopes. ' +
      'Values are strings in Core units: desiredRetention and historicalRetention are fractions (0.90, not 90); SM-2 ease and multipliers are factors; booleans are true/false; learning steps support s/m/h/d or bare minutes. ' +
      'easyDaysPercentages is exactly seven space-separated values in Monday-to-Sunday order: 1 Normal, 0.5 Reduced, 0 Minimum. Easy Days work with both SM-2 and FSRS and normally affect future intervals. ' +
      'For overrides newLimit/reviewLimit/newToday/reviewToday/desiredRetentionOverride, blank clears the override and 0 daily limit disables cards. Empty FSRS parameters use Core defaults. ' +
      'Unknown fields, custom scheduling scripts, preset deletion and raw RPC are not accepted. Unspecified values and opaque protocol fields are preserved. Stale proposals fail. Do not report saved until the confirmation result is completed.' }];
}
export function decodeAgentDeckOptionsArguments(json: string): AgentDeckOptionsArguments {
  const raw = JSON.parse(json) as AgentDeckOptionsArguments;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key=>!['deckId','scope','changes'].includes(key)) ||
    !Number.isSafeInteger(raw.deckId) || raw.deckId <= 0 || !['preset','deck'].includes(raw.scope) || !Array.isArray(raw.changes) || raw.changes.length < 1 || raw.changes.length > 50) throw new Error('invalid_deck_options_arguments');
  const fields = agentWritableDeckOptionFields(); const seen = new Set<string>();
  for (const edit of raw.changes) {
    if (edit === null || typeof edit !== 'object' || Array.isArray(edit) || Object.keys(edit).length !== 2 || !Object.keys(edit).includes('key') || !Object.keys(edit).includes('value') ||
      typeof edit.key !== 'string' || typeof edit.value !== 'string' || edit.value.length > 4000 || seen.has(edit.key)) throw new Error('invalid_deck_option_edit');
    const field = fields.find(item=>item.key===edit.key);
    if (field === undefined || ((field.kind === 'global' || field.kind === 'boolean') && !['true','false'].includes(edit.value))) throw new Error('invalid_deck_option_edit');
    if (field.kind === 'week' && (edit.value.trim().split(/\s+/).length !== 7 || edit.value.trim().split(/\s+/).some(value=>!['0','0.5','1'].includes(value)))) throw new Error('invalid_easy_days');
    seen.add(edit.key);
  }
  return {deckId:raw.deckId,scope:raw.scope,changes:raw.changes.map(edit=>({key:edit.key,value:edit.value}))};
}
/** 当前预设、牌组覆盖及集合开关共同构成确认依据；不把 opaque 字节发给模型。 */
export function agentDeckOptionsFingerprint(view: DeckConfigsForUpdateView): string {
  const selected = view.allConfigs.find(entry=>entry.config.id===view.currentDeck?.configId);
  if (selected === undefined || selected.config.config === null || view.currentDeck === null) throw new Error('deck config not found');
  return JSON.stringify({config:Array.from(encodeDeckConfig(selected.config)),useCount:selected.useCount,currentDeck:view.currentDeck,
    fsrs:view.fsrs,healthCheck:view.fsrsHealthCheck,newCardsIgnoreReviewLimit:view.newCardsIgnoreReviewLimit,applyAllParentLimits:view.applyAllParentLimits,
    cardStateCustomizer:view.cardStateCustomizer});
}
