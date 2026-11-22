// SPDX-License-Identifier: AGPL-3.0-or-later
import { AgentScope } from '../agent/AgentScope';
import { CardAgentTools } from '../agent/CardAgentTools';
import { AgentToolRegistry, AgentToolResult } from '../agent/AgentToolRegistry';
import { agentFunctionTools } from '../../model/agent/AgentToolCatalog';
import { ProviderFunctionTool } from '../../model/agent/ProviderProtocol';
import { LocalMcpCallOutput, LocalMcpHost } from '../../model/external-agent/LocalMcpProtocol';
import { externalToolOutcomeStatus } from '../../model/external-agent/ExternalRequestStatus';
import { syncActivity } from '../../model/SyncSettings';

const LIBRARY_READS: string[] = ['list_decks', 'list_notetypes', 'list_tags', 'search_cards', 'search_notes',
  'get_note_context', 'read_note_field', 'get_note_type_capabilities', 'get_notetype_details',
  'get_card_statistics', 'get_learning_overview'];

/** 无确认页时只注册卡库读取路径，权限范围不与聊天会话混用。 */
export class ExternalMcpLibrary implements LocalMcpHost {
  private readonly registry: AgentToolRegistry = new AgentToolRegistry();
  private readonly catalog: ProviderFunctionTool[];
  private busy: boolean = false;

  constructor() {
    new CardAgentTools(new AgentScope()).register(this.registry);
    this.catalog = agentFunctionTools('assistant').filter((tool: ProviderFunctionTool): boolean =>
      LIBRARY_READS.includes(tool.name) && this.registry.supports(tool.name));
  }

  async tools(): Promise<ProviderFunctionTool[]> { return this.catalog; }
  async call(name: string, args: string): Promise<LocalMcpCallOutput> {
    if (!LIBRARY_READS.includes(name)) throw new Error('external_confirmation_page_required');
    if (this.busy || syncActivity.isCollectionBusy()) throw new Error('external_session_busy');
    this.busy = true;
    try {
      const result: AgentToolResult = await this.registry.execute({ id: 'external-library', name: name, argumentsJson: args });
      return { text: JSON.stringify({ output: JSON.parse(result.outputJson) as Object,
        status: externalToolOutcomeStatus(result.outputJson) }), images: [] };
    } finally { this.busy = false; }
  }
}
