// SPDX-License-Identifier: AGPL-3.0-or-later
import type { AgentToolTrace, ChangeDraft, SearchSource } from './AgentTypes';
import type { AgentAction } from './AgentAction';
import type { AgentTimelineBlock } from './AgentTimeline';
import { cloneAgentTimeline } from './AgentTimeline';
import type { AgentClarificationView } from './AgentClarification';
import { cloneAgentClarificationView } from './AgentClarification';
import type { AgentHistoryAudit, AgentHistoryMessage, AgentConversation } from './AgentConversationTypes';

/** 单张待确认卡片：fields 与当前笔记类型字段顺序一一对应。 */
export interface 卡片草稿 {
  fields: string[];
  已选中: boolean;
  /** draft=待保存 saved=已入库 failed=保存失败（可再次保存） */
  状态: string;
  /** 保存失败原因（本地化文案），仅 状态=failed 时非空 */
  失败提示: string;
}

/** 一条聊天消息。 */
export interface 聊天消息 {
  timeline: AgentTimelineBlock[];
  timelineTruncated: boolean;
  streaming: boolean;
  action: AgentAction | null;
  reasoningIsSummary: boolean;
  reasoningTruncated: boolean;
  draftDeckId: number;
  draftNotetypeId: number;
  draftTargetLabel: string;
  id: number;
  /** 'user' | 'ai' */
  角色: string;
  正文: string;
  /** AI 错误消息（红色展示，无卡片） */
  是否错误: boolean;
  /** 仅 AI 成功消息有；同一批卡共用该消息的字段名 */
  卡片列表: 卡片草稿[];
  /** 该批次笔记类型的真实字段名（渲染字段标签用） */
  字段名列表: string[];
  /** 本批保存结果文案；空串=尚未保存过 */
  批次结果: string;
  批次保存中: boolean;
  变更草稿列表: ChangeDraft[];
  工具过程: AgentToolTrace[];
  来源列表: SearchSource[];
  推理摘要: string;
  kind: string;
  clarification: AgentClarificationView | null;
  expanded: boolean;
  taskStatus: string;
  answerMessageId: number;
  providerText: string;
}

export function createAgentMessage(id: number, 角色: string, 正文: string, 是否错误: boolean): 聊天消息 {
  return {
    id: id, 角色: 角色, 正文: 正文, 是否错误: 是否错误,
    卡片列表: [], 字段名列表: [], 批次结果: '', 批次保存中: false,
    变更草稿列表: [], 工具过程: [], 来源列表: [], 推理摘要: '', timeline: [], timelineTruncated: false, streaming: false,
    action: null, reasoningIsSummary: false, reasoningTruncated: false, draftDeckId: 0, draftNotetypeId: 0, draftTargetLabel: '',
    kind: 'normal', clarification: null, expanded: false, taskStatus: '',
    answerMessageId: 0, providerText: 正文
  };
}

export function cloneAgentCard(卡: 卡片草稿): 卡片草稿 {
  return {
    fields: 卡.fields.slice(),
    已选中: 卡.已选中,
    状态: 卡.状态,
    失败提示: 卡.失败提示
  };
}

export function cloneAgentTrace(追踪: AgentToolTrace): AgentHistoryAudit {
  return {
    callId: 追踪.callId, toolName: 追踪.toolName, status: 追踪.status,
    providerRound: 追踪.providerRound, sequence: 追踪.sequence,
    argumentsJson: 追踪.argumentsJson, outputJson: 追踪.outputJson,
    errorCode: 追踪.errorCode, errorPath: 追踪.errorPath, errorMessage: 追踪.errorMessage,
    receivedKeys: 追踪.receivedKeys.slice(), allowedKeys: 追踪.allowedKeys.slice(),
    validTemplateJson: 追踪.validTemplateJson, repeatCount: 追踪.repeatCount,
    argumentsTruncated: 追踪.argumentsTruncated, outputTruncated: 追踪.outputTruncated,
    diagnosticTruncated: 追踪.diagnosticTruncated, expanded: 追踪.expanded,
    legacySummary: 追踪.legacySummary
  };
}

export function cloneAgentMessage(消息: 聊天消息): 聊天消息 {
  return {
    timeline: cloneAgentTimeline(消息.timeline),
    timelineTruncated: 消息.timelineTruncated,
    streaming: 消息.streaming,
    action: 消息.action, reasoningIsSummary: 消息.reasoningIsSummary, reasoningTruncated: 消息.reasoningTruncated,
    draftDeckId: 消息.draftDeckId, draftNotetypeId: 消息.draftNotetypeId, draftTargetLabel: 消息.draftTargetLabel,
    id: 消息.id,
    角色: 消息.角色,
    正文: 消息.正文,
    是否错误: 消息.是否错误,
    卡片列表: 消息.卡片列表.map((卡: 卡片草稿): 卡片草稿 => cloneAgentCard(卡)),
    字段名列表: 消息.字段名列表.slice(),
    批次结果: 消息.批次结果,
    批次保存中: 消息.批次保存中,
    变更草稿列表: 消息.变更草稿列表.slice(),
    工具过程: 消息.工具过程.map((追踪: AgentToolTrace): AgentToolTrace => cloneAgentTrace(追踪)),
    来源列表: 消息.来源列表.slice(),
    推理摘要: 消息.推理摘要,
    kind: 消息.kind,
    clarification: 消息.clarification === null ? null : cloneAgentClarificationView(消息.clarification),
    expanded: 消息.expanded,
    taskStatus: 消息.taskStatus,
    answerMessageId: 消息.answerMessageId,
    providerText: 消息.providerText
  };
}

