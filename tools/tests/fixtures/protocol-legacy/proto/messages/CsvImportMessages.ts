// SPDX-License-Identifier: AGPL-3.0-or-later
// Field numbers and oneofs follow locked anki/import_export.proto. Parsing stays in Core.
import { 协议读取器 } from '../core/ProtoReader';
import { 协议写入器 } from '../core/ProtoWriter';

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

export function encodeCsvMetadataRequest(path: string, delimiter: number = -1,
  notetypeId: number = 0): Uint8Array {
  const w = new 协议写入器();
  w.写入字符串(1, path);
  if (delimiter >= 0) w.写入变长整数(2, delimiter);
  if (notetypeId > 0) w.写入64位整数(3, notetypeId);
  return w.转为字节();
}

export function decodeCsvMetadata(bytes: Uint8Array): CsvMetadata {
  const m = emptyCsvMetadata();
  const r = new 协议读取器(bytes);
  let t;
  while ((t = r.读取标签()) !== null) {
    switch (t.字段号) {
      case 1: m.delimiter = r.读取变长整数(); break;
      case 2: m.isHtml = r.读取布尔(); break;
      case 3: m.globalTags.push(r.读取字符串()); break;
      case 4: m.updatedTags.push(r.读取字符串()); break;
      case 5: m.columnLabels.push(r.读取字符串()); break;
      case 6: m.deckId = r.读取64位整数(); m.deckColumn = 0; m.deckName = ''; break;
      case 7: m.deckColumn = r.读取变长整数(); m.deckId = 0; m.deckName = ''; break;
      case 17: m.deckName = r.读取字符串(); m.deckId = 0; m.deckColumn = 0; break;
      case 8: {
        m.notetypeColumn = 0;
        const n = new 协议读取器(r.读取字节());
        let f;
        while ((f = n.读取标签()) !== null) {
          if (f.字段号 === 1) m.notetypeId = n.读取64位整数();
          else if (f.字段号 === 2) {
            if (f.线类型 === 2) m.fieldColumns = m.fieldColumns.concat(n.读取打包64位整数());
            else m.fieldColumns.push(n.读取变长整数());
          } else n.跳过字段(f.线类型);
        }
        break;
      }
      case 9: m.notetypeColumn = r.读取变长整数(); m.notetypeId = 0; m.fieldColumns = []; break;
      case 10: m.tagsColumn = r.读取变长整数(); break;
      case 11: m.forceDelimiter = r.读取布尔(); break;
      case 12: m.forceIsHtml = r.读取布尔(); break;
      case 13: {
        const row: string[] = [];
        const p = new 协议读取器(r.读取字节());
        let f;
        while ((f = p.读取标签()) !== null) {
          if (f.字段号 === 1) row.push(p.读取字符串()); else p.跳过字段(f.线类型);
        }
        m.preview.push(row); break;
      }
      case 14: m.guidColumn = r.读取变长整数(); break;
      case 15: m.dupeResolution = r.读取变长整数(); break;
      case 16: m.matchScope = r.读取变长整数(); break;
      default: r.跳过字段(t.线类型);
    }
  }
  return m;
}

export function encodeCsvImport(path: string, m: CsvMetadata): Uint8Array {
  const w = new 协议写入器();
  w.写入字符串(1, path);
  const v = new 协议写入器();
  v.写入变长整数(1, m.delimiter); v.写入布尔(2, m.isHtml);
  for (const s of m.globalTags) v.写入字符串(3, s);
  for (const s of m.updatedTags) v.写入字符串(4, s);
  for (const s of m.columnLabels) v.写入字符串(5, s);
  if (m.deckColumn > 0) v.写入变长整数(7, m.deckColumn);
  else if (m.deckName !== '') v.写入字符串(17, m.deckName);
  else v.写入64位整数(6, m.deckId);
  if (m.notetypeColumn > 0) v.写入变长整数(9, m.notetypeColumn);
  else {
    const n = new 协议写入器(); n.写入64位整数(1, m.notetypeId);
    for (const c of m.fieldColumns) n.写入变长整数(2, c);
    v.写入子消息(8, n);
  }
  v.写入变长整数(10, m.tagsColumn);
  v.写入布尔(11, m.forceDelimiter); v.写入布尔(12, m.forceIsHtml);
  v.写入变长整数(14, m.guidColumn); v.写入变长整数(15, m.dupeResolution);
  v.写入变长整数(16, m.matchScope);
  w.写入子消息(2, v);
  return w.转为字节();
}
