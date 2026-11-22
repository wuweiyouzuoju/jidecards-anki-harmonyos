// SPDX-License-Identifier: AGPL-3.0-or-later
import type { 聊天消息 } from '../agent/AgentConversationView';

export function externalRequestId(json: string): string {
  const args: Record<string, Object> = JSON.parse(json) as Record<string, Object>;
  if (args === null || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length !== 1 ||
    typeof args['requestId'] !== 'string' || (args['requestId'] as string).length === 0) throw new Error('invalid_status_arguments');
  return args['requestId'] as string;
}
interface DomainOutcome { status?: string; }
export function externalToolOutcomeStatus(json: string): string {
  const output: DomainOutcome = JSON.parse(json) as DomainOutcome;
  return output !== null && typeof output === 'object' && !Array.isArray(output) && typeof output.status === 'string' ? output.status : 'completed';
}
interface ExternalRequestView { requestId: string; status: string; output: Object; cards: string[]; result: string; }
/** 状态来自应用实际确认/写入结果；提案、部分成功和不确定结果不能被提升成完成。 */
export function externalRequestStatus(requestId: string, message: 聊天消息, outputJson: string): string {
  const output: DomainOutcome = JSON.parse(message.action?.resultJson || outputJson || '{}') as DomainOutcome;
  let status: string = externalToolOutcomeStatus(message.action?.resultJson || outputJson || '{}');
  if (message.action !== null) status = message.action.status === 'pending' ? 'awaiting_confirmation' : message.action.status;
  else if (message.clarification !== null) status = message.clarification.state === 'resolved' ? 'completed' :
    message.clarification.state === 'cancelled' ? 'cancelled' : 'awaiting_user';
  else if (message.批次保存中) status = 'executing';
  else if (message.卡片列表.length > 0) status = message.卡片列表.every((card): boolean => card.状态 === 'saved') ? 'completed' :
    message.卡片列表.some((card): boolean => card.状态 === 'failed') ? 'failed' : 'awaiting_confirmation';
  else if (message.变更草稿列表.length > 0) status = ['pending', 'prepared'].includes(message.变更草稿列表[0].status) ?
    'awaiting_confirmation' : message.变更草稿列表[0].status;
  const outcome: string = externalToolOutcomeStatus(message.action?.resultJson || outputJson || '{}');
  if (status === 'completed' && ['failed', 'partial', 'cancelled', 'execution_outcome_unknown'].includes(outcome)) status = outcome;
  const view: ExternalRequestView = { requestId: requestId, status: status, output: output,
    cards: message.卡片列表.map((card): string => card.状态), result: message.批次结果 };
  return JSON.stringify(view);
}
