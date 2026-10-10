// SPDX-License-Identifier: AGPL-3.0-or-later
import { NOTE_EDITOR_FONT_SIZES, NOTE_EDITOR_HEADINGS } from './NoteFieldEditing';
import type { NoteEditorFontSize } from './NoteFieldEditing';
export const FORMAT_BOLD: number = 1;
export const FORMAT_ITALIC: number = 2;
export const FORMAT_UNDERLINE: number = 4;
export const FORMAT_HIGHLIGHT: number = 8;
export const FORMAT_SUPERSCRIPT: number = 16;
export const FORMAT_SUBSCRIPT: number = 32;
export interface NoteTextRun { text: string; format: number; url?: string; fontSize?: string; heading?: string; blockBreak?: boolean; }

export function noteHeadingScale(id: string): number {
  return NOTE_EDITOR_HEADINGS.find((heading: NoteEditorFontSize): boolean => heading.id === id)?.scale ?? 1;
}

export function noteFontSizeValue(id: string, base: number): number {
  return base * (NOTE_EDITOR_FONT_SIZES.find((size: NoteEditorFontSize): boolean => size.id === id)?.scale ?? 1);
}

/** 原生默认字号不强制写入 medium，保留字段对模板字号的继承。 */
export function noteFontSizeId(value: number, base: number): string {
  if (!Number.isFinite(value) || Math.abs(value - base) < 0.01) return '';
  return NOTE_EDITOR_FONT_SIZES.find((size: NoteEditorFontSize): boolean =>
    Math.abs(base * size.scale - value) < 0.01)?.id ?? '';
}

export function noteLinkUrl(value: string): string {
  const url: string = value.trim();
  return new RegExp('^(https?://[^\\s]+|mailto:[^\\s]+|#[^\\s]+)$', 'i').test(url) &&
    !new RegExp('[\\u0000-\\u0020<>]').test(url) ? url : '';
}

export function encodeNoteText(text: string): string {
  return text.replace(new RegExp('&', 'g'), '&amp;').replace(new RegExp('<', 'g'), '&lt;')
    .replace(new RegExp('>', 'g'), '&gt;').replace(new RegExp('\u00a0', 'g'), '&nbsp;')
    .replace(new RegExp('\\r?\\n', 'g'), '<br>');
}

export function decodeNoteTextEntities(text: string): string | null {
  let valid: boolean = true;
  const decoded: string = text.replace(new RegExp('&([^;\\s]+);', 'g'), (_all: string, entity: string): string => {
    if (entity === 'amp') return '&';
    if (entity === 'lt') return '<';
    if (entity === 'gt') return '>';
    if (entity === 'quot') return '"';
    if (entity === 'apos' || entity === '#39') return "'";
    if (entity === 'nbsp') return '\u00a0';
    if (new RegExp('^#(?:[0-9]+|x[0-9a-f]+)$', 'i').test(entity)) {
      const hex: boolean = entity[1].toLowerCase() === 'x';
      const point: number = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)) return String.fromCodePoint(point);
    }
    valid = false; return '';
  });
  return valid ? decoded : null;
}

