// SPDX-License-Identifier: AGPL-3.0-or-later
// 领域契约适配；协议事实由 generated/CoreMessages.ts 提供。
import { GenericStringList, ImportExportCsvMetadata, ImportExportCsvMetadataMappedNotetype, ImportExportCsvMetadataRequest, ImportExportImportCsvRequest } from '../generated/CoreMessages';
export interface CsvMetadata {
    delimiter: number;
    isHtml: boolean;
    globalTags: string[];
    updatedTags: string[];
    columnLabels: string[];
    deckId: number;
    deckColumn: number;
    deckName: string;
    notetypeId: number;
    notetypeColumn: number;
    fieldColumns: number[];
    tagsColumn: number;
    forceDelimiter: boolean;
    forceIsHtml: boolean;
    preview: string[][];
    guidColumn: number;
    dupeResolution: number;
    matchScope: number;
}
export function emptyCsvMetadata(): CsvMetadata {
    return { delimiter: 0, isHtml: false, globalTags: [], updatedTags: [], columnLabels: [],
        deckId: 0, deckColumn: 0, deckName: '', notetypeId: 0, notetypeColumn: 0, fieldColumns: [],
        tagsColumn: 0, forceDelimiter: false, forceIsHtml: false, preview: [], guidColumn: 0,
        dupeResolution: 0, matchScope: 0 };
}
export function encodeCsvMetadataRequest(path: string, delimiter: number = -1, notetypeId: number = 0): Uint8Array {
    const w = new ImportExportCsvMetadataRequest();
    w.setPath(path);
    if (delimiter >= 0)
        w.setDelimiter(delimiter);
    if (notetypeId > 0)
        w.setNotetypeId(notetypeId);
    return w.转为字节();
}
export function decodeCsvMetadata(bytes: Uint8Array): CsvMetadata {
    const v = new ImportExportCsvMetadata(bytes);
    const m = emptyCsvMetadata();
    m.delimiter = v.getDelimiter();
    m.isHtml = v.getIsHtml();
    m.globalTags = v.getGlobalTags();
    m.updatedTags = v.getUpdatedTags();
    m.columnLabels = v.getColumnLabels();
    if (v.hasDeckId())
        m.deckId = v.getDeckId();
    if (v.hasDeckColumn())
        m.deckColumn = v.getDeckColumn();
    if (v.hasDeckName())
        m.deckName = v.getDeckName();
    if (v.hasGlobalNotetype()) {
        // 连续同分支映射累加 fieldColumns；切换 oneof 分支由生成访问器清除旧映射。
        const n = new ImportExportCsvMetadataMappedNotetype(v.getGlobalNotetype()!);
        m.notetypeId = n.getId();
        m.fieldColumns = n.getFieldColumns();
    }
    if (v.hasNotetypeColumn())
        m.notetypeColumn = v.getNotetypeColumn();
    m.tagsColumn = v.getTagsColumn();
    m.forceDelimiter = v.getForceDelimiter();
    m.forceIsHtml = v.getForceIsHtml();
    m.preview = v.getPreview().map((raw: Uint8Array): string[] => new GenericStringList(raw).getVals());
    m.guidColumn = v.getGuidColumn();
    m.dupeResolution = v.getDupeResolution();
    m.matchScope = v.getMatchScope();
    return m;
}
export function encodeCsvImport(path: string, m: CsvMetadata): Uint8Array {
    const w = new ImportExportImportCsvRequest();
    w.setPath(path);
    const v = new ImportExportCsvMetadata();
    v.setDelimiter(m.delimiter);
    v.setIsHtml(m.isHtml);
    v.setGlobalTags(m.globalTags);
    v.setUpdatedTags(m.updatedTags);
    v.setColumnLabels(m.columnLabels);
    if (m.deckColumn > 0)
        v.setDeckColumn(m.deckColumn);
    else if (m.deckName !== '')
        v.setDeckName(m.deckName);
    else
        v.setDeckId(m.deckId);
    if (m.notetypeColumn > 0)
        v.setNotetypeColumn(m.notetypeColumn);
    else {
        const n = new ImportExportCsvMetadataMappedNotetype();
        n.setId(m.notetypeId);
        n.setFieldColumns(m.fieldColumns, false);
        v.setGlobalNotetype(n.toBytes());
    }
    v.setTagsColumn(m.tagsColumn);
    v.setForceDelimiter(m.forceDelimiter);
    v.setForceIsHtml(m.forceIsHtml);
    v.setGuidColumn(m.guidColumn);
    v.setDupeResolution(m.dupeResolution);
    v.setMatchScope(m.matchScope);
    w.setMetadata(v.toBytes());
    return w.toBytes();
}
