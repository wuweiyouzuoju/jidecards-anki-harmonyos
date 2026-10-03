// SPDX-License-Identifier: AGPL-3.0-or-later

import type { AgentCardStyle } from './AgentCardStyle';
import { validateAgentCardStyle } from './AgentCardStyle';
import type { DraftOperation } from './AgentTypes';

export interface AgentTemplateUpdate {
  style?: AgentCardStyle;
  templates: string;
  css: string;
}

/** Historical and raw-CSS drafts need not contain a structured appearance preview. */
export function agentDraftAppearance(operation: DraftOperation): AgentCardStyle | null {
  if (operation.kind !== 'update_template') { return null; }
  try {
    const payload: AgentTemplateUpdate = JSON.parse(operation.after) as AgentTemplateUpdate;
    return payload.style === undefined ? null : validateAgentCardStyle(payload.style);
  } catch (error) { return null; }
}

interface LegacyTemplate {
  name: string;
  qfmt: string;
  afmt: string;
  ord: number | null;
}

export interface AgentLegacyNotetype {
  css: string;
  tmpls: Object[];
}

export function readAgentLegacyNotetype(json: string): AgentLegacyNotetype {
  const value: AgentLegacyNotetype = JSON.parse(json) as AgentLegacyNotetype;
  if (value === null || typeof value !== 'object' || typeof value.css !== 'string' ||
    !Array.isArray(value.tmpls) || value.tmpls.length === 0) {
    throw new Error('invalid_notetype_snapshot');
  }
  return value;
}

/** Validate before showing a draft; an empty placeholder must never delete all templates. */
export function validateAgentTemplates(json: string): Object[] {
  let templates: LegacyTemplate[];
  try { templates = JSON.parse(json) as LegacyTemplate[]; } catch (error) {
    throw new Error('invalid_template_json');
  }
  if (!Array.isArray(templates) || templates.length === 0) { throw new Error('empty_template_list'); }
  const names: Set<string> = new Set<string>();
  const ordinals: Set<number> = new Set<number>();
  for (const template of templates) {
    if (template === null || typeof template !== 'object' || typeof template.name !== 'string' ||
      template.name.trim().length === 0 || typeof template.qfmt !== 'string' ||
      template.qfmt.trim().length === 0 || typeof template.afmt !== 'string' ||
      (template.ord !== null && (!Number.isSafeInteger(template.ord) || template.ord < 0))) {
      throw new Error('invalid_template_fields');
    }
    if (names.has(template.name) || (template.ord !== null && ordinals.has(template.ord))) {
      throw new Error('duplicate_template_identity');
    }
    names.add(template.name);
    if (template.ord !== null) { ordinals.add(template.ord); }
  }
  return templates;
}

export function sameAgentIds(left: number[], right: number[]): boolean {
  const expected: Set<number> = new Set<number>(left);
  const actual: Set<number> = new Set<number>(right);
  return expected.size === actual.size && right.every((id: number): boolean => expected.has(id));
}
