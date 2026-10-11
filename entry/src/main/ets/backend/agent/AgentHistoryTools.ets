// SPDX-License-Identifier: AGPL-3.0-or-later
import { agentHistoryTools } from '../../model/agent/AgentHistoryToolDefinitions';
import { AgentHistoryToolSession } from '../../model/agent/AgentHistoryTools';
import { agentHistoryRepository } from './AgentHistoryFiles';
import { AgentToolRegistry, AgentReadToolHandler } from './AgentToolRegistry';

class HistoryReadHandler implements AgentReadToolHandler {
  private readonly session: AgentHistoryToolSession;
  private readonly name: string;
  constructor(session: AgentHistoryToolSession, name: string) { this.session = session; this.name = name; }
  execute(json: string): Promise<string> { return this.session.execute(this.name, json); }
}

/** @throws {Error} 历史仓库不可用时不注册虚假的读取能力，由页面初始化错误边界处理。 */
export function registerAgentHistoryTools(registry: AgentToolRegistry): void {
  const session: AgentHistoryToolSession = new AgentHistoryToolSession(agentHistoryRepository());
  for (const definition of agentHistoryTools()) {
    const name: string = definition.name;
    registry.registerRead(name, new HistoryReadHandler(session, name));
  }
}
