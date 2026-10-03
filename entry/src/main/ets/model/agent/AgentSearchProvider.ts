// SPDX-License-Identifier: AGPL-3.0-or-later
export type AgentSearchProvider = 'doubao' | 'brave';

export function normalizeAgentSearchProvider(value: string): AgentSearchProvider {
  return value === 'brave' ? 'brave' : 'doubao';
}

export function agentSearchPurchaseUrl(provider: AgentSearchProvider): string {
  return provider === 'doubao' ? 'https://console.volcengine.com/search-infinity/web-search' :
    'https://api-dashboard.search.brave.com/app/plans';
}
