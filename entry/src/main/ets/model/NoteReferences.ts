// SPDX-License-Identifier: AGPL-3.0-or-later
import { emptyNoteLinks, parseNoteLinks, updateNoteLinkField, linkPlain } from './NoteLinks';
import type { NoteLinkData } from './NoteLinks';
import { decodeNoteTextEntities, encodeNoteText, NOTE_REFERENCE_PREFIX } from './NoteRichText';

/** 普通 HTML 锚点可被两端编辑器保真保留；显示文字属于这一处引用。 */
export { NOTE_REFERENCE_PREFIX } from './NoteRichText';
export interface NoteReference { guid: string; label: string; }
export function noteReferenceUrl(guid: string): string { return NOTE_REFERENCE_PREFIX + encodeURIComponent(guid); }
export function noteReferenceGuid(url: string): string {
  if (!url.startsWith(NOTE_REFERENCE_PREFIX)) return '';
  try {
    const guid: string = decodeURIComponent(url.slice(NOTE_REFERENCE_PREFIX.length));
    return guid.length > 0 && guid.length <= 128 && !/[\u0000-\u001f]/.test(guid) ? guid : '';
  } catch (_error) { return ''; }
}
export function noteReferences(fields: string[]): NoteReference[] {
  const result: NoteReference[] = [];
  for (const field of fields) {
    const anchors: RegExp = /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi;
    let match: RegExpExecArray | null;
    while ((match = anchors.exec(field)) !== null) {
      const guid: string = noteReferenceGuid(decodeNoteTextEntities(match[2]) ?? '');
      if (guid !== '') result.push({ guid: guid, label: linkPlain(match[3]) });
    }
  }
  return result;
}
export function changeNoteReferences(fields: string[], guid: string, label?: string, occurrence: number = -1): string[] {
  let index: number = 0;
  return fields.map((field: string): string => field.replace(
    /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi,
    (all: string, _quote: string, url: string, content: string): string => {
      if (noteReferenceGuid(decodeNoteTextEntities(url) ?? '') !== guid) return all;
      if (occurrence >= 0 && index++ !== occurrence) return all;
      return label === undefined ? content : '<a href="' + noteReferenceUrl(guid) + '">' + encodeNoteText(label) + '</a>';
    }));
}
export function noteReferenceData(fields: string[], guid: string): NoteLinkData {
  const owned: string[] = fields.filter((field: string): boolean => field.includes('<!--jide-links:'));
  if (owned.length > 1) throw new Error('note_links_conflict');
  if (owned.length === 0 && fields.some((field: string): boolean => field.includes('ml-mirror-row')))
    throw new Error('note_links_migrate');
  return owned.length === 0 ? emptyNoteLinks(guid) : parseNoteLinks(owned[0], guid) ?? emptyNoteLinks(guid);
}
/** 显式旧关系与正文引用取并集；不要求添加字段或改写用户模板。 */
export function stageNoteReferenceFields(fields: string[], guid: string, targets: string[]): string[] {
  if (fields.length === 0) throw new Error('note_links_error');
  const data: NoteLinkData = noteReferenceData(fields, guid);
  const outgoing: string[] = targets.concat(noteReferences(fields).map((ref: NoteReference): string => ref.guid));
  data.targets = Array.from(new Set<string>(outgoing));
  if (data.targets.some((target: string): boolean => target === guid)) throw new Error('note_links_self');
  const result: string[] = fields.slice();
  const ord: number = fields.findIndex((field: string): boolean => field.includes('<!--jide-links:'));
  const index: number = ord >= 0 ? ord : fields.length - 1;
  // 展示镜像由运行时依当前图生成，避免在正文字段中显示或残留旧反向关系。
  result[index] = updateNoteLinkField(result[index], data, '');
  return result;
}
export function prepareNoteReferenceFields(fields: string[], guid: string, before?: string[]): string[] {
  const references: NoteReference[] = noteReferences(fields);
  if (references.length === 0 && !fields.some((field: string): boolean => field.includes('<!--jide-links:'))) return fields.slice();
  const data: NoteLinkData = noteReferenceData(fields, guid);
  const oldInline: string[] = noteReferences(before ?? []).map((ref: NoteReference): string => ref.guid);
  return stageNoteReferenceFields(fields, guid, data.targets.filter((target: string): boolean => !oldInline.includes(target)));
}
