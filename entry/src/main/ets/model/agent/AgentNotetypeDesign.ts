// SPDX-License-Identifier: AGPL-3.0-or-later

import type { AgentExtensionArguments } from './AgentExtensionTools';
import { applyAgentCardStyle } from './AgentCardStyle';

function escapeLabel(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function notetypeFront(design: AgentExtensionArguments): string {
  if (design.kind === 'cloze') { return `{{cloze:${design.frontFields[0]}}}`; }
  return design.frontFields.map((name: string): string => `<div>{{${name}}}</div>`).join('\n');
}

export function notetypeBack(design: AgentExtensionArguments): string {
  const prefix: string = design.kind === 'cloze' ? `{{cloze:${design.frontFields[0]}}}` : '{{FrontSide}}';
  return prefix + '\n<hr id="answer">\n' + design.backFields.map((name: string): string =>
    `<div><small>${escapeLabel(name)}</small><br>{{${name}}}</div>`).join('\n');
}

/** 基于 Anki 标准类型保留后端字段默认值；模型只能提交字段布局，不能直接伪造旧版 JSON。 */
export function buildAgentNotetypeJson(stockJson: string, design: AgentExtensionArguments): string {
  const stock: Record<string, Object> = JSON.parse(stockJson) as Record<string, Object>;
  const fields: Record<string, Object>[] = stock['flds'] as Record<string, Object>[];
  const templates: Record<string, Object>[] = stock['tmpls'] as Record<string, Object>[];
  if (!Array.isArray(fields) || fields.length === 0 || !Array.isArray(templates) || templates.length === 0) {
    throw new Error('notetype_stock_invalid');
  }
  const newFields: Record<string, Object>[] = [];
  for (let index: number = 0; index < design.fields.length; index++) {
    const field: Record<string, Object> = JSON.parse(JSON.stringify(fields[0])) as Record<string, Object>;
    field['name'] = design.fields[index]; field['ord'] = index;
    newFields.push(field);
  }
  const template: Record<string, Object> = templates[0];
  template['qfmt'] = notetypeFront(design); template['afmt'] = notetypeBack(design); template['ord'] = 0;
  stock['id'] = 0; stock['name'] = design.name; stock['flds'] = newFields; stock['tmpls'] = [template];
  stock['sortf'] = 0;
  if (design.style !== undefined) {
    stock['css'] = applyAgentCardStyle(typeof stock['css'] === 'string' ? stock['css'] as string : '', design.style);
  }
  return JSON.stringify(stock);
}
