// SPDX-License-Identifier: AGPL-3.0-or-later
import type { CsvMetadata } from '../proto/messages/CsvImportMessages';
export interface CsvNotetype { id: number; name: string; fields: string[]; }
export interface CsvImportPreview { metadata: CsvMetadata; notetypes: CsvNotetype[]; }

export function copyCsvMetadata(m: CsvMetadata): CsvMetadata {
  return { delimiter: m.delimiter, isHtml: m.isHtml, globalTags: m.globalTags.slice(), updatedTags: m.updatedTags.slice(),
    columnLabels: m.columnLabels.slice(), deckId: m.deckId, deckColumn: m.deckColumn, deckName: m.deckName,
    notetypeId: m.notetypeId, notetypeColumn: m.notetypeColumn, fieldColumns: m.fieldColumns.slice(),
    tagsColumn: m.tagsColumn, forceDelimiter: m.forceDelimiter, forceIsHtml: m.forceIsHtml,
    preview: m.preview.map((row: string[]): string[] => row.slice()), guidColumn: m.guidColumn,
    dupeResolution: m.dupeResolution, matchScope: m.matchScope };
}

export function validateCsvMapping(m: CsvMetadata): boolean {
  if (m.columnLabels.length === 0) return false;
  if (m.notetypeColumn === 0 && (m.notetypeId <= 0 || !m.fieldColumns.some((c: number): boolean => c > 0))) return false;
  if (m.deckColumn === 0 && m.deckId <= 0 && m.deckName.trim() === '') return false;
  const columns: number[] = m.fieldColumns.concat([m.tagsColumn, m.guidColumn, m.deckColumn, m.notetypeColumn]);
  return columns.every((c: number): boolean => Number.isInteger(c) && c >= 0 && c <= m.columnLabels.length);
}
