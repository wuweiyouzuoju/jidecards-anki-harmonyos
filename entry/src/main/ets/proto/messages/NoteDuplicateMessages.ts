// SPDX-License-Identifier: AGPL-3.0-or-later
import { JideNoteDuplicateRequest, JideNoteDuplicateResponse, JideDuplicateField } from '../generated/CoreMessages';
import { NoteDuplicatesRpc } from '../generated/PrivateRpc';
export const NOTE_DUPLICATE_SERVICE: number = NoteDuplicatesRpc.SERVICE;
export const NOTE_DUPLICATE_BATCH_SIZE: number = 200;
export interface DuplicateField {
    noteId: number;
    value: string;
}
export function encodeDuplicateFields(ids: number[], notetypeId: number, fieldOrd: number): Uint8Array {
    if (ids.length === 0 || ids.length > NOTE_DUPLICATE_BATCH_SIZE || new Set<number>(ids).size !== ids.length ||
        !Number.isSafeInteger(notetypeId) || notetypeId <= 0 || !Number.isInteger(fieldOrd) || fieldOrd < 0 ||
        fieldOrd > 0xffffffff || ids.some((id: number): boolean => !Number.isSafeInteger(id) || id <= 0)) {
        throw new Error('Invalid duplicate field batch');
    }
    const writer = new JideNoteDuplicateRequest();
    writer.setNoteIds(ids, false);
    writer.setNotetypeId(notetypeId);
    writer.setFieldOrd(fieldOrd);
    return writer.转为字节();
}
export function decodeDuplicateFields(bytes: Uint8Array): DuplicateField[] {
    return new JideNoteDuplicateResponse(bytes).getFields().map((bytes: Uint8Array): DuplicateField => {
        const m = new JideDuplicateField(bytes);
        return { noteId: m.getNoteId(), value: m.getValue() };
    });
}
