// SPDX-License-Identifier: AGPL-3.0-or-later

import { 牌组服务 } from '../牌组服务';
import { 笔记类型服务 } from '../笔记类型服务';
import { 搜索服务 } from '../搜索服务';
import type { DeckTreeNode } from '../../proto/messages/DeckMessages';
import type { NotetypeCapabilities, NotetypeNameId } from '../../proto/messages/NotetypeMessages';
import { AgentScope } from './AgentScope';
import { AgentWorkspaceStore } from './AgentWorkspaceStore';
import { AgentToolRegistry } from './AgentToolRegistry';
import type { AgentReadToolHandler, AgentActionToolHandler } from './AgentToolRegistry';
import { createAgentAction } from '../../model/agent/AgentAction';
import type { AgentAction } from '../../model/agent/AgentAction';
import { decodeExtensionArguments } from '../../model/agent/AgentExtensionTools';
import type { AgentExtensionArguments } from '../../model/agent/AgentExtensionTools';
import type { AgentMemory, AgentMemoryChange } from '../../model/agent/AgentMemory';

function findDeck(root: DeckTreeNode, id: number): DeckTreeNode | null {
  if (root.deckId === id) { return root; }
  for (const child of root.children) {
    const found: DeckTreeNode | null = findDeck(child, id);
    if (found !== null) { return found; }
  }
  return null;
}

export interface AnalysisActionPayload {
  query: string;
  totalMatched: number;
  alreadyRead: number;
  noteIds?: number[];
  requestedNoteIds?: number[];
}

export function deckNameExists(root: DeckTreeNode, name: string, prefix: string = ''): boolean {
  const full: string = prefix.length === 0 ? root.name : `${prefix}::${root.name}`;
  if (root.name === name || full === name) { return true; }
  for (const child of root.children) {
    if (deckNameExists(child, name, root.deckId === 0 ? '' : full)) { return true; }
  }
  return false;
}

export async function assertNewNotetypeName(notetypes: 笔记类型服务, name: string): Promise<void> {
  const values: NotetypeNameId[] = await notetypes.获取笔记类型名列表();
  if (values.some((item: NotetypeNameId): boolean => item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    throw new Error('notetype_name_exists');
  }
}

class AuxiliaryReadHandler implements AgentReadToolHandler {
  private readonly owner: AgentAuxiliaryTools;
  private readonly name: string;
  constructor(owner: AgentAuxiliaryTools, name: string) { this.owner = owner; this.name = name; }
  /** @throws {Error} 工作区读取失败，由 Runner 的工具调用边界返回失败结果。 */
  execute(json: string): Promise<string> { return this.owner.read(this.name, json); }
}
class AuxiliaryActionHandler implements AgentActionToolHandler {
  private readonly owner: AgentAuxiliaryTools;
  private readonly name: string;
  constructor(owner: AgentAuxiliaryTools, name: string) { this.owner = owner; this.name = name; }
  /** @throws {Error} 工作区偏好读取或写入失败，由工具执行边界返回失败结果。 */
  propose(json: string): Promise<AgentAction> { return this.owner.propose(this.name, json); }
}

/** 辅助语义读取与提案；不持有确认账本，不执行提案写入。 */
export class AgentAuxiliaryTools {
  private readonly scope: AgentScope;
  private readonly store: AgentWorkspaceStore;
  private readonly decks: 牌组服务 = new 牌组服务();
  private readonly notetypes: 笔记类型服务 = new 笔记类型服务();
  private readonly searches: 搜索服务 = new 搜索服务();
  constructor(scope: AgentScope, store: AgentWorkspaceStore) { this.scope = scope; this.store = store; }

  register(registry: AgentToolRegistry): void {
    for (const name of ['configure_create_target', 'search_memory']) {
      registry.registerRead(name, new AuxiliaryReadHandler(this, name));
    }
    for (const name of ['propose_create_deck', 'propose_create_note_type', 'propose_memory_change', 'propose_analysis']) {
      registry.registerAction(name, new AuxiliaryActionHandler(this, name));
    }
  }

  /** 读取预算守卫产生的分析提案先冻结实际笔记 ID，再交给用户确认。 */
  async prepareAction(action: AgentAction): Promise<void> {
    if (action.kind !== 'analysis') { return; }
    const payload: AnalysisActionPayload = JSON.parse(action.payloadJson) as AnalysisActionPayload;
    if (payload.noteIds === undefined) {
      const ids: number[] = await this.searches.搜索笔记({ search: payload.query, order: { kind: 'none' } });
      const unique: Set<number> = new Set<number>(ids.concat(payload.requestedNoteIds ?? []));
      payload.noteIds = Array.from(unique); payload.totalMatched = unique.size;
      action.payloadJson = JSON.stringify(payload);
    }
  }

  /** @throws {Error} 工作区偏好读取或写入失败，由工具执行边界返回失败结果。 */
  async read(name: string, json: string): Promise<string> {
    const args: AgentExtensionArguments = decodeExtensionArguments(name, json);
    if (name === 'search_memory') {
      const memories: AgentMemory[] = (await this.store.load()).memories;
      const query: string = args.query.toLocaleLowerCase();
      return JSON.stringify(memories.filter((item: AgentMemory): boolean =>
        query.length === 0 || item.text.toLocaleLowerCase().includes(query)));
    }
    const deck: DeckTreeNode | null = findDeck(await this.decks.获取牌组树(), args.deckId);
    if (deck === null) { throw new Error('deck_not_found'); }
    const capability: NotetypeCapabilities = await this.notetypes.获取笔记类型能力(args.notetypeId);
    this.scope.registerReadableDeckIds([args.deckId]);
    this.scope.registerReadableNotetypeIds([args.notetypeId]);
    this.scope.configureCreateTarget(args.deckId, args.notetypeId);
    await this.store.saveSelection(args.deckId, args.notetypeId);
    return JSON.stringify({ status: 'configured', deckId: args.deckId, deckName: deck.name, capability: capability });
  }

  /** @throws {Error} 工作区偏好读取或写入失败，由工具执行边界返回失败结果。 */
  async propose(name: string, json: string): Promise<AgentAction> {
    const args: AgentExtensionArguments = decodeExtensionArguments(name, json);
    if (name === 'propose_create_deck') {
      if (deckNameExists(await this.decks.获取牌组树(), args.name)) { throw new Error('deck_name_exists'); }
      return createAgentAction('create_deck', JSON.stringify(args));
    }
    if (name === 'propose_create_note_type') {
      await assertNewNotetypeName(this.notetypes, args.name);
      return createAgentAction('create_notetype', JSON.stringify(args));
    }
    if (name === 'propose_analysis') {
      const ids: number[] = await this.searches.搜索笔记({ search: args.query, order: { kind: 'none' } });
      return createAgentAction('analysis', JSON.stringify({ query: args.query, totalMatched: ids.length,
        alreadyRead: this.scope.retrieval.readCount(), noteIds: ids }));
    }
    if (args.scope.startsWith('deck:') && findDeck(await this.decks.获取牌组树(), Number(args.scope.slice(5))) === null) {
      throw new Error('deck_not_found');
    }
    const before: AgentMemory | undefined = (await this.store.load()).memories.find(
      (item: AgentMemory): boolean => item.id === args.memoryId);
    if (args.operation !== 'create' && before === undefined) { throw new Error('memory_not_found'); }
    const change: AgentMemoryChange = { operation: args.operation, memoryId: args.memoryId,
      text: args.text, scope: args.scope, before: before ?? null };
    return createAgentAction('memory_change', JSON.stringify(change));
  }

}
