// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ProviderFunctionTool } from './ProviderProtocol';
import type { SimulateFsrsInput } from '../../proto/messages/FsrsMessages';

export interface AgentFsrsArguments {
  deckId?: number;
  cardId?: number;
  params?: number[];
  days?: number;
  desiredRetention?: number;
  newLimit?: number;
  reviewLimit?: number;
}
export interface FsrsSimulationAction { deckId: number; snapshot: string; input: SimulateFsrsInput; }
function tool(name: string, description: string, properties: string, required: string, example: string): ProviderFunctionTool {
  return { name: name, description: description,
    parametersJson: `{"type":"object","properties":{${properties}},"required":[${required}],"additionalProperties":false}`,
    exampleArgumentsJson: example,
    rules: 'Only discovered IDs. Return the actual Core result and search scope; failures or absent memory states are not zero. ' +
      (name.startsWith('propose_') ? 'Call alone. Wait for app confirmation: simulation may cache missing memory states. No rescheduling.' : 'Read only. No rescheduling or parameter save.') };
}
export function agentFsrsTools(): ProviderFunctionTool[] {
  const id: string = '{"type":"integer","minimum":1}';
  const params: string = '{"type":"array","items":{"type":"number"},"maxItems":21}';
  return [
    tool('evaluate_fsrs', '用 Core EvaluateParamsLegacy 评价指定参数或已存参数，返回 log loss 与分箱 RMSE。范围沿用预设的 paramSearch，空搜索按预设牌组 ID；沿用忽略历史日期。这是训练历史拟合评价，不能称作独立测试或健康检查。空参数数组使用 Core 默认。不会保存参数。',
      `"deckId":${id},"params":${params}`, '"deckId"', '{"deckId":1}'),
    tool('get_fsrs_history_count', '读取 Core 历史截止日期的 included/total。单位为有历史的非新卡卡片数，不是复习日志数。返回真实搜索范围及日期。',
      `"deckId":${id}`, '"deckId"', '{"deckId":1}'),
    tool('compute_fsrs_memory_state', '从单卡历史重新计算 FSRS 记忆状态、目标保持率和 decay，只返回结果。state=null 表示无可用历史，不是零稳定度。不会保存或评分。',
      `"cardId":${id}`, '"cardId"', '{"cardId":1}'),
    tool('propose_simulate_fsrs', '提出 Core 逐日模拟，沿用预设参数、学习步骤、复习顺序及限额。days 为1–365，可覆盖保持率和每日新卡/复习限额。返回每日新增、复习、秒数及累计知识，不是实际学习队列。Core 可能补存缺失记忆状态，需用户确认；不会保存情景参数或重排到期日。',
      `"deckId":${id},"days":{"type":"integer","minimum":1,"maximum":365},"desiredRetention":{"type":"number","minimum":0.7,"maximum":0.99},"newLimit":{"type":"integer","minimum":0,"maximum":9999},"reviewLimit":{"type":"integer","minimum":0,"maximum":9999}`,
      '"deckId","days"', '{"deckId":1,"days":30}')
  ];
}
interface FsrsSchema { properties: Record<string, Object>; required: string[]; }
export function decodeAgentFsrsArguments(name: string, json: string): AgentFsrsArguments {
  const definition: ProviderFunctionTool | undefined = agentFsrsTools().find((item: ProviderFunctionTool): boolean => item.name === name);
  if (definition === undefined) throw new Error('tool_unavailable');
  const value: AgentFsrsArguments = JSON.parse(json) as AgentFsrsArguments;
  const schema: FsrsSchema = JSON.parse(definition.parametersJson) as FsrsSchema;
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).some((key: string): boolean => !Object.keys(schema.properties).includes(key)) ||
    schema.required.some((key: string): boolean => !Object.keys(value).includes(key))) throw new Error('invalid_tool_arguments');
  for (const id of [value.deckId, value.cardId]) {
    if (id !== undefined && (!Number.isSafeInteger(id) || id <= 0)) throw new Error('invalid_tool_arguments');
  }
  if (value.params !== undefined && (!Array.isArray(value.params) || ![0,17,19,21].includes(value.params.length) ||
    value.params.some((param: number): boolean => typeof param !== 'number' || !Number.isFinite(param)))) throw new Error('invalid_tool_arguments');
  if (value.days !== undefined && (!Number.isInteger(value.days) || value.days < 1 || value.days > 365)) throw new Error('invalid_tool_arguments');
  if (value.desiredRetention !== undefined && (!Number.isFinite(value.desiredRetention) || value.desiredRetention < 0.7 || value.desiredRetention > 0.99)) throw new Error('invalid_tool_arguments');
  for (const limit of [value.newLimit, value.reviewLimit]) {
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 0 || limit > 9999)) throw new Error('invalid_tool_arguments');
  }
  return value;
}