/** 仅接管能无损理解的文字标记；未知 HTML/媒体仍原样交给源码编辑。 */
export function parseNoteRichText(html: string): NoteTextRun[] | null {
  const parts: string[] = html.split(new RegExp('(<[^>]*>)', 'g'));
  const tags: string[] = [];
  const masks: number[] = [0];
  const urls: string[] = [''];
  const sizes: string[] = [''];
  const headings: string[] = [''];
  const runs: NoteTextRun[] = [];
  for (const part of parts) {
    if (part === '') continue;
    const lower: string = part.toLowerCase();
    if (new RegExp('^<br\\s*/?>$').test(lower)) {
      const run: NoteTextRun = { text: '\n', format: masks[masks.length - 1] };
      if (urls[urls.length - 1] !== '') run.url = urls[urls.length - 1];
      if (sizes[sizes.length - 1] !== '') run.fontSize = sizes[sizes.length - 1];
      if (headings[headings.length - 1] !== '') run.heading = headings[headings.length - 1];
      runs.push(run); continue;
    }
    if (part[0] === '<' && part[part.length - 1] === '>') {
      const link: RegExpMatchArray | null = part.match(new RegExp('^<a\\s+href=(?:"([^"<>]*)"|\'([^\'<>]*)\')\\s*>$', 'i'));
      if (link !== null) {
        const url: string | null = decodeNoteTextEntities(link[1] ?? link[2]);
        if (url === null || noteLinkUrl(url) === '' || urls[urls.length - 1] !== '') return null;
        tags.push('a'); masks.push(masks[masks.length - 1]); urls.push(url);
        sizes.push(sizes[sizes.length - 1]); headings.push(headings[headings.length - 1]); continue;
      }
      const size: RegExpMatchArray | null = part.match(new RegExp(
        '^<span\\s+style\\s*=\\s*(["\'])\\s*font-size\\s*:\\s*([a-z-]+)\\s*;?\\s*\\1\\s*>$', 'i'));
      if (size !== null) {
        const id: string = size[2].toLowerCase();
        if (!NOTE_EDITOR_FONT_SIZES.some((option: NoteEditorFontSize): boolean => option.id === id)) return null;
        tags.push('span'); masks.push(masks[masks.length - 1]); urls.push(urls[urls.length - 1]); sizes.push(id);
        headings.push(headings[headings.length - 1]);
        continue;
      }
      if (new RegExp('^<span\\s+style\\s*=\\s*(["\'])\\s*font-weight\\s*:\\s*normal\\s*;?\\s*\\1\\s*>$', 'i').test(part)) {
        if (headings[headings.length - 1] === '') return null;
        tags.push('span'); masks.push(masks[masks.length - 1] & ~FORMAT_BOLD); urls.push(urls[urls.length - 1]);
        sizes.push(sizes[sizes.length - 1]); headings.push(headings[headings.length - 1]); continue;
      }
      const match: RegExpMatchArray | null = lower.match(new RegExp('^<(/?)(b|strong|i|em|u|mark|sup|sub|a|span|h[1-5])>$'));
      if (match === null) return null;
      const tag: string = match[2];
      if (match[1] === '/') {
        if (tags.pop() !== tag) return null;
        masks.pop(); urls.pop(); sizes.pop(); headings.pop();
        if (tag[0] === 'h') runs.push({ text: '\n', format: 0, blockBreak: true });
      } else {
        if (tag === 'a' || tag === 'span') return null;
        if (tag[0] === 'h') {
          if (headings[headings.length - 1] !== '') return null;
          const previous: NoteTextRun | undefined = runs[runs.length - 1];
          if (previous !== undefined && !previous.text.endsWith('\n')) runs.push({ text: '\n', format: 0, blockBreak: true });
          tags.push(tag); masks.push(masks[masks.length - 1] | FORMAT_BOLD); urls.push(urls[urls.length - 1]);
          sizes.push(sizes[sizes.length - 1]); headings.push(tag); continue;
        }
        const flag: number = tag === 'b' || tag === 'strong' ? FORMAT_BOLD :
          tag === 'i' || tag === 'em' ? FORMAT_ITALIC : tag === 'u' ? FORMAT_UNDERLINE :
          tag === 'mark' ? FORMAT_HIGHLIGHT : tag === 'sup' ? FORMAT_SUPERSCRIPT : FORMAT_SUBSCRIPT;
        if ((flag & (FORMAT_SUPERSCRIPT | FORMAT_SUBSCRIPT)) !== 0 &&
          (masks[masks.length - 1] & (FORMAT_SUPERSCRIPT | FORMAT_SUBSCRIPT)) !== 0) return null;
        tags.push(tag); masks.push(masks[masks.length - 1] | flag); urls.push(urls[urls.length - 1]);
        sizes.push(sizes[sizes.length - 1]);
        headings.push(headings[headings.length - 1]);
      }
    } else {
      const text: string | null = decodeNoteTextEntities(part);
      if (text === null) return null;
      const run: NoteTextRun = { text: text, format: masks[masks.length - 1] };
      if (urls[urls.length - 1] !== '') run.url = urls[urls.length - 1];
      if (sizes[sizes.length - 1] !== '') run.fontSize = sizes[sizes.length - 1];
      if (headings[headings.length - 1] !== '') run.heading = headings[headings.length - 1];
      runs.push(run);
    }
  }
  return tags.length === 0 ? runs : null;
}

