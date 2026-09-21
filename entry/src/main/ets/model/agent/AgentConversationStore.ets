// SPDX-License-Identifier: AGPL-3.0-or-later
import type { AgentHistoryMessage, AgentHistoryAudit, AgentHistoryResult, AgentConversation } from './AgentConversationTypes';

import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import type { AgentMode, AgentToolTrace, AgentToolTraceStatus, SearchSource } from './AgentTypes';
import { sanitizeAgentToolJson } from './AgentToolDiagnostics';
import type { AgentTaskSetup } from './AgentTaskContext';
import type { AgentClarificationState, AgentClarificationView } from './AgentClarification';
import { cloneAgentClarificationView } from './AgentClarification';
import { safeAgentAction } from './AgentSessionState';
import type { AgentAction } from './AgentAction';
import type { AgentTimelineBlock } from './AgentTimeline';

const STORE_NAME: string = 'jidecards_ai_agent_history';
const HISTORY_KEY: string = 'conversations_v1';
const MAX_CONVERSATIONS: number = 50;
const MAX_MESSAGES: number = 200;
const MAX_TEXT_LENGTH: number = 20000;
const MAX_AUDIT_TEXT_TOTAL: number = 200000;
const MAX_REASONING_TEXT_TOTAL: number = 200000;

interface AnalysisHistoryPayload { query: string; totalMatched: number; alreadyRead: number; }
function historyAction(action: AgentAction): AgentAction {
  const safe: AgentAction = safeAgentAction(action);
  if (safe.kind === 'analysis') {
    const payload: AnalysisHistoryPayload = JSON.parse(safe.payloadJson) as AnalysisHistoryPayload;
    safe.payloadJson = JSON.stringify({ query: payload.query, totalMatched: payload.totalMatched, alreadyRead: payload.alreadyRead });
  }
  return safe;
}

export type { AgentHistoryMessage, AgentHistoryAudit, AgentHistoryResult, AgentConversation } from './AgentConversationTypes';

function safeStringArray(values: string[] | undefined): string[] {
  if (!Array.isArray(values)) { return []; }
  const output: string[] = [];
  for (const value of values.slice(0, 100)) {
    if (typeof value === 'string') { output.push(sanitizeHistoryText(value)); }
  }
  return output;
}

function safeNumberArray(values: number[] | undefined): number[] {
  if (!Array.isArray(values)) { return []; }
  const output: number[] = [];
  for (const value of values.slice(0, 100)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      output.push(Math.max(0, Math.floor(value)));
    }
  }
  return output;
}

function emptySetup(mode: AgentMode): AgentTaskSetup {
  return {
    mode: mode, deckId: 0, deckName: '', notetypeId: 0, notetypeName: '',
    fieldNames: [], noteTypeKind: 0, clozeFieldOrds: [], expanded: true
  };
}

function safeSetup(value: AgentTaskSetup | undefined, mode: AgentMode): AgentTaskSetup {
  if (value === undefined || value === null || typeof value !== 'object') { return emptySetup(mode); }
  return {
    mode: value.mode === 'edit' ? 'edit' : mode,
    deckId: typeof value.deckId === 'number' ? Math.max(0, Math.floor(value.deckId)) : 0,
    deckName: sanitizeHistoryText(typeof value.deckName === 'string' ? value.deckName : ''),
    notetypeId: typeof value.notetypeId === 'number' ? Math.max(0, Math.floor(value.notetypeId)) : 0,
    notetypeName: sanitizeHistoryText(typeof value.notetypeName === 'string' ? value.notetypeName : ''),
    fieldNames: safeStringArray(value.fieldNames),
    noteTypeKind: typeof value.noteTypeKind === 'number' ? Math.max(0, Math.floor(value.noteTypeKind)) : 0,
    clozeFieldOrds: safeNumberArray(value.clozeFieldOrds),
    expanded: value.expanded !== false
  };
}

