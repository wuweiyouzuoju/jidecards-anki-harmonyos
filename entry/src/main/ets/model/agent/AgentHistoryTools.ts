// SPDX-License-Identifier: AGPL-3.0-or-later
import { AgentHistoryRepository } from './AgentHistoryRepository';
import type { AgentHistorySearch } from './AgentHistoryRepository';
import { parseAgentToolJsonObject, AgentToolSchemaError } from './AgentToolSchemas';

interface HistoryToolArguments {
  query?: string; offset?: number; limit?: number; revision?: string;
  conversationId?: string; messageIndex?: number; length?: number;
}
/** 每个JIDE页面独占发现集合；正文投影只读，绝不触碰检查点和Scope。 */
export class AgentHistoryToolSession {
  private readonly repository: AgentHistoryRepository;
  private readonly discovered: Map<string, string> = new Map<string, string>();
  constructor(repository: AgentHistoryRepository) { this.repository = repository; }
  async execute(name: string, json: string): Promise<string> {
    const args: HistoryToolArguments = parseAgentToolJsonObject(name, json) as HistoryToolArguments;
    const allowed: string[] = name === 'search_conversation_history' ? ['query', 'offset', 'limit', 'revision'] :
      ['conversationId', 'revision', 'messageIndex', 'offset', 'length'];
    if (Object.keys(args).some((key: string): boolean => !allowed.includes(key))) throw new AgentToolSchemaError('invalid_tool_arguments');
    for (const key of ['offset', 'limit', 'messageIndex', 'length']) {
      const value: Object | undefined = (args as Record<string, Object>)[key];
      if (value !== undefined && (typeof value !== 'number' || !Number.isInteger(value) || value < (key === 'length' || key === 'limit' ? 1 : 0))) {
        throw new AgentToolSchemaError('invalid_tool_arguments');
      }
    }
    if (args.revision !== undefined && (typeof args.revision !== 'string' || args.revision.length > 200)) throw new AgentToolSchemaError('invalid_tool_arguments');
    if (name === 'search_conversation_history') {
      if (typeof args.query !== 'string' || args.query.length > 200 || (args.limit ?? 20) > 20 ||
        ((args.offset ?? 0) > 0 && !args.revision)) throw new AgentToolSchemaError('invalid_tool_arguments');
      const result: AgentHistorySearch = await this.repository.search(args.query, args.offset ?? 0, args.limit ?? 20, args.revision ?? '');
      for (const item of result.items) this.discovered.set(item.id, result.revision);
      return JSON.stringify(result);
    }
    if (name !== 'read_conversation_history' || typeof args.conversationId !== 'string' || typeof args.revision !== 'string' ||
      (args.length ?? 12000) > 12000) throw new AgentToolSchemaError('invalid_tool_arguments');
    if (this.discovered.get(args.conversationId) !== args.revision) throw new Error('history_id_not_discovered');
    const value = await this.repository.read(args.conversationId, args.revision);
    const at: number = args.messageIndex ?? 0; const offset: number = args.offset ?? 0;
    if (at >= value.messages.length || offset > value.messages[at].text.length) throw new Error('history_position_invalid');
    const message = value.messages[at]; const text: string = message.text.slice(offset, offset + (args.length ?? 12000));
    const moreText: boolean = offset + text.length < message.text.length;
    return JSON.stringify({ conversationId: value.id, title: value.title, updatedAt: value.updatedAt,
      revision: args.revision, messageIndex: at, role: message.role, text: text, totalCharacters: message.text.length,
      nextMessageIndex: moreText ? at : at + 1 < value.messages.length ? at + 1 : -1,
      nextOffset: moreText ? offset + text.length : 0,
      savedHistoryLimits: 'Saved visible text only; up to 200 latest messages, 20000 characters per text. Earlier truncation cannot be recovered. Redacted media/secrets; no checkpoints, tool replay or write authorization.' });
  }
}
