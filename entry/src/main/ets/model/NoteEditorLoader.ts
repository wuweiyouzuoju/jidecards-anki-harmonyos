// SPDX-License-Identifier: AGPL-3.0-or-later
import type { EditableNote } from '../proto/messages/NoteMessages';
export interface NoteEditorCard { noteId: number; }
export interface NoteEditorNotetype { originalStockKind?: number; fieldNames: string[]; clozeFieldOrds?: number[]; optionalReverseFieldOrd?: number; imageOcclusionFields?: number[]; }
export interface NoteEditorBackend {
  card(id: number): Promise<NoteEditorCard>;
  note(id: number): Promise<EditableNote>;
  notetype(id: number): Promise<NoteEditorNotetype>;
}
export interface NoteEditorSnapshot { originalStockKind: number; note: EditableNote; fieldNames: string[]; clozeFieldOrds: number[]; optionalReverseFieldOrd: number; imageOcclusionFields?: number[]; }
export async function loadNoteEditor(id: number, isNote: boolean, backend: NoteEditorBackend,
  current: () => boolean): Promise<NoteEditorSnapshot | null> {
  if (!current()) return null;
  const noteId: number = isNote ? id : (await backend.card(id)).noteId;
  if (!current()) return null;
  const note: EditableNote = await backend.note(noteId);
  if (!current()) return null;
  const notetype: NoteEditorNotetype = await backend.notetype(note.notetypeId);
  if (!current()) return null;
  return { originalStockKind: notetype.originalStockKind ?? 0, note: note, fieldNames: notetype.fieldNames.slice(), clozeFieldOrds: (notetype.clozeFieldOrds ?? []).slice(), optionalReverseFieldOrd: notetype.optionalReverseFieldOrd ?? -1,
    imageOcclusionFields: (notetype.imageOcclusionFields ?? []).slice() };
}
