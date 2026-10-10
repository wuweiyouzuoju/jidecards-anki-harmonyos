// SPDX-License-Identifier: AGPL-3.0-or-later

export interface AgentMemory {
  id: string;
  text: string;
  scope: string;
  revision: number;
  updatedAt: number;
}
export interface AgentDeckPreference { deckId: number; notetypeId: number; }
export interface AgentWorkspaceState {
  lastDeckId: number;
  deckPreferences: AgentDeckPreference[];
  memories: AgentMemory[];
}
export interface AgentMemoryChange {
  operation: string;
  memoryId: string;
  text: string;
  scope: string;
  before: AgentMemory | null;
}

/** 修改时比较用户确认的旧版本，不能覆盖确认期间发生的其他更新。 */
export function applyAgentMemoryChange(memories: AgentMemory[], change: AgentMemoryChange,
  id: string, now: number): AgentMemory[] {
  if (change.operation === 'create' && (change.memoryId.length > 0 || change.before !== null ||
    memories.some((item: AgentMemory): boolean => item.id === id))) { throw new Error('memory_conflict'); }
  const current: AgentMemory | undefined = memories.find((item: AgentMemory): boolean => item.id === change.memoryId);
  if (change.operation !== 'create' && (current === undefined || change.before === null ||
    JSON.stringify(current) !== JSON.stringify(change.before))) { throw new Error('memory_conflict'); }
  const result: AgentMemory[] = memories.filter((item: AgentMemory): boolean => item.id !== change.memoryId);
  if (change.operation === 'delete') { return result; }
  if (change.operation !== 'create' && change.operation !== 'update') { throw new Error('invalid_memory_change'); }
  if (change.text.trim().length === 0 || change.text.length > 2000) { throw new Error('invalid_memory_change'); }
  if (change.scope !== 'global' && !new RegExp('^deck:[1-9][0-9]*$').test(change.scope)) throw new Error('invalid_memory_change');
  result.push({ id: change.operation === 'create' ? id : change.memoryId, text: change.text,
    scope: change.scope, revision: current === undefined ? 1 : current.revision + 1, updatedAt: now });
  return result;
}

export function relevantAgentMemories(memories: AgentMemory[], deckId: number): AgentMemory[] {
  return memories.filter((item: AgentMemory): boolean => item.scope === 'global' || item.scope === `deck:${deckId}`);
}

export interface AgentMemoryContext { availableCount: number; memories: AgentMemory[]; omittedCount: number; }

/** 不裁剪单条已确认偏好；近期偏好优先，未进入窗口的记忆仍由 search_memory 查阅。 */
export function buildAgentMemoryContext(memories: AgentMemory[], deckId: number, budget: number = 16000): AgentMemoryContext {
  const relevant: AgentMemory[] = relevantAgentMemories(memories, deckId).slice()
    .sort((left: AgentMemory, right: AgentMemory): number => right.updatedAt - left.updatedAt);
  const included: AgentMemory[] = [];
  let used: number = 2;
  for (const memory of relevant) {
    const length: number = JSON.stringify(memory).length + 1;
    if (used + length > budget) continue;
    included.push(memory); used += length;
  }
  return { availableCount: relevant.length, memories: included, omittedCount: relevant.length - included.length };
}
