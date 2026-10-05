// SPDX-License-Identifier: AGPL-3.0-or-later
import { 文本中的填空编号 } from './填空解析器';

export interface FieldEditResult { text: string; start: number; end: number; }

/** 只修改选区，未触碰的 HTML/媒体/未知标记逐字保留。行为参考 AnkiDroid Toolbar。 */
export function wrapFieldSelection(text: string, start: number, end: number,
  prefix: string, suffix: string): FieldEditResult {
  const from: number = start < 0 ? text.length : Math.min(text.length, Math.max(0, Math.min(start, end)));
  const to: number = end < 0 ? text.length : Math.min(text.length, Math.max(from, Math.max(start, end)));
  const value: string = text.slice(0, from) + prefix + text.slice(from, to) + suffix + text.slice(to);
  const cursor: number = from === to ? from + prefix.length : to + prefix.length + suffix.length;
  return { text: value, start: cursor, end: cursor };
}

export function nextClozeNumber(fields: string[], same: boolean): number {
  let highest: number = 0;
  for (const field of fields) {
    for (const ordinal of 文本中的填空编号(field)) highest = Math.max(highest, ordinal);
  }
  return same ? Math.max(1, highest) : highest + 1;
}

export function parseNoteTags(value: string): string[] {
  const result: string[] = [];
  const seen: Set<string> = new Set<string>();
  for (const tag of value.split(new RegExp('\\s+'))) {
    const key: string = tag.toLowerCase();
    if (tag !== '' && !seen.has(key)) { result.push(tag); seen.add(key); }
  }
  return result;
}

export function noteDraftChanged(fields: string[], original: string[], tags: string, originalTags: string): boolean {
  return fields.length !== original.length || fields.some((value: string, index: number): boolean => value !== original[index])
    || parseNoteTags(tags).join(' ') !== parseNoteTags(originalTags).join(' ');
}
/** 公共字段输入的外观与初始模式，不包含 Core 字段身份。 */
export interface NoteFieldEditingOptions {
  rtl?: boolean;
  fontName?: string;
  fontSize?: number;
  description?: string;
  /** Anki 的历史命名：默认 HTML 源码模式，保留格式。 */
  plainText?: boolean;
  collapsed?: boolean;
}

export interface NoteFieldEditingSupport {
  fieldOptions: string[];
  minimumFontSize: number;
  maximumFontSize: number;
  plainTextMeaning: string;
  fontAvailability: string;
}
export const NOTE_FIELD_EDITING_SUPPORT: NoteFieldEditingSupport = {
  fieldOptions: ['rtl', 'font', 'size', 'description', 'plainText', 'collapsed'],
  minimumFontSize: 5, maximumFontSize: 300, plainTextMeaning: 'default_html_source_preserving_formatting',
  fontAvailability: 'installed fonts with system fallback; font file import is not available'
};
