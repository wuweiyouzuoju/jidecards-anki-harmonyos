// SPDX-License-Identifier: AGPL-3.0-or-later

import type {
  AgentEvent,
  AgentEventKind,
  AgentToolCall,
  AgentToolDiagnostic,
  AgentToolTrace,
  AgentTurnLimits,
  ChangeDraft,
  ProviderId
} from '../../model/agent/AgentTypes';
import {
  DEFAULT_AGENT_TURN_LIMITS
} from '../../model/agent/AgentTypes';
import {
  enforceSearchExecution,
  enforceSearchEvidence,
  registerToolCallId
} from '../../model/agent/AgentPolicy';
import type { ProviderCapabilities } from '../../model/agent/AgentTypes';
import { compactAgentToolOutputs } from '../../model/agent/AgentSessionState';
import type { ProviderInputImage } from '../../model/agent/ProviderProtocol';
import { readProviderContinuation, hasProviderReasoningText } from '../../model/agent/ProviderProtocol';
import type { ResponsesOpaqueOutputInput } from '../../model/agent/ProviderProtocol';
import { buildAgentRuntimeInstructions } from '../../model/agent/AgentSessionContext';
import { agentWebResultSources } from '../../model/agent/AgentWeb';
import {
  DEEPSEEK_PROVIDER,
  OPENAI_PROVIDER,
  customProviderDefaults
} from '../../model/agent/ProviderCatalog';
import type { AgentSearchSourceEvent } from '../../model/agent/AgentPolicy';
import type {
  ProviderInputItem,
  ProviderFunctionTool,
  ProviderTurnRequest
} from '../../model/agent/ProviderProtocol';
import { AgentStreamObserver, AgentTransportError, AgentTransportSession } from './AgentTransport';
import { DeepSeekAdapter } from './DeepSeekAdapter';
import { OpenAIAdapter } from './OpenAIAdapter';
import { CustomAdapter } from './CustomAdapter';
import { AgentToolRegistry } from './AgentToolRegistry';
import type { AgentToolResult } from './AgentToolRegistry';
import { AgentToolSchemaError } from '../../model/agent/AgentToolSchemas';
import { 后端错误 } from '../错误类型';
import type { AgentAction } from '../../model/agent/AgentAction';
import type { AgentClarificationRequest } from '../../model/agent/AgentClarification';
import type { AgentToolFailureRecord } from '../../model/agent/AgentToolDiagnostics';
import {
  AgentToolFailureTracker,
  completeAgentToolTrace,
  createStartedAgentToolTrace,
  failAgentToolTrace,
  sanitizeAgentToolJson
} from '../../model/agent/AgentToolDiagnostics';

export interface AgentRunObserver {
  onEvent(event: AgentEvent): void;
}

export type AgentRunStatus = 'completed' | 'awaiting_clarification' | 'awaiting_confirmation' | 'paused';

export interface AgentRunResult {
  action?: AgentAction;
  status: AgentRunStatus;
  clarification: AgentClarificationRequest | null;
  drafts: ChangeDraft[];
  providerCalls: number;
  toolCalls: number;
}

export class AgentRunnerError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

function simpleEvent(kind: AgentEventKind, text: string = '', errorCode: string = ''): AgentEvent {
  return { kind: kind, text: text, toolCall: null, toolTrace: null, source: null, errorCode: errorCode };
}

function toolStatusEvent(kind: 'tool_started' | 'tool_completed' | 'tool_failed',
  call: AgentToolCall, trace: AgentToolTrace, errorCode: string = ''): AgentEvent {
  return { kind: kind, text: '', toolCall: call, toolTrace: trace, source: null, errorCode: errorCode };
}

interface AgentToolErrorOutput {
  failureStage: string;
  tool_error: string;
  errorPath: string;
  message: string;
  receivedKeys: string[];
  allowedKeys: string[];
  validTemplateJson: string;
  repeatCount: number;
  correction: string;
}

function toolErrorCode(error: Object): string {
  if (error instanceof 后端错误) { return 'backend_error'; }
  if (error instanceof Error && /^[a-z0-9_]{1,64}$/.test(error.message)) { return error.message; }
  return 'tool_failed';
}

function toolTemplate(request: ProviderTurnRequest, toolName: string): string {
  for (const tool of request.functionTools) {
    if (tool.name === toolName) { return tool.exampleArgumentsJson; }
  }
  return '{}';
}

