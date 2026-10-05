// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Card } from '../proto/messages/CardsMessages';
import type { EditableNote } from '../proto/messages/NoteMessages';
import { BrowserRowColor, SearchNodeFlag } from '../proto/messages/SearchMessages';

export interface CardFlagDefinition { value: number; labelKey: string; color: string; searchFlag: SearchNodeFlag; }
export const CARD_FLAGS: CardFlagDefinition[] = [
  { value: 0, labelKey: 'browser_action_flag_none', color: 'transparent', searchFlag: SearchNodeFlag.FLAG_NONE },
  { value: 1, labelKey: 'browser_action_flag_red', color: '#D92D20', searchFlag: SearchNodeFlag.FLAG_RED },
  { value: 2, labelKey: 'browser_action_flag_orange', color: '#D97A1C', searchFlag: SearchNodeFlag.FLAG_ORANGE },
  { value: 3, labelKey: 'browser_action_flag_green', color: '#238463', searchFlag: SearchNodeFlag.FLAG_GREEN },
  { value: 4, labelKey: 'browser_action_flag_blue', color: '#2F5FD0', searchFlag: SearchNodeFlag.FLAG_BLUE },
  { value: 5, labelKey: 'browser_action_flag_pink', color: '#D9408F', searchFlag: SearchNodeFlag.FLAG_PINK },
  { value: 6, labelKey: 'browser_action_flag_turquoise', color: '#1CA7A0', searchFlag: SearchNodeFlag.FLAG_TURQUOISE },
  { value: 7, labelKey: 'browser_action_flag_purple', color: '#7B2CBF', searchFlag: SearchNodeFlag.FLAG_PURPLE }
];
export interface CardMarkingState { flag: number; marked: boolean; }
export type FlagLabels = Record<string, string>;
export interface FlagLabelChange { flag: number; name: string; }
export interface CardMarkingBackend {
  card(id: number): Promise<Card>;
  note(id: number): Promise<EditableNote>;
  updateNotes(notes: EditableNote[]): Promise<void>;
  setFlag(ids: number[], flag: number): Promise<void>;
  labels(): Promise<string>;
  saveLabels(json: string): Promise<void>;
}

export function validateCardFlag(flag: number): void {
  if (!Number.isInteger(flag) || flag < 0 || flag > 7) throw new Error('Invalid card flag');
}
export function noteIsMarked(tags: string[]): boolean {
  return tags.some((tag: string): boolean => tag.toLowerCase() === 'marked');
}
export function browserRowFlag(color: BrowserRowColor): number {
  return color >= BrowserRowColor.COLOR_FLAG_RED && color <= BrowserRowColor.COLOR_FLAG_PURPLE
    ? color - BrowserRowColor.COLOR_FLAG_RED + 1 : 0;
}
export function markingNote(note: EditableNote, marked: boolean): EditableNote {
  const tags: string[] = note.tags.filter((tag: string): boolean => tag.toLowerCase() !== 'marked');
  if (marked) tags.push(note.tags.find((tag: string): boolean => tag.toLowerCase() === 'marked') ?? 'marked');
  return { id: note.id, guid: note.guid, notetypeId: note.notetypeId, mtimeSecs: note.mtimeSecs,
    usn: note.usn, fields: note.fields.slice(), tags: tags };
}
export async function readCardMarking(backend: CardMarkingBackend, cardId: number): Promise<CardMarkingState> {
  const card: Card = await backend.card(cardId);
  const note: EditableNote = await backend.note(card.noteId);
  return { flag: card.flags & 7, marked: noteIsMarked(note.tags) };
}

// 所有标记及名称写入共用队列；页面仍负责集合占用与提交后通知。
let markingWriteTail: Promise<void> = Promise.resolve();
function writeMarking<T>(write: () => Promise<T>): Promise<T> {
  const result: Promise<T> = markingWriteTail.then(write, write);
  markingWriteTail = result.then((): void => {}, (): void => {});
  return result;
}
export function setMarkedNotes(backend: CardMarkingBackend, ids: number[], marked: boolean): Promise<void> {
  const unique: number[] = Array.from(new Set<number>(ids));
  return writeMarking(async (): Promise<void> => {
    const updates: EditableNote[] = [];
    for (const id of unique) {
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid note ID');
      const note: EditableNote = await backend.note(id);
      if (noteIsMarked(note.tags) !== marked) updates.push(markingNote(note, marked));
    }
    // 先完整读取再一次提交，读取失败不会留下半批星标。
    if (updates.length > 0) await backend.updateNotes(updates);
  });
}
export function setCardFlags(backend: CardMarkingBackend, ids: number[], flag: number): Promise<void> {
  validateCardFlag(flag);
  const unique: number[] = Array.from(new Set<number>(ids));
  if (unique.some((id: number): boolean => !Number.isSafeInteger(id) || id <= 0)) throw new Error('Invalid card ID');
  return writeMarking(async (): Promise<void> => { if (unique.length > 0) await backend.setFlag(unique, flag); });
}
export function parseFlagLabels(json: string): FlagLabels {
  if (json === '') return {};
  const parsed: FlagLabels = JSON.parse(json) as FlagLabels;
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid flag labels');
  return parsed;
}
export function customFlagLabel(labels: FlagLabels, flag: number): string {
  const label: string = labels[String(flag)];
  return flag > 0 && typeof label === 'string' ? label : '';
}
export function renameCardFlag(backend: CardMarkingBackend, flag: number, name: string): Promise<FlagLabels> {
  return saveCardFlagLabels(backend, [{ flag: flag, name: name }]);
}
export function saveCardFlagLabels(backend: CardMarkingBackend, changes: FlagLabelChange[]): Promise<FlagLabels> {
  const input: FlagLabelChange[] = changes.map((change: FlagLabelChange): FlagLabelChange => {
    validateCardFlag(change.flag);
    if (change.flag === 0) throw new Error('No flag cannot be renamed');
    return { flag: change.flag, name: change.name.trim() };
  });
  return writeMarking(async (): Promise<FlagLabels> => {
    // 只修改目标 key，恢复默认移除该 key；未知键和值保持原样。
    const current: FlagLabels = parseFlagLabels(await backend.labels());
    const entries: string[] = [];
    for (const key of Object.keys(current)) {
      if (!input.some((change: FlagLabelChange): boolean => String(change.flag) === key))
        entries.push(JSON.stringify(key) + ':' + JSON.stringify(current[key]));
    }
    for (const change of input) {
      if (change.name !== '') entries.push(JSON.stringify(String(change.flag)) + ':' + JSON.stringify(change.name));
    }
    // 经 JSON 构造，未知的 __proto__ 等键也保持为数据，不触发对象 setter。
    const json: string = '{' + entries.join(',') + '}';
    const next: FlagLabels = parseFlagLabels(json);
    await backend.saveLabels(json);
    return next;
  });
}
