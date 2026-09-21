// SPDX-License-Identifier: AGPL-3.0-or-later
import type { EditableNote } from '../proto/messages/NoteMessages';
export interface NoteEditorCard { noteId: number; }
export interface NoteEditorNotetype { fieldNames: string[]; }
export interface NoteEditorBackend {
  card(id: number): Promise<NoteEditorCard>;
  note(id: number): Promise<EditableNote>;
  notetype(id: number): Promise<NoteEditorNotetype>;
}
export interface NoteEditorSnapshot { note: EditableNote; fieldNames: string[]; }
export async function loadNoteEditor(id: number, isNote: boolean, backend: NoteEditorBackend,
  current: () => boolean): Promise<NoteEditorSnapshot | null> {
  if (!current()) return null;
  const noteId: number = isNote ? id : (await backend.card(id)).noteId;
  if (!current()) return null;
  const note: EditableNote = await backend.note(noteId);
  if (!current()) return null;
  const notetype: NoteEditorNotetype = await backend.notetype(note.notetypeId);
  if (!current()) return null;
  return { note: note, fieldNames: notetype.fieldNames.slice() };
}