export function serializeNoteRichText(runs: NoteTextRun[]): string {
  const merged: NoteTextRun[] = [];
  for (const run of runs) {
    if (run.text === '') continue;
    const last: NoteTextRun | undefined = merged[merged.length - 1];
    if (last !== undefined && last.format === run.format && last.url === run.url && last.fontSize === run.fontSize &&
      last.heading === run.heading && !last.blockBreak && !run.blockBreak) last.text += run.text;
    else {
      const copy: NoteTextRun = { text: run.text, format: run.format };
      if (run.url !== undefined) copy.url = run.url;
      if (run.fontSize !== undefined) copy.fontSize = run.fontSize;
      if (run.heading !== undefined) copy.heading = run.heading;
      if (run.blockBreak === true) copy.blockBreak = true;
      merged.push(copy);
    }
  }
  let heading: string = '';
  let html: string = '';
  for (const run of merged) {
    const next: string = run.blockBreak ? '' : run.heading ?? '';
    if (heading !== next) {
      if (heading !== '') html += `</${heading}>`;
      if (next !== '') html += `<${next}>`;
      heading = next;
    }
    if (run.blockBreak) continue;
    let text: string = encodeNoteText(run.text);
    if ((run.format & FORMAT_SUPERSCRIPT) !== 0) text = `<sup>${text}</sup>`;
    if ((run.format & FORMAT_SUBSCRIPT) !== 0) text = `<sub>${text}</sub>`;
    if ((run.format & FORMAT_HIGHLIGHT) !== 0) text = `<mark>${text}</mark>`;
    if ((run.format & FORMAT_UNDERLINE) !== 0) text = `<u>${text}</u>`;
    if ((run.format & FORMAT_ITALIC) !== 0) text = `<i>${text}</i>`;
    if ((run.format & FORMAT_BOLD) !== 0 && heading === '') text = `<b>${text}</b>`;
    if ((run.format & FORMAT_BOLD) === 0 && heading !== '') text = `<span style="font-weight:normal">${text}</span>`;
    if (run.url !== undefined && run.url !== '') {
      text = `<a href="${encodeNoteText(run.url).replace(new RegExp('"', 'g'), '&quot;')}">${text}</a>`;
    }
    if (run.fontSize !== undefined && run.fontSize !== '') text = `<span style="font-size:${run.fontSize}">${text}</span>`;
    html += text;
  }
  return html + (heading === '' ? '' : `</${heading}>`);
}

/** Span 模式没有基线偏移；字体特性不能保证上下标排版，统一保留源码。 */
export function parseNoteVisualText(html: string): NoteTextRun[] | null {
  const runs: NoteTextRun[] | null = parseNoteRichText(html);
  return runs !== null && runs.every((run: NoteTextRun): boolean =>
    (run.format & (FORMAT_SUPERSCRIPT | FORMAT_SUBSCRIPT)) === 0) ? runs : null;
}

/** 选区按 RichEditor 的 UTF-16 偏移切片，保留选区外的样式与链接。 */
export function sliceNoteRichText(runs: NoteTextRun[], start: number, end: number): NoteTextRun[] {
  const result: NoteTextRun[] = [];
  let offset: number = 0;
  for (const run of runs) {
    const from: number = Math.max(0, start - offset);
    const to: number = Math.min(run.text.length, end - offset);
    if (to > from) {
      const copy: NoteTextRun = { text: run.text.slice(from, to), format: run.format };
      if (run.url !== undefined) copy.url = run.url;
      if (run.fontSize !== undefined) copy.fontSize = run.fontSize;
      if (run.heading !== undefined) copy.heading = run.heading;
      if (run.blockBreak === true) copy.blockBreak = true;
      result.push(copy);
    }
    offset += run.text.length;
  }
  return result;
}

/** 默认继承与显式 medium 显示相同，但保存时必须保留二者区别。 */
export function noteRichFontSize(runs: NoteTextRun[], start: number, end: number, inherited: string = 'medium'): string {
  if (end <= start) return noteRichCaretFontSize(runs, start) || (noteRichCaretHeading(runs, start) === '' ? inherited : '');
  const selected: NoteTextRun[] = sliceNoteRichText(runs, start, end).filter((run: NoteTextRun): boolean => !run.blockBreak);
  const size: string = selected[0]?.fontSize ?? (selected[0]?.heading ? '' : inherited);
  return selected.every((run: NoteTextRun): boolean => (run.fontSize ?? (run.heading ? '' : inherited)) === size) ? size : '';
}

export function noteRichCaretFontSize(runs: NoteTextRun[], caret: number): string {
  const before: string = sliceNoteRichText(runs, Math.max(0, caret - 1), caret)[0]?.text ?? '';
  const position: number = before === '\n' ? caret : Math.max(0, caret - 1);
  return sliceNoteRichText(runs, position, position + 1)[0]?.fontSize ?? '';
}

export function setNoteRichFontSize(runs: NoteTextRun[], start: number, end: number, id: string): NoteTextRun[] {
  const selected: NoteTextRun[] = sliceNoteRichText(runs, start, end);
  for (const run of selected) {
    run.fontSize = id === '' ? undefined : id;
  }
  return sliceNoteRichText(runs, 0, start).concat(selected, sliceNoteRichText(runs, end, Number.MAX_SAFE_INTEGER));
}

/** 原生数值样式不携带 HTML 语义；保留字号继承、标题和可视段落边界。 */
export function preserveNoteRichStyles(runs: NoteTextRun[], styles: NoteTextRun[]): NoteTextRun[] {
  const result: NoteTextRun[] = [];
  let offset: number = 0;
  for (const run of runs) {
    const parts: NoteTextRun[] = sliceNoteRichText(styles, offset, offset + run.text.length);
    let from: number = 0;
    for (const part of parts) {
      const copy: NoteTextRun = { text: run.text.slice(from, from + part.text.length), format: run.format };
      if (run.url !== undefined) copy.url = run.url;
      if (part.fontSize !== undefined) copy.fontSize = part.fontSize;
      if (part.heading !== undefined) copy.heading = part.heading;
      if (part.blockBreak === true) copy.blockBreak = true;
      result.push(copy); from += part.text.length;
    }
    if (from < run.text.length) result.push(...sliceNoteRichText([run], from, run.text.length));
    offset += run.text.length;
  }
  return result;
}

