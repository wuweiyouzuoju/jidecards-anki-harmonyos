// SPDX-License-Identifier: AGPL-3.0-or-later

import type { AgentEvent, AgentEventKind, AgentToolCall, SearchSource } from './AgentTypes';
import type { SseMessage } from './SseParser';

/** OpenAI Responses 与 DeepSeek Responses 共用的纯事件归一化器。 */

interface RawAnnotation {
  type?: string;
  url?: string;
  title?: string;
}

interface RawContentPart {
  annotations?: RawAnnotation[];
}

interface RawActionSource {
  type?: string;
  url?: string;
  title?: string;
}

interface RawWebSearchAction {
  sources?: RawActionSource[];
}

interface RawOutputItem {
  type?: string;
  id?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  content?: RawContentPart[];
  action?: RawWebSearchAction;
}

interface RawResponseError {
  code?: string;
}

interface RawResponse {
  error?: RawResponseError;
  incomplete_details?: RawIncompleteDetails;
}

interface RawIncompleteDetails {
  reason?: string;
}

interface RawResponseEvent {
  type?: string;
  delta?: string;
  item_id?: string;
  name?: string;
  arguments?: string;
  item?: RawOutputItem;
  part?: RawContentPart;
  annotation?: RawAnnotation;
  response?: RawResponse;
}

interface PendingFunctionCall {
  itemId: string;
  callId: string;
  name: string;
  argumentsJson: string;
}

function emptyEvent(kind: AgentEventKind): AgentEvent {
  return {
    kind: kind,
    text: '',
    toolCall: null,
    toolTrace: null,
    source: null,
    errorCode: ''
  };
}

function textEvent(kind: 'status' | 'text_delta' | 'reasoning_delta' | 'reasoning_summary',
  text: string): AgentEvent {
  const event: AgentEvent = emptyEvent(kind);
  event.text = text;
  return event;
}

function errorEvent(code: string): AgentEvent {
  const event: AgentEvent = emptyEvent('error');
  event.errorCode = code;
  return event;
}

export class ResponsesEventNormalizer {
  private pendingCalls: Map<string, PendingFunctionCall> = new Map<string, PendingFunctionCall>();
  private emittedCallItems: Set<string> = new Set<string>();
  private emittedSourceUrls: Set<string> = new Set<string>();

  accept(message: SseMessage): AgentEvent[] {
    if (message.done) {
      return [emptyEvent('completed')];
    }
    if (message.data.length === 0) {
      return [];
    }
    let raw: RawResponseEvent;
    try {
      raw = JSON.parse(message.data) as RawResponseEvent;
    } catch (error) {
      return [errorEvent('provider_event_malformed')];
    }
    if (raw === null || typeof raw !== 'object' || typeof raw.type !== 'string') {
      return [errorEvent('provider_event_malformed')];
    }
    return this.normalize(raw);
  }

  reset(): void {
    this.pendingCalls.clear();
    this.emittedCallItems.clear();
    this.emittedSourceUrls.clear();
  }

