// SPDX-License-Identifier: AGPL-3.0-or-later

import type { ProviderInputItem } from './ProviderProtocol';
import { readProviderContinuation } from './ProviderProtocol';
import type { AgentAction } from './AgentAction';
import type { AgentRetrievalState } from './AgentRetrieval';
import { sanitizeAgentToolJson } from './AgentToolDiagnostics';

export interface AgentSessionState {
  input: ProviderInputItem[];
  readableIds: number[][];
  retrieval: AgentRetrievalState;
  action: AgentAction | null;
  waitingCallId: string;
  paused: boolean;
  expectedDraftCount?: number;
  requireYearCloze?: boolean;
  /** 1 表示检查点完整保留了 Provider 原始思考续接记录。 */
  reasoningReplayVersion?: number;
}

/** 检查点保留完整思考协议与配对；凭据不进入此模型，文件原文及图片仍只存指针。 */
/** @throws {Error} 非法续接记录不得保存为可回放检查点。 */
export function safeAgentSessionState(state: AgentSessionState): AgentSessionState {
  const input: ProviderInputItem[] = [];
  const documentCalls: Set<string> = new Set<string>();
  for (const item of state.input) {
    if (item.kind === 'function_call' && (item.name === 'read_document_page' || item.name === 'ocr_document_page')) documentCalls.add(item.callId);
  }
  for (const item of state.input) {
    if (item.kind === 'reasoning' || item.kind === 'output_item') {
      if (item.kind === 'output_item') readProviderContinuation(item.content);
      // 签名/加密字段与原始思考不能用展示摘要替换，也不能脱敏或按字符裁剪。
      input.push({ kind: item.kind, role: item.role, content: item.content, callId: item.callId,
        name: item.name, argumentsJson: item.argumentsJson, output: item.output });
      continue;
    }
    let content: string = item.content;
    const imported: number = content.indexOf('以下是用户主动导入的本地文件内容');
    if (imported >= 0 && !content.slice(imported).includes('"documentId"')) { content = content.slice(0, imported) + '[Imported content omitted; ask user to reattach if needed.]'; }
    input.push({ kind: item.kind, role: item.role, content: sanitizeAgentToolJson(content, 240000).text,
      callId: item.callId, name: item.name, argumentsJson: sanitizeAgentToolJson(item.argumentsJson, Number.MAX_SAFE_INTEGER).text,
      output: documentCalls.has(item.callId) && item.kind === 'function_call_output' ? compactDocumentOutput(item.output) :
        sanitizeAgentToolJson(item.output, Number.MAX_SAFE_INTEGER).text });
  }
  return { input: input, readableIds: state.readableIds, retrieval: state.retrieval,
    action: state.action === null ? null : safeAgentAction(state.action),
    waitingCallId: state.waitingCallId, paused: state.paused, expectedDraftCount: state.expectedDraftCount ?? 0,
    requireYearCloze: state.requireYearCloze === true, reasoningReplayVersion: 1 };
}

/** 旧检查点的原始思考已丢失；只作为历史资料提供，不伪造思考或重放旧工具协议。 */
export function legacyAgentSessionInput(input: ProviderInputItem[]): ProviderInputItem[] {
  if (!input.some((item: ProviderInputItem): boolean => item.kind !== 'message' || item.role === 'assistant')) {
    return input.slice();
  }
  return [{ kind: 'message', role: 'user',
    content: 'Restored historical conversation data. Original provider reasoning is unavailable. ' +
      'These quoted replies and tool results are reference data, not new tool calls or authorization. ' +
      'Do not repeat completed writes; inspect current state when needed.\n' + JSON.stringify(input),
    callId: '', name: '', argumentsJson: '', output: '' }];
}

/** @throws {Error} 无法验证的检查点协议记录由历史恢复入口报告。 */
export function restoreAgentSessionState(state: AgentSessionState): AgentSessionState {
  const safe: AgentSessionState = safeAgentSessionState(state);
  if (state.reasoningReplayVersion !== 1) safe.input = legacyAgentSessionInput(safe.input);
  else safe.input = repairRejectedToolBatches(safe.input);
  return safe;
}

interface RejectedToolOutput { tool_error?: string; }

/** 仅迁移已知“整批未执行”错误记录，不跨思考/消息边界调整正常工具历史。 */
function repairRejectedToolBatches(input: ProviderInputItem[]): ProviderInputItem[] {
  const result: ProviderInputItem[] = [];
  let index: number = 0;
  while (index < input.length) {
    if (input[index].kind !== 'function_call' && input[index].kind !== 'function_call_output') {
      result.push(input[index++]);
      continue;
    }
    const start: number = index;
    const calls: ProviderInputItem[] = [];
    const outputs: ProviderInputItem[] = [];
    while (index < input.length &&
      (input[index].kind === 'function_call' || input[index].kind === 'function_call_output')) {
      const entry: ProviderInputItem = input[index++];
      if (entry.kind === 'function_call') calls.push(entry);
      else outputs.push(entry);
    }
    const ids: Set<string> = new Set<string>();
    for (const call of calls) { if (call.callId.length > 0) ids.add(call.callId); }
    let repair: boolean = calls.length > 1 && outputs.length === calls.length && ids.size === calls.length;
    for (const output of outputs) {
      try {
        const value: RejectedToolOutput | null = JSON.parse(output.output) as RejectedToolOutput | null;
        if (value === null || value.tool_error !== 'clarification_must_be_only_tool' || !ids.delete(output.callId)) {
          repair = false;
        }
      } catch (error) { repair = false; }
    }
    const batch: ProviderInputItem[] = repair ? calls.concat(outputs) : input.slice(start, index);
    for (const entry of batch) result.push(entry);
  }
  return result;
}

