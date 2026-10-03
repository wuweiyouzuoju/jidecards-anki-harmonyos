// SPDX-License-Identifier: AGPL-3.0-or-later

import type { SearchMode } from './AgentTypes';

/** Provider 请求的纯数据契约；密钥只由 HTTP 传输层写入 Authorization 头。 */

export type ProviderInputKind =
  'message' | 'function_call' | 'function_call_output' | 'reasoning' | 'output_item';

export interface ProviderInputImage { imageUrl: string; }

export interface ProviderInputItem {
  kind: ProviderInputKind;
  role: string;
  content: string;
  callId: string;
  name: string;
  argumentsJson: string;
  output: string;
  images?: ProviderInputImage[];
}

export interface ProviderFunctionTool {
  name: string;
  description: string;
  parametersJson: string;
  exampleArgumentsJson: string;
  rules: string;
}

export interface ProviderTurnRequest {
  apiKey: string;
  baseUrl: string;
  model: string;
  supportsImages?: boolean;
  instructions: string;
  input: ProviderInputItem[];
  functionTools: ProviderFunctionTool[];
  searchMode: SearchMode;
  /** 用户是否明确要求联网；为 true 时必须观察到真实服务端搜索过程。 */
  requiresWebSearch: boolean;
  /** 用户是否明确要求引用/来源；为 true 时必须观察到真实 HTTPS 来源。 */
  requiresSearchEvidence: boolean;
  /** 制卡成功必须产生真实 ChangeDraft；无草稿正常结束时立即失败，不自动补救。 */
  requiresDraft: boolean;
  /** 0=未显式指定；正数=最终创建草稿必须恰好等于该数量。 */
  expectedDraftCount: number;
  reasoningEffort: string;
  maxOutputTokens: number;
}

interface ResponsesMessageInput {
  role: string;
  content: string | ResponsesContentPart[];
}

interface ResponsesContentPart {
  type: string;
  text?: string;
  image_url?: string;
  detail?: string;
}

interface ResponsesFunctionCallInput {
  type: string;
  call_id: string;
  name: string;
  arguments: string;
}

interface ResponsesFunctionOutputInput {
  type: string;
  call_id: string;
  output: string | ResponsesContentPart[];
}

interface ResponsesReasoningInput {
  type: string;
  content: ResponsesReasoningContent[];
}

interface ResponsesReasoningContent {
  type: string;
  text: string;
}

export interface ResponsesOpaqueOutputInput {
  type: string;
  id?: string;
  content?: ResponsesReasoningContent[];
  summary?: object[];
  encrypted_content?: string;
}

type ResponsesInput = ResponsesMessageInput | ResponsesFunctionCallInput |
  ResponsesFunctionOutputInput | ResponsesReasoningInput | ResponsesOpaqueOutputInput;

interface ResponsesFunctionTool {
  type: string;
  name: string;
  description: string;
  parameters: object;
}

interface ResponsesWebSearchTool {
  type: string;
}

type ResponsesTool = ResponsesFunctionTool | ResponsesWebSearchTool;

interface ResponsesNamedToolChoice {
  type: string;
}

interface ResponsesReasoning {
  effort: string;
  summary: string;
}

interface ResponsesRequestBody {
  model: string;
  instructions: string;
  input: ResponsesInput[];
  tools: ResponsesTool[];
  tool_choice: string | ResponsesNamedToolChoice;
  reasoning: ResponsesReasoning;
  max_output_tokens: number;
  stream: boolean;
  store: boolean;
  include: string[];
}

export class ProviderProtocolError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export function buildResponsesUrl(baseUrl: string): string {
  const normalized: string = baseUrl.trim().replace(/\/+$/, '');
  if (normalized.endsWith('/responses')) {
    return normalized;
  }
  return `${normalized}/responses`;
}

/** @throws {ProviderProtocolError} 无效输入在发送前由请求编排层处理。 */
function buildInput(item: ProviderInputItem): ResponsesInput {
  if (item.kind === 'message') {
    if (item.images !== undefined && item.images.length > 0 && item.role !== 'user' && item.role !== 'developer') {
      throw new ProviderProtocolError('invalid_provider_image_role');
    }
    return { role: item.role, content: imageContent(item.content, item.images) };
  }
  if (item.kind === 'function_call') {
    return {
      type: 'function_call',
      call_id: item.callId,
      name: item.name,
      arguments: item.argumentsJson
    };
  }
  if (item.kind === 'function_call_output') {
    return { type: 'function_call_output', call_id: item.callId, output: imageContent(item.output, item.images) };
  }
  if (item.kind === 'reasoning') {
    return {
      type: 'reasoning',
      content: [{ type: 'reasoning_text', text: item.content }]
    };
  }
  if (item.kind === 'output_item') {
    return readProviderContinuation(item.content);
  }
  throw new ProviderProtocolError('invalid_provider_input');
}

