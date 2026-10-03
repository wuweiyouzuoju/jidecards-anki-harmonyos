// SPDX-License-Identifier: AGPL-3.0-or-later

/** 辅助操作提案；确认只能针对应用保存的同一份 payload，不能由模型声明已经确认。 */
export type AgentActionKind = 'create_deck' | 'create_notetype' | 'memory_change' | 'analysis' | 'setting_change';
export interface AgentAction {
  id: string;
  kind: AgentActionKind;
  payloadJson: string;
  status: 'pending' | 'executing' | 'completed' | 'cancelled' | 'failed';
  resultJson: string;
}

export class AgentApprovalRequired extends Error {
  readonly action: AgentAction;
  constructor(action: AgentAction) {
    super('agent_approval_required');
    this.action = action;
  }
}

/** 同一提案只允许执行一次；失败后须由新提案重试，避免不确定写入重复执行。 */
export class AgentActionLedger {
  private readonly payloads: Map<string, string> = new Map<string, string>();
  private readonly consumed: Set<string> = new Set<string>();

  register(action: AgentAction): void {
    if (this.payloads.get(action.id) === `${action.kind}:${action.payloadJson}`) { return; }
    if (this.payloads.has(action.id)) { throw new Error('duplicate_action'); }
    this.payloads.set(action.id, `${action.kind}:${action.payloadJson}`);
  }

  consume(action: AgentAction): void {
    if (action.status !== 'pending' || this.consumed.has(action.id) ||
      this.payloads.get(action.id) !== `${action.kind}:${action.payloadJson}`) {
      throw new Error('confirmation_mismatch');
    }
    this.consumed.add(action.id);
    action.status = 'executing';
  }
}

let actionSequence: number = 0;
export function createAgentAction(kind: AgentActionKind, payloadJson: string): AgentAction {
  actionSequence += 1;
  return { id: `action-${Date.now()}-${actionSequence}`, kind: kind, payloadJson: payloadJson,
    status: 'pending', resultJson: '' };
}
