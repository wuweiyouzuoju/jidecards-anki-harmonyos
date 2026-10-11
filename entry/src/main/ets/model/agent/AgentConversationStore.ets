// SPDX-License-Identifier: AGPL-3.0-or-later
import { agentHistoryRepository } from '../../backend/agent/AgentHistoryFiles';
import type { AgentConversation, AgentConversationSummary } from './AgentConversationTypes';
export type { AgentHistoryMessage, AgentHistoryAudit, AgentHistoryResult, AgentConversation } from './AgentConversationTypes';
export { sanitizeHistoryText } from './AgentHistoryProjection';

/** 索引、设置、检索和写入共用同一个串行仓库。 */
/** @throws {Error} 读取失败由历史列表入口展示。 */
export async function loadAgentConversationSummaries(): Promise<AgentConversationSummary[]> {
  return agentHistoryRepository().list();
}
/** @throws {Error} 会话不存在/IO失败由历史恢复入口展示。 */
export async function readAgentConversation(id: string): Promise<AgentConversation> {
  return agentHistoryRepository().read(id);
}
/** @throws {Error} 保存失败由会话协调器上报，不能宣称已保存。 */
export async function saveAgentConversation(value: AgentConversation): Promise<void> {
  await agentHistoryRepository().save(value);
}
/** @throws {Error} 删除或关联清理失败由历史管理入口展示。 */
export async function deleteAgentConversation(id: string): Promise<void> {
  await agentHistoryRepository().remove(id);
}
