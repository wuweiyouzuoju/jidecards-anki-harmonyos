// SPDX-License-Identifier: AGPL-3.0-or-later
import type { NotetypeFieldPreview } from './AgentNotetypeFields';

export interface NotetypeLatexPatch { latexPre?: string; latexPost?: string; latexSvg?: boolean; }
interface LegacyLatexNotetype { latexPre: string; latexPost: string; latexsvg: boolean; }

export function validateNotetypeLatexPatch(patch: NotetypeLatexPatch): void {
  if (patch.latexPre === undefined && patch.latexPost === undefined && patch.latexSvg === undefined) {
    throw new Error('empty_notetype_latex_patch');
  }
  for (const source of [patch.latexPre, patch.latexPost]) {
    if (source !== undefined && (typeof source !== 'string' || source.length > 30000)) throw new Error('invalid_notetype_latex');
  }
  if (patch.latexSvg !== undefined && typeof patch.latexSvg !== 'boolean') throw new Error('invalid_notetype_latex');
}

/** 锁定 Core 旧版 JSON 使用 latexPre/latexPost/latexsvg；整体复制保留未知属性。 */
export function patchAgentNotetypeLatex(before: string, patch: NotetypeLatexPatch): string {
  validateNotetypeLatexPatch(patch);
  const type: LegacyLatexNotetype = JSON.parse(before) as LegacyLatexNotetype;
  if (type === null || typeof type !== 'object' || Array.isArray(type)) throw new Error('invalid_notetype_latex');
  if (patch.latexPre !== undefined) type.latexPre = patch.latexPre;
  if (patch.latexPost !== undefined) type.latexPost = patch.latexPost;
  if (patch.latexSvg !== undefined) type.latexsvg = patch.latexSvg;
  return JSON.stringify(type);
}

export function agentNotetypeLatexMatches(savedJson: string, expectedJson: string): boolean {
  const saved: LegacyLatexNotetype = JSON.parse(savedJson) as LegacyLatexNotetype;
  const expected: LegacyLatexNotetype = JSON.parse(expectedJson) as LegacyLatexNotetype;
  return saved.latexPre === expected.latexPre && saved.latexPost === expected.latexPost && saved.latexsvg === expected.latexsvg;
}

export function agentNotetypeLatexPreview(before: string, after: string, text: (key: string) => string): NotetypeFieldPreview[] {
  const oldType: LegacyLatexNotetype = JSON.parse(before) as LegacyLatexNotetype;
  const newType: LegacyLatexNotetype = JSON.parse(after) as LegacyLatexNotetype;
  const rows: NotetypeFieldPreview[] = [];
  const sourceText = (value: string): string => value === '' ? text('agent_latex_empty') : value;
  if (oldType.latexPre !== newType.latexPre) rows.push({ title: text('agent_latex_pre'),
    before: sourceText(oldType.latexPre), after: sourceText(newType.latexPre) });
  if (oldType.latexPost !== newType.latexPost) rows.push({ title: text('agent_latex_post'),
    before: sourceText(oldType.latexPost), after: sourceText(newType.latexPost) });
  if (oldType.latexsvg !== newType.latexsvg) rows.push({ title: text('agent_latex_svg'),
    before: text(oldType.latexsvg ? 'agent_value_on' : 'agent_value_off'),
    after: text(newType.latexsvg ? 'agent_value_on' : 'agent_value_off') });
  return rows;
}
