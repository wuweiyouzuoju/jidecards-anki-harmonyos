// SPDX-License-Identifier: AGPL-3.0-or-later
import { agentMarkupToPlainText } from './AgentDocumentText';
import type { AgentSearchSourceEvent } from './AgentPolicy';
import type { ProviderFunctionTool } from './ProviderProtocol';
import type { AgentSearchProvider } from './AgentSearchProvider';

export const AGENT_WEB_BODY_LIMIT: number = 2 * 1024 * 1024;
export interface AgentWebResponse { status: number; body: string; contentType: string; location: string; }
export interface AgentWebHttp {
  get(url: string, headers: Record<string, string>): Promise<AgentWebResponse>;
  post(url: string, headers: Record<string, string>, body: string): Promise<AgentWebResponse>;
  cancel(): void;
}
export interface AgentWebResult {
  status: 'completed';
  url: string;
  title: string;
  text: string;
  nextOffset: number;
  totalLength: number;
}
export interface AgentWebSearchItem { url: string; title: string; description: string; }
export interface AgentWebSearchResult { status: 'completed'; query: string; results: AgentWebSearchItem[]; }
interface WebArguments { url?: string; query?: string; limit?: number; offset?: number; length?: number; }
interface BraveResponse { web?: BraveResults; }
interface BraveResults { results?: AgentWebSearchItem[]; }
interface DoubaoSearchItem { Url?: string; Title?: string; Summary?: string; Snippet?: string; }
interface DoubaoSearchResult { ResultCount?: number; WebResults?: DoubaoSearchItem[] | null; }
interface DoubaoMetadata { Error?: Object; }
interface DoubaoSearchResponse { Result?: DoubaoSearchResult; ResponseMetadata?: DoubaoMetadata; }
interface DoubaoSearchFilter { NeedUrl: boolean; }
interface DoubaoSearchRequest { Query: string; SearchType: string; Count: number; Filter: DoubaoSearchFilter; ContentFormats: string; }
interface WebSourceOutput { status?: string; results?: AgentWebSearchItem[]; url?: string; title?: string; }

export function filterAgentWebTools(tools: ProviderFunctionTool[], allowWeb: boolean): ProviderFunctionTool[] {
  return tools.filter((tool: ProviderFunctionTool): boolean => allowWeb ||
    (tool.name !== 'web_search' && tool.name !== 'read_webpage'));
}

/** 网络解析后的地址也须为公网，避免域名指向设备内网。 */
export function isAgentPublicIp(address: string): boolean {
  const value: string = address.toLowerCase();
  if (value.includes(':')) {
    return /^[23][0-9a-f]{3}:[0-9a-f:]+$/.test(value) && !value.startsWith('2001:db8:') &&
      !value.startsWith('2001:0:') && !value.startsWith('2002:');
  }
  const parts: number[] = value.split('.').map((part: string): number => Number(part));
  if (parts.length !== 4 || parts.some((part: number): boolean => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  return parts[0] > 0 && parts[0] < 224 && parts[0] !== 10 && parts[0] !== 127 &&
    !(parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) &&
    !(parts[0] === 169 && parts[1] === 254) && !(parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) &&
    !(parts[0] === 192 && (parts[1] === 168 || parts[1] === 0 || parts[1] === 2)) &&
    !(parts[0] === 198 && (parts[1] === 18 || parts[1] === 19 || parts[1] === 51)) &&
    !(parts[0] === 203 && parts[1] === 0 && parts[2] === 113);
}

/** 限定公开域名、HTTPS 和默认端口，重定向也必须重新验证。 */
export function validateAgentWebUrl(value: string): string {
  const text: string = value.trim();
  const match: RegExpMatchArray | null = text.match(/^https:\/\/([^/?#]+)([^#]*)?(?:#.*)?$/i);
  if (text.length > 2048 || match === null || /[\s\\\u0000-\u001f]/.test(text)) {
    throw new Error('web_url_invalid');
  }
  const authority: string = match[1].toLowerCase();
  const host: string = authority.endsWith(':443') ? authority.slice(0, -4) : authority;
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) ||
    /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid)$/.test(host)) {
    throw new Error('web_url_not_public');
  }
  const suffix: string = match[2] || '/';
  return `https://${host}${suffix.startsWith('?') ? '/' : ''}${suffix}`;
}

export function agentWebRedirectUrl(base: string, location: string): string {
  if (location.startsWith('https://')) { return validateAgentWebUrl(location); }
  if (location.startsWith('//')) { return validateAgentWebUrl(`https:${location}`); }
  const origin: string = base.slice(0, base.indexOf('/', 8));
  if (location.startsWith('/')) { return validateAgentWebUrl(origin + location); }
  if (/^[a-z][a-z0-9+.-]*:/i.test(location) || location.trim().length === 0) {
    throw new Error('web_redirect_invalid');
  }
  const path: string = base.split('?')[0];
  if (location.startsWith('?')) { return validateAgentWebUrl(path + location); }
  return validateAgentWebUrl(path.slice(0, path.lastIndexOf('/') + 1) + location);
}

function argumentsOf(json: string, keys: string[]): WebArguments {
  const parsed: Object = JSON.parse(json) as Object;
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed) ||
    Object.keys(parsed).some((key: string): boolean => keys.indexOf(key) < 0)) {
    throw new Error('web_arguments_invalid');
  }
  return parsed as WebArguments;
}
function boundedInteger(value: number | undefined, fallback: number, max: number, min: number): number {
  if (value === undefined) { return fallback; }
  if (!Number.isInteger(value) || value < min || value > max) { throw new Error('web_arguments_invalid'); }
  return value;
}
function successful(response: AgentWebResponse): void {
  if (response.status < 200 || response.status >= 300) { throw new Error(`web_http_${response.status}`); }
}

