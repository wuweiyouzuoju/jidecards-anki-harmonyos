// SPDX-License-Identifier: AGPL-3.0-or-later
import { decodeNoteTextEntities } from './NoteRichText';

export interface NoteMediaPart {
  start: number;
  end: number;
  text: string;
  kind: string;
  filename: string;
}

export interface NoteImageSourceAttribute {
  start: number;
  end: number;
  value: string;
}

/** 逐个消费属性，避免把 alt 等引号内容中的 src= 当作真正图片地址。 */
export function noteImageSourceAttribute(tag: string): NoteImageSourceAttribute | undefined {
  const attributes: RegExp = new RegExp('([^\\s=/>]+)(?:\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+)))?', 'g');
  const body: string = tag.slice(4, -1);
  let match: RegExpExecArray | null = attributes.exec(body);
  while (match !== null) {
    if (match[1].toLowerCase() === 'src') return { start: 4 + match.index, end: 4 + attributes.lastIndex,
      value: match[2] ?? match[3] ?? match[4] ?? '' };
    match = attributes.exec(body);
  }
  return undefined;
}

/** 只分离可识别媒体；原始标签、属性、顺序和其余 HTML 原样保留。 */
export function noteMediaParts(value: string): NoteMediaPart[] {
  const parts: NoteMediaPart[] = [];
  const pattern: RegExp = new RegExp('<!--[\\s\\S]*?-->|<(script|style)\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>|<(?:[^>"\']|"[^"]*"|\'[^\']*\')*>|\\[sound:([^\\]\\r\\n]+)\\]', 'gi');
  let offset: number = 0;
  let match: RegExpExecArray | null = pattern.exec(value);
  while (match !== null) {
    let kind: string = '';
    let filename: string = '';
    if (match[2] !== undefined) { kind = 'audio'; filename = match[2]; }
    else if (new RegExp('^<img\\s', 'i').test(match[0])) {
      const src: NoteImageSourceAttribute | undefined = noteImageSourceAttribute(match[0]);
      if (src !== undefined) { kind = 'image'; filename = src.value; }
    }
    if (kind !== '') {
      parts.push({ start: offset, end: match.index, text: value.slice(offset, match.index), kind: 'text', filename: '' });
      parts.push({ start: match.index, end: pattern.lastIndex, text: match[0], kind: kind,
        filename: decodeNoteTextEntities(filename) ?? filename });
      offset = pattern.lastIndex;
    }
    match = pattern.exec(value);
  }
  parts.push({ start: offset, end: value.length, text: value.slice(offset), kind: 'text', filename: '' });
  return parts;
}

export function replaceNoteMediaPart(value: string, index: number, replacement: string): string {
  const part: NoteMediaPart | undefined = noteMediaParts(value)[index];
  return part === undefined ? value : value.slice(0, part.start) + replacement + value.slice(part.end);
}

/** URL 解码之后再限制平面媒体目录；无效路径交给预览错误状态，不读取目录外文件。 */
export function noteImagePreviewSource(filesDir: string, filename: string): string {
  if (new RegExp('^https?://', 'i').test(filename)) return filename;
  let decoded: string = filename;
  try { decoded = decodeURIComponent(filename); } catch (error) { /* 保留合法的字面百分号。 */ }
  if (decoded === '' || decoded === '.' || decoded === '..' ||
    new RegExp('[/\\\\:\\x00-\\x1f\\x7f]').test(decoded)) return '';
  return `file://${filesDir}/collection.media/${encodeURIComponent(decoded)}`;
}

export function assertNoteMediaResolved(fields: string[]): void {
  if (fields.some((field: string): boolean => noteMediaParts(field).some((part: NoteMediaPart): boolean =>
    part.kind !== 'text' && part.filename.startsWith('jidecards-draft:')))) {
    throw new Error('Unresolved note media draft');
  }
}