export function noteRichHeading(runs: NoteTextRun[], start: number, end: number): string {
  if (end <= start) return noteRichCaretHeading(runs, start);
  const selected: NoteTextRun[] = sliceNoteRichText(runs, start, Math.max(start + 1, end)).filter((run: NoteTextRun): boolean => !run.blockBreak);
  const id: string = selected[0]?.heading ?? '';
  return selected.every((run: NoteTextRun): boolean => (run.heading ?? '') === id) ? id : '';
}

export function noteRichCaretHeading(runs: NoteTextRun[], caret: number): string {
  const before: NoteTextRun | undefined = sliceNoteRichText(runs, Math.max(0, caret - 1), caret)[0];
  return before !== undefined && before.text !== '\n' ? before.heading ?? '' :
    sliceNoteRichText(runs, caret, caret + 1)[0]?.heading ?? '';
}

export function noteRichParagraphRange(runs: NoteTextRun[], start: number, end: number): number[] {
  const text: string = runs.map((run: NoteTextRun): string => run.text).join('');
  const from: number = start === 0 ? 0 : text.lastIndexOf('\n', start - 1) + 1;
  const next: number = text.indexOf('\n', Math.max(start, end - 1));
  return [from, next < 0 ? text.length : next];
}

/** 标题属于整段；删除段落分隔后，合并段采用首段标题。换行边界不额外写成 br。 */
export function normalizeNoteRichHeadings(runs: NoteTextRun[]): NoteTextRun[] {
  const lines: NoteTextRun[][] = [[]];
  for (const run of runs) {
    let from: number = 0;
    for (let index: number = 0; index <= run.text.length; index++) {
      if (index < run.text.length && run.text[index] !== '\n') continue;
      if (index > from) lines[lines.length - 1].push(...sliceNoteRichText([run], from, index));
      if (index < run.text.length) lines.push([]);
      from = index + 1;
    }
  }
  const headings: string[] = lines.map((line: NoteTextRun[]): string => line[0]?.heading ?? '');
  const result: NoteTextRun[] = [];
  for (let index: number = 0; index < lines.length; index++) {
    for (const run of lines[index]) { run.heading = headings[index] || undefined; result.push(run); }
    if (index < lines.length - 1) {
      const boundary: NoteTextRun = { text: '\n', format: 0 };
      if (headings[index] !== '' || headings[index + 1] !== '') boundary.blockBreak = true;
      result.push(boundary);
    }
  }
  return result;
}

export function setNoteRichHeading(runs: NoteTextRun[], start: number, end: number, id: string): NoteTextRun[] {
  const range: number[] = noteRichParagraphRange(runs, start, end);
  const selected: NoteTextRun[] = sliceNoteRichText(runs, range[0], range[1]);
  for (const run of selected) {
    run.heading = id || undefined;
    if (id !== '') { run.fontSize = undefined; run.format |= FORMAT_BOLD; }
  }
  return normalizeNoteRichHeadings(sliceNoteRichText(runs, 0, range[0]).concat(selected,
    sliceNoteRichText(runs, range[1], Number.MAX_SAFE_INTEGER)));
}

export function clearNoteRichFormat(runs: NoteTextRun[], start: number, end: number): NoteTextRun[] {
  const paragraphs: NoteTextRun[] = setNoteRichHeading(runs, start, end, '');
  const selected: NoteTextRun[] = sliceNoteRichText(paragraphs, start, end);
  for (const run of selected) { run.format = 0; run.url = undefined; run.fontSize = undefined; }
  return sliceNoteRichText(paragraphs, 0, start).concat(selected, sliceNoteRichText(paragraphs, end, Number.MAX_SAFE_INTEGER));
}

/** SDK 返回字体枚举序号，而不是输入时的 400/700 字重。 */
export function richResultIsBold(weight: number): boolean {
  return (weight >= 5 && weight <= 9) || weight === 11 || weight >= 600;
}

export function selectionHasFormat(runs: NoteTextRun[], start: number, end: number, flag: number): boolean {
  let offset: number = 0;
  let found: boolean = false;
  for (const run of runs) {
    const next: number = offset + run.text.length;
    if (next > start && offset < end && run.text.length > 0) {
      found = true;
      if ((run.format & flag) === 0) return false;
    }
    offset = next;
  }
  return found;
}
