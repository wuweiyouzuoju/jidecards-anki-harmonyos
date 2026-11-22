// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ProviderFunctionTool } from '../agent/ProviderProtocol';

export const LOCAL_MCP_PORT: number = 28761;
export const LOCAL_MCP_PATH: string = '/mcp';
export const LOCAL_MCP_VERSION: string = '2025-11-25';
export const LOCAL_MCP_MAX_BYTES: number = 1048576;
export interface LocalMcpHost {
  tools(): Promise<ProviderFunctionTool[]>;
  call(name: string, argumentsJson: string): Promise<LocalMcpCallOutput>;
}
export interface LocalHttpRequest { method: string; path: string; headers: Map<string, string>; body: Uint8Array; }
export interface LocalHttpReply { status: number; body: string; afterSend?: () => Promise<void>; }
interface RpcParams { name?: string; arguments?: Object; protocolVersion?: string; }
interface RpcRequest { jsonrpc?: string; id?: string | number; method?: string; params?: RpcParams; }
export interface LocalMcpCallOutput { text: string; images: string[]; afterSend?: () => Promise<void>; }
interface McpContent { type: string; text?: string; data?: string; mimeType?: string; }
interface CachedCall { fingerprint: string; reply: Promise<LocalHttpReply>; }
interface McpTool { name: string; description: string; inputSchema: Object; }

