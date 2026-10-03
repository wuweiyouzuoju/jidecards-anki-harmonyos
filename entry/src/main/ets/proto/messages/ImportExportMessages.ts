// SPDX-License-Identifier: AGPL-3.0-or-later

// ========================================================
// @块ID PROTO-MSG-IMPORT-001
// @名称 导入导出消息编解码
//
// @作用
// 编解码 anki.import_export.proto 消息（Anki 26.05）：
// - ImportAnkiPackageRequest / ExportAnkiPackageRequest：apkg 包导入导出
// - ImportCollectionPackageRequest / ExportCollectionPackageRequest：colpkg 全量包
// - ImportResponse：仅提取 Log 中的 new/updated/duplicate 计数与 found_notes
// 字段来源：third_party/anki/proto/anki/import_export.proto
//
// @输入
// 编码：包路径 / options / deckId
// 解码：字节流
//
// @输出
// 编码：Uint8Array 字节
// 解码：ImportSummary（newNotes / updatedNotes / duplicateNotes / foundNotes）
//
// @业务规则
// DEFAULT_*_OPTIONS 常量与 Anki 桌面端默认选项对齐。
// ImportResponse 只计数 Log 中本端需要的字段，其他子消息跳过。
// ExportAnkiPackageRequest 内嵌 limit 子消息（field 3）指定 deckId。
//
// @副作用
// 无
// ========================================================

import { 协议读取器 } from '../core/ProtoReader';
import { 协议写入器 } from '../core/ProtoWriter';

export enum ImportAnkiPackageUpdateCondition {
  IF_NEWER = 0,
  ALWAYS = 1,
  NEVER = 2
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

/** Matches the choices Anki presents when exporting a deck package. */
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

export function encodeImportAnkiPackageRequest(
  packagePath: string,
  options?: ImportAnkiPackageOptions
): Uint8Array {
  const w = new 协议写入器();
  if (packagePath !== '') w.写入字符串(1, packagePath);
  if (options !== undefined) w.写入子消息(2, encodeImportAnkiPackageOptions(options));
  return w.转为字节();
}

export function encodeExportAnkiPackageRequest(
  outPath: string,
  deckId: number,
  options: ExportAnkiPackageOptions = DEFAULT_EXPORT_ANKI_PACKAGE_OPTIONS
): Uint8Array {
  const w = new 协议写入器();
  if (outPath !== '') w.写入字符串(1, outPath);
  w.写入子消息(2, encodeExportAnkiPackageOptions(options));
  const limit = new 协议写入器();
  limit.写入64位整数(2, deckId);
  w.写入子消息(3, limit);
  return w.转为字节();
}

export function encodeImportCollectionPackageRequest(request: ImportCollectionPackageRequest): Uint8Array {
  const w = new 协议写入器();
  if (request.colPath !== '') w.写入字符串(1, request.colPath);
  if (request.backupPath !== '') w.写入字符串(2, request.backupPath);
  if (request.mediaFolder !== '') w.写入字符串(3, request.mediaFolder);
  if (request.mediaDb !== '') w.写入字符串(4, request.mediaDb);
  return w.转为字节();
}

export function encodeExportCollectionPackageRequest(
  outPath: string,
  options: ExportCollectionPackageOptions = DEFAULT_EXPORT_COLLECTION_PACKAGE_OPTIONS
): Uint8Array {
  const w = new 协议写入器();
  if (outPath !== '') w.写入字符串(1, outPath);
  if (options.includeMedia) w.写入布尔(2, options.includeMedia);
  if (options.legacy) w.写入布尔(3, options.legacy);
  return w.转为字节();
}

function encodeImportAnkiPackageOptions(options: ImportAnkiPackageOptions): 协议写入器 {
  const w = new 协议写入器();
  if (options.mergeNotetypes) w.写入布尔(1, options.mergeNotetypes);
  if (options.updateNotes !== ImportAnkiPackageUpdateCondition.IF_NEWER) w.写入变长整数(2, options.updateNotes);
  if (options.updateNotetypes !== ImportAnkiPackageUpdateCondition.IF_NEWER) w.写入变长整数(3, options.updateNotetypes);
  if (options.withScheduling) w.写入布尔(4, options.withScheduling);
  if (options.withDeckConfigs) w.写入布尔(5, options.withDeckConfigs);
  return w;
}

function encodeExportAnkiPackageOptions(options: ExportAnkiPackageOptions): 协议写入器 {
  const w = new 协议写入器();
  if (options.withScheduling) w.写入布尔(1, options.withScheduling);
  if (options.withDeckConfigs) w.写入布尔(2, options.withDeckConfigs);
  if (options.withMedia) w.写入布尔(3, options.withMedia);
  if (options.legacy) w.写入布尔(4, options.legacy);
  return w;
}

/** ImportResponse: only counts the Log section required by the presentation layer. */
export function decodeImportResponse(bytes: Uint8Array): ImportSummary {
  const summary: ImportSummary = { newNotes: 0, updatedNotes: 0, duplicateNotes: 0, foundNotes: 0,
    conflictingNotes: 0, firstFieldMatches: 0, missingNotetypeNotes: 0, missingDeckNotes: 0, emptyFirstFieldNotes: 0 };
  const r = new 协议读取器(bytes);
  let tag;
  while ((tag = r.读取标签()) !== null) {
    if (tag.字段号 === 2) {
      decodeImportLog(r.读取字节(), summary);
    } else {
      r.跳过字段(tag.线类型);
    }
  }
  return summary;
}

function decodeImportLog(bytes: Uint8Array, summary: ImportSummary): void {
  const r = new 协议读取器(bytes);
  let tag;
  while ((tag = r.读取标签()) !== null) {
    switch (tag.字段号) {
      case 1:
        summary.newNotes += 1;
        r.跳过字段(tag.线类型);
        break;
      case 2:
        summary.updatedNotes += 1;
        r.跳过字段(tag.线类型);
        break;
      case 3:
        summary.duplicateNotes += 1;
        r.跳过字段(tag.线类型);
        break;
      case 4: summary.conflictingNotes++; r.跳过字段(tag.线类型); break;
      case 5: summary.firstFieldMatches++; r.跳过字段(tag.线类型); break;
      case 6: summary.missingNotetypeNotes++; r.跳过字段(tag.线类型); break;
      case 7: summary.missingDeckNotes++; r.跳过字段(tag.线类型); break;
      case 8: summary.emptyFirstFieldNotes++; r.跳过字段(tag.线类型); break;
      case 10:
        summary.foundNotes = r.读取变长整数();
        break;
      default:
        r.跳过字段(tag.线类型);
    }
  }
}
