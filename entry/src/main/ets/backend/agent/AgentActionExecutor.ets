// SPDX-License-Identifier: AGPL-3.0-or-later

import { 牌组服务 } from '../牌组服务';
import { 笔记类型服务 } from '../笔记类型服务';
import { 标准笔记类型种类 } from '../../proto/messages/NotetypeMessages';
import { AgentScope } from './AgentScope';
import { AgentWorkspaceStore } from './AgentWorkspaceStore';
import { assertNewNotetypeName, deckNameExists } from './AgentAuxiliaryTools';
import type { AnalysisActionPayload } from './AgentAuxiliaryTools';
import { AgentActionLedger } from '../../model/agent/AgentAction';
import type { AgentAction } from '../../model/agent/AgentAction';
import type { AgentExtensionArguments } from '../../model/agent/AgentExtensionTools';
import type { AgentMemoryChange } from '../../model/agent/AgentMemory';
import { buildAgentNotetypeJson } from '../../model/agent/AgentNotetypeDesign';

/** 会话拥有的辅助动作执行器；只消费已登记且内容未变的确认，提交时重新检查名称冲突。 */
export class AgentActionExecutor {
  private readonly scope: AgentScope;
  private readonly store: AgentWorkspaceStore;
  private readonly decks: 牌组服务 = new 牌组服务();
  private readonly notetypes: 笔记类型服务 = new 笔记类型服务();
  private readonly ledger: AgentActionLedger = new AgentActionLedger();

  constructor(scope: AgentScope, store: AgentWorkspaceStore) { this.scope = scope; this.store = store; }

  registerPending(action: AgentAction): void { this.ledger.register(action); }

  async executeConfirmed(action: AgentAction): Promise<string> {
    this.ledger.consume(action);
    try {
      const target: number[] = this.scope.currentCreateTarget();
      let result: string = '{"status":"completed"}';
      if (action.kind === 'memory_change') {
        await this.store.changeMemory(JSON.parse(action.payloadJson) as AgentMemoryChange, action.id);
      } else if (action.kind === 'analysis') {
        const payload: AnalysisActionPayload = JSON.parse(action.payloadJson) as AnalysisActionPayload;
        const ids: number[] = payload.noteIds ?? payload.requestedNoteIds ?? [];
        this.scope.retrieval.approveAnalysis(ids);
        this.scope.retrieval.approveAnalysis(payload.requestedNoteIds ?? []);
        result = '{"status":"approved","instruction":"Continue the original analysis in pages. Report actual coverage."}';
      } else if (action.kind === 'create_deck' || action.kind === 'create_notetype') {
        const args: AgentExtensionArguments = JSON.parse(action.payloadJson) as AgentExtensionArguments;
        if (action.kind === 'create_deck') {
          if (deckNameExists(await this.decks.获取牌组树(), args.name)) { throw new Error('deck_name_exists'); }
          const id: number = await this.decks.创建牌组(args.name);
          this.scope.registerReadableDeckIds([id]); this.scope.configureCreateTarget(id, target[1]);
          result = JSON.stringify({ status: 'completed', deckId: id, name: args.name });
        } else {
          await assertNewNotetypeName(this.notetypes, args.name);
          const stock: string = await this.notetypes.获取标准笔记类型JSON(
            args.kind === 'cloze' ? 标准笔记类型种类.CLOZE : 标准笔记类型种类.BASIC);
          const id: number = await this.notetypes.添加笔记类型旧版(buildAgentNotetypeJson(stock, args));
          if (id <= 0) { throw new Error('notetype_creation_failed'); }
          this.scope.registerReadableNotetypeIds([id]); this.scope.configureCreateTarget(target[0], id);
          result = JSON.stringify({ status: 'completed', notetypeId: id, name: args.name });
        }
      } else {
        throw new Error('unsupported_action');
      }
      action.resultJson = result; action.status = 'completed';
      return result;
    } catch (error) {
      action.status = 'failed';
      action.resultJson = JSON.stringify({ status: 'failed', error: error instanceof Error ? error.message : 'action_failed' });
      if (error instanceof Error) { throw error; }
      throw new Error('action_failed');
    }
  }
}
