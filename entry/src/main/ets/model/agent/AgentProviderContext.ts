// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ChangeDraft } from './AgentTypes';
import type { ProviderInputItem } from './ProviderProtocol';

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

export function limitProviderInput(values: ProviderInputItem[]): ProviderInputItem[] {
  const output: ProviderInputItem[] = [];
  let totalChars: number = 0;
  for (let index: number = values.length - 1; index >= 0; index--) {
    if (output.length >= 80 || totalChars >= 240000) { break; }
    const source: ProviderInputItem = values[index];
    const remaining: number = 240000 - totalChars;
    if (remaining <= 0) { break; }
    const content: string = truncateProviderText(source.content, remaining);
    output.unshift({
      kind: source.kind, role: source.role, content: content,
      callId: source.callId, name: source.name,
      argumentsJson: source.argumentsJson, output: source.output
    });
    totalChars += content.length;
  }
  return output;
}

