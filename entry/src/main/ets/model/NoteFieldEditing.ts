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
  for (const tag of value.split(new RegExp('\\s+'))) {
    if (tag !== '' && result.indexOf(tag) < 0) result.push(tag);
  }
  return result;
}

export function noteDraftChanged(fields: string[], original: string[], tags: string, originalTags: string): boolean {
  return fields.length !== original.length || fields.some((value: string, index: number): boolean => value !== original[index])
    || parseNoteTags(tags).join(' ') !== parseNoteTags(originalTags).join(' ');
}
