// SPDX-License-Identifier: AGPL-3.0-or-later
import { 协议写入器 } from '../core/ProtoWriter';
import { encodeExportSubset } from './ExportLimitMessages';
import type { ExportSubset } from './ExportLimitMessages';

/** Core 输出 UTF-8、制表符分隔文本；不包含媒体文件和复习记录。 */
export interface TextExportOptions {
  kind: 'notes' | 'cards';
  withHtml: boolean;
  withTags: boolean;
  withDeck: boolean;
  withNotetype: boolean;
  withGuid: boolean;
}

/** ExportNoteCsvRequest / ExportCardCsvRequest，字段编号以锁定 proto 为准。 */
export function encodeTextExportRequest(path: string, deckId: number, options: TextExportOptions, subset?: ExportSubset): Uint8Array {
  if (subset === undefined && (!Number.isSafeInteger(deckId) || deckId <= 0)) throw new Error('Invalid export deck');
  const writer = new 协议写入器();
  writer.写入字符串(1, path);
  writer.写入布尔(2, options.withHtml);
  const limit = new 协议写入器();
  limit.写入64位整数(2, deckId);
  if (options.kind === 'notes') {
    writer.写入布尔(3, options.withTags);
    writer.写入布尔(4, options.withDeck);
    writer.写入布尔(5, options.withNotetype);
    writer.写入布尔(6, options.withGuid);
    if (subset === undefined) writer.写入子消息(7, limit);
    else writer.写入字节(7, encodeExportSubset(subset));
  } else {
    if (subset === undefined) writer.写入子消息(3, limit);
    else writer.写入字节(3, encodeExportSubset(subset));
  }
  return writer.转为字节();
}
