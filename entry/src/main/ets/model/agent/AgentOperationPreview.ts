// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DraftOperation } from './AgentTypes';
import type { OperationProposal, OperationPreviewRow } from './AgentOperations';
import { operationDefinition } from './AgentOperations';
export function agentOperationTitle(operation: DraftOperation, text: (key: string) => string): string {
  const proposal = JSON.parse(operation.after) as OperationProposal;
  return text(operationDefinition(proposal.tool)!.titleKey);
}
/** 展示目标和参数；内部基线、媒体令牌及会话授权不进入确认界面。 */
export function agentOperationPreview(operation: DraftOperation, text: (key: string) => string): OperationPreviewRow[] {
  const proposal = JSON.parse(operation.after) as OperationProposal;
  const args = JSON.parse(proposal.argumentsJson) as Record<string,Object>;
  const rows: OperationPreviewRow[] = [];
  for (const key of Object.keys(args)) {
    let value: string = String(args[key]);
    if (typeof args[key] === 'boolean') value = text(args[key] ? 'agent_value_on' : 'agent_value_off');
    else if (Array.isArray(args[key])) value = (args[key] as number[]).join(', ');
    else if (['operation','scope','format'].includes(key)) value = text('agent_operation_value_' + value);
    else if (key === 'changesJson') value = JSON.stringify(JSON.parse(value) as Object,null,2);
    rows.push({ title: text('agent_operation_argument_' + key), before: '', after: value === '' ? text('deck_option_unset') : value });
  }
  for (const row of proposal.snapshot.preview) if (row.before !== '') rows.unshift({ title: text(row.title === 'agent_operation_candidate_scope' ? row.title : 'agent_operation_current'), before: '', after: row.before });
  if (rows.length === 0) rows.push({ title: text('agent_operation_scope'), before: '', after: text('agent_operation_collection_scope') });
  return rows;
}