  private normalize(raw: RawResponseEvent): AgentEvent[] {
    const type: string = raw.type === undefined ? '' : raw.type;
    if (type === 'response.output_text.delta' && typeof raw.delta === 'string') {
      return [textEvent('text_delta', raw.delta)];
    }
    if (type === 'response.reasoning_text.delta' && typeof raw.delta === 'string') {
      return [textEvent('reasoning_delta', raw.delta)];
    }
    if ((type === 'response.reasoning_summary_text.delta' ||
      type === 'response.reasoning_summary.delta') && typeof raw.delta === 'string') {
      return [textEvent('reasoning_summary', raw.delta)];
    }
    if (type === 'response.web_search_call.in_progress') {
      return [textEvent('status', 'web_search_in_progress')];
    }
    if (type === 'response.web_search_call.searching') {
      return [textEvent('status', 'web_search_searching')];
    }
    if (type === 'response.web_search_call.completed') {
      return [textEvent('status', 'web_search_completed')];
    }
    if (type === 'response.output_item.added' && raw.item !== undefined) {
      this.rememberFunctionCall(raw.item);
      const events: AgentEvent[] = this.sourcesFromItem(raw.item);
      const progress: AgentEvent | null = this.functionProgress(raw.item.id);
      if (progress !== null) { events.push(progress); }
      return events;
    }
    if (type === 'response.function_call_arguments.delta') {
      this.appendFunctionArguments(raw);
      const progress: AgentEvent | null = this.functionProgress(raw.item_id);
      return progress === null ? [] : [progress];
    }
    if (type === 'response.function_call_arguments.done') {
      const call: AgentToolCall | null = this.completeFunctionArguments(raw);
      if (call === null) {
        return [errorEvent('provider_tool_call_malformed')];
      }
      const event: AgentEvent = emptyEvent('tool_call');
      event.toolCall = call;
      return [event];
    }
    if (type === 'response.output_item.done' && raw.item !== undefined) {
      const events: AgentEvent[] = this.sourcesFromItem(raw.item);
      if (raw.item.type === 'web_search_call' || raw.item.type === 'reasoning') {
        const continuation: AgentEvent = emptyEvent('continuation_item');
        continuation.text = JSON.stringify(raw.item);
        events.push(continuation);
      }
      const fallback: AgentToolCall | null = this.completeFunctionItem(raw.item);
      if (fallback !== null) {
        const toolEvent: AgentEvent = emptyEvent('tool_call');
        toolEvent.toolCall = fallback;
        events.push(toolEvent);
      }
      return events;
    }
    if (type === 'response.content_part.done' && raw.part !== undefined) {
      return this.sourcesFromPart(raw.part);
    }
    if (type === 'response.output_text.annotation.added' && raw.annotation !== undefined) {
      const source: AgentEvent | null = this.sourceFromAnnotation(raw.annotation);
      return source === null ? [] : [source];
    }
    if (type === 'response.completed') {
      return [emptyEvent('completed')];
    }
    if (type === 'response.incomplete') {
      const reason: string = raw.response !== undefined &&
        raw.response.incomplete_details !== undefined &&
        typeof raw.response.incomplete_details.reason === 'string' ?
        raw.response.incomplete_details.reason : '';
      if (reason === 'max_output_tokens') {
        return [textEvent('status', 'provider_response_incomplete_max_output_tokens')];
      }
      return [errorEvent(reason === 'content_filter' ?
        'provider_response_incomplete_content_filter' : 'provider_response_incomplete')];
    }
    if (type === 'response.failed') {
      let code: string = 'provider_response_failed';
      if (raw.response !== undefined && raw.response.error !== undefined &&
        typeof raw.response.error.code === 'string' && raw.response.error.code.length > 0) {
        code = raw.response.error.code;
      }
      return [errorEvent(code)];
    }
    return [];
  }

  private rememberFunctionCall(item: RawOutputItem): void {
    if (item.type !== 'function_call' || typeof item.id !== 'string' || item.id.length === 0) {
      return;
    }
    this.pendingCalls.set(item.id, {
      itemId: item.id,
      callId: typeof item.call_id === 'string' ? item.call_id : '',
      name: typeof item.name === 'string' ? item.name : '',
      argumentsJson: typeof item.arguments === 'string' ? item.arguments : ''
    });
  }

  /** 流式参数仅用于展示，完整 tool_call 仍是唯一执行入口。 */
  private functionProgress(itemId: string | undefined): AgentEvent | null {
    if (itemId === undefined || this.emittedCallItems.has(itemId)) { return null; }
    const current: PendingFunctionCall | undefined = this.pendingCalls.get(itemId);
    if (current === undefined || (current.name !== 'create_flashcards' &&
      !current.name.startsWith('propose_'))) { return null; }
    const event: AgentEvent = emptyEvent('tool_progress');
    event.toolCall = { id: current.callId.length > 0 ? current.callId : itemId,
      name: current.name, argumentsJson: current.argumentsJson };
    return event;
  }

  private appendFunctionArguments(raw: RawResponseEvent): void {
    if (typeof raw.item_id !== 'string' || typeof raw.delta !== 'string') {
      return;
    }
    const current: PendingFunctionCall | undefined = this.pendingCalls.get(raw.item_id);
    if (current === undefined) {
      this.pendingCalls.set(raw.item_id, {
        itemId: raw.item_id,
        callId: '',
        name: '',
        argumentsJson: raw.delta
      });
      return;
    }
    current.argumentsJson += raw.delta;
  }

