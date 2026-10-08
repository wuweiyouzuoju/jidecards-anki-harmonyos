// SPDX-License-Identifier: AGPL-3.0-or-later

import { http } from '@kit.NetworkKit';
import type { AgentEvent } from '../../model/agent/AgentTypes';
import { IncrementalSseParser, SseMessage } from '../../model/agent/SseParser';
import { ResponsesEventNormalizer } from '../../model/agent/ResponsesEventNormalizer';
import { UTF8解码 } from '../../proto/core/utf8';

export type AgentTransportErrorKind = 'cancelled' | 'network' | 'http';

export class AgentTransportError extends Error {
  readonly kind: AgentTransportErrorKind;
  readonly statusCode: number;
  readonly detailCode: string;
  readonly detailMessage: string;

  constructor(kind: AgentTransportErrorKind, statusCode: number = 0,
    detailCode: string = '', detailMessage: string = '') {
    super(kind === 'http' && statusCode > 0 ? `http_${statusCode}` : kind);
    this.kind = kind;
    this.statusCode = statusCode;
    this.detailCode = detailCode;
    this.detailMessage = detailMessage;
  }
}

export interface ProviderErrorDetail {
  code: string;
  message: string;
}

interface RawProviderError {
  code?: string;
  type?: string;
  message?: string;
}

interface RawProviderErrorBody {
  error?: RawProviderError;
  message?: string;
}

function safeDetailText(value: string): string {
  return value
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [secret omitted]')
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, '[secret omitted]')
    .replace(/"[^"\r\n]{80,}"/g, '"[request content omitted]"')
    .replace(/[\u0000-\u001F]+/g, ' ')
    .trim().slice(0, 240);
}

export function parseProviderErrorDetail(bytes: Uint8Array): ProviderErrorDetail {
  if (bytes.length === 0) { return { code: '', message: '' }; }
  try {
    const raw: RawProviderErrorBody = JSON.parse(UTF8解码(bytes)) as RawProviderErrorBody;
    if (raw !== null && typeof raw === 'object') {
      const error: RawProviderError | undefined = raw.error;
      const code: string = error === undefined ? '' :
        (typeof error.code === 'string' ? error.code :
          (typeof error.type === 'string' ? error.type : ''));
      const message: string = error !== undefined && typeof error.message === 'string' ?
        error.message : (typeof raw.message === 'string' ? raw.message : '');
      return { code: safeDetailText(code), message: safeDetailText(message) };
    }
  } catch (error) {
    // 非 JSON 错误页不直接展示，避免把网关 HTML 或请求回显带进 UI。
  }
  return { code: '', message: '' };
}

function appendPrefix(left: Uint8Array, right: Uint8Array, limit: number): Uint8Array {
  if (left.length >= limit || right.length === 0) { return left; }
  const accepted: number = Math.min(right.length, limit - left.length);
  const output: Uint8Array = new Uint8Array(left.length + accepted);
  output.set(left, 0);
  output.set(right.slice(0, accepted), left.length);
  return output;
}

export interface AgentStreamRequest {
  url: string;
  apiKey: string;
  body: string;
}

export interface AgentStreamObserver {
  onEvent(event: AgentEvent): void;
}

interface AgentRequestHeaders {
  'Content-Type': string;
  'Accept': string;
  'Authorization': string;
}

/**
 * 一次可取消的原生流请求。密钥只进入请求头；错误对象不携带响应正文或密钥。
 * HarmonyOS 没有独立 AbortSignal，取消通过销毁本次 HttpRequest 完成。
 */
export class AgentTransportSession {
  private readonly request: AgentStreamRequest;
  private readonly observer: AgentStreamObserver;
  private readonly parser: IncrementalSseParser = new IncrementalSseParser();
  private readonly normalizer: ResponsesEventNormalizer = new ResponsesEventNormalizer();
  private readonly client: http.HttpRequest = http.createHttp();
  private cancelled: boolean = false;
  private destroyed: boolean = false;
  private ended: boolean = false;
  private rawPrefix: Uint8Array = new Uint8Array(0);

  constructor(request: AgentStreamRequest, observer: AgentStreamObserver) {
    this.request = request;
    this.observer = observer;
  }

  async start(): Promise<void> {
    const headers: AgentRequestHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'Authorization': `Bearer ${this.request.apiKey}`
    };
    const options: http.HttpRequestOptions = {
      method: http.RequestMethod.POST,
      header: headers,
      extraData: this.request.body,
      usingCache: false,
      connectTimeout: 15000,
      readTimeout: 120000
    };
    const dataCallback = (buffer: ArrayBuffer): void => {
      if (this.cancelled) {
        return;
      }
      const bytes: Uint8Array = new Uint8Array(buffer);
      this.rawPrefix = appendPrefix(this.rawPrefix, bytes, 65536);
      this.emitMessages(this.parser.push(bytes));
    };
    const endCallback = (): void => {
      if (this.cancelled || this.ended) {
        return;
      }
      this.ended = true;
      this.emitMessages(this.parser.finish());
    };
    this.client.on('dataReceive', dataCallback);
    this.client.on('dataEnd', endCallback);
    try {
      const responseCode: number = await this.client.requestInStream(this.request.url, options);
      if (this.cancelled) {
        throw new AgentTransportError('cancelled');
      }
      if (responseCode < 200 || responseCode >= 300) {
        const detail: ProviderErrorDetail = parseProviderErrorDetail(this.rawPrefix);
        throw new AgentTransportError('http', responseCode, detail.code, detail.message);
      }
      if (!this.ended) {
        this.ended = true;
        this.emitMessages(this.parser.finish());
      }
    } catch (error) {
      if (error instanceof AgentTransportError) {
        throw error;
      }
      if (this.cancelled) {
        throw new AgentTransportError('cancelled');
      }
      throw new AgentTransportError('network');
    } finally {
      this.client.off('dataReceive', dataCallback);
      this.client.off('dataEnd', endCallback);
      this.destroyClient();
    }
  }

  cancel(): void {
    if (this.cancelled) {
      return;
    }
    this.cancelled = true;
    this.destroyClient();
  }

  private emitMessages(messages: SseMessage[]): void {
    for (const message of messages) {
      const events: AgentEvent[] = this.normalizer.accept(message);
      for (const event of events) {
        this.observer.onEvent(event);
      }
    }
  }

  private destroyClient(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.client.destroy();
  }
}