/** @throws {ProviderProtocolError} 非续接输出不能作为 Provider 协议记录回放。 */
export function readProviderContinuation(json: string): ResponsesOpaqueOutputInput {
  let value: ResponsesOpaqueOutputInput;
  try { value = JSON.parse(json) as ResponsesOpaqueOutputInput; } catch (error) {
    throw new ProviderProtocolError('invalid_provider_input');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
    (value.type !== 'web_search_call' && value.type !== 'reasoning') ||
    (value.type === 'reasoning' && !Array.isArray(value.content) && !Array.isArray(value.summary) &&
      !(typeof value.encrypted_content === 'string' && value.encrypted_content.length > 0))) {
    throw new ProviderProtocolError('invalid_provider_input');
  }
  return value;
}

export function hasProviderReasoningText(item: ResponsesOpaqueOutputInput): boolean {
  return item.type === 'reasoning' && Array.isArray(item.content) &&
    item.content.some((part: ResponsesReasoningContent): boolean =>
      part !== null && part.type === 'reasoning_text' && typeof part.text === 'string' && part.text.length > 0);
}

function imageContent(text: string, images?: ProviderInputImage[]): string | ResponsesContentPart[] {
  if (images === undefined || images.length === 0) return text;
  const parts: ResponsesContentPart[] = [{ type: 'input_text', text: text }];
  for (const entry of images) {
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(entry.imageUrl) || entry.imageUrl.length > 4 * 1024 * 1024) {
      throw new ProviderProtocolError('invalid_provider_image');
    }
    parts.push({ type: 'input_image', image_url: entry.imageUrl, detail: 'high' });
  }
  return parts;
}

function parseToolParameters(parametersJson: string): object {
  let parameters: object;
  try {
    parameters = JSON.parse(parametersJson) as object;
  } catch (error) {
    throw new ProviderProtocolError('invalid_tool_schema');
  }
  if (parameters === null || typeof parameters !== 'object' || Array.isArray(parameters)) {
    throw new ProviderProtocolError('invalid_tool_schema');
  }
  return parameters;
}

// This is a serialized-character budget, not a provider token estimate.
export const MAX_PROVIDER_PAYLOAD_CHARS: number = 240000;

/** @throws {ProviderProtocolError} 无效协议或超限请求交给会话层报告。 */
/** @throws {ProviderProtocolError} 无效输入或工具定义交给请求调用方，在发送前明确失败。 */
export function buildResponsesPayload(request: ProviderTurnRequest): string {
  const input: ResponsesInput[] = [];
  for (const item of request.input) {
    input.push(buildInput(item));
  }
  const tools: ResponsesTool[] = [];
  for (const tool of request.functionTools) {
    if (tool.name.length === 0) {
      throw new ProviderProtocolError('invalid_tool_schema');
    }
    tools.push({
      type: 'function',
      name: tool.name,
      description: `${tool.description}\n\nStandard arguments template:\n${tool.exampleArgumentsJson}` +
        `\n\nRules:\n${tool.rules}`,
      parameters: parseToolParameters(tool.parametersJson)
    });
  }
  if (request.searchMode !== 'off') {
    tools.push({ type: 'web_search' });
  }
  let toolChoice: string | ResponsesNamedToolChoice = 'auto';
  if (request.searchMode === 'always') {
    toolChoice = { type: 'web_search' };
  }
  const body: ResponsesRequestBody = {
    model: request.model,
    instructions: request.instructions,
    input: input,
    tools: tools,
    tool_choice: toolChoice,
    reasoning: {
      effort: request.reasoningEffort.length === 0 ? 'medium' : request.reasoningEffort,
      summary: 'auto'
    },
    max_output_tokens: Math.max(1, Math.floor(request.maxOutputTokens)),
    stream: true,
    store: false,
    include: ['web_search_call.action.sources']
  };
  const payload: string = JSON.stringify(body);
  let imageChars: number = 0;
  let imageCount: number = 0;
  for (const item of request.input) {
    for (const entry of item.images ?? []) { imageChars += entry.imageUrl.length; imageCount++; }
  }
  if (payload.length - imageChars > MAX_PROVIDER_PAYLOAD_CHARS || imageChars > 12 * 1024 * 1024 || imageCount > 8) {
    throw new ProviderProtocolError('agent_context_limit');
  }
  return payload;
}
