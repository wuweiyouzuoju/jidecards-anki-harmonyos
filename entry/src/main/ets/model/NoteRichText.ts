// SPDX-License-Identifier: AGPL-3.0-or-later
export const FORMAT_BOLD: number = 1;
export const FORMAT_ITALIC: number = 2;
export const FORMAT_UNDERLINE: number = 4;
export const FORMAT_HIGHLIGHT: number = 8;
export const FORMAT_SUPERSCRIPT: number = 16;
export const FORMAT_SUBSCRIPT: number = 32;
export interface NoteTextRun { text: string; format: number; url?: string; }

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
  const runs: NoteTextRun[] = [];
  for (const part of parts) {
    if (part === '') continue;
    const lower: string = part.toLowerCase();
    if (new RegExp('^<br\\s*/?>$').test(lower)) {
      const run: NoteTextRun = { text: '\n', format: masks[masks.length - 1] };
      if (urls[urls.length - 1] !== '') run.url = urls[urls.length - 1];
      runs.push(run); continue;
    }
    if (part[0] === '<' && part[part.length - 1] === '>') {
      const link: RegExpMatchArray | null = part.match(new RegExp('^<a\\s+href=(?:"([^"<>]*)"|\'([^\'<>]*)\')\\s*>$', 'i'));
      if (link !== null) {
        const url: string | null = decodeNoteTextEntities(link[1] ?? link[2]);
        if (url === null || noteLinkUrl(url) === '' || urls[urls.length - 1] !== '') return null;
        tags.push('a'); masks.push(masks[masks.length - 1]); urls.push(url); continue;
      }
      const match: RegExpMatchArray | null = lower.match(new RegExp('^<(/?)(b|strong|i|em|u|mark|sup|sub|a)>$'));
      if (match === null) return null;
      const tag: string = match[2];
      if (match[1] === '/') {
        if (tags.pop() !== tag) return null;
        masks.pop(); urls.pop();
      } else {
        if (tag === 'a') return null;
        const flag: number = tag === 'b' || tag === 'strong' ? FORMAT_BOLD :
          tag === 'i' || tag === 'em' ? FORMAT_ITALIC : tag === 'u' ? FORMAT_UNDERLINE :
          tag === 'mark' ? FORMAT_HIGHLIGHT : tag === 'sup' ? FORMAT_SUPERSCRIPT : FORMAT_SUBSCRIPT;
        if ((flag & (FORMAT_SUPERSCRIPT | FORMAT_SUBSCRIPT)) !== 0 &&
          (masks[masks.length - 1] & (FORMAT_SUPERSCRIPT | FORMAT_SUBSCRIPT)) !== 0) return null;
        tags.push(tag); masks.push(masks[masks.length - 1] | flag); urls.push(urls[urls.length - 1]);
      }
    } else {
      const text: string | null = decodeNoteTextEntities(part);
      if (text === null) return null;
      const run: NoteTextRun = { text: text, format: masks[masks.length - 1] };
      if (urls[urls.length - 1] !== '') run.url = urls[urls.length - 1];
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
    if (last !== undefined && last.format === run.format && last.url === run.url) last.text += run.text;
    else {
      const copy: NoteTextRun = { text: run.text, format: run.format };
      if (run.url !== undefined) copy.url = run.url;
      merged.push(copy);
    }
  }
  return merged.map((run: NoteTextRun): string => {
    let text: string = encodeNoteText(run.text);
    if ((run.format & FORMAT_SUPERSCRIPT) !== 0) text = `<sup>${text}</sup>`;
    if ((run.format & FORMAT_SUBSCRIPT) !== 0) text = `<sub>${text}</sub>`;
    if ((run.format & FORMAT_HIGHLIGHT) !== 0) text = `<mark>${text}</mark>`;
    if ((run.format & FORMAT_UNDERLINE) !== 0) text = `<u>${text}</u>`;
    if ((run.format & FORMAT_ITALIC) !== 0) text = `<i>${text}</i>`;
    if ((run.format & FORMAT_BOLD) !== 0) text = `<b>${text}</b>`;
    if (run.url !== undefined && run.url !== '') {
      text = `<a href="${encodeNoteText(run.url).replace(new RegExp('"', 'g'), '&quot;')}">${text}</a>`;
    }
    return text;
  }).join('');
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
      result.push(copy);
    }
    offset += run.text.length;
  }
  return result;
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
