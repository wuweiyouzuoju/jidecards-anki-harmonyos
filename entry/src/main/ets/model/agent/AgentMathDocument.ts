// SPDX-License-Identifier: AGPL-3.0-or-later
import type { AgentMarkdownBlock, AgentMarkdownRow } from './AgentMarkdown';
import { parseAgentMarkdown } from './AgentMarkdown';
import type { AgentMathAppearance } from './AgentMath';
import { agentMathMarkup, agentMathHtml, agentMathUpdateScript } from './AgentMath';

/** 含公式的整段正文只拥有一个排版文档，表格单元格不再分别创建 Web/MathJax。 */
export function agentMathDocumentMarkup(text: string): string {
  return parseAgentMarkdown(text).map((block: AgentMarkdownBlock): string => {
    if (block.kind !== 'table') return `<div class="agent-prose">${agentMathMarkup(block.text)}</div>`;
    const rows: string = block.rows.map((row: AgentMarkdownRow, index: number): string => {
      const tag: string = index === 0 ? 'th' : 'td';
      return '<tr>' + row.cells.map((cell: string, column: number): string => {
        const alignment: string = block.alignments[column] === 'end' ? 'right' :
          (block.alignments[column] === 'center' ? 'center' : 'left');
        return `<${tag} style="text-align:${alignment}">${agentMathMarkup(cell)}</${tag}>`;
      }).join('') + '</tr>';
    }).join('');
    return `<div class="agent-table-scroll"><table class="agent-table" style="min-width:${block.alignments.length * 144 + 2}px">${rows}</table></div>`;
  }).join('');
}

export function agentMathDocumentHtml(text: string, appearance: AgentMathAppearance): string {
  return agentMathHtml(text, appearance, agentMathDocumentMarkup(text));
}

export function agentMathDocumentUpdateScript(text: string, appearance: AgentMathAppearance, revision: number): string {
  return agentMathUpdateScript(text, appearance, revision, agentMathDocumentMarkup(text));
}