function safeClarificationState(value: string): AgentClarificationState {
  if (value === 'submitting' || value === 'resolved' || value === 'submit_failed' || value === 'cancelled') {
    return value;
  }
  return 'pending';
}

function safeClarification(value: AgentClarificationView | null | undefined): AgentClarificationView | null {
  if (value === null || value === undefined || value.request === undefined ||
    !Array.isArray(value.request.options)) { return null; }
  const safe: AgentClarificationView = cloneAgentClarificationView(value);
  safe.request.id = sanitizeHistoryText(safe.request.id);
  safe.request.question = sanitizeHistoryText(safe.request.question);
  safe.request.recommendedOptionId = sanitizeHistoryText(safe.request.recommendedOptionId);
  safe.selectedOptionId = sanitizeHistoryText(safe.selectedOptionId);
  safe.supplementalText = sanitizeHistoryText(safe.supplementalText);
  safe.state = safeClarificationState(safe.state);
  for (const option of safe.request.options.slice(0, 4)) {
    option.id = sanitizeHistoryText(option.id);
    option.label = sanitizeHistoryText(option.label);
    option.description = sanitizeHistoryText(option.description);
  }
  safe.request.options = safe.request.options.slice(0, 4);
  return safe;
}

function getContext(): common.UIAbilityContext | null {
  const context: common.UIAbilityContext | undefined =
    AppStorage.get<common.UIAbilityContext>('abilityContext');
  return context === undefined ? null : context;
}

async function openStore(): Promise<preferences.Preferences | null> {
  const context: common.UIAbilityContext | null = getContext();
  if (context === null) { return null; }
  try { return await preferences.getPreferences(context, STORE_NAME); } catch (error) { return null; }
}

/** 历史只保存可见文本；内联媒体、常见密钥形态和授权头会被替换。 */
export function sanitizeHistoryText(value: string): string {
  return value
    .replace(/data:[^\s]+/g, '[media omitted]')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [secret omitted]')
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, '[secret omitted]')
    .slice(0, MAX_TEXT_LENGTH);
}

function safeAuditStatus(value: string): AgentToolTraceStatus {
  if (value === 'awaiting_confirmation') { return value; }
  if (value === 'completed' || value === 'failed') { return value; }
  return 'started';
}

function safeAuditKeys(values: string[] | undefined): string[] {
  if (!Array.isArray(values)) { return []; }
  const output: string[] = [];
  for (const value of values.slice(0, 100)) {
    if (typeof value === 'string') { output.push(sanitizeHistoryText(value)); }
  }
  return output;
}

function safeAudit(audit: AgentHistoryAudit): AgentHistoryAudit {
  const legacy: boolean = typeof audit.callId !== 'string';
  const oldStatus: string = typeof audit.status === 'string' ? audit.status : '';
  const oldToolName: string = typeof audit.toolName === 'string' ? audit.toolName : '';
  const argumentsSafe = sanitizeAgentToolJson(
    typeof audit.argumentsJson === 'string' ? audit.argumentsJson : '', 8192);
  const outputSafe = sanitizeAgentToolJson(
    typeof audit.outputJson === 'string' ? audit.outputJson : '', 8192);
  const templateSafe = sanitizeAgentToolJson(
    typeof audit.validTemplateJson === 'string' ? audit.validTemplateJson : '', 4096);
  return {
    messageId: typeof audit.messageId === 'number' && Number.isFinite(audit.messageId) ? audit.messageId : undefined,
    callId: legacy ? `legacy-${oldToolName}` : sanitizeHistoryText(audit.callId),
    toolName: sanitizeHistoryText(oldToolName),
    status: legacy ? 'completed' : safeAuditStatus(oldStatus),
    providerRound: legacy ? 0 : Math.max(0, Math.floor(audit.providerRound)),
    sequence: legacy ? 0 : Math.max(0, Math.floor(audit.sequence)),
    argumentsJson: argumentsSafe.text,
    outputJson: outputSafe.text,
    errorCode: sanitizeHistoryText(typeof audit.errorCode === 'string' ? audit.errorCode : ''),
    errorPath: sanitizeHistoryText(typeof audit.errorPath === 'string' ? audit.errorPath : ''),
    errorMessage: sanitizeHistoryText(typeof audit.errorMessage === 'string' ? audit.errorMessage : ''),
    receivedKeys: safeAuditKeys(audit.receivedKeys),
    allowedKeys: safeAuditKeys(audit.allowedKeys),
    validTemplateJson: templateSafe.text,
    repeatCount: legacy ? 0 : Math.max(0, Math.floor(audit.repeatCount)),
    argumentsTruncated: argumentsSafe.truncated || audit.argumentsTruncated === true,
    outputTruncated: outputSafe.truncated || audit.outputTruncated === true,
    diagnosticTruncated: templateSafe.truncated || audit.diagnosticTruncated === true,
    expanded: false,
    legacySummary: legacy ? sanitizeHistoryText(`${oldStatus}: ${oldToolName}`) :
      sanitizeHistoryText(typeof audit.legacySummary === 'string' ? audit.legacySummary : '')
  };
}

