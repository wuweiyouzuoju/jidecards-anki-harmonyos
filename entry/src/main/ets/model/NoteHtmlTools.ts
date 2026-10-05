// SPDX-License-Identifier: AGPL-3.0-or-later
import { parseNoteRichText, serializeNoteRichText, sliceNoteRichText, encodeNoteText,
  noteLinkUrl } from './NoteRichText';
import type { NoteTextRun } from './NoteRichText';
import type { FieldEditResult } from './NoteFieldEditing';

export function noteEditorHeight(expanded: boolean): number { return expanded ? 336 : 112; }

/** 工具不能把光标两侧的半个标签、实体或代理对拼成损坏的源码。 */
function sourceSelectionComplete(value: string, start: number, end: number): boolean {
  if (start < 0 || end < start || end > value.length) return false;
  const tokens: RegExp = new RegExp('<[^>]*>|&[^;\\s]+;', 'g');
  let token: RegExpExecArray | null;
  while ((token = tokens.exec(value)) !== null) {
    const after: number = token.index + token[0].length;
    if ((start > token.index && start < after) || (end > token.index && end < after)) return false;
  }
  if (new RegExp('[<>]').test(value.slice(start, end).replace(new RegExp('<[^>]*>', 'g'), ''))) return false;
  for (const offset of [start, end]) {
    const before: number = value.charCodeAt(offset - 1);
    const after: number = value.charCodeAt(offset);
    if (before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff) return false;
  }
  return true;
}

/** 列表的每行独立序列化，避免粗体等标签跨越 li 边界。 */
export function noteListHtml(runs: NoteTextRun[], ordered: boolean): string {
  const lines: NoteTextRun[][] = [[]];
  for (const run of runs) {
    const parts: string[] = run.text.split('\n');
    for (let index: number = 0; index < parts.length; index++) {
      const part: NoteTextRun = { text: parts[index], format: run.format };
      if (run.url !== undefined) part.url = run.url;
      lines[lines.length - 1].push(part);
      if (index < parts.length - 1) lines.push([]);
    }
  }
  const tag: string = ordered ? 'ol' : 'ul';
  return `<${tag}>${lines.map((line: NoteTextRun[]): string => `<li>${serializeNoteRichText(line)}</li>`).join('')}</${tag}>`;
}

export function richNoteList(runs: NoteTextRun[], start: number, end: number, ordered: boolean): FieldEditResult {
  const text: string = runs.map((run: NoteTextRun): string => run.text).join('');
  const from: number = Math.max(0, Math.min(start, text.length));
  const to: number = Math.max(from, Math.min(end, text.length));
  const prefix: string = serializeNoteRichText(sliceNoteRichText(runs, 0, from));
  const list: string = noteListHtml(sliceNoteRichText(runs, from, to), ordered);
  return { text: prefix + list + serializeNoteRichText(sliceNoteRichText(runs, to, text.length)),
    start: prefix.length + list.length, end: prefix.length + list.length };
}

/** 源码工具只接管能理解的完整片段，未知 HTML 或跨标签选区不做猜测。 */
export function sourceNoteList(value: string, start: number, end: number, ordered: boolean): FieldEditResult | null {
  const from: number = Math.max(0, Math.min(start, value.length));
  const to: number = Math.max(from, Math.min(end, value.length));
  if (!sourceSelectionComplete(value, from, to)) return null;
  const runs: NoteTextRun[] | null = parseNoteRichText(value.slice(from, to));
  if (runs === null) return null;
  const list: string = noteListHtml(runs, ordered);
  return { text: value.slice(0, from) + list + value.slice(to), start: from + list.length, end: from + list.length };
}

export function sourceNoteClearFormat(value: string, start: number, end: number): FieldEditResult | null {
  if (end <= start || !sourceSelectionComplete(value, start, end)) return null;
  const runs: NoteTextRun[] | null = parseNoteRichText(value.slice(start, end));
  if (runs === null) return null;
  const plain: string = encodeNoteText(runs.map((run: NoteTextRun): string => run.text).join(''));
  return { text: value.slice(0, start) + plain + value.slice(end), start: start + plain.length, end: start + plain.length };
}

export function richNoteLink(runs: NoteTextRun[], start: number, end: number, url: string, label: string): string {
  const length: number = runs.reduce((total: number, run: NoteTextRun): number => total + run.text.length, 0);
  const selected: NoteTextRun[] = end > start ? sliceNoteRichText(runs, start, end) : [{ text: label, format: 0 }];
  const linked: NoteTextRun[] = selected.map((run: NoteTextRun): NoteTextRun =>
    ({ text: run.text, format: run.format, url: noteLinkUrl(url) }));
  return serializeNoteRichText(sliceNoteRichText(runs, 0, start).concat(linked, sliceNoteRichText(runs, end, length)));
}

export function sourceNoteLink(value: string, start: number, end: number, url: string, label: string): FieldEditResult | null {
  if (noteLinkUrl(url) === '' || !sourceSelectionComplete(value, start, end)) return null;
  const prefix: string = value.slice(0, start).toLowerCase();
  if (prefix.lastIndexOf('<a ') > prefix.lastIndexOf('</a>')) return null;
  const selected: string = value.slice(start, end);
  // 不嵌套已有链接，也不包裹不完整的格式标签。
  const runs: NoteTextRun[] | null = parseNoteRichText(selected);
  if (runs === null || runs.some((run: NoteTextRun): boolean => run.url !== undefined)) return null;
  const contents: string = selected === '' ? encodeNoteText(label) : selected;
  const link: string = `<a href="${encodeNoteText(noteLinkUrl(url)).replace(new RegExp('"', 'g'), '&quot;')}">${contents}</a>`;
  return { text: value.slice(0, start) + link + value.slice(end), start: start + link.length, end: start + link.length };
}
