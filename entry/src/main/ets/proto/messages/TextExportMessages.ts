// SPDX-License-Identifier: AGPL-3.0-or-later
// 领域契约适配；协议事实由 generated/CoreMessages.ts 提供。
import { ImportExportExportCardCsvRequest, ImportExportExportLimit, ImportExportExportNoteCsvRequest } from '../generated/CoreMessages';
import { encodeExportSubset } from './ExportLimitMessages';
import type { ExportSubset } from './ExportLimitMessages';
export interface TextExportOptions {
    kind: 'notes' | 'cards';
    withHtml: boolean;
    withTags: boolean;
    withDeck: boolean;
    withNotetype: boolean;
    withGuid: boolean;
}
export function encodeTextExportRequest(path: string, deckId: number, options: TextExportOptions, subset?: ExportSubset): Uint8Array {
    if (subset === undefined && (!Number.isSafeInteger(deckId) || deckId <= 0))
        throw new Error('Invalid export deck');
    const limit = new ImportExportExportLimit();
    limit.setDeckId(deckId);
    const bytes = subset === undefined ? limit.toBytes() : encodeExportSubset(subset);
    if (options.kind === 'notes') {
        const w = new ImportExportExportNoteCsvRequest();
        w.setOutPath(path);
        w.setWithHtml(options.withHtml);
        w.setWithTags(options.withTags);
        w.setWithDeck(options.withDeck);
        w.setWithNotetype(options.withNotetype);
        w.setWithGuid(options.withGuid);
        w.setLimit(bytes);
        return w.toBytes();
    }
    const w = new ImportExportExportCardCsvRequest();
    w.setOutPath(path);
    w.setWithHtml(options.withHtml);
    w.setLimit(bytes);
    return w.toBytes();
}
