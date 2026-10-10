// SPDX-License-Identifier: AGPL-3.0-or-later
import { parseNoteRichText, serializeNoteRichText, sliceNoteRichText, encodeNoteText,
  noteLinkUrl, FORMAT_BOLD, FORMAT_SUPERSCRIPT, FORMAT_SUBSCRIPT, noteRichCaretHeading, noteRichCaretFontSize } from './NoteRichText';
import type { NoteTextRun } from './NoteRichText';
import { wrapFieldSelection, noteEditorFormatOptions } from './NoteFieldEditing';
import type { FieldEditResult } from './NoteFieldEditing';

export function noteEditorHeight(expanded: boolean): number { return expanded ? 336 : 112; }

export function sourceNoteHeading(value: string, start: number, end: number): string {
  if (!sourceSelectionComplete(value, start, end)) return '';
  const runs: NoteTextRun[] | null = parseNoteRichText(value.slice(start, end));
  if (end > start && runs !== null && runs.some((run: NoteTextRun): boolean => run.heading !== undefined)) {
    const selected: NoteTextRun[] = runs.filter((run: NoteTextRun): boolean => !run.blockBreak);
    const id: string = selected[0]?.heading ?? '';
    return selected.every((run: NoteTextRun): boolean => (run.heading ?? '') === id) ? id : '';
  }
  const blocks: RegExp = new RegExp('<(h[1-5])\\b[^>]*>[\\s\\S]*?</\\1\\s*>', 'gi');
  let block: RegExpExecArray | null;
  while ((block = blocks.exec(value)) !== null) {
    const from: number = block.index + block[0].indexOf('>') + 1;
    const to: number = block.index + block[0].lastIndexOf('</');
    if (start >= from && end <= to || value.slice(start, end).trim() === block[0]) return block[1].toLowerCase();
  }
  return '';
}

/** 段内选择改整段标题，完整标题选区只替换标签名，保留其他属性和媒体。 */
export function sourceNoteSetHeading(value: string, start: number, end: number, id: string): FieldEditResult | null {
  const option = noteEditorFormatOptions('heading').find((item): boolean => item.id === id);
  if (option === undefined || !sourceSelectionComplete(value, start, end)) return null;
  const blocks: RegExp = new RegExp('<(h[1-5])\\b[^>]*>[\\s\\S]*?</\\1\\s*>', 'gi');
  let block: RegExpExecArray | null;
  while ((block = blocks.exec(value)) !== null) {
    if (start >= block.index + block[0].indexOf('>') + 1 && end <= block.index + block[0].lastIndexOf('</')) {
      const updated: string = block[0].replace(new RegExp('^(<)h[1-5]|(</)h[1-5](\\s*>)$', 'gi'),
        (_all: string, open: string, close: string, suffix: string): string => open ? open + id : close + id + suffix);
      return { text: value.slice(0, block.index) + updated + value.slice(block.index + block[0].length), start: start, end: end };
    }
  }
  const contents: string = value.slice(start, end);
  if (new RegExp('</?h[1-5]\\b', 'i').test(contents)) {
    const updated: string = contents.replace(new RegExp('(<\\/?)h[1-5](?=[\\s>])', 'gi'), '$1' + id);
    return { text: value.slice(0, start) + updated + value.slice(end), start: end, end: end };
  }
  return wrapFieldSelection(value, start, end, option.prefix, option.suffix);
}

