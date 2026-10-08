// SPDX-License-Identifier: AGPL-3.0-or-later
import { rcp } from '@kit.RemoteCommunicationKit';
import { connection } from '@kit.NetworkKit';
import { UTF8解码 } from '../../proto/core/utf8';
import { AGENT_WEB_BODY_LIMIT, AgentWebAccess, isAgentPublicIp } from '../../model/agent/AgentWeb';
import type { AgentWebHttp, AgentWebResponse } from '../../model/agent/AgentWeb';
import { AgentToolRegistry } from './AgentToolRegistry';
import type { AgentReadToolHandler } from './AgentToolRegistry';
import { loadAgentWebEnabled, loadAgentSearchProvider } from './AgentSettingsStore';
import { loadAgentSearchSecret } from './AgentSecretStore';
import type { AgentSearchProvider } from '../../model/agent/AgentSearchProvider';

function headerText(headers: rcp.ResponseHeaders, name: string): string {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() !== name) { continue; }
    const value: string | string[] | undefined = headers[key];
    if (value === undefined) { return ''; }
    return typeof value === 'string' ? value : value.join(', ');
  }
  return '';
}

/** RCP 提供关闭自动跳转和流式收取，避免新版 HTTP API 的运行时版本限制。 */
class AgentWebHttpClient implements AgentWebHttp {
  private active: rcp.Session | null = null;
  private generation: number = 0;
  cancel(): void {
    this.generation++;
    try { this.active?.cancel(); } catch (error) { /* The operation generation still rejects late results. */ }
  }

  /** @throws {Error} 请求失败、取消或响应超过上限，交由 Runner 工具错误处理。 */
  async get(url: string, headers: Record<string, string>): Promise<AgentWebResponse> {
    return this.request(url, headers, 'GET');
  }

  /** @throws {Error} 搜索请求失败，交由 Runner 工具错误处理。 */
  async post(url: string, headers: Record<string, string>, body: string): Promise<AgentWebResponse> {
    return this.request(url, headers, 'POST', body);
  }

  /** @throws {Error} 请求失败、取消或响应超过上限。 */
  private async request(url: string, headers: Record<string, string>, method: string, body?: string): Promise<AgentWebResponse> {
    const chunks: Uint8Array[] = [];
    let bytes: number = 0;
    let oversized: boolean = false;
    const session: rcp.Session = rcp.createSession();
    this.active = session;
    const generation: number = ++this.generation;
    const configuration: rcp.Configuration = {
      transfer: { autoRedirect: false, timeout: { connectMs: 15000, transferMs: 30000 } },
      tracing: { httpEventsHandler: {
        onDataReceive: (buffer: ArrayBuffer): void => {
          if (oversized) { return; }
          bytes += buffer.byteLength;
          if (bytes > AGENT_WEB_BODY_LIMIT) { oversized = true; session.cancel(); return; }
          chunks.push(new Uint8Array(buffer).slice());
        }
      } }
    };
    try {
      const host: string = url.slice(8).split('/')[0].split('?')[0];
      const addresses: connection.NetAddress[] = await connection.getAddressesByName(host);
      if (generation !== this.generation) { throw new Error('cancelled'); }
      if (addresses.length === 0 || addresses.some((address: connection.NetAddress): boolean => !isAgentPublicIp(address.address))) {
        throw new Error('web_url_not_public');
      }
      configuration.dns = { dnsRules: [{ host: host, port: 443,
        ipAddresses: addresses.map((address: connection.NetAddress): string => address.address) }] };
      const request: rcp.Request = new rcp.Request(url, method, headers, body, undefined, undefined, configuration);
      const response: rcp.Response = await session.fetch(request);
      if (oversized) { throw new Error('web_response_too_large'); }
      const data: Uint8Array = new Uint8Array(bytes);
      let offset: number = 0;
      for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
      return { status: response.statusCode, body: UTF8解码(data),
        contentType: headerText(response.headers, 'content-type'), location: headerText(response.headers, 'location') };
    } catch (error) {
      if (oversized) { throw new Error('web_response_too_large'); }
      if (generation !== this.generation) { throw new Error('cancelled'); }
      if (error instanceof Error && error.message === 'web_url_not_public') { throw error; }
      // 不把含请求头或服务器正文的系统诊断送入对话。
      throw new Error('web_request_failed');
    } finally {
      if (this.active === session) { this.active = null; }
      session.close();
    }
  }
}

class AgentWebReadTool implements AgentReadToolHandler {
  private readonly access: AgentWebAccess;
  private readonly name: string;
  constructor(access: AgentWebAccess, name: string) { this.access = access; this.name = name; }
  cancel(): void { this.access.cancel(); }
  /** @throws {Error} 联网开关或配置不可用，交由 Runner 返回真实工具错误。 */
  async execute(json: string): Promise<string> {
    this.access.begin();
    if (!await loadAgentWebEnabled()) { throw new Error('web_search_disabled'); }
    if (this.name !== 'web_search') { return this.access.read(json); }
    const provider: AgentSearchProvider = await loadAgentSearchProvider();
    return this.access.search(json, await loadAgentSearchSecret(provider), provider);
  }
}

export class AgentWebTools {
  private readonly access: AgentWebAccess = new AgentWebAccess(new AgentWebHttpClient());
  register(registry: AgentToolRegistry): void {
    registry.registerRead('web_search', new AgentWebReadTool(this.access, 'web_search'));
    registry.registerRead('read_webpage', new AgentWebReadTool(this.access, 'read_webpage'));
  }
}
