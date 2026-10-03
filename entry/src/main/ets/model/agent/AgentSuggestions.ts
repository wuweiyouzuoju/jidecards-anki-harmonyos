// SPDX-License-Identifier: AGPL-3.0-or-later

export const AGENT_SUGGESTION_COUNT: number = 60;
export const AGENT_SUGGESTION_HOLD_MS: number = 10000;
export const AGENT_SUGGESTION_FADE_MS: number = 300;

/** 十类能力交错轮换；中英内容归资源，目录只拥有顺序。 */
export function agentSuggestionKey(position: number): string {
  const index: number = ((Math.floor(position) % AGENT_SUGGESTION_COUNT) + AGENT_SUGGESTION_COUNT) %
    AGENT_SUGGESTION_COUNT;
  const ordinal: number = (index % 10) * 6 + Math.floor(index / 10) + 1;
  return `ai_agent_suggestion_${ordinal.toString().padStart(2, '0')}`;
}
