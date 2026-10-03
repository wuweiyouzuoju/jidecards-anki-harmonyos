// SPDX-License-Identifier: AGPL-3.0-or-later
import { AgentDocumentAccess, agentDocumentTools } from '../../model/agent/AgentDocuments';
import type { AgentDocumentToolOutput } from '../../model/agent/AgentDocuments';
import { AgentToolRegistry } from './AgentToolRegistry';
import type { AgentReadToolHandler } from './AgentToolRegistry';

class DocumentReadHandler implements AgentReadToolHandler {
  private access: AgentDocumentAccess;
  private name: string;
  constructor(access: AgentDocumentAccess, name: string) { this.access = access; this.name = name; }
  cancel(): void { this.access.cancel(); }
  /** @throws {Error} 资料/OCR 失败由 Runner 显示并允许模型修正。 */
  async execute(json: string): Promise<string> { return (await this.executeContent(json)).outputJson; }
  /** @throws {Error} 保留页面图片作为独立 Provider 内容，不进入工具诊断 JSON。 */
  executeContent(json: string): Promise<AgentDocumentToolOutput> { return this.access.execute(this.name, json); }
}
export function registerAgentDocumentTools(registry: AgentToolRegistry, access: AgentDocumentAccess): void {
  for (const tool of agentDocumentTools()) registry.registerRead(tool.name, new DocumentReadHandler(access, tool.name));
}
