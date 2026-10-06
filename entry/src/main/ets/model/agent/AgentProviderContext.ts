// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ChangeDraft } from './AgentTypes';

/** 仅接收 Provider 需要的草稿视图，不依赖 ArkUI 消息组件。 */
export interface ProviderCardDraft { fields: string[]; 状态: string; 已选中: boolean; }
export interface ProviderDraftMessage {
  卡片列表: ProviderCardDraft[];
  变更草稿列表: ChangeDraft[];
  批次结果: string;
}

interface ProviderCardDraftContext {
  index: number;
  fields: string[];
  status: string;
  selected: boolean;
}

interface ProviderDraftOperationContext {
  kind: string;
  noteId: number;
  cardId: number;
  deckId: number;
  fieldOrd: number;
  before: string;
  after: string;
}

interface ProviderChangeDraftContext {
  id: string;
  risk: string;
  summary: string;
  status: string;
  operations: ProviderDraftOperationContext[];
}

interface ProviderDraftContext {
  cards: ProviderCardDraftContext[];
  changes: ProviderChangeDraftContext[];
  executionResult: string;
  truncated: boolean;
}

interface ProviderCardStatusContext { index: number; status: string; selected: boolean; fieldCount: number; }
interface ProviderChangeStatusContext { id: string; status: string; risk: string; operationCount: number; }
interface ProviderDraftStatusContext {
  cards: ProviderCardStatusContext[];
  changes: ProviderChangeStatusContext[];
  executionResult: string;
  truncated: boolean;
}

/** 大量草稿只带身份、真实状态与数量；完整可编辑内容仍由应用消息拥有。 */
function providerDraftStatusContext(text: string): string {
  const unavailable: string = '[Application draft details unavailable; inspect current state before assuming any save.]';
  let context: ProviderDraftContext;
  try { context = JSON.parse(text.slice(text.indexOf('{'))) as ProviderDraftContext; } catch (error) {
    return unavailable;
  }
  if (context === null || !Array.isArray(context.cards) || !Array.isArray(context.changes) ||
    context.cards.length > 100 || context.changes.length > 20 ||
    typeof context.executionResult !== 'string' || context.executionResult.length > 2000) { return unavailable; }
  const summary: ProviderDraftStatusContext = { cards: [], changes: [], executionResult: context.executionResult, truncated: true };
  for (const card of context.cards) {
    if (card === null || !Array.isArray(card.fields) || typeof card.index !== 'number' ||
      typeof card.status !== 'string' || card.status.length > 40 || typeof card.selected !== 'boolean') { return unavailable; }
    summary.cards.push({ index: card.index, status: card.status, selected: card.selected, fieldCount: card.fields.length });
  }
  for (const change of context.changes) {
    if (change === null || !Array.isArray(change.operations) || typeof change.id !== 'string' || change.id.length > 160 ||
      typeof change.status !== 'string' || change.status.length > 40 || typeof change.risk !== 'string' || change.risk.length > 40) { return unavailable; }
    summary.changes.push({ id: change.id, status: change.status, risk: change.risk, operationCount: change.operations.length });
  }
  return '应用内当前草稿与执行状态（正文已移出上下文；数量仅表示原视图中保留的条目，不代表已保存）：' + JSON.stringify(summary);
}

/** 草稿语义视图有自己的额度，避免它复制到系统指令后挤掉整轮上下文；最终仍由整包预检核算。 */
export function buildProviderDraftStateContext(contexts: string[]): string {
  const recent: string[] = contexts.slice(-10);
  if (JSON.stringify(recent.join('\n')).length <= 16000) { return recent.join('\n'); }
  const summaries: string[] = [];
  for (let index: number = recent.length - 1; index >= 0; index--) {
    const summary: string = providerDraftStatusContext(recent[index]);
    if (JSON.stringify(summary + '\n' + summaries.join('\n')).length > 16000) { break; }
    summaries.unshift(summary);
  }
  return '[Application draft content summarized; older state views omitted when necessary. ' +
    'Use actual saved/execution status; omitted fields are unavailable here.]\n' + summaries.join('\n');
}

export function truncateProviderText(value: string, limit: number): string {
  if (value.length <= limit) { return value; }
  const budget: number = Math.max(0, Math.floor(limit));
  const marker: string = '\n...[context truncated by jideCards]...\n';
  if (budget <= marker.length) return value.slice(0, budget);
  const head: number = Math.ceil((budget - marker.length) / 2);
  const tail: number = budget - marker.length - head;
  return value.slice(0, head) + marker + (tail > 0 ? value.slice(-tail) : '');
}

export function buildProviderDraftContext(message: ProviderDraftMessage): string {
  if (message.卡片列表.length === 0 && message.变更草稿列表.length === 0 &&
    message.批次结果.length === 0) { return ''; }
  const cards: ProviderCardDraftContext[] = [];
  const changes: ProviderChangeDraftContext[] = [];
  let operationCount: number = 0;
  let truncated: boolean = false;
  for (let index: number = 0; index < message.卡片列表.length; index++) {
    if (cards.length >= 100) { truncated = true; break; }
    const card: ProviderCardDraft = message.卡片列表[index];
    const fields: string[] = [];
    for (const field of card.fields) {
      if (field.length > 2000) truncated = true;
      fields.push(truncateProviderText(field, 2000));
    }
    cards.push({ index: index + 1, fields: fields, status: card.状态, selected: card.已选中 });
  }
  for (const draft of message.变更草稿列表) {
    if (changes.length >= 20) { truncated = true; break; }
    const operations: ProviderDraftOperationContext[] = [];
    for (const operation of draft.operations) {
      if (operationCount >= 200) { truncated = true; break; }
      if (operation.before.length > 1000 || operation.after.length > 1000) truncated = true;
      operations.push({
        kind: operation.kind, noteId: operation.noteId, cardId: operation.cardId,
        deckId: operation.deckId, fieldOrd: operation.fieldOrd,
        before: truncateProviderText(operation.before, 1000),
        after: truncateProviderText(operation.after, 1000)
      });
      operationCount += 1;
    }
    if (draft.summary.length > 1000) truncated = true;
    changes.push({
      id: draft.id, risk: draft.risk, summary: truncateProviderText(draft.summary, 1000),
      status: draft.status, operations: operations
    });

  }
  if (message.批次结果.length > 2000) truncated = true;
  const context: ProviderDraftContext = {
    cards: cards, changes: changes,
    executionResult: truncateProviderText(message.批次结果, 2000), truncated: truncated
  };
  return `应用内当前草稿与执行状态（仅作后续对话上下文，不代表已保存）：${JSON.stringify(context)}`;
}

