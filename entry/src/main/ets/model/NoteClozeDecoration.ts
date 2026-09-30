// SPDX-License-Identifier: AGPL-3.0-or-later
import type { NoteTextRun } from './NoteRichText';
import { FORMAT_HIGHLIGHT } from './NoteRichText';
export interface NoteClozeDecoration { start: number; end: number; cloze: boolean; highlight: boolean; }

/** UTF-16 位置与 RichEditor 一致；完整挖空（含嵌套）才着色，保留组号/提示原文。 */
export function noteClozeDecorations(runs: NoteTextRun[]): NoteClozeDecoration[] {
  const text: string = runs.map((run: NoteTextRun): string => run.text).join('');
  const mask: boolean[] = new Array<boolean>(text.length).fill(false);
  const stack: number[] = [];
  const tokens: RegExp = new RegExp('\\{\\{c[0-9]+(?:,[0-9]+)*::|\\}\\}', 'g');
  let token: RegExpExecArray | null = tokens.exec(text);
  while (token !== null) {
    if (token[0] === '}}') {
      const start: number | undefined = stack.pop();
      if (start !== undefined) mask.fill(true, start, token.index + 2);
    } else stack.push(token.index);
    token = tokens.exec(text);
  }
  const parts: NoteClozeDecoration[] = [];
  let offset: number = 0;
  for (const run of runs) {
    const highlight: boolean = (run.format & FORMAT_HIGHLIGHT) !== 0;
    for (let i: number = 0; i < run.text.length; i++) {
      const cloze: boolean = mask[offset];
      const last: NoteClozeDecoration | undefined = parts[parts.length - 1];
      if (last !== undefined && last.cloze === cloze && last.highlight === highlight) last.end++;
      else parts.push({ start: offset, end: offset + 1, cloze: cloze, highlight: highlight });
      offset++;
    }
  }
  return parts;
}