function isToolDeclared(request: ProviderTurnRequest, toolName: string): boolean {
  for (const tool of request.functionTools) {
    if (tool.name === toolName) { return true; }
  }
  return false;
}

function undeclaredToolDiagnostic(request: ProviderTurnRequest,
  call: AgentToolCall): AgentToolDiagnostic {
  const declaredNames: string[] = [];
  for (const tool of request.functionTools) { declaredNames.push(tool.name); }
  return {
    code: 'tool_not_declared', path: 'name',
    message: `The tool ${call.name} is not available in this turn. Available tools: ${declaredNames.join(', ')}.`,
    receivedKeys: [call.name], allowedKeys: declaredNames, validTemplateJson: '{}'
  };
}

function diagnosticForError(error: Object, call: AgentToolCall,
  request: ProviderTurnRequest): AgentToolDiagnostic {
  let receivedKeys: string[] = [];
  let allowedKeys: string[] = [];
  try {
    const args: Object = JSON.parse(call.argumentsJson) as Object;
    if (args !== null && typeof args === 'object' && !Array.isArray(args)) { receivedKeys = Object.keys(args); }
  } catch (parseError) { /* Invalid JSON is reported by the argument decoder. */ }
  for (const tool of request.functionTools) {
    if (tool.name !== call.name) { continue; }
    try {
      const schema: ToolDiagnosticSchema = JSON.parse(tool.parametersJson) as ToolDiagnosticSchema;
      if (schema.properties !== undefined) { allowedKeys = Object.keys(schema.properties); }
    } catch (parseError) { /* Preserve the original failure if a provider schema is unavailable. */ }
  }
  if (error instanceof AgentToolSchemaError) {
    const schemaDiagnostic: AgentToolDiagnostic = error.diagnostic();
    const stage: string = ['invalid_json', 'invalid_type', 'invalid_value', 'unexpected_property',
      'missing_property', 'invalid_tool_arguments'].indexOf(schemaDiagnostic.code) >= 0 ? 'arguments' : 'execution';
    return {
      stage: stage,
      code: schemaDiagnostic.code,
      path: schemaDiagnostic.path,
      message: `[${stage}] ${schemaDiagnostic.message || schemaDiagnostic.code}`,
      receivedKeys: schemaDiagnostic.receivedKeys.length > 0 ? schemaDiagnostic.receivedKeys.slice() : receivedKeys,
      allowedKeys: schemaDiagnostic.allowedKeys.length > 0 ? schemaDiagnostic.allowedKeys.slice() : allowedKeys,
      validTemplateJson: schemaDiagnostic.validTemplateJson.length > 0 ?
        schemaDiagnostic.validTemplateJson : toolTemplate(request, call.name)
    };
  }
  const code: string = toolErrorCode(error);
  let detail: string = error instanceof Error ? error.message : 'Unrecognized execution error';
  if (error instanceof 后端错误) {
    detail += ` (nativeStatus=${error.nativeStatus}, kind=${error.kind}, context=${error.context})`;
  }
  return {
    stage: 'execution', code: code, path: '',
    message: sanitizeAgentToolJson(`[execution] ${detail}`, 2048).text,
    receivedKeys: receivedKeys, allowedKeys: allowedKeys, validTemplateJson: toolTemplate(request, call.name)
  };
}

interface ToolDiagnosticSchema { properties?: Record<string, Object>; }

function toolErrorJson(diagnostic: AgentToolDiagnostic, record: AgentToolFailureRecord): string {
  const correction: string = diagnostic.stage === 'execution' ?
    'Arguments were received; inspect the execution error. Do not infer a payload-size problem or unavailable tool from empty diagnostic fields. ' +
    (diagnostic.code === 'duplicate_draft_id' ? 'Use a new draftId for an already successful proposal.' :
      'Shrinking CSS does not fix scope, collection, or backend failures. Do not repeat unchanged failing calls.') :
    (diagnostic.code === 'invalid_json' ?
      'The JSON could not be parsed, so receivedKeys=[] does NOT mean no arguments were sent. ' +
      'Use the parser reason in message to correct syntax. Return a complete replacement call, not a JSON fragment. ' : '') +
    'Correct the reported error before calling again; do not repeat unchanged arguments. ' +
    'Use validTemplateJson as the shape only, retaining the user content and real IDs. ' +
    (record.requireCorrection ? 'This exact failure has repeated; change the approach or ask for missing information.' : '');
  const output: AgentToolErrorOutput = {
    failureStage: diagnostic.stage ?? 'arguments',
    tool_error: diagnostic.code,
    errorPath: diagnostic.path,
    message: diagnostic.message,
    receivedKeys: diagnostic.receivedKeys.slice(),
    allowedKeys: diagnostic.allowedKeys.slice(),
    validTemplateJson: diagnostic.validTemplateJson,
    repeatCount: record.count,
    correction: correction
  };
  return sanitizeAgentToolJson(JSON.stringify(output), 16384).text;
}