export interface AgentHistoryProjection {
  title: string;
  messages: AgentHistoryMessage[];
  audits: AgentHistoryAudit[];
  sources: SearchSource[];
}
export function projectAgentHistory(items: 聊天消息[], defaultTitle: string): AgentHistoryProjection {
      const messages: AgentHistoryMessage[] = [];
      const audits: AgentHistoryAudit[] = [];
      const sources: SearchSource[] = [];
      let title: string = defaultTitle;
      for (const message of items) {
        if ((message.timeline.length > 0 || message.正文.length > 0 || message.推理摘要.length > 0 || message.工具过程.length > 0 ||
          message.action !== null) && (message.kind === 'normal' || message.kind === 'clarification')) {
          messages.push({
            id: message.id, reasoning: message.推理摘要, reasoningIsSummary: message.reasoningIsSummary,
            timeline: cloneAgentTimeline(message.timeline),
            timelineTruncated: message.timelineTruncated,
            reasoningTruncated: message.reasoningTruncated,
            role: message.角色 === 'user' ? 'user' : 'assistant',
            text: message.角色 === 'ai' && message.providerText.length > 0 ?
              message.providerText : message.正文,
            kind: message.kind,
            action: message.action ?? undefined,
            clarification: message.clarification === null ? null : cloneAgentClarificationView(message.clarification),
            expanded: message.expanded
          });
          if (message.角色 === 'user' && title === defaultTitle) {
            title = message.正文.slice(0, 40);
          }
        }
        for (const item of message.工具过程) {
          const audit: AgentHistoryAudit = cloneAgentTrace(item);
          audit.messageId = message.id;
          audits.push(audit);
        }
        for (const source of message.来源列表) { sources.push(source); }
      }
  return { title: title, messages: messages, audits: audits, sources: sources };
}

/** 历史仅恢复显示快照；消息重新分配 ID，工具按旧 ID 归属，写入令牌不恢复。 */
export function restoreAgentMessages(selected: AgentConversation, nextId: () => number,
  unassignedLabel: string, expandedTools: boolean): 聊天消息[] {
    const restored: 聊天消息[] = [];
    const messagePositions: Map<number, number> = new Map<number, number>();
    for (const item of selected.messages) {
      const message: 聊天消息 = createAgentMessage(nextId(), item.role === 'user' ? 'user' : 'ai', item.text, false);
      message.kind = item.kind;
      message.action = item.action === undefined ? null : { id: item.action.id, kind: item.action.kind, payloadJson: item.action.payloadJson, status: item.action.status, resultJson: item.action.resultJson };
      message.clarification = item.clarification === null ? null : cloneAgentClarificationView(item.clarification);
      message.expanded = item.expanded;
      message.providerText = item.text;
      message.推理摘要 = item.reasoning ?? '';
      message.reasoningIsSummary = item.reasoningIsSummary === true;
      message.reasoningTruncated = item.reasoningTruncated === true;
      message.timeline = cloneAgentTimeline(item.timeline ?? []);
      message.timelineTruncated = item.timelineTruncated === true;
      if (item.id !== undefined) { messagePositions.set(item.id, restored.length); }
      restored.push(message);
    }
    // 新历史按消息归属恢复；旧记录无法确定归属时单独列出，不冒充最后一轮调用。
    let legacyAuditTarget: number = -1;
    for (const audit of selected.audits) {
      let auditTarget: number | undefined = audit.messageId === undefined ? undefined : messagePositions.get(audit.messageId);
      if (auditTarget === undefined) {
        if (legacyAuditTarget < 0) {
          restored.push(createAgentMessage(nextId(), 'ai', unassignedLabel, false));
          legacyAuditTarget = restored.length - 1;
        }
        auditTarget = legacyAuditTarget;
      }
      const trace: AgentToolTrace = cloneAgentTrace(audit);
      trace.expanded = expandedTools;
      restored[auditTarget].工具过程.push(trace);
    }
    for (const message of restored) {
      for (const block of message.timeline) {
        if (block.kind === 'tool') {
          block.index = message.工具过程.findIndex((trace: AgentToolTrace): boolean => trace.callId === block.refId);
        }
      }
    }
  return restored;
}
