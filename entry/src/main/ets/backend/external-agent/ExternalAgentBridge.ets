// SPDX-License-Identifier: AGPL-3.0-or-later
import { externalToolOutcomeStatus } from '../../model/external-agent/ExternalRequestStatus';
import type { ProviderFunctionTool } from '../../model/agent/ProviderProtocol';
import type { AgentToolCall } from '../../model/agent/AgentTypes';
import { AgentToolDiscovery } from '../../model/agent/AgentToolDiscovery';
import { AgentToolRegistry, AgentToolResult } from '../agent/AgentToolRegistry';
import { LocalMcpHost, LocalMcpCallOutput } from '../../model/external-agent/LocalMcpProtocol';

export interface ExternalAgentHost {
  tools: () => Promise<ProviderFunctionTool[]>;
  ready: () => boolean;
  receive: (call: AgentToolCall, result: AgentToolResult) => Promise<string>;
  status: (argumentsJson: string) => string;
  /** 仅原生 UI 确认可授权立即生效的主题/导航，外部参数不能冒充用户指令。 */
  immediate: (call: AgentToolCall) => Promise<AgentToolResult>;
  afterSend?: (call: AgentToolCall) => Promise<void>;
}
const STATUS_TOOL: ProviderFunctionTool = {
  name: 'get_external_request_status', description: '读取本次本地 MCP 请求在记得中的确认、保存或失败状态及结果。',
  parametersJson: '{"type":"object","properties":{"requestId":{"type":"string","minLength":1}},"required":["requestId"],"additionalProperties":false}',
  exampleArgumentsJson: '{"requestId":"external-1"}', rules: 'Read only. awaiting_confirmation is not saved. Rejected/failed/unknown results must never be reported as success.'
};

/** 外部 Agent 与应用 Provider 共享真实 Registry；不持有写入执行器和确认令牌。 */
export class ExternalAgentBridge implements LocalMcpHost {
  private readonly registry: AgentToolRegistry;
  private readonly host: ExternalAgentHost;
  private busy: boolean = false;
  private sequence: number = 0;
  private closed: boolean = false;
  constructor(registry: AgentToolRegistry, host: ExternalAgentHost) { this.registry = registry; this.host = host; }
  isBusy(): boolean { return this.busy; }
  close(): void { this.closed = true; }
  async tools(): Promise<ProviderFunctionTool[]> {
    if (this.closed) throw new Error('external_session_closed');
    return (await this.host.tools()).filter((tool: ProviderFunctionTool): boolean =>
      tool.name === 'discover_tools' || this.registry.supports(tool.name)).concat([STATUS_TOOL]);
  }
  /** @throws {Error} 工具、发现或 UI 宿主失败，MCP 返回 isError。 */
  async call(name: string, argumentsJson: string): Promise<LocalMcpCallOutput> {
    if (this.closed) throw new Error('external_session_closed');
    if (name === STATUS_TOOL.name) return { text: this.host.status(argumentsJson), images: [] };
    if (this.busy || !this.host.ready()) throw new Error('external_session_busy');
    this.busy = true;
    try {
      const catalog: ProviderFunctionTool[] = await this.tools();
      if (this.closed) throw new Error('external_session_closed');
      if (!this.host.ready()) throw new Error('external_session_busy');
      if (!catalog.some((tool: ProviderFunctionTool): boolean => tool.name === name)) throw new Error('tool_unavailable');
      if (name === 'discover_tools') return { text: new AgentToolDiscovery(catalog).discover(argumentsJson), images: [] };
      const call: AgentToolCall = { id: `external-${Date.now()}-${++this.sequence}`, name: name, argumentsJson: argumentsJson };
      const result: AgentToolResult = ['set_theme_mode', 'navigate_app'].includes(name) ?
        await this.host.immediate(call) : await this.registry.execute(call);
      // 已生成的提案即使客户端断连也保留给本机确认；关闭不能重放写入。
      const requestId: string = await this.host.receive(call, result);
      const text: string = JSON.stringify({ requestId: requestId, output: JSON.parse(result.outputJson) as Object,
        status: result.draft !== null || result.action !== undefined ? 'awaiting_confirmation' :
          result.clarification !== null ? 'awaiting_user' : externalToolOutcomeStatus(result.outputJson) });
      return { text: text, images: (result.images ?? []).map((image): string => image.imageUrl),
        afterSend: (): Promise<void> => this.host.afterSend?.(call) ?? Promise.resolve() };
    } finally { this.busy = false; }
  }
}
