// SPDX-License-Identifier: AGPL-3.0-or-later
export type AgentSearchProvider = 'deepseek' | 'doubao' | 'brave';

export interface AgentSearchProviderInfo {
  id: AgentSearchProvider;
  name: string;
  credential: string;
}

/** 设置与 JIDE 能力目录共用；凭据本身不进入声明。 */
export const AGENT_SEARCH_PROVIDERS: AgentSearchProviderInfo[] = [
  { id: 'doubao', name: 'Doubao Search', credential: 'separate search API key' },
  { id: 'brave', name: 'Brave Search', credential: 'separate search API key' },
  { id: 'deepseek', name: 'DeepSeek Search', credential: 'saved DeepSeek model API key' }
];

export function normalizeAgentSearchProvider(value: string): AgentSearchProvider {
  return value === 'brave' || value === 'doubao' ? value : 'deepseek';
}

export function agentSearchPurchaseUrl(provider: AgentSearchProvider): string {
  if (provider === 'deepseek') return 'https://platform.deepseek.com';
  return provider === 'doubao' ? 'https://console.volcengine.com/search-infinity/web-search' :
    'https://api-dashboard.search.brave.com/app/plans';
}