/** 读取源码光标/选区的字号；混合或无法识别的 CSS 不假定为某一档。 */
export function sourceNoteFontSize(value: string, start: number, end: number, inherited: string = 'medium'): string {
  if (!sourceSelectionComplete(value, start, end)) return '';
  const tokens: RegExp = new RegExp('<[^>]*>|[^<]+', 'g');
  const tags: string[] = [];
  const sizes: string[] = [inherited];
  let selected: string | undefined;
  let token: RegExpExecArray | null;
  while ((token = tokens.exec(value)) !== null) {
    const text: string = token[0];
    const after: number = token.index + text.length;
    if (start === end && start === token.index) return sizes[sizes.length - 1];
    if (text[0] === '<') {
      const tag: RegExpMatchArray | null = text.match(new RegExp('^<(/?)([a-z][a-z0-9]*)\\b', 'i'));
      if (tag === null) continue;
      const name: string = tag[2].toLowerCase();
      if (tag[1] === '/') {
        const index: number = tags.lastIndexOf(name);
        if (index >= 0) { tags.length = index; sizes.length = index + 1; }
      } else if (!new RegExp('^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$').test(name) &&
        !text.endsWith('/>')) {
        let size: string = sizes[sizes.length - 1];
        if (new RegExp('^(h[1-6]|small|big)$').test(name) ||
          name === 'font' && new RegExp('\\ssize\\s*=', 'i').test(text)) size = '';
        const style: RegExpMatchArray | null = text.match(new RegExp('\\sstyle\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')', 'i'));
        if (style !== null) {
          for (const declaration of (style[1] ?? style[2]).split(';')) {
            const match: RegExpMatchArray | null = declaration.match(new RegExp('^\\s*font-size\\s*:\\s*(.*?)\\s*$', 'i'));
            if (match !== null) {
              const candidate: string = match[1].toLowerCase().replace(new RegExp('\\s*!important\\s*$'), '').trim();
              size = candidate === 'inherit' ? size : candidate === 'initial' ? 'medium' :
                noteEditorFormatOptions('font_size').some((option): boolean => option.id === candidate) ? candidate : '';
            }
          }
        }
        tags.push(name); sizes.push(size);
      }
    } else if (start === end ? start > token.index && start <= after : start < after && end > token.index) {
      const size: string = sizes[sizes.length - 1];
      if (start === end) return size;
      if (selected !== undefined && selected !== size) return '';
      selected = size;
    }
  }
  return selected ?? sizes[sizes.length - 1];
}

/** 替换选区内已有字号，保留其他属性；光标留在新字号标签内以便继续输入。 */
export function sourceNoteSetFontSize(value: string, start: number, end: number, id: string): FieldEditResult | null {
  const option = noteEditorFormatOptions('font_size').find((item): boolean => item.id === id);
  if (option === undefined || !sourceSelectionComplete(value, start, end)) return null;
  const contents: string = value.slice(start, end).replace(new RegExp('<[^>]*>', 'g'), (tag: string): string =>
    tag.replace(new RegExp('(\\sstyle\\s*=\\s*)(["\'])(.*?)\\2', 'gi'),
      (_all: string, prefix: string, quote: string, style: string): string =>
        prefix + quote + style.split(';').filter((declaration: string): boolean =>
          !new RegExp('^\\s*font-size\\s*:', 'i').test(declaration)).join(';') + quote)
      .replace(new RegExp('^(<font\\b[^>]*?)\\s+size\\s*=\\s*(?:"[^"]*"|\'[^\']*\'|[^\\s>]+)', 'i'), '$1'));
  const caret: number = start + option.prefix.length + contents.length;
  return { text: value.slice(0, start) + option.prefix + contents + option.suffix + value.slice(end),
    start: caret, end: caret };
}

/** 可视选区按 HTML 边界分别序列化；插入标题后交给源码编辑与卡片预览。 */
export function richNoteWrap(runs: NoteTextRun[], start: number, end: number,
  prefix: string, suffix: string): FieldEditResult {
  const length: number = runs.reduce((total: number, run: NoteTextRun): number => total + run.text.length, 0);
  const from: number = Math.max(0, Math.min(start, length));
  const to: number = Math.max(from, Math.min(end, length));
  const before: string = serializeNoteRichText(sliceNoteRichText(runs, 0, from));
  const contents: string = serializeNoteRichText(sliceNoteRichText(runs, from, to));
  const cursor: number = before.length + prefix.length + contents.length + (from === to ? 0 : suffix.length);
  return { text: before + prefix + contents + suffix + serializeNoteRichText(sliceNoteRichText(runs, to, length)),
    start: cursor, end: cursor };
}

export function sourceNoteWrap(value: string, start: number, end: number,
  prefix: string, suffix: string): FieldEditResult | null {
  if (!sourceSelectionComplete(value, start, end)) return null;
  return wrapFieldSelection(value, start, end, prefix, suffix);
}

/** 可视选区转为标准上下标源码；空选区把光标留在标签内部，保留相邻样式与链接。 */
export function richNoteScript(runs: NoteTextRun[], start: number, end: number, superscript: boolean): FieldEditResult {
  const length: number = runs.reduce((total: number, run: NoteTextRun): number => total + run.text.length, 0);
  const from: number = Math.max(0, Math.min(start, length));
  const to: number = Math.max(from, Math.min(end, length));
  const before: string = serializeNoteRichText(sliceNoteRichText(runs, 0, from));
  const selected: NoteTextRun[] = sliceNoteRichText(runs, from, to);
  for (const run of selected) run.format &= ~(FORMAT_SUPERSCRIPT | FORMAT_SUBSCRIPT);
  const tag: string = superscript ? 'sup' : 'sub';
  const contents: string = serializeNoteRichText(selected);
  const cursor: number = before.length + tag.length + 2 + contents.length;
  return { text: before + `<${tag}>` + contents + `</${tag}>` +
    serializeNoteRichText(sliceNoteRichText(runs, to, length)), start: cursor, end: cursor };
}

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
      if (run.fontSize !== undefined) part.fontSize = run.fontSize;
      if (run.heading !== undefined) part.heading = run.heading;
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
  const last: NoteTextRun | undefined = runs[runs.length - 1];
  const plain: string = encodeNoteText((last?.blockBreak === true ? runs.slice(0, -1) : runs)
    .map((run: NoteTextRun): string => run.text).join(''));
  return { text: value.slice(0, start) + plain + value.slice(end), start: start + plain.length, end: start + plain.length };
}

export function richNoteLink(runs: NoteTextRun[], start: number, end: number, url: string, label: string,
  typing?: NoteTextRun): string {
  const length: number = runs.reduce((total: number, run: NoteTextRun): number => total + run.text.length, 0);
  const heading: string = typing?.heading ?? noteRichCaretHeading(runs, start);
  const insertion: NoteTextRun = { text: label, format: typing?.format ?? (heading === '' ? 0 : FORMAT_BOLD) };
  const size: string = typing?.fontSize ?? noteRichCaretFontSize(runs, start);
  if (heading !== '') insertion.heading = heading;
  if (size !== '') insertion.fontSize = size;
  const selected: NoteTextRun[] = end > start ? sliceNoteRichText(runs, start, end) : [insertion];
  const linked: NoteTextRun[] = selected.map((run: NoteTextRun): NoteTextRun => {
    const copy: NoteTextRun = { text: run.text, format: run.format, url: noteLinkUrl(url) };
    if (run.fontSize !== undefined) copy.fontSize = run.fontSize;
    if (run.heading !== undefined) copy.heading = run.heading;
    if (run.blockBreak === true) copy.blockBreak = true;
    return copy;
  });
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