interface SafeHistoryTimeline { blocks: AgentTimelineBlock[]; truncated: boolean; }

/** 各类可见文本分别限额，长思考不能挤掉随后正文和草稿；不恢复写入能力。 */
function safeTimeline(value: AgentTimelineBlock[] | undefined): SafeHistoryTimeline {
  if (!Array.isArray(value)) { return { blocks: [], truncated: false }; }
  const blocks: AgentTimelineBlock[] = [];
  let remainingText: number = MAX_TEXT_LENGTH;
  let remainingReasoning: number = MAX_TEXT_LENGTH;
  let remainingDraft: number = MAX_TEXT_LENGTH;
  let truncated: boolean = value.length > 1000;
  for (const block of value.slice(0, 1000)) {
    if (block === null || typeof block !== 'object' ||
      !['text', 'reasoning', 'summary', 'tool', 'source', 'draft'].includes(block.kind)) { continue; }
    const isReasoning: boolean = block.kind === 'reasoning' || block.kind === 'summary';
    const isDraft: boolean = block.kind === 'draft' || block.kind === 'tool';
    const remaining: number = isReasoning ? remainingReasoning : (isDraft ? remainingDraft : remainingText);
    const rawText: string = typeof block.text === 'string' ? block.text : '';
    const safeText: string = sanitizeHistoryText(rawText);
    const text: string = safeText.slice(0, remaining);
    truncated = truncated || rawText.length > MAX_TEXT_LENGTH || safeText.length > text.length;
    if (isReasoning) { remainingReasoning -= text.length; }
    else if (isDraft) { remainingDraft -= text.length; }
    else { remainingText -= text.length; }
    blocks.push({ id: blocks.length, kind: block.kind, text: text,
      refId: sanitizeHistoryText(typeof block.refId === 'string' ? block.refId : ''),
      toolName: sanitizeHistoryText(typeof block.toolName === 'string' ? block.toolName : ''),
      index: -1, indexes: [], images: [] });
  }
  return { blocks: blocks, truncated: truncated };
}