function awaitingClarificationResult(clarification: AgentClarificationRequest,
  providerCalls: number, toolCalls: number): AgentRunResult {
  return {
    status: 'awaiting_clarification', clarification: clarification,
    drafts: [], providerCalls: providerCalls, toolCalls: toolCalls
  };
}

function copyInput(item: ProviderInputItem): ProviderInputItem {
  return {
    kind: item.kind,
    role: item.role,
    content: item.content,
    callId: item.callId,
    name: item.name,
    argumentsJson: item.argumentsJson,
    output: item.output,
    images: item.images?.map((entry: ProviderInputImage): ProviderInputImage => ({ imageUrl: entry.imageUrl }))
  };
}

function copyRequest(request: ProviderTurnRequest): ProviderTurnRequest {
  const input: ProviderInputItem[] = [];
  for (const item of request.input) {
    const copied: ProviderInputItem = copyInput(item);
    if (request.supportsImages === false && copied.images !== undefined) {
      copied.images = undefined;
      copied.output += '\nPage image omitted for the current text-only model. Use ocr_document_page to read it.';
    }
    input.push(copied);
  }
  return {
    apiKey: request.apiKey,
    baseUrl: request.baseUrl,
    model: request.model,
    supportsImages: request.supportsImages,
    instructions: request.instructions,
    input: input,
    functionTools: request.functionTools.slice(),
    searchMode: request.searchMode,
    requiresWebSearch: request.requiresWebSearch,
    requiresSearchEvidence: request.requiresSearchEvidence,
    requiresDraft: request.requiresDraft,
    expectedDraftCount: request.expectedDraftCount,
    reasoningEffort: request.reasoningEffort,
    maxOutputTokens: request.maxOutputTokens
  };
}

class RoundCollector implements AgentStreamObserver {
  readonly toolCalls: AgentToolCall[] = [];
  readonly searchSources: AgentSearchSourceEvent[] = [];
  readonly continuationItems: string[] = [];
  text: string = '';
  reasoning: string = '';
  searchStarted: boolean = false;
  errorCode: string = '';
  receivedOutput: boolean = false;
  private readonly continuationIndexes: Map<string, number> = new Map<string, number>();
  incompleteMaxOutput: boolean = false;
  private readonly downstream: AgentRunObserver;

  constructor(downstream: AgentRunObserver) {
    this.downstream = downstream;
  }

  onEvent(event: AgentEvent): void {
    if (event.kind === 'completed') {
      return;
    }
    if (event.kind === 'tool_call' && event.toolCall !== null) {
      this.receivedOutput = true;
      this.toolCalls.push(event.toolCall);
    } else if (event.kind === 'tool_progress') {
      this.receivedOutput = true;
    } else if (event.kind === 'text_delta') {
      this.receivedOutput = true;
      this.text += event.text;
    } else if (event.kind === 'reasoning_delta') {
      this.receivedOutput = true;
      this.reasoning += event.text;
    } else if (event.kind === 'status') {
      if (event.text.startsWith('web_search_')) { this.searchStarted = true; }
      if (event.text === 'provider_response_incomplete_max_output_tokens') {
        this.incompleteMaxOutput = true;
      }
    } else if (event.kind === 'search_source' && event.source !== null) {
      this.receivedOutput = true;
      const sourceEvent: AgentSearchSourceEvent = {
        kind: 'search_source',
        url: event.source.url,
        title: event.source.title
      };
      this.searchSources.push(sourceEvent);
    } else if (event.kind === 'continuation_item') {
      this.receivedOutput = true;
      let item: ResponsesOpaqueOutputInput;
      try { item = readProviderContinuation(event.text); } catch (error) {
        this.errorCode = 'invalid_provider_input';
        const invalid: AgentEvent = simpleEvent('error', '');
        invalid.errorCode = this.errorCode;
        this.downstream.onEvent(invalid);
        return;
      }
      const key: string = item.id === undefined ? event.text : `${item.type}:${item.id}`;
      const index: number | undefined = this.continuationIndexes.get(key);
      if (index === undefined) {
        this.continuationIndexes.set(key, this.continuationItems.length);
        this.continuationItems.push(event.text);
      } else {
        // terminal 输出可能补全先前的空/不完整思考项，位置保持不变。
        this.continuationItems[index] = event.text;
      }
      if (item.type === 'web_search_call') { this.searchStarted = true; }
    } else if (event.kind === 'error') {
      this.errorCode = event.errorCode.length === 0 ? 'provider_response_failed' : event.errorCode;
    }
    this.downstream.onEvent(event);
  }
}

