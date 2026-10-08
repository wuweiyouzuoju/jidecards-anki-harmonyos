// SPDX-License-Identifier: AGPL-3.0-or-later
// 领域契约适配；协议事实由 generated/CoreMessages.ts 提供。
import { NotesNoteFieldsCheckResponseState } from '../generated/CoreMessages';
import { CardsCardIds, NotesAddNoteRequest, NotesAddNoteResponse, NotesDeckAndNotetype, NotesDefaultsForAddingRequest, NotesNote, NotesNoteFieldsCheckResponse, NotesNoteId, NotesNoteIds, NotesUpdateNotesRequest, NotetypesNotetypeId } from '../generated/CoreMessages';
export interface EditableNote {
    id: number;
    guid: string;
    notetypeId: number;
    mtimeSecs: number;
    usn: number;
    tags: string[];
    fields: string[];
}
export interface DeckAndNotetype {
    deckId: number;
    notetypeId: number;
}
export enum NoteFieldsCheckState {
    NORMAL = NotesNoteFieldsCheckResponseState.NORMAL,
    EMPTY = NotesNoteFieldsCheckResponseState.EMPTY,
    DUPLICATE = NotesNoteFieldsCheckResponseState.DUPLICATE,
    MISSING_CLOZE = NotesNoteFieldsCheckResponseState.MISSING_CLOZE,
    NOTETYPE_NOT_CLOZE = NotesNoteFieldsCheckResponseState.NOTETYPE_NOT_CLOZE,
    FIELD_NOT_CLOZE = NotesNoteFieldsCheckResponseState.FIELD_NOT_CLOZE
}
export interface NoteFieldsCheckResponse {
    state: NoteFieldsCheckState;
}
export function encodeNote(note: EditableNote): Uint8Array {
    const writer = new NotesNote();
    if (note.id !== 0) {
        writer.setId(note.id);
    }
    if (note.guid !== '') {
        writer.setGuid(note.guid);
    }
    if (note.notetypeId !== 0) {
        writer.setNotetypeId(note.notetypeId);
    }
    if (note.mtimeSecs !== 0) {
        writer.setMtimeSecs(note.mtimeSecs);
    }
    if (note.usn !== 0) {
        writer.setUsn(note.usn);
    }
    for (const tag of note.tags) {
        if (tag !== '') {
            writer.setTags([tag]);
        }
    }
    for (const field of note.fields) {
        writer.setFields([field]);
    }
    return writer.转为字节();
}
export function decodeNote(bytes: Uint8Array): EditableNote {
    const reader = new NotesNote(bytes);
    const note: EditableNote = {
        id: 0,
        guid: '',
        notetypeId: 0,
        mtimeSecs: 0,
        usn: 0,
        tags: [],
        fields: []
    };
    if (reader.hasId()) {
        note.id = reader.getId();
    }
    if (reader.hasGuid()) {
        note.guid = reader.getGuid();
    }
    if (reader.hasNotetypeId()) {
        note.notetypeId = reader.getNotetypeId();
    }
    if (reader.hasMtimeSecs()) {
        note.mtimeSecs = reader.getMtimeSecs();
    }
    if (reader.hasUsn()) {
        note.usn = reader.getUsn();
    }
    if (reader.hasTags()) {
        note.tags.push(...reader.getTags());
    }
    if (reader.hasFields()) {
        note.fields.push(...reader.getFields());
    }
    return note;
}
export function encodeNoteId(noteId: number): Uint8Array {
    const writer = new NotesNoteId();
    if (noteId !== 0) {
        writer.setNid(noteId);
    }
    return writer.转为字节();
}
export function encodeNoteIds(noteIds: number[]): Uint8Array {
    const writer = new NotesNoteIds();
    writer.setNoteIds(noteIds);
    return writer.转为字节();
}
export function decodeCardIds(bytes: Uint8Array): number[] {
    return new CardsCardIds(bytes).getCids();
}
export function decodeNotetypeId(bytes: Uint8Array): number {
    return new NotetypesNotetypeId(bytes).getNtid();
}
export function encodeAddNoteRequest(note: EditableNote, deckId: number): Uint8Array {
    const writer = new NotesAddNoteRequest();
    writer.setNote(encodeNote(note));
    if (deckId !== 0) {
        writer.setDeckId(deckId);
    }
    return writer.转为字节();
}
export function decodeAddNoteResponse(bytes: Uint8Array): number {
    return new NotesAddNoteResponse(bytes).getNoteId();
}
export function encodeDefaultsForAddingRequest(homeDeckOfCurrentReviewCard: number = 0): Uint8Array {
    const writer = new NotesDefaultsForAddingRequest();
    if (homeDeckOfCurrentReviewCard !== 0) {
        writer.setHomeDeckOfCurrentReviewCard(homeDeckOfCurrentReviewCard);
    }
    return writer.转为字节();
}
export function decodeDeckAndNotetype(bytes: Uint8Array): DeckAndNotetype {
    const m = new NotesDeckAndNotetype(bytes);
    const out: DeckAndNotetype = { deckId: m.getDeckId(), notetypeId: m.getNotetypeId() };
    return out;
}
export function decodeNoteFieldsCheckResponse(bytes: Uint8Array): NoteFieldsCheckResponse {
    const result: NoteFieldsCheckResponse = { state: new NotesNoteFieldsCheckResponse(bytes).getState() as NoteFieldsCheckState };
    return result;
}
export function encodeUpdateNotesRequest(notes: EditableNote[], skipUndoEntry: boolean = false): Uint8Array {
    const writer = new NotesUpdateNotesRequest();
    for (const note of notes) {
        writer.setNotes([encodeNote(note)]);
    }
    if (skipUndoEntry) {
        writer.setSkipUndoEntry(true);
    }
    return writer.转为字节();
}
export { decodeOpChanges as decodeUpdateNotesResponse } from './CollectionMessages';
