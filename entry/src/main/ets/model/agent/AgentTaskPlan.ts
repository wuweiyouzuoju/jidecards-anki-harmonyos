// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ProviderFunctionTool } from './ProviderProtocol';

export type AgentPlanStepStatus = 'pending' | 'in_progress' | 'completed' | 'blocked';
export interface AgentPlanStep { id: string; title: string; status: AgentPlanStepStatus; }
interface AgentPlanContent { objective: string; steps: AgentPlanStep[]; notes: string; }
export interface AgentTaskPlanState extends AgentPlanContent { revision: number; }
export interface AgentTaskPlanUpdate extends AgentPlanContent { baseRevision: number; }

function validatePlan(value: AgentPlanContent): void {
  if (value === null || typeof value !== 'object' || typeof value.objective !== 'string' ||
    value.objective.trim().length === 0 || value.objective.length > 2000 || typeof value.notes !== 'string' ||
    value.notes.length > 8000 || !Array.isArray(value.steps) || value.steps.length === 0 || value.steps.length > 100) {
    throw new Error('invalid_task_plan');
  }
  const ids: Set<string> = new Set<string>();
  let active: number = 0;
  for (const step of value.steps) {
    if (step === null || typeof step !== 'object' || typeof step.id !== 'string' ||
      !new RegExp('^[A-Za-z0-9_-]{1,80}$').test(step.id) || ids.has(step.id) ||
      typeof step.title !== 'string' || step.title.trim().length === 0 || step.title.length > 300 ||
      !['pending', 'in_progress', 'completed', 'blocked'].includes(step.status)) throw new Error('invalid_task_plan');
    if (Object.keys(step).some((key: string): boolean => !['id', 'title', 'status'].includes(key))) throw new Error('invalid_task_plan');
    ids.add(step.id);
    if (step.status === 'in_progress') active++;
  }
  if (active > 1) throw new Error('invalid_task_plan');
}

export function decodeTaskPlanUpdate(json: string): AgentTaskPlanUpdate {
  let value: AgentTaskPlanUpdate;
  try { value = JSON.parse(json) as AgentTaskPlanUpdate; } catch (error) { throw new Error('invalid_task_plan'); }
  validatePlan(value);
  if (Object.keys(value).some((key: string): boolean => !['objective', 'steps', 'notes', 'baseRevision'].includes(key)) ||
    !Number.isSafeInteger(value.baseRevision) || value.baseRevision < 0) throw new Error('invalid_task_plan');
  return value;
}

/** 计划是会话资料；不是卡库写入权限，也不是已执行操作的证明。 */
export class AgentTaskPlan {
  private state: AgentTaskPlanState | null = null;
  snapshot(): AgentTaskPlanState | null {
    return this.state === null ? null : JSON.parse(JSON.stringify(this.state)) as AgentTaskPlanState;
  }
  clear(): void { this.state = null; }
  restore(value: AgentTaskPlanState | null): void {
    if (value !== null) {
      validatePlan(value);
      if (!Number.isSafeInteger(value.revision) || value.revision < 1) throw new Error('invalid_task_plan');
    }
    this.state = value === null ? null : JSON.parse(JSON.stringify(value)) as AgentTaskPlanState;
  }
  update(json: string): AgentTaskPlanState {
    const value: AgentTaskPlanUpdate = decodeTaskPlanUpdate(json);
    if (!Number.isSafeInteger(value.baseRevision) || value.baseRevision !== (this.state?.revision ?? 0)) {
      throw new Error('task_plan_conflict');
    }
    this.state = { objective: value.objective.trim(), steps: value.steps.map((step: AgentPlanStep): AgentPlanStep =>
      ({ id: step.id, title: step.title.trim(), status: step.status })), notes: value.notes,
      revision: value.baseRevision + 1 };
    return this.snapshot() as AgentTaskPlanState;
  }
}

export function agentTaskPlanTools(): ProviderFunctionTool[] {
  const rules: string = 'This is conversation planning data, not authorization or proof of saved cards. ' +
    'Record decisions, read cursors and unresolved questions in notes. Never store credentials. ' +
    'Use actual tool results for claims about execution. Current user instructions take priority.';
  return [
    { name: 'get_task_plan', description: '读取当前会话持久任务计划、进度笔记及版本；恢复历史或上下文压缩后可继续查阅。',
      parametersJson: '{"type":"object","properties":{},"required":[],"additionalProperties":false}',
      exampleArgumentsJson: '{}', rules: rules },
    { name: 'update_task_plan', description: '维护复杂任务的目标、有序步骤和接续笔记；只保存当前会话计划，不修改卡库或长期偏好。先读取版本，最多一个步骤正在进行。',
      parametersJson: '{"type":"object","properties":{"baseRevision":{"type":"integer","minimum":0},"objective":{"type":"string","minLength":1,"maxLength":2000},"notes":{"type":"string","maxLength":8000},"steps":{"type":"array","minItems":1,"maxItems":100,"items":{"type":"object","properties":{"id":{"type":"string","pattern":"^[A-Za-z0-9_-]{1,80}$"},"title":{"type":"string","minLength":1,"maxLength":300},"status":{"type":"string","enum":["pending","in_progress","completed","blocked"]}},"required":["id","title","status"],"additionalProperties":false}}},"required":["baseRevision","objective","steps","notes"],"additionalProperties":false}',
      exampleArgumentsJson: '{"baseRevision":0,"objective":"整理第三章闪卡","steps":[{"id":"read","title":"读取资料","status":"in_progress"},{"id":"draft","title":"生成并检查草稿","status":"pending"}],"notes":"按页读取，记录未处理的页号。"}', rules: rules }
  ];
}