function shouldRetryTransport(error: AgentTransportError): boolean {
  if (error.kind === 'network') { return true; }
  return error.kind === 'http' && (error.statusCode === 429 || error.statusCode >= 500);
}

function waitBeforeRetry(attempt: number): Promise<void> {
  return new Promise<void>((resolve: () => void): void => {
    setTimeout(resolve, Math.min(1000, 250 * attempt));
  });
}

function createDraftNoteCount(drafts: ChangeDraft[]): number {
  const ids: Set<string> = new Set<string>();
  for (let draftIndex: number = 0; draftIndex < drafts.length; draftIndex++) {
    const draft: ChangeDraft = drafts[draftIndex];
    for (const operation of draft.operations) {
      if (operation.kind === 'create_note') {
        ids.add(`${draftIndex}:${operation.noteId}`);
      }
    }
  }
  return ids.size;
}

/** @throws {Error} 续接格式异常交给本轮调用方，不发送损坏请求。 */
function appendRoundContinuation(request: ProviderTurnRequest, collector: RoundCollector): void {
  let fallback: string = collector.reasoning;
  for (const json of collector.continuationItems) {
    if (hasProviderReasoningText(readProviderContinuation(json))) { fallback = ''; break; }
  }
  for (const continuationItem of collector.continuationItems) {
    let content: string = continuationItem;
    const value: ResponsesOpaqueOutputInput = readProviderContinuation(continuationItem);
    if (value.type === 'reasoning' && fallback.length > 0) {
      value.content = [{ type: 'reasoning_text', text: fallback }];
      content = JSON.stringify(value);
      fallback = '';
    }
    request.input.push({
      kind: 'output_item', role: '', content: content,
      callId: '', name: '', argumentsJson: '', output: ''
    });
  }
  if (fallback.length > 0) {
    request.input.push({
      kind: 'reasoning', role: '', content: fallback,
      callId: '', name: '', argumentsJson: '', output: ''
    });
  }
  if (collector.text.length > 0) {
    request.input.push({
      kind: 'message', role: 'assistant', content: collector.text,
      callId: '', name: '', argumentsJson: '', output: ''
    });
  }
}

/** 有界 Agent 循环。读工具可执行，写工具只能由注册表返回 ChangeDraft。 */
export class AgentRunner {
  private continuationInput: ProviderInputItem[] = [];
  private partialDrafts: ChangeDraft[] = [];
  getPartialDrafts(): ChangeDraft[] { return this.partialDrafts.slice(); }

  getContinuationInput(): ProviderInputItem[] {
    return this.continuationInput.map((item: ProviderInputItem): ProviderInputItem => copyInput(item));
  }
  private readonly registry: AgentToolRegistry;
  private readonly limits: AgentTurnLimits;
  private activeSession: AgentTransportSession | null = null;
  private cancelled: boolean = false;

  constructor(registry: AgentToolRegistry, limits: AgentTurnLimits = DEFAULT_AGENT_TURN_LIMITS) {
    this.registry = registry;
    this.limits = limits;
  }

