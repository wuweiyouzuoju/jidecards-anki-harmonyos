// SPDX-License-Identifier: AGPL-3.0-or-later
import type { AgentMemory, AgentMemoryChange, AgentWorkspaceState } from './AgentMemory';

export interface AgentMemoryRepository {
  load(): Promise<AgentWorkspaceState>;
  changeMemory(change: AgentMemoryChange, id: string): Promise<void>;
}

/** 管理页只提交用户明确保存的变更；过期读取失效，已接受的写入独立完成。 */
export class AgentMemoryManager {
  private readonly repository: AgentMemoryRepository;
  private generation: number = 0;
  private alive: boolean = true;
  private busy: boolean = false;
  constructor(repository: AgentMemoryRepository) { this.repository = repository; }
  dispose(): void { this.alive = false; this.generation++; }
  async load(): Promise<AgentMemory[] | null> {
    const generation: number = ++this.generation;
    const state: AgentWorkspaceState = await this.repository.load();
    if (!this.alive || generation !== this.generation) return null;
    return state.memories.slice().sort((left: AgentMemory, right: AgentMemory): number => right.updatedAt - left.updatedAt);
  }
  async commit(before: AgentMemory | null, text: string, scope: string, id: string, deleting: boolean = false): Promise<void> {
    if (!this.alive || this.busy) throw new Error('memory_busy');
    if (deleting && before === null) throw new Error('memory_not_found');
    this.busy = true;
    this.generation++;
    const change: AgentMemoryChange = { operation: deleting ? 'delete' : before === null ? 'create' : 'update',
      memoryId: before?.id ?? '', text: text.trim(), scope: scope,
      before: before === null ? null : JSON.parse(JSON.stringify(before)) as AgentMemory };
    try { await this.repository.changeMemory(change, id); } finally { this.busy = false; }
  }
}
