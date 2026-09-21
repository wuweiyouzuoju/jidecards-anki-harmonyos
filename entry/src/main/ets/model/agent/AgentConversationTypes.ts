// SPDX-License-Identifier: AGPL-3.0-or-later
import type { AgentMode, AgentToolTrace, SearchSource } from './AgentTypes';
import type { AgentTaskSetup } from './AgentTaskContext';
import type { AgentClarificationView } from './AgentClarification';
import type { AgentAction } from './AgentAction';
import type { AgentTimelineBlock } from './AgentTimeline';

/** 保存接口实际返回的可见思考及其类型；不从正文生成或反推思考。 */
export interface AgentHistoryMessage {
  timeline?: AgentTimelineBlock[];
  timelineTruncated?: boolean;
  id?: number;
  reasoning?: string;
  reasoningIsSummary?: boolean;
  reasoningTruncated?: boolean;
  action?: AgentAction;
  role: string;
  text: string;
  kind: string;
  clarification: AgentClarificationView | null;
  expanded: boolean;
}

export interface AgentHistoryAudit extends AgentToolTrace { messageId?: number; }

export interface AgentHistoryResult {
  draftId: string;
  status: string;
  succeeded: number;
  failed: number;
}

export interface AgentConversation {
  id: string;
  mode: AgentMode;
  title: string;
  updatedAt: number;
  setup: AgentTaskSetup;
  messages: AgentHistoryMessage[];
  audits: AgentHistoryAudit[];
  sources: SearchSource[];
  results: AgentHistoryResult[];
}

