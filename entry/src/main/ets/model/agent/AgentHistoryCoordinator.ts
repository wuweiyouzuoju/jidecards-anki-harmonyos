// SPDX-License-Identifier: AGPL-3.0-or-later
import type { AgentConversation, AgentHistoryResult } from './AgentConversationTypes';
import type { AgentMode } from './AgentTypes';
import type { AgentAction } from './AgentAction';
import type { AgentSessionState } from './AgentSessionState';
import type { AgentTaskSetup } from './AgentTaskContext';
import { createAgentMessage, projectAgentHistory, restoreAgentMessages } from './AgentConversationView';
import type { 聊天消息 } from './AgentConversationView';

export interface AgentHistoryStorage {
  load(): Promise<AgentConversation[]>;
  save(conversation: AgentConversation): Promise<void>;
  remove(id: string): Promise<void>;
  saveCheckpoint(id: string, state: AgentSessionState): void;
  loadCheckpoint(id: string): AgentSessionState | null;
  removeCheckpoint(id: string): void;
}
export interface AgentHistoryRuntime {
  exportState(): AgentSessionState;
  restore(state: AgentSessionState): void;
  clear(): void;
  getAction(): AgentAction | null;
  isPaused(): boolean;
}
export interface AgentHistoryRestore {
  generation: number;
  messages: 聊天消息[];
  deckId: number;
  notetypeId: number;
  contextValid: boolean;
  checkpointFailed: boolean;
}

/** 历史列表与恢复代次的唯一所有者；历史投影不拥有写入令牌，恢复只交给既有运行时校验。 */
export class AgentHistoryCoordinator {
  private storage: AgentHistoryStorage;
  private alive: boolean = true;
  private visible: boolean = false;
  private loadGeneration: number = 0;
  private restoreGeneration: number = 0;
  private saves: Promise<void> = Promise.resolve();
  constructor(storage: AgentHistoryStorage) { this.storage = storage; }
  version(): number { return this.restoreGeneration; }
  isCurrent(version: number): boolean { return this.alive && version === this.restoreGeneration; }
  invalidateRestore(): void { this.restoreGeneration++; }
  close(): void { this.visible = false; this.loadGeneration++; }
  dispose(): void { this.alive = false; this.close(); this.invalidateRestore(); }

  async open(mode: AgentMode): Promise<AgentConversation[] | null> {
    if (!this.alive) return null;
    const generation: number = ++this.loadGeneration;
    this.visible = true;
    try {
      const all: AgentConversation[] = await this.storage.load();
      if (!this.alive || !this.visible || generation !== this.loadGeneration) return null;
      return all.filter((item: AgentConversation): boolean => mode === 'assistant' || item.mode === mode);
    } catch (error) {
      if (!this.alive || !this.visible || generation !== this.loadGeneration) return null;
      throw new Error('ai_agent_history_load_failed');
    }
  }

  checkpoint(id: string, runtime: AgentHistoryRuntime | null): void {
    if (runtime === null) throw new Error('checkpoint_unavailable');
    this.storage.saveCheckpoint(id, runtime.exportState());
  }

  save(id: string, mode: AgentMode, setup: AgentTaskSetup, messages: 聊天消息[], results: AgentHistoryResult[],
    title: string, runtime: AgentHistoryRuntime | null): Promise<void> {
    this.checkpoint(id, runtime);
    const projection = projectAgentHistory(messages, title);
    if (projection.messages.length === 0) return Promise.resolve();
    const conversation: AgentConversation = { id: id, mode: mode, title: projection.title, updatedAt: Date.now(),
      setup: setup, messages: projection.messages, audits: projection.audits, sources: projection.sources,
      results: results.map((value: AgentHistoryResult): AgentHistoryResult => ({ draftId: value.draftId,
        status: value.status, succeeded: value.succeeded, failed: value.failed })) };
    // 队列等待期间 UI 仍可变更 action/setup；按持久化格式冻结本次已接受的记录。
    const snapshot: AgentConversation = JSON.parse(JSON.stringify(conversation)) as AgentConversation;
    const accepted: Promise<void> = this.saves.then((): Promise<void> => this.storage.save(snapshot));
    this.saves = accepted.catch((): void => {});
    return accepted;
  }

  restore(selected: AgentConversation, deckIds: number[], typeIds: number[], nextId: () => number,
    unassignedLabel: string, detailed: boolean, runtime: AgentHistoryRuntime | null): AgentHistoryRestore {
    this.close();
    this.invalidateRestore();
    const messages: 聊天消息[] = restoreAgentMessages(selected, nextId, unassignedLabel, detailed);
    let checkpointFailed: boolean = false;
    if (runtime !== null) {
      runtime.clear();
      try {
        const state: AgentSessionState | null = this.storage.loadCheckpoint(selected.id);
        if (state !== null) runtime.restore(state);
        const action: AgentAction | null = runtime.getAction();
        for (const message of messages) {
          if (action !== null && message.action?.id === action.id) message.action = action;
          else if (message.action?.status === 'pending' || message.action?.status === 'executing') message.action.status = 'cancelled';
        }
        if (runtime.isPaused()) {
          const paused: 聊天消息 = createAgentMessage(nextId(), 'ai', '', false);
          paused.taskStatus = 'paused';
          messages.push(paused);
        }
      } catch (error) { checkpointFailed = true; }
    }
    const creating: boolean = selected.mode === 'create';
    const deckExists: boolean = (!creating && selected.setup.deckId <= 0) || deckIds.indexOf(selected.setup.deckId) >= 0;
    const typeExists: boolean = (!creating && selected.setup.notetypeId <= 0) || typeIds.indexOf(selected.setup.notetypeId) >= 0;
    return { generation: this.restoreGeneration, messages: messages, deckId: deckExists ? selected.setup.deckId : 0,
      notetypeId: typeExists && (!creating || deckExists) ? selected.setup.notetypeId : 0,
      contextValid: !creating || (deckExists && typeExists), checkpointFailed: checkpointFailed };
  }

  async remove(id: string): Promise<boolean> {
    await this.saves;
    await this.storage.remove(id);
    this.storage.removeCheckpoint(id);
    if (!this.alive) return false;
    this.loadGeneration++;
    return true;
  }
}
