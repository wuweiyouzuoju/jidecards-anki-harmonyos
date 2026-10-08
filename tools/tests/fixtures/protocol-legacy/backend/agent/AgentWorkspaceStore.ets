// SPDX-License-Identifier: AGPL-3.0-or-later

import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import type { AgentWorkspaceState, AgentMemoryChange, AgentDeckPreference } from '../../model/agent/AgentMemory';
import { applyAgentMemoryChange } from '../../model/agent/AgentMemory';

/** 选择偏好自动保存；长期记忆只有确认执行器可以调用 changeMemory 写入。 */
export class AgentWorkspaceStore {
  private readonly context: common.UIAbilityContext;
  private queue: Promise<void> = Promise.resolve();
  constructor(context: common.UIAbilityContext) { this.context = context; }

  /** @throws {Error} 工作区读取或提交失败，禁止以空工作区覆盖已有偏好和记忆。 */
  async load(): Promise<AgentWorkspaceState> {
    const store: preferences.Preferences = await preferences.getPreferences(this.context, 'jidecards_agent_workspace');
    const raw: preferences.ValueType = await store.get('workspace_v1', '');
    if (typeof raw !== 'string' || raw.length === 0) { return { lastDeckId: 0, deckPreferences: [], memories: [] }; }
    const value: AgentWorkspaceState = JSON.parse(raw) as AgentWorkspaceState;
    if (!Array.isArray(value.deckPreferences) || !Array.isArray(value.memories)) {
      throw new Error('agent_workspace_invalid');
    }
    return value;
  }

  /** @throws {Error} 工作区读取或提交失败，禁止以空工作区覆盖已有偏好和记忆。 */
  private async save(state: AgentWorkspaceState): Promise<void> {
    const store: preferences.Preferences = await preferences.getPreferences(this.context, 'jidecards_agent_workspace');
    await store.put('workspace_v1', JSON.stringify(state));
    await store.flush();
  }

  /** @throws {Error} 工作区读取或提交失败，禁止以空工作区覆盖已有偏好和记忆。 */
  saveSelection(deckId: number, notetypeId: number): Promise<void> {
    const task: Promise<void> = this.queue.catch((): void => {}).then(async (): Promise<void> => {
      if (deckId <= 0 || notetypeId <= 0) { return; }
      const state: AgentWorkspaceState = await this.load();
      state.lastDeckId = deckId;
      state.deckPreferences = state.deckPreferences.filter((item: AgentDeckPreference): boolean => item.deckId !== deckId);
      state.deckPreferences.push({ deckId: deckId, notetypeId: notetypeId });
      await this.save(state);
    });
    this.queue = task;
    return task;
  }

  /** @throws {Error} 工作区读取或提交失败，禁止以空工作区覆盖已有偏好和记忆。 */
  changeMemory(change: AgentMemoryChange, actionId: string): Promise<void> {
    const task: Promise<void> = this.queue.catch((): void => {}).then(async (): Promise<void> => {
      const state: AgentWorkspaceState = await this.load();
      state.memories = applyAgentMemoryChange(state.memories, change, actionId, Date.now());
      await this.save(state);
    });
    this.queue = task;
    return task;
  }
}