  /** @throws {Error} 协议续接或请求构建失败交给会话层处理。 */
  /** @throws {Error} 协议、工具或网络失败交给 Session/页面处理，不能当作完成。 */
  async run(provider: ProviderId, originalRequest: ProviderTurnRequest,
    observer: AgentRunObserver): Promise<AgentRunResult> {
    this.cancelled = false;
    this.partialDrafts = [];
    const request: ProviderTurnRequest = copyRequest(originalRequest);
    const baseInstructions: string = request.instructions;
    this.continuationInput = request.input;
    const capabilities: ProviderCapabilities = provider === 'deepseek' ?
      DEEPSEEK_PROVIDER.capabilities : (provider === 'openai' ?
        OPENAI_PROVIDER.capabilities : customProviderDefaults().capabilities);
    if (!capabilities.toolCalls) {
      throw new AgentRunnerError('agent_tools_unsupported');
    }
    const configuredSearchMode: string = request.searchMode;
    const searchRequired: boolean = request.requiresWebSearch || request.requiresSearchEvidence;
    const searchForced: boolean = configuredSearchMode === 'always' || searchRequired;
    const localWebAvailable: boolean = isToolDeclared(request, 'web_search') || isToolDeclared(request, 'read_webpage');
    if (!localWebAvailable && configuredSearchMode === 'off' &&
      (request.requiresWebSearch || request.requiresSearchEvidence)) {
      throw new AgentRunnerError('web_search_disabled');
    }
    if (localWebAvailable) {
      request.searchMode = 'off';
    } else if (!capabilities.webSearch) {
      if (searchRequired) {
        throw new AgentRunnerError('web_search_provider_unsupported');
      }
      request.searchMode = 'off';
    } else if (searchForced) {
      // 明确联网或“总是搜索”只强制首个搜索阶段；后续轮次必须能调用本地制卡工具。
      request.searchMode = 'always';
    } else {
      // 自动模式由应用根据本轮原始用户意图确定，禁止模型在普通本地任务中随机联网。
      request.searchMode = 'off';
    }
    const drafts: ChangeDraft[] = [];
    this.partialDrafts = drafts;
    const allSearchSources: AgentSearchSourceEvent[] = [];
    const seenToolCallIds: Set<string> = new Set<string>();
    const failureTracker: AgentToolFailureTracker = new AgentToolFailureTracker();
    let providerCalls: number = 0;
    let toolCalls: number = 0;
    let transientRetries: number = 0;
    let searchExecuted: boolean = false;
    let searchHandoffPending: boolean = searchForced && request.requiresDraft;
    let draftRecoveryPending: boolean = false;
    let draftRecoveryPrompted: boolean = false;
    while (providerCalls < this.limits.maxProviderCalls) {
      if (this.cancelled) {
        throw new AgentRunnerError('cancelled');
      }
      providerCalls += 1;
      compactAgentToolOutputs(request.input);
      request.instructions = baseInstructions + buildAgentRuntimeInstructions(
        request.functionTools, providerCalls, toolCalls, this.limits);
      const collector: RoundCollector = new RoundCollector(observer);
      this.activeSession = this.createSession(provider, request, collector);
      try {
        await this.activeSession.start();
      } catch (error) {
        this.activeSession = null;
        if (error instanceof AgentTransportError && !collector.receivedOutput &&
          shouldRetryTransport(error) && transientRetries < 2 &&
          providerCalls < this.limits.maxProviderCalls) {
          transientRetries += 1;
          observer.onEvent(simpleEvent('status', 'provider_retry'));
          await waitBeforeRetry(transientRetries);
          continue;
        }
        if (error instanceof Error) { throw error; }
        throw new AgentRunnerError('provider_transport_failed');
      }
      this.activeSession = null;
      transientRetries = 0;
      if (collector.searchStarted) { searchExecuted = true; }
      for (const source of collector.searchSources) { allSearchSources.push(source); }
      if (searchExecuted && request.searchMode === 'always') {
        request.searchMode = 'auto';
      }
      if (collector.errorCode.length > 0) {
        throw new AgentRunnerError(collector.errorCode);
      }
      if (collector.searchStarted) {
        const searchCall: AgentToolCall = {
          id: `builtin-web-search-${providerCalls}`,
          name: 'web_search',
          argumentsJson: '{}'
        };
        const searchTrace: AgentToolTrace = completeAgentToolTrace(
          createStartedAgentToolTrace(searchCall, providerCalls, 0),
          `{"sourceCount":${collector.searchSources.length}}`
        );
        observer.onEvent(toolStatusEvent('tool_completed', searchCall, searchTrace));
      }
      if (collector.toolCalls.length === 0) {
        const createdCount: number = createDraftNoteCount(drafts);
        const countMismatch: boolean = request.expectedDraftCount > 0 && createdCount > 0 &&
          createdCount !== request.expectedDraftCount;
        if (collector.incompleteMaxOutput) {
          if (providerCalls >= this.limits.maxProviderCalls) {
            throw new AgentRunnerError('agent_provider_limit');
          }
          appendRoundContinuation(request, collector);
          request.input.push({
            kind: 'message', role: 'user',
            content: 'Continue from the truncated response and finish the requested work. Do not repeat completed work.',
            callId: '', name: '', argumentsJson: '', output: ''
          });
          observer.onEvent(simpleEvent('status', 'provider_continuation'));
          continue;
        }
        if (draftRecoveryPending && drafts.length === 0) {
          appendRoundContinuation(request, collector);
          if (!draftRecoveryPrompted && providerCalls < this.limits.maxProviderCalls) {
            draftRecoveryPrompted = true;
            request.input.push({
              kind: 'message', role: 'user',
              content: 'The draft tool failed; no valid draft has been delivered. Continue the original task using ' +
                'the reported error and declared tools. A text list of cards is not a substitute for a valid draft. ' +
                'If essential information is missing, ask for it; if blocked, explain the specific blocker. ' +
                'Do not repeat unchanged failing calls or claim anything was saved.',
              callId: '', name: '', argumentsJson: '', output: ''
            });
            continue;
          }
          throw new AgentRunnerError('agent_no_valid_draft');
        }
        if (searchHandoffPending && searchExecuted && drafts.length === 0 &&
          providerCalls < this.limits.maxProviderCalls) {
          searchHandoffPending = false;
          appendRoundContinuation(request, collector);
          request.input.push({
            kind: 'message', role: 'user',
            content: 'The required web search is complete. Use its results now and finish the original task. ' +
              'Call the appropriate declared local draft tool when the task requires a draft.',
            callId: '', name: '', argumentsJson: '', output: ''
          });
          observer.onEvent(simpleEvent('status', 'web_search_handoff'));
          continue;
        }
        if (countMismatch) {
          drafts.splice(0, drafts.length);
          throw new AgentRunnerError('agent_no_valid_draft');
        }
        if (request.requiresDraft && drafts.length === 0) {
          throw new AgentRunnerError('agent_no_valid_draft');
        }
        enforceSearchExecution(searchRequired, searchExecuted);
        enforceSearchEvidence(request.requiresSearchEvidence, allSearchSources);
        appendRoundContinuation(request, collector);
        observer.onEvent(simpleEvent('completed'));
        return {
          status: 'completed', clarification: null,
          drafts: drafts, providerCalls: providerCalls, toolCalls: toolCalls
        };
      }
      searchHandoffPending = false;
      appendRoundContinuation(request, collector);
      const hasClarification: boolean = collector.toolCalls.some((call: AgentToolCall): boolean =>
        call.name === 'request_clarification' || call.name === 'request_create_target' || call.name === 'propose_create_deck' ||
        call.name === 'propose_rename_deck' || call.name === 'propose_reparent_decks' || call.name === 'propose_reorder_decks' || call.name === 'propose_create_note_type' || call.name === 'propose_memory_change' ||
        call.name === 'propose_analysis' || call.name === 'configure_create_target');
      if (hasClarification && collector.toolCalls.length > 1) {
        if (toolCalls + collector.toolCalls.length > this.limits.maxToolCalls) {
          observer.onEvent(simpleEvent('error', '', 'agent_tool_limit'));
          throw new AgentRunnerError('agent_tool_limit');
        }
        const output = JSON.stringify({
          tool_error: 'clarification_must_be_only_tool',
          message: 'Clarification, target configuration and confirmation proposals must each be the only tool call in their provider round.',
          correction: 'Call this tool alone, then continue after its result.'
        });
        const diagnostic: AgentToolDiagnostic = {
          code: 'clarification_must_be_only_tool', path: '',
          message: 'Clarification, target configuration and confirmation proposals must each be the only tool call in their provider round.',
          receivedKeys: [], allowedKeys: [], validTemplateJson: ''
        };
        for (const call of collector.toolCalls) {
          registerToolCallId(seenToolCallIds, call.id);
          toolCalls += 1;
          const startedTrace: AgentToolTrace = createStartedAgentToolTrace(call, providerCalls, toolCalls);
          const failedTrace: AgentToolTrace = failAgentToolTrace(startedTrace, diagnostic, 1);
          observer.onEvent(toolStatusEvent('tool_failed', call, failedTrace, diagnostic.code));
          request.input.push({
            kind: 'function_call', role: '', content: '', callId: call.id,
            name: call.name, argumentsJson: call.argumentsJson, output: ''
          });
        }
        // 同轮调用属于同一个助手段；结果插在调用之间会拆段并丢失后一段的思考关联。
        for (const call of collector.toolCalls) {
          request.input.push({
            kind: 'function_call_output', role: '', content: '', callId: call.id,
            name: '', argumentsJson: '', output: output
          });
        }
        continue;
      }
      const acceptedToolCalls: AgentToolCall[] = [];
      for (const call of collector.toolCalls) {
        if (!registerToolCallId(seenToolCallIds, call.id)) {
          const duplicateStarted: AgentToolTrace = createStartedAgentToolTrace(call, providerCalls, toolCalls + 1);
          const duplicateDiagnostic: AgentToolDiagnostic = {
            code: 'duplicate_tool_call', path: 'callId', message: 'Tool call IDs must be unique in one turn.',
            receivedKeys: [], allowedKeys: [], validTemplateJson: toolTemplate(request, call.name)
          };
          observer.onEvent(toolStatusEvent('tool_failed', call,
            failAgentToolTrace(duplicateStarted, duplicateDiagnostic, 1), 'duplicate_tool_call'));
          continue;
        }
        if (toolCalls >= this.limits.maxToolCalls) {
          observer.onEvent(simpleEvent('error', '', 'agent_tool_limit'));
          throw new AgentRunnerError('agent_tool_limit');
        }
        toolCalls += 1;
        acceptedToolCalls.push(call);
        request.input.push({
          kind: 'function_call', role: '', content: '', callId: call.id,
          name: call.name, argumentsJson: call.argumentsJson, output: ''
        });
      }
      for (const call of acceptedToolCalls) {
        if (this.cancelled) { throw new AgentRunnerError('cancelled'); }
        const sequence: number = toolCalls - acceptedToolCalls.length + acceptedToolCalls.indexOf(call) + 1;
        const startedTrace: AgentToolTrace = createStartedAgentToolTrace(call, providerCalls, sequence);
        observer.onEvent(toolStatusEvent('tool_started', call, startedTrace));
        try {
          if (!isToolDeclared(request, call.name)) {
            const undeclared: AgentToolDiagnostic = undeclaredToolDiagnostic(request, call);
            const undeclaredRecord: AgentToolFailureRecord =
              failureTracker.record(call.name, call.argumentsJson, undeclared);
            const undeclaredTrace: AgentToolTrace =
              failAgentToolTrace(startedTrace, undeclared, undeclaredRecord.count);
            observer.onEvent(toolStatusEvent('tool_failed', call, undeclaredTrace, undeclared.code));
            request.input.push({
              kind: 'function_call_output', role: '', content: '', callId: call.id,
              name: '', argumentsJson: '', output: toolErrorJson(undeclared, undeclaredRecord)
            });
            continue;
          }
          const result: AgentToolResult = await this.registry.execute(call);
          if (this.cancelled) { throw new AgentRunnerError('cancelled'); }
          if (call.name === 'web_search' || call.name === 'read_webpage') {
            const sources: AgentSearchSourceEvent[] = agentWebResultSources(call.name, result.outputJson);
            searchExecuted = true;
            for (const source of sources) {
              if (allSearchSources.some((seen: AgentSearchSourceEvent): boolean => seen.url === source.url)) { continue; }
              allSearchSources.push(source);
              observer.onEvent({ kind: 'search_source', text: '', toolCall: null, toolTrace: null,
                source: { url: source.url, title: source.title }, errorCode: '' });
            }
          }
          if (result.draft !== null) { drafts.push(result.draft); }
          const completedTrace: AgentToolTrace = completeAgentToolTrace(startedTrace, result.outputJson);
          if (result.action !== undefined) { completedTrace.status = 'awaiting_confirmation'; }
          observer.onEvent(toolStatusEvent('tool_completed', call, completedTrace));
          request.input.push({
            kind: 'function_call_output', role: '', content: '', callId: call.id,
            name: '', argumentsJson: '', output: sanitizeAgentToolJson(result.outputJson, Number.MAX_SAFE_INTEGER).text,
            images: result.images
          });
          if (result.action !== undefined) {
            // 同批后续工具尚未执行，补齐协议结果，恢复时让模型重新发起。
            for (let pendingIndex: number = acceptedToolCalls.indexOf(call) + 1;
              pendingIndex < acceptedToolCalls.length; pendingIndex++) {
              request.input.push({ kind: 'function_call_output', role: '', content: '',
                callId: acceptedToolCalls[pendingIndex].id, name: '', argumentsJson: '',
                output: '{"status":"not_executed_awaiting_confirmation"}' });
            }
            return { status: 'awaiting_confirmation', action: result.action, clarification: null,
              drafts: drafts, providerCalls: providerCalls, toolCalls: toolCalls };
          }
          if (result.clarification !== null) {
            if (this.cancelled) {
              throw new AgentRunnerError('cancelled');
            }
            return awaitingClarificationResult(result.clarification, providerCalls, toolCalls);
          }
        } catch (error) {
          if (this.cancelled) { throw new AgentRunnerError('cancelled'); }
          if (error instanceof AgentRunnerError && error.code === 'cancelled') {
            throw error;
          }
          const diagnostic: AgentToolDiagnostic = diagnosticForError(error as Object, call, request);
          if (this.registry.isDraftTool(call.name)) { draftRecoveryPending = true; }
          const record: AgentToolFailureRecord = failureTracker.record(call.name, call.argumentsJson, diagnostic);
          const failedTrace: AgentToolTrace = failAgentToolTrace(startedTrace, diagnostic, record.count);
          observer.onEvent(toolStatusEvent('tool_failed', call, failedTrace, diagnostic.code));
          request.input.push({
            kind: 'function_call_output', role: '', content: '', callId: call.id,
            name: '', argumentsJson: '', output: toolErrorJson(diagnostic, record)
          });
          if (record.shouldAbort) {
            observer.onEvent(simpleEvent('error', '', 'agent_repeated_tool_failure'));
            throw new AgentRunnerError('agent_repeated_tool_failure');
          }
        }
      }
      if (drafts.length > 0) {
        const createdCount: number = createDraftNoteCount(drafts);
        // 统一对话里的“修改 N 张卡”不能被制卡数量约束误拒绝；已有制卡模式仍严格校验。
        const editToolsAvailable: boolean = request.functionTools.some((tool: ProviderFunctionTool): boolean =>
          tool.name === 'propose_update_notes');
        if (request.expectedDraftCount > 0 && (createdCount > 0 || !editToolsAvailable) &&
          createdCount !== request.expectedDraftCount) {
          drafts.splice(0, drafts.length);
          throw new AgentRunnerError('agent_no_valid_draft');
        }
        enforceSearchExecution(searchRequired, searchExecuted);
        enforceSearchEvidence(request.requiresSearchEvidence, allSearchSources);
        observer.onEvent(simpleEvent('completed'));
        return {
          status: 'completed', clarification: null,
          drafts: drafts, providerCalls: providerCalls, toolCalls: toolCalls
        };
      }
    }
    observer.onEvent(simpleEvent('error', '', 'agent_provider_limit'));
    throw new AgentRunnerError('agent_provider_limit');
  }

  cancel(): void {
    this.cancelled = true;
    this.registry.cancelActive();
    if (this.activeSession !== null) {
      this.activeSession.cancel();
    }
  }

  /** @throws {Error} 请求构建失败交给本轮调用方。 */
  private createSession(provider: ProviderId, request: ProviderTurnRequest,
    observer: AgentStreamObserver): AgentTransportSession {
    if (provider === 'deepseek') {
      return new DeepSeekAdapter().createSession(request, observer);
    }
    if (provider === 'openai') {
      return new OpenAIAdapter().createSession(request, observer);
    }
    return new CustomAdapter().createSession(request, observer);
  }
}
