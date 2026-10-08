// SPDX-License-Identifier: AGPL-3.0-or-later
// 领域契约适配；协议事实由 generated/CoreMessages.ts 提供。
import { CardsCardIds, ImportExportExportLimit, NotesNoteIds } from '../generated/CoreMessages';
export interface ExportSubset {
    mode: string;
    ids: number[];
}
export function encodeExportSubset(value: ExportSubset): Uint8Array {
    if (!['notes', 'cards'].includes(value.mode) || !Array.isArray(value.ids) || value.ids.length === 0 ||
        value.ids.some((id: number): boolean => !Number.isSafeInteger(id) || id <= 0) ||
        new Set<number>(value.ids).size !== value.ids.length)
        throw new Error('invalid_export_subset');
    const w = new ImportExportExportLimit();
    if (value.mode === 'notes') {
        const ids = new NotesNoteIds();
        ids.setNoteIds(value.ids);
        w.setNoteIds(ids.toBytes());
    }
    else {
        const ids = new CardsCardIds();
        ids.setCids(value.ids);
        w.setCardIds(ids.toBytes());
    }
    return w.toBytes();
}
