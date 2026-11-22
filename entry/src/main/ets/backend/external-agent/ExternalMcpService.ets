// SPDX-License-Identifier: AGPL-3.0-or-later
import { deviceInfo } from '@kit.BasicServicesKit';
import { ExternalMcpLibrary } from './ExternalMcpLibrary';
import { LocalMcpServer } from './LocalMcpServer';
import { LocalMcpCallOutput, LocalMcpHost, LOCAL_MCP_PORT } from '../../model/external-agent/LocalMcpProtocol';
import { ProviderFunctionTool } from '../../model/agent/ProviderProtocol';
import { loadExternalMcpToken, saveExternalMcpToken } from '../agent/AgentSecretStore';
import { linkRandom } from '../device-link/LanCrypto';

export const EXTERNAL_MCP_STATE_KEY: string = 'externalMcpState';
export function isExternalMcpDevice(): boolean { return deviceInfo.deviceType === '2in1'; }

interface McpHeaders { Authorization: string; }
interface McpEndpoint { type: string; url: string; headers: McpHeaders; }
interface McpServers { jidecards: McpEndpoint; }
interface McpConfiguration { mcpServers: McpServers; }

class ExternalMcpService implements LocalMcpHost {
  private library: ExternalMcpLibrary | null = null;
  private host: LocalMcpHost | null = null;
  private server: LocalMcpServer | null = null;
  private token: string = '';
  private busy: boolean = false;
  private disposed: boolean = false;
  private accessGeneration: number = 0;
  private port: number = LOCAL_MCP_PORT;

  private state(state: string): void { AppStorage.setOrCreate<string>(EXTERNAL_MCP_STATE_KEY, state); }
  attach(host: LocalMcpHost): void { this.host = host; }
  detach(host: LocalMcpHost): void { if (this.host === host) this.host = null; }

  async tools(): Promise<ProviderFunctionTool[]> {
    const host: LocalMcpHost = this.activeHost();
    return await host.tools();
  }

  async call(name: string, args: string): Promise<LocalMcpCallOutput> {
    const host: LocalMcpHost = this.activeHost();
    return await host.call(name, args);
  }

  private activeHost(): LocalMcpHost {
    if (this.host !== null) return this.host;
    if (this.library === null) this.library = new ExternalMcpLibrary();
    return this.library;
  }
  async restore(bundleName: string = ''): Promise<void> {
    this.disposed = false;
    // 两个独立应用可同时启用 MCP，连接和令牌按应用分开。
    this.port = bundleName === 'com.jide.kapian.pc' ? LOCAL_MCP_PORT + 1 : LOCAL_MCP_PORT;
    await this.change(true, false);
  }
  async setEnabled(enabled: boolean): Promise<void> { await this.change(enabled, true); }

  private async change(enabled: boolean, explicit: boolean): Promise<void> {
    if (this.disposed || this.busy || !isExternalMcpDevice()) return;
    this.busy = true;
    this.state('busy');
    try {
      if (!enabled) {
        this.closeServer();
        await saveExternalMcpToken('');
        this.state('off');
        return;
      }
      if (this.server !== null) { this.state('on'); return; }
      const saved: string = await loadExternalMcpToken();
      if (this.disposed) return;
      if (!explicit && saved === '') { this.state('off'); return; }
      const token: string = saved === '' ? await linkRandom(32) : saved;
      if (this.disposed) return;
      const server: LocalMcpServer = new LocalMcpServer(this, (): void => {
        if (this.server !== server) return;
        this.server = null; this.token = ''; this.accessGeneration++; this.state('error');
      }, this.port);
      this.server = server;
      await server.start(token);
      if (this.disposed || this.server !== server) return;
      if (saved === '') await saveExternalMcpToken(token);
      if (this.disposed || this.server !== server) return;
      this.token = token;
      this.state('on');
    } catch (_error) {
      this.closeServer();
      if (!this.disposed) this.state(enabled ? 'error' : 'disable_error');
    } finally { this.busy = false; }
  }

  configuration(): string {
    if (this.token === '') return '';
    const config: McpConfiguration = { mcpServers: { jidecards: { type: 'http',
      url: `http://127.0.0.1:${this.port}/mcp`, headers: { Authorization: 'Bearer ' + this.token } } } };
    return JSON.stringify(config, null, 2);
  }

  generation(): number { return this.accessGeneration; }
  isRunning(): boolean { return this.token !== ''; }
  private closeServer(): void {
    const server: LocalMcpServer | null = this.server;
    this.server = null; this.token = ''; this.library = null; this.accessGeneration++;
    server?.stop();
  }
  dispose(): void { this.disposed = true; this.closeServer(); this.host = null; }
}

export const externalMcpService = new ExternalMcpService();
