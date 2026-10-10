// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ProviderId } from './AgentTypes';

export interface AgentExecutionBudget { contextBudgetChars: number; maxOutputTokens: number; }

/** 字符预算是本机整包保护，不冒充模型 token 窗口；兼容服务保留原额度。 */
export function agentExecutionBudget(provider: ProviderId, model: string): AgentExecutionBudget {
  const extended: boolean = provider === 'deepseek' && ['deepseek-flash', 'deepseek-v4-pro'].includes(model);
  return { contextBudgetChars: extended ? 768000 : 240000, maxOutputTokens: extended ? 131072 : 32768 };
}
