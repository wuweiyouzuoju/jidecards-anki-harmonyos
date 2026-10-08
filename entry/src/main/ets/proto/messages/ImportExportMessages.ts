// SPDX-License-Identifier: AGPL-3.0-or-later
// 领域契约适配；协议事实由 generated/CoreMessages.ts 提供。
import { ImportExportImportAnkiPackageUpdateCondition } from '../generated/CoreMessages';
import { 协议写入器 } from '../core/ProtoWriter';
import { ImportExportExportAnkiPackageOptions, ImportExportExportAnkiPackageRequest, ImportExportExportCollectionPackageRequest, ImportExportExportLimit, ImportExportImportAnkiPackageOptions, ImportExportImportAnkiPackageRequest, ImportExportImportCollectionPackageRequest, ImportExportImportResponse, ImportExportImportResponseLog, ImportExportImportResponseNote, NotesNoteId } from '../generated/CoreMessages';
import { encodeExportSubset } from './ExportLimitMessages';
import type { ExportSubset } from './ExportLimitMessages';
export enum ImportAnkiPackageUpdateCondition {
    IF_NEWER = ImportExportImportAnkiPackageUpdateCondition.IMPORT_ANKI_PACKAGE_UPDATE_CONDITION_IF_NEWER,
    ALWAYS = ImportExportImportAnkiPackageUpdateCondition.IMPORT_ANKI_PACKAGE_UPDATE_CONDITION_ALWAYS,
    NEVER = ImportExportImportAnkiPackageUpdateCondition.IMPORT_ANKI_PACKAGE_UPDATE_CONDITION_NEVER
}
export interface ImportAnkiPackageOptions {
    mergeNotetypes: boolean;
    updateNotes: ImportAnkiPackageUpdateCondition;
    updateNotetypes: ImportAnkiPackageUpdateCondition;
    withScheduling: boolean;
    withDeckConfigs: boolean;
}
export interface ExportAnkiPackageOptions {
    withScheduling: boolean;
    withDeckConfigs: boolean;
    withMedia: boolean;
    legacy: boolean;
}
export interface ExportCollectionPackageOptions {
    includeMedia: boolean;
    legacy: boolean;
}
export interface ImportCollectionPackageRequest {
    colPath: string;
    backupPath: string;
    mediaFolder: string;
    mediaDb: string;
}
export interface ImportSummary {
    newNoteIds?: number[];
    updatedNoteIds?: number[];
    duplicateNoteIds?: number[];
    newNotes: number;
    updatedNotes: number;
    duplicateNotes: number;
    foundNotes: number;
    conflictingNotes: number;
    firstFieldMatches: number;
    missingNotetypeNotes: number;
    missingDeckNotes: number;
    emptyFirstFieldNotes: number;
}
export const DEFAULT_IMPORT_ANKI_PACKAGE_OPTIONS: ImportAnkiPackageOptions = {
    mergeNotetypes: false,
    updateNotes: ImportAnkiPackageUpdateCondition.IF_NEWER,
    updateNotetypes: ImportAnkiPackageUpdateCondition.IF_NEWER,
    withScheduling: false,
    withDeckConfigs: false
};
export const DEFAULT_EXPORT_ANKI_PACKAGE_OPTIONS: ExportAnkiPackageOptions = {
    withScheduling: true,
    withDeckConfigs: true,
    withMedia: true,
    legacy: false
};
export const DEFAULT_EXPORT_COLLECTION_PACKAGE_OPTIONS: ExportCollectionPackageOptions = {
    includeMedia: true,
    legacy: false
};
export function encodeImportAnkiPackageRequest(packagePath: string, options?: ImportAnkiPackageOptions): Uint8Array {
    const w = new ImportExportImportAnkiPackageRequest();
    if (packagePath !== '')
        w.setPackagePath(packagePath);
    if (options !== undefined)
        w.setOptionsWriter(encodeImportAnkiPackageOptions(options));
    return w.转为字节();
}
export function encodeExportAnkiPackageRequest(outPath: string, deckId: number, options: ExportAnkiPackageOptions = DEFAULT_EXPORT_ANKI_PACKAGE_OPTIONS, subset?: ExportSubset): Uint8Array {
    const w = new ImportExportExportAnkiPackageRequest();
    if (outPath !== '')
        w.setOutPath(outPath);
    w.setOptions(encodeExportAnkiPackageOptions(options).转为字节());
    if (subset !== undefined)
        w.setLimit(encodeExportSubset(subset));
    else {
        const limit = new ImportExportExportLimit();
        limit.setDeckId(deckId);
        w.setLimit(limit.toBytes());
    }
    return w.toBytes();
}
export function encodeImportCollectionPackageRequest(request: ImportCollectionPackageRequest): Uint8Array {
    const w = new ImportExportImportCollectionPackageRequest();
    if (request.colPath !== '')
        w.setColPath(request.colPath);
    if (request.backupPath !== '')
        w.setBackupPath(request.backupPath);
    if (request.mediaFolder !== '')
        w.setMediaFolder(request.mediaFolder);
    if (request.mediaDb !== '')
        w.setMediaDb(request.mediaDb);
    return w.转为字节();
}
export function encodeExportCollectionPackageRequest(outPath: string, options: ExportCollectionPackageOptions = DEFAULT_EXPORT_COLLECTION_PACKAGE_OPTIONS): Uint8Array {
    const w = new ImportExportExportCollectionPackageRequest();
    if (outPath !== '')
        w.setOutPath(outPath);
    if (options.includeMedia)
        w.setIncludeMedia(options.includeMedia);
    if (options.legacy)
        w.setLegacy(options.legacy);
    return w.转为字节();
}
export function decodeImportAnkiPackageOptions(bytes: Uint8Array): ImportAnkiPackageOptions {
    const reader = new ImportExportImportAnkiPackageOptions(bytes);
    const options: ImportAnkiPackageOptions = copyImportAnkiPackageOptions(DEFAULT_IMPORT_ANKI_PACKAGE_OPTIONS);
    if (reader.hasMergeNotetypes()) {
        options.mergeNotetypes = reader.getMergeNotetypes();
    }
    if (reader.hasUpdateNotes()) {
        options.updateNotes = reader.getUpdateNotes();
    }
    if (reader.hasUpdateNotetypes()) {
        options.updateNotetypes = reader.getUpdateNotetypes();
    }
    if (reader.hasWithScheduling()) {
        options.withScheduling = reader.getWithScheduling();
    }
    if (reader.hasWithDeckConfigs()) {
        options.withDeckConfigs = reader.getWithDeckConfigs();
    }
    if (options.updateNotes < 0 || options.updateNotes > 2 || options.updateNotetypes < 0 || options.updateNotetypes > 2) {
        throw new Error('Invalid package import update condition');
    }
    return options;
}
export function copyImportAnkiPackageOptions(options: ImportAnkiPackageOptions): ImportAnkiPackageOptions {
    return { mergeNotetypes: options.mergeNotetypes, updateNotes: options.updateNotes,
        updateNotetypes: options.updateNotetypes, withScheduling: options.withScheduling, withDeckConfigs: options.withDeckConfigs };
}
function encodeImportAnkiPackageOptions(options: ImportAnkiPackageOptions): 协议写入器 {
    const w = new ImportExportImportAnkiPackageOptions();
    if (options.mergeNotetypes)
        w.setMergeNotetypes(options.mergeNotetypes);
    if (options.updateNotes !== ImportAnkiPackageUpdateCondition.IF_NEWER)
        w.setUpdateNotes(options.updateNotes);
    if (options.updateNotetypes !== ImportAnkiPackageUpdateCondition.IF_NEWER)
        w.setUpdateNotetypes(options.updateNotetypes);
    if (options.withScheduling)
        w.setWithScheduling(options.withScheduling);
    if (options.withDeckConfigs)
        w.setWithDeckConfigs(options.withDeckConfigs);
    const writer = new 协议写入器();
    writer.写入原始字节(w.toBytes());
    return writer;
}
function encodeExportAnkiPackageOptions(options: ExportAnkiPackageOptions): 协议写入器 {
    const w = new ImportExportExportAnkiPackageOptions();
    if (options.withScheduling)
        w.setWithScheduling(options.withScheduling);
    if (options.withDeckConfigs)
        w.setWithDeckConfigs(options.withDeckConfigs);
    if (options.withMedia)
        w.setWithMedia(options.withMedia);
    if (options.legacy)
        w.setLegacy(options.legacy);
    const writer = new 协议写入器();
    writer.写入原始字节(w.toBytes());
    return writer;
}
export function decodeImportResponse(bytes: Uint8Array): ImportSummary {
    const summary: ImportSummary = { newNotes: 0, updatedNotes: 0, duplicateNotes: 0, foundNotes: 0, conflictingNotes: 0, firstFieldMatches: 0, missingNotetypeNotes: 0, missingDeckNotes: 0, emptyFirstFieldNotes: 0 };
    const m = new ImportExportImportResponse(bytes);
    for (const raw of m.rawLog()) {
        const part = new ImportExportImportResponse(raw);
        decodeImportLog(part.getLogLast()!, summary);
    }
    return summary;
}
function decodeImportLog(bytes: Uint8Array, summary: ImportSummary): void {
    const m = new ImportExportImportResponseLog(bytes);
    for (const raw of m.getNew()) {
        summary.newNotes++;
        appendImportNoteId(raw, summary, 1);
    }
    for (const raw of m.getUpdated()) {
        summary.updatedNotes++;
        appendImportNoteId(raw, summary, 2);
    }
    for (const raw of m.getDuplicate()) {
        summary.duplicateNotes++;
        appendImportNoteId(raw, summary, 3);
    }
    summary.conflictingNotes += m.countConflicting();
    summary.firstFieldMatches += m.countFirstFieldMatch();
    summary.missingNotetypeNotes += m.countMissingNotetype();
    summary.missingDeckNotes += m.countMissingDeck();
    summary.emptyFirstFieldNotes += m.countEmptyFirstField();
    if (m.hasFoundNotes())
        summary.foundNotes = m.getFoundNotes();
}
function appendImportNoteId(bytes: Uint8Array, summary: ImportSummary, category: number): void {
    const m = new ImportExportImportResponseNote(bytes);
    if (m.hasIdWire()) {
        const id = new NotesNoteId(m.getIdLast()!).getNid();
        if (Number.isSafeInteger(id) && id > 0) {
            if (category === 1)
                (summary.newNoteIds ??= []).push(id);
            else if (category === 2)
                (summary.updatedNoteIds ??= []).push(id);
            else
                (summary.duplicateNoteIds ??= []).push(id);
        }
    }
}
