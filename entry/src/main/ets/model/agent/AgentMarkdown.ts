// SPDX-License-Identifier: AGPL-3.0-or-later
import type { AgentMathPart } from './AgentMath';
import { agentMathParts } from './AgentMath';

export interface AgentMarkdownRow { cells: string[]; }
export interface AgentMarkdownBlock {
  kind: string;
  text: string;
  rows: AgentMarkdownRow[];
  alignments: string[];
}

/** 管道只在代码片段和转义之外分列；字段内容始终作为文字显示。 */
function tableCells(line: string): string[] {
  const cells: string[] = [];
  let cell: string = '';
  let codeTicks: number = 0;
  let hasPipe: boolean = false;
  const trimmed: string = line.trim();
  const protectedParts: AgentMathPart[] = agentMathParts(trimmed);
  let partIndex: number = 0;
  let partStart: number = 0;
  for (let index: number = 0; index < trimmed.length; index++) {
    while (partIndex < protectedParts.length && index >= partStart + protectedParts[partIndex].text.length) {
      partStart += protectedParts[partIndex++].text.length;
    }
    if (partIndex < protectedParts.length && protectedParts[partIndex].kind === 'math' && index === partStart) {
      cell += protectedParts[partIndex].text; index += protectedParts[partIndex].text.length - 1; continue;
    }
    const char: string = trimmed[index];
    if (char === '\\' && trimmed[index + 1] === '|') { cell += '|'; index++; continue; }
    if (char === '`') {
      let count: number = 1;
      while (trimmed[index + count] === '`') count++;
      if (codeTicks === 0) codeTicks = count;
      else if (codeTicks === count) codeTicks = 0;
      cell += '`'.repeat(count); index += count - 1; continue;
    }
    if (char === '|' && codeTicks === 0) { cells.push(cell.trim()); cell = ''; hasPipe = true; }
    else cell += char;
  }
  if (!hasPipe) return [];
  cells.push(cell.trim());
  if (trimmed.startsWith('|')) cells.shift();
  if (trimmed.endsWith('|') && cells[cells.length - 1] === '') cells.pop();
  return cells;
}

function tableAlignments(line: string, columns: number): string[] {
  const cells: string[] = tableCells(line);
  if (cells.length !== columns || cells.some((cell: string): boolean => !/^:?-{3,}:?$/.test(cell))) return [];
  return cells.map((cell: string): string => cell.startsWith(':') && cell.endsWith(':') ? 'center' :
    (cell.endsWith(':') ? 'end' : 'start'));
}

/** 分块只处理已闭合的表头；未完成的流式分隔行、代码块和普通管道原样保留。 */
export function parseAgentMarkdown(text: string): AgentMarkdownBlock[] {
  const lines: string[] = text.split('\n');
  const blocks: AgentMarkdownBlock[] = [];
  let plain: string[] = [];
  let fenceChar: string = '';
  let fenceLength: number = 0;
  let index: number = 0;
  while (index < lines.length) {
    const line: string = lines[index];
    const fence: RegExpMatchArray | null = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence !== null) {
      if (fenceChar === '') { fenceChar = fence[1][0]; fenceLength = fence[1].length; }
      else if (fence[1][0] === fenceChar && fence[1].length >= fenceLength &&
        line.trim().slice(fence[1].length).trim() === '') { fenceChar = ''; }
      plain.push(line); index++; continue;
    }
    const header: string[] = fenceChar === '' ? tableCells(line) : [];
    const alignments: string[] = header.length > 0 && index + 1 < lines.length ?
      tableAlignments(lines[index + 1], header.length) : [];
    if (alignments.length === 0) { plain.push(line); index++; continue; }
    if (plain.length > 0) { blocks.push({ kind: 'text', text: plain.join('\n'), rows: [], alignments: [] }); plain = []; }
    const rows: AgentMarkdownRow[] = [{ cells: header }];
    index += 2;
    while (index < lines.length) {
      if (/^\s{0,3}(`{3,}|~{3,})/.test(lines[index])) break;
      const cells: string[] = tableCells(lines[index]);
      if (cells.length === 0) break;
      // 流式最后一行可以暂缺单元格；多余内容保留在末列，避免静默丢字。
      if (cells.length > header.length) cells.splice(header.length - 1, cells.length,
        cells.slice(header.length - 1).join(' | '));
      while (cells.length < header.length) cells.push('');
      rows.push({ cells: cells }); index++;
    }
    blocks.push({ kind: 'table', text: '', rows: rows, alignments: alignments });
  }
  if (plain.length > 0) blocks.push({ kind: 'text', text: plain.join('\n'), rows: [], alignments: [] });
  return blocks;
}
