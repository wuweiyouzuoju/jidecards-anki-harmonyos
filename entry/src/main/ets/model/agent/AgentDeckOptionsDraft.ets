// SPDX-License-Identifier: AGPL-3.0-or-later
import { 牌组配置表单 } from '../牌组配置表单';
import { 牌组选项编辑 } from '../牌组选项编辑';
import { prepareDeckOptionsDraft } from '../DeckOptionsDraft';
import type { DeckOptionsDraft } from '../DeckOptionsDraft';
import { applyDeckOptionEdit } from '../DeckOptionsEdit';
import { validateDeckOptionText } from '../DeckOptionValidation';
import { agentWritableDeckOptionFields } from './AgentDeckOptionsTools';
import type { AgentDeckOptionsArguments, AgentDeckOptionsPreview } from './AgentDeckOptionsTools';
import type { DeckConfigsForUpdateView } from '../../proto/messages/DeckConfigMessages';
import { buildAgentDeckSettings } from './AgentDeckSettings';
import { fsrsParams } from '../FsrsOptions';
import { compatibleNewSortOrder } from '../DeckOptionsCatalog';

export interface AgentDeckOptionsPrepared { draft: DeckOptionsDraft; preview: AgentDeckOptionsPreview[]; }
export function prepareAgentDeckOptions(view: DeckConfigsForUpdateView, args: AgentDeckOptionsArguments): AgentDeckOptionsPrepared {
  const entry = view.allConfigs.find((item): boolean => item.config.id === view.currentDeck?.configId);
  if (entry === undefined || entry.config.config === null) throw new Error('deck config not found');
  const form = 牌组配置表单.从配置创建(entry.config.config);
  const options = 牌组选项编辑.从视图创建(view.currentDeck?.limits ?? null, view.newCardsIgnoreReviewLimit, view.fsrs, view.applyAllParentLimits, view.fsrsHealthCheck);
  options.applyToSharedDecks = args.scope === 'preset';
  const before: Map<string, string> = agentDeckOptionValues(view);
  const fields = agentWritableDeckOptionFields();
  for (const change of args.changes) {
    const field = fields.find((item): boolean => item.key === change.key);
    if (field === undefined) throw new Error('invalid_deck_option_edit');
    let key: string = change.key;
    if (key === 'fsrsParameters') {
      const length: number = change.value.trim() === '' ? 0 : change.value.trim().split(/\s+/).length;
      if (![0, 17, 19, 21].includes(length)) throw new Error('deck_fsrs_parameters_validation_error');
      key = length === 17 ? 'fsrsParams4' : length === 19 ? 'fsrsParams5' : 'fsrsParams6';
    }
    if (field.kind !== 'boolean' && field.kind !== 'global') {
      const error: string = validateDeckOptionText(form, key, change.value);
      if (error !== '') throw new Error(error);
    }
    applyDeckOptionEdit(form, options, change.key, change.value, field.kind);
  }
  if (compatibleNewSortOrder(form.取配置().newCardGatherPriority, form.取配置().newCardSortOrder) !== form.取配置().newCardSortOrder) {
    throw new Error('incompatible_new_card_sort_order');
  }
  const draft = prepareDeckOptionsDraft(entry.config, form, options);
  if (draft.config === null || draft.options === null) throw new Error(draft.errorKey);
  const preview: AgentDeckOptionsPreview[] = args.changes.map((change): AgentDeckOptionsPreview =>
    ({ key: change.key, before: before.get(change.key) ?? '', after: change.value }));
  // 修改收集顺序时 Core 同款约束可能同时重置排序，确认卡必须显示这个隐含变更。
  if (draft.config.config!.newCardSortOrder !== entry.config.config.newCardSortOrder && !args.changes.some((change): boolean => change.key === 'newCardSortOrder')) {
    preview.push({ key: 'newCardSortOrder', before: String(entry.config.config.newCardSortOrder), after: String(draft.config.config!.newCardSortOrder) });
  }
  return {draft: draft, preview: preview};
}
function agentDeckOptionValues(view: DeckConfigsForUpdateView): Map<string, string> {
  const settings = view.allConfigs.find((entry): boolean => entry.config.id === view.currentDeck?.configId)!.config.config!;
  const values: Map<string, string> = new Map<string, string>();
  const readable = buildAgentDeckSettings(settings).settings;
  // 明确读取边界：只转换已声明的公开字段，不复制脚本或未知协议字节到确认展示。
  const json = JSON.parse(JSON.stringify(readable)) as Record<string, Object>;
  for (const key of Object.keys(json)) values.set(key, Array.isArray(json[key]) ? (json[key] as Object[]).join(' ') : String(json[key]));
  values.set('fsrsParameters', fsrsParams(settings).join(' '));
  values.set('fsrsEnabled', String(view.fsrs)); values.set('fsrsHealthCheck', String(view.fsrsHealthCheck)); values.set('fsrsReschedule', 'false');
  values.set('newCardsIgnoreReviewLimit', String(view.newCardsIgnoreReviewLimit)); values.set('applyAllParentLimits', String(view.applyAllParentLimits));
  values.set('newLimit', view.currentDeck?.limits?.new === null || view.currentDeck?.limits?.new === undefined ? '' : String(view.currentDeck.limits.new));
  values.set('reviewLimit', view.currentDeck?.limits?.review === null || view.currentDeck?.limits?.review === undefined ? '' : String(view.currentDeck.limits.review));
  values.set('newToday', view.currentDeck?.limits?.newTodayActive ? String(view.currentDeck.limits.newToday ?? '') : '');
  values.set('reviewToday', view.currentDeck?.limits?.reviewTodayActive ? String(view.currentDeck.limits.reviewToday ?? '') : '');
  values.set('desiredRetentionOverride', view.currentDeck?.limits?.desiredRetention === null || view.currentDeck?.limits?.desiredRetention === undefined ? '' : String(view.currentDeck.limits.desiredRetention));
  return values;
}