export class AgentWebAccess {
  private readonly http: AgentWebHttp;
  private cancelled: boolean = false;
  constructor(http: AgentWebHttp) { this.http = http; }
  begin(): void { this.cancelled = false; }
  cancel(): void { this.cancelled = true; this.http.cancel(); }
  private checkCancellation(): void { if (this.cancelled) { throw new Error('cancelled'); } }

  async search(argumentsJson: string, apiKey: string, provider: AgentSearchProvider = 'doubao'): Promise<string> {
    this.checkCancellation();
    const args: WebArguments = argumentsOf(argumentsJson, ['query', 'limit']);
    if (typeof args.query !== 'string' || args.query.trim().length === 0 || args.query.length > 100) {
      throw new Error('web_arguments_invalid');
    }
    const limit: number = boundedInteger(args.limit, 5, 10, 1);
    if (apiKey.trim().length === 0) { throw new Error('web_search_key_missing'); }
    let response: AgentWebResponse;
    if (provider === 'doubao') {
      const request: DoubaoSearchRequest = { Query: args.query.trim(), SearchType: 'web', Count: limit,
        Filter: { NeedUrl: true }, ContentFormats: 'text' };
      response = await this.http.post('https://open.feedcoopapi.com/search_api/web_search',
        { 'Accept': 'application/json', 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey.trim()}` },
        JSON.stringify(request));
    } else {
      response = await this.http.get(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(args.query.trim())}&count=${limit}`,
        { 'Accept': 'application/json', 'X-Subscription-Token': apiKey.trim() });
    }
    this.checkCancellation();
    successful(response);
    let items: AgentWebSearchItem[] = [];
    if (provider === 'doubao') {
      const raw: DoubaoSearchResponse = JSON.parse(response.body) as DoubaoSearchResponse;
      if (raw === null || typeof raw !== 'object' ||
        (raw.ResponseMetadata?.Error !== undefined && raw.ResponseMetadata?.Error !== null) ||
        raw.Result === undefined || raw.Result === null) { throw new Error('web_search_response_invalid'); }
      if (raw.Result.ResultCount === 0 && (raw.Result.WebResults === undefined || raw.Result.WebResults === null)) {
        items = [];
      } else {
        if (!Array.isArray(raw.Result.WebResults)) { throw new Error('web_search_response_invalid'); }
        for (const item of raw.Result.WebResults) {
          if (item === null || typeof item.Url !== 'string' || typeof item.Title !== 'string') { continue; }
          const description: string = typeof item.Summary === 'string' && item.Summary.trim() !== '' ?
            item.Summary : (typeof item.Snippet === 'string' ? item.Snippet : '');
          items.push({ url: item.Url, title: item.Title, description: description });
        }
      }
    } else {
      const raw: BraveResponse = JSON.parse(response.body) as BraveResponse;
      if (raw === null || typeof raw !== 'object' || raw.web === undefined || !Array.isArray(raw.web.results)) {
        throw new Error('web_search_response_invalid');
      }
      items = raw.web.results;
    }
    const results: AgentWebSearchItem[] = [];
    for (const item of items) {
      if (item === null || typeof item.url !== 'string' || typeof item.title !== 'string') { continue; }
      let url: string;
      try { url = validateAgentWebUrl(item.url); } catch (error) { continue; }
      if (results.some((result: AgentWebSearchItem): boolean => result.url === url)) { continue; }
      results.push({ url: url, title: agentMarkupToPlainText(item.title).slice(0, 300),
        description: typeof item.description === 'string' ? agentMarkupToPlainText(item.description).slice(0, 2000) : '' });
      if (results.length >= limit) { break; }
    }
    const output: AgentWebSearchResult = { status: 'completed', query: args.query.trim(), results: results };
    return JSON.stringify(output);
  }