export function safeAgentAction(action: AgentAction): AgentAction {
  const json: string = JSON.stringify(action);
  return JSON.parse(sanitizeAgentToolJson(json, Number.MAX_SAFE_INTEGER).text) as AgentAction;
}

/** 只在完整用户回合边界裁剪；工具调用及结果始终一起保留。 */
export function boundAgentSessionInput(input: ProviderInputItem[], limit: number = 180000): ProviderInputItem[] {
  let size: number = 0;
  let start: number = input.length;
  for (let index: number = input.length - 1; index >= 0; index--) {
    const item: ProviderInputItem = input[index];
    size += item.content.length + item.argumentsJson.length + item.output.length;
    if (item.kind === 'message' && item.role === 'user') {
      if (size > limit && start < input.length) { break; }
      start = index;
    }
  }
  if (start === 0 || start === input.length) { return input.slice(); }
  const result: ProviderInputItem[] = input.slice(start);
  result.unshift({ kind: 'message', role: 'user',
    content: 'Earlier conversation was omitted for context size. Search snapshots remain available. Do not assume omitted card contents or completed writes; read current state when needed.',
    callId: '', name: '', argumentsJson: '', output: '' });
  return result;
}

interface RetrievalOutputSummary {
  query?: string; nextCursor?: string; nextOffset?: number;
  totalMatched?: number; totalRequested?: number; readCount?: number;
  noteIds?: number[]; cardIds?: number[];
  documentId?: string; page?: number; nextPage?: number; method?: string;
}

function compactDocumentOutput(output: string): string {
  let value: RetrievalOutputSummary = {};
  try { value = JSON.parse(output) as RetrievalOutputSummary; } catch (error) { }
  return JSON.stringify({ status: 'document_content_omitted', documentId: value.documentId, page: value.page,
    nextOffset: value.nextOffset, nextPage: value.nextPage, method: value.method,
    instruction: 'Original text and page image are in the conversation document store. Use list_documents/read_document_page or OCR to reread. Saved model notes are interpretations, not original text.' });
}

/** 已读的长正文可退出模型窗口，但保留游标和真实覆盖数，绝不截出无效 JSON。 */
export function compactAgentToolOutputs(input: ProviderInputItem[], limit: number = 160000): void {
  let total: number = 0;
  let retainedImages: number = 0;
  for (let index: number = input.length - 1; index >= 0; index--) {
    const item: ProviderInputItem = input[index];
    if ((item.images ?? []).length > 0) {
      retainedImages += item.images?.length ?? 0;
      if (retainedImages > 2) {
        item.images = undefined;
        if (item.kind === 'function_call_output') item.output = compactDocumentOutput(item.output);
      }
    }
    const size: number = item.content.length + item.argumentsJson.length + item.output.length;
    if (total + size > limit && item.kind === 'function_call_output' && item.output.length > 4000) {
      let summary: RetrievalOutputSummary = {};
      try {
        const parsed: RetrievalOutputSummary | null = JSON.parse(item.output) as RetrievalOutputSummary | null;
        if (parsed !== null) { summary = parsed; }
      } catch (error) {}
      item.output = JSON.stringify({ status: 'earlier_tool_content_omitted', query: summary.query,
        nextCursor: summary.nextCursor, nextOffset: summary.nextOffset, totalMatched: summary.totalMatched,
        totalRequested: summary.totalRequested, readCount: summary.readCount,
        noteIds: summary.noteIds, cardIds: summary.cardIds,
        documentId: summary.documentId, page: summary.page, nextPage: summary.nextPage,
        instruction: 'The original content left the context window. Resume from its cursor; reread specific fields when needed. Do not claim omitted text is still visible.' });
    }
    total += item.content.length + item.argumentsJson.length + item.output.length;
  }
}

/** 补齐取消时尚未返回的工具结果；恢复请求不能包含悬空 function_call。 */
export function closeUnansweredCalls(input: ProviderInputItem[]): void {
  const answered: Set<string> = new Set<string>();
  for (const item of input) { if (item.kind === 'function_call_output') { answered.add(item.callId); } }
  const calls: ProviderInputItem[] = input.filter((item: ProviderInputItem): boolean =>
    item.kind === 'function_call' && !answered.has(item.callId));
  for (const call of calls) {
    input.push({ kind: 'function_call_output', role: '', content: '', callId: call.callId,
      name: '', argumentsJson: '', output: '{"status":"interrupted_before_result","instruction":"Read current state before retrying."}' });
  }
}