function safeConversation(value: AgentConversation): AgentConversation {
  const messages: AgentHistoryMessage[] = [];
  let reasoningTotal: number = 0;
  for (const message of value.messages.slice(-MAX_MESSAGES)) {
    if (message.role === 'user' || message.role === 'assistant') {
      const clarification: AgentClarificationView | null = safeClarification(message.clarification);
      const rawReasoning: string = typeof message.reasoning === 'string' ? message.reasoning : '';
      const reasoning: string = sanitizeHistoryText(rawReasoning).slice(0, MAX_REASONING_TEXT_TOTAL - reasoningTotal);
      reasoningTotal += reasoning.length;
      const timeline: SafeHistoryTimeline = safeTimeline(message.timeline);
      messages.push({
        timeline: timeline.blocks,
        timelineTruncated: message.timelineTruncated === true || timeline.truncated,
        id: typeof message.id === 'number' && Number.isFinite(message.id) ? message.id : undefined,
        reasoning: reasoning, reasoningIsSummary: message.reasoningIsSummary === true,
        reasoningTruncated: message.reasoningTruncated === true || rawReasoning.length > MAX_TEXT_LENGTH ||
          sanitizeHistoryText(rawReasoning).length > reasoning.length,
        role: message.role, text: sanitizeHistoryText(message.text),
        kind: message.kind === 'clarification' ? 'clarification' : 'normal',
        action: message.action === undefined ? undefined :
          historyAction(message.action),
        clarification: clarification,
        expanded: message.expanded === true
      });
    }
  }
  const audits: AgentHistoryAudit[] = [];
  let auditTextTotal: number = 0;
  for (const audit of value.audits.slice(-MAX_MESSAGES)) {
    const safe: AgentHistoryAudit = safeAudit(audit);
    const size: number = safe.argumentsJson.length + safe.outputJson.length + safe.errorMessage.length +
      safe.validTemplateJson.length + safe.legacySummary.length;
    if (auditTextTotal + size <= MAX_AUDIT_TEXT_TOTAL) {
      audits.push(safe);
      auditTextTotal += size;
    }
  }
  const sources: SearchSource[] = [];
  for (const source of value.sources.slice(-MAX_MESSAGES)) {
    if (source.url.startsWith('https://')) {
      sources.push({ url: source.url.slice(0, 4096), title: sanitizeHistoryText(source.title) });
    }
  }
  const results: AgentHistoryResult[] = [];
  for (const result of value.results.slice(-MAX_MESSAGES)) {
    results.push({
      draftId: sanitizeHistoryText(result.draftId), status: sanitizeHistoryText(result.status),
      succeeded: Math.max(0, Math.floor(result.succeeded)), failed: Math.max(0, Math.floor(result.failed))
    });
  }
  return {
    id: sanitizeHistoryText(value.id), mode: value.mode,
    title: sanitizeHistoryText(value.title), updatedAt: value.updatedAt,
    setup: safeSetup(value.setup, value.mode),
    messages: messages, audits: audits, sources: sources, results: results
  };
}

export async function loadAgentConversations(): Promise<AgentConversation[]> {
  const store: preferences.Preferences | null = await openStore();
  if (store === null) { return []; }
  try {
    const raw: preferences.ValueType = await store.get(HISTORY_KEY, '[]');
    if (typeof raw !== 'string') { return []; }
    const parsed: AgentConversation[] = JSON.parse(raw) as AgentConversation[];
    if (!Array.isArray(parsed)) { return []; }
    const output: AgentConversation[] = [];
    for (const value of parsed.slice(0, MAX_CONVERSATIONS)) {
      if (value !== null && typeof value === 'object' && typeof value.id === 'string' &&
        Array.isArray(value.messages) && Array.isArray(value.audits) &&
        Array.isArray(value.sources) && Array.isArray(value.results)) {
        output.push(safeConversation(value));
      }
    }
    return output;
  } catch (error) { return []; }
}

export async function saveAgentConversation(value: AgentConversation): Promise<void> {
  const store: preferences.Preferences | null = await openStore();
  if (store === null) { return; }
  const current: AgentConversation[] = await loadAgentConversations();
  const next: AgentConversation[] = [safeConversation(value)];
  for (const item of current) {
    if (item.id !== value.id && next.length < MAX_CONVERSATIONS) { next.push(item); }
  }
  await store.put(HISTORY_KEY, JSON.stringify(next));
  await store.flush();
}

export async function deleteAgentConversation(id: string): Promise<void> {
  const store: preferences.Preferences | null = await openStore();
  if (store === null) { return; }
  const current: AgentConversation[] = await loadAgentConversations();
  const next: AgentConversation[] = current.filter((item: AgentConversation): boolean => item.id !== id);
  await store.put(HISTORY_KEY, JSON.stringify(next));
  await store.flush();
}