  async read(argumentsJson: string): Promise<string> {
    this.checkCancellation();
    const args: WebArguments = argumentsOf(argumentsJson, ['url', 'offset', 'length']);
    if (typeof args.url !== 'string') { throw new Error('web_arguments_invalid'); }
    let url: string = validateAgentWebUrl(args.url);
    const offset: number = boundedInteger(args.offset, 0, AGENT_WEB_BODY_LIMIT, 0);
    const length: number = boundedInteger(args.length, 12000, 24000, 1);
    for (let redirects: number = 0; redirects <= 4; redirects++) {
      const response: AgentWebResponse = await this.http.get(url, { 'Accept': 'text/html, text/plain, application/xhtml+xml' });
      this.checkCancellation();
      if ([301, 302, 303, 307, 308].indexOf(response.status) >= 0) {
        if (redirects === 4) { throw new Error('web_redirect_limit'); }
        url = agentWebRedirectUrl(url, response.location);
        continue;
      }
      successful(response);
      const type: string = response.contentType.toLowerCase();
      if (!/^(text\/html|text\/plain|application\/xhtml\+xml)(?:;|$)/.test(type)) {
        throw new Error('web_content_type_unsupported');
      }
      const plain: boolean = type.startsWith('text/plain');
      const titleMatch: RegExpMatchArray | null = plain ? null : response.body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
      const text: string = plain ? response.body.trim() : agentMarkupToPlainText(response.body);
      if (text.length === 0) { throw new Error('web_content_empty'); }
      const output: AgentWebResult = { status: 'completed', url: url,
        title: titleMatch === null ? url : agentMarkupToPlainText(titleMatch[1]).slice(0, 300),
        text: text.slice(offset, offset + length), totalLength: text.length,
        nextOffset: offset + length < text.length ? offset + length : -1 };
      return JSON.stringify(output);
    }
    throw new Error('web_redirect_limit');
  }
}

/** 仅消费真正执行成功的本地联网工具输出；正文中的链接不是搜索证据。 */
export function agentWebResultSources(name: string, outputJson: string): AgentSearchSourceEvent[] {
  const sources: AgentSearchSourceEvent[] = [];
  if (name !== 'web_search' && name !== 'read_webpage') { return sources; }
  const output: WebSourceOutput = JSON.parse(outputJson) as WebSourceOutput;
  if (output === null || output.status !== 'completed') { throw new Error('web_result_invalid'); }
  let items: AgentWebSearchItem[] = [];
  if (name === 'web_search') {
    if (output.results !== undefined) { items = output.results; }
  } else {
    const url: string = typeof output.url === 'string' ? output.url : '';
    const title: string = typeof output.title === 'string' ? output.title : '';
    items.push({ url: url, title: title, description: '' });
  }
  if (!Array.isArray(items)) { throw new Error('web_result_invalid'); }
  for (const item of items) {
    if (typeof item.url !== 'string' || typeof item.title !== 'string') { continue; }
    try { sources.push({ kind: 'search_source', url: validateAgentWebUrl(item.url), title: item.title }); }
    catch (error) { /* Discard unsupported source URLs. */ }
  }
  return sources;
}
