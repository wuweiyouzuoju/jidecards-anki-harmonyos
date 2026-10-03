// SPDX-License-Identifier: AGPL-3.0-or-later

import { AgentToolSchemaError } from './AgentToolSchemas';

export type AgentClarificationState =
  'pending' | 'submitting' | 'resolved' | 'submit_failed' | 'cancelled';

export interface AgentClarificationOption {
  id: string;
  label: string;
  description: string;
}

export interface AgentClarificationRequest {
  kind?: 'create_target';
  id: string;
  question: string;
  options: AgentClarificationOption[];
  recommendedOptionId: string;
  allowFreeText: boolean;
}

export interface AgentClarificationAnswer {
  clarificationId: string;
  optionId: string;
  optionLabel: string;
  supplementalText: string;
}

export interface AgentClarificationView {
  request: AgentClarificationRequest;
  selectedOptionId: string;
  supplementalText: string;
  state: AgentClarificationState;
}

interface RawClarificationOption {
  id?: string;
  label?: string;
  description?: string;
}

interface RawClarificationRequest {
  clarificationId?: string;
  question?: string;
  options?: RawClarificationOption[];
  recommendedOptionId?: string;
  allowFreeText?: boolean;
}

function boundedText(value: string | undefined, path: string, maximum: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maximum) {
    throw new AgentToolSchemaError('invalid_value', path, `${path} has an invalid length`);
  }
  return value.trim();
}

function optionalText(value: string | undefined, path: string, maximum: number): string {
  if (value === undefined) { return ''; }
  if (typeof value !== 'string' || value.trim().length > maximum) {
    throw new AgentToolSchemaError('invalid_value', path, `${path} has an invalid length`);
  }
  return value.trim();
}

export function decodeAgentClarificationRequest(argumentsJson: string): AgentClarificationRequest {
  let raw: RawClarificationRequest;
  try { raw = JSON.parse(argumentsJson) as RawClarificationRequest; }
  catch (error) { throw new AgentToolSchemaError('invalid_json', '$', 'Clarification arguments must be JSON'); }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AgentToolSchemaError('invalid_type', '$', 'Clarification arguments must be one object');
  }
  const receivedKeys: string[] = Object.keys(raw);
  const allowedKeys: string[] = [
    'clarificationId', 'question', 'options', 'recommendedOptionId', 'allowFreeText'
  ];
  for (const key of receivedKeys) {
    if (allowedKeys.indexOf(key) < 0) {
      throw new AgentToolSchemaError('unexpected_property', key,
        `${key} is not a clarification argument`, receivedKeys, allowedKeys);
    }
  }
  if (!Array.isArray(raw.options) || raw.options.length === 1 || raw.options.length > 4 ||
    (raw.options.length === 0 && raw.allowFreeText !== true)) {
    throw new AgentToolSchemaError('invalid_value', 'options', 'Provide 2-4 options, or no options with free text enabled');
  }
  const options: AgentClarificationOption[] = [];
  const seen: Set<string> = new Set<string>();
  for (let index: number = 0; index < raw.options.length; index++) {
    const item: RawClarificationOption = raw.options[index];
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new AgentToolSchemaError('invalid_type', `options[${index}]`, 'Each option must be an object');
    }
    const optionKeys: string[] = Object.keys(item);
    for (const key of optionKeys) {
      if (['id', 'label', 'description'].indexOf(key) < 0) {
        throw new AgentToolSchemaError('unexpected_property', `options[${index}].${key}`,
          `${key} is not an option argument`, optionKeys, ['id', 'label', 'description']);
      }
    }
    const id: string = boundedText(item.id, `options[${index}].id`, 64);
    if (seen.has(id)) {
      throw new AgentToolSchemaError('invalid_value', `options[${index}].id`, 'Option IDs must be unique');
    }
    seen.add(id);
    options.push({ id: id, label: boundedText(item.label, `options[${index}].label`, 80),
      description: optionalText(item.description, `options[${index}].description`, 240) });
  }
  const recommendation: string = optionalText(raw.recommendedOptionId, 'recommendedOptionId', 64);
  if (recommendation.length > 0 && !seen.has(recommendation)) {
    throw new AgentToolSchemaError('invalid_value', 'recommendedOptionId', 'Recommendation must name one option');
  }
  if (typeof raw.allowFreeText !== 'boolean') {
    throw new AgentToolSchemaError('invalid_type', 'allowFreeText', 'allowFreeText must be boolean');
  }
  return { id: boundedText(raw.clarificationId, 'clarificationId', 64),
    question: boundedText(raw.question, 'question', 600), options: options,
    recommendedOptionId: recommendation, allowFreeText: raw.allowFreeText };
}

export function cloneAgentClarificationView(value: AgentClarificationView): AgentClarificationView {
  const options: AgentClarificationOption[] = [];
  for (const option of value.request.options) {
    options.push({ id: option.id, label: option.label, description: option.description });
  }
  return {
    request: {
      id: value.request.id, question: value.request.question, options: options,
      recommendedOptionId: value.request.recommendedOptionId, allowFreeText: value.request.allowFreeText,
      kind: value.request.kind === 'create_target' ? 'create_target' : undefined
    },
    selectedOptionId: value.selectedOptionId, supplementalText: value.supplementalText,
    state: value.state
  };
}

/** 目标选择复用澄清的暂停/接续协议，参数不能携带模型虚构的候选 ID。 */
export function decodeAgentCreateTargetRequest(argumentsJson: string): AgentClarificationRequest {
  const raw: RawClarificationRequest = JSON.parse(argumentsJson) as RawClarificationRequest;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AgentToolSchemaError('invalid_type', '$', 'Target selection requires an object');
  }
  for (const key of Object.keys(raw)) {
    if (key !== 'clarificationId' && key !== 'question') {
      throw new AgentToolSchemaError('unexpected_property', key, 'Only clarificationId and question are accepted');
    }
  }
  return { id: boundedText(raw.clarificationId, 'clarificationId', 64),
    question: boundedText(raw.question, 'question', 600), kind: 'create_target',
    options: [], recommendedOptionId: '', allowFreeText: true };
}

export function buildClarificationAnswerText(request: AgentClarificationRequest,
  answer: AgentClarificationAnswer): string {
  return `澄清问题 ID=${request.id}\n问题：${request.question}\n` +
    `我的选择：${answer.optionLabel} (optionId=${answer.optionId})\n` +
    `补充：${answer.supplementalText.length > 0 ? answer.supplementalText : '无'}`;
}

export function buildClarificationAnswerVisibleText(answer: AgentClarificationAnswer): string {
  if (answer.optionLabel.length === 0) { return answer.supplementalText; }
  return answer.supplementalText.length > 0 ?
    `${answer.optionLabel}\n${answer.supplementalText}` : answer.optionLabel;
}

/** 自由文本可独立提交，不强迫用户先选择建议。 */
export function canAnswerClarification(view: AgentClarificationView): boolean {
  return view.selectedOptionId.length > 0 ||
    (view.request.allowFreeText && view.supplementalText.trim().length > 0);
}
