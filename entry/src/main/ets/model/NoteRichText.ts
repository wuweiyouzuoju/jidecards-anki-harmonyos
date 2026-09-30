// SPDX-License-Identifier: AGPL-3.0-or-later
export const FORMAT_BOLD: number = 1;
export const FORMAT_ITALIC: number = 2;
export const FORMAT_UNDERLINE: number = 4;
export const FORMAT_HIGHLIGHT: number = 8;
export interface NoteTextRun { text: string; format: number; }

function decodeText(text: string): string | null {
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
  const runs: NoteTextRun[] = [];
  for (const part of parts) {
    if (part === '') continue;
    const lower: string = part.toLowerCase();
    if (new RegExp('^<br\\s*/?>$').test(lower)) {
      runs.push({ text: '\n', format: masks[masks.length - 1] }); continue;
    }
    if (part[0] === '<' && part[part.length - 1] === '>') {
      const match: RegExpMatchArray | null = lower.match(new RegExp('^<(/?)(b|strong|i|em|u|mark)>$'));
      if (match === null) return null;
      const tag: string = match[2];
      if (match[1] === '/') {
        if (tags.pop() !== tag) return null;
        masks.pop();
      } else {
        const flag: number = tag === 'b' || tag === 'strong' ? FORMAT_BOLD :
          tag === 'i' || tag === 'em' ? FORMAT_ITALIC : tag === 'u' ? FORMAT_UNDERLINE : FORMAT_HIGHLIGHT;
        tags.push(tag); masks.push(masks[masks.length - 1] | flag);
      }
    } else {
      const text: string | null = decodeText(part);
      if (text === null) return null;
      runs.push({ text: text, format: masks[masks.length - 1] });
    }
  }
  return tags.length === 0 ? runs : null;
}

export function serializeNoteRichText(runs: NoteTextRun[]): string {
  const merged: NoteTextRun[] = [];
  for (const run of runs) {
    if (run.text === '') continue;
    const last: NoteTextRun | undefined = merged[merged.length - 1];
    if (last !== undefined && last.format === run.format) last.text += run.text;
    else merged.push({ text: run.text, format: run.format });
  }
  return merged.map((run: NoteTextRun): string => {
    let text: string = run.text.replace(new RegExp('&', 'g'), '&amp;').replace(new RegExp('<', 'g'), '&lt;')
      .replace(new RegExp('>', 'g'), '&gt;').replace(new RegExp('\u00a0', 'g'), '&nbsp;')
      .replace(new RegExp('\\r?\\n', 'g'), '<br>');
    if ((run.format & FORMAT_HIGHLIGHT) !== 0) text = `<mark>${text}</mark>`;
    if ((run.format & FORMAT_UNDERLINE) !== 0) text = `<u>${text}</u>`;
    if ((run.format & FORMAT_ITALIC) !== 0) text = `<i>${text}</i>`;
    if ((run.format & FORMAT_BOLD) !== 0) text = `<b>${text}</b>`;
    return text;
  }).join('');
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