/** 一连接一个请求；按字节收帧，避免中文和 TCP 分片破坏 Content-Length。 */
export class LocalHttpFrame {
  private bytes: Uint8Array = new Uint8Array(0);
  private complete: boolean = false;
  push(chunk: Uint8Array): LocalHttpRequest | null {
    if (this.complete || this.bytes.length + chunk.length > LOCAL_MCP_MAX_BYTES + 16384) throw new Error('http_request_too_large');
    const next = new Uint8Array(this.bytes.length + chunk.length);
    next.set(this.bytes); next.set(chunk, this.bytes.length); this.bytes = next;
    let boundary: number = -1;
    for (let i: number = 0; i + 3 < this.bytes.length; i++) {
      if (this.bytes[i] === 13 && this.bytes[i + 1] === 10 && this.bytes[i + 2] === 13 && this.bytes[i + 3] === 10) { boundary = i; break; }
    }
    if (boundary < 0) { if (this.bytes.length > 16384) throw new Error('http_headers_too_large'); return null; }
    if (boundary > 16384) throw new Error('http_headers_too_large');
    let header: string = '';
    for (let i: number = 0; i < boundary; i++) {
      const byte: number = this.bytes[i];
      if (byte > 127 || (byte < 32 && byte !== 13 && byte !== 10 && byte !== 9)) throw new Error('invalid_http_header');
      header += String.fromCharCode(byte);
    }
    const lines: string[] = header.split('\r\n');
    const first: string[] = lines[0].split(' ');
    if (first.length !== 3 || first[2] !== 'HTTP/1.1') throw new Error('invalid_http_request');
    const headers: Map<string, string> = new Map<string, string>();
    for (const line of lines.slice(1)) {
      const split: number = line.indexOf(':');
      if (split <= 0 || !/^[a-zA-Z0-9-]+$/.test(line.slice(0, split))) throw new Error('invalid_http_header');
      const key: string = line.slice(0, split).toLowerCase();
      if (headers.has(key)) throw new Error('duplicate_http_header');
      headers.set(key, line.slice(split + 1).trim());
    }
    if (headers.has('transfer-encoding')) throw new Error('unsupported_transfer_encoding');
    const rawLength: string = headers.get('content-length') ?? (first[0] === 'POST' ? '' : '0');
    if (!/^(0|[1-9][0-9]{0,6})$/.test(rawLength)) throw new Error('invalid_content_length');
    const length: number = Number(rawLength);
    if (length > LOCAL_MCP_MAX_BYTES) throw new Error('http_request_too_large');
    const end: number = boundary + 4 + length;
    if (this.bytes.length < end) return null;
    if (this.bytes.length !== end) throw new Error('http_pipelining_unsupported');
    this.complete = true;
    return { method: first[0], path: first[1], headers: headers, body: this.bytes.slice(boundary + 4) };
  }
}
function rpcError(id: string | number | null, code: number, message: string): string {
  return JSON.stringify({ jsonrpc: '2.0', id: id, error: { code: code, message: message } });
}
function rpcResult(id: string | number, result: Object): string { return JSON.stringify({ jsonrpc: '2.0', id: id, result: result }); }
export function localMcpGuard(request: LocalHttpRequest, token: string, port: number): number {
  if (request.headers.get('host') !== `127.0.0.1:${port}` && request.headers.get('host') !== `localhost:${port}`) return 403;
  const origin: string | undefined = request.headers.get('origin');
  if (origin !== undefined && origin !== `http://127.0.0.1:${port}` && origin !== `http://localhost:${port}`) return 403;
  if (token.length < 32 || request.headers.get('authorization') !== 'Bearer ' + token) return 401;
  if (request.path !== LOCAL_MCP_PATH) return 404;
  if (request.method !== 'POST') return 405;
  if ((request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') return 415;
  const version: string | undefined = request.headers.get('mcp-protocol-version');
  if (version !== undefined && !['2025-03-26', '2025-06-18', LOCAL_MCP_VERSION].includes(version)) return 400;
  return 200;
}
/** 无 Provider、写入执行器或确认令牌；所有业务效果交回现有 JIDE 宿主。 */
export class LocalMcpProtocol {
  private readonly host: LocalMcpHost;
  private readonly calls: Map<string, CachedCall> = new Map<string, CachedCall>();
  constructor(host: LocalMcpHost) { this.host = host; }
  async handle(text: string): Promise<LocalHttpReply> {
    try { return await this.dispatch(text); }
    catch (_error) {
      let id: string | number | null = null;
      try { const parsed: RpcRequest = JSON.parse(text) as RpcRequest;
        if (parsed !== null && (typeof parsed.id === 'string' || typeof parsed.id === 'number')) id = parsed.id;
      } catch (_parseError) { /* dispatch owns parse errors. */ }
      return { status: 200, body: rpcError(id, -32603, 'Local MCP host unavailable') };
    }
  }
  private async dispatch(text: string): Promise<LocalHttpReply> {
    let request: RpcRequest;
    try { request = JSON.parse(text) as RpcRequest; }
    catch (_error) { return { status: 200, body: rpcError(null, -32700, 'Parse error') }; }
    if (request === null || typeof request !== 'object' || Array.isArray(request) || request.jsonrpc !== '2.0' ||
      typeof request.method !== 'string' || (request.id !== undefined && typeof request.id !== 'string' &&
      (typeof request.id !== 'number' || !Number.isSafeInteger(request.id)))) {
      return { status: 200, body: rpcError(null, -32600, 'Invalid Request') };
    }
    if (request.id === undefined) return { status: 202, body: '' };
    const id: string | number = request.id;
    if (request.method === 'initialize') {
      const requested: string = request.params?.protocolVersion ?? '';
      const version: string = ['2025-03-26', '2025-06-18', LOCAL_MCP_VERSION].includes(requested) ? requested : LOCAL_MCP_VERSION;
      return { status: 200, body: rpcResult(id, { protocolVersion: version, capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'jidecards-local', version: '1.0.0' },
        instructions: 'Use JIDE tools on this device. Proposals require confirmation inside Jide Cards. Never claim pending proposals are saved. Call get_external_request_status with requestId to read the actual result. The listener follows the application lifecycle. Some tools require an open confirmation page. Never repeat a write after an uncertain transport failure without inspecting its status.' }) };
    }
    if (request.method === 'ping') return { status: 200, body: rpcResult(id, {}) };
    if (request.method === 'tools/list') {
      const tools: ProviderFunctionTool[] = await this.host.tools();
      const entries: McpTool[] = tools.map((tool: ProviderFunctionTool): McpTool => ({ name: tool.name,
        description: tool.description + '\n' + tool.rules, inputSchema: JSON.parse(tool.parametersJson) as Object }));
      return { status: 200, body: rpcResult(id, { tools: entries }) };
    }
    if (request.method !== 'tools/call') return { status: 200, body: rpcError(id, -32601, 'Method not found') };
    const params: RpcParams | undefined = request.params;
    if (params === undefined || params === null || typeof params.name !== 'string' ||
      (params.arguments !== undefined && (params.arguments === null || typeof params.arguments !== 'object' || Array.isArray(params.arguments)))) {
      return { status: 200, body: rpcError(id, -32602, 'Invalid params') };
    }
    const tools: ProviderFunctionTool[] = await this.host.tools();
    if (!tools.some((tool: ProviderFunctionTool): boolean => tool.name === params.name)) {
      return { status: 200, body: rpcError(id, -32602, 'Tool unavailable') };
    }
    if (params.name === 'get_external_request_status') return this.executeCall(id, params.name, JSON.stringify(params.arguments ?? {}));
    const key: string = JSON.stringify(id);
    const fingerprint: string = JSON.stringify(params);
    const previous: CachedCall | undefined = this.calls.get(key);
    if (previous !== undefined) return previous.fingerprint === fingerprint ? previous.reply :
      { status: 200, body: rpcError(id, -32600, 'Request id reused with different arguments') };
    if (this.calls.size >= 512) return { status: 200, body: rpcError(id, -32000, 'Session request limit reached; restart access') };
    const reply: Promise<LocalHttpReply> = this.executeCall(id, params.name, JSON.stringify(params.arguments ?? {}));
    this.calls.set(key, { fingerprint: fingerprint, reply: reply });
    return reply;
  }
  private async executeCall(id: string | number, name: string, argumentsJson: string): Promise<LocalHttpReply> {
    try {
      const output: LocalMcpCallOutput = await this.host.call(name, argumentsJson);
      const content: McpContent[] = [{ type: 'text', text: output.text }];
      for (const url of output.images) {
        const match: RegExpExecArray | null = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(url);
        if (match !== null) content.push({ type: 'image', mimeType: match[1], data: match[2] });
      }
      return { status: 200, body: rpcResult(id, { content: content, isError: false }), afterSend: output.afterSend };
    } catch (error) {
      const message: string = error instanceof Error ? error.message : 'tool_failed';
      const content: McpContent[] = [{ type: 'text', text: JSON.stringify({ error: message }) }];
      return { status: 200, body: rpcResult(id, { content: content, isError: true }) };
    }
  }
}