  private completeFunctionArguments(raw: RawResponseEvent): AgentToolCall | null {
    if (typeof raw.item_id !== 'string' || raw.item_id.length === 0 ||
      this.emittedCallItems.has(raw.item_id)) {
      return null;
    }
    const current: PendingFunctionCall | undefined = this.pendingCalls.get(raw.item_id);
    const name: string = typeof raw.name === 'string' && raw.name.length > 0 ?
      raw.name : (current === undefined ? '' : current.name);
    const argumentsJson: string = typeof raw.arguments === 'string' ?
      raw.arguments : (current === undefined ? '' : current.argumentsJson);
    const callId: string = current === undefined || current.callId.length === 0 ?
      raw.item_id : current.callId;
    if (name.length === 0 || argumentsJson.length === 0) {
      return null;
    }
    this.emittedCallItems.add(raw.item_id);
    return { id: callId, name: name, argumentsJson: argumentsJson };
  }

  private completeFunctionItem(item: RawOutputItem): AgentToolCall | null {
    if (item.type !== 'function_call' || typeof item.id !== 'string' ||
      item.id.length === 0 || this.emittedCallItems.has(item.id)) {
      return null;
    }
    const current: PendingFunctionCall | undefined = this.pendingCalls.get(item.id);
    const name: string = typeof item.name === 'string' ? item.name :
      (current === undefined ? '' : current.name);
    const argumentsJson: string = typeof item.arguments === 'string' ? item.arguments :
      (current === undefined ? '' : current.argumentsJson);
    const callId: string = typeof item.call_id === 'string' && item.call_id.length > 0 ?
      item.call_id : (current === undefined || current.callId.length === 0 ? item.id : current.callId);
    if (name.length === 0 || argumentsJson.length === 0) {
      return null;
    }
    this.emittedCallItems.add(item.id);
    return { id: callId, name: name, argumentsJson: argumentsJson };
  }

  private sourcesFromItem(item: RawOutputItem): AgentEvent[] {
    const events: AgentEvent[] = [];
    if (item.action !== undefined && Array.isArray(item.action.sources)) {
      for (const source of item.action.sources) {
        const event: AgentEvent | null = this.sourceFromActionSource(source);
        if (event !== null) { events.push(event); }
      }
    }
    if (!Array.isArray(item.content)) {
      return events;
    }
    for (const part of item.content) {
      const partEvents: AgentEvent[] = this.sourcesFromPart(part);
      for (const event of partEvents) {
        events.push(event);
      }
    }
    return events;
  }

  private sourceFromActionSource(value: RawActionSource): AgentEvent | null {
    if (typeof value.url !== 'string' || !value.url.startsWith('https://') ||
      this.emittedSourceUrls.has(value.url)) {
      return null;
    }
    this.emittedSourceUrls.add(value.url);
    const event: AgentEvent = emptyEvent('search_source');
    event.source = {
      url: value.url,
      title: typeof value.title === 'string' && value.title.length > 0 ? value.title : value.url
    };
    return event;
  }

  private sourcesFromPart(part: RawContentPart): AgentEvent[] {
    const events: AgentEvent[] = [];
    if (!Array.isArray(part.annotations)) {
      return events;
    }
    for (const annotation of part.annotations) {
      const event: AgentEvent | null = this.sourceFromAnnotation(annotation);
      if (event !== null) {
        events.push(event);
      }
    }
    return events;
  }

  private sourceFromAnnotation(annotation: RawAnnotation): AgentEvent | null {
    if (annotation.type !== 'url_citation' || typeof annotation.url !== 'string' ||
      !annotation.url.startsWith('https://') || this.emittedSourceUrls.has(annotation.url)) {
      return null;
    }
    const source: SearchSource = {
      url: annotation.url,
      title: typeof annotation.title === 'string' ? annotation.title : annotation.url
    };
    this.emittedSourceUrls.add(annotation.url);
    const event: AgentEvent = emptyEvent('search_source');
    event.source = source;
    return event;
  }
}
